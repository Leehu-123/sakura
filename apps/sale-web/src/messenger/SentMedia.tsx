import { useState } from 'react';
import { Image, Play, File, Download } from 'lucide-react';
import { date, Page } from '../sales/types';
import { Modal, Pager, State, useResource } from '../sales/shared';
type Media = {
  id: string;
  text: string;
  sourceAt: string;
  imageId: string | null;
  attachmentId: string | null;
  attachmentTypes: string[];
  actor?: { displayName: string } | null;
};
function MediaPreview({ id, item, close }: { id: string; item: Media; close: () => void }) {
  const r = useResource<{ mime: string; data: string; title: string }>(
    '/messenger/conversations/' + id + '/media/' + item.id,
  );
  const d = r.data,
    url = d ? 'data:' + d.mime + ';base64,' + d.data : '';
  return (
    <Modal title="Ảnh / video đã gửi" close={close}>
      <State loading={r.loading} error={r.error} />
      {d && (
        <>
          <p>{d.title}</p>
          {d.mime.startsWith('image/') ? (
            <img className="sent-media-preview" src={url} alt={d.title} />
          ) : d.mime.startsWith('video/') ? (
            <video className="sent-media-preview" src={url} controls />
          ) : (
            <p>Tệp đính kèm</p>
          )}
          <a className="secondary" href={url} download={d.title}>
            <Download size={15} />
            Tải tệp
          </a>
        </>
      )}
      <small>
        {date(item.sourceAt)} · {item.actor?.displayName || 'Gửi từ Facebook'}
      </small>
    </Modal>
  );
}
function Thumb({ id, item, open }: { id: string; item: Media; open: () => void }) {
  const image = !!item.imageId || item.attachmentTypes.includes('image');
  const r = useResource<{ mime: string; data: string }>(
    '/messenger/conversations/' + id + '/media/' + item.id,
    0,
    image && !!(item.imageId || item.attachmentId),
  );
  return (
    <button
      className="sent-media-thumb"
      title={(item.text || 'Tệp đã gửi') + ' · ' + date(item.sourceAt)}
      onClick={open}
    >
      {r.data ? (
        <img
          alt={item.text || 'Ảnh đã gửi'}
          src={'data:' + r.data.mime + ';base64,' + r.data.data}
        />
      ) : item.attachmentTypes.includes('video') ? (
        <Play size={23} />
      ) : image ? (
        <Image size={23} />
      ) : (
        <File size={23} />
      )}
    </button>
  );
}
export function SentMedia({ id, revision }: { id: string; revision: number }) {
  const [page, setPage] = useState(1),
    [all, setAll] = useState(false),
    [selected, setSelected] = useState<Media | null>(null);
  const r = useResource<Page<Media>>(
    '/messenger/conversations/' + id + '/media?page=' + page + '&pageSize=8',
    revision,
  );
  return (
    <section className="contact-section">
      <div className="contact-section-head">
        <h3>Ảnh / Video đã gửi ({r.data?.total || 0})</h3>
        <button className="text-button" onClick={() => setAll(!all)}>
          {all ? 'Thu gọn' : 'Xem tất cả'}
        </button>
      </div>
      <State loading={r.loading} error={r.error} />
      <div className="sent-media-grid">
        {r.data?.items.slice(0, all ? 8 : 4).map((m) => (
          <Thumb key={m.id} item={m} id={id} open={() => setSelected(m)} />
        ))}
      </div>
      {r.data?.total === 0 && <p className="muted">Chưa có ảnh/video hoặc tệp đã gửi.</p>}
      {all && r.data && <Pager data={r.data} page={page} setPage={setPage} />}{' '}
      {selected && <MediaPreview id={id} item={selected} close={() => setSelected(null)} />}
    </section>
  );
}
