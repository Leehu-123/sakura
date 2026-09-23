import { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Send,
  Tag,
  ChevronDown,
  MessageSquare,
  ShoppingCart,
  Settings,
  Inbox as InboxIcon,
  Mail,
  Clock,
  UserRound,
  UserRoundPlus,
  Ban,
  Link2,
  PackageCheck,
  Image as ImageIcon,
} from 'lucide-react';
import { QuickLabels, Toolbar, defaultToolbar } from './QuickLabels';
import { ComposerTools, AttachmentCard } from './ComposerTools';
import { ContactAvatar, ContactTags, contactName } from './ContactIdentity';
import { NotificationSound } from './NotificationSound';
import { isSendKey } from './composerKeys';
import { Orders } from '../sales/Orders';
import { FanpageSettings } from './FanpageSettings';
import { StaffingBoard, WorkPanel } from './Staffing';
import { LiveStatus, useLiveResource } from './useLiveResource';
import { messageSnapshot } from './messageSnapshot';
import { CustomerPane } from './CustomerPane';
import { ImageLibrary, StoredImage } from './ImageLibrary';
import { chatDrafts } from './drafts';
import { SupportDialog, BlockDialog } from './WorkspaceTools';
import { api, ApiError } from '../api';
import { Actor, Page, has, date } from '../sales/types';
import { Form, Modal, Pager, SearchBox, State, useResource } from '../sales/shared';
import { ConfirmSuggestion, EditTemplate, LinkCustomer, ResolveMessage, Template } from './Dialogs';
type Conversation = {
  id: string;
  psid: string;
  facebookName?: string | null;
  avatarKey?: string | null;
  profileState?: string;
  pageId: string;
  version: number;
  tags: string[];
  taggedDate?: string | null;
  inboundSeq: number;
  blocked: boolean;
  blockReason: string;
  supportUserId: string | null;
  teamId: string | null;
  workState: string;
  supportUser: { id: string; displayName: string } | null;
  reads?: { unread: boolean }[];
  lastActivityAt: string;
  lastInboundAt: string | null;
  customer: { id: string; name: string } | null;
};
type Message = {
  imported?: boolean;
  id: string;
  text: string;
  direction: string;
  state: string;
  attachmentTypes: string[];
  imageId?: string;
  attachmentId?: string;
  orderId?: string;
  sourceAt: string;
  actor?: { displayName: string };
  shift?: { label: string } | null;
};
type Detail = Conversation & {
  shownInboundSeq?: number;
  newMessages?: boolean;
  canSend: boolean;
  messages: Page<Message>;
  suggestions: { phones: string[]; addresses: string[] };
};
const states: Record<string, string> = {
  RECEIVED: 'Khách gửi',
  SENDING: 'Đang gửi',
  SENT: 'Đã gửi tới Meta',
  FAILED: 'Gửi thất bại',
  UNKNOWN: 'Chưa rõ kết quả gửi',
};
function Thread({
  id,
  actor,
  changed,
  pageNames,
  back,
  toolbar,
}: {
  id: string;
  actor: Actor;
  changed: () => void;
  pageNames: Record<string, string>;
  back: () => void;
  toolbar: Toolbar;
}) {
  useSyncExternalStore(chatDrafts.subscribe, chatDrafts.snapshot);
  const draft = chatDrafts.get(id);
  const text = draft?.text || '';
  const selectedImage = draft?.image || null;
  const pending = draft?.pending;
  const [interaction, setInteraction] = useState('ALL'),
    [library, setLibrary] = useState(false),
    [tools, setTools] = useState<'support' | 'block' | null>(null);
  const [uploading, setUploading] = useState(false);
  const composing = useRef(false);
  const sending = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const readSeq = useRef<number | null>(null);
  const messageBox = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [revision, setRevision] = useState(0),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [modal, setModal] = useState<'link' | 'tags' | 'template' | null>(null),
    [template, setTemplate] = useState<Template | undefined>(),
    [suggestion, setSuggestion] = useState<{ field: 'phone' | 'address'; value: string } | null>(
      null,
    ),
    [resolve, setResolve] = useState<string | null>(null);
  const result = useLiveResource<Detail>(
    '/messenger/conversations/' + id + '?page=' + page + '&pageSize=30&interaction=' + interaction,
    revision,
    {
      enabled: !busy && !modal && !tools && !suggestion && !resolve && !library,
      merge: (next, previous) =>
        messageSnapshot(next, previous, page > 1 || interaction !== 'ALL' || !following),
    },
  );
  const templates = useResource<Template[]>('/messenger/templates', revision);
  const d = result.data;
  const delivery = useLiveResource<{ state: string; requestKey: string }>(
    '/messenger/conversations/' + id + '/requests/' + (draft?.requestKey || ''),
    revision,
    { enabled: !!pending && !busy },
  );
  useEffect(() => {
    const ticket = chatDrafts.ticket(id);
    if (
      !ticket ||
      !pending ||
      busy ||
      !delivery.data ||
      delivery.data.requestKey !== ticket.requestKey
    )
      return;
    chatDrafts.settle(id, ticket, delivery.data.state);
    if (delivery.data.state === 'SENT' || delivery.data.state === 'FAILED') {
      setNotice(
        delivery.data.state === 'SENT'
          ? 'Đã xác nhận tin được gửi tới Meta.'
          : 'Gửi thất bại. Đã giữ nội dung để bạn sửa hoặc gửi lại.',
      );
      setRevision((v) => v + 1);
      changed();
    }
  }, [delivery.updatedAt]);
  useLayoutEffect(() => {
    if (following && page === 1 && interaction === 'ALL' && messageBox.current) {
      messageBox.current.scrollTop = messageBox.current.scrollHeight;
    }
  }, [d?.messages, following, page, interaction]);
  useEffect(() => {
    if (
      !d ||
      d.messages.page !== 1 ||
      interaction !== 'ALL' ||
      !following ||
      result.paused ||
      result.error ||
      document.visibilityState !== 'visible' ||
      d.newMessages ||
      readSeq.current === d.shownInboundSeq
    )
      return;
    const seen = d.shownInboundSeq ?? d.inboundSeq;
    readSeq.current = seen;
    void api('/messenger/conversations/' + id + '/read', 'POST', {
      inboundSeq: seen,
      unread: false,
    })
      .then(changed)
      .catch(() => {
        if (readSeq.current === seen) readSeq.current = null;
      });
  }, [
    d?.shownInboundSeq,
    d?.messages.page,
    d?.newMessages,
    interaction,
    following,
    result.paused,
    result.error,
    result.updatedAt,
  ]);
  const refresh = () => {
    setModal(null);
    setSuggestion(null);
    setResolve(null);
    setTools(null);
    setRevision((v) => v + 1);
    changed();
  };
  const cannotSend =
    busy ||
    uploading ||
    !!result.error ||
    !d?.canSend ||
    (!!pending && pending !== 'NOT_RECORDED') ||
    (!text.trim() && !selectedImage);
  async function send() {
    if (cannotSend || sending.current) return;
    const attempt = chatDrafts.begin(id);
    if (!attempt) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const sent = await api<Message>(
        '/messenger/conversations/' + id + '/reply',
        'POST',
        {
          ...(attempt.image
            ? attempt.image.attachment
              ? { attachmentId: attempt.image.id }
              : { imageId: attempt.image.id }
            : { text: attempt.text }),
          requestKey: attempt.requestKey,
        },
        true,
        AbortSignal.timeout(30000),
      );
      setNotice(states[sent.state] || 'Đã ghi nhận yêu cầu');
      chatDrafts.settle(id, attempt, sent.state);
      setPage(1);
      refresh();
    } catch (e) {
      // A lost response retains its key and payload for read-only reconciliation.
      if (
        !attempt.pending &&
        e instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(e.status)
      )
        chatDrafts.settle(id, attempt, 'FAILED');
      setError((e as Error).message);
      setRevision((v) => v + 1);
    } finally {
      sending.current = false;
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }
  return (
    <div className={'chat-thread-with-customer' + (customerOpen ? ' customer-open' : '')}>
      <button className="customer-toggle secondary" onClick={() => setCustomerOpen(!customerOpen)}>
        <UserRound size={15} />
        {customerOpen ? 'Về tin nhắn' : 'Thông tin khách'}
      </button>
      <div className="chat-thread">
        <State loading={result.loading} error={result.error} />
        {!d && (
          <button className="secondary" onClick={() => setRevision((v) => v + 1)}>
            Thử tải lại hội thoại
          </button>
        )}
        {d && (
          <>
            <div className="chat-thread-head">
              <button
                className="icon-button chat-back"
                aria-label="Về danh sách hội thoại"
                onClick={back}
              >
                <ArrowLeft size={19} />
              </button>
              <ContactAvatar contact={d} />
              <div className="chat-person">
                <h2>{contactName(d)}</h2>
                <ContactTags tags={d.tags} taggedDate={d.taggedDate} toolbar={toolbar} />
                <small title={'Mã hội thoại: ' + d.psid}>
                  {pageNames[d.pageId] || 'Fanpage ' + d.pageId}
                </small>
                {d.profileState === 'UNAVAILABLE' && !d.facebookName && (
                  <small className="profile-note">
                    Meta chưa cung cấp tên/ảnh Facebook; Sakura sẽ tự thử lại.
                  </small>
                )}
              </div>
              <button
                className="icon-button"
                aria-label="Làm mới hội thoại"
                title="Làm mới hội thoại"
                disabled={busy}
                onClick={refresh}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <LiveStatus resource={result} />
            <div className="chat-header-tools">
              <button
                className="secondary"
                disabled={!!d.teamId}
                onClick={() => setTools('support')}
              >
                <UserRoundPlus size={16} /> {d.supportUser?.displayName || 'Phân hỗ trợ'}
              </button>
              <button className="secondary" onClick={() => setTools('block')}>
                <Ban size={16} /> {d.blocked ? 'Bỏ chặn' : 'Chặn khách'}
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api('/messenger/conversations/' + id + '/read', 'POST', {
                      inboundSeq: d.inboundSeq,
                      unread: true,
                    });
                    readSeq.current = d.inboundSeq;
                    setNotice('Đã đánh dấu chưa đọc riêng cho bạn.');
                    changed();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Mail size={16} /> Chưa đọc
              </button>
              <button className="text-button" onClick={() => setModal('tags')}>
                <Tag size={13} /> Nhãn
              </button>
              {!d.customer &&
                actor.grants.some(
                  (g) => g.permission === 'sales.chat.use' && g.scope === 'GLOBAL',
                ) &&
                has(actor, 'sales.customers.read') && (
                  <button className="secondary" onClick={() => setModal('link')}>
                    Gắn khách hàng
                  </button>
                )}
              <label>
                Lọc tương tác
                <select
                  value={interaction}
                  onChange={(e) => {
                    setInteraction(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">Tất cả tin</option>
                  <option value="INBOUND">Tin khách gửi</option>
                  <option value="OUTBOUND">Tin đã trả lời</option>
                  <option value="IMAGE">Có ảnh</option>
                  <option value="ORDER">Xác nhận đơn</option>
                </select>
              </label>
            </div>
            {d.blocked && <p className="note">Đã chặn trong Sakura · {d.blockReason}</p>}
            {d.teamId && (
              <details className="thread-work">
                <summary>
                  Phân công & ca trực <ChevronDown size={13} />
                </summary>
                <WorkPanel id={id} actor={actor} revision={revision} changed={refresh} />
              </details>
            )}
            {d.newMessages && (
              <button
                className="new-messages"
                onClick={() => {
                  setPage(1);
                  setInteraction('ALL');
                  setFollowing(true);
                  setRevision((v) => v + 1);
                }}
              >
                Có tin mới · Xem tin mới nhất
              </button>
            )}
            <div
              className="chat-messages"
              aria-label="Tin nhắn"
              ref={messageBox}
              onScroll={() => {
                const box = messageBox.current;
                if (box) setFollowing(box.scrollHeight - box.scrollTop - box.clientHeight < 64);
              }}
            >
              {[...d.messages.items].reverse().map((m) => (
                <article
                  className={'chat-message ' + (m.direction === 'OUTBOUND' ? 'outbound' : '')}
                  key={m.id}
                >
                  {m.direction === 'INBOUND' && (
                    <small className="message-time">{date(m.sourceAt)}</small>
                  )}
                  {m.orderId && <strong>Xác nhận đơn hàng</strong>}
                  <p>{m.text}</p>
                  {m.imageId && (
                    <StoredImage
                      path={'/messenger/conversations/' + id + '/messages/' + m.id + '/image'}
                    />
                  )}
                  {m.attachmentId && (
                    <AttachmentCard
                      id={id}
                      file={{
                        id: m.attachmentId,
                        title: m.text,
                        attachment: true,
                        kind: m.attachmentTypes.includes('image') ? 'image' : 'file',
                      }}
                    />
                  )}
                  {!m.attachmentId && m.attachmentTypes.length > 0 && (
                    <p className="muted">
                      Có {m.attachmentTypes.length} tệp/ảnh. Xem nội dung trong Meta Business Suite.
                    </p>
                  )}
                  {m.direction === 'OUTBOUND' && (
                    <small
                      className="message-author"
                      title={m.shift ? 'Ca trực: ' + m.shift.label : undefined}
                    >
                      {m.imported
                        ? 'Gửi từ Facebook · chưa xác định nhân viên'
                        : 'Người gửi: ' + (m.actor?.displayName || 'Chưa ghi nhận')}{' '}
                      · {date(m.sourceAt)}
                    </small>
                  )}
                  {m.direction === 'OUTBOUND' && (
                    <small className="message-delivery">{states[m.state] || m.state}</small>
                  )}
                  {m.state === 'UNKNOWN' && has(actor, 'core.messenger.manage') && (
                    <button className="text-button" onClick={() => setResolve(m.id)}>
                      Đối chiếu kết quả
                    </button>
                  )}
                </article>
              ))}
              <State loading={false} error="" empty={!d.messages.items.length} />
            </div>
            {d.messages.total > d.messages.pageSize && (
              <Pager data={d.messages} page={d.messages.page} setPage={setPage} />
            )}
            {d.customer &&
              has(actor, 'sales.customers.read') &&
              has(actor, 'sales.customers.manage') &&
              d.suggestions.phones.length + d.suggestions.addresses.length > 0 && (
                <details className="chat-suggestions">
                  <summary>Thông tin khách gợi ý từ tin nhắn</summary>
                  <p className="muted">Chỉ là gợi ý từ tin nhắn đang xem, chưa lưu vào hồ sơ.</p>
                  {d.suggestions.phones.map((v) => (
                    <button
                      className="secondary"
                      key={v}
                      onClick={() => setSuggestion({ field: 'phone', value: v })}
                    >
                      Điện thoại: {v}
                    </button>
                  ))}
                  {d.suggestions.addresses.map((v) => (
                    <button
                      className="secondary"
                      key={v}
                      onClick={() => setSuggestion({ field: 'address', value: v })}
                    >
                      Địa chỉ: {v}
                    </button>
                  ))}
                </details>
              )}
            <QuickLabels
              id={id}
              version={d.version}
              tags={d.tags}
              taggedDate={d.taggedDate}
              value={toolbar}
              manage={has(actor, 'core.messenger.manage')}
              disabled={!!result.error || busy}
              changed={refresh}
            />
            <div className="chat-composer">
              <ComposerTools
                id={id}
                disabled={busy || !!pending}
                setUploading={setUploading}
                library={has(actor, 'catalog.products.read') ? () => setLibrary(true) : undefined}
                templates={templates.data || []}
                templateError={templates.error}
                manage={has(actor, 'core.messenger.manage')}
                editTemplate={(t) => {
                  setTemplate(t);
                  setModal('template');
                }}
                selected={(file) => chatDrafts.edit(id, { image: file })}
                insert={(value) => {
                  const el = inputRef.current;
                  const start = el?.selectionStart ?? text.length;
                  const end = el?.selectionEnd ?? start;
                  const next = text.slice(0, start) + value + text.slice(end);
                  if (next.length > 2000) {
                    setError('Nội dung tối đa 2.000 ký tự.');
                    return;
                  }
                  chatDrafts.edit(id, { text: next });
                  setError('');
                  requestAnimationFrame(() => {
                    el?.focus();
                    el?.setSelectionRange(start + value.length, start + value.length);
                  });
                }}
              />
              {selectedImage && (
                <div className="selected-image">
                  {selectedImage.attachment ? (
                    <AttachmentCard id={id} file={selectedImage} />
                  ) : (
                    <StoredImage path={'/messenger/images/' + selectedImage.id} />
                  )}
                  <span>{selectedImage.title}</span>
                  <button
                    className="text-button"
                    disabled={busy || !!pending}
                    onClick={() => {
                      chatDrafts.edit(id, { image: null });
                    }}
                  >
                    Bỏ đính kèm
                  </button>
                  <p>Tệp/ảnh sẽ gửi riêng. Nội dung đang soạn được giữ lại để gửi sau.</p>
                </div>
              )}
              <State loading={false} error={error} />
              {notice && <p role="status">{notice}</p>}
              {draft && !pending && (
                <div className="draft-status">
                  <small>
                    {chatDrafts.durable()
                      ? 'Đã lưu bản nháp'
                      : 'Chỉ giữ bản nháp khi app đang mở; trình duyệt chưa cho phép lưu.'}
                  </small>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => chatDrafts.discard(id)}
                  >
                    Xóa bản nháp
                  </button>
                </div>
              )}
              {pending && (
                <div className="note" role="status">
                  <p>
                    {pending === 'NOT_RECORDED'
                      ? 'Máy chủ chưa ghi nhận lần gửi này. Bạn có thể thử lại đúng nội dung bằng nút bên dưới.'
                      : pending === 'UNKNOWN'
                        ? 'Chưa rõ kết quả gửi. Nhờ quản lý đối chiếu trên Fanpage trước khi gửi tiếp.'
                        : 'Đang kiểm tra kết quả gửi. Nội dung được giữ nguyên để tránh gửi trùng.'}
                  </p>
                  {delivery.error && <p>{delivery.error}</p>}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRevision((v) => v + 1)}
                  >
                    Kiểm tra lại kết quả
                  </button>
                </div>
              )}
              <label className="composer-input">
                <span className="sr-only">Nội dung trả lời</span>
                <textarea
                  ref={inputRef}
                  rows={2}
                  onCompositionStart={() => {
                    composing.current = true;
                  }}
                  onCompositionEnd={() => {
                    composing.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (!isSendKey(e.nativeEvent, composing.current)) return;
                    e.preventDefault();
                    if (!cannotSend && !pending) void send();
                  }}
                  value={text}
                  disabled={busy || uploading || !!pending}
                  maxLength={2000}
                  onChange={(e) => {
                    chatDrafts.edit(id, { text: e.target.value });
                    setError('');
                  }}
                  placeholder="Nhập tin nhắn cho khách…"
                />
              </label>
              {!d.canSend && (
                <p className="muted">
                  Chưa thể gửi: hội thoại bị chặn, kết nối chưa bật, đã qua 24 giờ, hoặc có tin cần
                  đối chiếu. Với hội thoại theo nhóm, bạn còn cần đang trực và nhận xử lý hội thoại.
                </p>
              )}
              <div className="composer-footer">
                <small>Enter để gửi · Shift + Enter xuống dòng</small>
                <button
                  className="primary composer-send"
                  disabled={cannotSend}
                  onClick={() => void send()}
                >
                  <Send size={16} />{' '}
                  {busy
                    ? 'Đang gửi…'
                    : pending === 'NOT_RECORDED'
                      ? 'Thử lại lần gửi này'
                      : selectedImage
                        ? selectedImage.kind === 'file' || selectedImage.kind === 'video'
                          ? 'Gửi tệp'
                          : 'Gửi nhãn dán / ảnh'
                        : 'Gửi tin nhắn'}
                </button>
              </div>
            </div>
            {modal === 'link' && (
              <LinkCustomer
                id={id}
                version={d.version}
                close={() => setModal(null)}
                done={refresh}
              />
            )}
            {modal === 'tags' && (
              <Modal title="Nhãn hội thoại" close={() => setModal(null)}>
                <Form
                  done={refresh}
                  submit={(f) =>
                    api('/messenger/conversations/' + id + '/tags', 'PATCH', {
                      version: d.version,
                      tags: String(f.get('tags'))
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  <label>
                    Nhãn, cách nhau bằng dấu phẩy
                    <input name="tags" defaultValue={d.tags.join(', ')} maxLength={310} />
                  </label>
                  <p>Tối đa 10 nhãn, mỗi nhãn 30 ký tự.</p>
                </Form>
              </Modal>
            )}
            {modal === 'template' && (
              <EditTemplate template={template} close={() => setModal(null)} done={refresh} />
            )}
            {suggestion && d.customer && (
              <ConfirmSuggestion
                customerId={d.customer.id}
                {...suggestion}
                close={() => setSuggestion(null)}
                done={refresh}
              />
            )}
            {resolve && (
              <ResolveMessage
                conversationId={id}
                messageId={resolve}
                close={() => setResolve(null)}
                done={refresh}
              />
            )}
          </>
        )}
        {library && (
          <ImageLibrary
            actor={actor}
            close={() => setLibrary(false)}
            select={(i) => {
              chatDrafts.edit(id, { image: { id: i.id, title: i.title } });
              setLibrary(false);
            }}
          />
        )}
        {d && tools === 'support' && (
          <SupportDialog
            id={id}
            version={d.version}
            current={d.supportUserId}
            close={() => setTools(null)}
            done={refresh}
          />
        )}
        {d && tools === 'block' && (
          <BlockDialog
            id={id}
            version={d.version}
            blocked={d.blocked}
            close={() => setTools(null)}
            done={refresh}
          />
        )}
      </div>
      {d && (
        <CustomerPane
          toolbar={toolbar}
          psid={d.psid}
          key={id}
          customerId={d.customer?.id}
          id={id}
          actor={actor}
          canSend={d.canSend && !result.error && !pending && !busy}
          blocked={d.blocked}
          revision={revision}
          changed={refresh}
          version={d.version}
          facebookName={d.facebookName}
          avatarKey={d.avatarKey}
          tags={d.tags}
          activity={d.lastActivityAt}
          link={() => setModal('link')}
        />
      )}
    </div>
  );
}
const filters = [
  ['ALL', 'Tất cả', InboxIcon],
  ['UNREAD', 'Chưa đọc', Mail],
  ['UNANSWERED', 'Chưa trả lời', Clock],
  ['MINE', 'Tôi hỗ trợ', UserRound],
  ['UNASSIGNED', 'Chưa phân công', UserRoundPlus],
  ['WAITING', 'Chờ nhận', InboxIcon],
  ['UNLINKED', 'Chưa gắn khách', Link2],
  ['HAS_ORDER', 'Có đơn đã chốt', PackageCheck],
  ['BLOCKED', 'Đã chặn', Ban],
] as const;
export function Inbox({ actor }: { actor: Actor }) {
  useSyncExternalStore(chatDrafts.subscribe, chatDrafts.snapshot);
  const [section, setSection] = useState('inbox'),
    [pageId, setPageId] = useState(''),
    [tag, setTag] = useState(''),
    [library, setLibrary] = useState(false);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('ALL'),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [createTemplate, setCreateTemplate] = useState(false),
    [editingTemplate, setEditingTemplate] = useState<Template | undefined>();
  const pages = useResource<{ id: string; name: string; sending: boolean }[]>(
    '/messenger/pages',
    revision,
  );
  const toolbarResource = useResource<Toolbar>('/messenger/toolbar', revision);
  const toolbar = toolbarResource.data || defaultToolbar;
  const templateList = useResource<Template[]>('/messenger/templates', revision);
  const status = useResource<{ receiving: boolean; sending: boolean; pageId: string | null }>(
    '/messenger/status',
    revision,
  );
  const list = useLiveResource<Page<Conversation>>(
    '/messenger/conversations?page=' +
      page +
      '&search=' +
      encodeURIComponent(search) +
      '&filter=' +
      filter +
      '&pageId=' +
      encodeURIComponent(pageId) +
      '&tag=' +
      encodeURIComponent(tag),
    revision,
    { enabled: section === 'inbox' },
  );
  return (
    <div className={'social-workspace' + (section === 'inbox' ? ' is-inbox' : '')}>
      <nav className="social-nav" aria-label="Bán hàng qua hội thoại">
        <strong>
          <MessageSquare size={20} /> Sakura Chat
        </strong>
        <NotificationSound key={actor.id} userId={actor.id} />
        <button aria-pressed={section === 'inbox'} onClick={() => setSection('inbox')}>
          <MessageSquare size={18} /> Hội thoại
        </button>
        {has(actor, 'sales.orders.read') && (
          <button aria-pressed={section === 'orders'} onClick={() => setSection('orders')}>
            <ShoppingCart size={18} /> Đơn hàng
          </button>
        )}
        <button aria-pressed={section === 'config'} onClick={() => setSection('config')}>
          <Settings size={18} /> Cấu hình
        </button>
        <button aria-pressed={section === 'staffing'} onClick={() => setSection('staffing')}>
          <UserRound size={18} /> Ca trực
        </button>
        {section !== 'staffing' && (
          <label>
            Fanpage
            <select
              value={pageId}
              onChange={(e) => {
                setPageId(e.target.value);
                setPage(1);
                setSelected(null);
              }}
            >
              <option value="">Tất cả Fanpage đã cấu hình</option>
              {pages.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </nav>
      <State loading={pages.loading} error={pages.error} />
      {section === 'orders' && <Orders actor={actor} />}
      {section === 'staffing' && (
        <StaffingBoard actor={actor} changed={() => setRevision((v) => v + 1)} />
      )}
      {section !== 'orders' && section !== 'staffing' && (
        <>
          <State loading={status.loading} error={status.error} />
          {status.data && !status.data.receiving && (
            <div className="note wide">
              {status.data.receiving
                ? 'Đã cấu hình nhận tin cho ' + (pages.data?.length || 1) + ' Fanpage'
                : 'Messenger chưa kết nối Fanpage. Mở Cấu hình để thêm Fanpage và thiết lập địa chỉ nhận tin HTTPS.'}{' '}
              Xem trạng thái gửi của từng Fanpage trong Cấu hình.
            </div>
          )}
          {section === 'inbox' && (
            <>
              <div className={'chat-layout' + (selected ? ' has-selection' : '')}>
                <nav className="chat-filter-rail" aria-label="Lọc hội thoại">
                  {filters.map(([value, label, Icon]) => (
                    <button
                      key={value}
                      title={label}
                      aria-pressed={filter === value}
                      onClick={() => {
                        setFilter(value);
                        setPage(1);
                      }}
                    >
                      <Icon size={20} />
                      <span>{label}</span>
                    </button>
                  ))}
                </nav>
                <section className="panel chat-list">
                  {' '}
                  <div className="inbox-search">
                    <SearchBox
                      placeholder="Tìm khách hàng, nhãn…"
                      onSearch={(s) => {
                        setSearch(s);
                        setPage(1);
                      }}
                    />
                    <label>
                      Lọc nhãn
                      <select
                        value={tag}
                        onChange={(e) => {
                          setTag(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">Mọi nhãn</option>
                        {toolbar.labels
                          .map((l) => l.name)
                          .map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                      </select>
                    </label>
                    <button className="secondary" onClick={() => setRevision((v) => v + 1)}>
                      <RefreshCw size={15} /> Làm mới
                    </button>
                  </div>
                  <div className="conversation-list-heading">
                    <strong>{filters.find((f) => f[0] === filter)?.[1]}</strong>
                    <span>{list.data?.total || 0} hội thoại</span>
                  </div>
                  <LiveStatus resource={list} />
                  <State loading={list.loading} error={list.error} />
                  {list.data && (
                    <>
                      {list.data.items.map((c) => (
                        <button
                          aria-pressed={selected === c.id}
                          className={'chat-list-item ' + (selected === c.id ? 'selected' : '')}
                          key={c.id}
                          onClick={() => {
                            setSelected(c.id);
                          }}
                        >
                          <ContactAvatar contact={c} />
                          <span className="conversation-summary">
                            <span className="conversation-line">
                              <strong>{contactName(c)}</strong>
                              <time title={date(c.lastActivityAt)}>
                                {new Date(c.lastActivityAt).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </time>
                            </span>
                            <span className="conversation-page">
                              {pages.data?.find((p) => p.id === c.pageId)?.name ||
                                'Fanpage ' + c.pageId}
                            </span>
                            <span className="conversation-assignee">
                              {c.supportUser?.displayName ||
                                (c.workState === 'DONE' ? 'Đã hoàn tất xử lý' : 'Chưa phân công')}
                            </span>
                            <ContactTags
                              tags={c.tags}
                              taggedDate={c.taggedDate}
                              toolbar={toolbar}
                            />
                            <span className="conversation-tags">
                              {chatDrafts.get(c.id) && (
                                <span className="draft-badge">
                                  {chatDrafts.get(c.id)?.pending ? 'Đang kiểm tra gửi' : 'Bản nháp'}
                                </span>
                              )}
                            </span>
                          </span>
                          {(c.reads?.[0]?.unread || (!c.reads?.length && c.inboundSeq > 0)) && (
                            <span className="unread-dot" aria-label="Chưa đọc" />
                          )}
                        </button>
                      ))}
                      <State loading={false} error="" empty={!list.data.items.length} />
                      <Pager data={list.data} page={page} setPage={setPage} />
                    </>
                  )}
                </section>
                <section className="panel chat-detail">
                  {selected ? (
                    <Thread
                      key={selected}
                      id={selected}
                      actor={actor}
                      toolbar={toolbar}
                      back={() => setSelected(null)}
                      pageNames={Object.fromEntries((pages.data || []).map((p) => [p.id, p.name]))}
                      changed={() => setRevision((v) => v + 1)}
                    />
                  ) : (
                    <div className="chat-welcome">
                      <MessageSquare size={40} />
                      <h2>Mỗi cuộc trò chuyện, một cơ hội</h2>
                      <p>Chọn khách ở bên trái để xem tin nhắn, tư vấn và tạo đơn.</p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {section === 'config' && (
            <section className="panel import-panel">
              <h2>Cấu hình bán hàng qua chat</h2>
              <p>Quản lý thư viện ảnh, mẫu trả lời và các Fanpage của công ty.</p>
              {pages.data?.map((p) => (
                <p key={p.id}>
                  <strong>{p.name}</strong> · {p.sending ? 'Đã bật gửi' : 'Chỉ nhận tin'} · {p.id}
                </p>
              ))}
              {has(actor, 'catalog.products.read') && (
                <button className="secondary" onClick={() => setLibrary(true)}>
                  Thư viện ảnh sản phẩm
                </button>
              )}
              {has(actor, 'core.messenger.manage') && (
                <button
                  className="secondary"
                  onClick={() => {
                    setEditingTemplate(undefined);
                    setCreateTemplate(true);
                  }}
                >
                  Thêm mẫu trả lời
                </button>
              )}
            </section>
          )}
          {section === 'config' && has(actor, 'core.messenger.manage') && (
            <FanpageSettings changed={() => setRevision((v) => v + 1)} />
          )}
          {section === 'config' && has(actor, 'core.messenger.manage') && (
            <details className="panel import-panel">
              <summary>Quản lý mẫu trả lời</summary>
              <State loading={templateList.loading} error={templateList.error} />
              {templateList.data?.map((t) => (
                <div className="activity" key={t.id}>
                  <strong>
                    {t.title} {t.isActive ? '' : '· Đang tắt'}
                  </strong>
                  <p>{t.text}</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setEditingTemplate(t);
                      setCreateTemplate(true);
                    }}
                  >
                    Sửa mẫu
                  </button>
                </div>
              ))}
            </details>
          )}
          {createTemplate && (
            <EditTemplate
              template={editingTemplate}
              close={() => setCreateTemplate(false)}
              done={() => {
                setCreateTemplate(false);
                setRevision((v) => v + 1);
              }}
            />
          )}
          {library && <ImageLibrary actor={actor} close={() => setLibrary(false)} />}
        </>
      )}
    </div>
  );
}
