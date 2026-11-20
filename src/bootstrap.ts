/**
 * patchright 打包兼容层（必须在入口最顶部 import）
 *
 * 背景：patchright-core 内部通过
 *   require(path.join(packageRoot, 'browsers.json'))
 * 动态拼接路径加载注册表，pkg 无法静态分析，打包后快照里找不到该文件会直接崩溃。
 *
 * 做法：在 patchright 被加载之前，
 *  1. 从内置资源读取 browsers.json；
 *  2. 拦截 Module._resolveFilename，把任何 *browsers.json 的请求预先塞入模块缓存。
 *
 * 必须在其它模块 import 'patchright' 之前执行，因此本模块自身不依赖任何项目内模块。
 */
import Module from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ModuleExt = typeof Module & {
  _resolveFilename: (req: string, parent?: NodeModule, isMain?: boolean) => string;
  _cache: Record<string, { exports: unknown; loaded: boolean }>;
};

const m = Module as unknown as ModuleExt;

/** 在候选目录里找 browsers.json */
function findBrowsersJson(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const isPackaged = typeof (process as unknown as { pkg?: unknown }).pkg !== 'undefined';

  const direct = isPackaged
    ? [
        // pkg 快照：dist/index.js 与 dist/runtime/ 同级
        path.join(here, 'runtime', 'browsers.json'),
        path.join(process.cwd(), 'dist', 'runtime', 'browsers.json'),
        // 外置兜底：exe 同级目录的 runtime/
        path.join(path.dirname(process.execPath), 'runtime', 'browsers.json'),
      ]
    : [
        path.join(here, '..', '..', 'dist', 'runtime', 'browsers.json'),
        path.join(process.cwd(), 'dist', 'runtime', 'browsers.json'),
      ];
  for (const p of direct) {
    if (existsSync(p)) return p;
  }

  // 源码 / dist 运行：在 node_modules/.pnpm 下找 patchright-core
  const dirs = [
    path.join(here, '..', '..', 'node_modules', '.pnpm'),
    path.join(process.cwd(), 'node_modules', '.pnpm'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const core = readdirSync(dir).find((n) => n.startsWith('patchright-core@'));
      if (core) {
        const p = path.join(dir, core, 'node_modules', 'patchright-core', 'browsers.json');
        if (existsSync(p)) return p;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

let installed = false;

export function installPatchrightCompat(): void {
  if (installed) return;
  installed = true;

  const found = findBrowsersJson();
  if (!found) {
    // 非打包环境通常能通过正常 require 解析，不强行报错
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(found, 'utf-8'));
  } catch {
    return;
  }

  const origResolve = m._resolveFilename.bind(m);
  m._resolveFilename = function (request: string, parent?: NodeModule, isMain?: boolean) {
    const resolved = origResolve(request, parent, isMain);
    if (resolved.endsWith('browsers.json')) {
      m._cache[resolved] = { exports: json, loaded: true };
    }
    return resolved;
  };
  console.log(`[compat] patchright registry preloaded from ${found}`);
}

installPatchrightCompat();
