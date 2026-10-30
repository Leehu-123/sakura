import { useState } from 'react';
import { useResource, State, Pager, Modal } from './shared';
import { Actor, Page, date, money, orderStatuses } from './types';
import { OrderDetail } from './Orders';
import { HistoricalOrderDetail } from '../imports/HistoricalOrders';
type Row = {
  id: string;
  source: string;
  number: string;
  at: string;
  customerName: string;
  total: string;
  paid: string | null;
  status: string;
  shippingCharged: string | null;
  shippingEstimated: string | null;
  shippingActual: string | null;
};
export function ReportOrders({
  query,
  metric,
  title,
  actor,
  close,
}: {
  query: Record<string, string>;
  metric: string;
  title: string;
  actor: Actor;
  close: () => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Row | null>(null);
  const data = useResource<Page<Row>>(
    '/sales/reports/orders?' +
      new URLSearchParams({ ...query, metric, page: String(page), pageSize: '20' }),
  );
  if (selected?.source === 'SAPO')
    return <HistoricalOrderDetail id={selected.id} close={() => setSelected(null)} />;
  return (
    <Modal title={title} close={close}>
      {selected ? (
        <OrderDetail id={selected.id} actor={actor} back={() => setSelected(null)} />
      ) : (
        <>
          <p className="muted">
            {query.from} – {query.to} · Cùng bộ lọc và phạm vi của báo cáo.
            {metric === 'CUSTOMERS' && ' Mỗi khách hiển thị một lần, kèm đơn đại diện.'}
          </p>
          <State loading={data.loading} error={data.error} />
          {data.data && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Đơn / Ngày đặt</th>
                      <th>Khách</th>
                      <th>Trạng thái</th>
                      <th>Tổng đơn / Đã thu</th>
                      {metric.startsWith('SHIPPING') && <th>Thu khách / Tạm tính / Thực trả</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.items.map((r) => (
                      <tr key={r.source + r.id}>
                        <td>
                          <button className="text-button" onClick={() => setSelected(r)}>
                            {r.number}
                          </button>
                          <small className="block muted">{date(r.at)}</small>
                        </td>
                        <td>{r.customerName}</td>
                        <td>{r.source === 'SAKURA' ? orderStatuses[r.status] : r.status}</td>
                        <td>
                          {money(r.total)}
                          <small className="block">
                            Đã thu: {r.paid === null ? 'Chưa rõ' : money(r.paid)}
                          </small>
                        </td>
                        {metric.startsWith('SHIPPING') && (
                          <td>
                            {r.shippingCharged === null ? 'Chưa rõ' : money(r.shippingCharged)} /{' '}
                            {r.shippingEstimated === null ? 'Chưa rõ' : money(r.shippingEstimated)}{' '}
                            / {r.shippingActual === null ? 'Chưa rõ' : money(r.shippingActual)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <State loading={false} error="" empty={!data.data.items.length} />
              <Pager data={data.data} page={page} setPage={setPage} />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
