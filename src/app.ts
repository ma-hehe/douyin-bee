import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import useAccountRouter from '@/routes/account';
import useVideoRouter from '@/routes/video';
import useCommentRouter from '@/routes/comment';
import useStatsRouter from '@/routes/stats';
import useDouyinRouter from '@/routes/douyin';
import { errorHandler, notFound } from '@/routes/error';
import { logger } from '@/utils/logger';
import { IS_PACKAGED, PROJECT_ROOT } from '@/utils/kit';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * web/dist 目录：
 *  - exe 运行：前端资源被打进 exe 的虚拟快照，路径为 /snapshot/<pkg>/web/dist，
 *    也可以用 exe 同级目录的 web/ 覆盖（便于免打包更新前端）
 *  - 源码运行：从 src 上溯两级
 *  - dist 运行：从 dist 上溯一级
 */
function resolveWebDist(): string {
  const candidates: string[] = [];
  if (IS_PACKAGED) {
    // 优先使用 exe 同级的外置 web/，便于不重打包就更新前端
    candidates.push(path.join(PROJECT_ROOT, 'web', 'dist'));
    // pkg 快照内路径：<snapshot>/web/dist 与 <snapshot>/<projectRoot>/web/dist 都尝试
    const snap = path.join(process.execPath, '..', 'snapshot');
    candidates.push(path.join(snap, 'web', 'dist'));
    candidates.push(path.join(snap, 'server', 'web', 'dist'));
  } else {
    candidates.push(path.resolve(here, '../web/dist'));
    candidates.push(path.resolve(here, '../../web/dist'));
  }
  candidates.push(path.resolve(process.cwd(), 'web/dist'));
  return candidates.find((p) => existsSync(path.join(p, 'index.html'))) ?? candidates[0];
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}

export function createApp() {
  const app = express();

  // 全局中间件
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // 业务路由
  app.use('/api/account', useAccountRouter);
  app.use('/api/videos', useVideoRouter);
  app.use('/api/comments', useCommentRouter);
  app.use('/api/stats', useStatsRouter);
  app.use('/api/douyin', useDouyinRouter);

  // 前端静态资源 + History 路由回退
  const webDist = resolveWebDist();
  if (existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '7d' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
    logger.info(`[web] 托管前端静态资源: ${webDist}`);
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('html')
        .send(
          '<h2>前端尚未构建</h2><p>请先执行 <code>pnpm --filter web build</code>，或在开发模式下访问 Vite dev server。</p>',
        );
    });
    logger.warn(`[web] 未找到前端产物：${webDist}`);
  }

  // 404 + 错误处理（必须最后注册）
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
