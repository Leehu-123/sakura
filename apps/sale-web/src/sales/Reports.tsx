import { useState } from 'react';
import { BarChart3, Download, RefreshCw, ArrowRight } from 'lucide-react';
import { useResource, State } from './shared';
import { MonthlyComparison, MonthMetrics } from './MonthlyComparison';
import { ReportAiPanel } from './ReportAiSettings';
type Metrics = {
  shippingCharged: string;
  shippingEstimated: string;
  shippingActual: string;
  shippingDifference: string;
  shippingUnknown: number;
  shippingChargedUnknown: number;
  shippingEstimatedOrders: number;
  shippingComparedOrders: number;
  orders: number;
  validOrders: number;
  cancelled: number;
  draft: number;
  unclassified: number;
  sales: string;
  paid: string;
  unpaid: string;
  unknownPayments: number;
  customers: number;
};
type Row = Metrics & { label: string; source?: string };
type Report = {
  comparison?: MonthMetrics[];
  comparisonFrom?: string;
  comparisonTo?: string;
  carriers: Row[];
  from: string;
  to: string;
  source: string;
  bucket: string;
  summary: Metrics;
  previous: Metrics;
  timeline: Row[];
  sources: Row[];
  staff: Row[];
  statuses: { source: string; label: string; category: string; orders: number; value: string }[];
  scope: string;
};
const integer = (v: string | number) => new Intl.NumberFormat('vi-VN').format(BigInt(v));
const money = (v: string) => integer(v) + ' ₫';
const localDay = (d = new Date()) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const sourceName = (s: string) =>
  s === 'ALL' ? 'Tất cả nguồn' : s === 'SAPO' ? 'Sapo đã nhập' : 'Sakura';
function exportReport(d: Report) {
  const rows = [
    ['Báo cáo Sakura', d.from, d.to, sourceName(d.source)],
    [
      'Theo ngày/tháng',
      'Đơn hợp lệ',
      'Doanh số (VND)',
      'Đã thu (VND)',
      'Còn phải thu đã biết (VND)',
    ],
    ...d.timeline.map((r) => [r.label, r.validOrders, r.sales, r.paid, r.unpaid]),
    [],
    ['So sánh tháng', d.comparisonFrom || '', d.comparisonTo || ''],
    [
      'Tháng',
      'Đơn hợp lệ',
      'Đơn hủy',
      'Doanh số (VND)',
      'Đã thu (VND)',
      'Phí thu khách (VND)',
      'Phí thực trả đã biết (VND)',
      'Đơn thiếu phí thực trả',
    ],
    ...(d.comparison || []).map((r) => [
      r.label,
      r.validOrders,
      r.cancelled,
      r.sales,
      r.paid,
      r.shippingCharged,
      r.shippingActual,
      r.shippingUnknown,
    ]),
    [],
    ['Nguồn', 'Người chốt', 'Đơn hợp lệ', 'Doanh số (VND)'],
    ...d.staff.map((r) => [r.source || '', r.label, r.validOrders, r.sales]),
    [],
    ['Nguồn', 'Trạng thái', 'Số đơn', 'Giá trị đơn (VND)'],
    ...d.statuses.map((r) => [r.source, r.label, r.orders, r.value]),
    [],
    [
      'Vận chuyển',
      'Phí thu khách (VND)',
      'Cước tạm tính (VND)',
      'Phí thực trả (VND)',
      'Đơn chưa đối soát',
      'Chênh lệch trên đơn đủ dữ liệu (VND)',
      'Số đơn đủ dữ liệu',
    ],
    ...[{ ...d.summary, label: 'Tổng' }, ...d.carriers].map((r) => [
      r.label,
      r.shippingCharged,
      r.shippingEstimated,
      r.shippingActual,
      r.shippingUnknown,
      r.shippingDifference,
      r.shippingComparedOrders,
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((v) => {
          let s = String(v);
          if (/^[=+@-]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `sakura-bao-cao-${d.from}-${d.to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SalesReport({
  detailed = false,
  openReports,
  openAiSettings,
}: {
  detailed?: boolean;
  openReports: () => void;
  openAiSettings?: () => void;
}) {
  const today = localDay();
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [source, setSource] = useState('ALL'),
    [months, setMonths] = useState('6');
  const [query, setQuery] = useState({ from, to, source, months }),
    [revision, setRevision] = useState(0);
  const result = useResource<Report>('/sales/reports?' + new URLSearchParams(query), revision),
    d = result.data;
  function preset(days: number) {
    const end = localDay();
    setTo(end);
    setFrom(
      days === 0
        ? end.slice(0, 8) + '01'
        : days === -1
          ? end.slice(0, 4) + '-01-01'
          : localDay(new Date(Date.now() - (days - 1) * 86400000)),
    );
  }
  const growth =
    d && BigInt(d.previous.sales) > 0
      ? Number(
          ((BigInt(d.summary.sales) - BigInt(d.previous.sales)) * 1000n) / BigInt(d.previous.sales),
        ) / 10
      : null;
  const max = d ? Math.max(1, ...d.timeline.map((r) => Number(r.sales))) : 1;
  return (
    <div className="business-report">
      <section className="report-hero">
        <div>
          <span className="eyebrow">KINH DOANH SAKURA</span>
          <h2>{detailed ? 'Báo cáo bán hàng' : 'Kết quả kinh doanh'}</h2>
          <p>Theo dõi doanh số và đơn hàng trong khoảng thời gian bạn chọn.</p>
        </div>
        <BarChart3 size={40} />
      </section>
      <form
        className="panel report-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ from, to, source, months });
          setRevision((v) => v + 1);
        }}
      >
        <label>
          Từ ngày
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Đến ngày
          <input type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Nguồn đơn
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="ALL">Sakura + Sapo</option>
            <option value="SAKURA">Sakura</option>
            <option value="SAPO">Sapo đã nhập</option>
          </select>
        </label>
        <label>
          So sánh tháng
          <select value={months} onChange={(e) => setMonths(e.target.value)}>
            {['3', '6', '12'].map((n) => (
              <option key={n} value={n}>
                {n} tháng đến ngày kết thúc
              </option>
            ))}
          </select>
        </label>
        <button className="primary">
          <RefreshCw size={16} />
          Xem số liệu
        </button>
        <div className="report-presets">
          {[
            [1, 'Hôm nay'],
            [7, '7 ngày'],
            [0, 'Tháng này'],
            [-1, 'Năm nay'],
          ].map(([days, label]) => (
            <button
              key={days}
              type="button"
              className="text-button"
              onClick={() => preset(Number(days))}
            >
              {label}
            </button>
          ))}
        </div>
      </form>
      <State loading={result.loading} error={result.error} />
      {d && !result.loading && !result.error && (
        <>
          <div className="report-context">
            <span>
              {d.from.split('-').reverse().join('/')} – {d.to.split('-').reverse().join('/')} ·{' '}
              {sourceName(d.source)} ·{' '}
              {d.scope === 'GLOBAL' ? 'Toàn công ty' : 'Khách hàng bạn đang được giao'}
            </span>
            {detailed ? (
              <button className="secondary" onClick={() => exportReport(d)}>
                <Download size={16} />
                Xuất CSV
              </button>
            ) : (
              <button className="text-button" onClick={openReports}>
                Xem báo cáo chi tiết <ArrowRight size={16} />
              </button>
            )}
          </div>
          <div className="business-kpis">
            {[
              [
                'Doanh số',
                money(d.summary.sales),
                growth === null
                  ? 'Chưa có doanh số kỳ trước để so sánh'
                  : `${growth > 0 ? '+' : ''}${growth}% so với ${Math.round((Date.parse(d.to) - Date.parse(d.from)) / 86400000) + 1} ngày liền trước`,
              ],
              [
                'Đơn hợp lệ',
                integer(d.summary.validOrders),
                `${d.summary.orders} đơn trong kỳ · ${d.summary.draft} đơn nháp / đặt hàng`,
              ],
              ['Đã thu của các đơn', money(d.summary.paid), 'Theo số tiền đã ghi nhận trên đơn'],
              [
                'Còn phải thu',
                money(d.summary.unpaid),
                d.summary.unknownPayments
                  ? `${d.summary.unknownPayments} đơn chưa có dữ liệu thu tiền`
                  : 'Theo các đơn hợp lệ trong kỳ',
              ],
              ['Khách mua hàng', integer(d.summary.customers), 'Khách đã liên kết với đơn hợp lệ'],
              ['Đơn đã hủy', integer(d.summary.cancelled), 'Không tính vào doanh số'],
            ].map(([label, value, note]) => (
              <section className="panel business-kpi" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </section>
            ))}
          </div>
          {(d.summary.unclassified > 0 || d.summary.unknownPayments > 0) && (
            <p className="note">
              {d.summary.unclassified > 0 &&
                `${d.summary.unclassified} đơn Sapo có trạng thái chưa phân loại (ví dụ “Đã lưu trữ”), chưa cộng vào doanh số. `}
              {d.summary.unknownPayments > 0 &&
                'Số đã thu/còn phải thu chưa bao gồm đơn thiếu dữ liệu thanh toán.'}
            </p>
          )}
          {d.comparison && (
            <MonthlyComparison rows={d.comparison} from={d.comparisonFrom!} to={d.comparisonTo!} />
          )}
          {detailed && <ReportAiPanel openSettings={openAiSettings} />}
          <section className="panel">
            <div className="panel-head">
              <h2>Chi phí vận chuyển</h2>
            </div>
            <div className="business-kpis">
              <article className="business-kpi">
                <span>Phí thu khách</span>
                <strong>{money(d.summary.shippingCharged)}</strong>
                <small>Trong tổng đơn hợp lệ</small>
              </article>
              <article className="business-kpi">
                <span>Cước VNPost tạm tính</span>
                <strong>{money(d.summary.shippingEstimated)}</strong>
                <small>{d.summary.shippingEstimatedOrders} đơn có cước API</small>
              </article>
              <article className="business-kpi">
                <span>Phí thực trả đã đối soát</span>
                <strong>{money(d.summary.shippingActual)}</strong>
                <small>Gồm phí của đơn hủy/hoàn đã ghi nhận</small>
              </article>
              <article className="business-kpi">
                <span>Chênh lệch thu − chi</span>
                <strong>{money(d.summary.shippingDifference)}</strong>
                <small>Chỉ trên {d.summary.shippingComparedOrders} đơn đủ dữ liệu</small>
              </article>
            </div>
            <p className="note">
              {d.summary.shippingUnknown} đơn chưa có phí thực trả;{' '}
              {d.summary.shippingChargedUnknown} đơn hợp lệ thiếu phí thu khách. Tổng hiện tại chỉ
              cộng khoản đã biết; chưa thể xem là tổng chi phí đầy đủ khi còn đơn chưa đối soát.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Đối tác</th>
                    <th>Phí thu khách</th>
                    <th>Cước tạm tính</th>
                    <th>Phí thực trả</th>
                    <th>Chưa đối soát</th>
                    <th>Chênh lệch đã biết</th>
                  </tr>
                </thead>
                <tbody>
                  {d.carriers.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>{money(r.shippingCharged)}</td>
                      <td>{money(r.shippingEstimated)}</td>
                      <td>{money(r.shippingActual)}</td>
                      <td>{r.shippingUnknown}</td>
                      <td>
                        {money(r.shippingDifference)}
                        <small className="block muted">
                          {r.shippingComparedOrders} đơn đủ dữ liệu
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Tính theo ngày tạo/đặt đơn đã chọn, không phải ngày thanh toán cho hãng. Cước API là
              tạm tính có VAT; phí thực trả do người có quyền ghi nhận theo đối soát. Chênh lệch
              loại đơn nháp và chưa rõ trạng thái; đơn hủy tính phí thu khách bằng 0 nhưng vẫn trừ
              phí thực trả. Đơn hoàn vẫn cần đối soát/điều chỉnh trạng thái bán hàng riêng. Đây
              không phải báo cáo lợi nhuận.
            </p>
          </section>
          <section className="panel report-chart">
            <div className="panel-head">
              <h2>Doanh số theo {d.bucket === 'month' ? 'tháng' : 'ngày'}</h2>
              <span className="muted">VND</span>
            </div>
            {!d.timeline.length ? (
              <p className="empty">Chưa có đơn trong khoảng thời gian này.</p>
            ) : (
              <div className="sales-bars">
                {d.timeline.map((r) => (
                  <div className="sales-bar-row" key={r.label}>
                    <span>
                      {d.bucket === 'month'
                        ? r.label.slice(0, 7)
                        : r.label.slice(5).split('-').reverse().join('/')}
                    </span>
                    <div>
                      <span style={{ width: (Number(r.sales) / max) * 100 + '%' }} />
                    </div>
                    <strong>{money(r.sales)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Theo nguồn đơn</h2>
            </div>
            <MetricsTable rows={d.sources.map((r) => ({ ...r, label: sourceName(r.label) }))} />
          </section>
          {detailed && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <h2>Theo người chốt</h2>
                  <small>50 nhóm có doanh số cao nhất</small>
                </div>
                <MetricsTable
                  rows={d.staff.map((r) => ({
                    ...r,
                    label: r.label + ' · ' + sourceName(r.source || 'SAKURA'),
                  }))}
                />
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>Đối chiếu trạng thái</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Nguồn</th>
                        <th>Trạng thái gốc</th>
                        <th>Số đơn</th>
                        <th>Giá trị đơn</th>
                        <th>Tính doanh số</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.statuses.map((r) => (
                        <tr key={r.source + r.label}>
                          <td>{sourceName(r.source)}</td>
                          <td>{r.label}</td>
                          <td>{r.orders}</td>
                          <td>{money(r.value)}</td>
                          <td>
                            {r.category === 'VALID'
                              ? 'Có'
                              : r.category === 'UNKNOWN'
                                ? 'Chưa phân loại'
                                : 'Không'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <p className="muted report-method">
            Ngày theo giờ Việt Nam, dựa trên ngày tạo đơn Sakura/ngày đặt đơn Sapo. Doanh số là tổng
            giá trị đơn đã chốt/hoàn tất, gồm phí giao hàng và đã trừ giảm giá; loại đơn nháp, hủy
            và trạng thái chưa xác định. Số tiền đã thu là lũy kế hiện tại của các đơn trong kỳ,
            không phải dòng tiền thu theo ngày. Chưa phải báo cáo lợi nhuận hoặc doanh thu kế toán
            sau hoàn trả.
          </p>
        </>
      )}
    </div>
  );
}
function MetricsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Nhóm</th>
            <th>Đơn hợp lệ</th>
            <th>Doanh số</th>
            <th>Đã thu</th>
            <th>Còn phải thu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label + i}>
              <td>{r.label}</td>
              <td>{r.validOrders}</td>
              <td>{money(r.sales)}</td>
              <td>{money(r.paid)}</td>
              <td>{money(r.unpaid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">Chưa có dữ liệu.</p>}
    </div>
  );
}
