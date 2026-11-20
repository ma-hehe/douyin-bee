import type { Browser, BrowserContext } from "patchright";

/**
 * 浏览器池的全局配置项。
 */
export interface PoolOptions {
  /** 空闲回收时间（毫秒）：context 归还后超过该时长未被再次使用，就会被 GC 关闭 */
  idleTimeoutMs: number;

  /** 最大存活时间（毫秒）：context 从创建起超过该时长，即使一直在用也会被回收重建 */
  contextTtlMs: number;
}

/**
 * 池中一个账户对应的上下文槽位。
 * 一个 accountId 对应一个 BrowserContext，保证账户间 cookie / 登录态隔离。
 */
export interface AccountContext {
  /** 账户唯一标识，作为池中 Map 的 key */
  accountId: string;

  /** 该账户实际使用的浏览器上下文，同一账户复用同一个实例 */
  context: BrowserContext;

  /** 上下文创建时间戳（毫秒），用于 TTL 过期判断 */
  createdAt: number;

  /** 最近一次借出或归还的时间戳（毫秒），用于空闲超时判断 */
  lastUsedAt: number;
}

/**
 * 创建 BrowserContext 的工厂函数。
 * 允许业务方自定义 viewport、storageState、代理等参数。
 *
 * @param browser 全局单例 Browser 实例
 * @param accountId 当前要创建上下文的账户 ID
 * @returns 新建的 BrowserContext
 */
export type ContextFactory = (
  browser: Browser,
  accountId: string,
) => Promise<BrowserContext>;
