import { useEffect, useState } from 'react';
import { api } from '../api';
import { Customer } from '../sales/types';
import { Form, Modal, State, useResource } from '../sales/shared';
export type ContactHints = {
  names: string[];
  phones: string[];
  addresses: string[];
  matches: { id: string; name: string; phone: string }[];
  addressSuggestion: {
    normalized: string;
    options: { address: string; label: string; code: number }[];
    note: string;
  };
};
export function ContactEditor({
  id,
  version,
  customer,
  hints,
  suggested,
  forOrder,
  close,
  done,
}: {
  id: string;
  version: number;
  customer?: Customer;
  hints?: ContactHints;
  suggested: boolean;
  forOrder?: boolean;
  close: () => void;
  done: () => void;
}) {
  const [name, setName] = useState((suggested ? hints?.names[0] : '') || customer?.name || ''),
    [phone, setPhone] = useState((suggested ? hints?.phones[0] : '') || customer?.phone || ''),
    [address, setAddress] = useState(
      (suggested ? hints?.addresses[0] : '') || customer?.address || '',
    ),
    [query, setQuery] = useState(address);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(address), 400);
    return () => clearTimeout(timer);
  }, [address]);
  const r = useResource<ContactHints>(
    '/messenger/conversations/' + id + '/contact-suggestions?address=' + encodeURIComponent(query),
  );
  return (
    <Modal
      title={
        customer
          ? 'Cập nhật thông tin khách'
          : forOrder
            ? 'Thông tin khách để tạo đơn'
            : 'Tạo hồ sơ từ hội thoại'
      }
      close={close}
    >
      <p className="muted">
        Kiểm tra thông tin lấy từ tin nhắn trước khi lưu. Tên Facebook có thể khác tên người nhận
        hàng.
      </p>
      <Form
        label={forOrder ? 'Lưu và tiếp tục tạo đơn' : 'Lưu thông tin khách'}
        done={done}
        submit={() =>
          customer
            ? api('/sales/customers/' + customer.id, 'PATCH', {
                name,
                phone,
                address,
                version: customer.version,
                status: customer.status,
                regionId: customer.regionId || null,
              })
            : api('/messenger/conversations/' + id + '/customer', 'POST', {
                name,
                phone,
                address,
                conversationVersion: version,
              })
        }
      >
        <label>
          Tên người nhận
          <input
            required
            minLength={2}
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Số điện thoại
          <input
            required
            type="tel"
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        {(hints?.phones.length || 0) > 1 && (
          <div className="contact-choices">
            {hints!.phones.map((p) => (
              <button type="button" className="secondary" key={p} onClick={() => setPhone(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
        <label>
          Địa chỉ giao hàng
          <textarea
            required={forOrder}
            maxLength={1000}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        {(hints?.addresses.length || 0) > 1 && (
          <label>
            Địa chỉ khác trong tin nhắn
            <select value="" onChange={(e) => setAddress(e.target.value)}>
              <option value="">Chọn thông tin khách đã xác nhận</option>
              {hints!.addresses.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        )}
        <div className="address-suggestions">
          <strong>Gợi ý địa chỉ</strong>
          <State loading={r.loading} error={r.error} />
          {r.data && (
            <>
              <p>{r.data.addressSuggestion.note}</p>
              {r.data.addressSuggestion.options.map((o) => (
                <button
                  type="button"
                  className="address-choice"
                  key={o.code}
                  onClick={() => setAddress(o.address)}
                >
                  {o.address}
                </button>
              ))}
              <small>
                Đối chiếu danh mục tỉnh/phường 23/09/2026; chưa xác minh số nhà hoặc khả năng giao
                hàng.
              </small>
            </>
          )}
        </div>
      </Form>
    </Modal>
  );
}
