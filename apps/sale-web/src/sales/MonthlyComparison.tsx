import { useState } from 'react';
export type MonthMetrics = {
  partial?: boolean;
  label: string;
  sales: string;
  paid: string;
  validOrders: number;
  cancelled: number;
  returned: number;
  returnRate: number;
  shippingCharged: string;
  shippingActual: string;
  shippingUnknown: number;
  shippingEstimated: string;
  deliveredOnTime: number;
  deliveredLate: number;
  deliveryUnknown: number;
  shippingReturned: number;
  shippingCancelled: number;
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
  unit = 'month',
}: {
  rows: MonthMetrics[];
  from: string;
  to: string;
  unit?: string;
}) {
  const [metric, setMetric] = useState<'sales' | 'orders' | 'shipping' | 'delivery'>('sales');
  const keys =
    metric === 'sales'
      ? (['sales', 'paid'] as const)
      : metric === 'orders'
        ? (['validOrders', 'returned', 'cancelled'] as const)
        : metric === 'delivery'
          ? (['deliveredOnTime', 'deliveredLate', 'shippingReturned', 'shippingCancelled'] as const)
          : (['shippingCharged', 'shippingEstimated', 'shippingActual'] as const);
  const names =
    metric === 'sales'
      ? ['Doanh số', 'Đã thu của các đơn']
      : metric === 'orders'
        ? ['Đơn hợp lệ', 'Đơn hoàn', 'Đơn hủy']
        : metric === 'delivery'
          ? ['Đã giao đúng hạn', 'Đã giao trễ hạn', 'Hoàn', 'Hủy']
          : ['Phí thu khách', 'Cước tạm tính', 'Phí thực trả đã biết'];
  const countMetric = metric === 'orders' || metric === 'delivery';
  const max = Math.max(1, ...rows.flatMap((r) => keys.map((k) => Number(r[k]))));
  const nextDay = new Date(Date.parse(to + 'T00:00:00Z') + 86400000).toISOString().slice(0, 7);
  const partial = rows.some((r) => r.partial) || (unit === 'month' && nextDay === to.slice(0, 7));
  const isPartial = (row: MonthMetrics) =>
    row.partial ?? (unit === 'month' && partial && row.label === to.slice(0, 7));
  const periodName = unit === 'quarter' ? 'quý' : unit === 'week' ? 'tuần trong tháng' : 'tháng';
  const label = (value: string) =>
    unit === 'quarter'
      ? `Q${Math.floor((Number(value.slice(5, 7)) - 1) / 3) + 1}/${value.slice(0, 4)}`
      : unit === 'week'
        ? `Tuần ${value.slice(8, 10)}/${value.slice(5, 7)}`
        : `${value.slice(5, 7)}/${value.slice(0, 4)}`;
  return (
    <section className="panel monthly-comparison">
      <div className="panel-head">
        <div>
          <h2>Biểu đồ kinh doanh theo {periodName}</h2>
          <p className="muted">
            {from.split('-').reverse().join('/')} – {to.split('-').reverse().join('/')} · Cùng nguồn
            đơn và phạm vi xem báo cáo
          </p>
        </div>
      </div>
      <div className="month-metric-tabs" role="group" aria-label="Chỉ tiêu so sánh">
        {(['sales', 'orders', 'shipping', 'delivery'] as const).map((k, i) => (
          <button
            key={k}
            className={metric === k ? 'primary' : 'secondary'}
            aria-pressed={metric === k}
            onClick={() => setMetric(k)}
          >
            {['Doanh số & thu tiền', 'Đơn hàng', 'Chi phí vận chuyển', 'Kết quả giao hàng'][i]}
          </button>
        ))}
      </div>
      <div className="month-legend">
        {names.map((name, i) => (
          <span key={name}>
            <i className={'month-bar-' + i} />
            {name}
          </span>
        ))}
        <small>{countMetric ? 'Đơn' : 'VND'}</small>
      </div>
      <div className="month-chart-scroll">
        <div
          className="month-columns"
          role="img"
          aria-label={`Biểu đồ ${names.join(' và ')} qua ${rows.length} kỳ. Số liệu chi tiết trong bảng bên dưới.`}
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
                    title={`${r.label} · ${names[i]}: ${format(r[k])}${countMetric ? '' : ' ₫'}`}
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
              <strong>{label(r.label)}</strong>
              <small>{isPartial(r) ? 'Kỳ chưa đủ ngày' : 'Trọn kỳ'}</small>
            </div>
          ))}
        </div>
      </div>
      <p className="muted">
        {partial && 'Kỳ chưa đủ ngày được đánh dấu và không so sánh tăng/giảm với kỳ trọn vẹn. '}
        Kỳ không có đơn được hiển thị bằng 0. Các tuần được giới hạn trong tháng đã chọn.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kỳ</th>
              {names.map((name) => (
                <th key={name}>{name}</th>
              ))}
              {metric === 'orders' && (
                <>
                  <th>Tỷ lệ hoàn hàng</th>
                </>
              )}
              <th>
                {metric === 'sales'
                  ? 'Doanh số so kỳ trước'
                  : metric === 'orders'
                    ? 'Đơn hợp lệ so kỳ trước'
                    : metric === 'delivery'
                      ? 'Đơn giao thiếu mốc thời gian'
                      : 'Đơn chưa có phí thực trả'}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label}>
                <td>
                  {label(r.label)}
                  {isPartial(r) && <small className="block muted">Chưa đủ kỳ</small>}
                </td>
                {keys.map((key) => (
                  <td key={key}>
                    {format(r[key])}
                    {!countMetric && ' ₫'}
                  </td>
                ))}
                {metric === 'orders' && (
                  <>
                    <td>
                      {new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(
                        r.returnRate,
                      )}
                      %
                    </td>
                  </>
                )}
                <td>
                  {metric === 'shipping' || metric === 'delivery'
                    ? metric === 'shipping'
                      ? r.shippingUnknown
                      : r.deliveryUnknown
                    : isPartial(r) || (i > 0 && isPartial(rows[i - 1]))
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
      {metric === 'delivery' && (
        <p className="note">
          Đúng/trễ hạn chỉ tính đơn đã giao có đủ ngày cam kết và ngày giao thực tế. Có{' '}
          {rows.reduce((sum, r) => sum + r.deliveryUnknown, 0)} đơn đã giao thiếu mốc thời gian.
          Trạng thái hoàn/hủy được theo dõi riêng, có thể phát sinh sau một lần giao.
        </p>
      )}
    </section>
  );
}
