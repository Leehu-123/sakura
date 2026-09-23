import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { api, ApiError } from '../api';
import { startPolling } from './livePolling';
import { newInbound, notificationCursor, NotificationSnapshot } from './notificationState';
export function NotificationSound({ userId }: { userId: string }) {
  const key = 'sakura.chat.sound.' + userId;
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'off';
    } catch {
      return true;
    }
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<NotificationSnapshot | null>(null);
  async function unlock() {
    try {
      if (!audio.current) audio.current = new AudioContext();
      await audio.current.resume();
      setReady(audio.current.state === 'running');
    } catch {
      setReady(false);
    }
  }
  function chime() {
    const ctx = audio.current;
    if (!ctx || ctx.state !== 'running') {
      setReady(false);
      return;
    }
    [660, 880].forEach((frequency, i) => {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain(),
        at = ctx.currentTime + i * 0.15;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.22);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }
  useEffect(() => {
    if (!enabled) return;
    const wake = () => {
      void unlock();
    };
    document.addEventListener('pointerdown', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
    return () => {
      document.removeEventListener('pointerdown', wake);
      document.removeEventListener('keydown', wake);
    };
  }, [enabled]);
  useEffect(
    () => () => {
      void audio.current?.close();
      audio.current = null;
    },
    [],
  );
  useEffect(() => {
    previous.current = null;
    if (!enabled || !ready) return;
    let alive = true;
    const stop = startPolling<NotificationSnapshot>({
      interval: 5000,
      environment: {
        available: () => navigator.onLine,
        schedule: (fn, ms) => window.setTimeout(fn, ms),
        cancel: (id) => window.clearTimeout(id as number),
        subscribe: (wake) => {
          window.addEventListener('online', wake);
          window.addEventListener('offline', wake);
          return () => {
            window.removeEventListener('online', wake);
            window.removeEventListener('offline', wake);
          };
        },
      },
      load: (signal) =>
        api(
          '/messenger/notifications',
          'GET',
          undefined,
          true,
          AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        ),
      paused: () => {},
      failure: (e) => {
        setError('Âm báo đang mất kết nối');
        return e instanceof ApiError && [401, 403].includes(e.status);
      },
      success: (next) => {
        setError('');
        const ring = newInbound(previous.current, next);
        previous.current = notificationCursor(previous.current, next);
        if (!ring) return;
        const play = () => {
          if (!alive) return;
          try {
            const k = key + '.last',
              last = localStorage.getItem(k);
            if (last === next.latest?.id) return;
            localStorage.setItem(k, next.latest!.id);
          } catch {
            /* Audio still works if browser storage is disabled. */
          }
          chime();
        };
        if (navigator.locks) void navigator.locks.request(key, play);
        else play();
      },
    });
    return () => {
      alive = false;
      stop();
    };
  }, [enabled, ready, userId]);
  const label = error || (!enabled ? 'Âm báo tắt' : ready ? 'Âm báo bật' : 'Bật âm báo');
  return (
    <button
      className="sound-toggle"
      aria-label={label}
      aria-pressed={enabled && ready}
      title="Báo tin nhắn mới trong các hội thoại bạn được xem. Cần giữ Sakura mở; trình duyệt có thể trì hoãn âm khi chạy nền."
      onClick={async () => {
        if (enabled && ready) {
          setEnabled(false);
          try {
            localStorage.setItem(key, 'off');
          } catch {}
          return;
        }
        setEnabled(true);
        try {
          localStorage.setItem(key, 'on');
        } catch {}
        await unlock();
        chime();
      }}
    >
      {enabled && ready ? <Volume2 size={17} /> : <VolumeX size={17} />}
      <span>{label}</span>
    </button>
  );
}
