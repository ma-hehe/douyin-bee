import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { initSchema } from '@/db/schema';
import { logger } from '@/utils/logger';
import { PROJECT_ROOT } from '@/utils/kit';

const DATA_DIR = path.join(PROJECT_ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'app.db');

export const db = new DatabaseSync(DB_FILE)

// 推荐配置
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA synchronous = NORMAL')

initSchema(db)
logger.info(`[db] opened ${DB_FILE}`)

process.on('SIGINT', () => {
  db.close()
  process.exit(0)
})