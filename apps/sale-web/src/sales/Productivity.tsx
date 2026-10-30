import { useState } from 'react';
import { Actor, date } from './types';
import { State, useResource } from './shared';
type Row = {
  id: string;
  displayName: string;
  managed: number;
  overdue: number;
  waiting: number;
  late: number;
  overdueRate: number | null;
  waitingLateRate: number | null;
};
const rate = (n: number | null) =>
  n === null
    ? 'Chưa có mẫu'
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n) + '%';
export function Productivity({ actor }: { actor: Actor }) {
  const [hours, setHours] = useState(4),
    [applied, setApplied] = useState(4);
  const canRead = actor.grants.some((g) => g.permission === 'sales.reports.read');
  const result = useResource<{ rows: Row[]; asOf: string }>(
    '/sales/productivity?overdueHours=' + applied,
    0,
    canRead,
  );
  if (!canRead) return null;
  return (
    <section className="panel">
      <h2>Năng suất chăm sóc và tin đang chờ</h2>
      <form
        className="sales-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(hours);
        }}
      >
        <label>
          Ngưỡng chờ phản hồi (giờ)
          <input
            type="number"
            required
            min={1}
            max={168}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </label>
        <button className="secondary">Xem thống kê</button>
      </form>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <>
          <small className="muted">
            Tại {date(result.data.asOf)} · Mỗi nhân sự theo khách đang được giao và hội thoại đang
            phụ trách
          </small>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th>Khách đang chăm sóc</th>
                  <th>Khách quá hạn</th>
                  <th>Tỷ lệ quá hạn</th>
                  <th>Hội thoại đang chờ</th>
                  <th>Chờ quá {applied} giờ</th>
                  <th>Tỷ lệ chờ quá ngưỡng</th>
                </tr>
              </thead>
              <tbody>
                {result.data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.displayName}</td>
                    <td>{r.managed}</td>
                    <td>{r.overdue}</td>
                    <td>{rate(r.overdueRate)}</td>
                    <td>{r.waiting}</td>
                    <td>{r.late}</td>
                    <td>{rate(r.waitingLateRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="muted">
        Tỷ lệ chờ tính trên hội thoại chưa được trả lời, từ tin đầu tiên sau lần gửi thành công gần
        nhất. Đây chưa phải tỷ lệ phản hồi đúng/chậm của các lượt đã xử lý. Tỷ lệ gắn nhãn sai chưa
        có dữ liệu kiểm định.
      </p>
    </section>
  );
}
