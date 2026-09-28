import { useState } from 'react';
import { api } from '../api';
import { Actor, Order, has, money, date, shippingStatuses } from '../sales/types';
import { Form, Modal, State, useResource } from '../sales/shared';
type Event = {
  id: string;
  trackingCode: string;
  statusLabel: string;
  estimatedFee: string | null;
  carrierUpdatedAt: string;
  observedAt: string;
};
export function ShipmentTracking({
  order: o,
  actor,
  changed,
  editShipping = true,
}: {
  order: Order;
  actor: Actor;
  changed: () => void;
  editShipping?: boolean;
}) {
  const [action, setAction] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const history = useResource<Event[]>(
    '/sales/orders/' + o.id + '/shipping-events',
    o.version,
    action === 'history',
  );
  const manage = has(actor, 'sales.shipments.manage') && o.status !== 'DRAFT';
  return (
    <div className="shipment-tracking">
      {o.carrierStatusLabel && (
        <p>
          <strong>VNPost: {o.carrierStatusLabel}</strong>
          <small className="block muted">Hãng cập nhật: {date(o.carrierUpdatedAt)}</small>
        </p>
      )}
      <dl className="contact-order-facts">
        <dt>Phí thu khách</dt>
        <dd>{money(o.shippingFee)}</dd>
        <dt>Cước VNPost tạm tính</dt>
        <dd>{o.carrierEstimatedFee == null ? 'Chưa có dữ liệu' : money(o.carrierEstimatedFee)}</dd>
        <dt>Phí thực trả đã đối soát</dt>
        <dd>{o.shippingCost == null ? 'Chưa đối soát' : money(o.shippingCost)}</dd>
      </dl>
      {o.shippingCostNote && <p className="muted">Đối soát: {o.shippingCostNote}</p>}
      {o.shippingSyncedAt && (
        <small className="block muted">Đồng bộ gần nhất: {date(o.shippingSyncedAt)}</small>
      )}
      <State loading={false} error={error || o.shippingSyncError || ''} />
      <div className="sales-actions">
        {manage && (
          <>
            {editShipping && ['CONFIRMED', 'COMPLETED'].includes(o.status) && (
              <button className="secondary" onClick={() => setAction('shipping')}>
                Cập nhật vận chuyển
              </button>
            )}
            {o.carrierName.toLowerCase() === 'vnpost' && o.trackingCode && (
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api('/sales/orders/' + o.id + '/shipping-sync', 'POST', {
                      version: o.version,
                    });
                    changed();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Đang đồng bộ…' : 'Đồng bộ VNPost'}
              </button>
            )}
            <button className="secondary" onClick={() => setAction('cost')}>
              Ghi phí thực trả
            </button>
          </>
        )}
        {o.trackingCode && (
          <button className="text-button" onClick={() => setAction('history')}>
            Lịch sử vận chuyển
          </button>
        )}
      </div>
      {action === 'history' && (
        <Modal title="Lịch sử đồng bộ vận chuyển" close={() => setAction('')}>
          <p className="muted">
            50 thay đổi gần nhất Sakura ghi nhận từ VNPost. Không phải toàn bộ lịch trình trước khi
            kết nối.
          </p>
          <State loading={history.loading} error={history.error} />
          {history.data?.map((e) => (
            <div className="activity" key={e.id}>
              <strong>{e.statusLabel}</strong>
              <small>{date(e.carrierUpdatedAt)}</small>
              <p>
                {e.trackingCode} · Cước tạm tính{' '}
                {e.estimatedFee === null ? 'chưa có dữ liệu' : money(e.estimatedFee)}
              </p>
            </div>
          ))}
          {!history.loading && history.data?.length === 0 && <p>Chưa có lần đồng bộ thành công.</p>}
        </Modal>
      )}
      {['shipping', 'cost'].includes(action) && (
        <Modal
          title={action === 'cost' ? 'Phí vận chuyển thực trả' : 'Cập nhật vận chuyển'}
          close={() => setAction('')}
        >
          <Form
            label="Lưu"
            done={() => {
              setAction('');
              changed();
            }}
            submit={(f) =>
              action === 'cost'
                ? api('/sales/orders/' + o.id + '/shipping-cost', 'PATCH', {
                    version: o.version,
                    amount: f.get('amount') || null,
                    note: f.get('note'),
                  })
                : api('/sales/orders/' + o.id + '/shipping', 'PATCH', {
                    version: o.version,
                    carrierName: f.get('carrierName'),
                    trackingCode: f.get('trackingCode'),
                    shippingStatus: f.get('shippingStatus'),
                  })
            }
          >
            {action === 'cost' ? (
              <>
                <p>
                  Nhập tổng phí thực trả lũy kế của đơn theo đối soát (gồm phí hoàn/phụ phí nếu có).
                  Không cộng dồn lần nhập. Để trống khi chưa xác định; nhập 0 nếu đã xác nhận miễn
                  phí.
                </p>
                <label>
                  Phí thực trả (đ)
                  <input
                    name="amount"
                    inputMode="numeric"
                    pattern="[0-9]{1,12}"
                    defaultValue={o.shippingCost ?? ''}
                  />
                </label>
                <label>
                  Ghi chú đối soát
                  <textarea
                    name="note"
                    required
                    minLength={3}
                    maxLength={1000}
                    placeholder="Số bảng kê, ngày thanh toán…"
                    defaultValue={o.shippingCostNote}
                  />
                </label>
              </>
            ) : (
              <>
                <p>Với VNPost, lưu mã vận đơn rồi bấm Đồng bộ VNPost để lấy trạng thái và cước.</p>
                <label>
                  Đối tác vận chuyển
                  <input
                    name="carrierName"
                    defaultValue={o.carrierName}
                    list="shipping-carriers"
                    maxLength={120}
                  />
                  <datalist id="shipping-carriers">
                    <option value="VNPost" />
                  </datalist>
                </label>
                <label>
                  Mã vận đơn
                  <input name="trackingCode" defaultValue={o.trackingCode} maxLength={100} />
                </label>
                <label>
                  Trạng thái
                  <select name="shippingStatus" defaultValue={o.shippingStatus}>
                    {Object.entries(shippingStatuses).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </Form>
        </Modal>
      )}
    </div>
  );
}
