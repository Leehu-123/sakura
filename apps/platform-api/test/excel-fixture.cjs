const ExcelJS = require('exceljs');
const { excelHeaders } = require('../dist/imports/excel-format');
async function workbook(kind, records, change) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Dữ liệu');
  if (kind === 'ORDERS') for (let i = 0; i < 4; i++) sheet.addRow([]);
  sheet.addRow(excelHeaders[kind]);
  for (const record of records) sheet.addRow(excelHeaders[kind].map((h) => record[h] ?? null));
  if (change) change(book, sheet);
  return Buffer.from(await book.xlsx.writeBuffer());
}
const customer = (id = 100, phone = '+84912345678') => ({
  'Id khách hàng': id,
  'First Name(Tên)': 'Khách thử',
  'Last Name(Họ)': 'Sakura',
  'Phone(Liên hệ)': phone,
});
const product = (id = 200, variant = 201) => ({
  'Đường dẫn/Alias': 'san-pham-thu',
  'Tên sản phẩm*': 'Sản phẩm thử',
  'Giá trị thuộc tính 1': 'Đỏ',
  'Mã SKU': 'THU-' + variant,
  'Đơn vị tính': 'Cuộn',
  Giá: '30,000',
  'Id sản phẩm': id,
  'Id phiên bản': variant,
  'Ảnh đại diện': 'https://bizweb.dktcdn.net/100/557/101/products/test.png',
});
const order = (id = 'TEST-300') => ({
  STT: 1,
  'Mã đơn hàng': id,
  'Ngày đặt hàng': '14/09/2026 10:30',
  'Trạng thái đơn hàng': 'Hoàn thành',
  'Tên khách hàng': 'Khách thử',
  'Số điện thoại': '+84912345678',
  'Tên sản phẩm': 'Sản phẩm thử',
  'Mã SKU': 'THU-201',
  'Số lượng sản phẩm': 1.5,
  'Giá sản phẩm': 30000,
  'Tổng số lượng sản phẩm': 1.5,
  'Tổng tiền': 40000,
});
module.exports = { workbook, customer, product, order };
