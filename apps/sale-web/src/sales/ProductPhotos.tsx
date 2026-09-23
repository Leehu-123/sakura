import { useState } from 'react';
import { StoredImage } from '../messenger/ImageLibrary';
import { Modal } from './shared';
export function ProductPhotos({
  images,
  label,
}: {
  images?: { id: string; title: string }[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (!images?.length) return <span className="muted">Chưa có ảnh</span>;
  return (
    <>
      <button
        className="product-thumbnail"
        onClick={() => setOpen(true)}
        aria-label={'Xem ảnh ' + label}
      >
        <StoredImage path={'/messenger/images/' + images[0].id} />
        {images.length > 1 && <small>{images.length} ảnh</small>}
      </button>
      {open && (
        <Modal title={'Ảnh · ' + label} close={() => setOpen(false)}>
          <div className="image-library">
            {images.map((i) => (
              <article key={i.id}>
                <StoredImage path={'/messenger/images/' + i.id} />
                <small>{i.title}</small>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
