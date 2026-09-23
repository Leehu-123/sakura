import { parentPort, workerData } from 'node:worker_threads';
import ExcelJS from 'exceljs';
import { inflateRawSync } from 'node:zlib';
import { prepareExcel, fileHash } from './excel-format';

export function checkZip(buffer: Buffer) {
  if (
    buffer.length > 10 * 1024 * 1024 ||
    buffer.length < 22 ||
    buffer.readUInt32LE(0) !== 0x04034b50
  )
    throw Error('Chọn file .xlsx hợp lệ, tối đa 10 MB; không hỗ trợ XLS hoặc file có mật khẩu.');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (
      buffer.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + buffer.readUInt16LE(i + 20) === buffer.length
    ) {
      end = i;
      break;
    }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6))
    throw Error('Cấu trúc file Excel không được hỗ trợ.');
  const count = buffer.readUInt16LE(end + 10),
    size = buffer.readUInt32LE(end + 12);
  let offset = buffer.readUInt32LE(end + 16),
    expanded = 0;
  if (count > 1000 || offset + size !== end)
    throw Error('File Excel có quá nhiều thành phần hoặc bị hỏng.');
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw Error('File Excel bị hỏng.');
    const flags = buffer.readUInt16LE(offset + 8),
      method = buffer.readUInt16LE(offset + 10);
    expanded += buffer.readUInt32LE(offset + 24);
    const n = buffer.readUInt16LE(offset + 28),
      extra = buffer.readUInt16LE(offset + 30),
      comment = buffer.readUInt16LE(offset + 32);
    if (offset + 46 + n + extra + comment > end) throw Error('File Excel bị hỏng.');
    const name = buffer.subarray(offset + 46, offset + 46 + n).toString('utf8');
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      expanded > 100 * 1024 * 1024 ||
      names.has(name) ||
      name.includes('..') ||
      name.startsWith('/') ||
      name.includes('\\') ||
      /vbaProject|externalLinks|embeddings/i.test(name)
    )
      throw Error('File chứa nội dung không hỗ trợ hoặc vượt 100 MB sau giải nén.');
    names.add(name);
    offset += 46 + n + extra + comment;
    const central = offset - 46 - n - extra - comment;
    const local = buffer.readUInt32LE(central + 42),
      packed = buffer.readUInt32LE(central + 20),
      unpacked = buffer.readUInt32LE(central + 24);
    if (
      local + 30 > end ||
      buffer.readUInt32LE(local) !== 0x04034b50 ||
      buffer.readUInt16LE(local + 8) !== method
    )
      throw Error('File Excel bị hỏng.');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + packed > buffer.readUInt32LE(end + 16)) throw Error('File Excel bị hỏng.');
    // Verify actual expanded bytes before the workbook library allocates XML strings.
    const part = buffer.subarray(start, start + packed);
    const decoded = method === 0 ? part : inflateRawSync(part, { maxOutputLength: unpacked + 1 });
    if (
      decoded.length !== unpacked ||
      /<!DOCTYPE|<!ENTITY/i.test(decoded.subarray(0, 1024).toString())
    )
      throw Error('File Excel có nội dung XML không hợp lệ.');
  }
  if (offset !== end || !names.has('xl/workbook.xml')) throw Error('Không phải workbook XLSX.');
}
export async function parseExcel(buffer: Buffer, fileName: string) {
  checkZip(buffer);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as any, { ignoreNodes: ['drawing', 'picture', 'extLst'] });
  const sheets = book.worksheets.filter((s) => s.actualRowCount > 0);
  if (sheets.length !== 1) throw Error('Chọn file Sapo có đúng một trang dữ liệu.');
  const sheet = sheets[0];
  if (sheet.rowCount > 50005 || sheet.columnCount > 100)
    throw Error('Tối đa 50.000 dòng dữ liệu và 100 cột.');
  const rows: any[][] = [];
  let cells = 0;
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: any[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (++cells > 1500000) throw Error('File vượt 1.500.000 ô.');
      let value: any = cell.value;
      if (cell.type === ExcelJS.ValueType.Merge) value = null;
      if (value && typeof value === 'object') {
        if ('formula' in value || 'sharedFormula' in value || 'error' in value)
          throw Error(
            'Ô ' + cell.address + ' chứa công thức/lỗi. Hãy dùng bản xuất Sapo chỉ có giá trị.',
          );
        if (value instanceof Date) value = value.toISOString();
        else if ('richText' in value) value = value.richText.map((r: any) => r.text).join('');
        else if ('text' in value) value = value.text;
        else throw Error('Ô ' + cell.address + ' có kiểu dữ liệu chưa hỗ trợ.');
      }
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      )
        throw Error('Ô ' + cell.address + ' chứa số quá lớn; xuất cột mã dạng văn bản.');
      if (typeof value === 'string' && (value.length > 32000 || value.includes('\0')))
        throw Error('Ô ' + cell.address + ' vượt giới hạn nội dung.');
      values[col - 1] = value ?? null;
    });
    rows[row.number - 1] = values;
  });
  return prepareExcel(rows, sheet.name, fileName, fileHash(buffer));
}
if (parentPort)
  void parseExcel(Buffer.from(workerData.buffer), workerData.fileName)
    .then((value) => parentPort!.postMessage({ value }))
    .catch((e) => parentPort!.postMessage({ error: String(e.message).slice(0, 300) }));
