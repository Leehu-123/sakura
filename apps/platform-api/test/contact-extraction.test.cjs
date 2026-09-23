const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractContact, addressCandidates } = require('../dist/messenger/contact-extraction');
const { chatFile } = require('../dist/messenger/attachment-format');
test('Contact extraction finds separate phones, explicit recipient and address without colon', () => {
  const r = extractContact([
    '0388684946 - 0987654321',
    'Tên người nhận: Nguyễn Lan',
    'địa chỉ: 053 đường Ngô Quyền, phường Lào Cai',
  ]);
  assert.deepEqual(r.phones, ['0388684946', '0987654321']);
  assert.deepEqual(r.names, ['Nguyễn Lan']);
  assert.match(r.addresses[0], /053 đường/);
  assert.deepEqual(extractContact(['+84 388 684 946']).phones, ['0388684946']);
  assert.equal(extractContact(['mã đơn 1234567890123', 'shop ở phường nào?']).addresses.length, 0);
});
test('Address candidates keep house/street and do not invent missing administrative units', () => {
  const r = addressCandidates('053 đường Ngô Quyền, phường lào cai');
  assert.ok(
    r.options.some((o) => o.address === '053 đường Ngô Quyền, Phường Lào Cai, Tỉnh Lào Cai'),
  );
  assert.deepEqual(addressCandidates('12 đường Hoa chưa rõ nơi').options, []);
  assert.deepEqual(addressCandidates('12 đường Hoa, xã Không Có Thật').options, []);
  assert.ok(addressCandidates('10 đường A, phường Hòa Bình').options.length > 1);
});
test('Only supported MP4 signature is accepted as video', () => {
  const b = Buffer.alloc(24);
  b.write('ftyp', 4);
  b.write('isom', 8);
  assert.equal(chatFile({ buffer: b, originalname: 'test.mp4' }).kind, 'video');
  assert.throws(() => chatFile({ buffer: Buffer.from('not video'), originalname: 'fake.mp4' }));
});
