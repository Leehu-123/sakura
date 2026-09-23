import { useState } from 'react';
import { api } from '../api';
import { Form, Modal, State, useResource } from '../sales/shared';
import { Person } from '../sales/types';
export function SupportDialog({
  id,
  version,
  current,
  close,
  done,
}: {
  id: string;
  version: number;
  current?: string | null;
  close: () => void;
  done: () => void;
}) {
  const r = useResource<Person[]>('/messenger/conversations/' + id + '/supporters');
  return (
    <Modal title="Phân chia người hỗ trợ" close={close}>
      <p>
        Chọn người đã có quyền xem hội thoại. Người phụ trách khách và người chốt đơn vẫn được quản
        lý riêng.
      </p>
      <State loading={r.loading} error={r.error} />
      {r.data && (
        <Form
          done={done}
          submit={(f) =>
            api('/messenger/conversations/' + id + '/support', 'PATCH', {
              version,
              userId: f.get('userId') || null,
            })
          }
        >
          <label>
            Người hỗ trợ
            <select name="userId" defaultValue={current || ''}>
              <option value="">Chưa phân công</option>
              {r.data.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </label>
        </Form>
      )}
    </Modal>
  );
}
export function BlockDialog({
  id,
  version,
  blocked,
  close,
  done,
}: {
  id: string;
  version: number;
  blocked: boolean;
  close: () => void;
  done: () => void;
}) {
  return (
    <Modal title={blocked ? 'Bỏ chặn trong Sakura' : 'Chặn khách trong Sakura'} close={close}>
      <p>
        Chặn trả lời từ Sakura và đưa hội thoại vào bộ lọc Đã chặn. Tin đến và lịch sử vẫn được lưu.
      </p>
      <Form
        label={blocked ? 'Bỏ chặn' : 'Chặn hội thoại'}
        done={done}
        submit={(f) =>
          api('/messenger/conversations/' + id + '/block', 'PATCH', {
            version,
            blocked: !blocked,
            reason: String(f.get('reason')),
          })
        }
      >
        <label>
          Lý do
          <textarea name="reason" required minLength={3} maxLength={500} />
        </label>
      </Form>
    </Modal>
  );
}
export function ConfirmationDialog({
  id,
  orderId,
  canSend,
  invoice = false,
  close,
  done,
}: {
  id: string;
  orderId: string;
  canSend: boolean;
  invoice?: boolean;
  close: () => void;
  done: () => void;
}) {
  const r = useResource<{ text: string; orderId: string; orderVersion: number }>(
    '/messenger/conversations/' + id + (invoice ? '/invoice/' : '/confirmation/') + orderId,
  );
  const [requestKey] = useState(() => crypto.randomUUID()),
    [result, setResult] = useState('');
  return (
    <Modal title={invoice ? 'Gửi hóa đơn bán hàng' : 'Gửi xác nhận đơn cho khách'} close={close}>
      <State loading={r.loading} error={r.error} />
      {r.data && (
        <>
          <p>
            Nội dung dưới đây sẽ được gửi thành tin nhắn Messenger. Chỉ bấm gửi sau khi kiểm tra lại
            người nhận và đơn hàng.
          </p>
          <pre className="confirmation-preview">{r.data.text}</pre>
          {result ? (
            <p role="status">{result}</p>
          ) : canSend ? (
            <Form
              label={invoice ? 'Gửi hóa đơn qua Messenger' : 'Gửi xác nhận cho khách'}
              done={done}
              submit={async () => {
                const m = await api<{ state: string }>(
                  '/messenger/conversations/' + id + '/reply',
                  'POST',
                  {
                    requestKey,
                    orderId: r.data!.orderId,
                    orderVersion: r.data!.orderVersion,
                    ...(invoice ? { orderDocument: 'INVOICE' } : {}),
                  },
                );
                if (m.state !== 'SENT') {
                  setResult(
                    m.state === 'FAILED'
                      ? 'Gửi thất bại. Đóng hộp thoại để kiểm tra lịch sử.'
                      : 'Chưa rõ kết quả. Đối chiếu trên Fanpage trước khi gửi tiếp.',
                  );
                  throw new Error('Nội dung đã được ghi nhận vào lịch sử gửi.');
                }
              }}
            >
              <span>Không tự đánh dấu khách đã nhận hoặc đã thanh toán.</span>
            </Form>
          ) : (
            <p className="note">
              Hiện chưa thể gửi. Kiểm tra kết nối, thời hạn trả lời và trạng thái chặn.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
