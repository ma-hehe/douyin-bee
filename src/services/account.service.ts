import { existsSync, readFileSync } from 'node:fs';
import { getStorageState } from '@/utils/kit';
import { accountRepo } from '@/db/account';
import { loadSession } from '@/douyin/session';
import { logger } from '@/utils/logger';

export interface HealthResult {
  valid: boolean;
  reason: string;
}

/** 正在进行扫码登录的账户集合（防止重复发起） */
const loggingIn = new Set<string>();

export function markLoginStarted(accountId: string) {
  loggingIn.add(accountId);
}

export function markLoginFinished(accountId: string) {
  loggingIn.delete(accountId);
}

export function isLoginInProgress(accountId: string): boolean {
  return loggingIn.has(accountId);
}

/**
 * 启动时回填账户资料：老数据里 nickname/avatar/uid 可能是空的，
 * 而会话文件里实际存着，这里统一补齐。
 */
export async function backfillAccountProfiles(): Promise<void> {
  const rows = accountRepo.listAll();
  let filled = 0;
  for (const row of rows) {
    if (row.nickname && row.avatar_url && row.douyin_uid) continue;
    try {
      const s = await loadSession(row.account_id);
      if (!s.nickname && !s.avatar_url && !s.uid) continue;
      accountRepo.upsertLogin(row.account_id, {
        nickname: s.nickname,
        avatarUrl: s.avatar_url,
        uid: s.uid,
      });
      filled++;
    } catch (e) {
      logger.warn(`[account] 回填账户 ${row.account_id} 资料失败: ${(e as Error).message}`);
    }
  }
  if (filled) logger.info(`[account] 已回填 ${filled} 个账户的昵称/头像信息`);
}


/** douyin 登录必需的关键 cookie */
const REQUIRED_COOKIES = ['sessionid', 'uid_tt', 'ttwid'];

/**
 * 通过本地 storageState 文件判断抖音登录态是否仍然有效。
 * 只做本地判定（不发起网络请求），用于列表展示和任务启动前的快速校验。
 */
export function checkAccountFileHealth(accountId: string): HealthResult {
  const path = getStorageState(accountId);
  if (!existsSync(path)) {
    return { valid: false, reason: '会话文件不存在，请重新登录' };
  }

  let state: {
    cookies?: { name: string; value: string; expires?: number }[];
  };
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return { valid: false, reason: '会话文件为空，请重新登录' };
    state = JSON.parse(raw);
  } catch {
    return { valid: false, reason: '会话文件损坏，请重新登录' };
  }

  const cookies = new Map(
    (state.cookies ?? []).filter((c) => c?.name).map((c) => [c.name, c] as const),
  );

  for (const name of REQUIRED_COOKIES) {
    const c = cookies.get(name);
    if (!c || !c.value) {
      return { valid: false, reason: `缺少 ${name}，请重新登录` };
    }
  }

  const sessionid = cookies.get('sessionid')!;
  // expires === -1 表示 session cookie（关闭浏览器失效），视为长期有效
  if (typeof sessionid.expires === 'number' && sessionid.expires > 0) {
    const expiresMs = sessionid.expires * 1000;
    if (expiresMs < Date.now()) {
      return { valid: false, reason: 'sessionid 已过期，请重新登录' };
    }
  }

  return { valid: true, reason: '' };
}
