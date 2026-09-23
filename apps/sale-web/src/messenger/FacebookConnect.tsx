import { useEffect, useState } from 'react';
import { api } from '../api';
import { State, useResource } from '../sales/shared';
import { useLiveResource } from './useLiveResource';
import { date } from '../sales/types';

type Start = { id: string; authorizationUrl: string; expiresAt: string };
type Status = {
  status: string;
  message: string;
  expiresAt: string;
  pages: { pageId: string; name: string; canMessage: boolean; existing: boolean }[];
};
function Attempt({
  attempt,
  close,
  done,
}: {
  attempt: Start;
  close: () => void;
  done: (count: number) => void;
}) {
  const [phase, setPhase] = useState('WAITING'),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const r = useLiveResource<Status>('/messenger/oauth/attempts/' + attempt.id, 0, {
    enabled: !busy && ['WAITING', 'PROCESSING'].includes(phase),
  });
  useEffect(() => {
    if (r.data) setPhase(r.data.status);
  }, [r.data?.status]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ saved: number }>(
        '/messenger/oauth/attempts/' + attempt.id + '/confirm',
        'POST',
        { pageIds: selected, connectNow: true },
      );
      done(result.saved);
    } catch (e) {
      setError((e as Error).message);
      setPhase('FAILED');
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      await api('/messenger/oauth/attempts/' + attempt.id + '/cancel', 'POST');
    } finally {
      setBusy(false);
      close();
    }
  }
  return (
    <div className="facebook-attempt">
      <State loading={r.loading} error={r.error || error} />
      {phase === 'WAITING' && (
        <>
          <a
            className="facebook-login-link"
            href={attempt.authorizationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Đăng nhập Facebook
          </a>
          <p>
            Đăng nhập trên trang Facebook và chọn các Fanpage cho phép Sakura sử dụng, sau đó quay
            lại thẻ này. Không nhập mật khẩu Facebook vào Sakura.
          </p>
        </>
      )}
      {phase === 'PROCESSING' && <p role="status">Đang lấy danh sách Fanpage được cấp quyền…</p>}
      {phase === 'READY' && (
        <>
          <h4>Chọn Fanpage để nhận và trả lời tin nhắn</h4>
          <fieldset disabled={busy} className="facebook-page-choices">
            <legend>Fanpage được Facebook trả về</legend>
            {r.data?.pages.map((p) => (
              <label className="check" key={p.pageId}>
                <input
                  type="checkbox"
                  disabled={!p.canMessage}
                  checked={selected.includes(p.pageId)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, p.pageId]
                        : selected.filter((id) => id !== p.pageId),
                    )
                  }
                />
                <span>
                  <strong>{p.name}</strong>
                  <small className="block">
                    {p.pageId} · {p.existing ? 'Đã có trong Sakura' : 'Fanpage mới'}
                    {!p.canMessage ? ' · Chưa được cấp quyền nhắn tin' : ''}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          {!r.data?.pages.length && (
            <p>
              Facebook chưa trả về Fanpage nào. Kiểm tra tài khoản quản lý Page và quyền đã cấp, rồi
              đăng nhập lại.
            </p>
          )}
          <p>
            Sakura tự lấy và bảo vệ mã kết nối, kiểm tra quyền, đăng ký nhận tin và cho phép nhân
            viên trả lời trên các Page bạn chọn. Hội thoại cũ được giữ nguyên; không có tin nhắn nào
            tự gửi cho khách.
          </p>
          <button
            disabled={busy || !selected.length || selected.length > 50}
            onClick={() => void save()}
          >
            {busy
              ? 'Đang kết nối và bật nhận / trả lời…'
              : 'Kết nối ' + selected.length + ' Fanpage đã chọn'}
          </button>
        </>
      )}
      {['FAILED', 'CANCELLED'].includes(phase) && (
        <p role="status">
          {r.data?.message || 'Phiên kết nối chưa hoàn tất. Bắt đầu lại để thử lại.'}
        </p>
      )}
      <p className="muted">
        Phiên có hiệu lực đến {date(attempt.expiresAt)}. Cần đăng nhập lại nếu tải lại toàn bộ trang
        hoặc phiên hết hạn.
      </p>
      <button className="secondary" disabled={busy} onClick={() => void cancel().catch(() => {})}>
        {['FAILED', 'CANCELLED'].includes(phase) ? 'Đóng để kết nối lại' : 'Hủy phiên kết nối'}
      </button>
    </div>
  );
}
export function FacebookConnect({
  revision,
  changed,
}: {
  revision: number;
  changed: (count: number) => void;
}) {
  const r = useResource<{
    ready: boolean;
    automaticReady: boolean;
    setupMessage: string | null;
    reasons: string[];
    redirectUri: string;
  }>('/messenger/oauth/info', revision);
  const [attempt, setAttempt] = useState<Start | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function start() {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await api<Start>('/messenger/oauth/start', 'POST');
      setAttempt(next);
      if (popup) popup.location.replace(next.authorizationUrl);
    } catch (e) {
      popup?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="facebook-connect">
      <h3>1. Chọn Fanpage bằng Facebook</h3>
      <p>
        Quản trị viên dùng Facebook có quyền quản lý Fanpage để cấp quyền kết nối. Nhân viên trả lời
        khách bằng tài khoản Sakura riêng; tên người gửi vẫn được ghi dưới mỗi tin nhắn.
      </p>
      <State loading={r.loading} error={r.error || error} />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {r.data?.reasons.map((reason) => (
        <p className="muted" key={reason}>
          {reason}
        </p>
      ))}
      {r.data?.setupMessage && <p className="note">{r.data.setupMessage}</p>}
      {!attempt && (
        <button disabled={busy || !r.data?.automaticReady} onClick={() => void start()}>
          {busy ? 'Đang chuẩn bị…' : 'Kết nối bằng Facebook'}
        </button>
      )}
      {attempt && (
        <Attempt
          key={attempt.id}
          attempt={attempt}
          close={() => setAttempt(null)}
          done={(count) => {
            setAttempt(null);
            setNotice(
              'Đã kết nối ' +
                count +
                ' Fanpage và bật nhận / trả lời. Mở Hội thoại hoặc thử nhận tin bên dưới.',
            );
            changed(count);
          }}
        />
      )}
      <details>
        <summary>Thông tin thiết lập cho quản trị hệ thống</summary>
        <p>
          Thiết lập ứng dụng Meta một lần, bật Facebook Login for Business và tạo cấu hình dùng User
          Access Token. Điền mã cấu hình trong phần Thiết lập Meta bên dưới.
        </p>
        <p>Địa chỉ chuyển về Sakura (Valid OAuth Redirect URI):</p>
        <code className="oauth-redirect">{r.data?.redirectUri}</code>
        <button
          className="text-button"
          disabled={!r.data?.redirectUri}
          onClick={() =>
            void navigator.clipboard
              .writeText(r.data!.redirectUri)
              .then(() => setNotice('Đã sao chép địa chỉ chuyển về Sakura.'))
              .catch(() => setError('Không sao chép được. Vui lòng chọn địa chỉ và sao chép.'))
          }
        >
          Sao chép địa chỉ
        </button>
        <p>
          Cấu hình quyền: pages_show_list, pages_read_engagement, pages_manage_metadata,
          pages_messaging. Quyền phải được Meta cấp phù hợp với ứng dụng; nút đăng nhập không thay
          thế bước thiết lập/xét duyệt Meta.
        </p>
      </details>
    </section>
  );
}
