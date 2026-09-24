import { useState } from 'react';
import { useResource, State, Modal, Form, Pager, SearchBox } from './shared';
import { Actor, Page, date, money, orderStatuses } from './types';
import { api } from '../api';
import {
  Phone,
  MessageCircle,
  Home,
  Plus,
  Pencil,
  Trash,
  CheckCircle2,
  Calendar,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { Task } from './MyTasks';

type DashboardData = {
  ordersThisMonth: number;
  revenue: string;
  paid: string;
  unpaid: string;
  recentOrders: {
    id: string;
    number: number;
    status: string;
    total: string;
    customer: { id: string; name: string };
    createdAt: string;
  }[];
};

type DailyTask = Task & { doneToday?: boolean };

export function MyDashboard({
  actor,
  onCustomer,
}: {
  actor: Actor;
  onCustomer?: (id: string) => void;
}) {
  const [revision, setRevision] = useState(0);

  // Filters for one-time tasks
  const [taskPage, setTaskPage] = useState(1);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [timeRange, setTimeRange] = useState<string>('all');

  // Modals
  const [dailyModal, setDailyModal] = useState<'create' | DailyTask | null>(null);
  const [onceModal, setOnceModal] = useState<'create' | Task | null>(null);

  // Data fetching
  const dashboard = useResource<DashboardData>('/sales/dashboard/my', revision);
  const dailyTasks = useResource<DailyTask[]>('/sales/tasks/daily', revision);
  const otherTasks = useResource<Page<Task>>(
    '/sales/tasks?page=' +
      taskPage +
      '&pageSize=15&isRecurring=false' +
      (taskStatus ? '&status=' + taskStatus : '') +
      (timeRange && timeRange !== 'all' ? '&timeRange=' + timeRange : '') +
      (taskSearch ? '&search=' + encodeURIComponent(taskSearch) : ''),
    revision,
  );

  const monthYear = new Intl.DateTimeFormat('vi-VN', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const todayStr = new Date().toISOString().slice(0, 10);

  // Toggle daily task status
  const toggleDailyTask = async (task: DailyTask) => {
    const isDone = task.doneToday || task.status === 'DONE';
    await api('/sales/tasks/' + task.id, 'PATCH', {
      version: task.version,
      status: isDone ? 'TODO' : 'DONE',
    });
    setRevision((r) => r + 1);
  };

  // Toggle one-time task status
  const toggleOneTask = async (task: Task) => {
    await api('/sales/tasks/' + task.id, 'PATCH', {
      version: task.version,
      status: task.status === 'DONE' ? 'TODO' : 'DONE',
    });
    setRevision((r) => r + 1);
  };

  const deleteTask = async (task: Task) => {
    if (!confirm('Bạn có chắc chắn muốn xóa công việc này?')) return;
    await api('/sales/tasks/' + task.id, 'DELETE');
    setRevision((r) => r + 1);
  };

  const completedDailyCount = (dailyTasks.data || []).filter(
    (t) => t.doneToday || t.status === 'DONE',
  ).length;
  const totalDailyCount = (dailyTasks.data || []).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Tổng quan Sale</h2>
          <p className="muted">{monthYear}</p>
        </div>
      </div>

      {/* 1. KPI CARDS SECTION */}
      <State loading={dashboard.loading} error={dashboard.error} />
      {dashboard.data &&
        (() => {
          const kpi = (dashboard.data as any).kpi || dashboard.data;
          const ordersCount = kpi.ordersThisMonth ?? 0;
          const revenue = kpi.revenue ?? '0';
          const paid = kpi.paid ?? '0';
          const unpaid = kpi.unpaid ?? '0';

          return (
            <div className="kpi-grid">
              <div className="panel kpi-card">
                <span>Đơn tháng này</span>
                <strong>{ordersCount}</strong>
              </div>
              <div className="panel kpi-card">
                <span>Doanh thu</span>
                <strong>{money(revenue)}</strong>
              </div>
              <div className="panel kpi-card">
                <span>Đã thu</span>
                <strong>{money(paid)}</strong>
              </div>
              <div className="panel kpi-card">
                <span>Còn phải thu</span>
                <strong>{money(unpaid)}</strong>
              </div>
            </div>
          );
        })()}

      {/* 2. TASKS WORKSPACE SECTION */}
      <div className="overview-grid" style={{ marginTop: 24 }}>
        {/* LEFT COLUMN: DAILY RECURRING CHECKLIST */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="panel-head"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <h2>Checklist hàng ngày</h2>
              <small className="muted">
                {totalDailyCount > 0
                  ? `${completedDailyCount}/${totalDailyCount} hoàn thành hôm nay`
                  : 'Công việc lặp lại mỗi ngày'}
              </small>
            </div>
            <button
              className="text-button"
              style={{ fontWeight: 600 }}
              onClick={() => setDailyModal('create')}
            >
              <Plus size={16} /> Thêm việc hàng ngày
            </button>
          </div>

          <State loading={dailyTasks.loading} error={dailyTasks.error} />
          {dailyTasks.data && (
            <div className="task-list" style={{ padding: '0 24px 24px', flex: 1 }}>
              {dailyTasks.data.map((t) => {
                const isDone = t.doneToday || t.status === 'DONE';
                return (
                  <div
                    className="task-item"
                    key={t.id}
                    style={{
                      background: isDone ? '#f9fafb' : 'white',
                      borderColor: isDone ? '#e5e7eb' : 'var(--line)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleDailyTask(t)}
                      aria-label={t.title}
                    />
                    <div
                      style={{
                        flex: 1,
                        textDecoration: isDone ? 'line-through' : 'none',
                        color: isDone ? 'var(--muted)' : 'inherit',
                      }}
                    >
                      <strong>{t.title}</strong>
                      {t.note && (
                        <p
                          className="muted"
                          style={{ margin: '2px 0 0', fontSize: '0.85rem' }}
                        >
                          {t.note}
                        </p>
                      )}
                    </div>
                    <div className="row-actions" style={{ marginLeft: 8 }}>
                      <button
                        className="icon-button"
                        onClick={() => setDailyModal(t)}
                        title="Chỉnh sửa"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => deleteTask(t)}
                        title="Xóa"
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {!dailyTasks.data.length && (
                <div className="empty" style={{ padding: '32px 16px' }}>
                  Chưa có checklist hàng ngày. Bấm "+ Thêm việc hàng ngày" để tạo các thói quen cần
                  lặp lại mỗi ngày (gọi điện, chăm sóc khách, đối soát đơn...).
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: OTHER ONE-TIME TASKS */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="panel-head"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <h2>Các công việc khác</h2>
              <small className="muted">Công việc theo lịch hẹn, khách hàng và 1 lần</small>
            </div>
            <button className="primary" onClick={() => setOnceModal('create')}>
              <Plus size={16} /> Tạo công việc mới
            </button>
          </div>

          <div
            className="sales-toolbar"
            style={{
              padding: '0 24px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div style={{ flex: '1 1 200px' }}>
              <SearchBox
                placeholder="Tìm tiêu đề, khách..."
                onSearch={(s) => {
                  setTaskSearch(s);
                  setTaskPage(1);
                }}
              />
            </div>
            <label className="filter-label" style={{ margin: 0 }}>
              Thời gian
              <select
                value={timeRange}
                onChange={(e) => {
                  setTimeRange(e.target.value);
                  setTaskPage(1);
                }}
              >
                <option value="all">Tất cả thời gian</option>
                <option value="today">Hôm nay</option>
                <option value="week">Tuần này</option>
                <option value="month">Tháng này</option>
                <option value="overdue">Quá hạn</option>
              </select>
            </label>
            <label className="filter-label" style={{ margin: 0 }}>
              Trạng thái
              <select
                value={taskStatus}
                onChange={(e) => {
                  setTaskStatus(e.target.value);
                  setTaskPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="TODO">Cần làm</option>
                <option value="IN_PROGRESS">Đang làm</option>
                <option value="DONE">Hoàn thành</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            </label>
          </div>

          <State loading={otherTasks.loading} error={otherTasks.error} />
          {otherTasks.data && (
            <div style={{ padding: '0 24px 24px', flex: 1 }}>
              <div className="task-list">
                {(otherTasks.data.items || []).map((t) => {
                  const isDone = t.status === 'DONE';
                  const isOverdue =
                    t.dueDate && t.dueDate < todayStr && !isDone && t.status !== 'CANCELLED';
                  const isToday = t.dueDate && t.dueDate.slice(0, 10) === todayStr && !isDone;

                  return (
                    <div
                      className="task-item"
                      key={t.id}
                      style={{
                        background: isDone ? '#f9fafb' : 'white',
                        opacity: t.status === 'CANCELLED' ? 0.6 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleOneTask(t)}
                        disabled={t.status === 'CANCELLED'}
                        aria-label={t.title}
                      />
                      <span
                        className={`priority-dot --${(t.priority || 'normal').toLowerCase()}`}
                        title={'Độ ưu tiên: ' + t.priority}
                      />
                      <div
                        style={{
                          flex: 1,
                          textDecoration: isDone ? 'line-through' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{t.title}</strong>
                          {t.customer && (
                            <button
                              type="button"
                              className="badge"
                              style={{ cursor: onCustomer ? 'pointer' : 'default', border: 'none' }}
                              onClick={() => onCustomer && onCustomer(t.customer!.id)}
                            >
                              {t.customer.name}
                            </button>
                          )}
                          {t.autoGenerated && (
                            <span className="badge gray" style={{ fontSize: '0.75rem' }}>
                              Tự động
                            </span>
                          )}
                        </div>
                        {t.note && (
                          <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
                            {t.note}
                          </p>
                        )}
                        {t.dueDate && (
                          <small
                            className={`block ${isOverdue ? 'overdue' : ''}`}
                            style={{
                              color: isOverdue ? '#e11d48' : isToday ? '#d97706' : undefined,
                              fontWeight: isOverdue || isToday ? 600 : undefined,
                            }}
                          >
                            Hạn: {date(t.dueDate)}
                            {isOverdue && ' (Quá hạn)'}
                            {isToday && ' (Hôm nay)'}
                          </small>
                        )}
                      </div>

                      {t.contactChannel === 'phone' && (
                        <span title="Gọi điện"><Phone size={16} className="muted" /></span>
                      )}
                      {t.contactChannel === 'zalo' && (
                        <span title="Zalo"><MessageCircle size={16} className="muted" /></span>
                      )}
                      {t.contactChannel === 'visit' && (
                        <span title="Gặp trực tiếp"><Home size={16} className="muted" /></span>
                      )}

                      <div className="row-actions" style={{ marginLeft: 8 }}>
                        <button
                          className="icon-button"
                          onClick={() => setOnceModal(t)}
                          title="Chỉnh sửa"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => deleteTask(t)}
                          title="Xóa"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {!(otherTasks.data.items || []).length && (
                  <p className="empty" style={{ padding: '32px 16px' }}>
                    Không có công việc nào phù hợp với bộ lọc hiện tại.
                  </p>
                )}
              </div>

              <Pager data={otherTasks.data} page={taskPage} setPage={setTaskPage} />
            </div>
          )}
        </section>
      </div>

      {/* 3. RECENT ORDERS SECTION */}
      {dashboard.data &&
        (() => {
          const recentOrders = dashboard.data.recentOrders || [];
          return (
            <section className="panel" style={{ marginTop: 24 }}>
              <div className="panel-head">
                <h2>Đơn hàng gần đây</h2>
                <small className="muted">10 đơn hàng gần nhất trong phạm vi của bạn</small>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Mã đơn</th>
                      <th>Khách hàng</th>
                      <th>Trạng thái</th>
                      <th>Tổng tiền</th>
                      <th>Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o) => (
                      <tr key={o.id}>
                        <td>SK-{String(o.number).padStart(6, '0')}</td>
                        <td>
                          {o.customer?.id && onCustomer ? (
                            <button
                              type="button"
                              className="text-button link-button"
                              onClick={() => onCustomer(o.customer.id)}
                            >
                              {o.customer.name}
                            </button>
                          ) : (
                            o.customer?.name || 'Chưa có tên'
                          )}
                        </td>
                        <td>
                          <span className="badge">{orderStatuses[o.status] || o.status}</span>
                        </td>
                        <td>{money(o.total)}</td>
                        <td>{date(o.createdAt)}</td>
                      </tr>
                    ))}
                    {!recentOrders.length && (
                      <tr>
                        <td colSpan={5} className="empty">
                          Chưa có đơn hàng nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })()}

      {/* MODAL 1: CREATE / EDIT DAILY RECURRING TASK */}
      {dailyModal && (
        <DailyTaskModal
          task={dailyModal === 'create' ? null : dailyModal}
          close={() => setDailyModal(null)}
          done={() => {
            setDailyModal(null);
            setRevision((r) => r + 1);
          }}
        />
      )}

      {/* MODAL 2: CREATE / EDIT ONE-TIME TASK */}
      {onceModal && (
        <OneTimeTaskModal
          task={onceModal === 'create' ? null : onceModal}
          close={() => setOnceModal(null)}
          done={() => {
            setOnceModal(null);
            setRevision((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}

// Modal for daily recurring checklist items
function DailyTaskModal({
  task,
  close,
  done,
}: {
  task: DailyTask | null;
  close: () => void;
  done: () => void;
}) {
  return (
    <Modal
      title={task ? 'Sửa công việc hàng ngày' : 'Thêm công việc lặp lại hàng ngày'}
      close={close}
    >
      <Form
        label="Lưu công việc"
        done={done}
        submit={async (f) => {
          const body = {
            title: f.get('title'),
            note: f.get('note'),
            isRecurring: true,
            ...(task ? { version: task.version } : {}),
          };
          await api('/sales/tasks' + (task ? '/' + task.id : ''), task ? 'PATCH' : 'POST', body);
        }}
      >
        <label>
          Tiêu đề công việc hàng ngày
          <input
            name="title"
            required
            defaultValue={task?.title}
            maxLength={200}
            placeholder="Ví dụ: Kiểm tra tin nhắn chưa trả lời, Gọi 5 khách cũ..."
          />
        </label>
        <label>
          Mô tả / Hướng dẫn thực hiện
          <textarea
            name="note"
            defaultValue={task?.note}
            placeholder="Ghi chú chi tiết cách thực hiện hoặc tiêu chuẩn cần đạt..."
          />
        </label>
      </Form>
    </Modal>
  );
}

// Modal for one-time / ad-hoc tasks
function OneTimeTaskModal({
  task,
  close,
  done,
}: {
  task: Task | null;
  close: () => void;
  done: () => void;
}) {
  const [search, setSearch] = useState('');
  const customers = useResource<Page<any>>(
    '/sales/customers?pageSize=20&search=' + encodeURIComponent(search),
  );

  return (
    <Modal title={task ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'} close={close}>
      <Form
        label="Lưu công việc"
        done={done}
        submit={async (f) => {
          const body = {
            title: f.get('title'),
            note: f.get('note'),
            customerId: f.get('customerId') || null,
            dueDate: f.get('dueDate') || null,
            priority: f.get('priority') || 'NORMAL',
            contactChannel: f.get('contactChannel') || '',
            isRecurring: false,
            ...(task ? { version: task.version, status: f.get('status') } : {}),
          };
          await api('/sales/tasks' + (task ? '/' + task.id : ''), task ? 'PATCH' : 'POST', body);
        }}
      >
        <label>
          Tiêu đề công việc
          <input
            name="title"
            required
            defaultValue={task?.title}
            maxLength={200}
            placeholder="Ví dụ: Gọi lại tư vấn bộ sản phẩm Sakura, Hẹn giao mẫu..."
          />
        </label>
        <label>
          Khách hàng liên quan (tùy chọn)
          <input
            type="text"
            placeholder="Tìm tên khách hàng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <select name="customerId" defaultValue={task?.customer?.id || ''}>
            <option value="">Không gắn khách hàng</option>
            {task?.customer && <option value={task.customer.id}>{task.customer.name}</option>}
            {customers.data?.items
              ?.filter((c: any) => c.id !== task?.customer?.id)
              .map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
          </select>
        </label>
        <label>
          Ghi chú
          <textarea
            name="note"
            defaultValue={task?.note}
            placeholder="Ghi chú chi tiết yêu cầu, nội dung cần trao đổi..."
          />
        </label>
        <div className="form-grid">
          <label>
            Hạn chót
            <input
              name="dueDate"
              type="date"
              defaultValue={task?.dueDate ? task.dueDate.slice(0, 10) : ''}
            />
          </label>
          <label>
            Độ ưu tiên
            <select name="priority" defaultValue={task?.priority || 'NORMAL'}>
              <option value="LOW">Thấp</option>
              <option value="NORMAL">Bình thường</option>
              <option value="HIGH">Cao</option>
              <option value="URGENT">Khẩn cấp</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Kênh liên hệ
            <select name="contactChannel" defaultValue={task?.contactChannel || ''}>
              <option value="">Không có</option>
              <option value="phone">Điện thoại</option>
              <option value="zalo">Zalo</option>
              <option value="visit">Gặp trực tiếp</option>
            </select>
          </label>
          {task && (
            <label>
              Trạng thái
              <select name="status" defaultValue={task.status}>
                <option value="TODO">Cần làm</option>
                <option value="IN_PROGRESS">Đang làm</option>
                <option value="DONE">Hoàn thành</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            </label>
          )}
        </div>
      </Form>
    </Modal>
  );
}
