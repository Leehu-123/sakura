const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seal, unseal } = require('../dist/messenger/connection-crypto');
test('Fanpage secrets authenticate their field/Page binding and require the independent master key', () => {
  const previous = process.env.MESSENGER_CONFIG_KEY;
  try {
    process.env.MESSENGER_CONFIG_KEY = 'a1'.repeat(32);
    const encrypted = seal('fixture-token', 'page:1');
    assert.equal(unseal(encrypted, 'page:1'), 'fixture-token');
    assert.notEqual(seal('fixture-token', 'page:1'), encrypted);
    assert.throws(() => unseal(encrypted, 'page:2'));
    assert.throws(() => unseal(encrypted, 'app-secret'));
    const tampered = Buffer.from(encrypted, 'base64');
    tampered[13] ^= 1;
    assert.throws(() => unseal(tampered.toString('base64'), 'page:1'));
    process.env.MESSENGER_CONFIG_KEY = 'b2'.repeat(32);
    assert.throws(() => unseal(encrypted, 'page:1'));
    delete process.env.MESSENGER_CONFIG_KEY;
    assert.throws(() => seal('fixture-token', 'page:1'));
  } finally {
    if (previous === undefined) delete process.env.MESSENGER_CONFIG_KEY;
    else process.env.MESSENGER_CONFIG_KEY = previous;
  }
});
