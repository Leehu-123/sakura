import { useState } from 'react';
import { api } from '../api';
import { Actor, date, Person } from '../sales/types';
import { Form, Modal, State, useResource } from '../sales/shared';
import { LiveStatus, useLiveResource } from './useLiveResource';
type Team = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  members: { userId: string; user: Person }[];
  pages: { pageId: string }[];
};
type Shift = {
  id: string;
  userId: string;
  label: string;
  startedAt: string;
  user: Person;
  team: { name: string };
};
type Overview = { teams: Team[]; shifts: Shift[]; users: Person[]; canManage: boolean };
function TeamEditor({
  team,
  users,
  close,
  done,
}: {
  team?: Team;
  users: Person[];
  close: () => void;
  done: () => void;
}) {
  const [members, setMembers] = useState(team?.members.map((m) => m.userId) || []),
    [pages, setPages] = useState(team?.pages.map((p) => p.pageId) || []);
  const config = useResource<{ pages: { pageId: string; name: string }[] }>(
    '/messenger/configuration',
  );
  const choices = new Map(users.map((u) => [u.id, u.displayName]));
  for (const m of team?.members || [])
    if (!choices.has(m.userId))
      choices.set(m.userId, m.user.displayName + ' · Không còn đủ quyền, cần bỏ chọn');
  const pageChoices = new Map((config.data?.pages || []).map((p) => [p.pageId, p.name]));
  for (const p of team?.pages || [])
    if (!pageChoices.has(p.pageId)) pageChoices.set(p.pageId, 'Fanpage ' + p.pageId);
  function toggle(list: string[], id: string, checked: boolean) {
    return checked ? [...list, id] : list.filter((v) => v !== id);
  }
  return (
    <Modal title={team ? 'Cập nhật nhóm phụ trách' : 'Thêm nhóm phụ trách'} close={close}>
      <p>
        Thành viên được xem hội thoại của các Fanpage trong nhóm, kể cả khách chưa gắn hồ sơ. Quyền
        xem hồ sơ khách và thao tác đơn hàng vẫn theo vai trò/phân công riêng.
      </p>
      <Form
        done={done}
        submit={(f) =>
          api('/messenger/staffing/teams' + (team ? '/' + team.id : ''), team ? 'PATCH' : 'POST', {
            version: team?.version || 0,
            name: String(f.get('name')),
            isActive: f.get('isActive') === 'on',
            memberIds: members,
            pageIds: pages,
          })
        }
      >
        <label>
          Tên nhóm / vị trí
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={team?.name || ''}
            placeholder="Ví dụ: Tư vấn bán hàng"
          />
        </label>
        <label className="check">
          <input name="isActive" type="checkbox" defaultChecked={team?.isActive ?? true} />
          Nhóm hoạt động
        </label>
        <fieldset className="staffing-choices">
          <legend>Nhân viên trong nhóm</legend>
          {[...choices].map(([id, name]) => (
            <label key={id} className="check">
              <input
                type="checkbox"
                checked={members.includes(id)}
                onChange={(e) => setMembers(toggle(members, id, e.target.checked))}
              />
              {name}
            </label>
          ))}
        </fieldset>
        <State loading={config.loading} error={config.error} />
        <fieldset className="staffing-choices">
          <legend>Fanpage phụ trách</legend>
          {[...pageChoices].map(([id, name]) => (
            <label key={id} className="check">
              <input
                type="checkbox"
                checked={pages.includes(id)}
                onChange={(e) => setPages(toggle(pages, id, e.target.checked))}
              />
              {name} · {id}
            </label>
          ))}
        </fieldset>
        {!pageChoices.size && (
          <p>
            Chưa có Fanpage. Có thể tạo nhóm trước, rồi thêm Fanpage tại Cấu hình → Kết nối Fanpage.
          </p>
        )}
        <p className="muted">
          Mỗi Fanpage thuộc một nhóm. Kết thúc các ca trong nhóm trước khi đổi thành viên/Fanpage.
          Gán Fanpage sẽ chuyển hội thoại hiện có vào hàng chờ của nhóm.
        </p>
      </Form>
    </Modal>
  );
}
export function StaffingBoard({ actor, changed }: { actor: Actor; changed: () => void }) {
  const [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<Team | 'new' | null>(null),
    [ending, setEnding] = useState<Shift | null>(null);
  const r = useLiveResource<Overview>('/messenger/staffing', revision, {
      enabled: !editing && !ending,
    }),
    d = r.data;
  const refresh = () => {
    setEditing(null);
    setEnding(null);
    setRevision((v) => v + 1);
    changed();
  };
  const myShift = d?.shifts.find((s) => s.userId === actor.id);
  const myTeams =
    d?.teams.filter((t) => t.isActive && t.members.some((m) => m.userId === actor.id)) || [];
  return (
    <section className="panel import-panel">
      <div className="sales-toolbar">
        <h2>Ca trực và nhóm phụ trách</h2>
        <button className="secondary" onClick={refresh}>
          Làm mới
        </button>
      </div>
      <State loading={r.loading} error={r.error} />
      <LiveStatus resource={r} />
      {d && (
        <>
          <p>
            Mỗi người dùng tài khoản Sakura riêng. Bắt đầu một ca trong nhóm, sau đó vào Hội thoại →
            Chờ nhận để nhận việc. Danh sách tự cập nhật khi bạn đang mở màn hình này.
          </p>
          {myShift ? (
            <div className="note">
              <strong>
                Bạn đang trực: {myShift.label} · {myShift.team.name}
              </strong>
              <p>Bắt đầu {date(myShift.startedAt)}</p>
              <button onClick={() => setEnding(myShift)}>Kết thúc ca của tôi</button>
            </div>
          ) : myTeams.length ? (
            <Form
              label="Bắt đầu ca"
              done={refresh}
              submit={(f) =>
                api('/messenger/staffing/shifts', 'POST', {
                  teamId: String(f.get('teamId')),
                  label: String(f.get('label')),
                })
              }
            >
              <label>
                Nhóm trực
                <select name="teamId">
                  {myTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tên ca
                <input
                  name="label"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ví dụ: Ca sáng 13/09"
                />
              </label>
            </Form>
          ) : (
            <p className="note">
              Bạn chưa thuộc nhóm đang hoạt động. Quản trị viên thêm bạn vào nhóm trước khi bắt đầu
              ca.
            </p>
          )}
          <h3>Nhân viên đang trực ({d.shifts.length})</h3>
          {d.shifts.map((s) => (
            <div className="activity" key={s.id}>
              <strong>{s.user.displayName}</strong> · {s.label} · {s.team.name}
              <p>{date(s.startedAt)}</p>
              {(s.userId === actor.id || d.canManage) && (
                <button className="secondary" onClick={() => setEnding(s)}>
                  Kết thúc ca
                </button>
              )}
            </div>
          ))}
          {!d.shifts.length && <p>Chưa có ca đang mở trong phạm vi của bạn.</p>}
          <div className="sales-toolbar">
            <h3>Nhóm phụ trách</h3>
            {d.canManage && <button onClick={() => setEditing('new')}>Thêm nhóm</button>}
          </div>
          {d.teams.map((t) => (
            <article className="activity" key={t.id}>
              <strong>
                {t.name} · {t.isActive ? 'Đang hoạt động' : 'Đang tắt'}
              </strong>
              <p>
                {t.members.map((m) => m.user.displayName).join(', ') || 'Chưa có thành viên'} ·{' '}
                {t.pages.length} Fanpage
              </p>
              {d.canManage && (
                <button className="secondary" onClick={() => setEditing(t)}>
                  Sửa nhóm
                </button>
              )}
            </article>
          ))}
          <p className="muted">
            Kết thúc ca trả mọi hội thoại đang nhận về hàng chờ, giữ ghi chú và người gửi cũ. Chưa
            tự xếp lịch hoặc tự kết thúc ca khi đóng trình duyệt. Quản trị viên có thể kết thúc ca
            bị bỏ quên.
          </p>
          {editing && (
            <TeamEditor
              team={editing === 'new' ? undefined : editing}
              users={d.users}
              close={() => setEditing(null)}
              done={refresh}
            />
          )}
          {ending && (
            <Modal title={'Kết thúc ca · ' + ending.user.displayName} close={() => setEnding(null)}>
              <p>
                Các hội thoại chưa xong sẽ về hàng chờ để người đang trực nhận tiếp. Tin đang
                gửi/chưa rõ kết quả cần được đối chiếu trước.
              </p>
              <Form
                label="Kết thúc và trả việc về hàng chờ"
                done={refresh}
                submit={(f) =>
                  api('/messenger/staffing/shifts/' + ending.id + '/end', 'POST', {
                    note: String(f.get('note')),
                  })
                }
              >
                <label>
                  Ghi chú bàn giao
                  <textarea
                    name="note"
                    required
                    minLength={3}
                    maxLength={500}
                    placeholder="Những việc người nhận ca cần biết…"
                  />
                </label>
              </Form>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
type WorkContext = {
  managed: boolean;
  team?: { name: string; isActive: boolean };
  workState: string;
  version: number;
  inboundSeq: number;
  supportUserId: string | null;
  shifts: Shift[];
  canManage: boolean;
  events: {
    id: string;
    action: string;
    createdAt: string;
    actor: Person | null;
    metadata: { note?: string; toName?: string };
  }[];
};
const actions: Record<string, string> = {
  CLAIM: 'Nhận xử lý',
  HANDOFF: 'Bàn giao',
  RELEASE: 'Trả về hàng chờ',
  COMPLETE: 'Hoàn tất xử lý',
  TAKEOVER: 'Tiếp quản',
};
const eventNames: Record<string, string> = {
  claim: 'Nhận xử lý',
  handoff: 'Bàn giao',
  release: 'Trả về hàng chờ',
  complete: 'Hoàn tất',
  takeover: 'Tiếp quản',
  shift_released: 'Kết thúc ca, trả việc về hàng chờ',
};
export function WorkPanel({
  id,
  actor,
  revision,
  changed,
}: {
  id: string;
  actor: Actor;
  revision: number;
  changed: () => void;
}) {
  const [action, setAction] = useState('');
  const r = useLiveResource<WorkContext>('/messenger/staffing/conversations/' + id, revision, {
      enabled: !action,
    }),
    d = r.data;
  if (r.error) return <State loading={false} error={r.error} />;
  if (!d?.managed) return null;
  const mine = d.supportUserId === actor.id,
    active = d.shifts.some((s) => s.userId === actor.id);
  return (
    <section className="work-panel">
      <strong>
        {d.team?.name} ·{' '}
        {
          (
            { WAITING: 'Chờ nhận', ACTIVE: 'Đang xử lý', DONE: 'Đã hoàn tất' } as Record<
              string,
              string
            >
          )[d.workState]
        }
      </strong>
      <p>
        {active
          ? 'Bạn đang có ca trong nhóm này.'
          : 'Vào Ca trực để bắt đầu ca trước khi nhận và gửi tin.'}{' '}
        {d.supportUserId && !mine ? 'Một đồng nghiệp đang nhận hội thoại này.' : ''}
      </p>
      <div className="fanpage-actions">
        {!d.supportUserId && d.workState === 'WAITING' && (
          <button disabled={!active} onClick={() => setAction('CLAIM')}>
            Nhận xử lý
          </button>
        )}
        {(mine || d.canManage) &&
          d.supportUserId &&
          ['HANDOFF', 'RELEASE', 'COMPLETE'].map((a) => (
            <button key={a} className="secondary" onClick={() => setAction(a)}>
              {actions[a]}
            </button>
          ))}
        {d.canManage && !mine && (d.supportUserId || d.workState === 'DONE') && (
          <button className="secondary" disabled={!active} onClick={() => setAction('TAKEOVER')}>
            Tiếp quản
          </button>
        )}
      </div>
      <details>
        <summary>Lịch sử nhận việc / bàn giao ({d.events.length} gần nhất)</summary>
        {d.events.map((e) => (
          <article className="activity" key={e.id}>
            <strong>
              {e.actor?.displayName || 'Tài khoản cũ'} ·{' '}
              {eventNames[e.action.replace('staffing.', '')] || e.action}
            </strong>
            <small className="block">
              {date(e.createdAt)}
              {e.metadata.toName ? ' → ' + e.metadata.toName : ''}
            </small>
            <p>{e.metadata.note}</p>
          </article>
        ))}
      </details>
      {action && (
        <Modal title={actions[action]} close={() => setAction('')}>
          <Form
            label={actions[action]}
            done={() => {
              setAction('');
              changed();
            }}
            submit={(f) =>
              api('/messenger/staffing/conversations/' + id, 'POST', {
                version: d.version,
                inboundSeq: d.inboundSeq,
                action,
                note: String(f.get('note')),
                ...(action === 'HANDOFF' ? { targetUserId: String(f.get('targetUserId')) } : {}),
              })
            }
          >
            {action === 'HANDOFF' && (
              <label>
                Người nhận đang trực
                <select name="targetUserId" required defaultValue="">
                  <option value="" disabled>
                    Chọn người nhận
                  </option>
                  {d.shifts
                    .filter((s) => s.userId !== d.supportUserId)
                    .map((s) => (
                      <option key={s.id} value={s.userId}>
                        {s.user.displayName} · {s.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Ghi chú
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={500}
                defaultValue={action === 'CLAIM' ? 'Nhận xử lý trong ca trực.' : ''}
              />
            </label>
            <p className="muted">
              Bàn giao thay đổi người xử lý hội thoại; người phụ trách khách và người chốt đơn được
              giữ nguyên.
            </p>
          </Form>
        </Modal>
      )}
    </section>
  );
}
