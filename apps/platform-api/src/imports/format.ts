import { BadRequestException } from '@nestjs/common';
export const kinds = ['CUSTOMERS', 'PRODUCTS', 'ORDERS'] as const;
export type Kind = (typeof kinds)[number];
export type Field = { key: string; label: string; required: boolean };
const f = (key: string, label: string, required = true): Field => ({ key, label, required });
export const fields: Record<Kind, Field[]> = {
  CUSTOMERS: [
    f('externalId', 'Mã khách Sapo'),
    f('name', 'Tên khách'),
    f('phone', 'Điện thoại'),
    f('address', 'Địa chỉ', false),
    f('ownerEmail', 'Email Sale phụ trách'),
    f('regionCode', 'Mã khu vực (NORTH/SOUTH)', false),
  ],
  PRODUCTS: [
    f('externalId', 'Mã biến thể Sapo'),
    f('productId', 'Mã sản phẩm Sapo'),
    f('productName', 'Tên sản phẩm'),
    f('sku', 'SKU'),
    f('variantName', 'Tên biến thể'),
    f('unit', 'Đơn vị'),
    f('price', 'Giá bán (đồng)'),
    f('category', 'Nhóm sản phẩm', false),
  ],
  ORDERS: [
    f('externalId', 'Mã đơn Sapo'),
    f('number', 'Số đơn'),
    f('customerId', 'Mã khách Sapo'),
    f('orderedAt', 'Ngày tạo (ISO có múi giờ)'),
    f('sourceStatus', 'Trạng thái đơn gốc'),
    f('sourcePaymentStatus', 'Trạng thái thanh toán gốc'),
    f('sourceShippingStatus', 'Trạng thái giao hàng gốc'),
    f('sourceClosedBy', 'Người chốt gốc', false),
    f('recipientName', 'Người nhận'),
    f('recipientPhone', 'Điện thoại nhận'),
    f('shippingAddress', 'Địa chỉ giao'),
    f('sku', 'SKU dòng hàng'),
    f('productName', 'Tên hàng tại lúc bán'),
    f('unit', 'Đơn vị'),
    f('quantity', 'Số lượng'),
    f('unitPrice', 'Đơn giá gốc (đồng)'),
    f('lineTotal', 'Thành tiền dòng (đồng)'),
    f('subtotal', 'Tổng tiền hàng (đồng)'),
    f('discount', 'Giảm giá đơn (đồng)'),
    f('shippingFee', 'Phí giao hàng (đồng)'),
    f('total', 'Tổng đơn (đồng)'),
    f('paidAmount', 'Đã thanh toán (đồng)'),
  ],
};
export type SourceRow = { line: number; data: Record<string, string> };
/** Strict quoted CSV; never evaluates spreadsheet formulas. A record number may span physical lines. */
export function parseCsv(content: string) {
  if (
    Buffer.byteLength(content, 'utf8') > 512000 ||
    content.includes('\0') ||
    content.includes('\ufffd')
  )
    throw new BadRequestException('File phải là CSV UTF-8, tối đa 500 KB.');
  const input = content.replace(/^\uFEFF/, '');
  const candidates = [',', ';', '\t'];
  function parse(delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false,
      after = false,
      start = true;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (quoted) {
        if (c === '"') {
          if (input[i + 1] === '"') {
            value += '"';
            i++;
          } else {
            quoted = false;
            after = true;
          }
        } else value += c;
        continue;
      }
      if (c === delimiter) {
        row.push(value.trim());
        value = '';
        after = false;
        start = true;
        continue;
      }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && input[i + 1] === '\n') i++;
        row.push(value.trim());
        if (row.some((v) => v)) rows.push(row);
        row = [];
        value = '';
        after = false;
        start = true;
        continue;
      }
      if (after) throw new Error('Có ký tự sau dấu đóng ngoặc kép.');
      if (c === '"') {
        if (!start) throw new Error('Dấu ngoặc kép sai vị trí.');
        quoted = true;
        start = false;
      } else {
        value += c;
        start = false;
      }
    }
    if (quoted) throw new Error('Thiếu dấu đóng ngoặc kép.');
    row.push(value.trim());
    if (row.some((v) => v)) rows.push(row);
    return rows;
  }
  const valid: string[][][] = [];
  for (const d of candidates) {
    try {
      const r = parse(d);
      if (r[0]?.length > 1 && r.every((x) => x.length === r[0].length)) valid.push(r);
    } catch {}
  }
  if (valid.length !== 1)
    throw new BadRequestException(
      'Không đọc được cột CSV. Dùng dấu phẩy, chấm phẩy hoặc tab; kiểm tra ngoặc kép và số cột.',
    );
  const [headers, ...rows] = valid[0];
  if (
    headers.length > 60 ||
    headers.some((h) => !h || h.length > 150) ||
    new Set(headers).size !== headers.length
  )
    throw new BadRequestException('Tiêu đề phải duy nhất, không trống; tối đa 60 cột.');
  if (rows.length < 1 || rows.length > 200)
    throw new BadRequestException('Mỗi file cần từ 1 đến 200 dòng dữ liệu.');
  if (rows.some((r) => r.some((v) => v.length > 2000)))
    throw new BadRequestException('Mỗi ô tối đa 2.000 ký tự.');
  return { headers, rows };
}
export function mapCsv(kind: Kind, content: string, mapping: Record<string, unknown>): SourceRow[] {
  const { headers, rows } = parseCsv(content);
  if (Object.keys(mapping).some((k) => !fields[kind].some((f) => f.key === k)))
    throw new BadRequestException('Ánh xạ có trường không hợp lệ.');
  for (const field of fields[kind]) {
    const column = mapping[field.key];
    if (
      (field.required && !column) ||
      (column !== undefined &&
        column !== '' &&
        (typeof column !== 'string' || !headers.includes(column)))
    )
      throw new BadRequestException('Chọn cột cho: ' + field.label);
  }
  const used = Object.values(mapping).filter(Boolean);
  if (new Set(used).size !== used.length)
    throw new BadRequestException('Mỗi cột chỉ ánh xạ vào một trường.');
  return rows.map((r, i) => ({
    line: i + 2,
    data: Object.fromEntries(
      fields[kind].map((f) => [
        f.key,
        mapping[f.key] ? r[headers.indexOf(mapping[f.key] as string)] : '',
      ]),
    ),
  }));
}
export class RowError extends Error {}
export function requireValue(data: Record<string, string>, key: string, max = 200, label = key) {
  const v = data[key] || '';
  if (!v || v.length > max) throw new RowError(label + ' trống hoặc quá dài (tối đa ' + max + ').');
  return v;
}
export function integer(value: string, label: string, max = 999999999999999n) {
  if (!/^\d{1,15}$/.test(value) || BigInt(value) > max)
    throw new RowError(label + ': dùng số nguyên không âm, không dấu phân cách.');
  return BigInt(value);
}
export function sourceDate(v: string) {
  // Explicit offset avoids guessing the source timezone; date-only is documented as midnight Vietnam.
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00+07:00' : v;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-](\d{2}):(\d{2}))$/);
  if (!m)
    throw new RowError(
      'Ngày tạo cần YYYY-MM-DD hoặc ISO có múi giờ, ví dụ 2026-09-08T09:00:00+07:00.',
    );
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number);
  if (
    y < 1900 ||
    y > 2100 ||
    mo < 1 ||
    mo > 12 ||
    d < 1 ||
    d > new Date(Date.UTC(y, mo, 0)).getUTCDate() ||
    h > 23 ||
    mi > 59 ||
    se > 59 ||
    (m[8] && Number(m[8]) > 14) ||
    (m[9] && Number(m[9]) > 59)
  )
    throw new RowError('Ngày tạo không hợp lệ.');
  return new Date(s).toISOString();
}
