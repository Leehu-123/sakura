import { SourceData } from '../imports/SourceData';
import { HistoricalOrders } from '../imports/HistoricalOrders';
import { useState } from 'react';
import { Plus, ArrowLeft, Phone, MapPin } from 'lucide-react';
import { api } from '../api';
import {
  Actor,
  Customer,
  Order,
  Page,
  Person,
  Region,
  has,
  date,
  money,
  number,
  customerStatuses,
  orderStatuses,
} from './types';
import { useResource, State, Modal, Form, Pager, SearchBox } from './shared';
import { CreateOrder, OrderDetail } from './Orders';
function CustomerForm({
  customer,
  done,
  close,
}: {
  customer?: Customer;
  done: (id: string) => void;
  close: () => void;
}) {
  const regions = useResource<Region[]>('/sales/regions');
  return (
    <Modal title={customer ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng'} close={close}>
      <State loading={regions.loading} error={regions.error} />
      {regions.data && (
        <Form
          label={customer ? 'Lưu hồ sơ' : 'Tạo khách hàng'}
          done={() => {}}
          submit={async (f) => {
            const result = await api<Customer>(
              '/sales/customers' + (customer ? '/' + customer.id : ''),
              customer ? 'PATCH' : 'POST',
              {
                name: f.get('name'),
                phone: f.get('phone'),
                address: f.get('address'),
                status: f.get('status'),
                regionId: f.get('regionId') || null,
                ...(customer ? { version: customer.version } : {}),
              },
            );
            done(result.id);
          }}
        >
          <label>
            Tên khách / Cửa hàng
            <input
              name="name"
              required
              minLength={2}
              maxLength={150}
              defaultValue={customer?.name}
            />
          </label>
          <label>
            Số điện thoại
            <input
              name="phone"
              type="tel"
              required
              minLength={9}
              maxLength={30}
              defaultValue={customer?.phone || ''}
              placeholder="09… hoặc +84…"
            />
          </label>
          <label>
            Địa chỉ nhận hàng
            <textarea
              name="address"
              maxLength={1000}
              defaultValue={customer?.address}
              placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố"
            />
          </label>
          <div className="form-grid">
            <label>
              Phân loại
              <select name="status" defaultValue={customer?.status || 'NEW'}>
                {Object.entries(customerStatuses).map(([v, t]) => (
                  <option value={v} key={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Khu vực
              <select name="regionId" defaultValue={customer?.regionId || ''}>
                <option value="">Chưa chọn</option>
                {regions.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <State loading={regions.loading} error={regions.error} />
          {!customer && (
            <p className="muted">
              Khách mới được giao cho bạn chăm sóc. Sale tổng hoặc Admin có thể bàn giao sau.
            </p>
          )}
        </Form>
      )}
    </Modal>
  );
}
function CustomerDetail({ id, actor, back }: { id: string; actor: Actor; back: () => void }) {
  const [revision, setRevision] = useState(0),
    [modal, setModal] = useState<'edit' | 'care' | 'handoff' | 'order' | null>(null),
    [orderId, setOrderId] = useState<string | null>(null);
  const result = useResource<Customer>('/sales/customers/' + id, revision);
  const customer = result.data;
  const done = () => {
    setModal(null);
    setRevision((v) => v + 1);
  };
  if (orderId)
    return (
      <OrderDetail
        id={orderId}
        actor={actor}
        back={() => {
          setOrderId(null);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <>
      <button className="text-button" onClick={back}>
        <ArrowLeft size={16} />
        Danh sách khách
      </button>
      <State loading={result.loading} error={result.error} />
      {customer && (
        <>
          <section className="panel customer-profile">
            <div className="panel-head">
              <div>
                <h2>{customer.name}</h2>
                <span className="badge">{customerStatuses[customer.status]}</span>
              </div>
              <span className="muted">{customer.region?.name || 'Chưa phân khu vực'}</span>
            </div>
            <div className="sales-detail-grid">
              <div>
                <p>
                  <Phone size={16} /> {customer.phone}
                </p>
                <p>
                  <MapPin size={16} /> {customer.address || 'Chưa có địa chỉ'}
                </p>
              </div>
              <div>
                <h3>Người chăm sóc</h3>
                <strong>{customer.assignments[0]?.user.displayName || 'Chưa phân công'}</strong>
                <p className="muted">Khu vực không tự cấp quyền xem khách.</p>
              </div>
            </div>
            <div className="sales-actions">
              {has(actor, 'sales.customers.manage') && (
                <>
                  <button className="secondary" onClick={() => setModal('edit')}>
                    Sửa hồ sơ
                  </button>
                  <button className="secondary" onClick={() => setModal('care')}>
                    Ghi chú chăm sóc
                  </button>
                </>
              )}
              {has(actor, 'sales.customers.handoff') && (
                <button className="secondary" onClick={() => setModal('handoff')}>
                  Bàn giao khách
                </button>
              )}
              {has(actor, 'sales.orders.manage') && has(actor, 'catalog.products.read') && (
                <button className="primary" onClick={() => setModal('order')}>
                  <Plus size={18} />
                  Lập đơn
                </button>
              )}
            </div>
          </section>
          {has(actor, 'sales.orders.read') && (
            <>
              <CustomerOrders id={id} revision={revision} open={setOrderId} />
              <SourceData data={customer.sourceData} />
              <HistoricalOrders key={id + revision} customerId={id} />
            </>
          )}
          <div className="overview-grid">
            <section className="panel activity-panel">
              <h2>Chăm sóc khách hàng</h2>
              <small className="muted">100 ghi chú gần nhất.</small>
              {!customer.activities?.length && <p className="empty">Chưa có ghi chú chăm sóc.</p>}
              {customer.activities?.map((a) => (
                <div className="activity" key={a.id}>
                  <strong>{a.author.displayName}</strong>
                  <small>{date(a.createdAt)}</small>
                  <p>{a.note}</p>
                </div>
              ))}
            </section>
            <section className="panel activity-panel">
              <h2>Lịch sử phân công</h2>
              <small className="muted">100 lần phân công gần nhất.</small>
              {customer.assignmentHistory?.map((a) => (
                <div className="activity" key={a.id}>
                  <strong>{a.user.displayName}</strong>
                  <span className={'badge ' + (!a.endedAt ? 'green' : 'gray')}>
                    {a.endedAt ? 'Đã bàn giao' : 'Đang chăm sóc'}
                  </span>
                  <small>
                    {date(a.startedAt)}
                    {a.endedAt ? ' → ' + date(a.endedAt) : ''}
                  </small>
                  <p>
                    {a.reason}
                    <br />
                    <small>Phân công bởi {a.assignedBy?.displayName}</small>
                  </p>
                </div>
              ))}
            </section>
          </div>
          {modal === 'edit' && (
            <CustomerForm customer={customer} close={() => setModal(null)} done={done} />
          )}
          {modal === 'care' && (
            <Modal title="Ghi chú chăm sóc" close={() => setModal(null)}>
              <Form
                done={done}
                submit={(f) =>
                  api('/sales/customers/' + id + '/activities', 'POST', {
                    version: customer.version,
                    note: f.get('note'),
                  })
                }
              >
                <label>
                  Nội dung
                  <textarea
                    name="note"
                    required
                    maxLength={4000}
                    placeholder="Nhu cầu của khách, kết quả trao đổi, lần chăm sóc tiếp theo…"
                  />
                </label>
              </Form>
            </Modal>
          )}
          {modal === 'handoff' && (
            <Handoff customer={customer} close={() => setModal(null)} done={done} />
          )}
          {modal === 'order' && (
            <CreateOrder
              customer={customer}
              close={() => setModal(null)}
              done={(id) => {
                done();
                setOrderId(id);
              }}
            />
          )}
        </>
      )}
    </>
  );
}
function CustomerOrders({
  id,
  revision,
  open,
}: {
  id: string;
  revision: number;
  open: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const result = useResource<Page<Order>>(
    '/sales/orders?customerId=' + id + '&page=' + page,
    revision,
  );
  return (
    <section className="panel customer-orders">
      <div className="panel-head">
        <h2>Đơn hàng của khách</h2>
      </div>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Đơn hàng</th>
                  <th>Trạng thái</th>
                  <th>Người chốt</th>
                  <th>Tổng đơn</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button className="text-button link-button" onClick={() => open(o.id)}>
                        {number(o.number)}
                      </button>
                    </td>
                    <td>{orderStatuses[o.status]}</td>
                    <td>{o.closedBy?.displayName || 'Chưa chốt'}</td>
                    <td>{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <State loading={false} error="" empty={!result.data.items.length} />
          <Pager data={result.data} page={page} setPage={setPage} />
        </>
      )}
    </section>
  );
}
function Handoff({
  customer,
  close,
  done,
}: {
  customer: Customer;
  close: () => void;
  done: () => void;
}) {
  const result = useResource<Person[]>('/sales/assignees');
  return (
    <Modal title="Bàn giao khách" close={close}>
      <div className="note">
        Quyền xem khách và đơn của khách sẽ chuyển sang người nhận. Người chốt các đơn cũ được giữ
        nguyên.
      </div>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <Form
          done={done}
          label="Xác nhận bàn giao"
          submit={(f) =>
            api('/sales/customers/' + customer.id + '/handoff', 'POST', {
              version: customer.version,
              userId: f.get('userId'),
              reason: f.get('reason'),
            })
          }
        >
          <label>
            Người nhận
            <select name="userId" required defaultValue="">
              <option value="" disabled>
                Chọn người chăm sóc
              </option>
              {result.data
                .filter((u) => u.id !== customer.assignments[0]?.user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Lý do / Thông tin bàn giao
            <textarea name="reason" required minLength={3} maxLength={1000} />
          </label>
        </Form>
      )}
    </Modal>
  );
}
export function Customers({ actor, initialId }: { actor: Actor; initialId?: string | null }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState<string | null>(initialId || null),
    [creating, setCreating] = useState(false),
    [revision, setRevision] = useState(0);
  const result = useResource<Page<Customer>>(
    '/sales/customers?page=' +
      page +
      '&search=' +
      encodeURIComponent(search) +
      (status ? '&status=' + status : ''),
    revision,
  );
  if (selected)
    return (
      <CustomerDetail
        id={selected}
        actor={actor}
        back={() => {
          setSelected(null);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <>
      <div className="sales-toolbar">
        <SearchBox
          placeholder="Tìm tên khách hoặc số điện thoại…"
          onSearch={(s) => {
            setSearch(s);
            setPage(1);
          }}
        />
        <label className="filter-label">
          Phân loại
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(customerStatuses).map(([v, t]) => (
              <option value={v} key={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {has(actor, 'sales.customers.manage') && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            Thêm khách
          </button>
        )}
      </div>
      <div className="note wide">
        Danh sách chỉ hiển thị khách trong phạm vi được cấp. Số điện thoại được chuẩn hóa để tránh
        tạo trùng.
      </div>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Số điện thoại</th>
                  <th>Phân loại</th>
                  <th>Người chăm sóc</th>
                  <th>Khu vực</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button className="text-button link-button" onClick={() => setSelected(c.id)}>
                        {c.name}
                      </button>
                    </td>
                    <td>{c.phone || 'Chưa có số điện thoại'}</td>
                    <td>
                      <span className="badge">{customerStatuses[c.status]}</span>
                    </td>
                    <td>{c.assignments[0]?.user.displayName || 'Chưa phân công'}</td>
                    <td>{c.region?.name || 'Chưa chọn'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <State loading={false} error="" empty={!result.data.items.length} />
          <Pager data={result.data} page={page} setPage={setPage} />
        </section>
      )}
      {creating && (
        <CustomerForm
          close={() => setCreating(false)}
          done={(id) => {
            setCreating(false);
            setSelected(id);
            setRevision((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
