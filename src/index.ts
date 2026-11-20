import '@/bootstrap'; // 必须在其它模块之前：预置 patchright 注册表
import { logger } from '@/utils/logger';
import { browserPool } from './browser/browser_pool';
import { createApp } from '@/app';
import { scheduler } from '@/services/scheduler';
import { openBrowser } from '@/utils/openBrowser';
import { backfillAccountProfiles } from '@/services/account.service';

const PORT = Number(process.env.PORT ?? 3000);
/** 是否自动打开浏览器（DOUYIN_BEE_NO_OPEN=1 关闭，便于测试/服务端部署） */
const NO_OPEN = process.env.DOUYIN_BEE_NO_OPEN === '1';

const app = createApp();

// 恢复上次中断的采集，并启动串行调度器
scheduler.recoverOnBoot();
scheduler.start();

// 回填老账户的昵称/头像（异步执行，不阻塞启动）
void backfillAccountProfiles().catch((e) =>
  logger.warn(`回填账户资料失败: ${(e as Error).message}`),
);

const server = app.listen(PORT, () => {
  const url = `http://127.0.0.1:${PORT}`;
  logger.info(`server listening on ${url}`);
  if (!NO_OPEN) openBrowser(url);
});

// 优雅退出
async function shutdown(signal: string) {
  logger.info(`received ${signal}, shutting down...`);
  await scheduler.dispose();
  server.close(async () => {
    await browserPool.destroy();
    process.exit(0);
  });
  // 兜底强制退出
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
