import { useState } from 'react';
import { BarChart3, Download, RefreshCw, ArrowRight } from 'lucide-react';
import { useResource, State } from './shared';
import { MonthlyComparison, MonthMetrics } from './MonthlyComparison';
import { ReportAiPanel } from './ReportAiSettings';
import { orderStatuses, Actor } from './types';
import { salesChannels, deliveryRegions } from './OrderMetadata';
import { ReportOrders } from './ReportOrders';
import { Productivity } from './Productivity';
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
  returned: number;
  returnRate: number;
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
  customerSegments?: { once: number; repeat: number };
  previousFrom: string;
  previousTo: string;
  comparisonUnit?: string;
  teams: Row[];
  products: {
    source: string;
    deliveryRegion: string;
    category: string;
    productName: string;
    sku: string;
    unit: string;
    quantity: string;
    sales: string;
    missingLines: number;
  }[];
  salesSources: (Row & { salesChannel: string; sourcePageId?: string | null })[];
  deliveryRegions: Row[];
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
const percent = (v: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v) + '%';
const localDay = (d = new Date()) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const sourceName = (s: string) =>
  s === 'ALL' ? 'Tất cả nguồn' : s === 'SAPO' ? 'Sapo đã nhập' : 'Sakura';
function exportReport(d: Report) {
  const rows = [
    ['Báo cáo Sakura', d.from, d.to, sourceName(d.source)],
    ['Số đơn hoàn', d.summary.returned, 'Tỷ lệ hoàn hàng (%)', d.summary.returnRate],
    ['Tỷ lệ hoàn = đơn hoàn / (đơn hợp lệ + đơn hoàn) × 100; kỳ theo ngày tạo/đặt đơn'],
    [
      'Theo ngày/tháng',
      'Đơn hợp lệ',
      'Đơn hoàn',
      'Tỷ lệ hoàn hàng (%)',
      'Doanh số (VND)',
      'Đã thu (VND)',
      'Còn phải thu đã biết (VND)',
    ],
    ...d.timeline.map((r) => [
      r.label,
      r.validOrders,
      r.returned,
      r.returnRate,
      r.sales,
      r.paid,
      r.unpaid,
    ]),
    [],
    ['So sánh theo kỳ', d.comparisonUnit || 'month', d.comparisonFrom || '', d.comparisonTo || ''],
    [
      'Kỳ',
      'Kỳ chưa đủ ngày',
      'Đơn hợp lệ',
      'Đơn hủy',
      'Đơn hoàn',
      'Tỷ lệ hoàn hàng (%)',
      'Doanh số (VND)',
      'Đã thu (VND)',
      'Phí thu khách (VND)',
      'Cước tạm tính (VND)',
      'Phí thực trả đã biết (VND)',
      'Đơn thiếu phí thực trả',
    ],
    ...(d.comparison || []).map((r) => [
      r.label,
      r.partial ? 'Có' : 'Không',
      r.validOrders,
      r.cancelled,
      r.returned,
      r.returnRate,
      r.sales,
      r.paid,
      r.shippingCharged,
      r.shippingEstimated,
      r.shippingActual,
      r.shippingUnknown,
    ]),
    [],
    ['Nguồn', 'Người chốt', 'Đơn hợp lệ', 'Đơn hoàn', 'Tỷ lệ hoàn hàng (%)', 'Doanh số (VND)'],
    ...d.staff.map((r) => [
      r.source || '',
      r.label,
      r.validOrders,
      r.returned,
      r.returnRate,
      r.sales,
    ]),
    [],
    ['Nguồn', 'Trạng thái', 'Số đơn', 'Giá trị đơn (VND)'],
    ...d.statuses.map((r) => [r.source, r.label, r.orders, r.value]),
    [],
    ['Kênh bán', 'Tên nguồn', 'Đơn hợp lệ', 'Đơn hoàn', 'Doanh số (VND)'],
    ...(d.salesSources || []).map((r) => [
      salesChannels[r.salesChannel] || r.salesChannel,
      r.label,
      r.validOrders,
      r.returned,
      r.sales,
    ]),
    [],
    ['Nhóm kinh doanh', 'Đơn hợp lệ', 'Đơn hoàn', 'Doanh số (VND)'],
    ...(d.teams || []).map((r) => [r.label, r.validOrders, r.returned, r.sales]),
    [],
    ['Vùng nhận', 'Đơn hợp lệ', 'Đơn hoàn', 'Doanh số (VND)'],
    ...(d.deliveryRegions || []).map((r) => [
      deliveryRegions[r.label] || r.label,
      r.validOrders,
      r.returned,
      r.sales,
    ]),
    [],
    [
      'Nguồn dữ liệu',
      'Vùng nhận',
      'Nhóm sản phẩm hiện tại',
      'Sản phẩm',
      'SKU',
      'Đơn vị',
      'Số lượng đã biết',
      'Tiền hàng đã biết (VND)',
      'Dòng thiếu dữ liệu',
    ],
    ...(d.products || []).map((r) => [
      r.source,
      deliveryRegions[r.deliveryRegion] || r.deliveryRegion,
      r.category,
      r.productName,
      r.sku,
      r.unit,
      r.quantity,
      r.sales,
      r.missingLines,
    ]),
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
  actor,
}: {
  detailed?: boolean;
  openReports: () => void;
  openAiSettings?: () => void;
  actor: Actor;
}) {
  const today = localDay();
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [source, setSource] = useState('ALL'),
    [months, setMonths] = useState('6');
  const [bucket, setBucket] = useState('auto'),
    [channel, setChannel] = useState(''),
    [sourceText, setSourceText] = useState(''),
    [staff, setStaff] = useState(''),
    [region, setRegion] = useState('');
  const [detail, setDetail] = useState<{ metric: string; title: string } | null>(null);
  const [comparisonUnit, setComparisonUnit] = useState('month'),
    [team, setTeam] = useState('');
  const [compareUnit, setCompareUnit] = useState('window');
  const [orderStatus, setOrderStatus] = useState(''),
    [carrier, setCarrier] = useState(''),
    [productText, setProductText] = useState('');
  const [query, setQuery] = useState<Record<string, string>>({ from, to, source, months }),
    [revision, setRevision] = useState(0);
  const result = useResource<Report>('/sales/reports?' + new URLSearchParams(query), revision),
    d = result.data;
  function preset(days: number) {
    const end = localDay();
    setTo(end);
    setFrom(
      days === 0
        ? end.slice(0, 8) + '01'
        : days === -2
          ? localDay(
              new Date(
                Date.parse(end + 'T00:00:00+07:00') -
                  ((new Date(end + 'T00:00:00Z').getUTCDay() + 6) % 7) * 86400000,
              ),
            )
          : days === -3
            ? end.slice(0, 4) +
              '-' +
              String(Math.floor((Number(end.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0') +
              '-01'
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
          setQuery({
            comparisonUnit,
            team,
            compareUnit,
            status: orderStatus,
            carrier,
            product: query.product || '',
            from,
            to,
            source,
            months,
            bucket,
            salesChannel: channel,
            salesSourceName: sourceText,
            staff,
            deliveryRegion: region,
          });
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
          Nguồn dữ liệu
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="ALL">Sakura + Sapo</option>
            <option value="SAKURA">Sakura</option>
            <option value="SAPO">Sapo đã nhập</option>
          </select>
        </label>
        <label>
          Trạng thái đơn
          <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
            <option value="">Tất cả</option>
            <optgroup label="Sakura">
              {Object.entries(orderStatuses).map(([v, t]) => (
                <option key={v} value={'SAKURA:' + v}>
                  {t}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sapo">
              {[
                'Đang giao dịch',
                'Đã hoàn thành',
                'Đã hủy',
                'Hàng hoàn',
                'Đã lưu trữ',
                'Đặt hàng',
              ].map((t) => (
                <option key={t} value={'SAPO:' + t}>
                  {t}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Đối tác vận chuyển
          <input value={carrier} maxLength={120} onChange={(e) => setCarrier(e.target.value)} />
        </label>
        <label>
          Số tháng (khi xem theo tháng)
          <select value={months} onChange={(e) => setMonths(e.target.value)}>
            {['3', '6', '12'].map((n) => (
              <option key={n} value={n}>
                {n} tháng đến ngày kết thúc
              </option>
            ))}
          </select>
        </label>
        <label>
          Biểu đồ theo kỳ
          <select value={comparisonUnit} onChange={(e) => setComparisonUnit(e.target.value)}>
            <option value="month">Theo tháng</option>
            <option value="quarter">4 quý gần nhất</option>
            <option value="week">Các tuần của tháng kết thúc</option>
          </select>
        </label>
        <label>
          Nhóm kinh doanh
          <input value={team} maxLength={100} onChange={(e) => setTeam(e.target.value)} />
        </label>
        <label>
          Kỳ đối chiếu doanh số
          <select value={compareUnit} onChange={(e) => setCompareUnit(e.target.value)}>
            {[
              ['window', 'Cùng số ngày liền trước'],
              ['week', 'Tuần lịch trước'],
              ['month', 'Tháng lịch trước'],
              ['quarter', 'Quý lịch trước'],
              ['year', 'Năm lịch trước'],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <small>Kỳ lịch đối chiếu tính theo ngày bắt đầu khoảng xem.</small>
        </label>
        <button className="primary">
          <RefreshCw size={16} />
          Xem số liệu
        </button>
        <label>
          Đơn vị thời gian
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            {[
              ['auto', 'Tự động'],
              ['day', 'Ngày'],
              ['week', 'Tuần'],
              ['month', 'Tháng'],
              ['quarter', 'Quý'],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nguồn bán
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">Tất cả kênh</option>
            {Object.entries(salesChannels).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tên Fanpage / nguồn
          <input
            value={sourceText}
            maxLength={150}
            onChange={(e) => setSourceText(e.target.value)}
          />
        </label>
        <label>
          Người chốt
          <input value={staff} maxLength={100} onChange={(e) => setStaff(e.target.value)} />
        </label>
        <label>
          Vùng nhận
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Tất cả vùng</option>
            {Object.entries(deliveryRegions).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="report-presets">
          {[
            [1, 'Hôm nay'],
            [7, '7 ngày'],
            [-2, 'Tuần này'],
            [-3, 'Quý này'],
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
                  : `${growth > 0 ? '+' : ''}${growth}% so với ${d.previousFrom} – ${d.previousTo}`,
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
              ['Số đơn hoàn', integer(d.summary.returned), 'Hàng hoàn · không tính vào doanh số'],
              [
                'Tỷ lệ hoàn hàng',
                percent(d.summary.returnRate),
                'Đơn hoàn / (đơn hợp lệ + đơn hoàn) × 100',
              ],
            ].map(([label, value, note], index) => (
              <button
                type="button"
                className="panel business-kpi"
                key={label}
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() =>
                  setDetail({
                    title: label,
                    metric: [
                      'VALID',
                      'VALID',
                      'PAID',
                      'UNPAID',
                      'CUSTOMERS',
                      'CANCELLED',
                      'RETURNED',
                      'RETURNED',
                    ][index],
                  })
                }
              >
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </button>
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
            <MonthlyComparison
              rows={d.comparison}
              from={d.comparisonFrom!}
              to={d.comparisonTo!}
              unit={d.comparisonUnit}
            />
          )}
          {detailed && <ReportAiPanel openSettings={openAiSettings} />}
          {detailed && <Productivity actor={actor} />}
          <section className="panel">
            <div className="panel-head">
              <h2>Chi phí vận chuyển</h2>
            </div>
            <div className="sales-actions">
              {[
                ['SHIPPING_CHARGED', 'Đơn có phí thu khách'],
                ['SHIPPING_ESTIMATED', 'Đơn có cước tạm tính'],
                ['SHIPPING_ACTUAL', 'Đơn đã đối soát'],
                ['SHIPPING_UNKNOWN', 'Đơn chưa đối soát'],
                ['SHIPPING_COMPARABLE', 'Đơn đủ dữ liệu thu − chi'],
              ].map(([metric, title]) => (
                <button
                  key={metric}
                  className="text-button"
                  onClick={() => setDetail({ metric, title })}
                >
                  {title}
                </button>
              ))}
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
              loại đơn nháp và chưa rõ trạng thái; đơn hủy/hoàn tính phí thu khách bằng 0 nhưng vẫn
              trừ phí thực trả. Trạng thái vận chuyển không tự đổi trạng thái bán hàng sang Hàng
              hoàn. Đây không phải báo cáo lợi nhuận.
            </p>
          </section>
          <section className="panel report-chart">
            <div className="panel-head">
              <h2>
                Doanh số theo{' '}
                {
                  (
                    { day: 'ngày', week: 'tuần', month: 'tháng', quarter: 'quý' } as Record<
                      string,
                      string
                    >
                  )[d.bucket]
                }
              </h2>
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
            <h2>Theo nguồn bán hàng</h2>
            <MetricsTable
              rows={(d.salesSources || []).map((r) => ({
                ...r,
                label:
                  (salesChannels[r.salesChannel] || r.salesChannel) +
                  ' · ' +
                  r.label +
                  (r.sourcePageId ? ' (' + r.sourcePageId + ')' : ''),
              }))}
            />
            <p className="muted">
              Nguồn bán được ghi trên đơn; không tự suy ra Zalo từ khách mua lại. Kênh gốc Sapo được
              giữ theo dữ liệu nhập.
            </p>
          </section>
          <section className="panel">
            <h2>Theo nhóm kinh doanh</h2>
            <MetricsTable rows={d.teams || []} />
            <p className="muted">
              Nhóm được lưu trên từng đơn, không tự đổi theo phòng ban hiện tại của người chốt.
            </p>
          </section>
          {d.customerSegments && (
            <section className="panel">
              <h2>Tần suất mua của khách trong kỳ</h2>
              <p>
                Khách mua một lần: <strong>{d.customerSegments.once}</strong> · Khách mua nhiều lần:{' '}
                <strong>{d.customerSegments.repeat}</strong>
              </p>
              <p className="muted">
                Chọn khách có đơn hợp lệ trong kỳ/bộ lọc; số lần mua tính trên toàn bộ lịch sử đơn
                hợp lệ Sakura và Sapo của khách đó. Không tính đơn nháp, hủy, hoàn hoặc trạng thái
                chưa rõ.
              </p>
            </section>
          )}
          {detailed && (
            <section className="panel">
              <h2>Sản phẩm / mã hàng theo vùng nhận</h2>
              <form
                className="sales-toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery((current) => ({ ...current, product: productText }));
                }}
              >
                <label>
                  Tìm trong bảng sản phẩm
                  <input
                    value={productText}
                    maxLength={100}
                    onChange={(e) => setProductText(e.target.value)}
                    placeholder="Tên nhóm, sản phẩm hoặc SKU"
                  />
                </label>
                <button className="secondary">Lọc bảng sản phẩm</button>
              </form>
              <p className="muted">
                Tối đa 200 nhóm có giá trị tiền hàng cao nhất; số lượng tách theo đơn vị. Tiền hàng
                chưa trừ giảm giá toàn đơn và chưa cộng phí giao. Danh mục dùng nhóm sản phẩm hiện
                tại, không phải nhóm lịch sử.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nguồn dữ liệu</th>
                      <th>Vùng nhận</th>
                      <th>Nhóm / Sản phẩm</th>
                      <th>Mã hàng</th>
                      <th>Số lượng</th>
                      <th>Tiền hàng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.products || []).map((r, i) => (
                      <tr key={i}>
                        <td>{sourceName(r.source)}</td>
                        <td>{deliveryRegions[r.deliveryRegion] || r.deliveryRegion}</td>
                        <td>
                          {r.category}
                          <small className="block">{r.productName}</small>
                          {r.missingLines > 0 && (
                            <small className="block">
                              {r.missingLines} dòng thiếu dữ liệu số lượng/tiền
                            </small>
                          )}
                        </td>
                        <td>{r.sku || 'Chưa có mã'}</td>
                        <td>
                          {integer(r.quantity)} {r.unit}
                        </td>
                        <td>{money(r.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="panel">
            <h2>Theo vùng nhận hàng</h2>
            <MetricsTable
              rows={(d.deliveryRegions || []).map((r) => ({
                ...r,
                label: deliveryRegions[r.label] || r.label,
              }))}
            />
            <p className="muted">
              Vùng được ghi riêng trên từng đơn; đơn cũ chưa có vùng giao được để chưa ghi nhận.
            </p>
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
                          <td>
                            {r.source === 'SAKURA' ? orderStatuses[r.label] || r.label : r.label}
                          </td>
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
            giá trị đơn đã chốt/hoàn tất, gồm phí giao hàng và đã trừ giảm giá; loại đơn nháp, hủy,
            hoàn và trạng thái chưa xác định. Số tiền đã thu là lũy kế hiện tại của các đơn trong
            kỳ, không phải dòng tiền thu theo ngày. Chưa phải báo cáo lợi nhuận hoặc doanh thu kế
            toán sau hoàn trả. Tỷ lệ hoàn hàng = số đơn hoàn / (số đơn hợp lệ + số đơn hoàn) × 100,
            bằng 0% khi chưa có đơn đủ điều kiện. Đơn được xếp kỳ theo ngày tạo/đặt đơn, không phải
            ngày nhận hàng hoàn.
          </p>
        </>
      )}
      {detail && (
        <ReportOrders
          key={JSON.stringify(query) + detail.metric}
          query={query}
          metric={detail.metric}
          title={detail.title}
          actor={actor}
          close={() => setDetail(null)}
        />
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
            <th>Đơn hoàn</th>
            <th>Tỷ lệ hoàn hàng</th>
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
              <td>{r.returned}</td>
              <td>{percent(r.returnRate)}</td>
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
