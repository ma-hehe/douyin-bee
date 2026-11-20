import { Router } from 'express';
import ExcelJS from 'exceljs';
import { HttpError } from './error';
import { commentRepo, type CommentFilters } from '@/db/comment';
import { videoRepo } from '@/db/video';
import { tsToText } from '@/utils/time';
import { logger } from '@/utils/logger';

const router = Router();

function parseIntOr(v: unknown, def: number | undefined): number | undefined {
  if (v === undefined || v === null || v === '') return def;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? def : n;
}

/** 从 query/body 解析筛选条件 */
function parseFilters(src: Record<string, unknown>): CommentFilters {
  const repliesRaw = String(src.replies ?? '');
  const replies: CommentFilters['replies'] =
    repliesRaw === 'only' || repliesRaw === 'include' ? repliesRaw : '';
  return {
    videoId: parseIntOr(src.videoId, undefined),
    awemeId: src.awemeId ? String(src.awemeId) : undefined,
    keyword: src.keyword ? String(src.keyword).trim() : undefined,
    from: src.from ? String(src.from) : undefined,
    to: src.to ? String(src.to) : undefined,
    ipLabel: src.ipLabel ? String(src.ipLabel) : undefined,
    minDigg: parseIntOr(src.minDigg, undefined),
    maxDigg: parseIntOr(src.maxDigg, undefined),
    isHot: src.isHot === true || src.isHot === 'true' || src.isHot === '1',
    replies,
    sort: src.sort === 'digg' ? 'digg' : 'time',
    order: src.order === 'asc' ? 'asc' : 'desc',
    page: parseIntOr(src.page, 1),
    pageSize: parseIntOr(src.pageSize, 20),
  };
}

function toCommentDto(r: Record<string, unknown>) {
  return {
    id: r.id,
    awemeId: r.aweme_id,
    videoId: r.video_id ?? null,
    videoTitle: r.video_title ?? '',
    commentId: r.comment_id,
    parentId: r.parent_id,
    text: r.text,
    diggCount: r.digg_count,
    replyCount: r.reply_count,
    userUid: r.user_uid,
    userSecUid: r.user_sec_uid,
    userNickname: r.user_nickname,
    ipLabel: r.ip_label,
    isHot: !!r.is_hot,
    createTime: r.create_time,
    createTimeText: tsToText(r.create_time as number),
    fetchedAt: r.fetched_at,
  };
}

/** GET /api/comments —— 分页查询 */
router.get('/', (req, res) => {
  const f = parseFilters(req.query as Record<string, unknown>);
  const { list, total } = commentRepo.query(f);
  res.json({ code: 200, message: '成功', data: { list: list.map(toCommentDto), total } });
});

/** GET /api/comments/ips —— 归属地选项 */
router.get('/ips', (_req, res) => {
  res.json({ code: 200, message: '成功', data: commentRepo.statsByIp(40).map((r) => r.ipLabel) });
});

/** GET /api/comments/:awemeId/:commentId/replies */
router.get('/:awemeId/:commentId/replies', (req, res) => {
  const { awemeId, commentId } = req.params;
  const { list, total } = commentRepo.repliesOf(awemeId, commentId);
  res.json({ code: 200, message: '成功', data: { list: list.map(toCommentDto), total } });
});

const COLUMNS = [
  { key: 'seq', header: '序号', width: 8 },
  { key: 'videoTitle', header: '视频标题', width: 32 },
  { key: 'awemeId', header: '视频ID', width: 22 },
  { key: 'nickname', header: '评论者昵称', width: 18 },
  { key: 'text', header: '评论内容', width: 50 },
  { key: 'digg', header: '点赞数', width: 10 },
  { key: 'reply', header: '回复数', width: 10 },
  { key: 'ip', header: 'IP归属地', width: 12 },
  { key: 'hot', header: '是否热门', width: 10 },
  { key: 'time', header: '评论时间', width: 20 },
  { key: 'level', header: '层级', width: 10 },
  { key: 'parentId', header: '所属一级评论ID', width: 22 },
  { key: 'commentId', header: '评论ID', width: 22 },
  { key: 'userId', header: '评论者UID', width: 20 },
  { key: 'secUid', header: '评论者sec_uid', width: 24 },
  { key: 'fetchedAt', header: '采集时间', width: 20 },
] as const;

/**
 * POST /api/comments/export
 * body: { scope: 'video'|'all', videoId?, replies?, ...其余筛选 }
 * 返回 xlsx 二进制流。
 */
router.post('/export', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const scope = body.scope === 'all' ? 'all' : 'video';
    const videoId = parseIntOr(body.videoId, undefined);
    const repliesRaw = String(body.replies ?? '');
    const replies: CommentFilters['replies'] =
      repliesRaw === 'include' || repliesRaw === 'only' ? repliesRaw : '';

    if (scope === 'video' && !videoId) {
      throw new HttpError(400, '指定视频导出时必须选择视频');
    }
    const filters = parseFilters({
      ...body,
      videoId: scope === 'video' ? videoId : undefined,
      replies,
    });

    const { total } = commentRepo.query({ ...filters, page: 1, pageSize: 1 });
    if (total === 0) throw new HttpError(400, '当前筛选条件下没有可导出的评论');

    const video = videoId ? videoRepo.findById(videoId) : undefined;
    const scopeText = scope === 'video' ? video?.title || video?.aweme_id || '指定视频' : '全部视频';
    const fileName = `抖音评论_${scopeText}_${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '')}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="comments.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );

    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    const ws = wb.addWorksheet('评论数据', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;
    for (let i = 1; i <= COLUMNS.length; i++) {
      headerRow.getCell(i).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6366F1' },
      };
    }
    headerRow.commit();

    let seq = 0;
    for (const batch of commentRepo.iterate(filters, 2000)) {
      for (const r of batch) {
        seq++;
        const parentId = String(r.parent_id ?? '0');
        const row = ws.addRow({
          seq,
          videoTitle: r.video_title ?? '',
          awemeId: r.aweme_id ?? '',
          nickname: r.user_nickname ?? '',
          text: r.text ?? '',
          digg: Number(r.digg_count ?? 0),
          reply: Number(r.reply_count ?? 0),
          ip: r.ip_label ?? '',
          hot: r.is_hot ? '是' : '否',
          time: tsToText(Number(r.create_time ?? 0)),
          level: parentId === '0' ? '一级评论' : '回复',
          parentId: parentId === '0' ? '' : parentId,
          commentId: r.comment_id ?? '',
          userId: r.user_uid ?? '',
          secUid: r.user_sec_uid ?? '',
          fetchedAt: r.fetched_at ?? '',
        });
        row.commit();
      }
    }

    const summary = wb.addWorksheet('导出说明');
    summary.columns = [
      { header: '项目', key: 'k', width: 20 },
      { header: '内容', key: 'v', width: 60 },
    ];
    summary.addRow({ k: '导出范围', v: scopeText });
    summary.addRow({ k: '包含回复', v: replies === 'include' ? '是' : '否' });
    summary.addRow({ k: '总条数', v: total });
    summary.addRow({ k: '导出时间', v: new Date().toLocaleString('zh-CN') });
    summary.commit();

    await wb.commit();
    logger.info(`[export] 导出 ${total} 条评论 scope=${scope}`);
  } catch (e) {
    if (res.headersSent) {
      logger.error('[export] 导出中断', e);
      res.end();
      return;
    }
    next(e);
  }
});

export default router;
