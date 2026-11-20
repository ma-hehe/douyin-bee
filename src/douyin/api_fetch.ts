import { logger } from '@/utils/logger';
import { DEFAULT_UA, loadSession, SessionData } from './session';
import { aBogusSign } from './signature';

const WEB_API_BASE = 'https://www.douyin.com/aweme/v1/web/im';

export interface WebUserInfo {
  account_cert_info: string; //'{"label_style":5,"label_text":"广州服微网络科技有限公司","is_biz_account":1}',
  avatar_signature: string;
  avatar_small: {
    uri: string;
    url_list: string[];
  };
  avatar_thumb: {
    uri: string;
    url_list: string[];
  };
  birthday_hide_level: number;
  commerce_user_level: number;
  custom_verify: string;
  enterprise_verify_reason: string;
  follow_status: number;
  follower_status: number;
  nickname: string;
  sec_uid: string;
  short_id: string;
  signature: string;
  uid: string;
  unique_id: string;
}

async function fetchUserInfoBatch(session: SessionData, secUids: string[]): Promise<WebUserInfo[]> {
  const url = new URL(`${WEB_API_BASE}/user/info/`);
  // 基础 query 参数（与抓包样本一致，不含签名）
  const params: Record<string, string> = {
    device_platform: 'webapp',
    aid: '6383',
    channel: 'channel_pc_web',
    pc_client_type: '1',
    update_version_code: '170400',
    version_code: '170400',
    version_name: '17.4.0',
    cookie_enabled: 'true',
    browser_name: 'Edge',
    browser_version: '156.0.0.0',
    webid: session.webid || '0',
  };
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const body = `sec_user_ids=${encodeURIComponent(JSON.stringify(secUids))}`;

  const headers: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': DEFAULT_UA,
    cookie: session.cookie,
    origin: 'https://www.douyin.com',
    referer: 'https://www.douyin.com/chat?isPopup=1',
    'accept-language': 'zh-CN,zh;q=0.9',
    'sec-ch-ua': '"Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  };

  logger.info(`getUserInfoBatch: 查询 ${secUids.length} 个用户`);
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body,
    });
    if (!res.ok) {
      logger.error(`getUserInfoBatch: HTTP ${res.status}`);
      return [];
    }
    const j = (await res.json()) as {
      status_code?: number;
      data?: Array<WebUserInfo>;
    };
    if (j.status_code !== 0 || !Array.isArray(j.data)) {
      logger.warn(`getUserInfoBatch: status_code=${j.status_code}`);
      return [];
    }
    const results = j.data;
    logger.info(`getUserInfoBatch: 成功获取 ${results.length}/${secUids.length} 个用户信息`);
    return results;
  } catch (e) {
    logger.error(`getUserInfoBatch 异常`, e);
    return [];
  }
}

export interface CommentInfo {
  /** 评论 ID（cid） */
  commentId: string;
  /** 评论内容 */
  text: string;
  /** 视频 ID */
  awemeId: string;
  /** 创建时间（秒级时间戳） */
  createTime: number;
  /** 点赞数 */
  diggCount: number;
  /** 回复数 */
  replyCount: number;
  user: {
    /** 评论者 uid */
    uid: string;
    /** 评论者 sec_uid */
    secUid: string;
    /** 评论者昵称 */
    nickname: string;
  };
  /** 被回复评论 ID（顶级评论为 '0'） */
  replyId: string;
  /** IP 归属地 */
  ipLabel?: string;
  /** 是否热门 */
  isHot?: boolean;
}

/**
 * 视频详情（供素材录入时自动补全元信息使用）
 *
 * ⚠️ 待实现：接口签名已冻结，实现见下方 api_fetch.getAwemeDetail 占位。
 */
export interface AwemeDetail {
  /** 视频ID */
  awemeId: string;
  /** 文案 */
  title: string;
  /** 封面图 URL */
  coverUrl: string;
  /** 作者昵称 */
  authorName: string;
  /** 作者 sec_uid */
  authorSecUid: string;
  /** 点赞数 */
  diggCount: number;
  /** 评论数 */
  commentCount: number;
  /** 分享数 */
  shareCount: number;
  /** 播放数 */
  playCount: number;
  /** 发布时间（秒级时间戳） */
  publishTime: number;
}

export const api_fetch = {
  /**
   * 分页查询视频评论列表
   * @param accountId 账户ID
   * @param awemeId 视频ID
   * @param opts 分页查询参数
   * @returns
   */
  async getCommentList(
    accountId: string,
    awemeId: string,
    opts: { cursor?: number; count?: number } = {},
  ): Promise<{
    comments: CommentInfo[];
    cursor: number;
    hasMore: boolean;
    total: number;
  }> {
    const url = new URL('https://www.douyin.com/aweme/v1/web/comment/list/');
    const session = await loadSession(accountId);
    const msToken = session.ms_token;
    const verifyFp = session.verify_fp;
    const cursor = opts.cursor ?? 0;
    const count = opts.count ?? 10;
    const params: Record<string, string> = {
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      aweme_id: awemeId,
      pc_img_format: 'webp',
      cursor: cursor + '',
      count: count + '',
      item_type: '0',
      insert_ids: '',
      whale_cut_token: '',
      cut_version: '1',
      rcFT: '',
      update_version_code: '170400',
      pc_client_type: '1',
      pc_libra_divert: 'Windows',
      support_h265: '0',
      support_dash: '1',
      cpu_core_num: '12',
      version_code: '170400',
      version_name: '17.4.0',
      cookie_enabled: 'true',
      screen_width: '1400',
      screen_height: '900',
      browser_language: 'zh-CN',
      browser_platform: 'Win32',
      browser_name: 'Edge',
      browser_version: '156.0.0.0',
      browser_online: 'true',
      engine_name: 'Blink',
      engine_version: '156.0.0.0',
      os_name: 'Windows',
      os_version: '10',
      device_memory: '32',
      platform: 'PC',
      downlink: '10',
      effective_type: '4g',
      round_trip_time: '100',
      webid: session.webid || '0',
    };
    if (msToken) params.msToken = msToken;
    if (verifyFp) {
      params.verifyFp = verifyFp;
      params.fp = verifyFp;
    }

    const { aBogus } = aBogusSign(
      {
        url: '/aweme/v1/web/comment/list/',
        params,
        method: 'GET',
        userAgent: DEFAULT_UA,
        body: '',
      },
      session.ms_token,
      session.verify_fp,
    );
    if (aBogus) params.a_bogus = aBogus;

    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'user-agent': DEFAULT_UA,
      cookie: session.cookie,
      origin: 'https://www.douyin.com',
      referer: `https://www.douyin.com/?modal_id=${awemeId}`,
    };
    // if (ticketGuard?.clientData) headers['bd-ticket-guard-client-data'] = ticketGuard.clientData;
    // if (ticketGuard?.reePublicKey) headers['bd-ticket-guard-ree-public-key'] = ticketGuard.reePublicKey;

    logger.info(`getCommentList: awemeId=${awemeId} cursor=${cursor} count=${count}}`);
    try {
      const res = await fetch(url.toString(), { method: 'GET', headers });
      if (!res.ok) {
        logger.error(`getCommentList: HTTP ${res.status}`);
        return { comments: [], cursor, hasMore: false, total: 0 };
      }
      const j = (await res.json()) as {
        status_code?: number;
        comments?: Array<{
          cid?: string;
          text?: string;
          aweme_id?: string | number;
          create_time?: number;
          digg_count?: number;
          reply_comment_total?: number;
          reply_id?: string;
          user?: {
            uid?: string;
            sec_uid?: string;
            nickname?: string;
          };
          ip_label?: string;
          is_hot?: boolean;
        }>;
        cursor?: number;
        has_more?: number;
        total?: number;
      };
      if (j.status_code !== 0 || !Array.isArray(j.comments)) {
        logger.warn(`getCommentList: status_code=${j.status_code}`);
        return { comments: [], cursor, hasMore: false, total: j.total ?? 0 };
      }
      const comments: CommentInfo[] = [];
      for (const c of j.comments) {
        if (!c.cid) continue;
        comments.push({
          commentId: c.cid,
          text: c.text || '',
          awemeId: String(c.aweme_id || awemeId),
          createTime: c.create_time || 0,
          diggCount: c.digg_count ?? 0,
          replyCount: c.reply_comment_total ?? 0,
          user: {
            uid: c.user?.uid || '',
            secUid: c.user?.sec_uid || '',
            nickname: c.user?.nickname || '',
          },
          replyId: c.reply_id || '0',
          ipLabel: c.ip_label,
          isHot: c.is_hot,
        });
      }
      logger.info(`getCommentList: 获取 ${comments.length} 条评论 total=${j.total ?? 0} hasMore=${j.has_more === 1}`);
      return {
        comments,
        cursor: j.cursor ?? cursor + count,
        hasMore: j.has_more === 1,
        total: j.total ?? 0,
      };
    } catch (e) {
      logger.error(`getCommentList 异常`, e);
      return { comments: [], cursor, hasMore: false, total: 0 };
    }
  },

  /**
   * 获取视频评论的回复评论列表
   * @param accountId 账户ID
   * @param awemeId 视频ID
   * @param commentId 评论ID
   * @param opts 分页查询参数
   * @returns
   */
  async getCommentListReply(
    accountId: string,
    awemeId: string,
    commentId: string,
    opts: { cursor?: number; count?: number } = { cursor: 0, count: 10 },
  ): Promise<{
    comments: CommentInfo[];
    cursor: number;
    hasMore: boolean;
    total: number;
  }> {
    const url = new URL('https://www.douyin.com/aweme/v1/web/comment/list/reply');
    const session = await loadSession(accountId);
    const msToken = session.ms_token;
    const verifyFp = session.verify_fp;
    const cursor = opts.cursor ?? 0;
    const count = opts.count ?? 10;
    const params: Record<string, string> = {
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      item_id: awemeId,
      comment_id: commentId,
      pc_img_format: 'webp',
      whale_cut_token: '',
      cut_version: '1',
      cursor: cursor + '',
      count: count + '',
      item_type: '0',
      update_version_code: '170400',
      pc_client_type: '1',
      pc_libra_divert: 'Windows',
      support_h265: '0',
      support_dash: '1',
      cpu_core_num: '12',
      version_code: '170400',
      version_name: '17.4.0',
      cookie_enabled: 'true',
      screen_width: '1400',
      screen_height: '900',
      browser_language: 'zh-CN',
      browser_platform: 'Win32',
      browser_name: 'Edge',
      browser_version: '156.0.0.0',
      browser_online: 'true',
      engine_name: 'Blink',
      engine_version: '156.0.0.0',
      os_name: 'Windows',
      os_version: '10',
      device_memory: '32',
      platform: 'PC',
      downlink: '10',
      effective_type: '4g',
      round_trip_time: '100',
      webid: session.webid || '0',
    };
    if (msToken) params.msToken = msToken;
    if (verifyFp) {
      params.verifyFp = verifyFp;
      params.fp = verifyFp;
    }

    const { aBogus } = aBogusSign(
      {
        url: '/aweme/v1/web/comment/list/reply',
        params,
        method: 'GET',
        userAgent: DEFAULT_UA,
        body: '',
      },
      session.ms_token,
      session.verify_fp,
    );
    if (aBogus) params.a_bogus = aBogus;

    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'user-agent': DEFAULT_UA,
      cookie: session.cookie,
      origin: 'https://www.douyin.com',
      referer: `https://www.douyin.com/?modal_id=${awemeId}`,
    };
    // if (ticketGuard?.clientData) headers['bd-ticket-guard-client-data'] = ticketGuard.clientData;
    // if (ticketGuard?.reePublicKey) headers['bd-ticket-guard-ree-public-key'] = ticketGuard.reePublicKey;

    logger.info(`getCommentList: awemeId=${awemeId} cursor=${cursor} count=${count}}`);
    try {
      const res = await fetch(url.toString(), { method: 'GET', headers });
      if (!res.ok) {
        logger.error(`getCommentList: HTTP ${res.status}`);
        return { comments: [], cursor, hasMore: false, total: 0 };
      }
      const j = (await res.json()) as {
        status_code?: number;
        comments?: Array<{
          cid?: string;
          text?: string;
          aweme_id?: string | number;
          create_time?: number;
          digg_count?: number;
          reply_comment_total?: number;
          reply_id?: string;
          user?: {
            uid?: string;
            sec_uid?: string;
            nickname?: string;
          };
          ip_label?: string;
          is_hot?: boolean;
        }>;
        cursor?: number;
        has_more?: number;
        total?: number;
      };
      if (j.status_code !== 0 || !Array.isArray(j.comments)) {
        logger.warn(`getCommentList: status_code=${j.status_code}`);
        return { comments: [], cursor, hasMore: false, total: j.total ?? 0 };
      }
      const comments: CommentInfo[] = [];
      for (const c of j.comments) {
        if (!c.cid) continue;
        comments.push({
          commentId: c.cid,
          text: c.text || '',
          awemeId: String(c.aweme_id || awemeId),
          createTime: c.create_time || 0,
          diggCount: c.digg_count ?? 0,
          replyCount: c.reply_comment_total ?? 0,
          user: {
            uid: c.user?.uid || '',
            secUid: c.user?.sec_uid || '',
            nickname: c.user?.nickname || '',
          },
          replyId: c.reply_id || '0',
          ipLabel: c.ip_label,
          isHot: c.is_hot,
        });
      }
      logger.info(`getCommentList: 获取 ${comments.length} 条评论 total=${j.total ?? 0} hasMore=${j.has_more === 1}`);
      return {
        comments,
        cursor: j.cursor ?? cursor + count,
        hasMore: j.has_more === 1,
        total: j.total ?? 0,
      };
    } catch (e) {
      logger.error(`getCommentList 异常`, e);
      return { comments: [], cursor, hasMore: false, total: 0 };
    }
  },
  /**
   * 根据sec_uid获取抖音账户信息
   * @param accountId 账户ID
   * @param secUids 抖音账户的sec_uid列表
   * @returns
   */
  async getUserInfoBatch(accountId: string, secUids: string[]): Promise<WebUserInfo[]> {
    const unique = Array.from(new Set(secUids.filter((s) => s && s.length > 0)));
    if (unique.length === 0) return [];

    const session = await loadSession(accountId);
    const results: WebUserInfo[] = [];
    const batchSize = 50;
    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const batchResults = await fetchUserInfoBatch(session, batch);
      results.push(...batchResults);
    }
    return results;
  },

  /**
   * 根据 aweme_id 获取视频详情（标题/封面/作者/计数/发布时间）
   *
   * TODO(待实现)：调用 `/aweme/v1/web/aweme/detail/` 接口，参数 `aweme_id`，
   * 返回体取 `aweme_detail` 字段：
   *   desc                        -> title
   *   video.cover.url_list[0]     -> coverUrl
   *   author.nickname             -> authorName
   *   author.sec_uid              -> authorSecUid
   *   statistics.digg_count       -> diggCount
   *   statistics.comment_count    -> commentCount
   *   statistics.share_count      -> shareCount
   *   statistics.play_count       -> playCount
   *   create_time                 -> publishTime
   * 签名方式与 getCommentList 一致（aBogusSign）。
   * 失败时返回 null，不抛异常。
   */
  async getAwemeDetail(_accountId: string, _awemeId: string): Promise<AwemeDetail | null> {
    logger.warn('getAwemeDetail: 尚未实现，返回 null');
    return null;
  },
};
