import { useState } from 'react';
import { useResource, State } from './sales/shared';
import { date } from './sales/types';
type Status = {
  checkedAt: string;
  databaseBytes: number;
  tableBytes: number;
  media: { files: number; links: number; bytes: number };
  disks: { label: string; total: number; free: number; usedPercent: number }[];
  tables: { name: string; bytes: number }[];
  backups: {
    id: string;
    createdAt: string;
    bytes: number;
    rows: number;
    mediaFiles: number;
    verifiedAt: string | null;
  }[];
  backupCount: number;
  incomplete: number;
  warnings: string[];
};
const size = (n: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n / (n >= 1e9 ? 1e9 : 1e6)) +
  (n >= 1e9 ? ' GB' : ' MB');
export function Storage() {
  const [revision, setRevision] = useState(0);
  const r = useResource<Status>('/core/storage', revision),
    s = r.data;
  return (
    <>
      <div className="sales-toolbar">
        <p>Dung lượng dữ liệu, ảnh và tình trạng bản sao trên máy hiện tại.</p>
        <button
          className="secondary"
          disabled={r.loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Kiểm tra lại
        </button>
      </div>
      <State loading={r.loading} error={r.error} />
      {s && (
        <>
          <p className="muted">Cập nhật {date(s.checkedAt)}</p>
          {s.warnings.map((w) => (
            <div className="note" key={w}>
              {w}
            </div>
          ))}
          <div className="storage-cards">
            <section className="panel">
              <h2>Dữ liệu</h2>
              <strong>{size(s.databaseBytes)}</strong>
              <p>Các bảng và chỉ mục: {size(s.tableBytes)}</p>
              <small className="muted">Chưa gồm log và nhật ký phục hồi.</small>
            </section>
            <section className="panel">
              <h2>Ảnh sản phẩm</h2>
              <strong>{size(s.media.bytes)}</strong>
              <p>
                {s.media.files} tệp · {s.media.links} liên kết ảnh
              </p>
              <small className="muted">Dung lượng các tệp đang được dữ liệu tham chiếu.</small>
            </section>
            <section className="panel">
              <h2>Sao lưu</h2>
              <strong>{s.backupCount} bản hoàn tất</strong>
              <p>
                {s.backups[0]?.verifiedAt
                  ? 'Bản gần nhất đã thử phục hồi'
                  : 'Cần thử phục hồi bản gần nhất'}
              </p>
              <small className="muted">Chưa bật lịch tự động hoặc bản sao ngoài máy.</small>
            </section>
          </div>
          <section className="panel">
            <h2>Ổ đĩa lưu ảnh và bản sao</h2>
            {s.disks.map((d) => (
              <div className="storage-disk" key={d.label}>
                <strong>{d.label}</strong>
                <progress max={100} value={d.usedPercent} />
                <span>
                  Còn {size(d.free)} / {size(d.total)}
                </span>
              </div>
            ))}
            <p className="muted">
              Hai kho có thể nằm trên cùng ổ đĩa; không cộng các dung lượng ổ với nhau.
            </p>
          </section>
          <section className="panel">
            <h2>Bản sao gần đây</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Thời điểm tạo</th>
                    <th>Dung lượng</th>
                    <th>Bản ghi / Ảnh</th>
                    <th>Thử phục hồi</th>
                  </tr>
                </thead>
                <tbody>
                  {s.backups.map((b) => (
                    <tr key={b.id}>
                      <td>{date(b.createdAt)}</td>
                      <td>{size(b.bytes)}</td>
                      <td>
                        {b.rows.toLocaleString('vi-VN')} / {b.mediaFiles}
                      </td>
                      <td>{b.verifiedAt ? date(b.verifiedAt) : 'Chưa kiểm chứng'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!s.backups.length && <p>Chưa có bản sao hoàn tất.</p>}
            <p className="muted">
              Bản sao chứa cả database và ảnh. Phục hồi được thực hiện trong môi trường riêng và đối
              chiếu với bản sao.
            </p>
          </section>
        </>
      )}
    </>
  );
}
