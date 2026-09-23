import { useState } from 'react';
import { api } from '../api';
import { Form, Modal, Pager, SearchBox, State, useResource } from '../sales/shared';
import { Customer, Page } from '../sales/types';
export type Template = {
  id: string;
  title: string;
  text: string;
  version: number;
  isActive: boolean;
};
export function LinkCustomer({
  id,
  version,
  close,
  done,
}: {
  id: string;
  version: number;
  close: () => void;
  done: () => void;
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState('');
  const result = useResource<Page<Customer>>(
    '/sales/customers?search=' + encodeURIComponent(search) + '&page=' + page,
  );
  return (
    <Modal title="Gắn hội thoại với khách hàng" close={close}>
      <p>
        Đối chiếu đúng khách trước khi gắn. Toàn bộ hội thoại sẽ đi theo người chăm sóc khách này.
      </p>
      <SearchBox
        placeholder="Tìm khách theo tên hoặc điện thoại…"
        onSearch={(s) => {
          setSearch(s);
          setPage(1);
          setSelected('');
        }}
      />
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <Form
          label="Xác nhận gắn khách"
          done={done}
          submit={() => {
            if (!selected) throw new Error('Chọn khách cần gắn.');
            return api('/messenger/conversations/' + id + '/link', 'POST', {
              version,
              customerId: selected,
            });
          }}
        >
          <label>
            Khách hàng
            <select required value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Chọn khách đã đối chiếu</option>
              {result.data.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </select>
          </label>
          <Pager
            data={result.data}
            page={page}
            setPage={(p) => {
              setPage(p);
              setSelected('');
            }}
          />
        </Form>
      )}
      <p className="muted">
        Khách mới: tạo hồ sơ ở mục Khách hàng trước, rồi quay lại gắn hội thoại.
      </p>
    </Modal>
  );
}
export function ConfirmSuggestion({
  customerId,
  field,
  value,
  close,
  done,
}: {
  customerId: string;
  field: 'phone' | 'address';
  value: string;
  close: () => void;
  done: () => void;
}) {
  const result = useResource<Customer>('/sales/customers/' + customerId);
  return (
    <Modal title="Đối chiếu thông tin khách" close={close}>
      <State loading={result.loading} error={result.error} />
      {result.data && (
        <Form
          label="Xác nhận cập nhật hồ sơ"
          done={done}
          submit={(f) => {
            const c = result.data!;
            return api('/sales/customers/' + customerId, 'PATCH', {
              name: c.name,
              phone: field === 'phone' ? f.get('value') : c.phone,
              address: field === 'address' ? f.get('value') : c.address,
              status: c.status,
              regionId: c.regionId || null,
              version: c.version,
            });
          }}
        >
          <p>
            Khách: <strong>{result.data.name}</strong>
          </p>
          <p>Đang lưu: {result.data[field] || 'Chưa có'}</p>
          <label>
            {field === 'phone' ? 'Số điện thoại đã xác nhận' : 'Địa chỉ đã xác nhận'}
            <textarea
              name="value"
              required
              maxLength={field === 'phone' ? 30 : 1000}
              defaultValue={value}
            />
          </label>
          <p className="muted">
            Thông tin được trích từ tin nhắn, có thể chưa đầy đủ. Chỉ lưu sau khi đã đối chiếu với
            khách.
          </p>
        </Form>
      )}
    </Modal>
  );
}
export function EditTemplate({
  template,
  close,
  done,
}: {
  template?: Template;
  close: () => void;
  done: () => void;
}) {
  return (
    <Modal title={template ? 'Sửa mẫu trả lời' : 'Thêm mẫu trả lời'} close={close}>
      <Form
        done={done}
        submit={(f) =>
          api(
            '/messenger/templates' + (template ? '/' + template.id : ''),
            template ? 'PATCH' : 'POST',
            {
              title: f.get('title'),
              text: f.get('text'),
              ...(template
                ? { version: template.version, isActive: f.get('active') === 'on' }
                : {}),
            },
          )
        }
      >
        <label>
          Tên mẫu
          <input
            name="title"
            minLength={2}
            maxLength={80}
            required
            defaultValue={template?.title}
          />
        </label>
        <label>
          Nội dung
          <textarea name="text" required maxLength={2000} defaultValue={template?.text} />
        </label>
        {template && (
          <label className="import-confirm">
            <input name="active" type="checkbox" defaultChecked={template.isActive} /> Đang sử dụng
          </label>
        )}
      </Form>
    </Modal>
  );
}
export function ResolveMessage({
  conversationId,
  messageId,
  close,
  done,
}: {
  conversationId: string;
  messageId: string;
  close: () => void;
  done: () => void;
}) {
  return (
    <Modal title="Đối chiếu kết quả trên Fanpage" close={close}>
      <p>
        Mở hội thoại tương ứng trong Meta Business Suite và kiểm tra tin nhắn trước khi ghi nhận.
      </p>
      <Form
        label="Lưu kết quả đối chiếu"
        done={done}
        submit={(f) =>
          api(
            '/messenger/conversations/' + conversationId + '/messages/' + messageId + '/resolve',
            'POST',
            { state: f.get('state'), reason: f.get('reason') },
          )
        }
      >
        <label>
          Kết quả
          <select name="state" required defaultValue="">
            <option value="" disabled>
              Chọn sau khi kiểm tra
            </option>
            <option value="SENT">Đã thấy tin được gửi trên Fanpage</option>
            <option value="FAILED">Đã xác nhận tin chưa được gửi</option>
          </select>
        </label>
        <label>
          Ghi chú đối chiếu
          <textarea name="reason" required minLength={5} maxLength={500} />
        </label>
      </Form>
    </Modal>
  );
}
