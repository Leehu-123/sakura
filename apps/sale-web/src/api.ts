let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function setToken(value: string | null) {
  accessToken = value;
}
export async function refreshSession() {
  if (!refreshing)
    refreshing = (async () => {
      try {
        const response = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) {
          accessToken = null;
          return false;
        }
        accessToken = (await response.json()).accessToken;
        return true;
      } catch {
        accessToken = null;
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  return refreshing;
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  retry = true,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method,
      credentials: 'include',
      signal,
      headers: {
        ...(body === undefined || body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Không kết nối được máy chủ. Vui lòng thử lại.');
  }
  signal?.throwIfAborted();
  if (response.status === 401 && retry && !['/auth/login', '/auth/logout'].includes(path)) {
    if (await refreshSession()) return api<T>(path, method, body, false, signal);
    signal?.throwIfAborted();
    window.dispatchEvent(new Event('sakura:expired'));
  }
  const data = await response.json().catch(() => {
    signal?.throwIfAborted();
    if (response.ok) throw new Error('Máy chủ trả về dữ liệu chưa hợp lệ. Vui lòng thử lại.');
    return { message: 'Máy chủ chưa sẵn sàng. Vui lòng thử lại.' };
  });
  signal?.throwIfAborted();
  if (!response.ok)
    throw new ApiError(
      Array.isArray(data.message)
        ? data.message.join(' · ')
        : data.message || 'Thao tác chưa thành công.',
      response.status,
    );
  return data as T;
}
