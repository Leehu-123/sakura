const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chatFile, MAX_CHAT_FILE } = require('../dist/messenger/attachment-format');
const { MessengerTransport } = require('../dist/messenger/transport');
test('Local attachment validation uses bytes, bounded sizes and safe names', () => {
  const file = (buffer, originalname) => chatFile({ buffer, originalname });
  assert.equal(file(Buffer.from('%PDF-1.4\ntest'), 'test.pdf').kind, 'file');
  assert.equal(file(Buffer.from('GIF89a test'), 'hello.gif').mime, 'image/gif');
  assert.equal(
    file(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]), 'picture.png').kind,
    'image',
  );
  assert.equal(file(Buffer.from('price,quantity'), 'price.csv').mime, 'text/csv');
  assert.equal(file(Buffer.from('abc'), '../data.txt').title, '.._data.txt');
  assert.equal(
    file(Buffer.from('abc'), Buffer.from('Báo giá.txt', 'utf8').toString('latin1')).title,
    'Báo giá.txt',
  );
  assert.throws(() => file(Buffer.from('<svg/>'), 'fake.png'));
  assert.throws(() => file(Buffer.from('MZtest'), 'run.exe'));
  assert.throws(() => file(Buffer.alloc(0), 'empty.txt'));
  assert.throws(() => file(Buffer.alloc(MAX_CHAT_FILE + 1), 'huge.txt'));
});
test('Meta file upload uses file attachment type and sends only after upload succeeds', async () => {
  const previous = global.fetch;
  const transport = new MessengerTransport({
    runtime: async () => ({
      enabled: true,
      sendEnabled: true,
      secret: 'test-secret-length-12345',
      verifyToken: 'test-verify-token-length-12345',
      version: 'v23.0',
      pages: [{ pageId: '10001', name: 'Test', accessToken: 'fake', sendEnabled: true }],
    }),
  });
  let calls = 0;
  try {
    global.fetch = async (url, opts) => {
      calls++;
      if (url.endsWith('/message_attachments')) {
        assert.equal(JSON.parse(opts.body.get('message')).attachment.type, 'file');
        assert.equal(opts.body.get('filedata').name, 'bao-gia.pdf');
        return new Response(JSON.stringify({ attachment_id: '123' }));
      }
      assert.deepEqual(JSON.parse(opts.body).message, {
        attachment: { type: 'file', payload: { attachment_id: '123' } },
      });
      return new Response(JSON.stringify({ recipient_id: '20001', message_id: 'test-file' }));
    };
    const file = {
      mime: 'application/pdf',
      data: Buffer.from('%PDF-1.4 test').toString('base64'),
      title: 'bao-gia.pdf',
      kind: 'file',
    };
    assert.equal((await transport.send('10001', '20001', '', file)).state, 'SENT');
    assert.equal(calls, 2);
    calls = 0;
    global.fetch = async () => {
      calls++;
      return new Response('{}', { status: 400 });
    };
    assert.equal((await transport.send('10001', '20001', '', file)).state, 'FAILED');
    assert.equal(calls, 1);
  } finally {
    global.fetch = previous;
  }
});
