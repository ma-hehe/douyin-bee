import dayjs from 'dayjs';

/** 统一时间格式：本地时区 `YYYY-MM-DD HH:mm:ss` */
export function nowText(): string {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

/** 秒级时间戳 -> `YYYY-MM-DD HH:mm:ss`（0/空返回空串） */
export function tsToText(ts?: number | null): string {
  if (!ts) return '';
  return dayjs.unix(ts).format('YYYY-MM-DD HH:mm:ss');
}
