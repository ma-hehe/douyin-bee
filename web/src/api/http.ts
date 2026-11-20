/**
 * 统一 API 封装
 * 后端统一返回 { code: 200, message, data }，非 200 时抛出 Error(message)
 */
export interface ApiResp<T> {
  code: number;
  message: string;
  data: T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public raw?: unknown,
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string; error?: string };
    return j.message || j.error || `请求失败（HTTP ${res.status}）`;
  } catch {
    return `请求失败（HTTP ${res.status}）`;
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    // 201/其他 2xx 之外的都算失败
    throw new ApiError(await parseError(res), res.status);
  }
  const j = (await res.json()) as ApiResp<T>;
  if (j.code !== 200) throw new ApiError(j.message || '请求失败', res.status, j);
  return j.data;
}

export const http = {
  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const qs = params ? toQuery(params) : '';
    return request<T>(url + qs);
  },
  post<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) });
  },
  patch<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  },
  del<T>(url: string): Promise<T> {
    return request<T>(url, { method: 'DELETE' });
  },
};

export function toQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** 从 Content-Disposition 解析文件名 */
function filenameFromHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fallthrough */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] || fallback;
}

/** 下载文件（POST 带 body，用于导出） */
export async function downloadFile(url: string, body: unknown, fallbackName: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }
  const name = filenameFromHeader(res.headers.get('content-disposition'), fallbackName);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return name;
}
