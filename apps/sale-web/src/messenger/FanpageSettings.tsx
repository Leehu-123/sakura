import { useState } from 'react';
import { ImportHistory } from './ImportHistory';
import { api } from '../api';
import { Modal, State, useResource } from '../sales/shared';
import { date } from '../sales/types';
import { FacebookConnect } from './FacebookConnect';
import { ConnectionTest, DeliveryDiagnostics } from './ConnectionTest';
import { useLiveResource } from './useLiveResource';
type Fanpage = {
  pageId: string;
  name: string;
  enabled: boolean;
  sendEnabled: boolean;
  hasToken: boolean;
  checkedAt: string | null;
  registeredAt: string | null;
  lastResult: string | null;
};
type Configuration = {
  facebookLoginEnabled: boolean;
  facebookLoginConfigId: string;
  version: number;
  source: string;
  keyReady: boolean;
  appId: string;
  graphVersion: string;
  webhookUrl: string;
  enabled: boolean;
  sendEnabled: boolean;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
  webhookVerifiedAt: string | null;
  pages: Fanpage[];
};
const results: Record<string, string> = {
  CONNECTED: 'Đã kết nối và bật nhận / trả lời. Mở Hội thoại hoặc gửi một tin thử bên dưới.',
  RECEIVING_READY: 'Đã bật nhận tin. Gửi một tin thử để xác nhận tin thực sự vào Sakura.',
  TOKEN_EXPIRED:
    'Mã kết nối đã hết hạn hoặc bị thu hồi. Kết nối lại bằng Facebook hoặc cập nhật token mới.',
  TOKEN_PERMISSION:
    'Meta từ chối đọc Fanpage. Cấp quyền pages_read_engagement cho đúng Page rồi kết nối lại bằng Facebook.',
  SUBSCRIPTION_PERMISSION:
    'Meta chưa cho phép đăng ký nhận tin. Cấp quyền pages_manage_metadata cho đúng Page rồi kết nối lại.',
  TOKEN_PAGE_MISMATCH:
    'Token thuộc Fanpage khác. Kiểm tra Page ID hoặc dùng đăng nhập Facebook để chọn đúng Trang.',
  META_UNAVAILABLE:
    'Chưa kiểm tra được với Meta. Thử lại; nếu vẫn lỗi, kiểm tra quyền và trạng thái ứng dụng trong Meta.',
  TOKEN_VALID: 'Token đúng Fanpage. Chưa xác nhận quyền gửi tin.',
  TOKEN_FAILED: 'Không xác minh được token hoặc token không thuộc Fanpage này.',
  SUBSCRIBED: 'Meta đã nhận đăng ký sự kiện tin nhắn.',
  SUBSCRIPTION_FAILED:
    'Đăng ký chưa được xác nhận. Kiểm tra quyền và webhook trên Meta rồi thử lại.',
};
function AppForm({ data: d, done }: { data: Configuration; done: () => void }) {
  const [facebookLoginEnabled, setFacebookLoginEnabled] = useState(d.facebookLoginEnabled),
    [facebookLoginConfigId, setFacebookLoginConfigId] = useState(d.facebookLoginConfigId);
  const [appId, setAppId] = useState(d.appId),
    [graphVersion, setGraphVersion] = useState(d.graphVersion),
    [webhookUrl, setWebhookUrl] = useState(d.webhookUrl),
    [appSecret, setAppSecret] = useState(''),
    [verifyToken, setVerifyToken] = useState(''),
    [enabled, setEnabled] = useState(d.enabled),
    [sendEnabled, setSendEnabled] = useState(d.sendEnabled),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/messenger/configuration', 'PATCH', {
        version: d.version,
        facebookLoginEnabled,
        facebookLoginConfigId,
        appId,
        graphVersion,
        webhookUrl,
        ...(appSecret ? { appSecret } : {}),
        ...(verifyToken ? { verifyToken } : {}),
        enabled,
        sendEnabled,
      });
      setAppSecret('');
      setVerifyToken('');
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function changed() {
    setSendEnabled(false);
  }
  return (
    <form className="fanpage-form" onSubmit={save}>
      <h3>1. Ứng dụng Meta dùng chung</h3>
      <p className="muted">
        Các Fanpage trong danh sách cần thuộc cùng ứng dụng Meta. Cấu hình tại đây có hiệu lực ngay
        sau khi lưu.
      </p>
      <fieldset disabled={busy || !d.keyReady}>
        <label>
          Mã cấu hình Facebook Login for Business
          <input
            value={facebookLoginConfigId}
            inputMode="numeric"
            maxLength={40}
            onChange={(e) => setFacebookLoginConfigId(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={facebookLoginEnabled}
            onChange={(e) => setFacebookLoginEnabled(e.target.checked)}
          />
          Cho phép kết nối Fanpage bằng đăng nhập Facebook
        </label>
        <label>
          Mã ứng dụng (App ID)
          <input
            value={appId}
            inputMode="numeric"
            maxLength={40}
            onChange={(e) => {
              setAppId(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          Phiên bản Graph API
          <input
            value={graphVersion}
            placeholder="Phiên bản đang dùng trong ứng dụng Meta, dạng vN.0"
            onChange={(e) => {
              setGraphVersion(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          App Secret {d.hasAppSecret && <small>· Đã lưu, để trống để giữ nguyên</small>}
          <input
            type="password"
            autoComplete="new-password"
            value={appSecret}
            maxLength={500}
            onChange={(e) => {
              setAppSecret(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          Địa chỉ nhận tin (Callback URL)
          <input
            type="url"
            value={webhookUrl}
            placeholder="https://ten-mien/api/v1/messenger/webhook"
            maxLength={500}
            onChange={(e) => {
              setWebhookUrl(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          Mã xác minh webhook (Verify Token){' '}
          {d.hasVerifyToken && <small>· Đã lưu, để trống để giữ nguyên</small>}
          <input
            type="password"
            autoComplete="new-password"
            value={verifyToken}
            maxLength={200}
            onChange={(e) => {
              setVerifyToken(e.target.value);
              changed();
            }}
          />
        </label>
        <div className="fanpage-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setVerifyToken(
                Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
                  b.toString(16).padStart(2, '0'),
                ).join(''),
              );
              changed();
              setNotice('Đã tạo mã mới. Sao chép mã trước khi lưu.');
            }}
          >
            Tạo mã xác minh
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!verifyToken}
            onClick={() =>
              void navigator.clipboard
                .writeText(verifyToken)
                .then(() => setNotice('Đã sao chép mã xác minh.'))
                .catch(() => setError('Trình duyệt chưa cho phép sao chép.'))
            }
          >
            Sao chép mã mới
          </button>
        </div>
        <p className="muted">
          Sao chép mã mới trước khi lưu, rồi điền cùng mã trong Meta. Khóa đã lưu sẽ không được hiển
          thị lại.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              if (!e.target.checked) setSendEnabled(false);
            }}
          />
          Bật tiếp nhận webhook
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={sendEnabled}
            disabled={!d.webhookVerifiedAt || !enabled}
            onChange={(e) => setSendEnabled(e.target.checked)}
          />
          Cho phép gửi tin từ Sakura (còn cần bật từng Fanpage)
        </label>
        <button type="submit">{busy ? 'Đang lưu…' : 'Lưu cấu hình Meta'}</button>
      </fieldset>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function PageForm({
  data: d,
  page,
  close,
  done,
}: {
  data: Configuration;
  page?: Fanpage;
  close: () => void;
  done: () => void;
}) {
  const [pageId, setPageId] = useState(page?.pageId || ''),
    [name, setName] = useState(page?.name || ''),
    [accessToken, setAccessToken] = useState(''),
    [enabled, setEnabled] = useState(page?.enabled || false),
    [sendEnabled, setSendEnabled] = useState(page?.sendEnabled || false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const changedId = !!page && pageId !== page.pageId;
  const changedConnection = changedId || !!accessToken;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(
        '/messenger/configuration/pages' + (page ? '/' + page.pageId : ''),
        page ? 'PATCH' : 'POST',
        {
          version: d.version,
          pageId,
          name,
          ...(accessToken ? { accessToken } : {}),
          enabled,
          sendEnabled,
        },
      );
      setAccessToken('');
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={page ? 'Cập nhật Fanpage' : 'Thêm Fanpage'}
      close={() => {
        if (!busy) close();
      }}
    >
      <form className="fanpage-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            Tên Fanpage
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Page ID
            <input
              required
              pattern="[0-9]{1,40}"
              value={pageId}
              onChange={(e) => {
                setPageId(e.target.value.trim());
                setEnabled(false);
                setSendEnabled(false);
              }}
            />
          </label>
          <label>
            Page Access Token{' '}
            {page?.hasToken && !changedId && <small>· Để trống để giữ nguyên</small>}
            <input
              required={!page || changedId}
              type="password"
              autoComplete="new-password"
              maxLength={4096}
              value={accessToken}
              onChange={(e) => {
                setAccessToken(e.target.value.trim());
                setEnabled(false);
                setSendEnabled(false);
              }}
            />
          </label>
          <p className="muted">
            Dùng token của đúng Fanpage và ứng dụng Meta phía trên. Thay token sẽ yêu cầu kiểm tra
            và đăng ký lại.
          </p>
          {changedId && (
            <p className="note" role="status">
              Bạn đang đổi sang Page ID khác. Nhập token của Fanpage mới rồi lưu và kiểm tra lại kết
              nối. Lịch sử hội thoại và phân công của Fanpage cũ không chuyển sang Fanpage mới.
            </p>
          )}
          {page && page.hasToken && !changedConnection && (
            <p className="note" role="status">
              Token đã được lưu bảo mật trong Sakura. Ô trống là bình thường; không cần nhập lại để
              kiểm tra.
            </p>
          )}
          {(!d.appId || !d.graphVersion) && (
            <p className="alert error">
              Chưa thể kiểm tra token: hãy mở “Thiết lập Meta cho quản trị hệ thống”, nhập App ID và
              phiên bản Graph API (dạng vN.0), rồi bấm Lưu cấu hình Meta.
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!page?.checkedAt || changedConnection || !d.enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                if (!e.target.checked) setSendEnabled(false);
              }}
            />
            Nhận tin của Fanpage này
          </label>
          {!d.enabled && (
            <p className="muted">
              Ô nhận tin chỉ bật sau khi bật “Tiếp nhận webhook” trong cấu hình Meta chung.
            </p>
          )}
          {d.enabled && (!page?.checkedAt || changedConnection) && (
            <p className="muted">Sau khi lưu, bấm “Kiểm tra token” ở danh sách Fanpage.</p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={sendEnabled}
              disabled={
                changedConnection ||
                !enabled ||
                !d.sendEnabled ||
                !page?.registeredAt ||
                !d.webhookVerifiedAt
              }
              onChange={(e) => setSendEnabled(e.target.checked)}
            />
            Cho phép nhân viên gửi tin
          </label>
          {enabled && !page?.registeredAt && (
            <p className="muted">
              Sau khi kiểm tra token, cần xác minh webhook và bấm “Đăng ký nhận tin” trước khi bật
              gửi.
            </p>
          )}
          {!page && <p>Fanpage mới được lưu ở trạng thái tắt. Sau khi lưu, bấm Kiểm tra token.</p>}
          <button type="submit">{busy ? 'Đang lưu…' : 'Lưu Fanpage'}</button>
        </fieldset>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
export function FanpageSettings({ changed }: { changed: () => void }) {
  const [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<Fanpage | 'new' | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const r = useResource<Configuration>('/messenger/configuration', revision),
    d = r.data;
  const delivery = useLiveResource<DeliveryDiagnostics>(
    '/messenger/configuration/diagnostics',
    revision,
    {
      enabled: !!d && !busy,
      interval: 10000,
    },
  );
  function refresh() {
    setEditing(null);
    setRevision((v) => v + 1);
    changed();
  }
  async function action(page: Fanpage, operation: 'check' | 'subscribe' | 'activate') {
    if (!d) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<Configuration>(
        '/messenger/configuration/pages/' + page.pageId + '/' + operation,
        'POST',
        { version: d.version },
      );
      const state = result.pages.find((p) => p.pageId === page.pageId)?.lastResult;
      setNotice(state ? results[state] : 'Đã cập nhật trạng thái.');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel import-panel fanpage-settings">
      <div className="sales-toolbar">
        <h2>Kết nối Fanpage</h2>
        <button className="secondary" disabled={busy || r.loading} onClick={refresh}>
          Tải lại trạng thái
        </button>
      </div>
      <State loading={r.loading} error={r.error} />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {d && (
        <>
          <p>
            Đăng nhập Facebook, chọn Fanpage và xác nhận. Sakura tự hoàn tất kết nối nhận / trả lời;
            không cần nhập Page ID hoặc token. Thiết lập Meta dùng chung do quản trị làm một lần.
          </p>
          {!d.keyReady && (
            <p className="alert error">
              Máy chủ chưa có khóa bảo vệ cấu hình. Liên hệ người quản trị hệ thống để thiết lập một
              lần.
            </p>
          )}
          {d.source === 'ENVIRONMENT' && (
            <p className="note">
              Chưa lưu cấu hình trong app. Lần lưu đầu sẽ tiếp nhận cấu hình máy chủ hiện có; các
              lần sau quản lý tại trang này.
            </p>
          )}
          <FacebookConnect
            revision={d.version}
            changed={(count) => {
              setNotice(
                'Đã kết nối ' +
                  count +
                  ' Fanpage và bật nhận / trả lời. Mở Hội thoại hoặc thử tin bên dưới.',
              );
              refresh();
            }}
          />
          <details open={!d.webhookVerifiedAt}>
            <summary>Thiết lập Meta cho quản trị hệ thống (một lần)</summary>
            <AppForm
              key={d.version}
              data={d}
              done={() => {
                setNotice('Đã lưu cấu hình.');
                refresh();
              }}
            />
          </details>
          <div className="note">
            <strong>
              {d.webhookVerifiedAt
                ? 'Địa chỉ nhận tin chung đã được xác minh'
                : 'Cần quản trị xác minh địa chỉ nhận tin chung'}
            </strong>
            <p>
              {d.webhookVerifiedAt
                ? 'Đã nhận yêu cầu xác minh hợp lệ lúc ' + date(d.webhookVerifiedAt)
                : 'Chưa nhận yêu cầu xác minh hợp lệ từ địa chỉ webhook.'}
            </p>
            {!d.webhookVerifiedAt && (
              <p>
                Mở Thiết lập Meta ở trên, lưu địa chỉ webhook và mã xác minh, rồi nhập cùng thông
                tin trong Meta Developer. Chọn sự kiện messages.
              </p>
            )}
          </div>
          <div className="sales-toolbar">
            <h3>2. Kết nối nhận tin ({d.pages.length}/50 Fanpage)</h3>
            <button
              disabled={!d.keyReady || busy || d.pages.length >= 50}
              onClick={() => setEditing('new')}
            >
              Thêm bằng mã kết nối
            </button>
          </div>
          {!d.pages.length && (
            <p>
              Chưa có Fanpage. Dùng đăng nhập Facebook ở trên sau khi quản trị hoàn tất thiết lập.
            </p>
          )}
          {d.pages.map((p) => (
            <article className="activity" key={p.pageId}>
              <strong>{p.name}</strong>
              <p>
                Page ID: {p.pageId} ·{' '}
                {p.enabled && d.enabled ? 'Nhận tin đang bật' : 'Nhận tin đang tắt'} ·{' '}
                {p.sendEnabled && d.sendEnabled ? 'Gửi tin đang bật' : 'Gửi tin đang tắt'}
              </p>
              <p>
                {p.hasToken ? 'Token đã lưu bảo mật' : 'Chưa có token'} ·{' '}
                {p.checkedAt
                  ? 'Token được kiểm tra lúc ' + date(p.checkedAt)
                  : 'Token chưa được xác minh'}{' '}
                ·{' '}
                {p.registeredAt ? 'Đã đăng ký sự kiện messages' : 'Chưa xác nhận đăng ký nhận tin'}
              </p>
              {p.lastResult && <p>{results[p.lastResult]}</p>}
              <div className="fanpage-actions">
                <button
                  disabled={busy || !d.keyReady || !d.enabled || !d.webhookVerifiedAt}
                  onClick={() => void action(p, 'activate')}
                >
                  {busy
                    ? 'Đang kết nối…'
                    : p.enabled && p.registeredAt
                      ? 'Kiểm tra lại kết nối'
                      : 'Kết nối nhận tin'}
                </button>
                <button
                  className="secondary"
                  disabled={busy || !d.keyReady}
                  onClick={() => setEditing(p)}
                >
                  Sửa / bật tắt
                </button>
              </div>
              <p className="muted">
                Nút kết nối sẽ kiểm tra token, đăng ký sự kiện messages và bật nhận tin. Không gửi
                tin nhắn cho khách.
              </p>
              {!d.sendEnabled && (
                <p className="note">
                  Trả lời đang tắt cho toàn bộ Sakura. Quản trị mở Thiết lập Meta và bật “Cho phép
                  gửi tin từ Sakura” nếu muốn nhân viên trả lời.
                </p>
              )}
              {d.sendEnabled && !p.sendEnabled && (
                <p className="note">
                  Để trả lời khách trên Page này, bấm Sửa / bật tắt và chọn “Cho phép nhân viên gửi
                  tin”.
                </p>
              )}
              <details>
                <summary>Kiểm tra từng bước (nâng cao)</summary>
                <div className="fanpage-actions">
                  <button
                    className="secondary"
                    disabled={busy || !d.keyReady || d.version === 0 || !d.graphVersion}
                    title={
                      d.graphVersion
                        ? 'Gọi Meta để xác minh token thuộc đúng Fanpage'
                        : 'Cần nhập phiên bản Graph API trong cấu hình Meta trước'
                    }
                    onClick={() => void action(p, 'check')}
                  >
                    Kiểm tra token
                  </button>
                  <button
                    className="secondary"
                    disabled={
                      busy || !d.keyReady || !p.checkedAt || !d.webhookVerifiedAt || !d.enabled
                    }
                    onClick={() => void action(p, 'subscribe')}
                  >
                    Đăng ký nhận tin
                  </button>
                </div>
              </details>
              <ImportHistory pageId={p.pageId} ready={d.enabled && p.enabled && p.hasToken} />
              <ConnectionTest
                pageId={p.pageId}
                ready={d.enabled && p.enabled && !!p.registeredAt && !!d.webhookVerifiedAt}
                diagnostics={delivery.data}
                error={delivery.error}
              />
            </article>
          ))}
          <p className="muted">
            Tắt Fanpage chỉ dừng xử lý trong Sakura, không xóa hội thoại hay thay đổi Fanpage trên
            Facebook. Không có tin nhắn nào được gửi khi bấm kiểm tra hoặc đăng ký.
          </p>
          {editing && (
            <PageForm
              data={d}
              page={editing === 'new' ? undefined : editing}
              close={() => setEditing(null)}
              done={() => {
                setEditing(null);
                setNotice('Đã lưu Fanpage.');
                refresh();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
