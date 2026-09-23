import { useState } from 'react';
import { useResource, State, Pager, SearchBox, Modal } from '../sales/shared';
import { SourceData } from './SourceData';
import { date, money, Page } from '../sales/types';
type HistoricalOrder = {
  id: string;
  externalId: string;
  number: string;
  customer: { id: string; name: string } | null;
  sourceCustomerName: string;
  sourceCreatedBy: string;
  sourceChannel: string;
  linkMethod: string;
  sourceData?: Record<string, unknown>;
  sourceStatus: string;
  sourcePaymentStatus: string;
  sourceShippingStatus: string;
  sourceClosedBy: string;
  orderedAt: string;
  importedAt: string;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  subtotal: string | null;
  discount: string | null;
  shippingFee: string | null;
  total: string;
  paidAmount: string | null;
  items: Record<string, string>[];
};
export function HistoricalOrderDetail({ id, close }: { id: string; close: () => void }) {
  const result = useResource<HistoricalOrder>('/sales/historical-orders/' + id);
  const d = result.data;
  return (
    <Modal title="Đơn cũ từ Sapo" close={close}>
      <State loading={result.loading} error={result.error} />
      {d && (
        <div className="form-stack">
          <div className="note wide">
            Chỉ tra cứu. Trạng thái và người chốt dưới đây được giữ nguyên từ Sapo.
          </div>
          <h3>
            {d.number} · {d.customer?.name || d.sourceCustomerName || 'Chưa xác định khách'}
          </h3>
          <dl className="import-facts">
            {[
              ['Mã Sapo', d.externalId],
              ['Ngày tạo nguồn', date(d.orderedAt)],
              ['Ngày nhập', date(d.importedAt)],
              ['Trạng thái đơn gốc', d.sourceStatus],
              ['Thanh toán gốc', d.sourcePaymentStatus],
              ['Giao hàng gốc', d.sourceShippingStatus],
              ['Nhân viên tạo đơn (nguồn)', d.sourceCreatedBy || 'Không có trong nguồn'],
              ['Kênh bán', d.sourceChannel || 'Không có trong nguồn'],
              [
                'Liên kết khách',
                d.customer
                  ? d.linkMethod === 'UNIQUE_NORMALIZED_PHONE'
                    ? 'Khớp số điện thoại duy nhất'
                    : 'Theo mã khách'
                  : 'Chưa liên kết hồ sơ',
              ],
              ['Người chốt gốc', d.sourceClosedBy || 'Không có trong nguồn'],
              ['Người nhận', d.recipientName],
              ['Điện thoại nhận', d.recipientPhone],
              ['Địa chỉ giao', d.shippingAddress],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || 'Không có trong nguồn'}</dd>
              </div>
            ))}
          </dl>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Hàng trong đơn gốc</th>
                  <th>Số lượng</th>
                  <th>Đơn giá</th>
                  <th>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      {item.productName}
                      <br />
                      <small>{item.sku}</small>
                    </td>
                    <td>
                      {item.quantity} {item.unit}
                    </td>
                    <td>{money(item.unitPrice)}</td>
                    <td>
                      {item.lineTotal == null ? 'Không có trong nguồn' : money(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="import-facts">
            {[
              ['Tiền hàng', d.subtotal],
              ['Giảm giá', d.discount],
              ['Phí giao', d.shippingFee],
              ['Tổng đơn', d.total],
              ['Đã nhận', d.paidAmount],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v == null ? 'Không có trong nguồn' : money(v)}</dd>
              </div>
            ))}
          </dl>
          <SourceData data={d.sourceData} />
        </div>
      )}
    </Modal>
  );
}
export function HistoricalOrders({ customerId }: { customerId?: string }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [link, setLink] = useState('ALL'),
    [selected, setSelected] = useState<string | null>(null);
  const result = useResource<Page<HistoricalOrder>>(
    '/sales/historical-orders?page=' +
      page +
      '&search=' +
      encodeURIComponent(search) +
      '&link=' +
      link +
      (customerId ? '&customerId=' + customerId : ''),
  );
  return (
    <section className="panel import-panel">
      <h2>Đơn cũ từ Sapo</h2>
      <p className="muted">
        Tra cứu theo khách đang được giao; bàn giao khách không đổi người chốt gốc.
      </p>
      <SearchBox
        placeholder="Tìm số đơn, mã Sapo hoặc tên khách…"
        onSearch={(s) => {
          setSearch(s);
          setPage(1);
        }}
      />
      <label>
        Liên kết hồ sơ khách
        <select
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">Tất cả trong phạm vi</option>
          <option value="LINKED">Đã liên kết</option>
          <option value="UNLINKED">Chưa liên kết khách</option>
        </select>
      </label>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Đơn nguồn</th>
                  <th>Khách hàng</th>
                  <th>Ngày tạo</th>
                  <th>Trạng thái gốc</th>
                  <th>Người tạo / người chốt</th>
                  <th>Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button className="text-button" onClick={() => setSelected(d.id)}>
                        {d.number}
                      </button>
                    </td>
                    <td>{d.customer?.name || d.sourceCustomerName || 'Chưa xác định khách'}</td>
                    <td>{date(d.orderedAt)}</td>
                    <td>{d.sourceStatus}</td>
                    <td>
                      Tạo: {d.sourceCreatedBy || 'Không có trong nguồn'}
                      <br />
                      Chốt: {d.sourceClosedBy || 'Không có trong nguồn'}
                    </td>
                    <td>{money(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <State loading={false} error="" empty={!result.data.items.length} />
          <Pager data={result.data} page={page} setPage={setPage} />
        </>
      )}
      {selected && <HistoricalOrderDetail id={selected} close={() => setSelected(null)} />}
    </section>
  );
}
