import { useState } from 'react';
import { useResource, State, Pager, SearchBox } from './shared';
import { Actor, Page, money, date, customerStatuses } from './types';

type CustomerWithCRM = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  expectedRevenue: string | null;
  nextContactDate: string | null;
  lastContactDate: string | null;
  tags: string[];
};

type PipelineData = {
  groups: { status: string; count: number; expectedRevenue: string }[];
  totalExpected: string;
};

export function MyPipeline({ actor, onCustomer }: { actor: Actor; onCustomer: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  
  const pipeline = useResource<PipelineData>('/sales/dashboard/pipeline');
  const customers = useResource<Page<CustomerWithCRM>>('/sales/dashboard/customers?page=' + page + '&pageSize=20' + (search ? '&search=' + encodeURIComponent(search) : ''));

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Pipeline khách hàng</h2>
        </div>
      </div>

      <State loading={pipeline.loading} error={pipeline.error} />
      {pipeline.data && (
        <div className="pipeline-cards">
          {pipeline.data.groups.map(g => (
            <div className="panel pipeline-card" key={g.status}>
              <span className="badge">{customerStatuses[g.status] || g.status}</span>
              <p><strong>{g.count}</strong> khách hàng</p>
              <p>Dự kiến: <strong>{money(g.expectedRevenue || '0')}</strong></p>
            </div>
          ))}
        </div>
      )}

      <div className="sales-toolbar" style={{ marginTop: 24 }}>
        <SearchBox placeholder="Tìm khách hàng…" onSearch={s => { setSearch(s); setPage(1); }} />
      </div>

      <State loading={customers.loading} error={customers.error} />
      {customers.data && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>SĐT</th>
                  <th>Trạng thái</th>
                  <th>Dự kiến</th>
                  <th>Liên hệ gần nhất</th>
                  <th>Liên hệ tiếp</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {customers.data.items.map(c => (
                  <tr key={c.id}>
                    <td>
                      <button className="text-button link-button" onClick={() => onCustomer(c.id)}>
                        {c.name}
                      </button>
                    </td>
                    <td>{c.phone}</td>
                    <td><span className="badge">{customerStatuses[c.status] || c.status}</span></td>
                    <td>{c.expectedRevenue ? money(c.expectedRevenue) : '—'}</td>
                    <td>{c.lastContactDate ? date(c.lastContactDate) : '—'}</td>
                    <td>{c.nextContactDate ? date(c.nextContactDate) : '—'}</td>
                    <td>
                      {c.tags.map(t => <span className="badge gray" key={t}>{t}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <State loading={false} error="" empty={!customers.data.items.length} />
          <Pager data={customers.data} page={page} setPage={setPage} />
          {pipeline.data && (
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', textAlign: 'right' }}>
              Tổng dự kiến: <strong>{money(pipeline.data.totalExpected)}</strong>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
