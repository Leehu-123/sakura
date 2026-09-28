import { useState } from 'react';
import { api } from '../api';
import { Form, State, useResource } from '../sales/shared';
import { date } from '../sales/types';
type Config = {
  version: number;
  connected: boolean;
  customerCode: string;
  enabled: boolean;
  updatedAt: string | null;
};
export function ShippingSettings() {
  const [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const r = useResource<Config>('/shipping/vnpost', revision),
    c = r.data;
  return (
    <section className="panel shipping-settings">
      <div className="panel-head">
        <h2>Kết nối VNPost</h2>
        <span className="badge">
          {c?.connected ? (c.enabled ? 'Đang bật' : 'Đã tạm dừng') : 'Chưa kết nối'}
        </span>
      </div>
      <State loading={r.loading} error={r.error || error} />
      <p>
        Dùng tài khoản MyVNPost và mã khách hàng CMS được VNPost cấp theo hợp đồng. Mật khẩu chỉ
        dùng để lấy mã truy cập, không lưu trong Sakura.
      </p>
      {c && (
        <>
          {c.connected && (
            <p>
              Mã khách hàng: <strong>{c.customerCode}</strong> · Kết nối cập nhật{' '}
              {date(c.updatedAt)}
            </p>
          )}
          <Form
            key={revision}
            label={c.connected ? 'Kết nối lại VNPost' : 'Kết nối VNPost'}
            done={() => setRevision((v) => v + 1)}
            submit={async (f) => {
              await api('/shipping/vnpost/connect', 'POST', {
                version: c.version,
                username: String(f.get('username')).trim(),
                password: f.get('password'),
                customerCode: String(f.get('customerCode')).trim(),
              });
            }}
          >
            <label>
              Tên đăng nhập MyVNPost
              <input name="username" required maxLength={255} autoComplete="off" />
            </label>
            <label>
              Mật khẩu MyVNPost
              <input
                name="password"
                type="password"
                required
                maxLength={255}
                autoComplete="new-password"
              />
            </label>
            <label>
              Mã khách hàng CMS
              <input
                name="customerCode"
                required
                pattern="[A-Za-z0-9_-]{1,20}"
                defaultValue={c.customerCode}
                placeholder="Mã trên hợp đồng VNPost"
              />
            </label>
          </Form>
          {c.connected && (
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api('/shipping/vnpost', 'PATCH', {
                    version: c.version,
                    enabled: !c.enabled,
                  });
                  setRevision((v) => v + 1);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {c.enabled ? 'Tạm dừng đồng bộ' : 'Bật đồng bộ'}
            </button>
          )}
        </>
      )}
      <h3>Sử dụng với đơn hàng</h3>
      <ol>
        <li>
          Mở đơn đã chốt → Cập nhật vận chuyển, chọn VNPost và nhập mã vận đơn đã tạo trên VNPost.
        </li>
        <li>
          Bấm Đồng bộ VNPost để kiểm tra. Khi bật kết nối, Sakura tự kiểm tra định kỳ khoảng 15
          phút; nhiều đơn có thể cần lâu hơn.
        </li>
        <li>
          Sau đối soát, ghi phí thực trả của từng đơn. Báo cáo sẽ tổng hợp riêng phí thu khách, cước
          tạm tính và phí thực trả.
        </li>
      </ol>
      <p className="muted">
        Đồng bộ trạng thái và cước cho đơn Sakura đã gắn mã vận đơn. Chưa tạo vận đơn, thu tiền hoặc
        hủy đơn trên VNPost. Đơn Sapo nhập trước đây chưa có phí thực trả sẽ được báo thiếu dữ liệu.
        Đơn đã giao/hoàn/hủy tiếp tục kiểm tra trong 30 ngày kể từ cập nhật của hãng; sau đó có thể
        đồng bộ thủ công.
      </p>
    </section>
  );
}
