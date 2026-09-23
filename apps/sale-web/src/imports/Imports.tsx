import { useState } from 'react';
import { api } from '../api';
import { useResource, State, Pager } from '../sales/shared';
import { date, Page } from '../sales/types';
import { ExcelImports } from './ExcelImports';
type Kind = 'CUSTOMERS' | 'PRODUCTS' | 'ORDERS';
type Field = { key: string; label: string; required: boolean };
type Plan = {
  lines: number[];
  externalId: string;
  label: string;
  action: string;
  errors: string[];
  warnings: string[];
  data: Record<string, string>;
  items: Record<string, string>[];
};
type Batch = {
  format?: string;
  id: string;
  kind: Kind;
  fileName: string;
  digest: string;
  status: string;
  createdAt: string;
  committedAt: string | null;
  plan: Plan[];
  counts: { create: number; skip: number; errors: number };
};
type History = Pick<Batch, 'id' | 'kind' | 'fileName' | 'status' | 'createdAt'> & {
  actor: { displayName: string };
};
const names: Record<Kind, string> = {
  CUSTOMERS: 'Khách hàng',
  PRODUCTS: 'Sản phẩm / biến thể',
  ORDERS: 'Đơn hàng cũ',
};
const actions: Record<string, string> = {
  CREATE: 'Sẽ tạo mới',
  SKIP: 'Đã nhập · bỏ qua',
  ERROR: 'Cần sửa',
};
export function Imports() {
  const [format, setFormat] = useState('EXCEL'),
    [excelId, setExcelId] = useState<string | null>(null),
    [excelSelection, setExcelSelection] = useState(0);
  const schema = useResource<Record<Kind, Field[]>>('/imports/sapo/fields');
  const [kind, setKind] = useState<Kind>('CUSTOMERS'),
    [content, setContent] = useState(''),
    [fileName, setFileName] = useState(''),
    [headers, setHeaders] = useState<string[]>([]),
    [sample, setSample] = useState<string[][]>([]),
    [rowCount, setRowCount] = useState(0),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [batch, setBatch] = useState<Batch | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const history = useResource<Page<History>>('/imports/sapo/batches?page=' + page, revision);
  const current = schema.data?.[kind] || [];
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function guess(cols: string[], k: Kind) {
    return Object.fromEntries(
      (schema.data?.[k] || []).map((f) => [
        f.key,
        cols.find(
          (h) =>
            h.toLowerCase() === f.key.toLowerCase() || h.toLowerCase() === f.label.toLowerCase(),
        ) || '',
      ]),
    );
  }
  function resetReview() {
    setBatch(null);
    setConfirmed(false);
  }
  return (
    <div className="form-stack">
      <div className="sales-actions">
        <button
          className={format === 'EXCEL' ? 'primary' : 'secondary'}
          disabled={busy}
          onClick={() => {
            setFormat('EXCEL');
            resetReview();
          }}
        >
          Excel Sapo (.xlsx)
        </button>
        <button
          className={format === 'CSV' ? 'primary' : 'secondary'}
          disabled={busy}
          onClick={() => setFormat('CSV')}
        >
          CSV theo mẫu Sakura
        </button>
      </div>
      <div hidden={format !== 'EXCEL'}>
        <ExcelImports
          selectedId={excelId}
          selection={excelSelection}
          onBusy={setBusy}
          changed={() => setRevision((v) => v + 1)}
        />
      </div>
      {format === 'CSV' && (
        <>
          <div className="note wide">
            Nhập lần lượt khách hàng, sản phẩm rồi đơn cũ. Mỗi file CSV UTF-8 tối đa 200 dòng và 500
            KB. Đơn cũ chỉ dùng để tra cứu; giữ trạng thái và người chốt từ nguồn.
          </div>
          <section className="panel import-panel">
            <h2>1. Chọn file và ghép cột</h2>
            <State loading={schema.loading} error={schema.error} />
            <fieldset disabled={busy || !schema.data} className="form-fields">
              <div className="form-grid">
                <label>
                  Loại dữ liệu
                  <select
                    value={kind}
                    onChange={(e) => {
                      const k = e.target.value as Kind;
                      setKind(k);
                      setMapping(guess(headers, k));
                      resetReview();
                    }}
                  >
                    {Object.entries(names).map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  File CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      resetReview();
                      setHeaders([]);
                      setContent('');
                      setFileName('');
                      setRowCount(0);
                      setSample([]);
                      if (file)
                        void run(async () => {
                          if (file.size > 512000 || !file.name.toLowerCase().endsWith('.csv'))
                            throw new Error('Chọn file .csv UTF-8 tối đa 500 KB.');
                          let text: string;
                          try {
                            text = new TextDecoder('utf-8', { fatal: true }).decode(
                              await file.arrayBuffer(),
                            );
                          } catch {
                            throw new Error(
                              'File chưa đúng mã hóa UTF-8. Hãy xuất lại dưới dạng CSV UTF-8.',
                            );
                          }
                          const data = await api<{
                            headers: string[];
                            sample: string[][];
                            rowCount: number;
                          }>('/imports/sapo/inspect', 'POST', { content: text });
                          setContent(text);
                          setFileName(file.name);
                          setHeaders(data.headers);
                          setSample(data.sample);
                          setRowCount(data.rowCount);
                          setMapping(guess(data.headers, kind));
                        });
                    }}
                  />
                </label>
              </div>
              <p>
                <a href={'/import-templates/' + kind.toLowerCase() + '.csv'} download>
                  Tải mẫu {names[kind].toLowerCase()}
                </a>{' '}
                ·{' '}
                <a href="/import-templates/HUONG-DAN.txt" download>
                  Hướng dẫn định dạng
                </a>
              </p>
              <p className="muted">
                File Excel: xuất thành CSV UTF-8 trước khi chọn. Đặt cột mã và số điện thoại ở dạng
                văn bản để giữ số 0 đầu. Mẫu chỉ chứa tiêu đề, không có dữ liệu thật.
              </p>
              {!!headers.length && (
                <>
                  <p>
                    <strong>{fileName}</strong> · {rowCount} dòng. Chọn đúng cột nguồn cho các
                    trường có dấu *.
                  </p>
                  <div className="form-grid">
                    {current.map((f) => (
                      <label key={f.key}>
                        {f.label}
                        {f.required ? ' *' : ''}
                        <select
                          value={mapping[f.key] || ''}
                          onChange={(e) => {
                            setMapping({ ...mapping, [f.key]: e.target.value });
                            resetReview();
                          }}
                        >
                          <option value="">Chưa chọn</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <details>
                    <summary>Ba dòng đầu trong file</summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {headers.map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sample.map((row, i) => (
                            <tr key={i}>
                              {row.map((v, j) => (
                                <td key={j}>{v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <button
                    className="primary"
                    disabled={current.some((f) => f.required && !mapping[f.key])}
                    onClick={() =>
                      void run(async () => {
                        const b = await api<Batch>('/imports/sapo/preview', 'POST', {
                          kind,
                          fileName,
                          content,
                          mapping,
                        });
                        setBatch(b);
                        setConfirmed(false);
                        setRevision((v) => v + 1);
                      })
                    }
                  >
                    Kiểm tra và xem trước
                  </button>
                </>
              )}
            </fieldset>
          </section>
        </>
      )}
      <State loading={false} error={error} />
      {busy && <p role="status">Đang xử lý…</p>}
      {batch && (
        <section className="panel import-panel">
          <h2>2. Xem trước · {names[batch.kind]}</h2>
          <p>
            {batch.fileName} · Kiểm tra lúc {date(batch.createdAt)}
          </p>
          <div className="import-counts">
            <span>{batch.counts.create} tạo mới</span>
            <span>{batch.counts.skip} bỏ qua</span>
            <span>{batch.counts.errors} có lỗi</span>
          </div>
          <p className="muted">
            Đây là dữ liệu sẽ được lưu sau khi xác nhận. Một lỗi sẽ chặn toàn bộ lần nhập. Sửa file
            gốc rồi chọn lại để kiểm tra.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dòng CSV</th>
                  <th>Mã nguồn / Tên</th>
                  <th>Kết quả</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {batch.plan.map((p, i) => (
                  <tr key={i}>
                    <td>{p.lines?.join(', ') || '—'}</td>
                    <td>
                      {p.externalId}
                      <br />
                      {p.label}
                    </td>
                    <td>
                      {batch.status === 'COMMITTED' && p.action === 'CREATE'
                        ? 'Đã tạo'
                        : actions[p.action]}
                    </td>
                    <td>
                      {p.errors.map((e, i) => (
                        <p className="alert error" key={i}>
                          {e}
                        </p>
                      ))}
                      {p.warnings.map((e, i) => (
                        <p key={i}>{e}</p>
                      ))}
                      <details>
                        <summary>Xem dữ liệu chuẩn hóa</summary>
                        <dl>
                          {Object.entries(p.data).map(([k, v]) => (
                            <div key={k}>
                              <dt>
                                {schema.data?.[batch.kind].find((f) => f.key === k)?.label || k}
                              </dt>
                              <dd>{v || 'Không có trong nguồn'}</dd>
                            </div>
                          ))}
                        </dl>
                        {p.items.map((item, j) => (
                          <p key={j}>
                            {item.sku} · {item.productName} · {item.quantity} × {item.unitPrice} ={' '}
                            {item.lineTotal} đ
                          </p>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.status === 'COMMITTED' ? (
            <p className="alert success" role="status">
              Đã xác nhận nhập. Dữ liệu mới đã sẵn sàng trong ứng dụng.
            </p>
          ) : (
            <>
              <label className="import-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || batch.counts.errors > 0}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                Tôi đã đối chiếu dữ liệu, phân công Sale và các dòng bị bỏ qua.
              </label>
              <button
                className="primary"
                disabled={busy || !confirmed || batch.counts.errors > 0}
                onClick={() =>
                  void run(async () => {
                    await api('/imports/sapo/batches/' + batch.id + '/commit', 'POST', {
                      digest: batch.digest,
                    });
                    setBatch(await api<Batch>('/imports/sapo/batches/' + batch.id));
                    setRevision((v) => v + 1);
                  })
                }
              >
                Xác nhận nhập {batch.counts.create} bản ghi
              </button>
              <p className="muted">
                Bản xem trước có hiệu lực 24 giờ. Nếu dữ liệu liên quan thay đổi, hệ thống sẽ yêu
                cầu kiểm tra lại.
              </p>
            </>
          )}
        </section>
      )}
      <section className="panel import-panel">
        <h2>Lịch sử nhập</h2>
        <State loading={history.loading} error={history.error} />
        {history.data && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Loại</th>
                    <th>Người kiểm tra</th>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() =>
                            void run(async () => {
                              const loaded = await api<Batch>('/imports/sapo/batches/' + b.id);
                              if (loaded.format === 'SAPO_EXCEL_V2') {
                                setBatch(null);
                                setExcelId(loaded.id);
                                setExcelSelection((v) => v + 1);
                                setFormat('EXCEL');
                              } else {
                                setBatch(loaded);
                                setFormat('CSV');
                              }
                              setConfirmed(false);
                            })
                          }
                        >
                          {b.fileName}
                        </button>
                      </td>
                      <td>{names[b.kind]}</td>
                      <td>{b.actor.displayName}</td>
                      <td>{date(b.createdAt)}</td>
                      <td>{b.status === 'COMMITTED' ? 'Đã nhập' : 'Bản xem trước'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <State loading={false} error="" empty={!history.data.items.length} />
            <Pager data={history.data} page={page} setPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
