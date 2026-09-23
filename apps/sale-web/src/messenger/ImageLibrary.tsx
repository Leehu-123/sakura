import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Actor, Page, Product, has } from '../sales/types';
import { useResource, State, Modal, Form, SearchBox, Pager } from '../sales/shared';
export type LibraryImage = {
  id: string;
  title: string;
  mime: string;
  product: { name: string };
  variant?: { sku: string; name: string };
};
export function StoredImage({ path }: { path: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={ref} className="stored-image">
      {visible ? <ImageContent path={path} /> : <span className="muted">Ảnh sản phẩm</span>}
    </span>
  );
}
function ImageContent({ path }: { path: string }) {
  const r = useResource<{ title: string; mime: string; data: string }>(path);
  return (
    <>
      <State loading={r.loading} error={r.error} />
      {r.data && (
        <img
          className="product-photo"
          src={'data:' + r.data.mime + ';base64,' + r.data.data}
          alt={r.data.title}
        />
      )}
    </>
  );
}
function UploadImage({ done }: { done: () => void }) {
  const [search, setSearch] = useState(''),
    [productId, setProductId] = useState(''),
    [file, setFile] = useState<File | null>(null);
  const r = useResource<Page<Product>>(
    '/catalog/products?pageSize=20&search=' + encodeURIComponent(search),
  );
  const p = r.data?.items.find((p) => p.id === productId);
  return (
    <>
      <SearchBox
        placeholder="Tìm sản phẩm để gắn ảnh…"
        onSearch={(s) => {
          setSearch(s);
          setProductId('');
        }}
      />
      <State loading={r.loading} error={r.error} />
      <Form
        label="Thêm vào thư viện"
        done={done}
        submit={async (f) => {
          if (!file || file.size > 512000 || !['image/png', 'image/jpeg'].includes(file.type))
            throw new Error('Chọn PNG/JPEG tối đa 500 KB.');
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
            reader.readAsDataURL(file);
          });
          return api('/messenger/images', 'POST', {
            productId,
            variantId: f.get('variant') || undefined,
            title: String(f.get('title')),
            mime: file.type,
            data,
          });
        }}
      >
        <label>
          Sản phẩm
          <select required value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Chọn sản phẩm</option>
            {r.data?.items
              .filter((p) => p.isActive)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Biến thể
          <select name="variant" key={productId}>
            <option value="">Ảnh chung sản phẩm</option>
            {p?.variants
              .filter((v) => v.isActive)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.sku} · {v.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Tên ảnh
          <input name="title" required minLength={2} maxLength={120} />
        </label>
        <label>
          Ảnh sản phẩm · PNG/JPEG tối đa 500 KB
          <input
            type="file"
            accept="image/png,image/jpeg"
            required
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
      </Form>
    </>
  );
}
export function ImageLibrary({
  actor,
  close,
  select,
}: {
  actor: Actor;
  close: () => void;
  select?: (i: LibraryImage) => void;
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [rev, setRev] = useState(0),
    [upload, setUpload] = useState(false);
  const r = useResource<Page<LibraryImage>>(
    '/messenger/images?pageSize=12&page=' + page + '&search=' + encodeURIComponent(search),
    rev,
  );
  return (
    <Modal title="Thư viện ảnh sản phẩm" close={close}>
      {has(actor, 'catalog.products.manage') && (
        <button className="secondary" onClick={() => setUpload((v) => !v)}>
          {upload ? 'Xem thư viện' : 'Thêm ảnh sản phẩm'}
        </button>
      )}
      {upload ? (
        <UploadImage
          done={() => {
            setUpload(false);
            setRev((v) => v + 1);
          }}
        />
      ) : (
        <>
          <SearchBox
            placeholder="Tìm tên ảnh, sản phẩm hoặc SKU…"
            onSearch={(s) => {
              setSearch(s);
              setPage(1);
            }}
          />
          <State loading={r.loading} error={r.error} empty={r.data?.items.length === 0} />
          <div className="image-library">
            {r.data?.items.map((i) => (
              <article key={i.id}>
                <StoredImage path={'/messenger/images/' + i.id} />
                <strong>{i.title}</strong>
                <small>
                  {i.product.name} {i.variant?.sku}
                </small>
                {select && (
                  <button className="secondary" onClick={() => select(i)}>
                    Chọn ảnh
                  </button>
                )}
              </article>
            ))}
          </div>
          {r.data && <Pager data={r.data} page={page} setPage={setPage} />}
        </>
      )}
    </Modal>
  );
}
