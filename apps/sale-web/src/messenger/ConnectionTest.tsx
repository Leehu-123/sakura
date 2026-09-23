import { useState } from 'react';
import { api } from '../api';
import { date } from '../sales/types';

export type DeliveryDiagnostics = {
  checkedAt: string;
  pages: { pageId: string; receivedCount: number; lastInboundAt: string | null }[];
};

export function ConnectionTest({
  pageId,
  ready,
  diagnostics,
  error,
}: {
  pageId: string;
  ready: boolean;
  diagnostics: DeliveryDiagnostics | null;
  error: string;
}) {
  const [baseline, setBaseline] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const current = diagnostics?.pages.find((p) => p.pageId === pageId);
  const received = baseline !== null && !!current && current.receivedCount > baseline;
  async function start() {
    setBusy(true);
    setFailure('');
    try {
      const data = await api<DeliveryDiagnostics>('/messenger/configuration/diagnostics');
      const page = data.pages.find((p) => p.pageId === pageId);
      if (!page) throw Error('Fanpage vừa thay đổi. Bấm tải lại trạng thái.');
      setBaseline(page.receivedCount);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="connection-test">
      <h4>3. Thử nhận tin</h4>
      <p>
        {current?.lastInboundAt
          ? 'Tin gần nhất đã vào Sakura lúc ' + date(current.lastInboundAt)
          : 'Chưa ghi nhận tin nhắn từ khách vào Sakura.'}
      </p>
      <p>
        Trong Meta, nếu ứng dụng còn ở chế độ <strong>Phát triển</strong>, hãy dùng Facebook có vai
        trò quản trị, nhà phát triển hoặc người kiểm thử của ứng dụng để gửi thử. Chỉ có quyền quản
        lý Fanpage chưa đủ.
      </p>
      <details>
        <summary>Thêm tài khoản để thử / mở cho khách thật</summary>
        <p>
          Meta Developer → chọn ứng dụng → Vai trò trong ứng dụng → thêm người kiểm thử. Người đó
          cần chấp nhận lời mời rồi gửi một tin nhắn mới với tư cách cá nhân.
        </p>
        <p>
          Để nhận tin của khách ngoài nhóm thử nghiệm, quản trị cần hoàn tất xét duyệt các quyền
          Meta cần thiết và đưa ứng dụng sang hoạt động công khai. Sakura không tự thay đổi được
          trạng thái này.
        </p>
      </details>
      <button className="secondary" disabled={!ready || busy} onClick={() => void start()}>
        {busy ? 'Đang chuẩn bị…' : baseline === null ? 'Bắt đầu thử nhận tin' : 'Thử lại từ đầu'}
      </button>
      {!ready && <p className="muted">Hoàn tất kết nối nhận tin trước khi thử.</p>}
      {baseline !== null && (
        <div className="note" role="status">
          {received ? (
            <strong>Đã nhận tin mới vào Sakura. Mở Hội thoại để xem và trả lời.</strong>
          ) : (
            <>
              <strong>Đang chờ một tin nhắn mới…</strong>
              <p>
                Mở Messenger bên dưới, gửi đến đúng Fanpage rồi quay lại đây. Kết quả tự cập nhật;
                không cần tải lại trang.
              </p>
              <a href={'https://m.me/' + pageId} target="_blank" rel="noopener noreferrer">
                Mở Messenger của Fanpage
              </a>
              <p>
                Nếu vẫn chưa có tin: kiểm tra vai trò của tài khoản gửi, chế độ Phát triển và mục
                định tuyến hội thoại trong Meta nếu Page có nhiều ứng dụng chat. Tin nhắn cũ chưa tự
                đồng bộ.
              </p>
            </>
          )}
        </div>
      )}
      {(error || failure) && <p className="alert error">{failure || error}</p>}
    </section>
  );
}
