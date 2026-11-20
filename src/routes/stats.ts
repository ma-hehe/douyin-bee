import { Router } from 'express';
import { commentRepo } from '@/db/comment';
import { videoRepo } from '@/db/video';
import { accountRepo } from '@/db/account';
import { scheduler } from '@/services/scheduler';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();

/** GET /api/stats/overview —— 概览统计 */
router.get('/overview', (_req, res) => {
  const commentTotal = commentRepo.countAll();
  const replyTotal = commentRepo.query({ replies: 'only', page: 1, pageSize: 1 }).total;
  res.json({
    code: 200,
    message: '成功',
    data: {
      accounts: accountRepo.count(),
      activeAccounts: accountRepo.listUsable().filter((a) => a.status === 'active').length,
      videos: videoRepo.count(),
      // 采集状态统计（视频维度）
      idleVideos: videoRepo.countByStatus('idle'),
      runningVideos: videoRepo.countByStatus('running'),
      pendingVideos: videoRepo.countByStatus('pending'),
      pausedVideos: videoRepo.countByStatus('paused'),
      successVideos: videoRepo.countByStatus('success'),
      failedVideos: videoRepo.countByStatus('failed'),
      comments: commentTotal,
      replies: replyTotal,
      topLevel: commentTotal - replyTotal,
      byVideo: commentRepo.statsByVideo(),
      byDay: commentRepo.statsByDay(14).reverse(),
      byIp: commentRepo.statsByIp(10),
      scheduler: scheduler.status(),
    },
  });
});

/** GET /api/stats/version —— 前端读取版本号（保留扩展用） */
router.get('/version', (_req, res) => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, '../../../package.json');
  let version = '1.0.0';
  try {
    if (existsSync(pkgPath)) {
      version = (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }).version ?? version;
    }
  } catch {
    /* ignore */
  }
  res.json({ code: 200, message: '成功', data: { version } });
});

export default router;
