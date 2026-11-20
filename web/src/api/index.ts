import { http } from './http';

/* ================= 通用类型 ================= */
export interface PageResult<T> {
  list: T[];
  total: number;
}

export interface SchedulerInfo {
  running: boolean;
  currentVideoId: number | null;
  queue: { videoId: number; status: string }[];
}

/* ================= 账户 ================= */
export interface Account {
  id: number;
  accountId: string;
  nickname: string;
  avatarUrl: string;
  douyinUid: string;
  status: 'active' | 'disabled' | 'invalid';
  lastLogin: string | null;
  lastCheck: string | null;
  createdAt: string;
  updatedAt: string;
}

export const accountApi = {
  list: (params: { page?: number; pageSize?: number } = {}) =>
    http.get<PageResult<Account>>('/api/account/list', params),
  options: () => http.get<{ accountId: string; nickname: string; status: string }[]>('/api/account/options'),
  login: (accountId?: string) => http.get<{ accountId: string }>('/api/account/login', { accountId }),
  loginStatus: (id: string) =>
    http.get<{ status: 'waiting' | 'success' | 'failed'; account: Account | null; message: string }>(
      '/api/account/login/status',
      { id },
    ),
  health: (id: string) => http.get<{ valid: boolean; reason: string }>(`/api/account/${id}/health`),
  setStatus: (id: string, status: 'active' | 'disabled') => http.patch(`/api/account/${id}`, { status }),
  remove: (id: string) => http.del(`/api/account/${id}`),
  open: (id: string) => http.get<{ accountId: string }>('/api/account/open', { accountId: id }),
};

/* ================= 视频素材（含采集状态） ================= */
export type CollectStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'paused'
  | 'success'
  | 'failed'
  | 'canceled';

export interface Video {
  id: number;
  awemeId: string;
  shareUrl: string;
  title: string;
  coverUrl: string;
  authorName: string;
  authorSecUid: string;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  playCount: number;
  publishTime: number | null;
  publishTimeText: string;
  remark: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;

  /* 采集配置 */
  collectAccountId: string;
  collectAccountNickname: string;
  collectReplies: boolean;
  collectMaxComments: number | null;
  collectIntervalMs: number;

  /* 采集状态 */
  collectStatus: CollectStatus;
  cursor: number;
  collectTotal: number;
  collectInserted: number;
  collectUpdated: number;
  collectReplyFetched: number;
  replyProgress: { done: number; pending: number } | null;
  collectError: string;
  startedAt: string | null;
  finishedAt: string | null;

  /* 已入库评论数 */
  collected: number;
}

export interface VideoOption {
  id: number;
  awemeId: string;
  title: string;
  coverUrl: string;
}

export interface CollectConfig {
  /** 是否采集二级回复，缺省为 false */
  collectReplies?: boolean;
  maxComments?: number | null;
  intervalMs?: number;
  accountId?: string;
}

export interface CreateVideoInput {
  raw?: string;
  awemeId?: string;
  accountId?: string;
  remark?: string;
  collect?: CollectConfig;
  /** 录入后立即开始采集 */
  autoCollect?: boolean;
}

export interface VideoLog {
  id: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  createdAt: string;
}

export const videoApi = {
  list: (params: { keyword?: string; page?: number; pageSize?: number } = {}) =>
    http.get<PageResult<Video>>('/api/videos', params),
  options: () => http.get<VideoOption[]>('/api/videos/options'),
  resolve: (text: string) =>
    http.post<{ awemeId: string; shareUrl: string; via: string }>('/api/videos/resolve', { text }),
  create: (input: CreateVideoInput) => http.post<{ video: Video }>('/api/videos', input),
  batch: (input: {
    raws: string[];
    accountId?: string;
    remark?: string;
    collect?: CollectConfig;
    autoCollect?: boolean;
  }) =>
    http.post<{
      success: { awemeId: string; videoId: number; title: string }[];
      failed: { raw: string; reason: string }[];
    }>('/api/videos/batch', input),
  update: (
    id: number,
    patch: { title?: string; remark?: string; coverUrl?: string; status?: string; collect?: CollectConfig },
  ) => http.patch<Video>(`/api/videos/${id}`, patch),
  remove: (id: number) => http.del(`/api/videos/${id}`),

  /* 采集控制 */
  collect: (id: number, cfg: CollectConfig) => http.post<Video>(`/api/videos/${id}/collect`, cfg),
  pause: (id: number) => http.post(`/api/videos/${id}/pause`),
  resume: (id: number) => http.post(`/api/videos/${id}/resume`),
  cancel: (id: number) => http.post(`/api/videos/${id}/cancel`),
  logs: (id: number, afterId = 0) => http.get<VideoLog[]>(`/api/videos/${id}/logs`, { afterId }),
};

/* ================= 评论数据 ================= */
export interface Comment {
  id: number;
  awemeId: string;
  videoId: number | null;
  videoTitle: string;
  commentId: string;
  parentId: string;
  text: string;
  diggCount: number;
  replyCount: number;
  userUid: string;
  userSecUid: string;
  userNickname: string;
  ipLabel: string;
  isHot: boolean;
  createTime: number;
  createTimeText: string;
  fetchedAt: string;
}

export interface CommentQuery {
  videoId?: number;
  keyword?: string;
  from?: string;
  to?: string;
  ipLabel?: string;
  minDigg?: number;
  maxDigg?: number;
  isHot?: boolean;
  replies?: '' | 'only' | 'include';
  sort?: 'time' | 'digg';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export const commentApi = {
  list: (q: CommentQuery) => http.get<PageResult<Comment>>('/api/comments', q as Record<string, unknown>),
  ips: () => http.get<string[]>('/api/comments/ips'),
  replies: (awemeId: string, commentId: string) =>
    http.get<PageResult<Comment>>(`/api/comments/${awemeId}/${commentId}/replies`),
};

/* ================= 统计 ================= */
export interface Overview {
  accounts: number;
  activeAccounts: number;
  videos: number;
  idleVideos: number;
  runningVideos: number;
  pendingVideos: number;
  pausedVideos: number;
  successVideos: number;
  failedVideos: number;
  comments: number;
  replies: number;
  topLevel: number;
  byVideo: { videoId: number; awemeId: string; title: string; coverUrl: string; total: number }[];
  byDay: { date: string; total: number }[];
  byIp: { ipLabel: string; total: number }[];
  scheduler: SchedulerInfo;
}

export const statsApi = {
  overview: () => http.get<Overview>('/api/stats/overview'),
  version: () => http.get<{ version: string }>('/api/stats/version'),
};
