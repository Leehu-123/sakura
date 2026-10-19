import { useState } from 'react';
import { Person } from './types';
import { State, useResource } from './shared';
import { api } from '../api';
import type { Task } from './MyTasks';

export type TaskParticipant = { userId: string; role: 'COLLABORATOR' | 'FOLLOWER'; user: Person };

export function taskPeopleBody(f: FormData) {
  return { collaboratorIds: f.getAll('collaboratorIds'), followerIds: f.getAll('followerIds') };
}

export function TaskPeopleFields({ task }: { task: Task | null }) {
  const people =
    useResource<(Person & { canCollaborate: boolean; isSelf?: boolean })[]>('/sales/tasks/people');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries((task?.participants || []).map((p) => [p.userId, p.role])),
  );
  const candidates = new Map(
    (people.data || [])
      .filter((p) => (task ? p.id !== task.user?.id : !p.isSelf))
      .map((p) => [p.id, p]),
  );
  for (const p of task?.participants || []) {
    if (!candidates.has(p.userId))
      candidates.set(p.userId, { ...p.user, canCollaborate: p.role === 'COLLABORATOR' });
  }
  const rows = [...candidates.values()].filter(
    (p) =>
      selected[p.id] ||
      p.displayName.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
  );
  return (
    <fieldset className="task-people-fields">
      <legend>Gắn thẻ nhân sự</legend>
      <p className="muted">
        Cùng triển khai: xem và cập nhật tiến độ. Nắm thông tin: chỉ xem công việc. Công việc hiển
        thị trong Tổng quan sale của người được gắn thẻ.
      </p>
      {Object.entries(selected)
        .filter(([, role]) => role)
        .map(([id, role]) => (
          <input
            key={id}
            type="hidden"
            name={role === 'COLLABORATOR' ? 'collaboratorIds' : 'followerIds'}
            value={id}
          />
        ))}
      <label>
        Tìm nhân sự
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nhập tên nhân sự…"
        />
      </label>
      <State loading={people.loading} error={people.error} />
      <div className="task-people-options">
        {rows.map((p) => (
          <label key={p.id} className="task-person-option">
            <span>{p.displayName}</span>
            <select
              aria-label={'Vai trò của ' + p.displayName}
              value={selected[p.id] || ''}
              onChange={(e) => setSelected((current) => ({ ...current, [p.id]: e.target.value }))}
            >
              <option value="">Không gắn thẻ</option>
              <option value="COLLABORATOR" disabled={!p.canCollaborate}>
                Cùng triển khai
              </option>
              <option value="FOLLOWER">Nắm thông tin</option>
            </select>
          </label>
        ))}
        {!people.loading && !rows.length && <p className="muted">Không có nhân sự phù hợp.</p>}
      </div>
      <small>
        Gắn thẻ chia sẻ nội dung công việc và tên khách liên quan; quyền mở hồ sơ khách hàng vẫn
        theo phân quyền hiện có.
      </small>
    </fieldset>
  );
}

export function TaskPeopleSummary({ task }: { task: Task }) {
  return (
    <div className="task-people-summary">
      {task.user && <small className="muted">Chủ trì: {task.user.displayName}</small>}
      {(task.participants || []).map((p) => (
        <span key={p.userId} className={'badge ' + (p.role === 'FOLLOWER' ? 'gray' : '')}>
          @{p.user.displayName} · {p.role === 'COLLABORATOR' ? 'Cùng triển khai' : 'Nắm thông tin'}
        </span>
      ))}
    </div>
  );
}

export function SharedTaskStatus({ task, changed }: { task: Task; changed: () => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (task.canManage || !task.canUpdateStatus) return null;
  return (
    <div>
      <label>
        Tiến độ công việc
        <select
          value={task.status}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            setError('');
            try {
              await api('/sales/tasks/' + task.id, 'PATCH', {
                version: task.version,
                status: e.target.value,
              });
              changed();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="TODO">Cần làm</option>
          <option value="IN_PROGRESS">Đang làm</option>
          <option value="DONE">Hoàn thành</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
      </label>
      <State loading={false} error={error} />
    </div>
  );
}
