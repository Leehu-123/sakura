import { useState } from 'react';
import { State, useResource } from './shared';
import { Actor } from './types';
import { api } from '../api';
type Staff = {
  id: string;
  displayName: string;
  status: string;
  roleAssignments: { role: { code: string } }[];
};
export function SalesStaff({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const allowed = actor.grants.some(
    (g) => g.permission === 'sales.staff.manage' && g.scope === 'GLOBAL',
  );
  const result = useResource<Staff[]>('/sales/staff', revision, allowed && open);
  if (!allowed) return null;
  return (
    <section className="panel">
      <button className="secondary" onClick={() => setOpen((v) => !v)}>
        Quản lý vai trò Sale vùng
      </button>
      {open && (
        <>
          <p className="muted">
            Chỉ cấp/gỡ vai trò Sale vùng cho tài khoản phù hợp. Thay đổi sẽ yêu cầu nhân sự đăng
            nhập lại.
          </p>
          <State loading={result.loading} error={result.error || error} />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th>Trạng thái</th>
                  <th>Vai trò Sale vùng</th>
                </tr>
              </thead>
              <tbody>
                {result.data
                  ?.filter((u) => u.id !== actor.id)
                  .map((u) => (
                    <tr key={u.id}>
                      <td>{u.displayName}</td>
                      <td>{u.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}</td>
                      <td>
                        <input
                          aria-label={'Cấp vai trò Sale vùng cho ' + u.displayName}
                          type="checkbox"
                          checked={u.roleAssignments.length > 0}
                          disabled={busy}
                          onChange={async (e) => {
                            const regionalSales = e.target.checked;
                            if (
                              !confirm(
                                (regionalSales ? 'Cấp' : 'Gỡ') +
                                  ' vai trò Sale vùng cho ' +
                                  u.displayName +
                                  '?',
                              )
                            )
                              return;
                            setBusy(true);
                            setError('');
                            try {
                              await api('/sales/staff/' + u.id, 'PATCH', { regionalSales });
                              setRevision((v) => v + 1);
                            } catch (err) {
                              setError((err as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
