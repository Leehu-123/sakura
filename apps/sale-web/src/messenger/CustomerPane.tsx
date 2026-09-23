import { useEffect, useState, useRef } from 'react';
import { ShoppingCart, Pencil, Link2, MapPin, Phone, Sparkles } from 'lucide-react';
import { api } from '../api';
import { Actor, Customer, has, date } from '../sales/types';
import { State, useResource, Form } from '../sales/shared';
import { CreateOrder } from '../sales/Orders';
import { ContactAvatar, ContactTags } from './ContactIdentity';
import { ContactEditor, ContactHints } from './ContactEditor';
import { CustomerOrders } from './CustomerOrders';
import { Toolbar } from './QuickLabels';
import { SentMedia } from './SentMedia';
export function CustomerPane({
  customerId,
  id,
  actor,
  canSend,
  blocked,
  revision,
  changed,
  version,
  facebookName,
  avatarKey,
  tags,
  activity,
  link,
  toolbar,
  psid,
}: {
  customerId?: string;
  id: string;
  actor: Actor;
  canSend: boolean;
  blocked: boolean;
  revision: number;
  changed: () => void;
  version: number;
  facebookName?: string | null;
  avatarKey?: string | null;
  tags: string[];
  activity: string;
  link: () => void;
  toolbar: Toolbar;
  psid: string;
}) {
  const [rev, setRev] = useState(0),
    [edit, setEdit] = useState<'manual' | 'suggested' | null>(null),
    [create, setCreate] = useState(false),
    [pendingOrder, setPendingOrder] = useState(false),
    [linkError, setLinkError] = useState(''),
    [linking, setLinking] = useState(false),
    [dismissedHint, setDismissedHint] = useState('');
  const orderCustomerVersion = useRef(0);
  const r = useResource<Customer>(
      '/sales/customers/' + customerId,
      revision + rev,
      !!customerId && has(actor, 'sales.customers.read'),
    ),
    c = r.data;
  const hints = useResource<ContactHints>(
    '/messenger/conversations/' + id + '/contact-suggestions',
    revision + rev + Date.parse(activity),
  );
  const refresh = () => {
    setRev((v) => v + 1);
    changed();
  };
  const mayEdit = has(actor, 'sales.customers.manage') && has(actor, 'sales.customers.read');
  const mayOrder =
    has(actor, 'sales.orders.manage') &&
    has(actor, 'catalog.products.read') &&
    has(actor, 'sales.customers.read');
  const mayLink =
    actor.grants.some((g) => g.permission === 'sales.chat.use' && g.scope === 'GLOBAL') &&
    has(actor, 'sales.customers.read');
  useEffect(() => {
    if (pendingOrder && c && !edit && c.version > orderCustomerVersion.current) {
      setPendingOrder(false);
      if (c.phone && c.address.trim()) setCreate(true);
      else setEdit('manual');
    }
  }, [pendingOrder, c, edit]);
  function startOrder() {
    if (c?.phone && c.address.trim()) setCreate(true);
    else if (mayEdit) {
      orderCustomerVersion.current = c?.version || 0;
      setPendingOrder(true);
      setEdit('suggested');
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'F1' && mayOrder && !blocked && !edit && !create) {
        e.preventDefault();
        startOrder();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [c, mayOrder, blocked, edit, create]);
  const found = hints.data,
    hasHints = !!(found?.phones.length || found?.addresses.length);
  return (
    <aside className="customer-pane customer-workspace">
      <div className="customer-pane-scroll">
        <section className="contact-profile">
          <div className="contact-profile-head">
            <ContactAvatar
              contact={{ id, psid, facebookName, avatarKey, customer: c ? { name: c.name } : null }}
            />
            <div>
              <strong>{c?.name || facebookName || 'Khách Messenger'}</strong>
              <ContactTags tags={tags} toolbar={toolbar} />
            </div>
            {mayEdit && (
              <button
                className="icon-button"
                aria-label="Sửa thông tin khách"
                onClick={() => setEdit(c ? 'manual' : 'suggested')}
              >
                <Pencil size={16} />
              </button>
            )}
          </div>
          <State loading={r.loading} error={r.error} />
          <p>
            <Phone size={14} />
            {c?.phone ? (
              <a href={'tel:' + c.phone}>{c.phone}</a>
            ) : (
              found?.phones[0] || 'Chưa có số điện thoại'
            )}
          </p>
          <p>
            <MapPin size={14} />
            {c?.address || found?.addresses[0] || 'Chưa có địa chỉ giao hàng'}
          </p>
          {!customerId && (
            <small className="muted">Thông tin từ hội thoại chưa được lưu thành hồ sơ.</small>
          )}
          {c && (
            <small className="muted">
              Phụ trách: {c.assignments[0]?.user.displayName || 'Chưa phân công'}
            </small>
          )}
        </section>
        {!customerId && mayLink && (
          <button className="text-button" onClick={link}>
            <Link2 size={14} />
            Gắn hồ sơ khách có sẵn
          </button>
        )}
        <State loading={false} error={hints.error || linkError} />
        {hasHints && dismissedHint !== activity && (
          <section className="contact-hint">
            <strong>
              <Sparkles size={15} />
              Thông tin lấy từ tin nhắn
            </strong>
            <button className="text-button" onClick={() => setDismissedHint(activity)}>
              Ẩn gợi ý
            </button>
            {found?.names[0] && <p>{found.names[0]}</p>}
            <p>{found?.phones.join(' · ')}</p>
            <p>{found?.addresses[0]}</p>
            <small>Kiểm tra đúng người nhận trước khi lưu.</small>
            {mayEdit && (
              <button className="secondary" onClick={() => setEdit('suggested')}>
                {c ? 'Kiểm tra và cập nhật' : 'Kiểm tra và lưu hồ sơ'}
              </button>
            )}
          </section>
        )}
        {!customerId && mayLink && !!found?.matches.length && (
          <section className="contact-section">
            <h3>Hồ sơ có cùng số điện thoại</h3>
            {found.matches.map((m) => (
              <button
                className="contact-match"
                key={m.id}
                disabled={linking}
                onClick={async () => {
                  setLinking(true);
                  setLinkError('');
                  try {
                    await api('/messenger/conversations/' + id + '/link', 'POST', {
                      version,
                      customerId: m.id,
                    });
                    refresh();
                  } catch (e) {
                    setLinkError((e as Error).message);
                  } finally {
                    setLinking(false);
                  }
                }}
              >
                <strong>{m.name}</strong>
                <span>{m.phone}</span>
                <small>Gắn đúng khách này</small>
              </button>
            ))}
          </section>
        )}
        {c && (
          <section className="contact-section">
            <h3>Ghi chú ({c.activities?.length || 0})</h3>
            {has(actor, 'sales.customers.manage') && (
              <Form
                label="Lưu ghi chú"
                done={refresh}
                submit={(f) =>
                  api('/sales/customers/' + c.id + '/activities', 'POST', {
                    version: c.version,
                    note: String(f.get('note')),
                  })
                }
              >
                <textarea
                  name="note"
                  aria-label="Ghi chú khách hàng"
                  placeholder="Thêm ghi chú chăm sóc…"
                  required
                  maxLength={4000}
                />
              </Form>
            )}
            {!c.activities?.length && <p className="muted">Chưa có ghi chú.</p>}
            {c.activities?.slice(0, 5).map((a) => (
              <div className="activity" key={a.id}>
                <p>{a.note}</p>
                <small>
                  {a.author.displayName} · {date(a.createdAt)}
                </small>
              </div>
            ))}
          </section>
        )}
        {c && has(actor, 'sales.orders.read') && (
          <CustomerOrders
            customerId={c.id}
            id={id}
            actor={actor}
            canSend={canSend}
            revision={rev + revision}
            changed={refresh}
          />
        )}
        <SentMedia id={id} revision={revision + Date.parse(activity)} />
      </div>
      <div className="customer-pane-footer">
        {mayOrder ? (
          <button
            className="primary"
            disabled={
              blocked ||
              (!c && !mayEdit) ||
              ((!c?.phone || !c.address.trim()) && !mayEdit) ||
              r.loading
            }
            onClick={startOrder}
          >
            <ShoppingCart size={18} />
            Tạo đơn <kbd>F1</kbd>
          </button>
        ) : mayEdit && !customerId ? (
          <button className="primary" onClick={() => setEdit('suggested')}>
            Tạo hồ sơ khách
          </button>
        ) : (
          <small className="muted">Cần quyền quản lý đơn hàng để tạo đơn.</small>
        )}
        {blocked && <small>Hội thoại đang bị chặn.</small>}
      </div>
      {edit && (
        <ContactEditor
          id={id}
          version={version}
          customer={c || undefined}
          hints={found || undefined}
          suggested={edit === 'suggested'}
          forOrder={pendingOrder}
          close={() => {
            setEdit(null);
            setPendingOrder(false);
          }}
          done={() => {
            setDismissedHint(activity);
            setEdit(null);
            refresh();
          }}
        />
      )}
      {create && c && (
        <CreateOrder
          customer={c}
          conversationId={id}
          close={() => setCreate(false)}
          done={() => {
            setCreate(false);
            refresh();
          }}
        />
      )}
    </aside>
  );
}
