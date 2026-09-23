import { SourceData } from '../imports/SourceData';
import { ProductPhotos } from './ProductPhotos';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { Actor, Product, Variant, Page, has, money } from './types';
import { useResource, State, Modal, Form, Pager, SearchBox } from './shared';
export function Products({ actor }: { actor: Actor }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; product: Product }
    | { kind: 'variant'; variant: Variant }
    | null
  >(null);
  const [rows, setRows] = useState([0]);
  const result = useResource<Page<Product>>(
    '/catalog/products?page=' + page + '&search=' + encodeURIComponent(search),
    revision,
  );
  const done = () => {
    setModal(null);
    setRevision((v) => v + 1);
  };
  const manage = has(actor, 'catalog.products.manage');
  return (
    <>
      <div className="sales-toolbar">
        <SearchBox
          placeholder="Tìm tên sản phẩm hoặc mã hàng…"
          onSearch={(s) => {
            setSearch(s);
            setPage(1);
          }}
        />
        {manage && (
          <button
            className="primary"
            onClick={() => {
              setRows([0]);
              setModal({ kind: 'create' });
            }}
          >
            <Plus size={18} />
            Thêm sản phẩm
          </button>
        )}
      </div>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <>
          <div className="products-list">
            {result.data.items.map((p) => (
              <section className="panel" key={p.id}>
                <div className="panel-head">
                  <ProductPhotos images={p.images} label={p.name} />
                  <div>
                    <h2>{p.name}</h2>
                    <small className="muted">{p.category || 'Chưa phân loại'}</small>
                  </div>
                  <div>
                    <span className={'badge ' + (p.isActive ? 'green' : 'gray')}>
                      {p.isActive ? 'Đang bán' : 'Ngừng bán'}
                    </span>
                    {manage && (
                      <button
                        className="text-button"
                        onClick={() => setModal({ kind: 'edit', product: p })}
                      >
                        Chỉnh sửa
                      </button>
                    )}
                  </div>
                </div>
                {p.description && <p className="product-description">{p.description}</p>}
                <SourceData data={p.sourceData} />
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ảnh</th>
                        <th>Mã hàng</th>
                        <th>Biến thể</th>
                        <th>Đơn vị</th>
                        <th>Giá bán</th>
                        <th>Trạng thái</th>
                        {manage && <th>Thao tác</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {p.variants.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <ProductPhotos images={v.images} label={v.sku} />
                          </td>
                          <td>{v.sku}</td>
                          <td>{v.name}</td>
                          <td>{v.unit}</td>
                          <td>{money(v.price)}</td>
                          <td>{v.isActive ? 'Đang bán' : 'Ngừng bán'}</td>
                          {manage && (
                            <td>
                              <button
                                className="text-button"
                                onClick={() => setModal({ kind: 'variant', variant: v })}
                              >
                                Giá & trạng thái
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
          <State loading={false} error="" empty={!result.data.items.length} />
          <Pager data={result.data} page={page} setPage={setPage} />
        </>
      )}
      {modal && (
        <Modal
          title={
            modal.kind === 'create'
              ? 'Thêm sản phẩm'
              : modal.kind === 'edit'
                ? 'Chỉnh sửa sản phẩm'
                : 'Cập nhật biến thể'
          }
          close={() => setModal(null)}
        >
          {modal.kind === 'create' && (
            <Form
              done={done}
              submit={(f) =>
                api('/catalog/products', 'POST', {
                  name: f.get('name'),
                  category: f.get('category'),
                  description: f.get('description'),
                  variants: rows.map((i) => ({
                    sku: f.get('sku' + i),
                    name: f.get('variant' + i),
                    unit: f.get('unit' + i),
                    price: f.get('price' + i),
                  })),
                })
              }
            >
              <label>
                Tên sản phẩm
                <input name="name" required minLength={2} maxLength={150} />
              </label>
              <label>
                Nhóm sản phẩm
                <input
                  name="category"
                  maxLength={100}
                  placeholder="Ví dụ: Ruy băng, lưới gói hoa"
                />
              </label>
              <label>
                Mô tả
                <textarea name="description" maxLength={2000} />
              </label>
              {rows.map((i, index) => (
                <fieldset key={i}>
                  <legend>Biến thể {index + 1}</legend>
                  <div className="form-grid">
                    <label>
                      Mã hàng
                      <input
                        name={'sku' + i}
                        required
                        pattern="[A-Za-z0-9_-]{2,50}"
                        placeholder="RB-DO-25"
                      />
                    </label>
                    <label>
                      Tên biến thể
                      <input
                        name={'variant' + i}
                        required
                        maxLength={100}
                        placeholder="Đỏ · 25 mm"
                      />
                    </label>
                    <label>
                      Đơn vị
                      <input name={'unit' + i} required maxLength={30} placeholder="Cuộn" />
                    </label>
                    <label>
                      Giá bán (đ)
                      <input
                        name={'price' + i}
                        required
                        inputMode="numeric"
                        pattern="[0-9]{1,12}"
                        defaultValue="0"
                      />
                    </label>
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setRows((r) => r.filter((n) => n !== i))}
                    >
                      Bỏ biến thể
                    </button>
                  )}
                </fieldset>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={rows.length >= 50}
                onClick={() => setRows((r) => [...r, Math.max(...r) + 1])}
              >
                Thêm biến thể
              </button>
            </Form>
          )}
          {modal.kind === 'edit' && (
            <Form
              done={done}
              submit={(f) =>
                api('/catalog/products/' + modal.product.id, 'PATCH', {
                  version: modal.product.version,
                  name: f.get('name'),
                  category: f.get('category'),
                  description: f.get('description'),
                  isActive: f.get('isActive') === 'true',
                })
              }
            >
              <label>
                Tên sản phẩm
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={150}
                  defaultValue={modal.product.name}
                />
              </label>
              <label>
                Nhóm
                <input name="category" maxLength={100} defaultValue={modal.product.category} />
              </label>
              <label>
                Mô tả
                <textarea
                  name="description"
                  maxLength={2000}
                  defaultValue={modal.product.description}
                />
              </label>
              <label>
                Trạng thái
                <select name="isActive" defaultValue={String(modal.product.isActive)}>
                  <option value="true">Đang bán</option>
                  <option value="false">Ngừng bán</option>
                </select>
              </label>
              <p className="muted">Ngừng bán sẽ chặn tạo đơn mới; các đơn cũ được giữ nguyên.</p>
            </Form>
          )}
          {modal.kind === 'variant' && (
            <Form
              done={done}
              submit={(f) =>
                api('/catalog/variants/' + modal.variant.id, 'PATCH', {
                  version: modal.variant.version,
                  price: f.get('price'),
                  isActive: f.get('isActive') === 'true',
                })
              }
            >
              <p>
                {modal.variant.sku} · {modal.variant.name}
              </p>
              <label>
                Giá bán mới (đ)
                <input
                  name="price"
                  inputMode="numeric"
                  pattern="[0-9]{1,12}"
                  required
                  defaultValue={modal.variant.price}
                />
              </label>
              <label>
                Trạng thái
                <select name="isActive" defaultValue={String(modal.variant.isActive)}>
                  <option value="true">Đang bán</option>
                  <option value="false">Ngừng bán</option>
                </select>
              </label>
              <p className="muted">Thay đổi giá không làm thay đổi đơn đã tạo.</p>
            </Form>
          )}
        </Modal>
      )}
    </>
  );
}
