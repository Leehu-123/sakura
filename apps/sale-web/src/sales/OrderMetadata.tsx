import { useState } from 'react';
import { Actor, Order, Person, date } from './types';
import { Modal, Form, State, useResource } from './shared';
import { api } from '../api';
export const salesChannels: Record<string, string> = {
  UNKNOWN: 'Chưa ghi nhận',
  PAGE: 'Fanpage',
  ZALO: 'Zalo',
  SELF: 'Nhân viên tự tìm',
  OTHER: 'Khác',
};
export const deliveryRegions: Record<string, string> = {
  UNKNOWN: 'Chưa ghi nhận',
  NORTH: 'Miền Bắc',
  CENTRAL: 'Miền Trung',
  SOUTH: 'Miền Nam',
  HIGHLANDS: 'Tây Nguyên',
};
export const codStatuses: Record<string, string> = {
  UNKNOWN: 'Chưa ghi nhận',
  NOT_COD: 'Không COD',
  WAITING_COLLECTION: 'Chờ hãng thu',
  COLLECTED: 'Hãng đã thu, chờ chuyển',
  REMITTED: 'Hãng đã chuyển tiền',
};
export function OrderSourceFields({
  order,
  defaultChannel = 'UNKNOWN',
}: {
  order?: Order;
  defaultChannel?: string;
}) {
  return (
    <div className="form-grid">
      <label>
        Nguồn bán hàng
        <select name="salesChannel" defaultValue={order?.salesChannel || defaultChannel}>
          {Object.entries(salesChannels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tên Fanpage / nguồn cụ thể
        <input name="salesSourceName" maxLength={150} defaultValue={order?.salesSourceName || ''} />
      </label>
      <label>
        Nhóm kinh doanh
        <input name="salesTeamName" maxLength={100} defaultValue={order?.salesTeamName || ''} />
        <small>Ghi nhóm phụ trách của đơn tại thời điểm xử lý.</small>
      </label>
      <label>
        Vùng nhận hàng
        <select name="deliveryRegion" defaultValue={order?.deliveryRegion || 'UNKNOWN'}>
          {Object.entries(deliveryRegions).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <small>Chọn theo địa chỉ nhận hàng của đơn này.</small>
      </label>
    </div>
  );
}
const inputDate = (value: string | null) =>
  value ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16) : '';
export function OrderMetadata({
  order,
  actor,
  editable,
  changed,
}: {
  order: Order;
  actor: Actor;
  editable: boolean;
  changed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const global = actor.grants.some(
    (g) => g.permission === 'sales.orders.manage' && g.scope === 'GLOBAL',
  );
  const people = useResource<Person[]>('/sales/orders/closers', 0, open && global);
  return (
    <section className="panel">
      <h3>Phân loại và đối soát đơn</h3>
      <p>
        Nguồn bán: {salesChannels[order.salesChannel]} ·{' '}
        {order.salesSourceName || order.sourcePageId || 'Chưa có tên nguồn'}
      </p>
      <p>
        Vùng nhận: {deliveryRegions[order.deliveryRegion]} · COD: {codStatuses[order.codStatus]}
      </p>
      <p>
        Hẹn giao: {date(order.promisedDeliveryAt)} · Giao thực tế: {date(order.deliveredAt)}
      </p>
      {editable && (
        <button className="secondary" onClick={() => setOpen(true)}>
          Cập nhật nguồn, vùng giao, COD và người chốt
        </button>
      )}
      {open && (
        <Modal title="Phân loại và đối soát đơn" close={() => setOpen(false)}>
          <Form
            done={() => {
              setOpen(false);
              changed();
            }}
            submit={(f) =>
              api('/sales/orders/' + order.id + '/metadata', 'PATCH', {
                version: order.version,
                salesChannel: f.get('salesChannel'),
                salesTeamName: f.get('salesTeamName'),
                salesSourceName: f.get('salesSourceName'),
                deliveryRegion: f.get('deliveryRegion'),
                codStatus: f.get('codStatus'),
                promisedDeliveryAt: f.get('promisedDeliveryAt')
                  ? new Date(f.get('promisedDeliveryAt') + ':00+07:00').toISOString()
                  : null,
                deliveredAt: f.get('deliveredAt')
                  ? new Date(f.get('deliveredAt') + ':00+07:00').toISOString()
                  : null,
                ...(global && order.closedByUserId
                  ? { closedByUserId: f.get('closedByUserId') }
                  : {}),
                reason: f.get('reason'),
              })
            }
          >
            <OrderSourceFields order={order} />
            <label>
              Trạng thái COD
              <select name="codStatus" defaultValue={order.codStatus}>
                {Object.entries(codStatuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Thời hạn giao cam kết
                <input
                  name="promisedDeliveryAt"
                  type="datetime-local"
                  defaultValue={inputDate(order.promisedDeliveryAt)}
                />
              </label>
              <label>
                Giao thực tế
                <input
                  name="deliveredAt"
                  type="datetime-local"
                  defaultValue={inputDate(order.deliveredAt)}
                />
              </label>
            </div>
            {global && order.closedByUserId && (
              <label>
                Người chốt
                <State loading={people.loading} error={people.error} />
                <select name="closedByUserId" defaultValue={order.closedByUserId}>
                  <option value={order.closedByUserId}>
                    {order.closedBy?.displayName || 'Người chốt hiện tại'}
                  </option>
                  {people.data
                    ?.filter((p) => p.id !== order.closedByUserId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Lý do cập nhật
              <textarea name="reason" required minLength={3} maxLength={1000} />
            </label>
            <small>
              Đối soát COD ghi nhận trạng thái, không tự cộng tiền đã thu. Các mốc giao hàng cần dữ
              liệu thực tế; không tự suy ra từ lần hãng cập nhật.
            </small>
          </Form>
        </Modal>
      )}
    </section>
  );
}
