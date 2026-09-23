import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSendKey } from '../src/messenger/composerKeys.ts';
const enter = {
  key: 'Enter',
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  keyCode: 13,
};
test('Enter sends; newline, modifiers, held keys and Vietnamese IME confirmation do not', () => {
  assert.equal(isSendKey(enter), true);
  for (const field of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'repeat', 'isComposing'])
    assert.equal(isSendKey({ ...enter, [field]: true }), false, field);
  assert.equal(isSendKey(enter, true), false);
  assert.equal(isSendKey({ ...enter, keyCode: 229 }), false);
  assert.equal(isSendKey({ ...enter, key: 'a' }), false);
});
