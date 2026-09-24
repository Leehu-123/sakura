import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  Settings,
  BarChart3,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { api, refreshSession, setToken } from './api';
import { chatDrafts } from './messenger/drafts';
import { Inbox } from './messenger/Inbox';
import { Imports } from './imports/Imports';
import { HistoricalOrders } from './imports/HistoricalOrders';
import { Brand } from './Brand';
import { Customers } from './sales/Customers';
import { Products } from './sales/Products';
import { Storage } from './Storage';
import { SalesReport } from './sales/Reports';
import { Orders } from './sales/Orders';
import { ShoppingBag, Package } from 'lucide-react';
import { MyDashboard } from './sales/MyDashboard';
import { MyPipeline } from './sales/MyPipeline';
import { MyTasks } from './sales/MyTasks';
import { CalendarCheck, Kanban, ListTodo } from 'lucide-react';
import { TelegramSettings } from './TelegramSettings';
type Grant = { permission: string; scope: string };
type Me = {
  id: string;
  displayName: string;
  email: string;
  mustChangePassword: boolean;
  grants: Grant[];
};
type Permission = { id: string; code: string; name: string; allowedScopes: string[] };
type Role = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: { permission: Permission; scope: string }[];
};
type User = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
  telegramChatId?: string | null;
  createdAt: string;
  roleAssignments: { role: { id: string; name: string; code: string } }[];
  employee?: { region?: { name: string } };
};
type Item = { id: string; code: string; name: string };
type Employee = {
  id: string;
  code: string;
  fullName: string;
  region?: Item;
  department?: Item;
  branch?: Item;
  user?: { email: string };
};
type Catalogs = { regions: Item[]; departments: Item[]; branches: Item[]; employees: Employee[] };
type Audit = {
  id: string;
  action: string;
  entity: string;
  createdAt: string;
  actor?: { displayName: string; email: string };
  metadata?: unknown;
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Tab =
  | 'settings'
  | 'reports'
  | 'storage'
  | 'overview'
  | 'users'
  | 'roles'
  | 'catalogs'
  | 'audit'
  | 'profile'
  | 'customers'
  | 'products'
  | 'orders'
  | 'imports'
  | 'historical'
  | 'inbox'
  | 'my-dashboard'
  | 'my-pipeline'
  | 'my-tasks'
  | 'telegram';
type Modal =
  | { kind: 'user'; user?: User }
  | { kind: 'role'; role?: Role }
  | { kind: 'catalog' }
  | { kind: 'reset'; user: User };
const scopes: Record<string, string> = {
  GLOBAL: 'Toàn công ty',
  ASSIGNED: 'Khách được giao',
  SELF: 'Bản thân',
};
const titles: Record<Tab, string> = {
  settings: 'Cài đặt',
  reports: 'Báo cáo',
  storage: 'Lưu trữ & sao lưu',
  customers: 'Khách hàng',
  products: 'Sản phẩm',
  orders: 'Đơn hàng',
  imports: 'Nhập dữ liệu Sapo',
  historical: 'Đơn cũ Sapo',
  inbox: 'Hộp thư Messenger',
  'my-dashboard': 'Tổng quan Sale',
  'my-pipeline': 'Pipeline khách hàng',
  'my-tasks': 'Công việc',
  overview: 'Tổng quan',
  users: 'Tài khoản',
  roles: 'Vai trò & phân quyền',
  catalogs: 'Danh mục công ty',
  audit: 'Nhật ký thao tác',
  profile: 'Tài khoản của tôi',
  telegram: 'Telegram',
};
const actions: Record<string, string> = {
  'order.shipping_updated': 'Cập nhật vận chuyển',
  'chat.history_imported': 'Tải lịch sử Facebook',
  'chat.support_assigned': 'Phân người hỗ trợ',
  'chat.blocked': 'Chặn hội thoại trong Sakura',
  'chat.unblocked': 'Bỏ chặn hội thoại',
  'chat.image_added': 'Thêm ảnh sản phẩm',
  'order.delivery_slip_created': 'Tạo phiếu giao nội bộ',
  'order.delivery_slip_updated': 'Cập nhật phiếu giao nội bộ',
  'chat.linked': 'Gắn hội thoại với khách',
  'chat.tagged': 'Sửa nhãn hội thoại',
  'chat.send_requested': 'Yêu cầu gửi tin',
  'chat.send_finished': 'Ghi nhận kết quả gửi',
  'chat.delivery_resolved': 'Đối chiếu tin chưa rõ kết quả',
  'chat.template_created': 'Thêm mẫu trả lời',
  'chat.template_updated': 'Sửa mẫu trả lời',
  'import.previewed': 'Kiểm tra file Sapo',
  'import.committed': 'Xác nhận nhập Sapo',
  'customer.created': 'Tạo khách',
  'customer.updated': 'Cập nhật khách',
  'customer.handoff': 'Bàn giao khách',
  'customer.care_added': 'Thêm ghi chú chăm sóc',
  'product.created': 'Tạo sản phẩm',
  'product.updated': 'Cập nhật sản phẩm',
  'variant.updated': 'Cập nhật biến thể',
  'order.created': 'Tạo đơn',
  'order.status_changed': 'Đổi trạng thái đơn',
  'order.payment_recorded': 'Ghi nhận thu tiền',
  'auth.login': 'Đăng nhập',
  'auth.password_changed': 'Đổi mật khẩu',
  'auth.refresh_reuse': 'Thu hồi phiên bất thường',
  'user.created': 'Tạo tài khoản',
  'user.updated': 'Cập nhật tài khoản',
  'user.password_reset': 'Đặt lại mật khẩu',
  'role.created': 'Tạo vai trò',
  'role.updated': 'Cập nhật vai trò',
  'catalog.created': 'Thêm danh mục',
  'employee.created': 'Thêm nhân viên',
  'system.seed': 'Khởi tạo nền tảng',
};
const date = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="alert error">
      {message}
    </div>
  ) : null;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <ClipboardList size={30} />
      <p>{children}</p>
    </div>
  );
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Đóng">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function EmployeeAccountPicker() {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<User[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api<Page<User>>('/core/users?pageSize=20&search=' + encodeURIComponent(search))
        .then((result) => {
          if (active) {
            setItems(result.items);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  return (
    <fieldset>
      <legend>Tài khoản liên kết (tùy chọn)</legend>
      <label>
        Tìm theo tên hoặc email
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm thành viên…"
        />
      </label>
      <label>
        Chọn tài khoản
        <select name="userId" key={search}>
          <option value="">Chưa liên kết</option>
          {items
            .filter((i) => !i.employee)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.displayName} · {i.email}
              </option>
            ))}
        </select>
      </label>
      <small className="muted">
        Hiển thị tối đa 20 tài khoản phù hợp chưa liên kết nhân viên. Nhập email để tìm chính xác.
      </small>
      <ErrorBox message={error} />
    </fieldset>
  );
}
function PasswordForm({
  onChanged,
  required = false,
}: {
  onChanged: () => void;
  required?: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/change-password', 'POST', {
        currentPassword: form.get('currentPassword'),
        password: form.get('password'),
      });
      setToken(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <div>
        <h2>{required ? 'Đặt mật khẩu riêng của bạn' : 'Đổi mật khẩu'}</h2>
        <p className="muted">
          {required
            ? 'Đổi mật khẩu tạm thời để bắt đầu sử dụng Sakura.'
            : 'Sau khi đổi mật khẩu, bạn sẽ đăng nhập lại trên các thiết bị.'}
        </p>
      </div>
      <ErrorBox message={error} />
      <label>
        Mật khẩu hiện tại
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      <label>
        Mật khẩu mới
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
        <small>Ít nhất 12 ký tự.</small>
      </label>
      <label>
        Nhập lại mật khẩu mới
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      <button className="primary" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
      </button>
    </form>
  );
}
export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [starting, setStarting] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      if (await refreshSession()) {
        try {
          const user = await api<Me>('/auth/me');
          if (active) {
            chatDrafts.activate(user.id);
            setMe(user);
          }
        } catch {}
      }
      if (active) setStarting(false);
    })();
    const expired = () => {
      chatDrafts.clear();
      setMe(null);
      setNotice('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    };
    window.addEventListener('sakura:expired', expired);
    return () => {
      active = false;
      window.removeEventListener('sakura:expired', expired);
    };
  }, []);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoginBusy(true);
    setLoginError('');
    setNotice('');
    try {
      const result = await api<{ accessToken: string }>('/auth/login', 'POST', {
        email: form.get('email'),
        password: form.get('password'),
      });
      setToken(result.accessToken);
      const user = await api<Me>('/auth/me');
      chatDrafts.activate(user.id);
      setMe(user);
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setLoginBusy(false);
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST');
      chatDrafts.clear();
      setToken(null);
      setMe(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  if (starting)
    return (
      <div className="loading-screen">
        <Brand compact />
        <p>Đang mở Sakura…</p>
      </div>
    );
  if (!me || me.mustChangePassword)
    return (
      <main className="login-layout">
        <section className="login-story">
          <Brand />
          <div className="login-copy">
            <span className="eyebrow">CÙNG SAKURA MỖI NGÀY</span>
            <h1>
              Mỗi kết nối.
              <br />
              Một cơ hội
              <br />
              <em>chăm sóc tốt hơn.</em>
            </h1>
            <p>
              Không gian chung cho đội ngũ Sakura,
              <br />
              từ kinh doanh đến vận hành.
            </p>
          </div>
          <span className="login-footer">SAKURA · PHỤ KIỆN GÓI HOA</span>
        </section>
        <section className="login-panel">
          <div className="login-card">
            {me ? (
              <>
                <PasswordForm
                  required
                  onChanged={() => {
                    chatDrafts.clear();
                    setMe(null);
                    setNotice('Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.');
                  }}
                />
                <button className="text-button" onClick={logout}>
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
                <h2>Đăng nhập Sakura</h2>
                <p className="muted">Sử dụng tài khoản do quản trị viên cấp.</p>
                {notice && <div className="alert">{notice}</div>}
                <ErrorBox message={loginError} />
                <form onSubmit={login} className="form-stack">
                  <label>
                    Email
                    <input
                      type="email"
                      name="email"
                      autoComplete="username"
                      placeholder="ten@sakura.vn"
                      required
                      maxLength={254}
                    />
                  </label>
                  <label>
                    Mật khẩu
                    <input
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      placeholder="Nhập mật khẩu của bạn"
                      required
                      maxLength={128}
                    />
                  </label>
                  <button className="primary" disabled={loginBusy}>
                    {loginBusy ? 'Đang đăng nhập…' : 'Đăng nhập'}
                    <ArrowRight size={18} />
                  </button>
                </form>
                <p className="login-help">
                  Quên mật khẩu? Liên hệ quản trị viên Sakura để được cấp lại.
                </p>
              </>
            )}
          </div>
        </section>
      </main>
    );
  return (
    <Workspace
      me={me}
      logout={logout}
      notice={notice}
      onPasswordChanged={() => {
        chatDrafts.clear();
        setMe(null);
        setNotice('Đã đổi mật khẩu. Hãy đăng nhập lại.');
      }}
    />
  );
}
function Workspace({
  me,
  logout,
  notice,
  onPasswordChanged,
}: {
  me: Me;
  logout: () => void;
  notice: string;
  onPasswordChanged: () => void;
}) {
  const can = (permission: string) =>
    me.grants.some((g) => g.permission === permission && g.scope === 'GLOBAL');
  const [tab, setTab] = useState<Tab>('overview');
  const [menu, setMenu] = useState(false);
  const [users, setUsers] = useState<Page<User>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs>({
    regions: [],
    departments: [],
    branches: [],
    employees: [],
  });
  const [audit, setAudit] = useState<Page<Audit>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [catalogType, setCatalogType] = useState<keyof Catalogs>('employees');
  const [roleGrants, setRoleGrants] = useState<Record<string, string>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const tasks: Promise<unknown>[] = [];
    if (tab === 'users' && can('core.users.read'))
      tasks.push(
        api<Page<User>>(
          '/core/users?page=' +
            (tab === 'users' ? page : 1) +
            '&search=' +
            encodeURIComponent(tab === 'users' ? query : ''),
        ).then((v) => {
          if (active) setUsers(v);
        }),
      );
    if (['users', 'roles'].includes(tab) && can('core.roles.read'))
      tasks.push(
        Promise.all([api<Role[]>('/core/roles'), api<Permission[]>('/core/permissions')]).then(
          ([r, p]) => {
            if (active) {
              setRoles(r);
              setPermissions(p);
            }
          },
        ),
      );
    if (tab === 'catalogs' && can('core.catalogs.read'))
      tasks.push(
        api<Catalogs>('/core/catalogs').then((v) => {
          if (active) setCatalogs(v);
        }),
      );
    if (tab === 'audit' && can('core.audit.read'))
      tasks.push(
        api<Page<Audit>>(
          '/core/audit-logs?page=' + page + '&search=' + encodeURIComponent(query),
        ).then((v) => {
          if (active) setAudit(v);
        }),
      );
    Promise.all(tasks)
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, page, query, revision, me]);
  const navigate = (target: Tab) => {
    setTab(target);
    setPage(1);
    setSearch('');
    setQuery('');
    setSuccess('');
    setMenu(false);
  };
  const open = (value: Modal) => {
    setFormError('');
    setModal(value);
    if (value.kind === 'role')
      setRoleGrants(
        Object.fromEntries(value.role?.permissions.map((p) => [p.permission.id, p.scope]) || []),
      );
  };
  const save = async (path: string, method: string, body: unknown) => {
    setSaving(true);
    setFormError('');
    try {
      await api(path, method, body);
      setModal(null);
      setSuccess('Đã lưu thay đổi.');
      setRevision((v) => v + 1);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const accountTabs = (
    [
      ['users', 'core.users.read'],
      ['roles', 'core.roles.read'],
      ['catalogs', 'core.catalogs.read'],
    ] as const
  ).filter(([, p]) => can(p));
  const settingTabs = (
    [
      ['storage', 'core.audit.read'],
      ['imports', 'core.imports.manage'],
      ['audit', 'core.audit.read'],
      ['telegram', 'core.users.manage'],
    ] as const
  ).filter(([, p]) => can(p));
  const accountSection = ['users', 'roles', 'catalogs'].includes(tab);
  const settingSection = ['storage', 'imports', 'audit', 'telegram'].includes(tab);
  const nav: {
    id: Tab;
    icon: typeof Users;
    permission?: string;
    visible?: boolean;
    target?: Tab;
    active?: boolean;
  }[] = [
    { id: 'overview', icon: LayoutDashboard },
    { id: 'my-dashboard' as Tab, icon: CalendarCheck, permission: 'sales.tasks.read' },
    { id: 'my-pipeline' as Tab, icon: Kanban, permission: 'sales.tasks.read' },
    { id: 'customers', icon: Users, permission: 'sales.customers.read' },
    { id: 'products', icon: Package, permission: 'catalog.products.read' },
    { id: 'orders', icon: ShoppingBag, permission: 'sales.orders.read' },
    { id: 'inbox', icon: ClipboardList, permission: 'sales.chat.use' },
    { id: 'reports', icon: BarChart3, permission: 'sales.reports.read' },
    {
      id: 'users',
      icon: Users,
      visible: accountTabs.length > 0,
      target: accountTabs[0]?.[0],
      active: accountSection,
    },
    {
      id: 'settings',
      icon: Settings,
      visible: settingTabs.length > 0,
      target: settingTabs[0]?.[0],
      active: settingSection,
    },
  ];
  const result = tab === 'audit' ? audit : users;
  const pager = (
    <div className="pagination">
      <span>
        {result.total} kết quả · Trang {page}/{Math.max(1, Math.ceil(result.total / 20))}
      </span>
      <div>
        <button
          disabled={page <= 1 || loading}
          className="icon-button"
          aria-label="Trang trước"
          onClick={() => setPage((v) => v - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          disabled={page * 20 >= result.total || loading}
          className="icon-button"
          aria-label="Trang sau"
          onClick={() => setPage((v) => v + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
  return (
    <div className={'workspace' + (tab === 'inbox' ? ' messenger-workspace' : '')}>
      {menu && (
        <button className="nav-scrim" aria-label="Đóng menu" onClick={() => setMenu(false)} />
      )}
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <Brand />
        <span className="nav-label">KHÔNG GIAN SAKURA</span>
        <nav>
          {nav
            .filter(
              (n) =>
                n.visible !== false &&
                (!n.permission ||
                  me.grants.some(
                    (g) =>
                      g.permission === n.permission && ['GLOBAL', 'ASSIGNED'].includes(g.scope),
                  )),
            )
            .map((n) => (
              <button
                key={n.id}
                title={titles[n.id]}
                aria-label={titles[n.id]}
                className={tab === n.id || n.active ? 'active' : ''}
                onClick={() => navigate(n.target || n.id)}
              >
                <n.icon size={20} />
                <span>{titles[n.id]}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          Quản lý kinh doanh<p>Khách hàng, chăm sóc và đơn hàng trong cùng không gian.</p>
        </div>
        <button className="profile-button" onClick={() => navigate('profile')}>
          <span className="avatar">{me.displayName.slice(0, 1)}</span>
          <span>
            {me.displayName}
            <small>Tài khoản của tôi</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span>
              Sakura <span className="slash">/</span> {titles[tab]}
            </span>
          </div>
          <button className="text-button" onClick={logout}>
            <LogOut size={17} />
            Đăng xuất
          </button>
        </header>
        <main className="content">
          <div className="page-head">
            <div>
              <span className="eyebrow">SAKURA RIBBON</span>
              <h1>{titles[tab]}</h1>
            </div>
            {tab === 'users' && can('core.users.manage') && (
              <button className="primary" onClick={() => open({ kind: 'user' })}>
                <Plus size={18} />
                Thêm tài khoản
              </button>
            )}
            {tab === 'roles' && can('core.roles.manage') && (
              <button className="primary" onClick={() => open({ kind: 'role' })}>
                <Plus size={18} />
                Tạo vai trò
              </button>
            )}
            {tab === 'catalogs' && can('core.catalogs.manage') && (
              <button className="primary" onClick={() => open({ kind: 'catalog' })}>
                <Plus size={18} />
                Thêm {catalogType === 'employees' ? 'nhân viên' : 'danh mục'}
              </button>
            )}
          </div>
          {(accountSection || settingSection) && (
            <nav
              className="section-tabs"
              aria-label={accountSection ? 'Quản lý tài khoản' : 'Cài đặt hệ thống'}
            >
              {(accountSection ? accountTabs : settingTabs).map(([id]) => (
                <button key={id} aria-pressed={tab === id} onClick={() => navigate(id)}>
                  {titles[id]}
                </button>
              ))}
            </nav>
          )}
          {notice && <div className="alert">{notice}</div>}
          {success && (
            <div className="alert success" role="status">
              <Check size={18} />
              {success}
            </div>
          )}
          <ErrorBox message={error} />
          {error && (
            <button className="text-button" onClick={() => setRevision((v) => v + 1)}>
              Thử lại
            </button>
          )}
          {loading ? (
            <div className="panel empty" role="status">
              Đang tải dữ liệu…
            </div>
          ) : error ? null : (
            <>
              {tab === 'customers' && (
                <Customers
                  key={selectedCustomerId || 'all'}
                  actor={me}
                  initialId={selectedCustomerId}
                />
              )}
              {tab === 'products' && <Products actor={me} />}
              {tab === 'storage' && <Storage />}
              {tab === 'telegram' && <TelegramSettings />}
              {tab === 'orders' && <Orders actor={me} />}
              {tab === 'imports' && <Imports />}
              {tab === 'historical' && <HistoricalOrders />}
              {tab === 'inbox' && <Inbox actor={me} />}
              {(tab === 'my-dashboard' || tab === 'my-tasks') && (
                <MyDashboard
                  actor={me}
                  onCustomer={(id) => {
                    setSelectedCustomerId(id);
                    navigate('customers');
                  }}
                />
              )}
              {tab === 'my-pipeline' && (
                <MyPipeline
                  actor={me}
                  onCustomer={(id) => {
                    setSelectedCustomerId(id);
                    navigate('customers');
                  }}
                />
              )}
              {(tab === 'overview' || tab === 'reports') &&
                (me.grants.some((g) => g.permission === 'sales.reports.read') ? (
                  <SalesReport
                    key={tab}
                    detailed={tab === 'reports'}
                    openReports={() => navigate('reports')}
                  />
                ) : (
                  <section className="panel empty">
                    Tài khoản chưa được cấp quyền xem báo cáo kinh doanh. Bạn có thể sử dụng các mục
                    được phân quyền trong menu.
                  </section>
                ))}
              {(tab === 'users' || tab === 'audit') && (
                <section className="panel">
                  <div className="table-tools">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setPage(1);
                        setQuery(search);
                      }}
                      className="search"
                    >
                      <Search size={18} />
                      <input
                        aria-label={tab === 'users' ? 'Tìm tài khoản' : 'Tìm mã thao tác'}
                        placeholder={
                          tab === 'users' ? 'Tìm theo tên hoặc email…' : 'Tìm theo mã thao tác…'
                        }
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button className="text-button">Tìm</button>
                    </form>
                    <span className="muted">
                      {tab === 'users'
                        ? 'Quản lý quyền truy cập của đội ngũ'
                        : 'Thời gian Việt Nam'}
                    </span>
                  </div>
                  <div className="table-scroll">
                    {tab === 'users' ? (
                      <table>
                        <thead>
                          <tr>
                            <th>Thành viên</th>
                            <th>Vai trò</th>
                            <th>Khu vực</th>
                            <th>Trạng thái</th>
                            <th>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.items.map((u) => (
                            <tr key={u.id}>
                              <td>
                                <div className="person">
                                  <span className="avatar">{u.displayName.slice(0, 1)}</span>
                                  <span>
                                    <strong>{u.displayName}</strong>
                                    <small>{u.email}</small>
                                  </span>
                                </div>
                              </td>
                              <td>
                                {u.roleAssignments.length ? (
                                  u.roleAssignments.map((a) => (
                                    <span className="badge" key={a.role.id}>
                                      {a.role.name}
                                    </span>
                                  ))
                                ) : (
                                  <span className="muted">Chưa gán vai trò</span>
                                )}
                              </td>
                              <td>{u.employee?.region?.name || 'Chưa phân khu vực'}</td>
                              <td>
                                <span
                                  className={'badge ' + (u.status === 'ACTIVE' ? 'green' : 'gray')}
                                >
                                  {u.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                                </span>
                                {u.mustChangePassword && (
                                  <small className="muted block">Cần đổi mật khẩu</small>
                                )}
                              </td>
                              <td>
                                {can('core.users.manage') && (
                                  <div className="row-actions">
                                    <button
                                      className="text-button"
                                      onClick={() => open({ kind: 'user', user: u })}
                                    >
                                      Chỉnh sửa
                                    </button>
                                    <button
                                      className="icon-button"
                                      title="Đặt lại mật khẩu"
                                      aria-label={'Đặt lại mật khẩu cho ' + u.displayName}
                                      onClick={() => open({ kind: 'reset', user: u })}
                                    >
                                      <KeyRound size={17} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>Thời gian</th>
                            <th>Người thực hiện</th>
                            <th>Thao tác</th>
                            <th>Đối tượng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audit.items.map((a) => (
                            <tr key={a.id}>
                              <td>{date(a.createdAt)}</td>
                              <td>
                                {a.actor?.displayName || 'Hệ thống'}
                                <small className="block muted">{a.actor?.email}</small>
                              </td>
                              <td>
                                {actions[a.action] || a.action}
                                <small className="block muted">{a.action}</small>
                              </td>
                              <td>
                                {{
                                  Customer: 'Khách hàng',
                                  Order: 'Đơn hàng',
                                  ImportBatch: 'Lần nhập Sapo',
                                  ChatConversation: 'Hội thoại',
                                  ChatMessage: 'Tin nhắn',
                                  ChatTemplate: 'Mẫu trả lời',
                                  Product: 'Sản phẩm',
                                  ProductVariant: 'Biến thể',
                                  User: 'Tài khoản',
                                  Role: 'Vai trò',
                                  Session: 'Phiên đăng nhập',
                                  Platform: 'Nền tảng',
                                  Employee: 'Nhân viên',
                                  regions: 'Khu vực',
                                  departments: 'Phòng ban',
                                  branches: 'Chi nhánh',
                                }[a.entity] || a.entity}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {!result.items.length && <Empty>Chưa có kết quả phù hợp.</Empty>}
                  {pager}
                </section>
              )}
              {tab === 'roles' && (
                <>
                  <div className="note wide">
                    <ShieldCheck size={20} />
                    <span>
                      Phạm vi “Khách được giao” dựa trên phân công từng khách, không dựa trên khu
                      vực của nhân viên. Vai trò mặc định được bảo vệ; bạn có thể tạo vai trò riêng.
                    </span>
                  </div>
                  <div className="role-grid">
                    {roles.map((r) => (
                      <section className="panel role-card" key={r.id}>
                        <div className="role-card-head">
                          <span className="role-icon">
                            <ShieldCheck />
                          </span>
                          <span className="badge">{r.isSystem ? 'Mặc định' : 'Tùy chỉnh'}</span>
                        </div>
                        <h2>{r.name}</h2>
                        <p className="muted">{r.description || 'Chưa có mô tả.'}</p>
                        <div className="role-permissions">
                          {r.permissions.map((p) => (
                            <div key={p.permission.id}>
                              <span>{p.permission.name}</span>
                              <small>{scopes[p.scope]}</small>
                            </div>
                          ))}
                        </div>
                        {!r.isSystem && can('core.roles.manage') && (
                          <button
                            className="secondary"
                            onClick={() => open({ kind: 'role', role: r })}
                          >
                            Chỉnh sửa vai trò
                          </button>
                        )}
                      </section>
                    ))}
                  </div>
                </>
              )}
              {tab === 'catalogs' && (
                <section className="panel">
                  <div className="tabs" role="tablist" aria-label="Danh mục">
                    {(
                      [
                        ['employees', 'Nhân viên'],
                        ['departments', 'Phòng ban'],
                        ['regions', 'Khu vực'],
                        ['branches', 'Chi nhánh'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        role="tab"
                        aria-selected={catalogType === value}
                        key={value}
                        className={catalogType === value ? 'selected' : ''}
                        onClick={() => setCatalogType(value)}
                      >
                        {label}
                        <span>{catalogs[value].length}</span>
                      </button>
                    ))}
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Mã</th>
                          <th>{catalogType === 'employees' ? 'Họ tên' : 'Tên danh mục'}</th>
                          {catalogType === 'employees' && (
                            <>
                              <th>Phòng ban</th>
                              <th>Khu vực</th>
                              <th>Tài khoản liên kết</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {catalogType === 'employees'
                          ? catalogs.employees.map((e) => (
                              <tr key={e.id}>
                                <td>{e.code}</td>
                                <td>
                                  <strong>{e.fullName}</strong>
                                </td>
                                <td>{e.department?.name || '—'}</td>
                                <td>{e.region?.name || '—'}</td>
                                <td>{e.user?.email || 'Chưa liên kết'}</td>
                              </tr>
                            ))
                          : catalogs[catalogType].map((i) => (
                              <tr key={i.id}>
                                <td>{i.code}</td>
                                <td>
                                  <strong>{i.name}</strong>
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                  {!catalogs[catalogType].length && (
                    <Empty>
                      Chưa có {catalogType === 'employees' ? 'nhân viên' : 'danh mục'}. Thêm mới để
                      thiết lập đội ngũ.
                    </Empty>
                  )}
                </section>
              )}
              {tab === 'profile' && (
                <div className="profile-grid">
                  <section className="panel profile-info">
                    <span className="avatar large">{me.displayName.slice(0, 1)}</span>
                    <h2>{me.displayName}</h2>
                    <p className="muted">{me.email}</p>
                  </section>
                  <section className="panel password-panel">
                    <PasswordForm onChanged={onPasswordChanged} />
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="content-footer">
            Sakura · Không gian vận hành nội bộ<span>Khách hàng & đơn hàng</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Dialog
          title={
            modal.kind === 'user'
              ? modal.user
                ? 'Chỉnh sửa tài khoản'
                : 'Thêm tài khoản'
              : modal.kind === 'role'
                ? modal.role
                  ? 'Chỉnh sửa vai trò'
                  : 'Tạo vai trò'
                : modal.kind === 'reset'
                  ? 'Đặt lại mật khẩu'
                  : 'Thêm ' +
                    {
                      employees: 'nhân viên',
                      departments: 'phòng ban',
                      regions: 'khu vực',
                      branches: 'chi nhánh',
                    }[catalogType]
          }
          close={() => {
            if (!saving) setModal(null);
          }}
        >
          <ErrorBox message={formError} />
          {modal.kind === 'user' && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const roleIds = f.getAll('roles');
                if (modal.user)
                  void save('/core/users/' + modal.user.id, 'PATCH', {
                    displayName: f.get('displayName'),
                    status: f.get('status'),
                    telegramChatId: f.get('telegramChatId') || '',
                    ...(can('core.roles.manage') && can('core.roles.read') ? { roleIds } : {}),
                  });
                else
                  void save('/core/users', 'POST', {
                    displayName: f.get('displayName'),
                    email: f.get('email'),
                    password: f.get('password'),
                    roleIds,
                  });
              }}
            >
              <label>
                Họ tên
                <input
                  name="displayName"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={modal.user?.displayName}
                />
              </label>
              {!modal.user && (
                <>
                  <label>
                    Email
                    <input type="email" name="email" required maxLength={254} />
                  </label>
                  <label>
                    Mật khẩu tạm thời
                    <input
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                    />
                    <small>Ít nhất 12 ký tự. Nhân viên phải đổi khi đăng nhập lần đầu.</small>
                  </label>
                </>
              )}
              {modal.user && (
                <>
                  <label>
                    Trạng thái
                    <select name="status" defaultValue={modal.user.status}>
                      <option value="ACTIVE">Hoạt động</option>
                      <option value="DISABLED">Đã khóa</option>
                    </select>
                    <small>Khóa tài khoản sẽ thu hồi các phiên đăng nhập.</small>
                  </label>
                  <label>
                    Telegram Chat ID
                    <input
                      name="telegramChatId"
                      maxLength={50}
                      defaultValue={modal.user.telegramChatId || ''}
                      placeholder="Ví dụ: 123456789"
                    />
                    <small>Dùng @userinfobot trên Telegram để lấy Chat ID.</small>
                  </label>
                </>
              )}
              {can('core.roles.manage') && can('core.roles.read') && (
                <fieldset>
                  <legend>Vai trò</legend>
                  {roles.map((r) => (
                    <label className="checkbox" key={r.id}>
                      <input
                        type="checkbox"
                        name="roles"
                        value={r.id}
                        defaultChecked={modal.user?.roleAssignments.some((a) => a.role.id === r.id)}
                      />
                      <span>{r.name}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              <button className="primary" disabled={saving}>
                {saving ? 'Đang lưu…' : 'Lưu tài khoản'}
              </button>
            </form>
          )}
          {modal.kind === 'reset' && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void save('/core/users/' + modal.user.id + '/reset-password', 'POST', {
                  password: new FormData(e.currentTarget).get('password'),
                });
              }}
            >
              <p>
                Cấp mật khẩu mới cho <strong>{modal.user.displayName}</strong>. Các phiên hiện tại
                sẽ bị thu hồi.
              </p>
              <label>
                Mật khẩu tạm thời
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <button className="primary" disabled={saving}>
                {saving ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
              </button>
            </form>
          )}
          {modal.kind === 'role' && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save(
                  '/core/roles' + (modal.role ? '/' + modal.role.id : ''),
                  modal.role ? 'PATCH' : 'POST',
                  {
                    code: f.get('code'),
                    name: f.get('name'),
                    description: f.get('description'),
                    grants: Object.entries(roleGrants)
                      .filter(([, scope]) => scope)
                      .map(([permissionId, scope]) => ({ permissionId, scope })),
                  },
                );
              }}
            >
              <label>
                Tên vai trò
                <input
                  name="name"
                  defaultValue={modal.role?.name}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <label>
                Mã vai trò
                <input
                  name="code"
                  defaultValue={modal.role?.code}
                  pattern="[a-z][a-z0-9_]{2,49}"
                  placeholder="vd: quan_ly_kinh_doanh"
                  required
                />
                <small>3–50 ký tự thường, số hoặc dấu gạch dưới.</small>
              </label>
              <label>
                Mô tả
                <textarea
                  name="description"
                  maxLength={500}
                  defaultValue={modal.role?.description}
                />
              </label>
              <fieldset className="grants">
                <legend>Quyền và phạm vi</legend>
                {permissions.map((p) => (
                  <label key={p.id}>
                    <span>{p.name}</span>
                    <select
                      aria-label={'Phạm vi ' + p.name}
                      value={roleGrants[p.id] || ''}
                      onChange={(e) => setRoleGrants((v) => ({ ...v, [p.id]: e.target.value }))}
                    >
                      <option value="">Không cấp quyền</option>
                      {p.allowedScopes.map((s) => (
                        <option key={s} value={s}>
                          {scopes[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
              <button className="primary" disabled={saving}>
                {saving ? 'Đang lưu…' : 'Lưu vai trò'}
              </button>
            </form>
          )}
          {modal.kind === 'catalog' && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const body = Object.fromEntries(
                  [...f.entries()].filter(([, value]) => value !== ''),
                );
                void save('/core/catalogs/' + catalogType, 'POST', body);
              }}
            >
              <label>
                Mã
                <input
                  name="code"
                  pattern="[A-Z0-9_-]{2,30}"
                  placeholder={catalogType === 'employees' ? 'VD: NV001' : 'VD: CN01'}
                  required
                />
                <small>2–30 ký tự in hoa, số, dấu gạch ngang hoặc gạch dưới.</small>
              </label>
              <label>
                {catalogType === 'employees' ? 'Họ tên' : 'Tên danh mục'}
                <input
                  name={catalogType === 'employees' ? 'fullName' : 'name'}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              {catalogType === 'employees' && (
                <>
                  {(
                    [
                      ['departmentId', 'Phòng ban', catalogs.departments],
                      ['regionId', 'Khu vực', catalogs.regions],
                      ['branchId', 'Chi nhánh', catalogs.branches],
                    ] as [string, string, Item[]][]
                  ).map(([name, label, items]) => (
                    <label key={name}>
                      {label}
                      <select name={name}>
                        <option value="">Chưa chọn</option>
                        {items.map((i) => (
                          <option value={i.id} key={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {can('core.users.read') && <EmployeeAccountPicker />}
                </>
              )}
              <button className="primary" disabled={saving}>
                {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
