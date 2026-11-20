import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

/** 数字格式化：12345 -> 1.2万 */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '0';
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 10_000) return (n / 10_000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(n);
}

/** 相对时间：3 分钟前 */
export function fromNow(text: string | null | undefined): string {
  if (!text) return '-';
  const d = dayjs(text);
  if (!d.isValid()) return text;
  return d.fromNow();
}

/** 时间文本格式化 */
export function formatTime(text: string | null | undefined, fmt = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!text) return '-';
  const d = dayjs(text);
  return d.isValid() ? d.format(fmt) : text;
}

/** 秒级时间戳 -> 文本 */
export function tsText(ts: number | null | undefined): string {
  if (!ts) return '-';
  return dayjs.unix(ts).format('YYYY-MM-DD HH:mm:ss');
}

/** 采集状态 -> 展示配置 */
export const COLLECT_STATUS: Record<
  string,
  { label: string; type: 'info' | 'primary' | 'success' | 'warning' | 'danger' }
> = {
  idle: { label: '未采集', type: 'info' },
  pending: { label: '排队中', type: 'info' },
  running: { label: '采集中', type: 'primary' },
  paused: { label: '已暂停', type: 'warning' },
  success: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  canceled: { label: '已取消', type: 'info' },
};

/** 安全读取采集状态展示配置 */
export function collectStatus(s: string): { label: string; type: 'info' | 'primary' | 'success' | 'warning' | 'danger' } {
  return COLLECT_STATUS[s] ?? { label: s, type: 'info' };
}

/** 账户状态 -> 展示配置 */
export const ACCOUNT_STATUS: Record<string, { label: string; type: 'info' | 'success' | 'warning' | 'danger' }> = {
  active: { label: '正常', type: 'success' },
  disabled: { label: '已停用', type: 'info' },
  invalid: { label: '登录失效', type: 'danger' },
};

/** 秒数转耗时文本 */
export function durationText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h) return `${h}h${m}m`;
  if (m) return `${m}m${s}s`;
  return `${s}s`;
}
