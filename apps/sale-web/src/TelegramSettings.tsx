import { useState, useEffect, FormEvent } from 'react';
import { api } from './api';
import { Send } from 'lucide-react';

type TelegramConfig = {
  id: number;
  botToken: string;
  enabled: boolean;
  hasToken: boolean;
};

export function TelegramSettings() {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    api<TelegramConfig>('/core/telegram')
      .then((c) => {
        setConfig(c);
        setTokenInput('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await api<TelegramConfig>('/core/telegram', 'PATCH', body);
      setConfig(updated);
      setTokenInput('');
      setShowToken(false);
      setSuccess('Đã lưu cấu hình.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTokenSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    save({ botToken: tokenInput.trim() });
  };

  const handleToggle = () => {
    if (!config) return;
    save({ enabled: !config.enabled });
  };

  if (loading) return <div className="empty">Đang tải…</div>;
  if (error && !config)
    return (
      <div className="alert error" role="alert">
        {error}
      </div>
    );

  return (
    <div style={{ maxWidth: 640 }}>
      <section className="panel" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span title="Telegram"><Send size={22} /></span>
          <h3 style={{ margin: 0 }}>Cấu hình Telegram Bot</h3>
        </div>

        {error && (
          <div className="alert error" role="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        {success && (
          <div className="alert success" style={{ marginBottom: 16 }}>
            {success}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
            Trạng thái
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className={config?.enabled ? 'btn danger small' : 'btn primary small'}
              onClick={handleToggle}
              disabled={saving || !config?.hasToken}
            >
              {config?.enabled ? 'Tắt báo cáo' : 'Bật báo cáo'}
            </button>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {config?.enabled
                ? '✅ Đang bật — báo cáo sẽ gửi lúc 22:00 hàng ngày'
                : config?.hasToken
                  ? '⏸ Đang tắt'
                  : '⚠️ Chưa có Bot Token'}
            </span>
          </div>
        </div>

        <form onSubmit={handleTokenSubmit} style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
            Bot Token
          </label>
          {config?.hasToken && !showToken && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <code style={{ background: '#f1f5f9', padding: '6px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                {config.botToken}
              </code>
              <button type="button" className="text-button" onClick={() => setShowToken(true)}>
                Đổi token
              </button>
            </div>
          )}
          {(!config?.hasToken || showToken) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Dán Bot Token từ @BotFather"
                style={{ flex: 1 }}
              />
              <button className="btn primary" type="submit" disabled={saving || !tokenInput.trim()}>
                Lưu
              </button>
              {showToken && (
                <button className="btn" type="button" onClick={() => setShowToken(false)}>
                  Hủy
                </button>
              )}
            </div>
          )}
          <small className="muted" style={{ display: 'block', marginTop: 8 }}>
            Tạo bot qua <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> trên Telegram, sau đó dán token ở đây.
          </small>
        </form>

        <div>
          <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>
            Hướng dẫn lấy Chat ID
          </label>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', color: '#475569', lineHeight: 1.8 }}>
            <li>Mở Telegram, tìm bot <strong>@userinfobot</strong></li>
            <li>Gửi tin nhắn bất kỳ cho bot đó</li>
            <li>Bot sẽ trả về <strong>Id</strong> — đó là Chat ID của bạn</li>
            <li>Dán Chat ID vào trường "Telegram Chat ID" khi chỉnh sửa tài khoản (mục Tài khoản)</li>
          </ol>
        </div>
      </section>
    </div>
  );
}
