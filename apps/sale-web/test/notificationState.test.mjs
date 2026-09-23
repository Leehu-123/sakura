import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newInbound, notificationCursor } from '../src/messenger/notificationState.ts';
const snapshot = (id, time) => ({
  latest: id ? { id, createdAt: time } : null,
  serverAt: '2026-09-23T10:00:00Z',
});
test('cursor does not move backward after scope changes or empty snapshots', () => {
  let cursor = notificationCursor(null, snapshot('old', '2026-09-23T08:00:00Z'));
  const older = snapshot('assigned', '2026-09-23T09:00:00Z');
  assert.equal(newInbound(cursor, older), false);
  cursor = notificationCursor(cursor, older);
  cursor = notificationCursor(cursor, snapshot(null));
  assert.equal(newInbound(cursor, snapshot('recent', '2026-09-23T09:30:00Z')), false);
  assert.equal(newInbound(cursor, snapshot('live', '2026-09-23T10:01:00Z')), true);
});
test('sound suppresses initial history, duplicate polls and older newly accessible conversations', () => {
  const old = snapshot('old', '2026-09-23T09:00:00Z');
  assert.equal(newInbound(null, old), false);
  assert.equal(newInbound(old, old), false);
  assert.equal(newInbound(snapshot(null), old), false);
  assert.equal(newInbound(old, snapshot('older', '2026-09-22T10:00:00Z')), false);
  assert.equal(newInbound(old, snapshot('new', '2026-09-23T10:01:00Z')), true);
  assert.equal(newInbound(snapshot(null), snapshot('first', '2026-09-23T10:01:00Z')), true);
});
