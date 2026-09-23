import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Pager, State } from '../sales/shared';
import { Page, date } from '../sales/types';

type Entry = {
  kind: string;
  externalId: string;
  label: string;
  lines: number[];
  action: string;
  errors: string[];
  warnings: string[];
  data: Record<string, string | null>;
  items: {
    sku: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string | null;
  }[];
  itemCount: number;
};
type Batch = {
  id: string;
  kind: string;
  fileName: string;
  digest: string;
  status: string;
  createdAt: string;
  sheet: string;
  rowCount: number;
  counts: { create: number; skip: number; errors: number };
  plan: Page<Entry>;
};
type Images = { total: number; done: number; remaining: number; failures: string[] };
const names: Record<string, string> = {
  CUSTOMERS: 'Khách hàng',
  PRODUCTS: 'Biến thể',
  PRODUCT_GROUP: 'Sản phẩm',
  ORDERS: 'Đơn cũ',
};
export function ExcelImports({
  selectedId,
  selection,
  onBusy,
  changed,
}: {
  selectedId: string | null;
  selection: number;
  onBusy: (b: boolean) => void;
  changed: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [batch, setBatch] = useState<Batch | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [images, setImages] = useState<Images | null>(null),
    [imageBusy, setImageBusy] = useState(false);
  const stop = useRef(false);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    previewHeading.current?.scrollIntoView({ block: 'start' });
  }, [batch]);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  useEffect(() => {
    if (selectedId)
      void run(async () => {
        setBatch(await api<Batch>('/imports/sapo/excel/batches/' + selectedId));
        setConfirmed(false);
      });
  }, [selectedId, selection]);
  useEffect(() => {
    setImages(null);
    if (batch?.kind !== 'PRODUCTS' || batch.status !== 'COMMITTED') return;
    let active = true;
    void api<Images>('/imports/sapo/excel/batches/' + batch.id + '/images')
      .then((v) => {
        if (active) setImages(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [batch?.id, batch?.status]);
  async function downloadImages() {
    if (!batch) return;
    stop.current = false;
    setImageBusy(true);
    await run(async () => {
      do {
        const result = await api<Images>(
          '/imports/sapo/excel/batches/' + batch.id + '/images',
          'POST',
        );
        setImages(result);
        if (result.remaining === 0 || result.failures.length) break;
      } while (!stop.current);
    });
    setImageBusy(false);
  }
  return (
    <section className="panel import-panel form-stack">
      <h2>Nhập Excel xuất từ Sapo</h2>
      <p>
        Nhập lần lượt khách hàng, sản phẩm rồi đơn cũ. Sakura tự nhận diện loại file và ghép cột
        theo tiêu đề. Tối đa 10 MB, 50.000 dòng dữ liệu, một trang tính.
      </p>
      <label>
        File Excel Sapo (.xlsx)
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setBatch(null);
            setImages(null);
            setConfirmed(false);
            setError('');
          }}
        />
      </label>
      <p className="muted">
        Dùng file xuất gốc, không cần chuyển CSV. Khách thiếu điện thoại vẫn được giữ; chưa tự phân
        công Sale. Đơn cũ giữ thông tin nguồn và xuất hiện trong Đơn hàng → Sapo đã nhập.
      </p>
      <button
        className="primary"
        disabled={busy || !file}
        onClick={() =>
          void run(async () => {
            if (!file || file.size > 10 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.xlsx'))
              throw Error('Chọn file .xlsx tối đa 10 MB.');
            const form = new FormData();
            form.append('file', file);
            const result = await api<Batch>('/imports/sapo/excel/preview', 'POST', form);
            setBatch(result);
            setConfirmed(false);
            changed();
          })
        }
      >
        {busy && !imageBusy ? 'Đang xử lý…' : 'Kiểm tra file Excel và xem trước'}
      </button>
      <State loading={false} error={error} />
      {batch && (
        <>
          <h3 ref={previewHeading}>{batch.fileName}</h3>
          <p>
            {batch.kind === 'PRODUCTS' ? 'Sản phẩm / biến thể' : names[batch.kind]} · Trang tính{' '}
            {batch.sheet} · {batch.rowCount.toLocaleString('vi-VN')} dòng · {date(batch.createdAt)}
          </p>
          <div className="import-counts">
            <span>
              {batch.counts.create} {batch.status === 'COMMITTED' ? 'đã tạo' : 'tạo mới'}
            </span>
            <span>{batch.counts.skip} đã có · bỏ qua</span>
            <span>{batch.counts.errors} cần sửa</span>
          </div>
          {batch.status === 'COMMITTED' && (
            <p className="alert success" role="status">
              Đã nhập dữ liệu. Các bản ghi đã có được bỏ qua.
            </p>
          )}
          <p className="muted">
            Mã đã nhập có dữ liệu nguồn giống sẽ được bỏ qua, kể cả khi đổi tên file. Nếu nội dung
            nguồn thay đổi, app báo lỗi để đối chiếu. Giữ các chỉnh sửa và phân công đang có trong
            Sakura. Một lỗi sẽ chặn toàn bộ dữ liệu trong lần nhập này.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dòng Excel</th>
                  <th>Loại / Mã / Tên</th>
                  <th>Kết quả</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {batch.plan.items.map((p) => (
                  <tr key={p.kind + ':' + p.externalId}>
                    <td>
                      {p.lines.slice(0, 8).join(', ')}
                      {p.lines.length > 8 ? `… (${p.lines.length} dòng)` : ''}
                    </td>
                    <td>
                      {names[p.kind]} · {p.externalId}
                      <br />
                      {p.label}
                    </td>
                    <td>
                      {p.action === 'ERROR'
                        ? 'Cần sửa'
                        : p.action === 'SKIP'
                          ? 'Đã có · bỏ qua'
                          : batch.status === 'COMMITTED'
                            ? 'Đã tạo'
                            : 'Sẽ tạo mới'}
                    </td>
                    <td>
                      {p.errors.map((e, i) => (
                        <p className="alert error" key={i}>
                          {e}
                        </p>
                      ))}
                      {p.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                      <details>
                        <summary>Xem dữ liệu sẽ lưu</summary>
                        <dl>
                          {Object.entries(p.data).map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value || 'Không có trong nguồn'}</dd>
                            </div>
                          ))}
                        </dl>
                        {p.items.map((item, i) => (
                          <p key={i}>
                            {item.sku} · {item.productName} · SL {item.quantity} · Đơn giá{' '}
                            {item.unitPrice} đ
                          </p>
                        ))}
                        {p.itemCount > 20 && (
                          <p>
                            Hiển thị 20/{p.itemCount} dòng hàng; toàn bộ dòng được giữ khi nhập.
                          </p>
                        )}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset disabled={busy} className="form-fields">
            <Pager
              data={batch.plan}
              page={batch.plan.page}
              setPage={(page) =>
                void run(async () => {
                  setBatch(
                    await api<Batch>('/imports/sapo/excel/batches/' + batch.id + '?page=' + page),
                  );
                })
              }
            />
          </fieldset>
          {batch.status !== 'COMMITTED' && (
            <>
              <label className="import-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || batch.counts.errors > 0}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                Tôi đã đối chiếu các bản ghi mới, bị bỏ qua và cảnh báo.
              </label>
              <button
                className="primary"
                disabled={busy || !confirmed || batch.counts.errors > 0}
                onClick={() =>
                  void run(async () => {
                    setBatch(
                      await api<Batch>(
                        '/imports/sapo/excel/batches/' + batch.id + '/commit',
                        'POST',
                        { digest: batch.digest },
                      ),
                    );
                    changed();
                  })
                }
              >
                Xác nhận nhập {batch.counts.create} bản ghi
              </button>
              <p className="muted">
                Bản xem trước có hiệu lực 24 giờ. Nếu mất phản hồi, mở lại lần nhập trong lịch sử để
                kiểm tra; xác nhận lại cùng lần nhập không tạo trùng.
              </p>
            </>
          )}
          {images && (
            <div className="form-stack">
              <h3>Ảnh sản phẩm</h3>
              <p role="status">
                Đã có {images.done}/{images.total} liên kết ảnh · Còn {images.remaining}
              </p>
              <p className="muted">
                Tải từ đường dẫn ảnh trong file Sapo vào kho Sakura, gắn đúng sản phẩm/biến thể. Ảnh
                cũ được giữ. Nếu dừng hoặc tải lỗi, có thể mở lại lịch sử và tiếp tục.
              </p>
              {images.failures.map((f, i) => (
                <p className="alert error" key={i}>
                  {f}
                </p>
              ))}
              <button
                className="primary"
                disabled={busy || !images.remaining}
                onClick={() => void downloadImages()}
              >
                {imageBusy ? 'Đang tải ảnh…' : 'Tải / tiếp tục nhập ảnh'}
              </button>
              {imageBusy && (
                <button
                  className="secondary"
                  onClick={() => {
                    stop.current = true;
                  }}
                >
                  Dừng sau nhóm ảnh đang tải
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
