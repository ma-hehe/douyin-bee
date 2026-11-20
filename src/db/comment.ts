import { db } from '@/db/db';
import type { CommentInfo } from '@/douyin/api_fetch';
import { nowText } from '@/utils/time';

export interface CommentFilters {
  /** 按视频ID过滤 */
  videoId?: number;
  /** 按抖音 aweme_id 过滤 */
  awemeId?: string;
  keyword?: string;
  from?: string;
  to?: string;
  ipLabel?: string;
  minDigg?: number;
  maxDigg?: number;
  isHot?: boolean;
  /** 二级回复：''=只看一级评论，'only'=只看二级回复，'include'=全部 */
  replies?: '' | 'only' | 'include';
  sort?: 'time' | 'digg';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** 构造筛选条件（SQL 片段 + 参数） */
export function buildWhere(f: CommentFilters): { where: string; params: (string | number)[] } {
  const w: string[] = [];
  const p: (string | number)[] = [];

  if (f.replies === 'only') {
    w.push("c.parent_id <> '0'");
  } else if (f.replies === 'include') {
    // 不加 parent_id 条件
  } else {
    w.push("c.parent_id = '0'");
  }

  if (f.awemeId) {
    w.push('c.aweme_id = ?');
    p.push(f.awemeId);
  }
  if (f.videoId) {
    w.push('c.aweme_id = (SELECT aweme_id FROM videos WHERE id = ?)');
    p.push(f.videoId);
  }
  if (f.keyword) {
    w.push('(c.text LIKE ? OR c.user_nickname LIKE ?)');
    p.push(`%${f.keyword}%`, `%${f.keyword}%`);
  }
  if (f.from) {
    w.push('c.create_time >= ?');
    p.push(Math.floor(new Date(`${f.from} 00:00:00`).getTime() / 1000));
  }
  if (f.to) {
    w.push('c.create_time <= ?');
    p.push(Math.floor(new Date(`${f.to} 23:59:59`).getTime() / 1000));
  }
  if (f.ipLabel) {
    w.push('c.ip_label = ?');
    p.push(f.ipLabel);
  }
  if (typeof f.minDigg === 'number' && !Number.isNaN(f.minDigg)) {
    w.push('c.digg_count >= ?');
    p.push(f.minDigg);
  }
  if (typeof f.maxDigg === 'number' && !Number.isNaN(f.maxDigg)) {
    w.push('c.digg_count <= ?');
    p.push(f.maxDigg);
  }
  if (f.isHot === true) {
    w.push('c.is_hot = 1');
  }
  if (f.videoId) {
    w.push('c.video_id = ?');
    p.push(f.videoId);
  }

  return { where: w.length ? w.join(' AND ') : '1=1', params: p };
}

/** 把一个 CommentInfo 转成入库参数 */
function toParams(c: CommentInfo, parentId: string, videoId: number) {
  return [
    c.awemeId,
    c.commentId,
    parentId,
    c.text ?? '',
    c.diggCount ?? 0,
    c.replyCount ?? 0,
    c.user?.uid ?? '',
    c.user?.secUid ?? '',
    c.user?.nickname ?? '',
    c.ipLabel ?? '',
    c.isHot ? 1 : 0,
    c.createTime ?? 0,
    videoId,
    nowText(),
  ] as (string | number)[];
}

export const commentRepo = {
  /**
   * 批量入库，返回 { inserted, updated }。
   * parentId 为 '0' 表示一级评论，否则为该一级评论的 commentId。
   * 用同一事务内批量预查已存在的 comment_id，区分新增/更新，避免依赖全表计数。
   */
  upsertMany(list: CommentInfo[], parentId: string, videoId: number): { inserted: number; updated: number } {
    if (!list.length) return { inserted: 0, updated: 0 };
    const stmt = db.prepare(`
      INSERT INTO comments (
        aweme_id, comment_id, parent_id, text, digg_count, reply_count,
        user_uid, user_sec_uid, user_nickname, ip_label, is_hot, create_time, video_id, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(aweme_id, comment_id) DO UPDATE SET
        text          = excluded.text,
        digg_count    = excluded.digg_count,
        reply_count   = MAX(comments.reply_count, excluded.reply_count),
        user_nickname = excluded.user_nickname,
        ip_label      = excluded.ip_label,
        is_hot        = excluded.is_hot,
        video_id      = excluded.video_id,
        fetched_at    = excluded.fetched_at
    `);
    const existStmt = db.prepare('SELECT 1 AS x FROM comments WHERE aweme_id = ? AND comment_id = ?');
    let inserted = 0;
    let updated = 0;
    db.exec('BEGIN');
    try {
      const seen = new Set<string>();
      for (const c of list) {
        if (seen.has(c.commentId)) continue; // 同一页内的重复评论
        seen.add(c.commentId);
        if (existStmt.get(c.awemeId, c.commentId)) updated++;
        else inserted++;
        stmt.run(...toParams(c, parentId, videoId));
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return { inserted, updated };
  },

  countAll(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM comments').get() as { c: number }).c;
  },

  countByAweme(awemeId: string): number {
    return (
      db.prepare('SELECT COUNT(*) AS c FROM comments WHERE aweme_id = ?').get(awemeId) as { c: number }
    ).c;
  },

  /** 清空某视频的全部评论（每次采集前调用） */
  clearByAweme(awemeId: string, _videoId?: number): number {
    return Number(db.prepare('DELETE FROM comments WHERE aweme_id = ?').run(awemeId).changes ?? 0);
  },

  /** 分页查询 */
  query(f: CommentFilters): { list: Record<string, unknown>[]; total: number } {
    const page = f.page && f.page > 0 ? f.page : 1;
    const pageSize = f.pageSize && f.pageSize > 0 ? Math.min(f.pageSize, 500) : 20;
    const { where, params } = buildWhere(f);
    const order = f.sort === 'digg' ? 'c.digg_count' : 'c.create_time';
    const dir = f.order === 'asc' ? 'ASC' : 'DESC';
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM comments c WHERE ${where}`).get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT c.*, v.title AS video_title, v.aweme_id AS aweme_id2
           FROM comments c
           LEFT JOIN videos v ON v.aweme_id = c.aweme_id
          WHERE ${where}
          ORDER BY ${order} ${dir}, c.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as Record<string, unknown>[];
    return { list: rows, total };
  },

  /** 导出用：游标分页遍历（按 id 升序，避免 OFFSET 深分页） */
  *iterate(f: CommentFilters, batchSize = 2000): Generator<Record<string, unknown>[]> {
    const { where, params } = buildWhere(f);
    let lastId = 0;
    const stmt = db.prepare(
      `SELECT c.*, v.title AS video_title
         FROM comments c
         LEFT JOIN videos v ON v.aweme_id = c.aweme_id
        WHERE ${where} AND c.id > ?
        ORDER BY c.id ASC
        LIMIT ?`,
    );
    while (true) {
      const rows = stmt.all(...params, lastId, batchSize) as unknown as Record<string, unknown>[];
      if (!rows.length) return;
      for (const r of rows) lastId = r.id as number;
      yield rows;
    }
  },

  /** 查询一级评论下面的二级回复 */
  repliesOf(awemeId: string, parentId: string): { list: Record<string, unknown>[]; total: number } {
    const where = "c.aweme_id = ? AND (c.parent_id = ? OR c.comment_id = ?)";
    const params = [awemeId, parentId, parentId];
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM comments c WHERE ${where}`).get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(`SELECT c.* FROM comments c WHERE ${where} ORDER BY c.create_time ASC`)
      .all(...params) as unknown as Record<string, unknown>[];
    return { list: rows, total };
  },

  /** 统计：按视频分布 */
  statsByVideo(): { videoId: number; awemeId: string; title: string; coverUrl: string; total: number }[] {
    return db
      .prepare(
        `SELECT v.id AS videoId, v.aweme_id AS awemeId, v.title AS title, v.cover_url AS coverUrl,
                COUNT(c.id) AS total
           FROM videos v
           LEFT JOIN comments c ON c.aweme_id = v.aweme_id
          GROUP BY v.id
          ORDER BY total DESC`,
      )
      .all() as unknown as { videoId: number; awemeId: string; title: string; coverUrl: string; total: number }[];
  },

  /** 统计：按天趋势（最近 N 天） */
  statsByDay(days = 14): { date: string; total: number }[] {
    return db
      .prepare(
        `SELECT date(c.create_time, 'unixepoch', 'localtime') AS date, COUNT(*) AS total
           FROM comments c
          WHERE c.create_time > 0
          GROUP BY date
          ORDER BY date DESC
          LIMIT ?`,
      )
      .all(days) as unknown as { date: string; total: number }[];
  },

  /** 统计：归属地 Top N */
  statsByIp(limit = 10): { ipLabel: string; total: number }[] {
    return db
      .prepare(
        `SELECT ip_label AS ipLabel, COUNT(*) AS total
           FROM comments
          WHERE ip_label <> ''
          GROUP BY ip_label
          ORDER BY total DESC
          LIMIT ?`,
      )
      .all(limit) as unknown as { ipLabel: string; total: number }[];
  },
};
