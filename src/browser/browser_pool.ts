import type { Browser, BrowserContext } from "patchright";
import type {
  AccountContext,
  ContextFactory,
  PoolOptions,
} from "@/browser/types";
import { logger } from "@/utils/logger";
import { launchEdge } from "@/browser/launcher";
import {  existsSync } from "node:fs";
import { getStorageState } from "@/utils/kit";



const DEFAULT_OPTIONS: PoolOptions = {
  idleTimeoutMs: 60_000,
  contextTtlMs: 30 * 60_000,
};

export class BrowserPool {
  private browser: Browser | null = null;
  private readonly options: PoolOptions;
  private readonly factory: ContextFactory;
  private readonly accounts = new Map<string, AccountContext>();
  private readonly timer: NodeJS.Timeout;

  constructor(factory?: ContextFactory, options: Partial<PoolOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // 默认：每个账户独立 context
    this.factory =
      factory ??
      ((b) =>
        b.newContext({
          viewport: { width: 1400, height: 900 },
          deviceScaleFactor: 1,
          locale: "zh-CN",
          timezoneId: "Asia/Shanghai",
          ignoreHTTPSErrors: true,
        }));

    this.timer = setInterval(() => void this.gc(), 10_000);
    this.timer.unref();
  }

  // ---------------- 内部：单例 browser ----------------

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;

    this.browser = await launchEdge(true);

    this.browser.on("disconnected", () => {
      this.browser = null;
      this.accounts.clear();
    });

    return this.browser;
  }

  // ---------------- 对外：借 ----------------

  async acquire(accountId: string): Promise<AccountContext> {
    const now = Date.now();

    // 1. 已有且空闲 → 复用
    const existing = this.accounts.get(accountId);
    if (existing) {
      existing.lastUsedAt = now;
      return existing;
    }

    // 4. 新建
    return this.create(accountId);
  }

  private async create(accountId: string): Promise<AccountContext> {
    const browser = await this.getBrowser();
    const context = await this.factory(browser, accountId);

    const slot: AccountContext = {
      accountId,
      context,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    this.accounts.set(accountId, slot);
    logger.info(
      `[pool] context created for account=${accountId}, total=${this.accounts.size}`,
    );
    return slot;
  }

  // ---------------- 对外：还 ----------------

  async use<T>(
    accountId: string,
    fn: (ctx: AccountContext) => Promise<T>,
  ): Promise<T> {
    const slot = await this.acquire(accountId);
    try {
      return await fn(slot);
    } finally {
      this.release(accountId);
    }
  }

  release(accountId: string): void {
    const slot = this.accounts.get(accountId);
    if (!slot) return;

    slot.lastUsedAt = Date.now();
    logger.info(`[pool] context released for account=${accountId}`);
  }

  /** 强制销毁某个账户的 context（如被踢下线/登录失效） */
  async invalidate(accountId: string): Promise<void> {
    const slot = this.accounts.get(accountId);
    if (!slot) return;

    try {
      await slot.context.close();
    } catch (e) {
      logger.info(
        `[pool] close error account=${accountId}: ${(e as Error).message}`,
      );
    }

    this.accounts.delete(accountId);
    logger.info(`[pool] context invalidated for account=${accountId}`);
  }

  // ---------------- 内部：GC ----------------

  private async gc(): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, slot] of this.accounts) {
      if (
        now - slot.lastUsedAt > this.options.idleTimeoutMs ||
        now - slot.createdAt > this.options.contextTtlMs
      ) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      const slot = this.accounts.get(id)!;
      try {
        await slot.context.close();
      } catch (e) {
        logger.info(`[pool] gc close error account=${id}: ${(e as Error).message}`);
      }
      this.accounts.delete(id);
      logger.info(
        `[pool] context gc for account=${id}, total=${this.accounts.size}`,
      );
    }
  }

  // ---------------- 对外：关闭 ----------------

  async destroy(): Promise<void> {
    clearInterval(this.timer);
    for (const slot of this.accounts.values()) {
      try {
        await slot.context.close();
      } catch {
        /* ignore */
      }
    }
    this.accounts.clear();
    await this.browser?.close();
    this.browser = null;
  }

  /** 当前池状态（监控用） */
  status() {
    return {
      total: this.accounts.size,
      accounts: [...this.accounts.entries()].map(([id, s]) => ({
        accountId: id,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
      })),
    };
  }
}

export const browserPool = new BrowserPool((browser, accountId) => {
  const stateFile = getStorageState(accountId)
  const options: any = {
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  };
  if (existsSync(stateFile)) {
    options["storageState"] = stateFile;
  }
  return browser.newContext(options);
});

export const useOne = async <T>(
  accountId: string,
  headless = false,
  fn: (ctx: BrowserContext) => Promise<T>,
) => {
  const browser = await launchEdge(headless);
  const stateFile = getStorageState(accountId)
  const options: any = {
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  };
  if (existsSync(stateFile)) {
    options["storageState"] = stateFile;
  }
  const ctx = await browser.newContext(options);
  try {
    return await fn(ctx);
  } finally {
    if (ctx) {
      await ctx.close();
    }
    if (browser) {
      await browser.close();
    }
  }
};
