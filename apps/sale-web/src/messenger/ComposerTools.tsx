import { useEffect, useRef, useState } from 'react';
import {
  Smile,
  Sticker,
  MessageSquareText,
  Paperclip,
  Image as ImageIcon,
  X,
  Download,
} from 'lucide-react';
import { api } from '../api';
import { State } from '../sales/shared';
import { StoredImage } from './ImageLibrary';
import { DraftImage } from './drafts';
import { Template } from './Dialogs';
const emojis = [
  '😊',
  '🥰',
  '😍',
  '😘',
  '😄',
  '😂',
  '😅',
  '🙏',
  '👍',
  '👌',
  '❤️',
  '💕',
  '💖',
  '🌸',
  '🌷',
  '🌹',
  '🎁',
  '🎀',
  '✨',
  '✅',
  '📦',
  '🚚',
  '💐',
  '🤝',
];
const stickers = [
  ['🌸', 'Sakura chào bạn'],
  ['💖', 'Cảm ơn bạn nhé!'],
  ['👍', 'Dạ được ạ!'],
  ['📦', 'Đã lên đơn'],
  ['🚚', 'Đang giao hàng'],
  ['🎀', 'Hẹn gặp lại nhé!'],
];
async function stickerFile(emoji: string, text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 400;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff0f5';
  ctx.beginPath();
  ctx.roundRect(8, 8, 464, 384, 55);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = '140px "Segoe UI Emoji", sans-serif';
  ctx.fillText(emoji, 240, 215);
  ctx.fillStyle = '#a92049';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(text, 240, 300);
  ctx.font = '16px sans-serif';
  ctx.fillText('SAKURA', 240, 350);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Không tạo được nhãn dán.'))),
      'image/png',
    ),
  );
  return new File([blob], text + '.png', { type: 'image/png' });
}
export function AttachmentCard({ id, file }: { id: string; file: DraftImage }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const path = '/messenger/conversations/' + id + '/attachments/' + file.id;
  async function download() {
    setBusy(true);
    setError('');
    try {
      const f = await api<{ title: string; mime: string; data: string }>(path);
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = f.title;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="chat-attachment">
      {file.kind === 'image' && <StoredImage path={path} />}
      <button className="text-button" disabled={busy} onClick={() => void download()}>
        <Download size={14} />
        {busy ? 'Đang tải…' : file.title}
      </button>
      <State loading={false} error={error} />
    </div>
  );
}
export function ComposerTools({
  id,
  disabled,
  library,
  templates,
  templateError,
  manage,
  editTemplate,
  insert,
  selected,
  setUploading,
}: {
  id: string;
  disabled: boolean;
  library?: () => void;
  templates: Template[];
  templateError: string;
  manage: boolean;
  editTemplate: (t?: Template) => void;
  insert: (text: string) => void;
  selected: (file: DraftImage) => void;
  setUploading: (b: boolean) => void;
}) {
  const [panel, setPanel] = useState<'emoji' | 'sticker' | 'templates' | null>(null),
    [query, setQuery] = useState(''),
    [uploading, setLocalUploading] = useState(false),
    [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null),
    alive = useRef(true),
    inFlight = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  async function upload(file: File) {
    if (inFlight.current || disabled) return;
    setError('');
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setError('Chọn tệp không rỗng, tối đa 10 MB.');
      return;
    }
    inFlight.current = true;
    setUploading(true);
    setLocalUploading(true);
    controller.current = new AbortController();
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await api<DraftImage>(
        '/messenger/conversations/' + id + '/attachments',
        'POST',
        body,
        true,
        controller.current.signal,
      );
      if (alive.current) {
        selected({ ...result, attachment: true });
        setPanel(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setUploading(false);
        setLocalUploading(false);
      }
    }
  }
  const locked = disabled || uploading;
  return (
    <div className="composer-tools">
      <div className="composer-tool-row">
        <button
          title="Đính kèm ảnh hoặc tệp"
          aria-label="Đính kèm ảnh hoặc tệp"
          disabled={locked}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={19} />
        </button>
        <input
          ref={fileInput}
          type="file"
          aria-label="Chọn ảnh hoặc tệp từ máy"
          hidden
          accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.mp4"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
        {library && (
          <button
            title="Ảnh sản phẩm"
            aria-label="Ảnh sản phẩm"
            disabled={locked}
            onClick={library}
          >
            <ImageIcon size={19} />
          </button>
        )}
        {(
          [
            ['emoji', 'Biểu tượng cảm xúc', Smile],
            ['sticker', 'Nhãn dán', Sticker],
            ['templates', 'Câu trả lời mẫu', MessageSquareText],
          ] as const
        ).map(([key, title, Icon]) => (
          <button
            key={key}
            title={title}
            aria-label={title}
            aria-expanded={panel === key}
            disabled={locked}
            onClick={() => {
              setPanel(panel === key ? null : key);
              setError('');
            }}
          >
            <Icon size={19} />
          </button>
        ))}
        <small>{uploading ? 'Đang tải tệp…' : 'Ảnh / tệp tối đa 10 MB'}</small>
      </div>
      <State loading={false} error={error} />
      {panel && (
        <div
          className="composer-popover"
          role="region"
          aria-label={
            panel === 'templates'
              ? 'Câu trả lời mẫu'
              : panel === 'emoji'
                ? 'Biểu tượng cảm xúc'
                : 'Nhãn dán Sakura'
          }
        >
          <header>
            <strong>
              {panel === 'templates'
                ? 'Câu trả lời mẫu'
                : panel === 'emoji'
                  ? 'Biểu tượng cảm xúc'
                  : 'Nhãn dán Sakura'}
            </strong>
            <button aria-label="Đóng bảng công cụ" onClick={() => setPanel(null)}>
              <X size={16} />
            </button>
          </header>
          {panel === 'emoji' && (
            <div className="emoji-grid">
              {emojis.map((e) => (
                <button
                  key={e}
                  aria-label={'Chèn ' + e}
                  onClick={() => {
                    insert(e);
                    setPanel(null);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {panel === 'sticker' && (
            <>
              <p className="muted">Chọn để xem trước, rồi bấm Gửi nhãn dán / ảnh.</p>
              <div className="sticker-grid">
                {stickers.map(([emoji, title]) => (
                  <button
                    key={title}
                    disabled={locked}
                    onClick={() =>
                      void stickerFile(emoji, title)
                        .then(upload)
                        .catch((e) => setError(e.message))
                    }
                  >
                    <span>{emoji}</span>
                    {title}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === 'templates' && (
            <>
              <input
                aria-label="Tìm câu trả lời mẫu"
                placeholder="Tìm mẫu trả lời…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <State loading={false} error={templateError} />
              <div className="reply-template-list">
                {templates
                  .filter(
                    (t) =>
                      t.isActive &&
                      (t.title + ' ' + t.text)
                        .toLocaleLowerCase()
                        .includes(query.toLocaleLowerCase()),
                  )
                  .map((t) => (
                    <div key={t.id}>
                      <button
                        onClick={() => {
                          insert(t.text);
                          setPanel(null);
                        }}
                      >
                        <strong>{t.title}</strong>
                        <span>{t.text}</span>
                      </button>
                      {manage && (
                        <button className="text-button" onClick={() => editTemplate(t)}>
                          Sửa
                        </button>
                      )}
                    </div>
                  ))}
              </div>
              {!templates.some((t) => t.isActive) && <p className="muted">Chưa có mẫu trả lời.</p>}
              {manage && (
                <button className="secondary" onClick={() => editTemplate()}>
                  Thêm câu trả lời mẫu
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
