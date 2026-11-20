import { getStorageState } from '@/utils/kit';
import { readFile } from 'fs/promises';

export const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0';

/** 持久化的 session 数据结构 */
export interface SessionData {
  accountId: string;
  /** 按 name 索引的 cookie 对象 */
  cookies: { name: string; value: string }[];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
  uid: string;
  sec_uid: string;
  nickname: string;
  avatar_url: string;
  /** Cookie 字符串（可直接用于 HTTP Cookie header） */
  cookie: string;
  webid: string; // 也是 device_id
  uifid: string;
  sessionid: string;
  uid_tt: string;
  ms_token: string;
  verify_fp: string;
}

export async function loadSession(accountId: string): Promise<SessionData> {
  const raw = await readFile(getStorageState(accountId), { encoding: 'utf8' });
  if (!raw.trim()) {
    throw new Error(`会话文件为空，请重新登录: ${accountId}`);
  }
  const session = JSON.parse(raw) as SessionData;
  session.accountId = accountId;
  const cookies = session.cookies ?? [];
  session.cookies = cookies;
  session.sessionid = cookies.find((e) => e.name === 'sessionid')?.value || '';
  session.uifid = cookies.find((e) => e.name === 'UIFID')?.value || '';
  session.uid_tt = cookies.find((e) => e.name === 'uid_tt')?.value || '';
  session.verify_fp = cookies.find((e) => e.name === 's_v_web_id')?.value || '';

  session.cookie = cookies.map((e) => e.name + '=' + e.value).join('; ');

  const localStorageArr = (session.origins ?? []).flatMap((e) => e.localStorage ?? []);
  const SysInfo = localStorageArr.find((e) => e.name === 'SysInfo');
  if (SysInfo) session.webid = JSON.parse(SysInfo.value)['webid'];
  const xmst = localStorageArr.find((e) => e.name === 'xmst');
  if (xmst) session.ms_token = xmst.value;

  // user_info: { uid: sec_uid, nickname, avatarUrl }
  const user_info = localStorageArr.find((e) => e.name === 'user_info');
  if (user_info) {
    try {
      const userInfo = JSON.parse(user_info.value);
      session.sec_uid = userInfo['uid'];
      session.nickname = userInfo['nickname'];
      session.avatar_url = userInfo['avatarUrl'];
    } catch {
      session.nickname = '';
      session.avatar_url = '';
    }
  }
  // LOG_TRACE: [{ uid, wid, ... }]，uid 为数字 uid，wid 即 webid
  const LOG_TRACE = localStorageArr.find((e) => e.name === 'LOG_TRACE');
  if (LOG_TRACE) {
    try {
      const traces = JSON.parse(LOG_TRACE.value);
      session.uid = traces?.[0]?.['uid'] || '';
      if (!session.webid && traces?.[0]?.['wid']) session.webid = traces[0]['wid'];
    } catch {
      session.uid = '';
    }
  }
  return session;
}
