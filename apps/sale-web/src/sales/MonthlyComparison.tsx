import { useState } from 'react';
export type MonthMetrics = {
  label: string;
  sales: string;
  paid: string;
  validOrders: number;
  cancelled: number;
  shippingCharged: string;
  shippingActual: string;
  shippingUnknown: number;
};
const format = (v: string | number) => new Intl.NumberFormat('vi-VN').format(BigInt(v));
export function monthGrowth(current: string, previous?: string) {
  if (previous === undefined || BigInt(previous) === 0n) return '—';
  const tenths = ((BigInt(current) - BigInt(previous)) * 1000n) / BigInt(previous);
  return `${tenths > 0 ? '+' : ''}${Number(tenths) / 10}%`;
}
export function MonthlyComparison({
  rows,
  from,
  to,
}: {
  rows: MonthMetrics[];
  from: string;
  to: string;
}) {
  const [metric, setMetric] = useState<'sales' | 'orders' | 'shipping'>('sales');
  const keys =
    metric === 'sales'
      ? (['sales', 'paid'] as const)
      : metric === 'orders'
        ? (['validOrders', 'cancelled'] as const)
        : (['shippingCharged', 'shippingActual'] as const);
  const names =
    metric === 'sales'
      ? ['Doanh số', 'Đã thu của các đơn']
      : metric === 'orders'
        ? ['Đơn hợp lệ', 'Đơn hủy']
        : ['Phí thu khách', 'Phí thực trả đã biết'];
  const max = Math.max(1, ...rows.flatMap((r) => keys.map((k) => Number(r[k]))));
  const nextDay = new Date(Date.parse(to + 'T00:00:00Z') + 86400000).toISOString().slice(0, 7);
  const partial = nextDay === to.slice(0, 7);
  return (
    <section className="panel monthly-comparison">
      <div className="panel-head">
        <div>
          <h2>So sánh các tháng</h2>
          <p className="muted">
            {from.split('-').reverse().join('/')} – {to.split('-').reverse().join('/')} · Cùng nguồn
            đơn và phạm vi xem báo cáo
          </p>
        </div>
      </div>
      <div className="month-metric-tabs" role="group" aria-label="Chỉ tiêu so sánh">
        {(['sales', 'orders', 'shipping'] as const).map((k, i) => (
          <button
            key={k}
            className={metric === k ? 'primary' : 'secondary'}
            aria-pressed={metric === k}
            onClick={() => setMetric(k)}
          >
            {['Doanh số & thu tiền', 'Đơn hàng', 'Vận chuyển'][i]}
          </button>
        ))}
      </div>
      <div className="month-legend">
        <span>
          <i />
          {names[0]}
        </span>
        <span>
          <i />
          {names[1]}
        </span>
        <small>{metric === 'orders' ? 'Đơn' : 'VND'}</small>
      </div>
      <div className="month-chart-scroll">
        <div
          className="month-columns"
          role="img"
          aria-label={`Biểu đồ ${names.join(' và ')} qua ${rows.length} tháng. Số liệu chi tiết trong bảng bên dưới.`}
        >
          {rows.map((r) => (
            <div className="month-column" key={r.label}>
              <div className="month-bar-pair">
                {keys.map((k, i) => (
                  <div
                    className={`month-bar month-bar-${i}`}
                    key={k}
                    style={{
                      height: `${(Number(r[k]) / max) * 100}%`,
                      minHeight: Number(r[k]) ? 3 : 0,
                    }}
                    title={`${r.label} · ${names[i]}: ${format(r[k])}${metric === 'orders' ? '' : ' ₫'}`}
                  >
                    <span>
                      {new Intl.NumberFormat('vi-VN', {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(Number(r[k]))}
                    </span>
                  </div>
                ))}
              </div>
              <strong>
                {r.label.slice(5)}/{r.label.slice(0, 4)}
              </strong>
              <small>
                {partial && r.label === to.slice(0, 7) ? `Đến ngày ${to.slice(8)}` : 'Trọn tháng'}
              </small>
            </div>
          ))}
        </div>
      </div>
      <p className="muted">
        {partial && 'Tháng cuối chưa đủ ngày; không so sánh mức tăng/giảm với tháng trọn vẹn. '}
        Tháng không có đơn trong dữ liệu được hiển thị bằng 0. Di chuột vào cột để xem giá trị.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Tháng</th>
              <th>{names[0]}</th>
              <th>{names[1]}</th>
              <th>
                {metric === 'sales'
                  ? 'Doanh số so tháng trước'
                  : metric === 'orders'
                    ? 'Đơn hợp lệ so tháng trước'
                    : 'Đơn chưa có phí thực trả'}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label}>
                <td>
                  {r.label}
                  {partial && r.label === to.slice(0, 7) && (
                    <small className="block muted">Chưa đủ tháng</small>
                  )}
                </td>
                <td>
                  {format(r[keys[0]])}
                  {metric !== 'orders' && ' ₫'}
                </td>
                <td>
                  {format(r[keys[1]])}
                  {metric !== 'orders' && ' ₫'}
                </td>
                <td>
                  {metric === 'shipping'
                    ? r.shippingUnknown
                    : partial && r.label === to.slice(0, 7)
                      ? 'Chưa so sánh'
                      : monthGrowth(
                          String(r[keys[0]]),
                          i ? String(rows[i - 1][keys[0]]) : undefined,
                        )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {metric === 'shipping' && (
        <p className="note">
          Phí thực trả chỉ gồm khoản đã đối soát, kể cả đơn hủy. Chưa có phí không có nghĩa là miễn
          phí. Chênh lệch hai cột không phải lợi nhuận.
        </p>
      )}
    </section>
  );
}
