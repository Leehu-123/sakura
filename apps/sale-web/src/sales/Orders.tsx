import { useState } from 'react';
import { Plus, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import { HistoricalOrderDetail } from '../imports/HistoricalOrders';
import {
  Actor,
  Customer,
  Order,
  Product,
  Variant,
  Page,
  has,
  money,
  date,
  number,
  orderStatuses,
  paymentStatuses,
  shippingStatuses,
} from './types';
import { useResource, State, Modal, Form, Pager, SearchBox } from './shared';
export function CreateOrder({
  customer,
  conversationId,
  close,
  done,
}: {
  customer: Customer;
  conversationId?: string;
  close: () => void;
  done: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState(''),
    [lines, setLines] = useState<{ variant: Variant; productName: string; quantity: number }[]>([]);
  const [discount, setDiscount] = useState('0'),
    [shipping, setShipping] = useState('0');
  const products = useResource<Page<Product>>(
    '/catalog/products?pageSize=20&search=' + encodeURIComponent(search),
  );
  const subtotal = lines.reduce(
    (sum, line) =>
      sum +
      BigInt(line.variant.price) * BigInt(Number.isInteger(line.quantity) ? line.quantity : 0),
    0n,
  );
  const total =
    subtotal -
    BigInt(/^\d{1,12}$/.test(discount) ? discount : 0) +
    BigInt(/^\d{1,12}$/.test(shipping) ? shipping : 0);
  return (
    <Modal title="Lập đơn hàng" close={close}>
      <div className="note">
        {customer.name} · {customer.phone}
        <br />
        {customer.address || 'Khách chưa có địa chỉ. Hãy bổ sung trước khi lập đơn.'}
      </div>
      <div className="order-product-search">
        <SearchBox placeholder="Tìm tên hoặc mã sản phẩm…" onSearch={setSearch} />
        <State loading={products.loading} error={products.error} />
        <div className="product-options">
          {products.data?.items
            .filter((p) => p.isActive)
            .flatMap((p) =>
              p.variants
                .filter((v) => v.isActive)
                .map((v) => (
                  <button
                    className="product-option"
                    key={v.id}
                    disabled={lines.some((l) => l.variant.id === v.id) || lines.length >= 50}
                    onClick={() =>
                      setLines((l) => [...l, { variant: v, productName: p.name, quantity: 1 }])
                    }
                  >
                    <span>
                      {p.name} · {v.name}
                      <small>
                        {v.sku} · {v.unit}
                      </small>
                    </span>
                    <strong>{money(v.price)}</strong>
                    <Plus size={16} />
                  </button>
                )),
            )}
        </div>
        {products.data && (
          <small className="muted">
            Hiển thị tối đa 20 sản phẩm phù hợp. Nhập mã hàng để tìm chính xác.
          </small>
        )}
      </div>
      {conversationId && (
        <label className="note order-confirm-toggle">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />{' '}
          Khách đã đồng ý — lưu và chốt đơn
        </label>
      )}
      <Form
        label={confirm ? 'Lưu và chốt đơn' : 'Tạo đơn nháp'}
        done={() => {}}
        submit={async (f) => {
          if (!lines.length) throw new Error('Hãy chọn ít nhất một sản phẩm.');
          const result = await api<Order>('/sales/orders', 'POST', {
            requestKey,
            customerId: customer.id,
            ...(conversationId ? { conversationId, confirm } : {}),
            customerVersion: customer.version,
            items: lines.map((l) => ({
              variantId: l.variant.id,
              quantity: l.quantity,
              expectedPrice: l.variant.price,
            })),
            discount,
            shippingFee: shipping,
            note: f.get('note'),
          });
          done(result.id);
        }}
      >
        <div className="order-lines">
          {lines.map((l) => (
            <div className="order-line" key={l.variant.id}>
              <span>
                {l.productName}
                <small>
                  {l.variant.name} · {money(l.variant.price)}/{l.variant.unit}
                </small>
              </span>
              <label>
                Số lượng
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  required
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x) =>
                        x.variant.id === l.variant.id
                          ? { ...x, quantity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() => setLines((ls) => ls.filter((x) => x.variant.id !== l.variant.id))}
              >
                Bỏ
              </button>
            </div>
          ))}
        </div>
        <div className="form-grid">
          <label>
            Giảm giá toàn đơn (đ)
            <input
              inputMode="numeric"
              pattern="[0-9]{1,12}"
              required
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label>
            Phí giao hàng (đ)
            <input
              inputMode="numeric"
              pattern="[0-9]{1,12}"
              required
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
            />
          </label>
        </div>
        <label>
          Ghi chú đơn
          <textarea name="note" maxLength={2000} />
        </label>
        <div className="order-total">
          <span>Tạm tính</span>
          <strong>{money(total)}</strong>
        </div>
        <small className="muted">
          Đơn nháp chưa tạo vận đơn. Giá và địa chỉ được lưu tại thời điểm tạo đơn.
        </small>
      </Form>
    </Modal>
  );
}
export function OrderDetail({ id, actor, back }: { id: string; actor: Actor; back: () => void }) {
  const [revision, setRevision] = useState(0),
    [action, setAction] = useState<string | null>(null);
  const result = useResource<Order>('/sales/orders/' + id, revision);
  const order = result.data;
  return (
    <>
      <button className="text-button" onClick={back}>
        <ArrowLeft size={16} />
        Danh sách đơn
      </button>
      <State loading={result.loading} error={result.error} />
      {order && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>{number(order.number)}</h2>
              <span className="badge">{orderStatuses[order.status]}</span>
            </div>
            <div className="sales-detail-grid">
              <div>
                <h3>Thông tin giao hàng</h3>
                <strong>{order.recipientName}</strong>
                <p>
                  {order.recipientPhone}
                  <br />
                  {order.shippingAddress}
                </p>
                <small className="muted">Thông tin đã lưu khi tạo đơn.</small>
              </div>
              <div>
                <h3>Ghi nhận bán hàng</h3>
                <p>
                  Người tạo: {order.createdBy.displayName}
                  <br />
                  Người chốt: <strong>{order.closedBy?.displayName || 'Chưa chốt'}</strong>
                  <br />
                  Ngày tạo: {date(order.createdAt)}
                </p>
                <p>
                  {paymentStatuses[order.paymentStatus]} · Đã thu {money(order.paidAmount)}
                  <br />
                  Vận chuyển: {shippingStatuses[order.shippingStatus]}
                  <br />
                  {order.carrierName || 'Chưa có đối tác'} ·{' '}
                  {order.trackingCode || 'Chưa có mã vận đơn'}
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Đơn giá</th>
                    <th>Số lượng</th>
                    <th>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.productName}
                        <small className="block muted">
                          {l.variantName} · {l.sku}
                        </small>
                      </td>
                      <td>{money(l.unitPrice)}</td>
                      <td>
                        {l.quantity} {l.unit}
                      </td>
                      <td>{money(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="order-summary">
              <p>
                Tiền hàng <strong>{money(order.subtotal)}</strong>
              </p>
              <p>
                Giảm giá <strong>−{money(order.discount)}</strong>
              </p>
              <p>
                Phí giao hàng <strong>{money(order.shippingFee)}</strong>
              </p>
              <p className="order-total">
                Tổng đơn <strong>{money(order.total)}</strong>
              </p>
            </div>
            {order.note && <p className="product-description">{order.note}</p>}
            {has(actor, 'sales.orders.manage') && (
              <div className="sales-actions">
                {order.status === 'DRAFT' && (
                  <button className="primary" onClick={() => setAction('CONFIRMED')}>
                    Chốt đơn
                  </button>
                )}
                {order.status === 'CONFIRMED' && (
                  <button className="primary" onClick={() => setAction('COMPLETED')}>
                    Đánh dấu hoàn tất
                  </button>
                )}
                {['CONFIRMED', 'COMPLETED'].includes(order.status) && (
                  <button className="secondary" onClick={() => setAction('payment')}>
                    Ghi nhận tiền đã thu
                  </button>
                )}
                {['DRAFT', 'CONFIRMED'].includes(order.status) && (
                  <button className="secondary" onClick={() => setAction('CANCELLED')}>
                    Hủy đơn
                  </button>
                )}
              </div>
            )}
          </section>
          <section className="panel activity-panel">
            <h2>Lịch sử đơn hàng</h2>
            <small className="muted">100 thao tác gần nhất.</small>
            {order.history?.map((h) => (
              <div className="activity" key={h.id}>
                <strong>{h.actor.displayName}</strong>
                <small>{date(h.createdAt)}</small>
                <p>
                  {h.note.replace(/DRAFT|CONFIRMED|COMPLETED|CANCELLED/g, (s) => orderStatuses[s])}
                </p>
              </div>
            ))}
          </section>
          {action && (
            <Modal
              title={action === 'payment' ? 'Ghi nhận tiền đã thu' : orderStatuses[action]}
              close={() => setAction(null)}
            >
              <Form
                label="Xác nhận"
                done={() => {
                  setAction(null);
                  setRevision((v) => v + 1);
                }}
                submit={(f) =>
                  action === 'payment'
                    ? api('/sales/orders/' + id + '/payments', 'POST', {
                        version: order.version,
                        paidAmount: f.get('paidAmount'),
                        note: f.get('note'),
                      })
                    : api('/sales/orders/' + id + '/status', 'PATCH', {
                        version: order.version,
                        status: action,
                        reason: f.get('reason') || '',
                      })
                }
              >
                {action === 'payment' ? (
                  <>
                    <label>
                      Tổng tiền đã nhận (đ)
                      <input
                        name="paidAmount"
                        required
                        inputMode="numeric"
                        pattern="[0-9]{1,15}"
                        defaultValue={order.paidAmount}
                      />
                      <small>
                        Nhập tổng lũy kế đã nhận cho đơn này, không phải số tiền cộng thêm.
                      </small>
                    </label>
                    <label>
                      Nội dung thu tiền
                      <textarea name="note" required minLength={3} maxLength={1000} />
                    </label>
                  </>
                ) : (
                  <>
                    <p>
                      {action === 'CONFIRMED'
                        ? 'Bạn sẽ được ghi nhận là người chốt đơn này.'
                        : action === 'CANCELLED'
                          ? 'Đơn hủy không thể mở lại. Đơn đã thu tiền cần xử lý hoàn tiền trước.'
                          : 'Xác nhận việc xử lý đơn đã hoàn tất. Trạng thái thu tiền được quản lý riêng.'}
                    </p>
                    <label>
                      {action === 'CANCELLED' ? 'Lý do hủy' : 'Ghi chú (tùy chọn)'}
                      <textarea
                        name="reason"
                        required={action === 'CANCELLED'}
                        minLength={action === 'CANCELLED' ? 3 : undefined}
                        maxLength={1000}
                      />
                    </label>
                  </>
                )}
              </Form>
            </Modal>
          )}
        </>
      )}
    </>
  );
}
type FeedOrder = {
  id: string;
  source: 'SAKURA' | 'SAPO';
  number: string;
  customerId: string | null;
  customerName: string;
  orderedAt: string;
  status: string;
  total: string;
  paidAmount: string | null;
  paymentStatus: string;
  closedBy: string | null;
  sourceCreatedBy: string;
};
export function Orders({ actor }: { actor: Actor }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [source, setSource] = useState('ALL'),
    [status, setStatus] = useState(''),
    [link, setLink] = useState('ALL'),
    [selected, setSelected] = useState<FeedOrder | null>(null),
    [revision, setRevision] = useState(0);
  const result = useResource<Page<FeedOrder>>(
    '/sales/order-feed?' +
      new URLSearchParams({
        page: String(page),
        search,
        source,
        status,
        link,
      }),
    revision,
  );
  const close = () => {
    setSelected(null);
    setRevision((v) => v + 1);
  };
  if (selected?.source === 'SAKURA')
    return <OrderDetail id={selected.id} actor={actor} back={close} />;
  return (
    <>
      <div className="sales-toolbar">
        <SearchBox
          placeholder="Tìm mã đơn Sakura, Sapo hoặc tên khách…"
          onSearch={(s) => {
            setSearch(s);
            setPage(1);
          }}
        />
        <label className="filter-label">
          Nguồn đơn
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setStatus('');
              setPage(1);
            }}
          >
            <option value="ALL">Tất cả đơn hàng</option>
            <option value="SAKURA">Sakura</option>
            <option value="SAPO">Sapo đã nhập</option>
          </select>
        </label>
        <label className="filter-label">
          Trạng thái
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {source !== 'SAPO' && (
              <optgroup label="Sakura">
                {Object.entries(orderStatuses).map(([v, t]) => (
                  <option key={v} value={'SAKURA:' + v}>
                    {t}
                  </option>
                ))}
              </optgroup>
            )}
            {source !== 'SAKURA' && (
              <optgroup label="Sapo">
                {['Đang giao dịch', 'Đã hoàn thành', 'Đã hủy', 'Đã lưu trữ', 'Đặt hàng'].map(
                  (v) => (
                    <option key={v} value={'SAPO:' + v}>
                      {v}
                    </option>
                  ),
                )}
              </optgroup>
            )}
          </select>
        </label>
        <label className="filter-label">
          Hồ sơ khách
          <select
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Tất cả</option>
            <option value="LINKED">Đã liên kết</option>
            <option value="UNLINKED">Chưa liên kết</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Đơn Sakura và đơn đã nhập từ Sapo được tra cứu chung theo ngày đặt. Lập đơn mới từ hồ sơ
        khách hàng.
      </p>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn / Ngày đặt</th>
                  <th>Nguồn</th>
                  <th>Khách hàng</th>
                  <th>Người chốt</th>
                  <th>Trạng thái</th>
                  <th>Đã thu / Tổng đơn</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((o) => (
                  <tr key={o.source + o.id}>
                    <td>
                      <button className="text-button link-button" onClick={() => setSelected(o)}>
                        {o.number}
                      </button>
                      <small className="block muted">{date(o.orderedAt)}</small>
                    </td>
                    <td>
                      <span className={'badge ' + (o.source === 'SAPO' ? 'gray' : 'green')}>
                        {o.source === 'SAPO' ? 'Sapo' : 'Sakura'}
                      </span>
                    </td>
                    <td>
                      {o.customerName}
                      {!o.customerId && <small className="block muted">Chưa liên kết hồ sơ</small>}
                    </td>
                    <td>
                      {o.closedBy || (o.source === 'SAPO' ? 'Không có trong nguồn' : 'Chưa chốt')}
                      {o.sourceCreatedBy && (
                        <small className="block muted">Người tạo: {o.sourceCreatedBy}</small>
                      )}
                    </td>
                    <td>
                      <span className="badge">
                        {o.source === 'SAPO' ? o.status : orderStatuses[o.status]}
                      </span>
                      <small className="block muted">
                        {o.source === 'SAPO'
                          ? o.paymentStatus || 'Thanh toán chưa rõ'
                          : paymentStatuses[o.paymentStatus]}
                      </small>
                    </td>
                    <td>
                      {o.paidAmount == null ? 'Chưa rõ' : money(o.paidAmount)} /{' '}
                      <strong>{money(o.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <State loading={false} error="" empty={!result.data.items.length} />
          <Pager data={result.data} page={page} setPage={setPage} />
        </section>
      )}
      {selected?.source === 'SAPO' && <HistoricalOrderDetail id={selected.id} close={close} />}
    </>
  );
}
