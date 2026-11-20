import { db } from '@/db/db';
import { nowText } from '@/utils/time';

export interface AccountRow {
  id: number;
  account_id: string;
  nickname: string | null;
  avatar_url: string | null;
  douyin_uid: string | null;
  status: string;
  user_info: string | null;
  last_login: string | null;
  last_check: string | null;
  created_at: string;
  updated_at: string;
}

export const accountRepo = {
  /** 增：返回新行（账号已存在时覆盖登录信息） */
  create(accountId: string, nickname?: string): AccountRow {
    const tt = nowText();
    const stmt = db.prepare(`
      INSERT INTO accounts (account_id, nickname, last_login, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `);
    return stmt.get(accountId, nickname ?? null, tt, tt, tt) as unknown as AccountRow;
  },

  /**
   * 登录成功后写入：存在则更新昵称/头像/uid/登录时间，不存在则新建。
   */
  upsertLogin(accountId: string, info: { nickname?: string; avatarUrl?: string; uid?: string; sec_uid?: string }): void {
    const tt = nowText();
    const exist = this.findByAccountId(accountId);
    if (exist) {
      db.prepare(
        `UPDATE accounts
            SET nickname   = COALESCE(NULLIF(?, ''), nickname),
                avatar_url  = COALESCE(NULLIF(?, ''), avatar_url),
                douyin_uid  = COALESCE(NULLIF(?, ''), douyin_uid),
                douyin_sec_uid  = COALESCE(NULLIF(?, ''), douyin_sec_uid),
                status      = 'active',
                last_login  = ?,
                last_check  = ?,
                updated_at  = ?
          WHERE account_id = ?`,
      ).run(info.nickname ?? '', info.avatarUrl ?? '', info.uid ?? '', info.sec_uid ?? '', tt, tt, tt, accountId);
      return;
    }
    db.prepare(
      `INSERT INTO accounts (account_id, nickname, avatar_url, douyin_uid, douyin_sec_uid, status, last_login, last_check, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    ).run(accountId, info.nickname ?? null, info.avatarUrl ?? null, info.uid ?? null, info.sec_uid ?? null, tt, tt, tt, tt);
  },

  /** 查：单条（按本地 account_id） */
  findByAccountId(accountId: string): AccountRow | undefined {
    return db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(accountId) as unknown as AccountRow | undefined;
  },

  findById(id: number): AccountRow | undefined {
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as unknown as AccountRow | undefined;
  },

  /** 查：列表（分页，按数字倒序更符合时间顺序） */
  list(page = 1, pageSize = 20): { accounts: AccountRow[]; total: number } {
    const offset = (page - 1) * pageSize;
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY id DESC LIMIT ? OFFSET ?').all(pageSize, offset) as unknown as AccountRow[];
    const total = (db.prepare('SELECT COUNT(*) AS c FROM accounts').get() as { c: number }).c;
    return { accounts, total };
  },

  /** 查：可用于采集的账户（未停用、未失效） */
  listUsable(): AccountRow[] {
    return db.prepare(`SELECT * FROM accounts WHERE status IN ('active','invalid') ORDER BY id DESC`).all() as unknown as AccountRow[];
  },

  /** 查：全量（启动回填用） */
  listAll(): AccountRow[] {
    return db.prepare('SELECT * FROM accounts ORDER BY id ASC').all() as unknown as AccountRow[];
  },

  updateStatus(accountId: string, status: string): boolean {
    const r = db.prepare(`UPDATE accounts SET status = ?, updated_at = ? WHERE account_id = ?`).run(status, nowText(), accountId);
    return r.changes > 0;
  },

  /** 登录态检测结果 */
  updateCheck(accountId: string, status: string): void {
    const tt = nowText();
    db.prepare(`UPDATE accounts SET status = ?, last_check = ?, updated_at = ? WHERE account_id = ?`).run(status, tt, tt, accountId);
  },

  touchLogin(accountId: string): void {
    const tt = nowText();
    db.prepare(`UPDATE accounts SET last_login = ?, updated_at = ? WHERE account_id = ?`).run(tt, tt, accountId);
  },

  delete(accountId: string): boolean {
    const r = db.prepare('DELETE FROM accounts WHERE account_id = ?').run(accountId);
    return r.changes > 0;
  },

  count(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM accounts').get() as { c: number }).c;
  },
};
