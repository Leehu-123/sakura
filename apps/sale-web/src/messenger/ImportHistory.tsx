import { useEffect, useRef, useState } from 'react';
import { Download, Pause } from 'lucide-react';
import { api } from '../api';
import { State, useResource } from '../sales/shared';
type Progress = {
  complete: boolean;
  importedMessages: number;
  conversations: number;
  updatedAt: string | null;
};
export function ImportHistory({ pageId, ready }: { pageId: string; ready: boolean }) {
  const path = '/messenger/pages/' + pageId + '/history-import';
  const status = useResource<Progress>(path, 0),
    [progress, setProgress] = useState<Progress | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const alive = useRef(true),
    stop = useRef(false),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
    };
  }, []);
  const d = progress || status.data;
  async function run() {
    if (working.current) return;
    working.current = true;
    stop.current = false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (let step = 0; step < 20 && !stop.current; step++) {
        const next = await api<Progress>(
          path,
          'POST',
          { restart: step === 0 && !!d?.complete },
          true,
          AbortSignal.timeout(60000),
        );
        if (!alive.current) return;
        setProgress(next);
        if (next.complete) {
          setNotice('Đã tải hết phần lịch sử Meta trả về ở lần quét này.');
          return;
        }
        if (step < 19 && !stop.current) await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (alive.current) setNotice('Đã lưu tiến độ. Bấm Tải tiếp để lấy các tin cũ hơn.');
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <details className="history-import">
      <summary>Tải lịch sử từ Facebook</summary>
      <p className="muted">
        Lấy lại tin nhận và tin đã gửi mà Meta còn cho phép đọc. Tin trùng được bỏ qua; tin cũ không
        phát âm báo. Tệp cũ hiện lưu dấu hiệu đính kèm, chưa tải lại nội dung ảnh/tệp. Không tự xác
        định người trả lời trước đây.
      </p>
      <State loading={status.loading} error={error || status.error} />
      {d && (
        <p>
          Đã thêm {d.importedMessages} tin · đã quét xong {d.conversations} hội thoại
          {d.updatedAt ? ' · cập nhật ' + new Date(d.updatedAt).toLocaleString('vi-VN') : ''}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="sales-actions">
        <button
          className="secondary"
          disabled={!ready || busy || status.loading}
          onClick={() => void run()}
        >
          <Download size={16} />
          {busy
            ? 'Đang tải…'
            : d?.complete
              ? 'Quét lại tin lịch sử'
              : d?.updatedAt
                ? 'Tải tiếp'
                : 'Tải lịch sử'}
        </button>
        {busy && (
          <button
            className="text-button"
            onClick={() => {
              stop.current = true;
              setNotice('Sẽ dừng sau đợt đang tải.');
            }}
          >
            <Pause size={15} />
            Tạm dừng
          </button>
        )}
      </div>
      <small className="muted">
        Mỗi lượt tối đa 20 đợt để giữ app hoạt động ổn định; có thể đóng trang và tải tiếp sau. Giữ
        quyền đọc lịch sử của Fanpage trên Meta.
      </small>
    </details>
  );
}
