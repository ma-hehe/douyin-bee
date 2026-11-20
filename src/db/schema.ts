import type { DatabaseSync } from 'node:sqlite';

/**
 * 数据库 schema 初始化 + 迁移。
 *
 * 约定：
 *  - 所有建表语句一律 `CREATE TABLE IF NOT EXISTS`，可在已有库上反复执行。
 *  - 需要加列/改结构时，按顺序追加到下方 `migrations` 数组，每条只执行一次。
 *  - 时间字段统一存 `YYYY-MM-DD HH:mm:ss`（本地时区），评论的 create_time 保留抖音原始秒级时间戳。
 *
 * 采集状态直接挂在 videos 上（一个视频对应一次采集，不留历史记录）。
 */
export function initSchema(db: DatabaseSync) {
  db.exec(`
    /* ---------------- 抖音账户 ---------------- */
    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  TEXT    NOT NULL UNIQUE,      -- 本地会话标识，同时是 data/auth/{account_id}.json 文件名
      nickname    TEXT,
      avatar_url  TEXT,
      douyin_uid  TEXT,                         -- 抖音 uid
      status      TEXT    NOT NULL DEFAULT 'active', -- active / disabled / invalid
      user_info   TEXT,
      last_login  TEXT,
      last_check  TEXT,                         -- 最近一次登录态检测时间
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_id ON accounts(account_id);

    /* ---------------- 视频素材（含采集状态） ---------------- */
    CREATE TABLE IF NOT EXISTS videos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      aweme_id       TEXT    NOT NULL UNIQUE,
      share_url      TEXT,
      title          TEXT,
      cover_url      TEXT,
      author_name    TEXT,
      author_sec_uid TEXT,
      digg_count     INTEGER NOT NULL DEFAULT 0,
      comment_count  INTEGER NOT NULL DEFAULT 0,
      share_count    INTEGER NOT NULL DEFAULT 0,
      play_count     INTEGER NOT NULL DEFAULT 0,
      publish_time   INTEGER,                   -- 秒级时间戳
      remark         TEXT,
      status         TEXT    NOT NULL DEFAULT 'active', -- active / archived

      -- ---------- 采集配置 ----------
      collect_account_id   TEXT,                 -- 采集用账户
      collect_replies      INTEGER NOT NULL DEFAULT 0, -- 是否采集二级回复
      collect_max_comments INTEGER,              -- 一级评论上限，NULL=不限
      collect_interval_ms  INTEGER NOT NULL DEFAULT 500, -- 翻页间隔基准(ms)

      -- ---------- 采集状态 ----------
      collect_status       TEXT    NOT NULL DEFAULT 'idle', -- idle/pending/running/paused/success/failed/canceled
      collect_cursor       INTEGER NOT NULL DEFAULT 0,
      collect_reply_queue  TEXT,                 -- 二级回复进度 JSON {done:[], pending:[]}
      collect_total        INTEGER NOT NULL DEFAULT 0,
      collect_inserted     INTEGER NOT NULL DEFAULT 0,
      collect_updated      INTEGER NOT NULL DEFAULT 0,
      collect_reply_fetched INTEGER NOT NULL DEFAULT 0,
      collect_error        TEXT,
      collect_started_at   TEXT,
      collect_finished_at  TEXT,

      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_videos_aweme ON videos(aweme_id);

    /* ---------------- 评论数据 ---------------- */
    CREATE TABLE IF NOT EXISTS comments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      aweme_id      TEXT    NOT NULL,
      comment_id    TEXT    NOT NULL,
      parent_id     TEXT    NOT NULL DEFAULT '0', -- 一级评论为 '0'
      text          TEXT,
      digg_count    INTEGER NOT NULL DEFAULT 0,
      reply_count   INTEGER NOT NULL DEFAULT 0,
      user_uid      TEXT,
      user_sec_uid  TEXT,
      user_nickname TEXT,
      ip_label      TEXT,
      is_hot        INTEGER NOT NULL DEFAULT 0,
      create_time   INTEGER,                      -- 抖音秒级时间戳
      video_id      INTEGER,                      -- 来源视频
      fetched_at    TEXT,
      UNIQUE(aweme_id, comment_id)
    );
    CREATE INDEX IF NOT EXISTS idx_comments_aweme  ON comments(aweme_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_comments_create ON comments(create_time);

    /* ---------------- 采集日志（按视频记录） ---------------- */
    CREATE TABLE IF NOT EXISTS video_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id   INTEGER NOT NULL,
      level      TEXT    NOT NULL DEFAULT 'info',
      message    TEXT,
      created_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_video_logs_video ON video_logs(video_id, id);
  `);

  runMigrations(db);
  cleanupLegacyTables(db);
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

/** 单条迁移：在已有库上补齐列（只追加，不修改历史项） */
const migrations: { table: string; column: string; ddl: string }[] = [
  { table: 'accounts', column: 'avatar_url', ddl: 'ALTER TABLE accounts ADD COLUMN avatar_url TEXT' },
  { table: 'accounts', column: 'douyin_uid', ddl: 'ALTER TABLE accounts ADD COLUMN douyin_uid TEXT' },
  { table: 'accounts', column: 'last_check', ddl: 'ALTER TABLE accounts ADD COLUMN last_check TEXT' },
  { table: 'accounts', column: 'douyin_sec_uid', ddl: 'ALTER TABLE accounts ADD COLUMN douyin_sec_uid TEXT' },

  // 采集状态整体并入 videos
  { table: 'videos', column: 'collect_account_id', ddl: 'ALTER TABLE videos ADD COLUMN collect_account_id TEXT' },
  { table: 'videos', column: 'collect_replies', ddl: 'ALTER TABLE videos ADD COLUMN collect_replies INTEGER NOT NULL DEFAULT 0' },
  { table: 'videos', column: 'collect_max_comments', ddl: 'ALTER TABLE videos ADD COLUMN collect_max_comments INTEGER' },
  { table: 'videos', column: 'collect_interval_ms', ddl: 'ALTER TABLE videos ADD COLUMN collect_interval_ms INTEGER NOT NULL DEFAULT 500' },
  { table: 'videos', column: 'collect_status', ddl: "ALTER TABLE videos ADD COLUMN collect_status TEXT NOT NULL DEFAULT 'idle'" },
  { table: 'videos', column: 'collect_cursor', ddl: 'ALTER TABLE videos ADD COLUMN collect_cursor INTEGER NOT NULL DEFAULT 0' },
  { table: 'videos', column: 'collect_reply_queue', ddl: 'ALTER TABLE videos ADD COLUMN collect_reply_queue TEXT' },
  { table: 'videos', column: 'collect_total', ddl: 'ALTER TABLE videos ADD COLUMN collect_total INTEGER NOT NULL DEFAULT 0' },
  { table: 'videos', column: 'collect_inserted', ddl: 'ALTER TABLE videos ADD COLUMN collect_inserted INTEGER NOT NULL DEFAULT 0' },
  { table: 'videos', column: 'collect_updated', ddl: 'ALTER TABLE videos ADD COLUMN collect_updated INTEGER NOT NULL DEFAULT 0' },
  { table: 'videos', column: 'collect_reply_fetched', ddl: 'ALTER TABLE videos ADD COLUMN collect_reply_fetched INTEGER NOT NULL DEFAULT 0' },
  { table: 'videos', column: 'collect_error', ddl: 'ALTER TABLE videos ADD COLUMN collect_error TEXT' },
  { table: 'videos', column: 'collect_started_at', ddl: 'ALTER TABLE videos ADD COLUMN collect_started_at TEXT' },
  { table: 'videos', column: 'collect_finished_at', ddl: 'ALTER TABLE videos ADD COLUMN collect_finished_at TEXT' },

  // 评论来源改为视频维度
  { table: 'comments', column: 'video_id', ddl: 'ALTER TABLE comments ADD COLUMN video_id INTEGER' },
];

function runMigrations(db: DatabaseSync) {
  for (const m of migrations) {
    if (!hasColumn(db, m.table, m.column)) {
      db.exec(m.ddl);
    }
  }
  // 依赖迁移后新增列的索引，必须在迁移之后创建
  db.exec(`CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(collect_status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id)`);

  // 回填历史评论的来源视频（旧结构按 aweme_id 关联，video_id 为空）
  db.exec(`
    UPDATE comments
       SET video_id = (SELECT v.id FROM videos v WHERE v.aweme_id = comments.aweme_id)
     WHERE video_id IS NULL
       AND EXISTS (SELECT 1 FROM videos v WHERE v.aweme_id = comments.aweme_id)
  `);
}

/**
 * 清理已废弃的表：tasks / task_logs。
 * 采集状态已并入 videos，旧任务数据直接丢弃（已确认不迁移）。
 */
function cleanupLegacyTables(db: DatabaseSync) {
  const exists = (name: string) =>
    !!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

  if (exists('task_logs')) db.exec('DROP TABLE task_logs');
  if (exists('tasks')) db.exec('DROP TABLE tasks');

  // 旧评论表的 task_id 列保留无害，但不再使用
}
