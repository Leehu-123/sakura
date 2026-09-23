const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  safeAvatarUrl,
  MetaProfileGateway,
  MessengerProfiles,
} = require('../dist/messenger/profiles');
test('Avatar URL permits only HTTPS Meta image hosts without credentials', () => {
  assert.ok(safeAvatarUrl('https://scontent.xx.fbcdn.net/photo.jpg'));
  for (const value of [
    'http://scontent.xx.fbcdn.net/a',
    'https://fbcdn.net.evil.test/a',
    'https://127.0.0.1/a',
    'https://user:secret@fbcdn.net/a',
    'https://fbcdn.net:444/a',
  ])
    assert.equal(safeAvatarUrl(value), null);
});
test('Profile reads use the correct page token; unsafe avatar redirect keeps name without fetching private hosts', async () => {
  const original = global.fetch,
    calls = [];
  const connections = {
    runtime: async () => ({
      enabled: true,
      sendEnabled: false,
      secret: 'a'.repeat(20),
      verifyToken: 'v'.repeat(30),
      version: 'v23.0',
      pages: [
        {
          pageId: '123',
          name: 'Test',
          accessToken: 'test-only-token',
          enabled: true,
          sendEnabled: false,
        },
      ],
    }),
  };
  global.fetch = async (url, options) => {
    calls.push(String(url));
    if (calls.length === 1) {
      assert.equal(options.headers.Authorization, 'Bearer test-only-token');
      return new Response(
        JSON.stringify({
          first_name: 'Nguyễn',
          last_name: 'An',
          profile_pic: 'https://scontent.xx.fbcdn.net/a',
        }),
      );
    }
    assert.equal(options.headers, undefined);
    return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } });
  };
  try {
    const result = await new MetaProfileGateway(connections).load('123', '456');
    assert.equal(result.name, 'Nguyễn An');
    assert.equal(result.avatar, undefined);
    assert.equal(calls.length, 2);
    assert.equal(await new MetaProfileGateway(connections).load('999', '456'), null);
  } finally {
    global.fetch = original;
  }
});
test('Profile failure leaves cached identity intact and respects retry claims', async () => {
  const writes = [];
  let loads = 0,
    claim = 1;
  const db = {
    chatConversation: {
      updateMany: async () => ({ count: claim }),
      update: async (d) => writes.push(d.data),
    },
  };
  const service = new MessengerProfiles(db, {
    load: async () => {
      loads++;
      throw Error('Meta unavailable');
    },
  });
  const row = {
    id: 'c',
    pageId: '123',
    psid: '456',
    profileState: 'READY',
    profileCheckedAt: null,
  };
  await service.refresh(row);
  assert.deepEqual(writes, [{ profileState: 'UNAVAILABLE' }]);
  claim = 0;
  await service.refresh(row);
  assert.equal(loads, 1);
});
