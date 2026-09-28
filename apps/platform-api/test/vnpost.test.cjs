const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseVnpost, vnpostDate, VnpostGateway } = require('../dist/shipping/vnpost');
const row = {
  itemCode: 'TEST123VN',
  senderCode: 'CMS1',
  status: 14,
  totalFee: 25000,
  updatedDate: '28/09/2026 09:30:00',
};
test('VNPost: exact shipment/customer, provisional fee, strict dates and unknown statuses', () => {
  const x = parseVnpost([{ results: [row] }], 'TEST123VN', 'CMS1');
  assert.equal(x.shippingStatus, 'DELIVERED');
  assert.equal(x.fee, '25000');
  assert.equal(x.updatedAt.toISOString(), '2026-09-28T02:30:00.000Z');
  const read = (r) => parseVnpost({ results: [r] }, 'TEST123VN', 'CMS1');
  assert.throws(() => read({ ...row, itemCode: 'OTHER' }));
  assert.throws(() => read({ ...row, senderCode: 'OTHER' }));
  assert.throws(() => parseVnpost({ results: [row, row] }, 'TEST123VN', 'CMS1'));
  assert.throws(() => read({ ...row, totalFee: -1 }));
  assert.throws(() => read({ ...row, totalFee: '25000.5' }));
  assert.equal(read({ ...row, totalFee: null }).fee, null);
  assert.equal(read({ ...row, totalFee: 0 }).fee, '0');
  assert.equal(read({ ...row, status: 999 }).shippingStatus, undefined);
  assert.equal(read({ ...row, status: 23 }).shippingStatus, undefined);
  assert.equal(read({ ...row, status: 21 }).shippingStatus, undefined);
  assert.throws(() => vnpostDate('31/02/2026 00:00:00'));
  assert.equal(vnpostDate('2026-09-28 09:30:00').getTime(), x.updatedAt.getTime());
});
test('VNPost gateway uses fixed HTTPS host/header, redacts errors and rejects redirects', async () => {
  const original = global.fetch;
  let captured;
  try {
    global.fetch = async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ results: [row] }));
    };
    const gateway = new VnpostGateway();
    await gateway.track('PRODUCTION', 'private-test-token', 'TEST123VN', 'CMS1');
    assert.equal(captured.url, 'https://connect-my.vnpost.vn/getOrder?type=1&code=TEST123VN');
    assert.equal(captured.init.headers.token, 'private-test-token');
    assert.equal(captured.init.redirect, 'error');
    global.fetch = async () => new Response('secret reflected upstream', { status: 403 });
    await assert.rejects(
      gateway.track('PRODUCTION', 'private-test-token', 'TEST123VN', 'CMS1'),
      (e) => !e.message.includes('secret') && e.getStatus() === 502,
    );
    global.fetch = async () =>
      new Response(JSON.stringify({ success: false, errorMessage: 'secret-password' }));
    await assert.rejects(
      gateway.login('PRODUCTION', 'fixture', 'test-password', 'CMS1'),
      (e) => !e.message.includes('secret-password'),
    );
  } finally {
    global.fetch = original;
  }
});
