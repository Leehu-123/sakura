import { useRef, useState } from 'react';
import { useResource, State, Pager, SearchBox, Modal, Form } from './shared';
import { Actor, Page, Product, money, customerStatuses, has } from './types';
import { api } from '../api';
import { LayoutList, Kanban, GripVertical, Pencil, Package, TrendingUp } from 'lucide-react';

type Item = { name: string; unit: string; quantity: number };
type PipelineCustomer = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  version: number;
  canManage: boolean;
  expectedRevenue: string | null;
  closingProbability: number | null;
  effectiveProbability: number | null;
  weightedRevenue: string;
  expectedProducts: string[];
  expectedItems: Item[];
  tags: string[];
  regionName?: string | null;
  urgency?: 'overdue' | 'due-soon' | 'ok';
  daysSinceContact?: number | null;
  daysUntilNext?: number | null;
};
type BoardData = {
  columns: { status: string; count: number; expectedRevenue: string; items: PipelineCustomer[] }[];
  totalExpectedRevenue: string;
  totalPotentialRevenue: string;
  missingProbability: number;
  missingQuantities: number;
  expectedShipments: { unit: string; quantity: string }[];
  expectedProducts: { name: string; unit: string; quantity: string; weightedQuantity: string }[];
};
const colors: Record<string, string> = {
  NEW: '#3b82f6',
  CONSULTING: '#f59e0b',
  WON: '#10b981',
  RETURNING: '#8b5cf6',
  INACTIVE: '#9ca3af',
};
const qty = (s: string | number) => Number(s).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
function ForecastEditor({
  customer: c,
  actor,
  close,
  done,
}: {
  customer: PipelineCustomer;
  actor: Actor;
  close: () => void;
  done: () => void;
}) {
  const products = useResource<Page<Product>>(
    '/catalog/products',
    0,
    has(actor, 'catalog.products.read'),
  );
  const [items, setItems] = useState<Item[]>(
    c.expectedItems.length
      ? c.expectedItems
      : c.expectedProducts.map((name) => ({ name, unit: '', quantity: 0 })),
  );
  function change(index: number, field: keyof Item, value: string) {
    setItems((rows) =>
      rows.map((r, i) =>
        i === index ? { ...r, [field]: field === 'quantity' ? Number(value) : value } : r,
      ),
    );
  }
  const fixed = c.status === 'WON' || c.status === 'INACTIVE';
  return (
    <Modal title={'Dự báo · ' + c.name} close={close}>
      <Form
        label="Lưu dự báo"
        done={done}
        submit={(f) =>
          api('/sales/customers/' + c.id + '/pipeline', 'PATCH', {
            version: c.version,
            expectedRevenue: String(f.get('revenue') || '0'),
            ...(!fixed
              ? {
                  closingProbability:
                    f.get('probability') === '' ? null : Number(f.get('probability')),
                }
              : {}),
            expectedItems: items,
          })
        }
      >
        <div className="form-grid">
          <label>
            Giá trị dự kiến bán trước tỷ lệ (đ)
            <input
              type="number"
              name="revenue"
              min="0"
              max="999999999999999"
              step="1"
              required
              defaultValue={c.expectedRevenue || '0'}
            />
          </label>
          <label>
            Tỷ lệ chốt (%)
            <input
              type="number"
              name="probability"
              min="0"
              max="100"
              step="1"
              disabled={fixed}
              defaultValue={fixed ? (c.effectiveProbability ?? '') : (c.closingProbability ?? '')}
              placeholder="Chưa đánh giá"
            />
          </label>
        </div>
        <p className="muted">
          Doanh số dự kiến = giá trị bán × tỷ lệ chốt. Đã chốt đơn: 100%; Tạm dừng: 0%. Khách chưa
          đánh giá chưa được cộng vào dự báo.
        </p>
        <h3>Hàng dự kiến xuất</h3>
        <p className="muted">
          Nhập số lượng nếu chốt thành công. Dự báo xuất sẽ nhân với cùng tỷ lệ chốt; đây chưa phải
          lệnh xuất kho.
        </p>
        <State loading={products.loading} error={products.error} />
        <datalist id="pipeline-product-options">
          {products.data?.items
            .filter((p) => p.isActive)
            .map((p) => (
              <option key={p.id} value={p.name} />
            ))}
        </datalist>
        {items.map((row, i) => (
          <div className="forecast-item-row" key={i}>
            <label>
              Loại hàng
              <input
                required
                maxLength={150}
                list="pipeline-product-options"
                aria-label={'Loại hàng ' + (i + 1)}
                value={row.name}
                onChange={(e) => change(i, 'name', e.target.value)}
              />
            </label>
            <label>
              Số lượng
              <input
                required
                type="number"
                min="0.01"
                max="1000000000"
                step="0.01"
                aria-label={'Số lượng ' + (i + 1)}
                value={row.quantity || ''}
                onChange={(e) => change(i, 'quantity', e.target.value)}
              />
            </label>
            <label>
              Đơn vị
              <input
                required
                maxLength={30}
                placeholder="cuộn, mét…"
                aria-label={'Đơn vị ' + (i + 1)}
                value={row.unit}
                onChange={(e) => change(i, 'unit', e.target.value)}
              />
            </label>
            <button
              type="button"
              aria-label={'Xóa hàng ' + (i + 1)}
              onClick={() => setItems((rows) => rows.filter((_, n) => n !== i))}
            >
              Xóa
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={items.length >= 100}
          onClick={() => setItems((rows) => [...rows, { name: '', unit: '', quantity: 1 }])}
        >
          + Thêm loại hàng
        </button>
      </Form>
    </Modal>
  );
}
function Summary({ data }: { data: BoardData }) {
  return (
    <>
      <div className="pipeline-summary forecast-summary">
        <div className="pipeline-summary-item pipeline-summary-total">
          <TrendingUp size={22} />
          <div>
            <small>Doanh số dự kiến bán</small>
            <strong>{money(data.totalExpectedRevenue)}</strong>
            <small>Trước tỷ lệ: {money(data.totalPotentialRevenue)}</small>
          </div>
        </div>
        <div className="pipeline-summary-item pipeline-summary-total">
          <Package size={22} />
          <div>
            <small>Tổng dự kiến xuất</small>
            <strong>
              {data.expectedShipments.length
                ? data.expectedShipments.map((i) => qty(i.quantity) + ' ' + i.unit).join(' · ')
                : 'Chưa có số lượng'}
            </strong>
            <small>Đã nhân tỷ lệ chốt · tách riêng từng đơn vị</small>
          </div>
        </div>
      </div>
      <p className="muted">
        Dự báo toàn bộ pipeline trong phạm vi được xem, không giới hạn 30 thẻ và không lọc theo
        tháng. Số lượng dự báo có thể là số lẻ.
      </p>
      {(data.missingProbability > 0 || data.missingQuantities > 0) && (
        <p className="forecast-notice" role="status">
          {data.missingProbability > 0 &&
            `${data.missingProbability} khách chưa nhập tỷ lệ chốt (chưa cộng dự báo). `}
          {data.missingQuantities > 0 &&
            `${data.missingQuantities} khách có sản phẩm quan tâm chưa nhập số lượng.`}
        </p>
      )}
      <details className="panel forecast-breakdown">
        <summary>Chi tiết dự kiến xuất theo loại hàng ({data.expectedProducts.length})</summary>
        {data.expectedProducts.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Loại hàng</th>
                  <th>Đơn vị</th>
                  <th>Nếu chốt toàn bộ</th>
                  <th>Dự kiến xuất theo tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {data.expectedProducts.map((i) => (
                  <tr key={i.name + '|' + i.unit}>
                    <td>{i.name}</td>
                    <td>{i.unit}</td>
                    <td>{qty(i.quantity)}</td>
                    <td>
                      <strong>{qty(i.weightedQuantity)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Chọn “Dự báo” trên thẻ khách để nhập loại hàng và số lượng.</p>
        )}
      </details>
    </>
  );
}
export function MyPipeline({
  actor,
  onCustomer,
}: {
  actor: Actor;
  onCustomer: (id: string) => void;
}) {
  const [view, setView] = useState<'kanban' | 'table'>('kanban'),
    [revision, setRevision] = useState(0),
    [edit, setEdit] = useState<PipelineCustomer | null>(null);
  const [drag, setDrag] = useState<PipelineCustomer | null>(null),
    [over, setOver] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const saving = useRef(false);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('');
  const board = useResource<BoardData>('/sales/dashboard/pipeline-board', revision);
  const customers = useResource<Page<PipelineCustomer>>(
    '/sales/dashboard/customers?page=' +
      page +
      '&pageSize=20&search=' +
      encodeURIComponent(search) +
      (filter ? '&status=' + filter : ''),
    revision,
    view === 'table',
  );
  async function move(c: PipelineCustomer, status: string) {
    if (saving.current || !c.canManage || status === c.status) return;
    saving.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/sales/customers/' + c.id + '/pipeline', 'PATCH', { version: c.version, status });
      setNotice('Đã chuyển ' + c.name + ' sang ' + customerStatuses[status]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
      setDrag(null);
      setOver('');
      setRevision((r) => r + 1);
    }
  }
  function stage(c: PipelineCustomer) {
    return (
      <select
        aria-label={'Giai đoạn của ' + c.name}
        value={c.status}
        disabled={busy || !c.canManage}
        onChange={(e) => void move(c, e.target.value)}
      >
        {Object.entries(customerStatuses).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  function forecastButton(c: PipelineCustomer) {
    return (
      c.canManage && (
        <button className="text-button pipeline-edit" disabled={busy} onClick={() => setEdit(c)}>
          <Pencil size={13} /> Dự báo
        </button>
      )
    );
  }
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Pipeline khách hàng</h2>
          <p className="muted">Kéo thẻ sang cột khác hoặc chọn giai đoạn trên thẻ.</p>
        </div>
        <div className="pipeline-view-toggle">
          <button
            className={'view-btn ' + (view === 'kanban' ? 'active' : '')}
            onClick={() => setView('kanban')}
          >
            <Kanban size={18} /> Kanban
          </button>
          <button
            className={'view-btn ' + (view === 'table' ? 'active' : '')}
            onClick={() => setView('table')}
          >
            <LayoutList size={18} /> Bảng
          </button>
        </div>
      </div>
      <State loading={false} error={error} />
      {notice && (
        <p className="forecast-notice" role="status">
          {notice}
        </p>
      )}
      <State loading={board.loading} error={board.error} />
      {board.data && <Summary data={board.data} />}
      {view === 'kanban' && board.data && (
        <div className="kanban-board" aria-busy={busy}>
          {board.data.columns.map((col) => (
            <section
              key={col.status}
              aria-label={customerStatuses[col.status]}
              className={'kanban-column ' + (over === col.status ? 'drop-target' : '')}
              onDragOver={(e) => {
                if (drag && !busy) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setOver(col.status);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver('');
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver('');
                if (drag) void move(drag, col.status);
                setDrag(null);
              }}
            >
              <div className="kanban-column-header" style={{ borderTopColor: colors[col.status] }}>
                <div className="kanban-column-title">
                  <strong>{customerStatuses[col.status]}</strong>
                  <span className="kanban-column-count">{col.count}</span>
                </div>
                <span className="kanban-column-revenue">Dự kiến: {money(col.expectedRevenue)}</span>
              </div>
              <div className="kanban-column-body">
                {!col.items.length && <p className="kanban-empty">Thả khách vào giai đoạn này</p>}
                {col.items.map((c) => (
                  <article
                    key={c.id}
                    className={
                      'kanban-card urgency-' + c.urgency + (drag?.id === c.id ? ' dragging' : '')
                    }
                    draggable={c.canManage && !busy}
                    onDragStart={(e) => {
                      if (!c.canManage || busy) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData('text/plain', c.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDrag(c);
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver('');
                    }}
                  >
                    <div className="kanban-card-header">
                      {c.canManage && (
                        <GripVertical size={16} aria-label="Kéo để chuyển giai đoạn" />
                      )}
                      <button
                        className="text-button kanban-card-name"
                        onClick={() => onCustomer(c.id)}
                      >
                        {c.name}
                      </button>
                    </div>
                    <p className="kanban-card-phone">{c.phone || 'Chưa có số điện thoại'}</p>
                    <p className="kanban-card-revenue">
                      {money(c.expectedRevenue || '0')} ×{' '}
                      {c.effectiveProbability === null
                        ? 'chưa đánh giá'
                        : c.effectiveProbability + '%'}
                      <br />
                      <strong>Dự kiến: {money(c.weightedRevenue)}</strong>
                    </p>
                    <div className="kanban-card-tags">
                      {c.expectedItems.map((i, n) => (
                        <span className="badge" key={n}>
                          {i.name}: {qty(i.quantity)} {i.unit}
                        </span>
                      ))}
                      {!c.expectedItems.length &&
                        c.expectedProducts.map((p) => (
                          <span className="badge gray" key={p}>
                            {p} · chưa có SL
                          </span>
                        ))}
                    </div>
                    <p className="kanban-card-contact">
                      {c.daysSinceContact == null
                        ? 'Chưa liên hệ'
                        : `Liên hệ ${c.daysSinceContact} ngày trước`}
                      {c.daysUntilNext != null &&
                        (c.daysUntilNext < 0
                          ? ` · Quá hẹn ${-c.daysUntilNext} ngày`
                          : ` · Hẹn sau ${c.daysUntilNext} ngày`)}
                    </p>
                    <div className="kanban-card-tags">
                      {c.tags.map((t) => (
                        <span className="badge gray" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                    {c.regionName && <span className="badge gray">{c.regionName}</span>}
                    <div className="pipeline-card-actions">
                      {stage(c)}
                      {forecastButton(c)}
                    </div>
                  </article>
                ))}
                {col.count > col.items.length && (
                  <button
                    className="kanban-more"
                    onClick={() => {
                      setView('table');
                      setFilter(col.status);
                      setPage(1);
                    }}
                  >
                    Xem {col.count - col.items.length} khách còn lại
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {view === 'table' && (
        <>
          <div className="sales-toolbar">
            <SearchBox
              placeholder="Tìm khách hàng…"
              onSearch={(s) => {
                setSearch(s);
                setPage(1);
              }}
            />
            <select
              aria-label="Lọc giai đoạn"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Mọi giai đoạn</option>
              {Object.entries(customerStatuses).map(([s, label]) => (
                <option key={s} value={s}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <State loading={customers.loading} error={customers.error} />
          {customers.data && (
            <section className="panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Khách hàng</th>
                      <th>Giai đoạn</th>
                      <th>Giá trị bán</th>
                      <th>Tỷ lệ chốt</th>
                      <th>Doanh số dự kiến</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {customers.data.items.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <button className="text-button" onClick={() => onCustomer(c.id)}>
                            {c.name}
                          </button>
                          <small className="muted"> {c.phone}</small>
                        </td>
                        <td>{stage(c)}</td>
                        <td>{money(c.expectedRevenue || '0')}</td>
                        <td>
                          {c.effectiveProbability === null
                            ? 'Chưa đánh giá'
                            : c.effectiveProbability + '%'}
                        </td>
                        <td>{money(c.weightedRevenue)}</td>
                        <td>{forecastButton(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager data={customers.data} page={page} setPage={setPage} />
            </section>
          )}
        </>
      )}
      {edit && (
        <ForecastEditor
          customer={edit}
          actor={actor}
          close={() => setEdit(null)}
          done={() => {
            setEdit(null);
            setRevision((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
