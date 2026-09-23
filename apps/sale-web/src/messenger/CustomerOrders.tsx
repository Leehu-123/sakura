import { useRef, useState } from 'react';
import { Printer, MoreHorizontal, Truck } from 'lucide-react';
import { api } from '../api';
import {
  Actor,
  Order,
  Page,
  has,
  money,
  date,
  number,
  orderStatuses,
  shippingStatuses,
} from '../sales/types';
import { Form, Modal, State, Pager, useResource } from '../sales/shared';
import { DeliveryDialog } from './DeliveryDialog';
import { ConfirmationDialog } from './WorkspaceTools';
import { HistoricalOrderDetail } from '../imports/HistoricalOrders';
import { printSlip } from './printSlip';
function OrderActions({
  order: o,
  action,
  close,
  done,
}: {
  order: Order;
  action: string;
  close: () => void;
  done: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null),
    [error, setError] = useState('');
  if (action === 'print')
    return (
      <Modal title="In đơn hàng" close={close}>
        <div ref={sheet} className="order-print">
          <h2>SAKURA · ĐƠN HÀNG {number(o.number)}</h2>
          <p>
            {date(o.createdAt)} · {orderStatuses[o.status]}
          </p>
          <h3>
            {o.recipientName} · {o.recipientPhone}
          </h3>
          <p>{o.shippingAddress}</p>
          <table>
            <thead>
              <tr>
                <th>Hàng hóa</th>
                <th>SL</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {o.items?.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.productName} · {i.variantName}
                    <br />
                    {i.sku}
                  </td>
                  <td>
                    {i.quantity} {i.unit}
                  </td>
                  <td>{money(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Tiền hàng: {money(o.subtotal)} · Giảm giá: {money(o.discount)} · Phí giao:{' '}
            {money(o.shippingFee)}
          </p>
          <p>
            Tổng cộng: {money(o.total)} · Đã thu: {money(o.paidAmount)}
          </p>
          <p>Còn phải thu: {money(BigInt(o.total) - BigInt(o.paidAmount))}</p>
          <p>
            Vận chuyển: {o.carrierName || 'Chưa có'} · {o.trackingCode} ·{' '}
            {shippingStatuses[o.shippingStatus]}
          </p>
          <p>
            Người tạo: {o.createdBy.displayName} · Ghi chú: {o.note || 'Không có'}
          </p>
          <small>Chứng từ bán hàng nội bộ, không phải hóa đơn GTGT.</small>
        </div>
        <State loading={false} error={error} />
        <button
          className="primary"
          onClick={async () => {
            try {
              const latest = await api<Order>('/sales/orders/' + o.id);
              if (latest.version !== o.version)
                throw Error('Đơn đã thay đổi. Đóng bản in rồi tải lại đơn.');
              if (sheet.current) await printSlip(sheet.current);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          In đơn
        </button>
      </Modal>
    );
  return (
    <Modal
      title={
        action === 'payment'
          ? 'Xác nhận thanh toán'
          : action === 'shipping'
            ? 'Cập nhật vận chuyển'
            : 'Hủy đơn hàng'
      }
      close={close}
    >
      <Form
        label="Lưu xác nhận"
        done={done}
        submit={(f) =>
          action === 'payment'
            ? api('/sales/orders/' + o.id + '/payments', 'POST', {
                version: o.version,
                paidAmount: f.get('paidAmount'),
                note: f.get('note'),
              })
            : action === 'shipping'
              ? api('/sales/orders/' + o.id + '/shipping', 'PATCH', {
                  version: o.version,
                  carrierName: f.get('carrierName'),
                  trackingCode: f.get('trackingCode'),
                  shippingStatus: f.get('shippingStatus'),
                })
              : api('/sales/orders/' + o.id + '/status', 'PATCH', {
                  version: o.version,
                  status: 'CANCELLED',
                  reason: f.get('reason'),
                })
        }
      >
        {action === 'payment' ? (
          <>
            <p>Nhập tổng tiền đã nhận lũy kế, không phải khoản cộng thêm.</p>
            <label>
              Tổng đã nhận (đ)
              <input name="paidAmount" required pattern="[0-9]{1,15}" defaultValue={o.paidAmount} />
            </label>
            <label>
              Nội dung thu tiền
              <textarea name="note" required minLength={3} maxLength={1000} />
            </label>
          </>
        ) : action === 'shipping' ? (
          <>
            <p className="muted">
              Thông tin ghi nhận thủ công. Chưa tạo hoặc đồng bộ vận đơn với hãng.
            </p>
            <label>
              Đối tác vận chuyển
              <input name="carrierName" defaultValue={o.carrierName} maxLength={120} />
            </label>
            <label>
              Mã vận đơn
              <input name="trackingCode" defaultValue={o.trackingCode} maxLength={100} />
            </label>
            <label>
              Trạng thái vận chuyển
              <select name="shippingStatus" defaultValue={o.shippingStatus}>
                {Object.entries(shippingStatuses).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <p>Đơn hủy không thể mở lại. Đơn đã thu tiền cần xử lý hoàn tiền trước.</p>
            <label>
              Lý do hủy
              <textarea name="reason" required minLength={3} maxLength={1000} />
            </label>
          </>
        )}
      </Form>
    </Modal>
  );
}
function NativeCard({
  initial,
  id,
  actor,
  canSend,
  changed,
  open,
  toggle,
  revision,
}: {
  initial: Order;
  id: string;
  actor: Actor;
  canSend: boolean;
  changed: () => void;
  open: boolean;
  toggle: () => void;
  revision: number;
}) {
  const [rev, setRev] = useState(0),
    [action, setAction] = useState(''),
    [menu, setMenu] = useState(false);
  const r = useResource<Order>('/sales/orders/' + initial.id, rev + revision, open),
    o = r.data;
  const refresh = () => {
    setAction('');
    setMenu(false);
    setRev((v) => v + 1);
    changed();
  };
  return (
    <article className="customer-order-card">
      <button className="order-card-heading" onClick={toggle}>
        <strong>{number(initial.number)}</strong>
        <span className="badge">{orderStatuses[initial.status]}</span>
        <small>
          {date(initial.createdAt)} {open ? '⌃' : '⌄'}
        </small>
      </button>
      {open && (
        <>
          <State loading={r.loading} error={r.error} />
          {o && (
            <div className="order-card-body">
              <strong>{o.recipientName}</strong> ·{' '}
              <a href={'tel:' + o.recipientPhone}>{o.recipientPhone}</a>
              <p>{o.shippingAddress}</p>
              <div className="contact-order-items">
                {o.items?.map((i) => (
                  <div key={i.id}>
                    <span>
                      {i.productName} · {i.variantName}
                      <small>{i.sku}</small>
                    </span>
                    <strong>×{i.quantity}</strong>
                    <small>{money(i.lineTotal)}</small>
                  </div>
                ))}
              </div>
              <dl className="contact-order-facts">
                <dt>Thành tiền</dt>
                <dd>
                  <strong>{money(o.total)}</strong>
                </dd>
                <dt>Đã thanh toán</dt>
                <dd>{money(o.paidAmount)}</dd>
                <dt>Còn phải thu</dt>
                <dd>{money(BigInt(o.total) - BigInt(o.paidAmount))}</dd>
              </dl>
              <div className="contact-section-head">
                <h4>Vận chuyển</h4>
                {has(actor, 'sales.shipments.manage') &&
                  ['CONFIRMED', 'COMPLETED'].includes(o.status) && (
                    <button className="text-button" onClick={() => setAction('shipping')}>
                      Cập nhật
                    </button>
                  )}
              </div>
              <dl className="contact-order-facts">
                <dt>Đối tác</dt>
                <dd>{o.carrierName || 'Chưa có'}</dd>
                <dt>Mã vận đơn</dt>
                <dd>{o.trackingCode || 'Chưa có'}</dd>
                <dt>Trạng thái</dt>
                <dd>{shippingStatuses[o.shippingStatus]}</dd>
                <dt>Người tạo</dt>
                <dd>{o.createdBy.displayName}</dd>
                <dt>Người chốt</dt>
                <dd>{o.closedBy?.displayName || 'Chưa chốt'}</dd>
                <dt>Ghi chú</dt>
                <dd>{o.note || 'Chưa có'}</dd>
              </dl>
              <div className="order-card-actions">
                {has(actor, 'sales.shipments.manage') &&
                  ['CONFIRMED', 'COMPLETED'].includes(o.status) && (
                    <button className="primary" onClick={() => setAction('slip')}>
                      <Printer size={14} />
                      In phiếu giao hàng
                    </button>
                  )}
                <button
                  className="secondary"
                  aria-label={'Thao tác khác ' + number(o.number)}
                  aria-expanded={menu}
                  onClick={() => setMenu(!menu)}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              {menu && (
                <div className="order-action-menu">
                  {has(actor, 'sales.orders.manage') &&
                    ['CONFIRMED', 'COMPLETED'].includes(o.status) && (
                      <button onClick={() => setAction('payment')}>Xác nhận thanh toán</button>
                    )}
                  <button onClick={() => setAction('print')}>In đơn</button>
                  {['CONFIRMED', 'COMPLETED'].includes(o.status) && (
                    <button onClick={() => setAction('invoice')}>Gửi hóa đơn</button>
                  )}
                  {o.status === 'CONFIRMED' && (
                    <button onClick={() => setAction('confirmation')}>Gửi xác nhận đơn</button>
                  )}
                  {has(actor, 'sales.orders.manage') &&
                    ['DRAFT', 'CONFIRMED'].includes(o.status) && (
                      <button className="danger" onClick={() => setAction('cancel')}>
                        Hủy đơn
                      </button>
                    )}
                </div>
              )}
              {action === 'slip' && <DeliveryDialog order={o} close={() => setAction('')} />}{' '}
              {['invoice', 'confirmation'].includes(action) && (
                <ConfirmationDialog
                  invoice={action === 'invoice'}
                  id={id}
                  orderId={o.id}
                  canSend={canSend}
                  close={() => setAction('')}
                  done={refresh}
                />
              )}{' '}
              {['payment', 'shipping', 'cancel', 'print'].includes(action) && (
                <OrderActions
                  order={o}
                  action={action}
                  close={() => setAction('')}
                  done={refresh}
                />
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
export function CustomerOrders({
  customerId,
  id,
  actor,
  canSend,
  revision,
  changed,
}: {
  customerId: string;
  id: string;
  actor: Actor;
  canSend: boolean;
  revision: number;
  changed: () => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [source, setSource] = useState('SAKURA'),
    [history, setHistory] = useState<string | null>(null);
  const r = useResource<Page<Order>>(
    '/sales/orders?customerId=' + customerId + '&pageSize=5&page=' + page,
    revision,
    source === 'SAKURA',
  );
  const old = useResource<
    Page<{ id: string; number: string; sourceStatus: string; total: string; orderedAt: string }>
  >(
    '/sales/historical-orders?customerId=' + customerId + '&page=' + page,
    revision,
    source === 'SAPO',
  );
  return (
    <section className="contact-section">
      <div className="contact-section-head">
        <h3>Đơn hàng ({(source === 'SAKURA' ? r.data : old.data)?.total || 0})</h3>
        <select
          aria-label="Nguồn đơn của khách"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
            setSelected(null);
          }}
        >
          <option value="SAKURA">Sakura</option>
          <option value="SAPO">Sapo cũ</option>
        </select>
      </div>
      <State
        loading={source === 'SAKURA' ? r.loading : old.loading}
        error={source === 'SAKURA' ? r.error : old.error}
      />
      {source === 'SAKURA' ? (
        <>
          {r.data?.items.map((o, i) => (
            <NativeCard
              key={o.id}
              initial={o}
              id={id}
              actor={actor}
              canSend={canSend}
              revision={revision}
              changed={changed}
              open={selected === o.id || (selected === null && i === 0)}
              toggle={() =>
                setSelected(selected === o.id || (selected === null && i === 0) ? '' : o.id)
              }
            />
          ))}
          {r.data && r.data.total > 5 && <Pager data={r.data} page={page} setPage={setPage} />}
        </>
      ) : (
        <>
          <p className="muted">Đơn Sapo lưu trữ để tra cứu; không thay đổi trạng thái nguồn.</p>
          {old.data?.items.map((o) => (
            <button className="historical-card" key={o.id} onClick={() => setHistory(o.id)}>
              <strong>{o.number}</strong>
              <span>{o.sourceStatus}</span>
              <span>{money(o.total)}</span>
              <small>{date(o.orderedAt)}</small>
            </button>
          ))}
          {old.data && old.data.total > 20 && (
            <Pager data={old.data} page={page} setPage={setPage} />
          )}
        </>
      )}
      {(source === 'SAKURA' ? r.data : old.data)?.total === 0 && (
        <p className="muted">Chưa có đơn từ nguồn này.</p>
      )}
      {history && <HistoricalOrderDetail id={history} close={() => setHistory(null)} />}
    </section>
  );
}
