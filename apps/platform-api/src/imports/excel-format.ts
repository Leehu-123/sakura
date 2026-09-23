import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Kind } from './format';

export const excelHeaders = {
  CUSTOMERS: [
    'Id khách hàng',
    'First Name(Tên)',
    'Last Name(Họ)',
    'Email',
    'Phone(Liên hệ)',
    'Company(Đơn vị)',
    'Address1(Địa chỉ mặc định 1)',
    'Address2(Địa chỉ mặc định 2)',
    'City(Thành phố)',
    'Province(Tỉnh)',
    'Province Code(Mã vùng)',
    'District(Quận Huyện)',
    'District Code(Mã Quận Huyện)',
    'Ward(Phường Xã)',
    'Ward Code(Mã Phường Xã)',
    'Country(Quốc gia)',
    'Country Code(Mã quốc gia)',
    'Zip',
    'Phone(Địa chỉ điện thoại)',
    'Accepts Marketing(Nhận quảng cáo)',
    'Tags',
    'Note(Ghi chú)',
    'Giới tính',
    'Ngày sinh',
    'Total Spent(Tổng chi tiêu)',
    'Total Orders(Tổng đơn hàng)',
    'Created On(Ngày tạo)',
  ],
  PRODUCTS: [
    'Đường dẫn/Alias',
    'Tên sản phẩm*',
    'Thuộc tính 1',
    'Giá trị thuộc tính 1',
    'Thuộc tính 2',
    'Giá trị thuộc tính 2',
    'Thuộc tính 3',
    'Giá trị thuộc tính 3',
    'Mã SKU',
    'Barcode',
    'Đơn vị tính',
    'Nhãn hiệu',
    'Loại sản phẩm',
    'Tags',
    'Yêu cầu vận chuyển',
    'Hiển thị*',
    'Áp dụng thuế',
    'Ảnh đại diện',
    'Chú thích ảnh',
    'Thẻ tiêu đề(SEO Title)',
    'Thẻ mô tả(SEO Description)',
    'Mô tả sản phẩm',
    'Mô tả ngắn',
    'Nhóm ngành nghề tính thuế GTGT, TNCN',
    'Quản lý kho',
    'Cho phép tiếp tục mua khi hết hàng',
    'Khối lượng',
    'Đơn vị khối lượng',
    'Ảnh phiên bản',
    'Giá',
    'Giá so sánh',
    'Giá vốn',
    ...Array.from({ length: 10 }, (_, i) => '__extra_' + i),
    'Id sản phẩm',
    'Id phiên bản',
  ],
  ORDERS: [
    'STT',
    'Mã đơn hàng',
    'Ngày đặt hàng',
    'Chi nhánh',
    'Nguồn',
    'Nhân viên tạo đơn',
    'Trạng thái đơn hàng',
    'Tên khách hàng',
    'Email',
    'Số điện thoại',
    'Tên sản phẩm',
    'Mã SKU',
    'Số lượng sản phẩm',
    'Giá sản phẩm',
    'Tổng số lượng sản phẩm',
    'Tổng tiền',
    'Ghi chú',
    'Tags',
  ],
};
export type NativeRow = {
  externalId: string;
  productExternalId?: string;
  customerExternalId?: string | null;
  data: any;
};
export type ExcelSource = {
  format: 'SAPO_EXCEL_V2';
  kind: Kind;
  sheet: string;
  rowCount: number;
  sha256: string;
  customers: NativeRow[];
  products: NativeRow[];
  variants: NativeRow[];
  orders: NativeRow[];
};

export function prepareExcel(
  rows: any[][],
  sheet: string,
  fileName: string,
  sha256: string,
): ExcelSource {
  const at = rows[0]?.includes('Id khách hàng') || rows[0]?.includes('Đường dẫn/Alias') ? 0 : 4;
  const headers = (rows[at] || []).map((v) => String(v ?? '').trim());
  const kind: Kind = headers.includes('Id khách hàng')
    ? 'CUSTOMERS'
    : headers.includes('Đường dẫn/Alias')
      ? 'PRODUCTS'
      : 'ORDERS';
  const wanted = excelHeaders[kind];
  const required = kind === 'PRODUCTS' ? wanted.filter((h) => !h.startsWith('__extra_')) : wanted;
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length)
    throw Error('Không đúng mẫu Excel Sapo. Thiếu cột: ' + missing.slice(0, 5).join(', '));
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length)
    throw Error('Tiêu đề cột bị trùng.');
  if (rows.length <= at + 1) throw Error('File không có dòng dữ liệu.');
  const converted = rows.slice(at + 1).map((r) => wanted.map((h) => r[headers.indexOf(h)] ?? null));
  const files = (['CUSTOMERS', 'PRODUCTS', 'ORDERS'] as Kind[]).map((k) => ({
    file:
      (k === 'CUSTOMERS' ? 'customers_' : k === 'PRODUCTS' ? 'products_' : 'order_') +
      'upload.xlsx',
    sha256,
    sheets: [
      {
        sheet,
        rows: [
          ...(k === 'ORDERS' ? [[], [], [], []] : []),
          excelHeaders[k],
          ...(k === kind ? converted : []),
        ],
      },
    ],
  }));
  // Reuse the previously validated Sapo business conversion, with columns located by name.
  const { prepare } = require(resolve(__dirname, '../../../../scripts/sapo-native.cjs'));
  const p = prepare(files);
  const rawRow = (line: number) => ({
    file: fileName,
    sha256,
    sheet,
    row: line,
    values: Object.fromEntries(headers.map((h, i) => [h, rows[line - 1]?.[i] ?? null])),
  });
  for (const entry of [...p.customers, ...p.products, ...p.variants, ...p.orders]) {
    const src = entry.data.sourceData;
    entry.data.sourceData = src.rows
      ? { ...src, file: fileName, sha256, sheet, rows: src.rows.map((r: any) => rawRow(r.row)) }
      : { ...src, ...rawRow(src.row) };
  }
  return {
    format: 'SAPO_EXCEL_V2',
    kind,
    sheet,
    sha256,
    rowCount: converted.length,
    customers: p.customers,
    products: p.products,
    variants: p.variants,
    orders: p.orders,
  };
}

// Source comparison excludes filename, file hash and row positions. Re-exporting the same
// records must not overwrite live edits, assignments or create duplicate Sapo records.
export function sourceValues(source: any): unknown {
  const clean = (v: any): any =>
    Array.isArray(v)
      ? v.map(clean)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]))
        : v === null || v === undefined
          ? ''
          : String(v).trim();
  return source?.rows
    ? source.rows.map((r: any) => clean(r.values))
    : source?.values
      ? clean(source.values)
      : null;
}

export function fileHash(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
