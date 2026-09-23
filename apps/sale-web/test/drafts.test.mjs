import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDraftStore } from '../src/messenger/drafts.ts';

function fixture() {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  let time = Date.now();
  const fresh = () =>
    createDraftStore(
      () => storage,
      () => time,
    );
  const store = fresh();
  store.activate('employee-a');
  return { store, fresh, storage, data, advance: (ms) => (time += ms) };
}
test('Uploaded file draft survives reload and failed delivery; sent file preserves text', () => {
  const f = fixture(),
    id = randomUUID(),
    image = { id: randomUUID(), title: 'bao-gia.pdf', attachment: true, kind: 'file' };
  f.store.edit(id, { text: 'Báo giá của chị', image });
  const reload = f.fresh();
  reload.activate('employee-a');
  assert.deepEqual(reload.get(id).image, image);
  let attempt = reload.begin(id);
  reload.settle(id, attempt, 'FAILED');
  assert.deepEqual(reload.get(id).image, image);
  attempt = reload.begin(id);
  reload.settle(id, attempt, 'SENT');
  assert.equal(reload.get(id).image, null);
  assert.equal(reload.get(id).text, 'Báo giá của chị');
});
test('Restore separate conversation text/images after reload; isolate accounts and expire old drafts', () => {
  const f = fixture(),
    a = randomUUID(),
    b = randomUUID();
  f.store.edit(a, { text: 'Khách A', image: { id: randomUUID(), title: 'Ảnh sản phẩm' } });
  f.store.edit(b, { text: 'Khách B' });
  const reload = f.fresh();
  reload.activate('employee-a');
  assert.deepEqual(reload.get(a), f.store.get(a));
  assert.equal(reload.get(b).text, 'Khách B');
  reload.activate('employee-b');
  assert.equal(reload.get(a), undefined);
  reload.activate('employee-a');
  assert.equal(reload.get(a), undefined);
  f.store.edit(a, { text: 'Quá hạn' });
  f.advance(86400001);
  const expired = f.fresh();
  expired.activate('employee-a');
  assert.equal(expired.get(a), undefined);
});
test('Successful image delivery preserves unsent text; failed delivery preserves both', () => {
  const { store } = fixture(),
    id = randomUUID();
  store.edit(id, { text: 'Nội dung chưa gửi', image: { id: randomUUID(), title: 'Ảnh' } });
  const first = store.begin(id);
  store.settle(id, first, 'FAILED');
  assert.equal(store.get(id).text, first.text);
  assert.deepEqual(store.get(id).image, first.image);
  assert.notEqual(store.get(id).requestKey, first.requestKey);
  const next = store.begin(id);
  store.settle(id, next, 'SENT');
  assert.equal(store.get(id).image, null);
  assert.equal(store.get(id).text, first.text);
  store.settle(id, store.begin(id), 'SENT');
  assert.equal(store.get(id), undefined);
});
test('Uncertain delivery survives reload, locks editing and retries only the same payload/key explicitly', () => {
  const f = fixture(),
    id = randomUUID();
  f.store.edit(id, { text: 'Một lần gửi' });
  const first = f.store.begin(id);
  assert.equal(f.store.begin(id), null);
  f.store.edit(id, { text: 'Không được thay' });
  f.store.discard(id);
  assert.equal(f.store.get(id).text, first.text);
  const reload = f.fresh();
  reload.activate('employee-a');
  assert.equal(reload.get(id).pending, 'CHECKING');
  const ticket = reload.ticket(id);
  reload.settle(id, ticket, 'NOT_RECORDED');
  const retry = reload.begin(id);
  assert.equal(retry.requestKey, first.requestKey);
  assert.equal(retry.text, first.text);
  reload.settle(id, retry, 'UNKNOWN');
  assert.equal(reload.begin(id), null);
  reload.settle(id, retry, 'FAILED');
  assert.equal(reload.get(id).pending, null);
});
test('Late send results cannot recreate logged-out drafts or overwrite a newer attempt', () => {
  const { store, fresh } = fixture(),
    id = randomUUID();
  store.edit(id, { text: 'Ca trước' });
  const first = store.begin(id);
  store.clear();
  store.activate('employee-a');
  store.edit(id, { text: 'Ca mới' });
  store.settle(id, first, 'SENT');
  assert.equal(store.get(id).text, 'Ca mới');
  const second = store.begin(id);
  store.settle(id, second, 'FAILED');
  store.edit(id, { text: 'Đã sửa' });
  store.settle(id, second, 'SENT');
  assert.equal(store.get(id).text, 'Đã sửa');
  store.clear();
  const reload = fresh();
  reload.activate('employee-a');
  assert.equal(reload.get(id), undefined);
});
test('Unavailable storage keeps working in memory; malformed snapshots are ignored', () => {
  const store = createDraftStore(() => {
    throw new Error('denied');
  });
  store.activate('a');
  const id = randomUUID();
  store.edit(id, { text: 'Còn trong app' });
  assert.equal(store.durable(), false);
  assert.equal(store.get(id).text, 'Còn trong app');
  const f = fixture();
  f.storage.setItem('sakura.chat-drafts.v1', '{invalid');
  const reload = f.fresh();
  assert.doesNotThrow(() => reload.activate('employee-a'));
  f.storage.setItem(
    'sakura.chat-drafts.v1',
    JSON.stringify({ actor: 'employee-a', drafts: { [id]: { text: 1 } } }),
  );
  const bad = f.fresh();
  bad.activate('employee-a');
  assert.equal(bad.get(id), undefined);
});
