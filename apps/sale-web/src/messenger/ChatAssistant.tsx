import { useState } from 'react';
import { Sparkles, Search } from 'lucide-react';
import { api } from '../api';
import { Modal, State, useResource } from '../sales/shared';
import { Template } from './Dialogs';
type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  price: string;
  product?: { name: string };
};
type Draft = {
  id: string;
  reply: string;
  warnings: string[];
  products: Product[];
  expiresAt: string;
};
type Context = {
  mode: string;
  enabled: boolean;
  instructions: string;
  hasPolicy: boolean;
  hasProducts: boolean;
  catalogAllowed: boolean;
  messages: { role: string; text: string }[];
};
export function ChatAssistantDialog({
  id,
  templates,
  replaceExisting,
  close,
  apply,
}: {
  id: string;
  templates: Template[];
  replaceExisting: boolean;
  close: () => void;
  apply: (draft: Draft) => void;
}) {
  const r = useResource<Context>('/messenger/assistant/conversations/' + id),
    c = r.data;
  const [kind, setKind] = useState('ASK'),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<Product[]>([]),
    [templateId, setTemplateId] = useState(''),
    [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const found = useResource<Product[]>(
    '/messenger/assistant/conversations/' + id + '/products?q=' + encodeURIComponent(search),
    0,
    !!search && !!c?.catalogAllowed,
  );
  function reset() {
    setDraft(null);
    setError('');
  }
  async function compose() {
    setBusy(true);
    reset();
    try {
      setDraft(
        await api<Draft>('/messenger/assistant/conversations/' + id + '/drafts', 'POST', {
          kind,
          variantIds: kind === 'PRODUCTS' ? selected.map((p) => p.id) : [],
          ...(kind === 'TEMPLATE' ? { templateId } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Trợ lý soạn tin · Nội bộ" close={close}>
      <div className="form-stack assistant-dialog">
        <p className="note">
          Chưa kết nối AI. Bản nháp lấy từ mẫu, chính sách và bảng giá trong Sakura; không tự gửi
          cho khách.
        </p>
        <State loading={r.loading} error={r.error || error} />
        {c && (
          <>
            {!c.enabled && (
              <p className="alert">
                Quản trị cần bật Trợ lý nội bộ cho Page này trong Hộp thư → Cấu hình.
              </p>
            )}
            <details className="assistant-context">
              <summary>Ngữ cảnh hội thoại ({c.messages.length} tin gần nhất)</summary>
              {c.messages.map((m, i) => (
                <p key={i}>
                  <strong>{m.role === 'khách' ? 'Khách' : 'Cửa hàng'}:</strong> {m.text}
                </p>
              ))}
              {!c.messages.length && <p>Chưa có tin văn bản phù hợp.</p>}
              <small>Chỉ hiển thị nội bộ, đã ẩn mẫu điện thoại/email nhận diện được.</small>
            </details>
            {c.instructions && (
              <div className="note">
                <strong>Hướng dẫn của Fanpage</strong>
                <p className="assistant-pre">{c.instructions}</p>
              </div>
            )}
            <label>
              Soạn nội dung
              <select
                value={kind}
                disabled={busy}
                onChange={(e) => {
                  setKind(e.target.value);
                  reset();
                }}
              >
                <option value="ASK">Hỏi thêm nhu cầu</option>
                <option value="PRODUCTS" disabled={!c.catalogAllowed}>
                  Báo giá sản phẩm
                </option>
                <option value="POLICY" disabled={!c.hasPolicy}>
                  Chính sách cửa hàng
                </option>
                <option value="TEMPLATE">Mẫu trả lời đã lưu</option>
              </select>
            </label>
            {kind === 'TEMPLATE' && (
              <label>
                Mẫu trả lời
                <select
                  value={templateId}
                  disabled={busy}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    reset();
                  }}
                >
                  <option value="">Chọn mẫu</option>
                  {templates
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {kind === 'PRODUCTS' && (
              <>
                {!c.hasProducts && (
                  <p className="note">
                    Page chưa được chọn danh mục sản phẩm. Quản trị bổ sung tại Cấu hình → Trợ lý
                    nội bộ.
                  </p>
                )}
                <form
                  className="assistant-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSearch(q.trim());
                  }}
                >
                  <input
                    aria-label="Tìm sản phẩm cho bản nháp"
                    placeholder="Tên sản phẩm hoặc mã hàng…"
                    value={q}
                    maxLength={80}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <button className="secondary" disabled={!q.trim() || busy}>
                    <Search size={16} />
                    Tìm
                  </button>
                </form>
                {search && (
                  <>
                    <State loading={found.loading} error={found.error} />
                    <div className="assistant-products">
                      {found.data?.map((p) => (
                        <button
                          type="button"
                          className="assistant-product"
                          key={p.id}
                          disabled={
                            busy || selected.length >= 6 || selected.some((v) => v.id === p.id)
                          }
                          onClick={() => {
                            setSelected([...selected, p]);
                            reset();
                          }}
                        >
                          <strong>
                            {p.product?.name} · {p.name}
                          </strong>
                          <small>
                            {p.sku} · {Number(p.price).toLocaleString('vi-VN')} đ/{p.unit}
                          </small>
                          <span>+ Chọn</span>
                        </button>
                      ))}
                    </div>
                    {found.data?.length === 0 && (
                      <p>Không tìm thấy trong danh mục được phép của Page.</p>
                    )}
                    {found.data?.length === 20 && (
                      <small>Hiển thị 20 kết quả. Nhập cụ thể hơn để tìm tiếp.</small>
                    )}
                  </>
                )}
                <div className="assistant-selection">
                  {selected.map((p) => (
                    <span key={p.id}>
                      {p.sku}
                      <button
                        type="button"
                        aria-label={'Bỏ ' + p.sku}
                        disabled={busy}
                        onClick={() => {
                          setSelected(selected.filter((v) => v.id !== p.id));
                          reset();
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <small>Chọn tối đa 6 mẫu. Giá lấy từ bảng giá; chưa xác nhận tồn kho.</small>
              </>
            )}
            <button
              type="button"
              className="primary"
              disabled={
                busy ||
                !c.enabled ||
                (kind === 'PRODUCTS' && !selected.length) ||
                (kind === 'TEMPLATE' && !templateId)
              }
              onClick={() => void compose()}
            >
              <Sparkles size={16} />
              {busy ? 'Đang soạn…' : 'Tạo bản nháp nội bộ'}
            </button>
            {draft && (
              <div className="assistant-draft">
                <h3>Bản nháp để nhân viên duyệt</h3>
                <textarea
                  aria-label="Nội dung bản nháp"
                  rows={7}
                  maxLength={2000}
                  value={draft.reply}
                  onChange={(e) => setDraft({ ...draft, reply: e.target.value })}
                />
                {draft.warnings.map((w) => (
                  <p className="muted" key={w}>
                    {w}
                  </p>
                ))}
                <small>
                  Bản nháp có hiệu lực 10 phút; thay đổi hội thoại hoặc bảng giá sẽ yêu cầu soạn
                  lại.
                </small>
                {replaceExisting && (
                  <p className="note">Đưa vào ô nhập sẽ thay nội dung văn bản đang soạn.</p>
                )}
                <button
                  className="primary"
                  disabled={!draft.reply.trim()}
                  onClick={() => apply(draft)}
                >
                  Đưa vào ô nhập để duyệt gửi
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
