import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';
import { logger } from './logger';

/** 是否运行在 pkg 打包的 exe 中 */
export const IS_PACKAGED = typeof (process as unknown as { pkg?: unknown }).pkg !== 'undefined';

/**
 * 解析项目根目录（数据目录 data/ 的父目录）。
 *
 * 三种运行形态：
 *  1. 源码运行（tsx）：      server/src/utils/kit.ts   -> 上溯到含 package.json 的 server
 *  2. dist 运行（node）：    server/dist/index.js      -> 上溯到含 package.json 的 server
 *  3. exe 运行（pkg）：       数据放在 exe 同级目录，便于便携拷贝和备份
 */
function resolveProjectRoot(): string {
  if (IS_PACKAGED) {
    // exe 所在目录（process.execPath 形如 D:\app\抖音评论采集.exe）
    return path.dirname(process.execPath);
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export const PROJECT_ROOT = resolveProjectRoot();

/** 数据目录：确保存在 */
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const AUTH_DIR = path.join(DATA_DIR, 'auth');
mkdirSync(AUTH_DIR, { recursive: true });

logger.info(`[paths] ${IS_PACKAGED ? 'packaged' : 'source'} root = ${PROJECT_ROOT}`);

export function getStorageState(accountId: string) {
  return path.join(AUTH_DIR, `${accountId}.json`);
}

export function sleep(min = 100, max = 10000): Promise<void> {
  const duration = randomBetween(min, max);
  logger.info(`[sleep] ${duration}ms`);
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function randomBetween(min: number, max: number): number {
  if (min === max) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
