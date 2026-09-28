import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Image } from 'lucide-react';
import { StoredImage } from '../messenger/ImageLibrary';
import { useResource, State } from './shared';
import { Page, Product, Variant } from './types';

export type CatalogSelection = { name: string; unit: string };
export function catalogVariantName(product: Product, variant: Variant) {
  return (
    '[' +
    variant.sku +
    '] ' +
    product.name +
    (variant.name && variant.name !== product.name ? ' · ' + variant.name : '')
  );
}

function CatalogPhoto({ image }: { image?: { id: string; title: string } }) {
  return (
    <span className="catalog-choice-photo">
      {image ? (
        <StoredImage path={'/messenger/images/' + image.id} />
      ) : (
        <Image size={22} aria-label="Chưa có ảnh" />
      )}
    </span>
  );
}

export function CatalogProductSearch({
  onSelect,
  selectedNames = [],
  disabled = false,
}: {
  onSelect: (selection: CatalogSelection) => void;
  selectedNames?: string[];
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState({ search: '', page: 1 });
  const input = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  useEffect(() => {
    if (text.trim() === query.search) return;
    const timer = setTimeout(() => setQuery({ search: text.trim(), page: 1 }), 250);
    return () => clearTimeout(timer);
  }, [text, query.search]);
  const visible = open && !!text.trim();
  return (
    <section
      className="catalog-product-search"
      aria-label="Chọn từ danh mục sản phẩm"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && visible) {
          e.preventDefault();
          e.stopPropagation();
          input.current?.focus();
          setOpen(false);
        }
      }}
    >
      <label>
        Tìm sản phẩm trong danh mục
        <input
          ref={input}
          type="search"
          placeholder="Gõ tên nhóm, sản phẩm hoặc mã hàng…"
          maxLength={100}
          value={text}
          aria-expanded={visible}
          aria-controls={visible ? resultsId : undefined}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!e.nativeEvent.isComposing) {
                setQuery({ search: text.trim(), page: 1 });
                setOpen(true);
              }
            }
          }}
        />
      </label>
      {visible && (
        <div className="catalog-search-popup" id={resultsId}>
          {text.trim() !== query.search ? (
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
        </div>
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
  onSelect: (selection: CatalogSelection) => void;
  selectedNames: string[];
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const result = useResource<Page<Product>>(
    '/catalog/products?page=' + query.page + '&search=' + encodeURIComponent(query.search),
  );
  const term = query.search.toLocaleLowerCase('vi');
  return (
    <>
      <State loading={result.loading} error={result.error} empty={result.data?.total === 0} />
      {result.data && (
        <>
          <div className="catalog-product-results">
            {result.data.items.map((product) => {
              const groupMatches = [product.name, product.category || ''].some((s) =>
                s.toLocaleLowerCase('vi').includes(term),
              );
              const variants = product.variants.filter(
                (v) =>
                  groupMatches ||
                  [v.name, v.sku].some((s) => s.toLocaleLowerCase('vi').includes(term)),
              );
              const isExpanded = expanded === product.id;
              return (
                <div key={product.id} className="catalog-product-group">
                  <button
                    type="button"
                    className="catalog-group-toggle"
                    aria-expanded={isExpanded}
                    disabled={!product.isActive}
                    onClick={() => setExpanded(isExpanded ? null : product.id)}
                  >
                    <CatalogPhoto
                      image={
                        product.images?.[0] ||
                        product.variants.find((v) => v.images?.length)?.images?.[0]
                      }
                    />
                    <span className="catalog-choice-text">
                      <strong>{product.name}</strong>
                      <small>
                        {product.isActive
                          ? variants.length + ' mẫu phù hợp · Bấm để chọn mẫu'
                          : 'Ngừng bán'}
                      </small>
                    </span>
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={isExpanded ? 'expanded' : ''}
                    />
                  </button>
                  {isExpanded && (
                    <div
                      className="catalog-variant-options"
                      aria-label={'Các mẫu của ' + product.name}
                    >
                      {!variants.length && <p className="muted">Chưa có mẫu phù hợp.</p>}
                      {variants.map((variant) => {
                        const name = catalogVariantName(product, variant);
                        const selected = selectedNames.includes(name);
                        return (
                          <button
                            type="button"
                            key={variant.id}
                            className="catalog-variant-option"
                            disabled={disabled || selected || !variant.isActive}
                            onClick={() => onSelect({ name, unit: variant.unit })}
                          >
                            <CatalogPhoto image={variant.images?.[0] || product.images?.[0]} />
                            <span className="catalog-choice-text">
                              <strong>{variant.name || product.name}</strong>
                              <small>
                                {variant.sku} · {variant.unit}
                              </small>
                              <small>
                                {!variant.isActive
                                  ? 'Ngừng bán'
                                  : selected
                                    ? 'Đã chọn'
                                    : '+ Chọn mẫu này'}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {result.data.total > result.data.pageSize && (
            <div className="pagination">
              <span>
                Trang {query.page}/{Math.ceil(result.data.total / result.data.pageSize)}
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
          )}
        </>
      )}
    </>
  );
}
