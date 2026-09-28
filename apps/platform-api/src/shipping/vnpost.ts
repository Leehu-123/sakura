import { Injectable, BadGatewayException, BadRequestException } from '@nestjs/common';
import { ShippingStatus } from '@sakura/database';

// MyVNPost customer API, documented at https://my-uat.vnpost.vn/static/.
// totalFee is explicitly provisional, including VAT; it is NOT a paid expense.
export const vnpostStatuses: Record<string, string> = {
  '0': 'Lưu nháp',
  '1': 'Đã tạo',
  '2': 'Bưu tá nhận yêu cầu thu gom',
  '3': 'Chờ xác nhận',
  '4': 'Đang lấy hàng',
  '5': 'Lấy hàng không thành công',
  '6': 'Đã lấy hàng',
  '7': 'Bưu cục đã nhận hàng',
  '8': 'Lấy hàng thất bại',
  '9': 'Hủy thu gom',
  '10': 'Đang vận chuyển',
  '11': 'Đã đến bưu cục phát',
  '12': 'Đang giao hàng',
  '13': 'Chuyển tiếp',
  '14': 'Đã giao hàng',
  '15': 'Giao không thành công',
  '16': 'Chờ để chuyển hoàn',
  '17': 'Đã duyệt hoàn',
  '18': 'Bắt đầu chuyển hoàn',
  '19': 'Trả hàng thành công',
  '20': 'Đã trả hàng một phần',
  '21': 'Đã trả tiền COD',
  '22': 'Hủy giao hàng',
  '23': 'Giao hàng thành công một phần',
  '24': 'Đang chuyển hoàn',
  '28': 'Đã trả phí ship',
  '29': 'Đã trả phí hủy đơn hàng',
};
const mappings: Record<string, ShippingStatus> = {
  '1': 'WAITING_PICKUP',
  '2': 'WAITING_PICKUP',
  '3': 'WAITING_PICKUP',
  '4': 'WAITING_PICKUP',
  '5': 'WAITING_PICKUP',
  '8': 'WAITING_PICKUP',
  '6': 'PICKED_UP',
  '7': 'PICKED_UP',
  '9': 'CANCELLED',
  '10': 'IN_TRANSIT',
  '11': 'IN_TRANSIT',
  '12': 'IN_TRANSIT',
  '13': 'IN_TRANSIT',
  '14': 'DELIVERED',
  '15': 'IN_TRANSIT',
  '19': 'RETURNED',
  '22': 'CANCELLED',
};
export const isVnpost = (name: string) =>
  /^(vnpost|vietnam\s*post|bưu điện việt nam)$/i.test(name.trim());
export function vnpostDate(value: unknown): Date {
  if (typeof value !== 'string')
    throw new BadGatewayException('VNPost chưa trả thời điểm cập nhật hợp lệ.');
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.exec(value);
  const parts = dmy ? [dmy[3], dmy[2], dmy[1], ...dmy.slice(4)] : iso?.slice(1);
  if (!parts) throw new BadGatewayException('VNPost trả ngày cập nhật không đúng định dạng.');
  const text = `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}`;
  const date = new Date(text + '+07:00');
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 19) !== text
  )
    throw new BadGatewayException('VNPost trả ngày cập nhật không hợp lệ.');
  return date;
}
export function parseVnpost(body: unknown, tracking: string, customerCode: string) {
  const obj = Array.isArray(body) && body.length === 1 ? body[0] : body;
  const rows = obj && typeof obj === 'object' ? (obj as { results?: unknown }).results : null;
  if (!Array.isArray(rows))
    throw new BadGatewayException('VNPost trả dữ liệu không đúng định dạng.');
  const matches = rows.filter(
    (r) =>
      r &&
      typeof r === 'object' &&
      (r.itemCode === tracking || r.originalItemCode === tracking) &&
      r.senderCode === customerCode,
  );
  if (matches.length !== 1)
    throw new BadGatewayException(
      'Không tìm thấy duy nhất vận đơn thuộc mã khách hàng VNPost này.',
    );
  const r = matches[0];
  if (!['string', 'number'].includes(typeof r.status) || !/^-?\d{1,4}$/.test(String(r.status)))
    throw new BadGatewayException('VNPost chưa trả trạng thái hợp lệ.');
  const statusCode = String(r.status);
  let fee: string | null = null;
  if (r.totalFee !== null && r.totalFee !== undefined) {
    if (
      !['string', 'number'].includes(typeof r.totalFee) ||
      !/^\d{1,12}(\.0+)?$/.test(String(r.totalFee))
    )
      throw new BadGatewayException('Cước VNPost không hợp lệ.');
    fee = String(r.totalFee).split('.')[0];
  }
  return {
    statusCode,
    statusLabel: vnpostStatuses[statusCode] || `Trạng thái VNPost ${statusCode}`,
    shippingStatus: mappings[statusCode],
    fee,
    updatedAt: vnpostDate(r.updatedDate),
  };
}
export type VnpostSnapshot = ReturnType<typeof parseVnpost>;
@Injectable()
export class VnpostGateway {
  private async call(environment: string, path: string, token?: string, body?: unknown) {
    const base =
      environment === 'UAT' ? 'https://my-uat.vnpost.vn/MYVNP_API' : 'https://connect-my.vnpost.vn';
    try {
      const response = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json',
          ...(token ? { token } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status === 401 || response.status === 403)
        throw new BadGatewayException(
          'VNPost từ chối xác thực. Kết nối lại tại Cài đặt → Vận chuyển.',
        );
      if (response.status === 429)
        throw new BadGatewayException('VNPost đang giới hạn truy cập. Vui lòng thử lại sau.');
      if (!response.ok)
        throw new BadGatewayException('VNPost chưa xử lý được yêu cầu. Vui lòng thử lại sau.');
      const reader = response.body?.getReader();
      if (!reader) throw Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw Error();
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;
      throw new BadGatewayException('Không đọc được phản hồi VNPost. Kiểm tra kết nối và thử lại.');
    }
  }
  async login(environment: string, username: string, password: string, customerCode: string) {
    const r = await this.call(environment, '/GetAccessToken', undefined, {
      username,
      password,
      customerCode,
    });
    if (
      r?.success !== true ||
      typeof r.token !== 'string' ||
      r.token.length < 10 ||
      r.token.length > 4000 ||
      /[\r\n]/.test(r.token)
    )
      throw new BadRequestException(
        'VNPost chưa cấp mã truy cập. Kiểm tra tài khoản, mật khẩu và mã khách hàng CMS.',
      );
    return r.token as string;
  }
  async track(environment: string, token: string, tracking: string, customerCode: string) {
    return parseVnpost(
      await this.call(environment, '/getOrder?type=1&code=' + encodeURIComponent(tracking), token),
      tracking,
      customerCode,
    );
  }
}
