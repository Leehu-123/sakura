const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { verifySignature, settings, suggestions, inWindow } = require('../dist/messenger/domain');
const { MessengerTransport } = require('../dist/messenger/transport');
test('Messenger chữ ký kiểm tra byte gốc và từ chối thiếu/sai định dạng', () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    MESSENGER_ENABLED: 'true',
    MESSENGER_PAGE_ID: '10001',
    MESSENGER_APP_SECRET: 'test-only-app-secret-123',
    MESSENGER_VERIFY_TOKEN: 'test-only-verify-token-123456',
  });
  try {
    const raw = Buffer.from('{ "text": "Sakura" }'),
      sig =
        'sha256=' +
        createHmac('sha256', process.env.MESSENGER_APP_SECRET).update(raw).digest('hex');
    verifySignature(raw, sig);
    assert.throws(() => verifySignature(Buffer.from('{"text":"Sakura"}'), sig));
    assert.throws(() => verifySignature(raw, 'sha256=bad'));
    assert.throws(() => verifySignature(undefined, sig));
  } finally {
    process.env = saved;
  }
});
test('Messenger chỉ gợi ý số hợp lệ và địa chỉ được ghi rõ', () => {
  assert.deepEqual(
    suggestions(
      'Số: +84 912 345 678\nĐịa chỉ: 12 Đường Hoa, Hà Nội\nTin thường không phải địa chỉ',
    ),
    { phones: ['0912345678'], addresses: ['12 Đường Hoa, Hà Nội'] },
  );
  assert.deepEqual(suggestions('abc123xyz'), { phones: [], addresses: [] });
});
test('Cửa sổ trả lời không mở khi thiếu tin đến, ở tương lai hoặc quá 24 giờ', () => {
  assert.equal(inWindow(null), false);
  assert.equal(inWindow(new Date(Date.now() + 10000)), false);
  assert.equal(inWindow(new Date(Date.now() - 86400001)), false);
  assert.equal(inWindow(new Date(Date.now() - 1000)), true);
});
test('Bộ gửi dùng Page/PSID, token trong header; tắt cấu hình không gọi mạng', async () => {
  const saved = { ...process.env },
    previous = global.fetch;
  let calls = 0;
  Object.assign(process.env, {
    MESSENGER_ENABLED: 'true',
    MESSENGER_SEND_ENABLED: 'true',
    MESSENGER_PAGE_ID: '10001',
    MESSENGER_APP_SECRET: 'test-only-app-secret-123',
    MESSENGER_VERIFY_TOKEN: 'test-only-verify-token-123456',
    MESSENGER_PAGE_ACCESS_TOKEN: 'never-a-real-token',
    MESSENGER_GRAPH_VERSION: 'v99.0',
  });
  try {
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(url, 'https://graph.facebook.com/v99.0/10001/messages');
      assert.equal(options.headers.Authorization, 'Bearer never-a-real-token');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), {
        recipient: { id: '20001' },
        messaging_type: 'RESPONSE',
        message: { text: 'Xin chào' },
      });
      return new Response(JSON.stringify({ recipient_id: '20001', message_id: 'mid1' }), {
        status: 200,
      });
    };
    const transport = new MessengerTransport({ runtime: async () => undefined });
    assert.deepEqual(await transport.send('10001', '20001', 'Xin chào'), {
      state: 'SENT',
      mid: 'mid1',
    });
    process.env.MESSENGER_SEND_ENABLED = 'false';
    assert.deepEqual(await transport.send('10001', '20001', 'Xin chào'), { state: 'FAILED' });
    assert.equal(calls, 1);
  } finally {
    global.fetch = previous;
    process.env = saved;
  }
});
test('Bộ gửi phân biệt từ chối rõ ràng với timeout/5xx/nội dung không rõ; không thử lại', async () => {
  const saved = { ...process.env },
    previous = global.fetch;
  let calls = 0;
  Object.assign(process.env, {
    MESSENGER_ENABLED: 'true',
    MESSENGER_SEND_ENABLED: 'true',
    MESSENGER_PAGE_ID: '10001',
    MESSENGER_APP_SECRET: 'test-only-app-secret-123',
    MESSENGER_VERIFY_TOKEN: 'test-only-verify-token-123456',
    MESSENGER_PAGE_ACCESS_TOKEN: 'never-a-real-token',
    MESSENGER_GRAPH_VERSION: 'v99.0',
  });
  try {
    const transport = new MessengerTransport({ runtime: async () => undefined });
    for (const [status, data, expected] of [
      [400, { error: { code: 190 } }, 'FAILED'],
      [500, { error: { code: 1 } }, 'UNKNOWN'],
      [200, {}, 'UNKNOWN'],
      [200, { recipient_id: 'WRONG', message_id: 'mid' }, 'UNKNOWN'],
    ]) {
      global.fetch = async () => {
        calls++;
        return new Response(JSON.stringify(data), { status });
      };
      assert.equal((await transport.send('10001', '20001', 'Xin chào')).state, expected);
    }
    global.fetch = async () => {
      calls++;
      throw new Error('timeout');
    };
    assert.equal((await transport.send('10001', '20001', 'Xin chào')).state, 'UNKNOWN');
    assert.equal(calls, 5);
  } finally {
    global.fetch = previous;
    process.env = saved;
  }
});

test('Bộ gửi ảnh upload multipart đúng Page rồi gửi attachment; lỗi upload không gửi khách', async () => {
  const saved = { ...process.env },
    original = global.fetch;
  const image = { mime: 'image/png', data: Buffer.from('image-test-bytes').toString('base64') };
  let calls = [];
  Object.assign(process.env, {
    MESSENGER_ENABLED: 'true',
    MESSENGER_SEND_ENABLED: 'true',
    MESSENGER_APP_SECRET: 'test-only-secret-long-enough',
    MESSENGER_VERIFY_TOKEN: 'test-only-token-long-enough-123',
    MESSENGER_GRAPH_VERSION: 'v99.0',
    MESSENGER_PAGES_JSON: JSON.stringify([
      { pageId: '101', name: 'A', accessToken: 'token-A', sendEnabled: true },
      { pageId: '102', name: 'B', accessToken: 'token-B', sendEnabled: true },
    ]),
  });
  try {
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify(
          url.endsWith('message_attachments')
            ? { attachment_id: '123456' }
            : { recipient_id: '202', message_id: 'img-mid' },
        ),
      );
    };
    const transport = new MessengerTransport({ runtime: async () => undefined });
    assert.equal((await transport.send('102', '202', 'Ảnh', image)).state, 'SENT');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://graph.facebook.com/v99.0/102/message_attachments');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token-B');
    assert.ok(calls[0].options.body instanceof FormData);
    assert.deepEqual(JSON.parse(calls[0].options.body.get('message')), {
      attachment: { type: 'image', payload: { is_reusable: true } },
    });
    assert.equal(calls[0].options.body.get('filedata').type, 'image/png');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      recipient: { id: '202' },
      messaging_type: 'RESPONSE',
      message: { attachment: { type: 'image', payload: { attachment_id: '123456' } } },
    });
    calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      throw new Error('upload timeout');
    };
    assert.equal((await transport.send('102', '202', 'Ảnh', image)).state, 'FAILED');
    assert.equal(calls.length, 1);
    calls = [];
    assert.equal((await transport.send('999', '202', 'Ảnh', image)).state, 'FAILED');
    assert.equal(calls.length, 0);
    process.env.MESSENGER_PAGES_JSON = 'invalid';
    assert.equal(settings('102').sending, false);
    process.env.MESSENGER_PAGES_JSON = JSON.stringify([
      { pageId: '101', name: 'A', accessToken: 'A', sendEnabled: true },
      { pageId: '101', name: 'B', accessToken: 'B', sendEnabled: true },
    ]);
    assert.equal(settings('101').sending, false);
  } finally {
    global.fetch = original;
    process.env = saved;
  }
});
