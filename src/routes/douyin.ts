import { Router } from 'express';
import {  sleep } from '@/utils/kit';
import { logger } from '@/utils/logger';
import { api_fetch, CommentInfo } from '@/douyin/api_fetch';

const router = Router();
router.get('/user/profile', async (req, resp) => {
  const { secUid, accountId } = req.query;
  const record = await api_fetch.getUserInfoBatch(accountId + '', [secUid + '']);
  resp.json({
    code: 0,
    message: '成功',
    data: record,
  });
});

router.get('/comment/list', async (req, resp) => {
  let { accountId, cursor, count = '10', awemeId } = req.query;
  logger.info(`获取评论列表 ${awemeId}`);
  const count1 = parseInt(String(count), 10);
  let cursor1 = parseInt(String(cursor), 10);
  const page = await api_fetch.getCommentList(accountId + '', awemeId + '', {
    cursor: cursor1,
    count: count1,
  });

  return resp.json({
    code: 0,
    message: '成功',
    data: {
      ...page,
    },
  });
});

router.get('/comment/list/reply', async (req, resp) => {
  let { accountId, commentId, cursor = '0', count = '10', awemeId } = req.query;
  logger.info(`获取评论回复列表 ${awemeId}`);
  const page = await api_fetch.getCommentListReply(accountId + '', awemeId + '', commentId + '', {
    cursor: parseInt(cursor + ''),
    count: parseInt(count + ''),
  });

  return resp.json({
    code: 0,
    message: '成功',
    data: {
      ...page,
    },
  });
});

router.get('/comment/all', async (req, resp) => {
  let { accountId, limit = '', awemeId } = req.query;
  logger.info(`获取所有评论列表 ${awemeId}`);
  const total = parseInt(limit == '' ? '100000' : limit + '');
  let cursor = 0;
  let count = 10;
  const all = [] as CommentInfo[];
  let has_more = true;
  while (has_more && all.length < total) {
    const page = await api_fetch.getCommentList(String(accountId), String(awemeId), { cursor, count });
    cursor = page.cursor;
    has_more = page.hasMore;
    all.push(...page.comments);
    await sleep(1000, 3000);
  }

  return resp.json({
    code: 0,
    message: '成功',
    data: all,
  });
});
export default router;
