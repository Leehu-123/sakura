import { useState } from 'react';
import { useResource, State } from './shared';
import { Actor, date, money, orderStatuses } from './types';
import { api } from '../api';
import { Phone, MessageCircle, Home } from 'lucide-react';
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
    customer: { name: string };
    createdAt: string;
  }[];
};

type TodayTasks = {
  due: Task[];
  overdue: Task[];
  completed: Task[];
};

export function MyDashboard({ actor }: { actor: Actor }) {
  const [revision, setRevision] = useState(0);
  const dashboard = useResource<DashboardData>('/sales/dashboard/my', revision);
  const tasks = useResource<TodayTasks>('/sales/tasks/today', revision);

  const monthYear = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(new Date());

  const toggleTask = async (task: Task) => {
    await api('/sales/tasks/' + task.id, 'PATCH', {
      version: task.version,
      status: task.status === 'DONE' ? 'TODO' : 'DONE'
    });
    setRevision(r => r + 1);
  };

  const renderTask = (t: Task, isOverdue: boolean) => (
    <div className="task-item" key={t.id}>
      <input type="checkbox" checked={t.status === 'DONE'} onChange={() => toggleTask(t)} />
      <span className={`priority-dot --${t.priority.toLowerCase()}`} />
      <div style={{ flex: 1, textDecoration: t.status === 'DONE' ? 'line-through' : 'none' }}>
        <strong>{t.title}</strong>
        {t.customer && <span className="badge">{t.customer.name}</span>}
        {isOverdue && <small className="overdue block">Quá hạn</small>}
      </div>
      {t.contactChannel === 'phone' && <Phone size={16} />}
      {t.contactChannel === 'zalo' && <MessageCircle size={16} />}
      {t.contactChannel === 'visit' && <Home size={16} />}
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Tổng quan Sale</h2>
          <p className="muted">{monthYear}</p>
        </div>
      </div>

      <State loading={dashboard.loading} error={dashboard.error} />
      {dashboard.data && (
        <div className="kpi-grid">
          <div className="panel kpi-card">
            <span>Đơn tháng này</span>
            <strong>{dashboard.data.ordersThisMonth}</strong>
          </div>
          <div className="panel kpi-card">
            <span>Doanh thu</span>
            <strong>{money(dashboard.data.revenue)}</strong>
          </div>
          <div className="panel kpi-card">
            <span>Đã thu</span>
            <strong>{money(dashboard.data.paid)}</strong>
          </div>
          <div className="panel kpi-card">
            <span>Còn phải thu</span>
            <strong>{money(dashboard.data.unpaid)}</strong>
          </div>
        </div>
      )}

      <div className="overview-grid" style={{ marginTop: 24 }}>
        <section className="panel">
          <div className="panel-head">
            <h2>Công việc hôm nay</h2>
          </div>
          <State loading={tasks.loading} error={tasks.error} />
          {tasks.data && (
            <div className="task-list" style={{ padding: '0 24px 24px' }}>
              {tasks.data.overdue.map(t => renderTask(t, true))}
              {tasks.data.due.map(t => renderTask(t, false))}
              {tasks.data.completed.map(t => renderTask(t, false))}
              {!tasks.data.overdue.length && !tasks.data.due.length && !tasks.data.completed.length && (
                <p className="empty">Không có công việc nào cho hôm nay.</p>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Đơn hàng gần đây</h2>
          </div>
          {dashboard.data && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Khách</th>
                    <th>Trạng thái</th>
                    <th>Tổng tiền</th>
                    <th>Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.data.recentOrders.map(o => (
                    <tr key={o.id}>
                      <td>SK-{String(o.number).padStart(6, '0')}</td>
                      <td>{o.customer.name}</td>
                      <td><span className="badge">{orderStatuses[o.status] || o.status}</span></td>
                      <td>{money(o.total)}</td>
                      <td>{date(o.createdAt)}</td>
                    </tr>
                  ))}
                  {!dashboard.data.recentOrders.length && (
                    <tr>
                      <td colSpan={5} className="empty">Chưa có đơn hàng nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
