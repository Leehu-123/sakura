import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/api.ts';

test('Excel multipart upload preserves the file and lets the browser set its boundary', async (t) => {
  const form = new FormData();
  form.append('file', new Blob(['test excel']), 'sapo.xlsx');
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.body, form);
    assert.equal(options.headers['Content-Type'], undefined);
    return new Response(JSON.stringify({ ok: true }));
  });
  assert.deepEqual(await api('/imports/sapo/excel/preview', 'POST', form), { ok: true });
});

test('permission HTTP status is preserved so live views can discard inaccessible data', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify({ message: 'Không có quyền' }), { status: 403 }),
  );
  await assert.rejects(
    api('/test'),
    (e) => e instanceof ApiError && e.status === 403 && e.message === 'Không có quyền',
  );
});

test('aborting while reading a response cannot return a fake successful resource', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => {
      controller.abort();
      throw controller.signal.reason;
    },
  }));
  await assert.rejects(
    api('/test', 'GET', undefined, true, controller.signal),
    (e) => e.name === 'AbortError',
  );
});

test('a success status with invalid JSON is a retryable error, not a malformed resource', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>proxy error</html>', { status: 200 }),
  );
  await assert.rejects(api('/test'), /dữ liệu chưa hợp lệ/);
});
