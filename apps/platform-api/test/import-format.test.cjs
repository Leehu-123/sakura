const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, mapCsv, sourceDate } = require('../dist/imports/format');
test('CSV đọc BOM, dấu phẩy trong ô, dấu nháy và xuống dòng trong ô', () => {
  const r = parseCsv('\ufeffname,address\r\n"Hoa ""Sakura""","12, Hà Nội\nTầng 2"\r\n');
  assert.deepEqual(r.headers, ['name', 'address']);
  assert.deepEqual(r.rows, [['Hoa "Sakura"', '12, Hà Nội\nTầng 2']]);
});
test('CSV đọc dấu chấm phẩy và tab', () => {
  assert.deepEqual(parseCsv('a;b\n1;2').rows, [['1', '2']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2').rows, [['1', '2']]);
});
test('CSV chặn ngoặc kép sai, tiêu đề trùng/trống và số cột lệch', () => {
  for (const c of [
    'a,b\n"broken,x',
    'a,b\n"x"trailing,y',
    'a,b\nx"bad,y',
    'a,a\n1,2',
    ',b\n1,2',
    'a,b\n1,2,3',
    'a,b\n1',
  ])
    assert.throws(() => parseCsv(c));
});
test('CSV giới hạn dung lượng, số dòng, độ dài ô và mã hóa', () => {
  assert.throws(() => parseCsv('a,b\n' + '1,2\n'.repeat(201)));
  assert.throws(() => parseCsv('a,b\n' + 'x'.repeat(2001) + ',2'));
  assert.throws(() => parseCsv('a,b\n' + 'x'.repeat(512001)));
  assert.throws(() => parseCsv('a,b\n\ufffd,1'));
  assert.throws(() => parseCsv('a,b\n\0,1'));
  assert.equal(parseCsv('a,b\n' + '1,2\n'.repeat(200)).rows.length, 200);
});
test('Ánh xạ chặn thiếu trường, cột lạ, cột lặp và kiểu sai', () => {
  const good = { externalId: 'id', name: 'name', phone: 'phone', ownerEmail: 'owner' };
  const content = 'id,name,phone,owner\n1,Hoa,0912345678,sale@example.test';
  assert.equal(mapCsv('CUSTOMERS', content, good)[0].data.externalId, '1');
  for (const m of [
    { ...good, ownerEmail: '' },
    { ...good, ownerEmail: 'missing' },
    { ...good, ownerEmail: 'name' },
    { ...good, evil: 'owner' },
    { ...good, phone: 42 },
  ])
    assert.throws(() => mapCsv('CUSTOMERS', content, m));
});
test('Ngày nguồn không đoán múi giờ, kiểm tra ngày lịch và năm nhuận', () => {
  assert.equal(sourceDate('2020-02-29'), '2020-02-28T17:00:00.000Z');
  assert.equal(sourceDate('2020-02-29T09:30:00+07:00'), '2020-02-29T02:30:00.000Z');
  for (const v of [
    '29/02/2020',
    '2026-02-29',
    '2026-01-01T09:00:00',
    '2026-01-01T24:00:00Z',
    '2026-13-01',
    '2026-01-01T12:00:00+99:00',
  ])
    assert.throws(() => sourceDate(v));
});
test('CSV giữ công thức là văn bản, không thực thi hay đổi nội dung', () => {
  assert.equal(
    parseCsv('a,b\n"=HYPERLINK(""https://example.test"")",2').rows[0][0],
    '=HYPERLINK("https://example.test")',
  );
});

test('Chữ ký không thay đổi khi JSONB đổi thứ tự khóa', () => {
  const { digest } = require('../dist/imports/planner');
  assert.equal(digest({ a: 1, b: { y: 2, x: 1 } }), digest({ b: { x: 1, y: 2 }, a: 1 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
});
