import { EventEmitter } from 'node:events';
import { videoRepo, RUNNABLE_STATUS, type VideoRow, type ReplyQueue } from '@/db/video';
import { commentRepo } from '@/db/comment';
import { accountRepo } from '@/db/account';
import { api_fetch, type CommentInfo } from '@/douyin/api_fetch';
import { checkAccountFileHealth } from '@/services/account.service';
import { logger } from '@/utils/logger';
import { sleep } from '@/utils/kit';

type PageResult = {
  comments: CommentInfo[];
  cursor: number;
  hasMore: boolean;
  total: number;
};

/** 暂停/取消信号 */
class CollectStopped extends Error {
  constructor(public kind: 'paused' | 'canceled') {
    super(kind);
  }
}

/** 判定为风控/登录失效的错误信息 */
const RISK_HINTS = ['风控', '验证', '频繁', '登录失效', 'login', 'captcha', 'forbidden'];

function isRiskError(msg: string): boolean {
  const low = msg.toLowerCase();
  return RISK_HINTS.some((h) => low.includes(h));
}

/** 每页 10 条，与原有默认保持一致 */
const PAGE_SIZE = 10;
/** 回复翻页每页条数 */
const REPLY_PAGE_SIZE = 20;
/** 单个请求最大重试次数 */
const MAX_RETRY = 3;

/**
 * 采集调度器：以「视频」为调度单位，全局串行。
 * 状态持久化在 videos 表的 collect_* 字段上，无需独立任务表。
 */
export class Scheduler extends EventEmitter {
  private running = false;
  private stopFlags = new Map<number, 'paused' | 'canceled'>();
  private timer: NodeJS.Timeout | null = null;
  private disposed = false;
  private ticking = false;

  /** 当前正在采集的视频 ID */
  currentVideoId: number | null = null;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 1000);
    this.timer.unref();
    setImmediate(() => void this.tick());
  }

  async dispose() {
    this.disposed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.currentVideoId != null) {
      this.stopFlags.set(this.currentVideoId, 'paused');
    }
  }

  /**
   * 入队 / 重新开始。
   * 选择「全新开始」语义：下次执行时清空该视频旧评论并从头采集。
   */
  enqueue(videoId: number) {
    const v = videoRepo.findById(videoId);
    if (!v) return;
    if (RUNNABLE_STATUS.includes(v.collect_status)) return;
    videoRepo.resetStats(videoId);
    videoRepo.setStatus(videoId, 'pending');
    videoRepo.log(videoId, '已加入采集队列');
    setImmediate(() => void this.tick());
  }

  /** 从断点继续（保留 cursor 与统计） */
  resume(videoId: number) {
    const v = videoRepo.findById(videoId);
    if (!v) return;
    if (v.collect_status !== 'paused') return;
    videoRepo.setStatus(videoId, 'pending');
    videoRepo.log(videoId, '已从断点继续');
    setImmediate(() => void this.tick());
  }

  pause(videoId: number) {
    const v = videoRepo.findById(videoId);
    if (!v) return;
    if (v.collect_status === 'pending') {
      videoRepo.finish(videoId, 'paused');
      videoRepo.log(videoId, '已暂停（未开始采集）');
      return;
    }
    if (v.collect_status === 'running') {
      this.stopFlags.set(videoId, 'paused');
      videoRepo.log(videoId, '收到暂停请求，将在当前页完成后暂停');
    }
  }

  cancel(videoId: number) {
    const v = videoRepo.findById(videoId);
    if (!v) return;
    if (v.collect_status === 'pending' || v.collect_status === 'paused') {
      videoRepo.finish(videoId, 'canceled');
      videoRepo.log(videoId, '已取消采集');
      return;
    }
    if (v.collect_status === 'running') {
      this.stopFlags.set(videoId, 'canceled');
      videoRepo.log(videoId, '收到取消请求，将在当前页完成后取消');
    }
  }

  /** 调度入口：串行取一个可运行视频 */
  private async tick() {
    if (this.disposed || this.running || this.ticking) return;
    this.ticking = true;
    try {
      const runnable = videoRepo.listRunnable();
      if (!runnable.length) return;
      // 上次进程中断残留的 running 优先恢复，其次取最早的 pending
      const video =
        runnable.find((v) => v.collect_status === 'running') ??
        runnable.find((v) => v.collect_status === 'pending');
      if (!video) return;

      this.running = true;
      this.currentVideoId = video.id;
      try {
        await this.runVideo(video);
      } catch (e) {
        logger.error(`[scheduler] 视频 #${video.id} 采集异常`, e);
        videoRepo.finish(video.id, 'failed', (e as Error).message);
      } finally {
        this.running = false;
        this.currentVideoId = null;
        this.stopFlags.delete(video.id);
      }
    } finally {
      this.ticking = false;
    }
  }

  /** 执行单个视频的采集 */
  private async runVideo(video: VideoRow) {
    const accountId = video.collect_account_id || '';
    if (!accountId) {
      videoRepo.finish(video.id, 'failed', '未配置采集账户');
      videoRepo.log(video.id, '未配置采集账户，无法采集', 'error');
      return;
    }

    const health = checkAccountFileHealth(accountId);
    if (!health.valid) {
      accountRepo.updateCheck(accountId, 'invalid');
      videoRepo.finish(video.id, 'failed', `账户登录态失效：${health.reason}`);
      videoRepo.log(video.id, `开始前检查失败：${health.reason}`, 'error');
      return;
    }

    // started_at 为空表示全新开始（首次或重新采集）：清空该视频旧评论
    const isFreshStart = !video.collect_started_at;

    if (isFreshStart) {
      const removed = commentRepo.clearByAweme(video.aweme_id, video.id);
      videoRepo.startFresh(video.id);
      videoRepo.log(video.id, `已清空该视频旧评论 ${removed} 条，开始全量采集`);
    } else {
      videoRepo.resumeRunning(video.id);
      videoRepo.log(video.id, `从断点继续采集 cursor=${video.collect_cursor}`);
    }

    const interval = Math.max(video.collect_interval_ms || 500, 200);
    const maxComments = video.collect_max_comments ?? Infinity;

    try {
      await this.collectTopLevel(video, accountId, interval, maxComments);
      if (video.collect_replies) {
        await this.collectAllReplies(video, accountId, interval);
      }
      videoRepo.finish(video.id, 'success');
      videoRepo.log(video.id, '采集完成');
      this.emit('progress', video.id);
    } catch (e) {
      this.handleRuntimeError(video, accountId, e);
    }
  }

  /** 阶段 1：一级评论翻页 */
  private async collectTopLevel(
    video: VideoRow,
    accountId: string,
    interval: number,
    maxComments: number,
  ) {
    let cursor = video.collect_cursor;
    let total = video.collect_total;
    let hasMore = true;
    let emptyRounds = 0;

    while (hasMore && total < maxComments) {
      this.throwIfStopped(video.id);
      const page = await this.fetchWithRetry<PageResult>(video.id, () =>
        api_fetch.getCommentList(accountId, video.aweme_id, { cursor, count: PAGE_SIZE }),
      );

      // 空页但接口说还有更多：连续 3 次空页视为结束，避免死循环
      if (!page.comments.length) {
        emptyRounds++;
        if (!page.hasMore || emptyRounds >= 3) break;
        await sleep(interval, interval + 500);
        continue;
      }
      emptyRounds = 0;

      const remain = maxComments - total;
      const slice = page.comments.slice(0, Math.max(0, remain));
      const stat = commentRepo.upsertMany(slice, '0', video.id);
      total += slice.length;
      hasMore = page.hasMore;
      cursor = page.cursor;

      videoRepo.saveProgress(video.id, { cursor });
      videoRepo.bump(video.id, { total: slice.length, inserted: stat.inserted, updated: stat.updated });
      videoRepo.log(
        video.id,
        `一级评论：本页 ${slice.length} 条（新增 ${stat.inserted} / 更新 ${stat.updated}），累计 ${total} 条，cursor=${cursor}`,
      );
      this.emit('progress', video.id);
      if (hasMore) await sleep(interval, interval + Math.min(interval, 500));
    }
  }

  /** 阶段 2：二级回复 */
  private async collectAllReplies(video: VideoRow, accountId: string, interval: number) {
    const queue = this.loadReplyQueue(video);
    const needReply = this.listCommentsWithReplies(video.aweme_id);
    for (const cid of needReply) {
      if (!queue.done.includes(cid) && !queue.pending.includes(cid)) queue.pending.push(cid);
    }
    videoRepo.saveProgress(video.id, { replyQueue: JSON.stringify(queue) });
    videoRepo.log(video.id, `进入二级回复采集，待采集评论 ${queue.pending.length} 条`);

    while (queue.pending.length) {
      this.throwIfStopped(video.id);
      const parentId = queue.pending[0];
      await this.collectReplies(video, accountId, parentId, interval);
      queue.pending.shift();
      queue.done.push(parentId);
      videoRepo.saveProgress(video.id, { replyQueue: JSON.stringify(queue) });
      this.emit('progress', video.id);
      await sleep(interval, interval + Math.min(interval, 500));
    }
  }

  private loadReplyQueue(video: VideoRow): ReplyQueue {
    if (!video.collect_reply_queue) return { done: [], pending: [] };
    try {
      const q = JSON.parse(video.collect_reply_queue) as ReplyQueue;
      return { done: q.done ?? [], pending: q.pending ?? [] };
    } catch {
      return { done: [], pending: [] };
    }
  }

  /** 查询某视频下有回复的一级评论 ID */
  private listCommentsWithReplies(awemeId: string): string[] {
    const rows = commentRepo.query({
      awemeId,
      replies: '',
      page: 1,
      pageSize: 500,
      sort: 'digg',
      order: 'desc',
    }).list as { comment_id: string; reply_count: number }[];
    return rows.filter((r) => (r.reply_count ?? 0) > 0).map((r) => r.comment_id);
  }

  /** 采集某条一级评论下的全部回复 */
  private async collectReplies(
    video: VideoRow,
    accountId: string,
    parentId: string,
    interval: number,
  ) {
    let cursor = 0;
    let hasMore = true;
    let count = 0;
    let guard = 0;

    while (hasMore && guard++ < 200) {
      this.throwIfStopped(video.id);
      const page = await this.fetchWithRetry<PageResult>(video.id, () =>
        api_fetch.getCommentListReply(accountId, video.aweme_id, parentId, {
          cursor,
          count: REPLY_PAGE_SIZE,
        }),
      );
      if (!page.comments.length) break;

      const stat = commentRepo.upsertMany(page.comments, parentId, video.id);
      count += page.comments.length;
      cursor = page.cursor;
      hasMore = page.hasMore;
      videoRepo.bump(video.id, {
        total: page.comments.length,
        replyFetched: page.comments.length,
        inserted: stat.inserted,
        updated: stat.updated,
      });
      this.emit('progress', video.id);
      await sleep(interval, interval + Math.min(interval, 500));
    }
    if (count) videoRepo.log(video.id, `评论 ${parentId} 的回复：采集 ${count} 条`);
  }

  /** 带重试的取数 */
  private async fetchWithRetry<T>(videoId: number, fn: () => Promise<T>): Promise<T> {
    let lastErr: Error | null = null;
    for (let i = 0; i < MAX_RETRY; i++) {
      this.throwIfStopped(videoId);
      try {
        return await fn();
      } catch (e) {
        lastErr = e as Error;
        const wait = 1000 * Math.pow(2, i);
        videoRepo.log(videoId, `第 ${i + 1} 次请求失败：${lastErr.message}，${wait}ms 后重试`, 'warn');
        await sleep(wait, wait + 500);
      }
    }
    const msg = lastErr?.message ?? '未知错误';
    if (isRiskError(msg)) {
      throw new Error(`疑似触发风控/登录失效：${msg}`);
    }
    throw new Error(`连续 ${MAX_RETRY} 次请求失败：${msg}`);
  }

  private throwIfStopped(videoId: number) {
    const flag = this.stopFlags.get(videoId);
    if (flag) throw new CollectStopped(flag);
  }

  private handleRuntimeError(video: VideoRow, accountId: string, e: unknown) {
    if (e instanceof CollectStopped) {
      const status = e.kind === 'paused' ? 'paused' : 'canceled';
      videoRepo.finish(video.id, status);
      videoRepo.log(video.id, status === 'paused' ? '已暂停' : '已取消');
      return;
    }
    const msg = (e as Error).message ?? '未知错误';
    videoRepo.finish(video.id, 'failed', msg);
    videoRepo.log(video.id, `采集失败：${msg}`, 'error');
    if (isRiskError(msg)) {
      accountRepo.updateCheck(accountId, 'invalid');
    }
    logger.error(`[scheduler] 视频 #${video.id} 采集失败: ${msg}`);
  }

  /** 启动时恢复：把上次中断的 running 转回 pending（保留断点） */
  recoverOnBoot() {
    const running = videoRepo.listByStatus('running');
    for (const v of running) {
      videoRepo.setStatus(v.id, 'pending', '服务重启，已自动恢复');
      videoRepo.log(v.id, '服务重启，采集自动恢复为待运行');
    }
    if (running.length) logger.info(`[scheduler] 恢复了 ${running.length} 个中断的采集`);
  }

  status() {
    const queue = videoRepo.listRunnable();
    return {
      running: this.running,
      currentVideoId: this.currentVideoId,
      queue: queue.map((v) => ({ videoId: v.id, status: v.collect_status })),
    };
  }
}

export const scheduler = new Scheduler();
