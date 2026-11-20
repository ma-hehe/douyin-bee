import { Router } from 'express';
import { HttpError } from './error';
import { videoRepo, type VideoRow, type VideoListRow } from '@/db/video';
import { resolveAwemeId, fetchVideoMeta, type VideoMeta } from '@/services/video.service';
import { scheduler } from '@/services/scheduler';
import { accountRepo } from '@/db/account';
import { logger } from '@/utils/logger';
import { tsToText } from '@/utils/time';

const router = Router();

function toDto(row: VideoRow | VideoListRow) {
  const extra = row as VideoListRow;
  let replyProgress: { done: number; pending: number } | null = null;
  if (row.collect_reply_queue) {
    try {
      const q = JSON.parse(row.collect_reply_queue) as { done?: string[]; pending?: string[] };
      replyProgress = { done: q.done?.length ?? 0, pending: q.pending?.length ?? 0 };
    } catch {
      replyProgress = null;
    }
  }
  return {
    id: row.id,
    awemeId: row.aweme_id,
    shareUrl: row.share_url || '',
    title: row.title || '',
    coverUrl: row.cover_url || '',
    authorName: row.author_name || '',
    authorSecUid: row.author_sec_uid || '',
    diggCount: row.digg_count,
    commentCount: row.comment_count,
    shareCount: row.share_count,
    playCount: row.play_count,
    publishTime: row.publish_time,
    publishTimeText: tsToText(row.publish_time),
    remark: row.remark || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    // ---- 采集配置 ----
    collectAccountId: row.collect_account_id || '',
    collectAccountNickname: extra.account_nickname || '',
    collectReplies: !!row.collect_replies,
    collectMaxComments: row.collect_max_comments,
    collectIntervalMs: row.collect_interval_ms,

    // ---- 采集状态 ----
    collectStatus: row.collect_status,
    cursor: row.collect_cursor,
    collectTotal: row.collect_total,
    collectInserted: row.collect_inserted,
    collectUpdated: row.collect_updated,
    collectReplyFetched: row.collect_reply_fetched,
    replyProgress,
    collectError: row.collect_error || '',
    startedAt: row.collect_started_at,
    finishedAt: row.collect_finished_at,

    // ---- 统计 ----
    collected: extra.collected ?? 0,
  };
}

/** 取一个可用账户；未指定时自动挑一个 */
function pickAccount(accountId?: string): string {
  if (accountId) return accountId;
  const usable = accountRepo.listUsable().find((a) => a.status === 'active');
  return usable?.account_id ?? '';
}

/** GET /api/videos —— 列表 */
router.get('/', (req, res) => {
  const keyword = String(req.query.keyword ?? '').trim();
  const page = parseInt(String(req.query.page ?? 1), 10) || 1;
  const pageSize = Math.min(parseInt(String(req.query.pageSize ?? 20), 10) || 20, 100);
  const { list, total } = videoRepo.list({ keyword, page, pageSize });
  res.json({ code: 200, message: '成功', data: { list: list.map(toDto), total } });
});

/** GET /api/videos/options —— 下拉用 */
router.get('/options', (_req, res) => {
  res.json({ code: 200, message: '成功', data: videoRepo.listOptions() });
});

/** GET /api/videos/scheduler —— 调度器状态 */
router.get('/scheduler', (_req, res) => {
  res.json({ code: 200, message: '成功', data: scheduler.status() });
});

/** POST /api/videos/resolve —— 只解析，不入库 */
router.post('/resolve', async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'text 必填');
  const r = await resolveAwemeId(text);
  res.json({ code: 200, message: '解析成功', data: r });
});

/** 采集配置（创建素材时可选一并写入） */
export interface CollectConfigBody {
  accountId?: string;
  /** 是否采集二级回复；未传时一律按「不采集」处理 */
  collectReplies?: boolean;
  maxComments?: number | null;
  intervalMs?: number;
}

export interface CreateVideoBody {
  /** 分享文本 / 链接 / aweme_id（单条） */
  raw?: string;
  /** 直接指定 aweme_id */
  awemeId?: string;
  /** 使用哪个账户去补全视频详情，同时也是缺省采集账户 */
  accountId?: string;
  remark?: string;
  /** 采集配置 */
  collect?: CollectConfigBody;
  /** 录入后是否立即开始采集（默认 false） */
  autoCollect?: boolean;
}

/** 归一化采集配置：布尔严格取值，避免字符串 'false' 被当成真 */
function normalizeCollectConfig(src: CollectConfigBody | undefined, fallbackAccount?: string) {
  const cfg = src ?? {};
  const raw = cfg.collectReplies;
  // 只认显式布尔 true，其余（undefined / false / 字符串）一律视为不采集
  const collectReplies = raw === true;
  const maxComments =
    cfg.maxComments === null || cfg.maxComments === undefined || Number(cfg.maxComments) <= 0
      ? null
      : Math.floor(Number(cfg.maxComments));
  const intervalMs =
    cfg.intervalMs === undefined || cfg.intervalMs === null || !Number.isFinite(Number(cfg.intervalMs))
      ? 500
      : Math.max(Number(cfg.intervalMs), 0);
  const accountId = cfg.accountId?.trim() || fallbackAccount || '';
  return { collectReplies, maxComments, intervalMs, accountId };
}

/** 内部：录入一条素材（含详情补全） */
async function createOne(body: CreateVideoBody) {
  const source = body.awemeId?.trim() || body.raw?.trim() || '';
  if (!source) throw new HttpError(400, '请填写视频链接或视频ID');
  const { awemeId, shareUrl } = await resolveAwemeId(source);

  const accountId = pickAccount(body.accountId);
  const meta: VideoMeta = await fetchVideoMeta(accountId, awemeId);

  const row = videoRepo.create({
    awemeId,
    shareUrl,
    title: meta.title,
    coverUrl: meta.coverUrl,
    authorName: meta.authorName,
    authorSecUid: meta.authorSecUid,
    diggCount: meta.diggCount,
    commentCount: meta.commentCount,
    shareCount: meta.shareCount,
    playCount: meta.playCount,
    publishTime: meta.publishTime,
    remark: body.remark ?? '',
  });

  // 写入采集配置
  const cfg = normalizeCollectConfig(body.collect, accountId);
  videoRepo.setCollectOptions(row.id, {
    accountId: cfg.accountId,
    collectReplies: cfg.collectReplies,
    maxComments: cfg.maxComments,
    intervalMs: cfg.intervalMs,
  });

  return videoRepo.findById(row.id)!;
}

/** POST /api/videos —— 录入单条 */
router.post('/', async (req, res) => {
  const body = req.body as CreateVideoBody;
  const row = await createOne(body);
  const started = !!body.autoCollect;
  if (started) scheduler.enqueue(row.id);
  res.json({
    code: 200,
    message: started ? '录入成功，已加入采集队列' : '录入成功',
    data: { video: toDto(videoRepo.findListRow(row.id)!) },
  });
});

/** POST /api/videos/batch —— 多行批量录入 */
router.post('/batch', async (req, res) => {
  const body = req.body as CreateVideoBody & { raws?: string[] };
  const lines = (body.raws ?? [])
    .flatMap((r) => String(r ?? '').split(/\r?\n/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) throw new HttpError(400, '请至少填写一行');

  const success: { awemeId: string; videoId: number; title: string }[] = [];
  const failed: { raw: string; reason: string }[] = [];

  for (const line of lines) {
    try {
      const row = await createOne({ raw: line, accountId: body.accountId, remark: body.remark, collect: body.collect });
      success.push({ awemeId: row.aweme_id, videoId: row.id, title: row.title || '' });
    } catch (e) {
      failed.push({ raw: line, reason: (e as Error).message });
      logger.warn(`批量录入失败 ${line}: ${(e as Error).message}`);
    }
  }

  // 全部录入完成后再统一入队，避免边录入边跑抢占资源
  if (body.autoCollect) {
    for (const s of success) scheduler.enqueue(s.videoId);
  }

  res.json({
    code: 200,
    message: `成功 ${success.length} 条，失败 ${failed.length} 条`,
    data: { success, failed },
  });
});

/* ================= 采集控制 ================= */

/** POST /api/videos/:id/collect —— 保存配置并开始（全新采集） */
router.post('/:id/collect', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = videoRepo.findById(id);
  if (!row) throw new HttpError(404, '素材不存在');
  if (row.collect_status === 'running' || row.collect_status === 'pending') {
    throw new HttpError(400, '该视频正在采集或排队中');
  }

  const body = (req.body ?? {}) as CollectConfigBody;
  const existingAccount = row.collect_account_id || pickAccount();
  const cfg = normalizeCollectConfig(body, existingAccount);
  if (!cfg.accountId) throw new HttpError(400, '请选择采集账户');

  videoRepo.setCollectOptions(id, {
    accountId: cfg.accountId,
    collectReplies: cfg.collectReplies,
    maxComments: cfg.maxComments,
    intervalMs: cfg.intervalMs,
  });
  scheduler.enqueue(id);
  res.json({ code: 200, message: '已开始采集', data: toDto(videoRepo.findListRow(id)!) });
});

/** POST /api/videos/:id/pause */
router.post('/:id/pause', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = videoRepo.findById(id);
  if (!row) throw new HttpError(404, '素材不存在');
  if (!['running', 'pending'].includes(row.collect_status)) throw new HttpError(400, '当前状态不可暂停');
  scheduler.pause(id);
  res.json({ code: 200, message: '已发送暂停请求', data: null });
});

/** POST /api/videos/:id/resume —— 断点继续 */
router.post('/:id/resume', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = videoRepo.findById(id);
  if (!row) throw new HttpError(404, '素材不存在');
  if (row.collect_status !== 'paused') throw new HttpError(400, '只有已暂停的采集可以继续');
  scheduler.resume(id);
  res.json({ code: 200, message: '已继续采集', data: null });
});

/** POST /api/videos/:id/cancel */
router.post('/:id/cancel', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = videoRepo.findById(id);
  if (!row) throw new HttpError(404, '素材不存在');
  if (!['running', 'pending', 'paused'].includes(row.collect_status)) {
    throw new HttpError(400, '当前状态不可取消');
  }
  scheduler.cancel(id);
  res.json({ code: 200, message: '已发送取消请求', data: null });
});

/** GET /api/videos/:id/logs?afterId= */
router.get('/:id/logs', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const afterId = parseInt(String(req.query.afterId ?? 0), 10) || 0;
  if (!videoRepo.findById(id)) throw new HttpError(404, '素材不存在');
  res.json({ code: 200, message: '成功', data: videoRepo.logs(id, afterId) });
});

/* ================= 素材编辑 ================= */

/** PATCH /api/videos/:id —— 编辑素材信息与采集配置 */
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, remark, coverUrl, status, collect } = req.body ?? {};
  if (status && !['active', 'archived'].includes(status)) {
    throw new HttpError(400, 'status 只能是 active / archived');
  }
  const row = videoRepo.update(id, { title, remark, coverUrl, status });
  if (!row) throw new HttpError(404, '素材不存在');

  // 允许在采集参数未运行时调整
  if (collect && typeof collect === 'object') {
    const c = collect as CollectConfigBody;
    const patch: Parameters<typeof videoRepo.setCollectOptions>[1] = {};
    if (c.accountId !== undefined) patch.accountId = c.accountId;
    if (c.collectReplies !== undefined) patch.collectReplies = c.collectReplies === true;
    if (c.maxComments !== undefined) patch.maxComments = c.maxComments ?? null;
    if (c.intervalMs !== undefined) patch.intervalMs = Number(c.intervalMs);
    videoRepo.setCollectOptions(id, patch);
  }

  res.json({ code: 200, message: '已保存', data: toDto(videoRepo.findListRow(id)!) });
});

/** DELETE /api/videos/:id */
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = videoRepo.findById(id);
  if (!row) throw new HttpError(404, '素材不存在');
  if (['running', 'pending'].includes(row.collect_status)) {
    throw new HttpError(400, '正在采集，请先取消后再删除');
  }
  videoRepo.delete(id);
  res.json({ code: 200, message: '已删除', data: null });
});

export default router;
