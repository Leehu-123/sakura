import { useState } from 'react';
import { api } from '../api';
import { Actor } from './types';
import { Form, State, useResource } from './shared';
type Config = { version: number; responseSeconds: number };
type Counts = {
  answered: number;
  onTime: number;
  late: number;
  pending: number;
  pendingLate: number;
  estimated: number;
  onTimeRate: number | null;
  lateRate: number | null;
};
const percent = (n: number | null) =>
  n === null
    ? 'Chưa có mẫu'
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n) + '%';
export function MessengerSlaSettings() {
  const [revision, setRevision] = useState(0),
    [saved, setSaved] = useState(false);
  const r = useResource<Config>('/sales/messenger-sla/config', revision);
  return (
    <section className="panel">
      <h2>Hạn phản hồi Messenger</h2>
      <p>Áp dụng liên tục 24/7, kể cả ngoài giờ làm việc, cuối tuần và ngày nghỉ.</p>
      <State loading={r.loading} error={r.error} />
      {saved && <p role="status">Đã lưu hạn phản hồi Messenger.</p>}
      {r.data && (
        <Form
          key={revision}
          label="Lưu hạn phản hồi"
          done={() => {
            setSaved(true);
            setRevision((v) => v + 1);
          }}
          submit={async (f) => {
            await api('/sales/messenger-sla/config', 'PATCH', {
              version: r.data!.version,
              responseSeconds: Number(f.get('responseSeconds')),
            });
          }}
        >
          <label>
            Hạn phản hồi (giây)
            <input
              name="responseSeconds"
              type="number"
              min={1}
              max={604800}
              step={1}
              required
              defaultValue={r.data.responseSeconds}
            />
          </label>
          <p className="muted">
            180 giây = 3 phút. Tối đa 7 ngày. Thay đổi sẽ tính lại báo cáo lịch sử theo hạn mới.
          </p>
        </Form>
      )}
    </section>
  );
}
export function MessengerSlaPanel({
  actor,
  from,
  to,
}: {
  actor: Actor;
  from?: string;
  to?: string;
}) {
  const canRead = actor.grants.some((g) => g.permission === 'sales.reports.read');
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const r = useResource<
    Config & {
      from: string;
      to: string;
      summary: Counts;
      rows: (Counts & { id: string | null; displayName: string | null })[];
    }
  >('/sales/messenger-sla?' + params, 0, canRead);
  if (!canRead) return null;
  return (
    <section className="panel">
      <h2>Phản hồi Messenger đúng giờ / chậm</h2>
      <State loading={r.loading} error={r.error} />
      {r.data && (
        <>
          <p>
            Kỳ {r.data.from} – {r.data.to} · Hạn {r.data.responseSeconds} giây · Tính 24/7
          </p>
          <div className="business-kpis">
            <div className="business-kpi">
              <span>Phản hồi đúng giờ</span>
              <strong>{percent(r.data.summary.onTimeRate)}</strong>
              <small>
                {r.data.summary.onTime}/{r.data.summary.answered} lượt đã trả lời
              </small>
            </div>
            <div className="business-kpi">
              <span>Phản hồi chậm</span>
              <strong>{percent(r.data.summary.lateRate)}</strong>
              <small>
                {r.data.summary.late}/{r.data.summary.answered} lượt đã trả lời
              </small>
            </div>
            <div className="business-kpi">
              <span>Chưa trả lời quá hạn</span>
              <strong>{r.data.summary.pendingLate}</strong>
              <small>Trong {r.data.summary.pending} lượt đang chờ của kỳ</small>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự phản hồi</th>
                  <th>Đã trả lời</th>
                  <th>Đúng giờ</th>
                  <th>Tỷ lệ đúng giờ</th>
                  <th>Chậm</th>
                  <th>Tỷ lệ chậm</th>
                  <th>Đang chờ</th>
                  <th>Chờ quá hạn</th>
                </tr>
              </thead>
              <tbody>
                {r.data.rows.map((x) => (
                  <tr key={x.id || 'unknown'}>
                    <td>{x.displayName || 'Chưa xác định nhân sự'}</td>
                    <td>{x.answered}</td>
                    <td>{x.onTime}</td>
                    <td>{percent(x.onTimeRate)}</td>
                    <td>{x.late}</td>
                    <td>{percent(x.lateRate)}</td>
                    <td>{x.pending}</td>
                    <td>{x.pendingLate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.data.summary.estimated > 0 && (
            <p className="note">
              {r.data.summary.estimated} lượt cũ dùng thời điểm yêu cầu gửi do chưa có mốc gửi thành
              công; thời gian phản hồi có thể là ước tính.
            </p>
          )}
        </>
      )}
      <p className="muted">
        Mỗi lượt bắt đầu từ tin đầu tiên của khách đến lần gửi thành công tiếp theo. Tin nhắn bổ
        sung không đặt lại đồng hồ; gửi lỗi/đang gửi chưa tính là trả lời. Đúng giờ khi thời gian
        chờ không vượt hạn. Chọn kỳ theo ngày bắt đầu lượt; tỷ lệ tính trên lượt đã trả lời. Lượt
        đang chờ tính cho người đang phụ trách, lượt đã trả lời tính cho người gửi.
      </p>
    </section>
  );
}
