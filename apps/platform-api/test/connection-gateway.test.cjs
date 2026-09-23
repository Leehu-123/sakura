const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MetaConnectionGateway } = require('../dist/messenger/connection.service');

test('Connection errors distinguish permissions, expiration and page mismatch without exposing Meta payloads', async () => {
  const original = global.fetch;
  const gateway = new MetaConnectionGateway();
  try {
    for (const [code, subscribe, reason] of [
      [100, false, 'TOKEN_PERMISSION'],
      [200, true, 'SUBSCRIPTION_PERMISSION'],
      [190, false, 'TOKEN_EXPIRED'],
    ]) {
      global.fetch = async () => ({
        ok: false,
        json: async () => ({ error: { code, message: 'private-payload' } }),
      });
      assert.deepEqual(await gateway.call('v23.0', '123', 'private-token', subscribe), {
        ok: false,
        reason,
      });
    }
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ id: '456', name: 'Other Page' }),
    });
    assert.equal(
      (await gateway.call('v23.0', '123', 'private-token')).reason,
      'TOKEN_PAGE_MISMATCH',
    );
    global.fetch = async () => {
      throw Error('private-token');
    };
    assert.deepEqual(await gateway.call('v23.0', '123', 'private-token'), {
      ok: false,
      reason: 'META_UNAVAILABLE',
    });
  } finally {
    global.fetch = original;
  }
});
