import { useEffect, useState } from 'react';
import { api } from '../api';
import { Toolbar, labelInk } from './QuickLabels';
export type Contact = {
  id: string;
  psid: string;
  facebookName?: string | null;
  avatarKey?: string | null;
  customer?: { name: string } | null;
};
export function contactName(c: Contact) {
  return c.facebookName || c.customer?.name || 'Khách · ' + c.psid.slice(-6);
}
export function ContactAvatar({ contact }: { contact: Contact }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    setImage('');
    if (!contact.avatarKey) return;
    const controller = new AbortController();
    void api<{ mime: string; data: string }>(
      '/messenger/conversations/' + contact.id + '/avatar',
      'GET',
      undefined,
      true,
      controller.signal,
    )
      .then((v) => {
        if (
          !controller.signal.aborted &&
          ['image/png', 'image/jpeg', 'image/webp'].includes(v.mime)
        )
          setImage('data:' + v.mime + ';base64,' + v.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [contact.id, contact.avatarKey]);
  return (
    <span className="chat-avatar" aria-label={'Ảnh đại diện của ' + contactName(contact)}>
      {image ? (
        <img src={image} alt="" onError={() => setImage('')} />
      ) : (
        contactName(contact).slice(0, 1)
      )}
    </span>
  );
}
export function ContactTags({
  tags,
  taggedDate,
  toolbar,
}: {
  tags: string[];
  taggedDate?: string | null;
  toolbar: Toolbar;
}) {
  return (
    <span className="conversation-tags contact-tags">
      {taggedDate && <span className="chat-tag">{taggedDate.split('-').reverse().join('/')}</span>}
      {tags.map((t) => {
        const color = toolbar.labels.find((l) => l.name === t)?.color;
        return (
          <span
            className="chat-tag"
            key={t}
            data-tag={t}
            style={color ? { backgroundColor: color, color: labelInk(color) } : undefined}
          >
            {t}
          </span>
        );
      })}
    </span>
  );
}
