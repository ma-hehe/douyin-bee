import { logger } from '@/utils/logger';
import { api_fetch, type AwemeDetail } from '@/douyin/api_fetch';

/** 抖音短链域名 */
const SHORT_LINK_RE = /https?:\/\/v\.douyin\.com\/[A-Za-z0-9_-]+\/?/g;
/** 各种形态的完整链接 */
const FULL_LINK_RE =
  /https?:\/\/(?:www\.)?(?:iesdouyin|douyin)\.com\/(?:share\/)?(?:video|note|slides)\/(\d+)/gi;
/** 纯数字 ID */
const PURE_ID_RE = /^\d{15,25}$/;

export interface ResolveResult {
  awemeId: string;
  shareUrl: string;
  /** 解析方式：id / text / redirect */
  via: 'id' | 'text' | 'redirect';
}

/**
 * 从用户粘贴的分享文本里解析出 aweme_id。
 * 支持：
 *   1. 纯数字 ID
 *   2. 含完整链接的分享文本：https://www.douyin.com/video/7xxxxxxxx
 *   3. 含短链的分享文本：https://v.douyin.com/xxxx/（需要跟随跳转）
 */
export async function resolveAwemeId(text: string): Promise<ResolveResult> {
  const raw = (text ?? '').trim();
  if (!raw) throw new Error('内容为空');

  // 1. 纯数字
  if (PURE_ID_RE.test(raw)) {
    return { awemeId: raw, shareUrl: `https://www.douyin.com/video/${raw}`, via: 'id' };
  }

  // 2. 完整链接
  FULL_LINK_RE.lastIndex = 0;
  const full = FULL_LINK_RE.exec(raw);
  if (full?.[1]) {
    return { awemeId: full[1], shareUrl: full[0], via: 'text' };
  }

  // 3. 短链，跟随跳转
  SHORT_LINK_RE.lastIndex = 0;
  const short = SHORT_LINK_RE.exec(raw);
  if (short) {
    const shareUrl = short[0];
    const finalUrl = await followShortLink(shareUrl);
    FULL_LINK_RE.lastIndex = 0;
    const m = FULL_LINK_RE.exec(finalUrl);
    if (m?.[1]) {
      return { awemeId: m[1], shareUrl, via: 'redirect' };
    }
    // 跳转后是直播间/用户主页/图文等，尝试从 URL 中兜底抓长数字
    const fallback = /\/(\d{15,25})(?:[/?#]|$)/.exec(finalUrl);
    if (fallback?.[1]) {
      return { awemeId: fallback[1], shareUrl, via: 'redirect' };
    }
    throw new Error(`无法从跳转结果中解析视频ID：${finalUrl}`);
  }

  throw new Error('未识别到抖音视频链接或视频ID');
}

/** 跟随短链跳转，拿到最终地址（不下载正文） */
async function followShortLink(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',
        },
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).toString();
        continue;
      }
      return current;
    } catch (e) {
      logger.warn(`跟随短链失败 ${current}: ${(e as Error).message}`);
      throw new Error('短链访问失败，请检查网络或直接填写视频ID');
    } finally {
      clearTimeout(timer);
    }
  }
  return current;
}

export interface VideoMeta {
  awemeId: string;
  title: string;
  coverUrl: string;
  authorName: string;
  authorSecUid: string;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  playCount: number;
  publishTime: number | null;
}

/**
 * 拉取视频元信息（标题/封面/作者/计数/发布时间）。
 *
 * 说明：`api_fetch.getAwemeDetail` 由使用者后续实现，当前为占位实现（返回 null）。
 * 本函数在接口未实现、失败或账户无效时都不会抛错，只是返回空字段，不阻塞素材录入。
 */
export async function fetchVideoMeta(accountId: string, awemeId: string): Promise<VideoMeta> {
  const empty: VideoMeta = {
    awemeId,
    title: '',
    coverUrl: '',
    authorName: '',
    authorSecUid: '',
    diggCount: 0,
    commentCount: 0,
    shareCount: 0,
    playCount: 0,
    publishTime: null,
  };
  if (!accountId) return empty;
  try {
    const fn = (api_fetch as unknown as { getAwemeDetail?: (a: string, b: string) => Promise<AwemeDetail | null> })
      .getAwemeDetail;
    if (typeof fn !== 'function') {
      logger.warn('[video] api_fetch.getAwemeDetail 尚未实现，跳过元信息补全');
      return empty;
    }
    const detail = await fn.call(api_fetch, accountId, awemeId);
    if (!detail) return empty;
    return {
      awemeId,
      title: detail.title ?? '',
      coverUrl: detail.coverUrl ?? '',
      authorName: detail.authorName ?? '',
      authorSecUid: detail.authorSecUid ?? '',
      diggCount: detail.diggCount ?? 0,
      commentCount: detail.commentCount ?? 0,
      shareCount: detail.shareCount ?? 0,
      playCount: detail.playCount ?? 0,
      publishTime: detail.publishTime ?? null,
    };
  } catch (e) {
    logger.warn(`[video] 获取视频详情失败 ${awemeId}: ${(e as Error).message}`);
    return empty;
  }
}
