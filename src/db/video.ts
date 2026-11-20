import { db } from '@/db/db';
import { nowText } from '@/utils/time';

/** 采集状态：每个视频对应一次采集，不留历史记录 */
export type CollectStatus =
  | 'idle' // 从未采集
  | 'pending' // 已入队
  | 'running' // 采集中
  | 'paused' // 已暂停
  | 'success' // 已完成
  | 'failed' // 失败
  | 'canceled'; // 已取消

export const RUNNABLE_STATUS: CollectStatus[] = ['pending', 'running'];

export interface VideoRow {
  id: number;
  aweme_id: string;
  share_url: string | null;
  title: string | null;
  cover_url: string | null;
  author_name: string | null;
  author_sec_uid: string | null;
  digg_count: number;
  comment_count: number;
  share_count: number;
  play_count: number;
  publish_time: number | null;
  remark: string | null;
  status: string;

  collect_account_id: string | null;
  collect_replies: number;
  collect_max_comments: number | null;
  collect_interval_ms: number;

  collect_status: CollectStatus;
  collect_cursor: number;
  collect_reply_queue: string | null;
  collect_total: number;
  collect_inserted: number;
  collect_updated: number;
  collect_reply_fetched: number;
  collect_error: string | null;
  collect_started_at: string | null;
  collect_finished_at: string | null;

  created_at: string;
  updated_at: string;
}

export interface VideoCreateInput {
  awemeId: string;
  shareUrl?: string;
  title?: string;
  coverUrl?: string;
  authorName?: string;
  authorSecUid?: string;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  playCount?: number;
  publishTime?: number | null;
  remark?: string;
}

/** 采集配置 */
export interface CollectOptions {
  accountId?: string | null;
  collectReplies?: boolean;
  maxComments?: number | null;
  intervalMs?: number;
}

export interface ReplyQueue {
  done: string[];
  pending: string[];
}

/** 列表行：附带已采集条数与账户昵称 */
export type VideoListRow = VideoRow & {
  collected: number;
  account_nickname: string | null;
};

export const videoRepo = {
  /** 新增，aweme_id 已存在时更新元信息（不覆盖已有采集配置与状态） */
  create(input: VideoCreateInput): VideoRow {
    const tt = nowText();
    const stmt = db.prepare(`
      INSERT INTO videos (
        aweme_id, share_url, title, cover_url, author_name, author_sec_uid,
        digg_count, comment_count, share_count, play_count, publish_time, remark,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(aweme_id) DO UPDATE SET
        share_url      = COALESCE(NULLIF(excluded.share_url, ''), videos.share_url),
        title          = COALESCE(NULLIF(excluded.title, ''), videos.title),
        cover_url      = COALESCE(NULLIF(excluded.cover_url, ''), videos.cover_url),
        author_name    = COALESCE(NULLIF(excluded.author_name, ''), videos.author_name),
        author_sec_uid = COALESCE(NULLIF(excluded.author_sec_uid, ''), videos.author_sec_uid),
        digg_count     = MAX(videos.digg_count, excluded.digg_count),
        comment_count  = MAX(videos.comment_count, excluded.comment_count),
        share_count    = MAX(videos.share_count, excluded.share_count),
        play_count     = MAX(videos.play_count, excluded.play_count),
        publish_time   = COALESCE(excluded.publish_time, videos.publish_time),
        updated_at     = excluded.updated_at
      RETURNING *
    `);
    return stmt.get(
      input.awemeId,
      input.shareUrl ?? '',
      input.title ?? null,
      input.coverUrl ?? null,
      input.authorName ?? null,
      input.authorSecUid ?? null,
      input.diggCount ?? 0,
      input.commentCount ?? 0,
      input.shareCount ?? 0,
      input.playCount ?? 0,
      input.publishTime ?? null,
      input.remark ?? null,
      tt,
      tt,
    ) as unknown as VideoRow;
  },

  findByAwemeId(awemeId: string): VideoRow | undefined {
    return db.prepare('SELECT * FROM videos WHERE aweme_id = ?').get(awemeId) as unknown as
      | VideoRow
      | undefined;
  },

  findById(id: number): VideoRow | undefined {
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as unknown as VideoRow | undefined;
  },

  findListRow(id: number): VideoListRow | undefined {
    return db
      .prepare(
        `SELECT v.*,
                (SELECT COUNT(*) FROM comments c WHERE c.aweme_id = v.aweme_id) AS collected,
                a.nickname AS account_nickname
           FROM videos v
           LEFT JOIN accounts a ON a.account_id = v.collect_account_id
          WHERE v.id = ?`,
      )
      .get(id) as unknown as VideoListRow | undefined;
  },

  /** 列表：带已采集评论数、采集账户昵称 */
  list(opts: { keyword?: string; page?: number; pageSize?: number }): {
    list: VideoListRow[];
    total: number;
  } {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.keyword) {
      where.push('(v.title LIKE ? OR v.aweme_id LIKE ? OR v.author_name LIKE ? OR v.remark LIKE ?)');
      const kw = `%${opts.keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM videos v ${whereSql}`).get(...params) as { c: number }
    ).c;
    const list = db
      .prepare(
        `SELECT v.*,
                (SELECT COUNT(*) FROM comments c WHERE c.aweme_id = v.aweme_id) AS collected,
                a.nickname AS account_nickname
           FROM videos v
           LEFT JOIN accounts a ON a.account_id = v.collect_account_id
           ${whereSql}
          ORDER BY v.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as VideoListRow[];
    return { list, total };
  },

  /** 下拉选择用精简列表 */
  listOptions(): { id: number; awemeId: string; title: string; coverUrl: string }[] {
    const rows = db
      .prepare(`SELECT id, aweme_id, title, cover_url FROM videos ORDER BY id DESC`)
      .all() as { id: number; aweme_id: string; title: string | null; cover_url: string | null }[];
    return rows.map((r) => ({
      id: r.id,
      awemeId: r.aweme_id,
      title: r.title || r.aweme_id,
      coverUrl: r.cover_url || '',
    }));
  },

  update(
    id: number,
    patch: Partial<{ title: string; remark: string; coverUrl: string; status: string }>,
  ): VideoRow | undefined {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.remark !== undefined) {
      sets.push('remark = ?');
      params.push(patch.remark);
    }
    if (patch.coverUrl !== undefined) {
      sets.push('cover_url = ?');
      params.push(patch.coverUrl);
    }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (!sets.length) return this.findById(id);
    sets.push('updated_at = ?');
    params.push(nowText(), id);
    db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },

  /* ---------------- 采集配置 ---------------- */

  /** 写入采集配置（不会改动进行中的状态字段） */
  setCollectOptions(id: number, opts: CollectOptions): void {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (opts.accountId !== undefined) {
      sets.push('collect_account_id = ?');
      params.push(opts.accountId);
    }
    if (opts.collectReplies !== undefined) {
      sets.push('collect_replies = ?');
      params.push(opts.collectReplies ? 1 : 0);
    }
    if (opts.maxComments !== undefined) {
      sets.push('collect_max_comments = ?');
      params.push(opts.maxComments);
    }
    if (opts.intervalMs !== undefined) {
      sets.push('collect_interval_ms = ?');
      params.push(opts.intervalMs);
    }
    if (!sets.length) return;
    sets.push('updated_at = ?');
    params.push(nowText(), id);
    db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },

  /** 直接设置采集状态（不重置统计） */
  setStatus(id: number, status: CollectStatus, error?: string | null): void {
    const tt = nowText();
    db.prepare(
      `UPDATE videos SET collect_status = ?, collect_error = ?, updated_at = ? WHERE id = ?`,
    ).run(status, error ?? null, tt, id);
  },

  /** 重置进度与统计（重新开始时调用；不改动配置与状态） */
  resetStats(id: number): void {
    db.prepare(
      `UPDATE videos SET
         collect_cursor = 0,
         collect_reply_queue = NULL,
         collect_total = 0,
         collect_inserted = 0,
         collect_updated = 0,
         collect_reply_fetched = 0,
         collect_error = NULL,
         collect_started_at = NULL,
         collect_finished_at = NULL,
         updated_at = ?
       WHERE id = ?`,
    ).run(nowText(), id);
  },

  /** 全新开始：清空进度与统计，置为 running */
  startFresh(id: number): void {
    const tt = nowText();
    db.prepare(
      `UPDATE videos SET
         collect_status = 'running',
         collect_cursor = 0,
         collect_reply_queue = NULL,
         collect_total = 0,
         collect_inserted = 0,
         collect_updated = 0,
         collect_reply_fetched = 0,
         collect_error = NULL,
         collect_started_at = ?,
         collect_finished_at = NULL,
         updated_at = ?
       WHERE id = ?`,
    ).run(tt, tt, id);
  },

  /** 断点继续：保留 cursor 与统计，置为 running */
  resumeRunning(id: number): void {
    const tt = nowText();
    db.prepare(
      `UPDATE videos SET collect_status = 'running', collect_error = NULL, collect_finished_at = NULL, updated_at = ?
        WHERE id = ?`,
    ).run(tt, id);
  },

  finish(id: number, status: CollectStatus, error?: string | null): void {
    const tt = nowText();
    db.prepare(
      `UPDATE videos SET collect_status = ?, collect_error = ?, collect_finished_at = ?, updated_at = ?
        WHERE id = ?`,
    ).run(status, error ?? null, status === 'paused' ? null : tt, tt, id);
  },

  saveProgress(id: number, patch: { cursor?: number; replyQueue?: string | null }): void {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.cursor !== undefined) {
      sets.push('collect_cursor = ?');
      params.push(patch.cursor);
    }
    if (patch.replyQueue !== undefined) {
      sets.push('collect_reply_queue = ?');
      params.push(patch.replyQueue);
    }
    if (!sets.length) return;
    sets.push('updated_at = ?');
    params.push(nowText(), id);
    db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },

  /** 原子累加采集统计 */
  bump(id: number, patch: { total?: number; inserted?: number; updated?: number; replyFetched?: number }): void {
    db.prepare(
      `UPDATE videos SET
         collect_total         = collect_total + ?,
         collect_inserted      = collect_inserted + ?,
         collect_updated       = collect_updated + ?,
         collect_reply_fetched = collect_reply_fetched + ?,
         updated_at            = ?
       WHERE id = ?`,
    ).run(
      patch.total ?? 0,
      patch.inserted ?? 0,
      patch.updated ?? 0,
      patch.replyFetched ?? 0,
      nowText(),
      id,
    );
  },

  /** 调度用：所有可运行视频按 id 升序 */
  listRunnable(): VideoRow[] {
    return db
      .prepare(
        `SELECT * FROM videos WHERE collect_status IN ('running','pending') ORDER BY id ASC`,
      )
      .all() as unknown as VideoRow[];
  },

  listByStatus(status: CollectStatus): VideoRow[] {
    return db
      .prepare('SELECT * FROM videos WHERE collect_status = ? ORDER BY id ASC')
      .all(status) as unknown as VideoRow[];
  },

  /** 删除视频，评论一并删除 */
  delete(id: number): boolean {
    const row = this.findById(id);
    if (!row) return false;
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM comments WHERE aweme_id = ?').run(row.aweme_id);
      db.prepare('DELETE FROM video_logs WHERE video_id = ?').run(id);
      const r = db.prepare('DELETE FROM videos WHERE id = ?').run(id);
      db.exec('COMMIT');
      return r.changes > 0;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },

  count(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM videos').get() as { c: number }).c;
  },

  countByStatus(status: CollectStatus): number {
    return (
      db.prepare('SELECT COUNT(*) AS c FROM videos WHERE collect_status = ?').get(status) as {
        c: number;
      }
    ).c;
  },

  /* ---------------- 采集日志 ---------------- */

  log(videoId: number, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    db.prepare('INSERT INTO video_logs (video_id, level, message, created_at) VALUES (?, ?, ?, ?)').run(
      videoId,
      level,
      message,
      nowText(),
    );
  },

  logs(
    videoId: number,
    afterId = 0,
    limit = 300,
  ): { id: number; level: string; message: string; createdAt: string }[] {
    const rows = db
      .prepare('SELECT * FROM video_logs WHERE video_id = ? AND id > ? ORDER BY id ASC LIMIT ?')
      .all(videoId, afterId, limit) as unknown as {
      id: number;
      level: string;
      message: string;
      created_at: string;
    }[];
    return rows.map((r) => ({ id: r.id, level: r.level, message: r.message, createdAt: r.created_at }));
  },
};
