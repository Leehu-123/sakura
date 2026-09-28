import { useState } from 'react';
import { api } from '../api';
import { Modal, State, useResource } from '../sales/shared';
type Group = { id: string; name: string; isActive: boolean };
type Page = {
  pageId: string;
  name: string;
  version: number;
  enabled: boolean;
  instructions: string;
  greeting: string;
  policy: string;
  productIds: string[];
  products: Group[];
};
function PageEditor({ page, close, done }: { page: Page; close: () => void; done: () => void }) {
  const [enabled, setEnabled] = useState(page.enabled),
    [instructions, setInstructions] = useState(page.instructions),
    [greeting, setGreeting] = useState(page.greeting),
    [policy, setPolicy] = useState(page.policy),
    [products, setProducts] = useState(page.products),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const found = useResource<Group[]>(
    '/messenger/assistant/catalog?q=' + encodeURIComponent(search),
    0,
    !!search,
  );
  return (
    <Modal title={'Trợ lý nội bộ · ' + page.name} close={close}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/messenger/assistant/pages/' + page.pageId, 'PATCH', {
              version: page.version,
              enabled,
              instructions,
              greeting,
              policy,
              productIds: products.map((p) => p.id),
            });
            done();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="note">
          Chỉ soạn bản nháp để nhân viên duyệt. Không kết nối AI hoặc tự trả lời khách.
        </p>
        <State loading={false} error={error} />
        <label className="assistant-check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Bật trợ lý nội bộ cho Page này
        </label>
        <label>
          Hướng dẫn nhân viên tư vấn
          <textarea
            value={instructions}
            maxLength={4000}
            rows={4}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Cách xưng hô, điều cần hỏi khách, lưu ý sản phẩm…"
          />
        </label>
        <label>
          Lời mở đầu khi báo giá
          <textarea
            value={greeting}
            maxLength={300}
            rows={2}
            onChange={(e) => setGreeting(e.target.value)}
          />
        </label>
        <label>
          Chính sách đã duyệt để gửi khách
          <textarea
            value={policy}
            maxLength={1200}
            rows={4}
            onChange={(e) => setPolicy(e.target.value)}
            placeholder="Giao hàng, thanh toán, đổi trả… chỉ ghi chính sách đang áp dụng."
          />
        </label>
        <label>
          Danh mục sản phẩm được tư vấn
          <input
            value={query}
            maxLength={80}
            placeholder="Tìm tên danh mục hoặc mã hàng…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          disabled={!query.trim()}
          onClick={() => setSearch(query.trim())}
        >
          Tìm danh mục
        </button>
        {search && (
          <>
            <State loading={found.loading} error={found.error} />
            <div className="assistant-products">
              {found.data?.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="assistant-product"
                  disabled={products.some((v) => v.id === p.id) || products.length >= 100}
                  onClick={() => setProducts([...products, p])}
                >
                  {p.name} · Thêm
                </button>
              ))}
            </div>
            {found.data?.length === 0 && <p>Không tìm thấy danh mục.</p>}
          </>
        )}
        <div className="assistant-selection">
          {products.map((p) => (
            <span key={p.id}>
              {p.name}
              {!p.isActive && ' (đã tắt)'}
              <button
                type="button"
                aria-label={'Bỏ ' + p.name}
                onClick={() => setProducts(products.filter((v) => v.id !== p.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <small>
          Chỉ sản phẩm đang hoạt động trong các danh mục này được dùng báo giá. Có thể để trống nếu
          chỉ dùng mẫu và chính sách.
        </small>
        <button className="primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu cấu hình trợ lý'}
        </button>
      </form>
    </Modal>
  );
}
export function ChatAssistantSettings() {
  const [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<Page | null>(null);
  const r = useResource<{ pages: Page[] }>('/messenger/assistant/settings', revision);
  return (
    <section className="panel assistant-settings">
      <div className="panel-head">
        <h2>Trợ lý soạn tin</h2>
        <span className="badge">Chế độ nội bộ · Chưa kết nối AI</span>
      </div>
      <p>
        Chuẩn bị hướng dẫn và sản phẩm cho từng Fanpage. Nhân viên tạo bản nháp ngay trong khung
        chat và tự duyệt gửi.
      </p>
      <State loading={r.loading} error={r.error} />
      {r.data?.pages.map((p) => (
        <div className="activity" key={p.pageId}>
          <div>
            <strong>{p.name}</strong>
            <p>
              {p.enabled ? 'Đang bật' : 'Đang tắt'} · {p.productIds.length} danh mục
            </p>
          </div>
          <button className="secondary" onClick={() => setEditing(p)}>
            Cấu hình trợ lý
          </button>
        </div>
      ))}
      {r.data?.pages.length === 0 && <p>Thêm Fanpage trước để cấu hình trợ lý.</p>}
      {editing && (
        <PageEditor
          page={editing}
          close={() => setEditing(null)}
          done={() => {
            setEditing(null);
            setRevision((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}
