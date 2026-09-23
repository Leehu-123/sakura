import { useEffect, useRef, useState, useId, type ReactNode, type FormEvent } from 'react';
import { X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { Page } from './types';
export function useResource<T>(path: string, revision = 0, enabled = true) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    if (!enabled) {
      setLoading(false);
      return;
    }
    api<T>(path)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision, enabled]);
  return { data, error, loading };
}
export function State({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
}) {
  if (error)
    return (
      <div className="alert error" role="alert">
        {error}
      </div>
    );
  if (loading)
    return (
      <div className="empty" role="status">
        Đang tải dữ liệu…
      </div>
    );
  if (empty) return <div className="empty">Chưa có dữ liệu phù hợp.</div>;
  return null;
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      className="sales-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby={titleId}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Đóng">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Pager({
  data,
  page,
  setPage,
}: {
  data: Page<unknown>;
  page: number;
  setPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {data.total} kết quả · Trang {page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft />
        </button>
        <button
          className="icon-button"
          aria-label="Trang sau"
          disabled={page * data.pageSize >= data.total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
export function SearchBox({
  onSearch,
  placeholder,
}: {
  onSearch: (s: string) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
    >
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
      <button className="text-button">Tìm</button>
    </form>
  );
}
export function Form({
  submit,
  children,
  label = 'Lưu',
  done,
}: {
  submit: (data: FormData) => Promise<unknown>;
  children: ReactNode;
  label?: string;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await submit(data);
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <State loading={false} error={error} />
      <fieldset disabled={busy} className="form-fields">
        {children}
      </fieldset>
      <button className="primary" disabled={busy}>
        {busy ? 'Đang lưu…' : label}
      </button>
    </form>
  );
}
