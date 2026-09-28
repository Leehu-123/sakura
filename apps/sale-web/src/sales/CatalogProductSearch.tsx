import { useEffect, useState } from 'react';
import { useResource, State } from './shared';
import { Page, Product } from './types';

export function CatalogProductSearch({
  onSelect,
  selectedNames = [],
  disabled = false,
}: {
  onSelect: (product: Product) => void;
  selectedNames?: string[];
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState({ search: '', page: 1 });
  useEffect(() => {
    if (text.trim() === query.search) return;
    const timer = setTimeout(() => setQuery({ search: text.trim(), page: 1 }), 250);
    return () => clearTimeout(timer);
  }, [text, query.search]);
  const waiting = text.trim() !== query.search;
  return (
    <section className="catalog-product-search" aria-label="Chọn từ danh mục sản phẩm">
      <label>
        Tìm sản phẩm trong danh mục
        <input
          type="search"
          placeholder="Gõ tên sản phẩm hoặc mã hàng…"
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!e.nativeEvent.isComposing) setQuery({ search: text.trim(), page: 1 });
            }
          }}
        />
      </label>
      {waiting ? (
        <p className="muted" role="status">
          Đang tìm sản phẩm…
        </p>
      ) : (
        <CatalogResults
          key={query.search + ':' + query.page}
          query={query}
          setPage={(page) => setQuery((value) => ({ ...value, page }))}
          onSelect={onSelect}
          selectedNames={selectedNames}
          disabled={disabled}
        />
      )}
    </section>
  );
}

function CatalogResults({
  query,
  setPage,
  onSelect,
  selectedNames,
  disabled,
}: {
  query: { search: string; page: number };
  setPage: (page: number) => void;
  onSelect: (product: Product) => void;
  selectedNames: string[];
  disabled: boolean;
}) {
  const result = useResource<Page<Product>>(
    '/catalog/products?page=' + query.page + '&search=' + encodeURIComponent(query.search),
  );
  return (
    <>
      <State loading={result.loading} error={result.error} empty={result.data?.total === 0} />
      {result.data && (
        <>
          <div className="catalog-product-results">
            {result.data.items.map((product) => {
              const selected = selectedNames.includes(product.name);
              return (
                <button
                  type="button"
                  key={product.id}
                  disabled={disabled || selected || !product.isActive}
                  onClick={() => onSelect(product)}
                >
                  <span>{product.name}</span>
                  <small>
                    {product.variants?.map((v) => v.sku).join(' · ') || product.category}
                  </small>
                  <small>
                    {!product.isActive ? 'Ngừng bán' : selected ? 'Đã chọn' : '+ Chọn sản phẩm'}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="pagination">
            <span>
              {result.data.total} sản phẩm · Trang {query.page}/
              {Math.max(1, Math.ceil(result.data.total / result.data.pageSize))}
            </span>
            <div>
              <button
                type="button"
                disabled={query.page <= 1}
                onClick={() => setPage(query.page - 1)}
              >
                Trước
              </button>
              <button
                type="button"
                disabled={query.page * result.data.pageSize >= result.data.total}
                onClick={() => setPage(query.page + 1)}
              >
                Sau
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
