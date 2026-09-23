import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { startPolling, type PollEnvironment } from './livePolling';

const environment: PollEnvironment = {
  available: () => document.visibilityState === 'visible' && navigator.onLine,
  schedule: (run, delay) => window.setTimeout(run, delay),
  cancel: (timer) => window.clearTimeout(timer as number),
  subscribe: (wake) => {
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
      window.removeEventListener('focus', wake);
    };
  },
};

export function useLiveResource<T>(
  path: string,
  revision = 0,
  options: {
    enabled?: boolean;
    interval?: number;
    merge?: (next: T, previous: T | null) => T;
  } = {},
) {
  const { enabled = true, interval = 5000 } = options;
  const merge = useRef(options.merge);
  merge.current = options.merge;
  const cache = useRef<{ path: string; revision: number; data: T | null }>({
    path,
    revision,
    data: null,
  });
  const [state, setState] = useState({
    path,
    data: null as T | null,
    loading: true,
    error: '',
    paused: false,
    updatedAt: 0,
  });
  useEffect(() => {
    const samePath = cache.current.path === path;
    let force = !samePath || cache.current.revision !== revision;
    cache.current = { path, revision, data: samePath ? cache.current.data : null };
    setState((s) => ({
      ...s,
      path,
      data: cache.current.data,
      loading: enabled && !cache.current.data,
      error: '',
      paused: !enabled,
    }));
    if (!enabled) return;
    return startPolling({
      environment,
      interval,
      load: (signal) =>
        api<T>(path, 'GET', undefined, true, AbortSignal.any([signal, AbortSignal.timeout(20000)])),
      paused: (paused) => setState((s) => ({ ...s, paused })),
      success: (value) => {
        const data = merge.current
          ? merge.current(value, force ? null : cache.current.data)
          : value;
        force = false;
        cache.current.data = data;
        setState({ path, data, loading: false, error: '', paused: false, updatedAt: Date.now() });
      },
      failure: (error) => {
        const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
        if (denied) cache.current.data = null;
        setState((s) => ({
          ...s,
          data: denied ? null : s.data,
          loading: false,
          error:
            (error as Error).name === 'TimeoutError'
              ? 'Máy chủ phản hồi chậm. Sakura sẽ tự thử lại.'
              : (error as Error).message,
        }));
        return denied;
      },
    });
  }, [path, revision, enabled, interval]);
  return state.path === path ? state : { ...state, data: null, error: '', loading: true };
}

export function LiveStatus({
  resource,
}: {
  resource: { error: string; paused: boolean; updatedAt: number };
}) {
  return (
    <small
      className={'live-status' + (resource.error ? ' stale' : '')}
      role="status"
      title={
        resource.updatedAt
          ? 'Cập nhật gần nhất: ' + new Date(resource.updatedAt).toLocaleTimeString('vi-VN')
          : undefined
      }
    >
      {resource.error
        ? 'Chưa cập nhật được. Kiểm tra kết nối hoặc bấm Làm mới.'
        : resource.paused
          ? 'Tạm dừng tự cập nhật.'
          : resource.updatedAt
            ? 'Đang tự cập nhật'
            : 'Đang kết nối…'}
    </small>
  );
}
