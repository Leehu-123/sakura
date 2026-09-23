import { useState, useRef } from 'react';
import { printSlip } from './printSlip';
import logo from '@sakura/brand/logo.jpg';
import { api } from '../api';
import {
  Actor,
  Customer,
  Order,
  Page,
  has,
  money,
  date,
  number,
  orderStatuses,
  paymentStatuses,
} from '../sales/types';
import { State, useResource, Form, Modal, Pager } from '../sales/shared';
import { CreateOrder, OrderDetail } from '../sales/Orders';
import { ConfirmationDialog } from './WorkspaceTools';
export function DeliveryDialog({ order, close }: { order: Order; close: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  type Slip = {
    id: string;
    revision: number;
    createdAt: string;
    voidedAt: string | null;
    currentOrderStatus: string;
    currentOrderVersion: number;
    snapshot: Order;
  };
  const [slip, setSlip] = useState<Slip | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    setError('');
    try {
      setSlip(
        await api<Slip>('/sales/orders/' + order.id + '/delivery-slip', 'POST', {
          version: order.version,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function print() {
    setBusy(true);
    setError('');
    try {
      const current = await api<Slip>('/sales/orders/' + order.id + '/delivery-slip');
      if (current.voidedAt || current.currentOrderStatus === 'CANCELLED')
        throw new Error('Đơn đã hủy, phiếu không còn hiệu lực.');
      if (current.currentOrderVersion !== slip?.snapshot.version)
        throw new Error(
          'Đơn đã thay đổi sau lúc lập phiếu. Đóng phiếu, tải lại đơn rồi mở phiếu để cập nhật.',
        );
      if (!sheet.current) throw new Error('Không tìm thấy nội dung phiếu.');
      await printSlip(sheet.current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Phiếu giao hàng nội bộ" close={close}>
      <State loading={false} error={error} />
      {!slip ? (
        <>
          <p>
            Phiếu lấy thông tin từ đơn đã chốt. Thông tin vận chuyển được ghi nhận tại lúc lập
            phiếu; thao tác này không đăng ký vận đơn với hãng.
          </p>
          <button className="primary" disabled={busy} onClick={() => void create()}>
            {busy ? 'Đang tạo…' : 'Tạo / cập nhật phiếu giao'}
          </button>
        </>
      ) : (
        <>
          <div className="delivery-print" ref={sheet}>
            <img className="slip-logo" src={logo} alt="Sakura" />
            <h2>PHIẾU GIAO HÀNG NỘI BỘ</h2>
            <p>
              {number(slip.snapshot.number)} · {date(slip.createdAt)}
            </p>
            <small>
              Mã phiếu: {slip.id} · Lần {slip.revision}
            </small>
            <h3>{slip.snapshot.recipientName}</h3>
            <p>{slip.snapshot.recipientPhone}</p>
            <p>{slip.snapshot.shippingAddress}</p>
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Số lượng</th>
                  <th>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {slip.snapshot.items?.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.productName} · {i.variantName}
                      <br />
                      {i.sku}
                    </td>
                    <td>
                      {i.quantity} {i.unit}
                    </td>
                    <td>{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Tổng đơn: <strong>{money(slip.snapshot.total)}</strong>
            </p>
            <p>Đã thu tại lúc lập phiếu: {money(slip.snapshot.paidAmount)}</p>
            <p>
              Còn thanh toán tại lúc lập phiếu:{' '}
              {money(BigInt(slip.snapshot.total) - BigInt(slip.snapshot.paidAmount))}
            </p>
            <p>
              Đối tác vận chuyển: {slip.snapshot.carrierName || 'Chưa có'} · Mã vận đơn:{' '}
              {slip.snapshot.trackingCode || 'Chưa có'}
            </p>
            <p>{slip.snapshot.note}</p>
            <p>Phiếu nội bộ Sakura · Chưa phải vận đơn của hãng vận chuyển.</p>
            {(slip.voidedAt || slip.currentOrderStatus === 'CANCELLED') && (
              <strong>PHIẾU ĐÃ HỦY</strong>
            )}
          </div>
          <button
            className="primary"
            disabled={busy || !!slip.voidedAt}
            onClick={() => void print()}
          >
            Kiểm tra và in phiếu
          </button>
        </>
      )}
    </Modal>
  );
}
