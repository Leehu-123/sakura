import { useState } from 'react';
import { useResource, State, Pager, SearchBox } from './shared';
import { Actor, Page, money, date, customerStatuses } from './types';
import { LayoutList, Kanban } from 'lucide-react';

type KanbanCustomer = {
  id: string;
  name: string;
  phone: string | null;
  expectedRevenue: string | null;
  lastContactDate: string | null;
  nextContactDate: string | null;
  daysSinceContact: number | null;
  daysUntilNext: number | null;
  urgency: 'overdue' | 'due-soon' | 'ok';
  tags: string[];
  regionName: string | null;
};

type KanbanColumn = {
  status: string;
  count: number;
  expectedRevenue: string;
  items: KanbanCustomer[];
};

type BoardData = { columns: KanbanColumn[] };

type TableCustomer = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  expectedRevenue: string | null;
  nextContactDate: string | null;
  lastContactDate: string | null;
  tags: string[];
};

function contactLabel(c: KanbanCustomer): string {
  if (c.daysSinceContact === null) return 'Chưa liên hệ';
  if (c.daysSinceContact === 0) return 'Hôm nay';
  if (c.daysSinceContact === 1) return 'Hôm qua';
  return `${c.daysSinceContact} ngày trước`;
}

function nextLabel(c: KanbanCustomer): string | null {
  if (c.daysUntilNext === null) return null;
  if (c.daysUntilNext < 0) return `Quá ${Math.abs(c.daysUntilNext)} ngày`;
  if (c.daysUntilNext === 0) return 'Hôm nay';
  if (c.daysUntilNext === 1) return 'Ngày mai';
  return `${c.daysUntilNext} ngày nữa`;
}

const statusColors: Record<string, string> = {
  NEW: '#3b82f6',
  CONSULTING: '#f59e0b',
  WON: '#10b981',
  RETURNING: '#8b5cf6',
  INACTIVE: '#9ca3af',
};

function KanbanCard({ c, onClick }: { c: KanbanCustomer; onClick: () => void }) {
  const next = nextLabel(c);
  return (
    <div
      className={`kanban-card urgency-${c.urgency}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="kanban-card-header">
        <span className={`urgency-dot urgency-dot--${c.urgency}`} />
        <strong className="kanban-card-name">{c.name}</strong>
      </div>
      {c.phone && <p className="kanban-card-phone">{c.phone}</p>}
      {c.expectedRevenue && (
        <p className="kanban-card-revenue">{money(c.expectedRevenue)}</p>
      )}
      <div className="kanban-card-contact">
        <span>{contactLabel(c)}</span>
        {next && (
          <span className={c.daysUntilNext !== null && c.daysUntilNext < 0 ? 'overdue' : ''}>
            → {next}
          </span>
        )}
      </div>
      {c.regionName && (
        <span className="badge gray kanban-card-region">{c.regionName}</span>
      )}
      {(c.tags || []).length > 0 && (
        <div className="kanban-card-tags">
          {c.tags.map((t) => (
            <span className="badge gray" key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function KanbanView({ data, onCustomer }: { data: BoardData; onCustomer: (id: string) => void }) {
  return (
    <div className="kanban-board">
      {(data.columns || []).map((col) => (
        <div className="kanban-column" key={col.status}>
          <div className="kanban-column-header" style={{ borderTopColor: statusColors[col.status] || '#cbd5e1' }}>
            <div className="kanban-column-title">
              <span className="badge" style={{ background: statusColors[col.status], color: '#fff' }}>
                {customerStatuses[col.status] || col.status}
              </span>
              <span className="kanban-column-count">{col.count}</span>
            </div>
            <span className="kanban-column-revenue">{money(col.expectedRevenue)}</span>
          </div>
          <div className="kanban-column-body">
            {col.items.length === 0 && (
              <p className="kanban-empty">Không có khách hàng</p>
            )}
            {col.items.map((c) => (
              <KanbanCard key={c.id} c={c} onClick={() => onCustomer(c.id)} />
            ))}
            {col.count > col.items.length && (
              <p className="kanban-more">+{col.count - col.items.length} khách hàng khác</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableView({
  actor,
  onCustomer,
}: {
  actor: Actor;
  onCustomer: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const customers = useResource<Page<TableCustomer>>(
    '/sales/dashboard/customers?page=' + page + '&pageSize=20' + (search ? '&search=' + encodeURIComponent(search) : ''),
  );

  return (
    <>
      <div className="sales-toolbar" style={{ marginTop: 16 }}>
        <SearchBox placeholder="Tìm khách hàng…" onSearch={(s) => { setSearch(s); setPage(1); }} />
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
                {(customers.data.items || []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button className="text-button link-button" onClick={() => onCustomer(c.id)}>
                        {c.name}
                      </button>
                    </td>
                    <td>{c.phone || '—'}</td>
                    <td><span className="badge">{customerStatuses[c.status] || c.status}</span></td>
                    <td>{c.expectedRevenue ? money(c.expectedRevenue) : '—'}</td>
                    <td>{c.lastContactDate ? date(c.lastContactDate) : '—'}</td>
                    <td>{c.nextContactDate ? date(c.nextContactDate) : '—'}</td>
                    <td>
                      {(c.tags || []).map((t) => <span className="badge gray" key={t}>{t}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <State loading={false} error="" empty={!(customers.data.items || []).length} />
          <Pager data={customers.data} page={page} setPage={setPage} />
        </section>
      )}
    </>
  );
}

export function MyPipeline({ actor, onCustomer }: { actor: Actor; onCustomer: (id: string) => void }) {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const board = useResource<BoardData>('/sales/dashboard/pipeline-board', 0, view === 'kanban');

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Pipeline khách hàng</h2>
        </div>
        <div className="pipeline-view-toggle">
          <button
            className={`view-btn ${view === 'kanban' ? 'active' : ''}`}
            onClick={() => setView('kanban')}
          >
            <span title="Kanban"><Kanban size={18} /></span> Kanban
          </button>
          <button
            className={`view-btn ${view === 'table' ? 'active' : ''}`}
            onClick={() => setView('table')}
          >
            <span title="Bảng"><LayoutList size={18} /></span> Bảng
          </button>
        </div>
      </div>

      {view === 'kanban' && (
        <>
          <State loading={board.loading} error={board.error} />
          {board.data && <KanbanView data={board.data} onCustomer={onCustomer} />}
        </>
      )}

      {view === 'table' && <TableView actor={actor} onCustomer={onCustomer} />}
    </div>
  );
}
