import { useState } from 'react';
import { CalendarDays, Settings2, X } from 'lucide-react';
import { api } from '../api';
import { Form, Modal, State } from '../sales/shared';
export type Label = { name: string; color: string };
export type Toolbar = { version: number; days: number; labels: Label[] };
export const defaultToolbar: Toolbar = {
  version: 0,
  days: 8,
  labels: [
    { name: 'VIP', color: '#f5a4bc' },
    { name: 'Tư vấn', color: '#d8b9ed' },
    { name: 'Quan tâm', color: '#a4cdf5' },
    { name: 'Đã chốt', color: '#a4dfbc' },
    { name: 'Gửi hàng', color: '#a4dfe9' },
    { name: 'Hoàn thành', color: '#f6dfa0' },
  ],
};
export function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export function labelInk(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 155
    ? '#293445'
    : '#fff';
}
function EditToolbar({
  value,
  done,
  close,
}: {
  value: Toolbar;
  done: () => void;
  close: () => void;
}) {
  const [labels, setLabels] = useState(value.labels);
  return (
    <Modal title="Tùy chỉnh thanh ngày & nhãn" close={close}>
      <Form
        label="Lưu cho cả đội"
        done={done}
        submit={(f) =>
          api('/messenger/toolbar', 'PATCH', {
            version: value.version,
            days: Number(f.get('days')),
            labels,
          })
        }
      >
        <label>
          Số ngày gần đây
          <input name="days" type="number" min={1} max={14} defaultValue={value.days} required />
        </label>
        <p className="muted">
          Bấm ngày để gắn ngày chăm sóc vào hội thoại. Bấm nhãn để bật/tắt; mỗi hội thoại tối đa 10
          nhãn. Đổi tên ở đây không đổi nhãn đã gắn trước đó.
        </p>
        <div className="label-editor">
          {labels.map((l, i) => (
            <div key={i}>
              <input
                aria-label={'Tên nhãn ' + (i + 1)}
                value={l.name}
                maxLength={30}
                required
                onChange={(e) =>
                  setLabels(labels.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                }
              />
              <input
                type="color"
                aria-label={'Màu nhãn ' + (i + 1)}
                value={l.color}
                onChange={(e) =>
                  setLabels(labels.map((x, j) => (i === j ? { ...x, color: e.target.value } : x)))
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={'Xóa nhãn ' + (i + 1)}
                onClick={() => setLabels(labels.filter((_, j) => i !== j))}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          disabled={labels.length >= 20}
          onClick={() => setLabels([...labels, { name: '', color: '#d8b9ed' }])}
        >
          Thêm nhãn
        </button>
      </Form>
    </Modal>
  );
}
export function QuickLabels({
  id,
  version,
  tags,
  taggedDate,
  value,
  manage,
  disabled,
  changed,
}: {
  id: string;
  version: number;
  tags: string[];
  taggedDate?: string | null;
  value: Toolbar;
  manage: boolean;
  disabled: boolean;
  changed: () => void;
}) {
  const [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const days = Array.from({ length: value.days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return {
      key: dateKey(d),
      label: String(d.getDate()).padStart(2, '0'),
      full: d.toLocaleDateString('vi-VN'),
    };
  });
  async function save(kind: 'tags' | 'date', data: object) {
    setBusy(true);
    setError('');
    try {
      await api('/messenger/conversations/' + id + '/' + kind, 'PATCH', { version, ...data });
      changed();
    } catch (e) {
      setError((e as Error).message);
      changed();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="quick-labels">
      <div className="quick-label-heading">
        <span>
          <CalendarDays size={12} /> Ngày & nhãn{' '}
          {taggedDate && <b>{taggedDate.split('-').reverse().join('/')}</b>}
        </span>
        {manage && (
          <button
            title="Tùy chỉnh ngày và nhãn"
            aria-label="Tùy chỉnh ngày và nhãn"
            onClick={() => setEdit(true)}
          >
            <Settings2 size={14} />
          </button>
        )}
      </div>
      <div className="quick-label-row date-row">
        {days.map((day, i) => (
          <button
            key={day.key}
            title={'Gắn ngày ' + day.full}
            aria-label={'Gắn ngày ' + day.full}
            aria-pressed={taggedDate === day.key}
            disabled={busy || disabled}
            style={{
              backgroundColor:
                value.labels[i % Math.max(1, value.labels.length)]?.color || '#dce6f1',
              color: labelInk(
                value.labels[i % Math.max(1, value.labels.length)]?.color || '#dce6f1',
              ),
            }}
            onClick={() => void save('date', { date: taggedDate === day.key ? '' : day.key })}
          >
            {day.label}
          </button>
        ))}
        <label className="date-picker" title="Chọn ngày khác">
          <CalendarDays size={13} />
          <input
            aria-label="Chọn ngày gắn hội thoại"
            type="date"
            disabled={busy || disabled}
            value={taggedDate || ''}
            onChange={(e) => void save('date', { date: e.target.value })}
          />
        </label>
      </div>
      <div className="quick-label-row">
        {value.labels.map((l) => (
          <button
            key={l.name}
            style={{ backgroundColor: l.color, color: labelInk(l.color) }}
            aria-pressed={tags.includes(l.name)}
            disabled={busy || disabled}
            onClick={() =>
              void save('tags', {
                tags: tags.includes(l.name) ? tags.filter((t) => t !== l.name) : [...tags, l.name],
              })
            }
          >
            {l.name}
          </button>
        ))}
      </div>
      <State loading={false} error={error} />
      {edit && (
        <EditToolbar
          value={value}
          close={() => setEdit(false)}
          done={() => {
            setEdit(false);
            changed();
          }}
        />
      )}
    </div>
  );
}
