import { useState } from 'react';
import { useResource, State, Modal, Form, Pager, SearchBox } from './shared';
import { Actor, Page, date, money, orderStatuses, customerStatuses } from './types';
import { api } from '../api';
import {
  Phone,
  MessageCircle,
  Home,
  Plus,
  Pencil,
  Trash,
  CheckSquare,
  ClipboardList,
  User,
  Building,
  AlertTriangle,
  Users,
  MessageSquare,
  Clock,
  ChevronRight,
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

type CareAlerts = {
  totalManaged: number;
  overdueCustomers: number;
  dueSoonCustomers: number;
  unansweredConversations: number;
};

type AlertCustomer = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  lastContactDate: string | null;
  region?: { name: string } | null;
};

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
  const [alertModal, setAlertModal] = useState<string | null>(null); // 'overdue' | 'due-soon' | 'unanswered' | null

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
  const careAlerts = useResource<CareAlerts>('/sales/dashboard/care-alerts', revision);
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

  const dailyItems = dailyTasks.data || [];
  const completedDailyCount = dailyItems.filter(
    (t) => t.doneToday || t.status === 'DONE',
  ).length;
  const totalDailyCount = dailyItems.length;
  const progressPercent = totalDailyCount > 0
    ? Math.round((completedDailyCount / totalDailyCount) * 100)
    : 0;

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

      {/* CARE ALERTS SECTION */}
      {careAlerts.data && (
        <div className="care-alerts-grid" style={{ marginTop: 16 }}>
          <button
            className="care-alert-card care-alert--total"
            onClick={() => onCustomer && onCustomer('')}
          >
            <span className="care-alert-icon"><Users size={20} /></span>
            <div>
              <small>Tổng khách quản lý</small>
              <strong>{careAlerts.data.totalManaged}</strong>
            </div>
          </button>
          <button
            className="care-alert-card care-alert--danger"
            onClick={() => setAlertModal('overdue')}
            disabled={!careAlerts.data.overdueCustomers}
          >
            <span className="care-alert-icon"><AlertTriangle size={20} /></span>
            <div>
              <small>Quá hạn chăm sóc</small>
              <strong>{careAlerts.data.overdueCustomers}</strong>
            </div>
            {careAlerts.data.overdueCustomers > 0 && <ChevronRight size={16} className="care-alert-arrow" />}
          </button>
          <button
            className="care-alert-card care-alert--warning"
            onClick={() => setAlertModal('due-soon')}
            disabled={!careAlerts.data.dueSoonCustomers}
          >
            <span className="care-alert-icon"><Clock size={20} /></span>
            <div>
              <small>Sắp đến hạn</small>
              <strong>{careAlerts.data.dueSoonCustomers}</strong>
            </div>
            {careAlerts.data.dueSoonCustomers > 0 && <ChevronRight size={16} className="care-alert-arrow" />}
          </button>
          <button
            className="care-alert-card care-alert--info"
            onClick={() => setAlertModal('unanswered')}
            disabled={!careAlerts.data.unansweredConversations}
          >
            <span className="care-alert-icon"><MessageSquare size={20} /></span>
            <div>
              <small>Chờ trả lời tin nhắn</small>
              <strong>{careAlerts.data.unansweredConversations}</strong>
            </div>
            {careAlerts.data.unansweredConversations > 0 && <ChevronRight size={16} className="care-alert-arrow" />}
          </button>
        </div>
      )}

      {/* 2. TASKS WORKSPACE SECTION */}
      <div className="overview-grid" style={{ marginTop: 24 }}>
        {/* LEFT COLUMN: DAILY RECURRING CHECKLIST */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="panel-head"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckSquare size={20} style={{ color: '#059669' }} />
                <h2 style={{ margin: 0 }}>Checklist hàng ngày</h2>
              </div>
              <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                {totalDailyCount > 0
                  ? `${completedDailyCount}/${totalDailyCount} việc hoàn thành hôm nay (${progressPercent}%)`
                  : 'Công việc cố định lặp lại mỗi ngày'}
              </small>
            </div>
            <button
              className="text-button"
              style={{ fontWeight: 600, color: 'var(--rose)' }}
              onClick={() => setDailyModal('create')}
            >
              <Plus size={16} /> Thêm việc hàng ngày
            </button>
          </div>

          <div style={{ padding: '0 24px 24px', flex: 1 }}>
            {totalDailyCount > 0 && (
              <div className="task-progress-bar">
                <div
                  className="task-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            <State loading={dailyTasks.loading} error={dailyTasks.error} />
            {dailyTasks.data && (
              <div className="task-list">
                {dailyTasks.data.map((t) => {
                  const isDone = t.doneToday || t.status === 'DONE';
                  return (
                    <div
                      className={`task-item ${isDone ? 'is-done' : ''}`}
                      key={t.id}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleDailyTask(t)}
                        aria-label={t.title}
                      />
                      <div className="task-body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p className={`task-title ${isDone ? 'done' : ''}`}>
                            {t.title}
                          </p>
                          {isDone && (
                            <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontSize: '0.75rem', padding: '2px 8px' }}>
                              Đã xong
                            </span>
                          )}
                        </div>
                        {t.note && <p className="task-note">{t.note}</p>}
                      </div>
                      <div className="row-actions" style={{ marginLeft: 8, flexShrink: 0 }}>
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
                  <div className="empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 12px', color: 'var(--muted)' }}>
                      Chưa có checklist hàng ngày. Hãy thêm các công việc cần lặp lại mỗi ngày:
                    </p>
                    <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 16px' }}>
                      (Ví dụ: Check tin nhắn Messenger, Gọi điện chăm sóc 5 khách cũ, Đối soát vận đơn VNPost...)
                    </p>
                    <button
                      className="secondary"
                      onClick={() => setDailyModal('create')}
                    >
                      <Plus size={16} /> Thêm việc hàng ngày
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: OTHER ONE-TIME TASKS */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="panel-head"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClipboardList size={20} style={{ color: '#3b82f6' }} />
                <h2 style={{ margin: 0 }}>Các công việc khác</h2>
              </div>
              <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                Công việc nội bộ, lịch hẹn hoặc công việc 1 lần
              </small>
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
                      className={`task-item ${isDone ? 'is-done' : ''}`}
                      key={t.id}
                      style={{
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
                      <div className="task-body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <p className={`task-title ${isDone ? 'done' : ''}`}>
                            {t.title}
                          </p>
                          {t.customer ? (
                            <button
                              type="button"
                              className="badge"
                              style={{ cursor: onCustomer ? 'pointer' : 'default', border: 'none' }}
                              onClick={() => onCustomer && onCustomer(t.customer!.id)}
                            >
                              <User size={12} style={{ marginRight: 4 }} />
                              {t.customer.name}
                            </button>
                          ) : (
                            <span className="badge gray" style={{ fontSize: '0.75rem' }}>
                              <Building size={11} style={{ marginRight: 3 }} />
                              Nội bộ
                            </span>
                          )}
                          {t.autoGenerated && (
                            <span className="badge gray" style={{ fontSize: '0.75rem' }}>
                              Tự động
                            </span>
                          )}
                        </div>
                        {t.note && <p className="task-note">{t.note}</p>}
                        {t.dueDate && (
                          <small
                            className={`block ${isOverdue ? 'overdue' : ''}`}
                            style={{
                              marginTop: 4,
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

                      <div className="row-actions" style={{ marginLeft: 8, flexShrink: 0 }}>
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

      {/* MODAL 3: CARE ALERT CUSTOMER LIST */}
      {alertModal && (
        <CareAlertModal
          type={alertModal}
          close={() => setAlertModal(null)}
          onCustomer={onCustomer}
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
      title={task ? 'Sửa việc hàng ngày' : 'Thêm việc lặp lại hàng ngày'}
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
          Ghi chú / Tiêu chuẩn đạt được (tùy chọn)
          <textarea
            name="note"
            defaultValue={task?.note}
            placeholder="Nội dung chi tiết hoặc tiêu chuẩn cần đạt khi thực hiện..."
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
  // Option to link customer: default is false unless task already has a customer!
  const [hasCustomer, setHasCustomer] = useState<boolean>(!!task?.customer);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    task?.customer?.id || '',
  );

  const customers = useResource<Page<any>>(
    hasCustomer
      ? '/sales/customers?pageSize=20&search=' + encodeURIComponent(search)
      : '',
  );

  return (
    <Modal title={task ? 'Chỉnh sửa công việc' : 'Tạo công việc mới'} close={close}>
      <Form
        label="Lưu công việc"
        done={done}
        submit={async (f) => {
          // If hasCustomer is false, customerId is explicitly undefined so it will NOT trigger UUID validation
          const customerId = hasCustomer && selectedCustomerId ? selectedCustomerId : undefined;

          const body: Record<string, any> = {
            title: f.get('title'),
            note: f.get('note') || '',
            dueDate: f.get('dueDate') || null,
            priority: f.get('priority') || 'NORMAL',
            contactChannel: f.get('contactChannel') || '',
            isRecurring: false,
            ...(customerId ? { customerId } : {}),
            ...(task
              ? {
                  version: task.version,
                  status: f.get('status'),
                  // If editing and user unchecks customer, explicitly disconnect
                  customerId: customerId || null,
                }
              : {}),
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
            placeholder="Ví dụ: Lấy mẫu từ kho, Báo cáo tuần, Gọi lại cho khách..."
          />
        </label>

        {/* Customer option: Internal task vs Customer task */}
        <div style={{ margin: '8px 0 16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 500 }}>
            <input
              type="checkbox"
              className="task-checkbox"
              checked={hasCustomer}
              onChange={(e) => setHasCustomer(e.target.checked)}
            />
            <span>Gắn với khách hàng cụ thể</span>
          </label>

          {hasCustomer && (
            <div
              style={{
                marginTop: 10,
                padding: 14,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <label style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6, display: 'block' }}>
                Chọn khách hàng:
              </label>
              <input
                type="text"
                placeholder="Gõ tên hoặc số điện thoại để tìm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">-- Chọn khách hàng trong danh sách --</option>
                {task?.customer && (
                  <option value={task.customer.id}>{task.customer.name}</option>
                )}
                {customers.data?.items
                  ?.filter((c: any) => c.id !== task?.customer?.id)
                  .map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        <label>
          Ghi chú chi tiết (tùy chọn)
          <textarea
            name="note"
            defaultValue={task?.note}
            placeholder="Nội dung chi tiết, yêu cầu cần xử lý..."
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

// Modal showing list of customers for a care alert type
function CareAlertModal({
  type,
  close,
  onCustomer,
}: {
  type: string;
  close: () => void;
  onCustomer?: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const alertTitles: Record<string, string> = {
    overdue: '🔴 Khách quá hạn chăm sóc',
    'due-soon': '🟡 Khách sắp đến hạn',
    unanswered: '🟠 Hội thoại chờ trả lời',
  };

  const data = useResource<Page<AlertCustomer>>(
    '/sales/dashboard/care-alerts/' + type + '?page=' + page + '&pageSize=15',
  );

  return (
    <Modal title={alertTitles[type] || 'Danh sách khách hàng'} close={close}>
      <State loading={data.loading} error={data.error} />
      {data.data && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>SĐT</th>
                  <th>Trạng thái</th>
                  <th>Liên hệ gần nhất</th>
                  <th>Vùng</th>
                </tr>
              </thead>
              <tbody>
                {(data.data.items || []).map((c: any) => {
                  const customer = c.customer || c;
                  const name = customer.facebookName || customer.name || '—';
                  const phone = customer.phone || '';
                  const status = customer.status || '';
                  const lastContact = customer.lastContactDate || c.lastInboundAt || null;
                  const regionName = customer.region?.name || '';
                  const customerId = customer.id || c.customerId;

                  return (
                    <tr key={c.id || customer.id}>
                      <td>
                        {customerId && onCustomer ? (
                          <button
                            className="text-button link-button"
                            onClick={() => {
                              onCustomer(customerId);
                              close();
                            }}
                          >
                            {name}
                          </button>
                        ) : (
                          name
                        )}
                      </td>
                      <td>{phone || '—'}</td>
                      <td>
                        {status && (
                          <span className="badge">
                            {customerStatuses[status] || status}
                          </span>
                        )}
                      </td>
                      <td>{lastContact ? date(lastContact) : '—'}</td>
                      <td>{regionName || '—'}</td>
                    </tr>
                  );
                })}
                {!(data.data.items || []).length && (
                  <tr>
                    <td colSpan={5} className="empty">
                      Không có khách hàng nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager data={data.data} page={page} setPage={setPage} />
        </>
      )}
    </Modal>
  );
}
