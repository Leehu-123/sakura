const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { MetaOAuthGateway, OAUTH_SCOPES } = require('../dist/messenger/oauth.gateway');
const config = {
  version: 1,
  enabled: true,
  appId: '12345',
  secret: 'fake-oauth-app-secret',
  graphVersion: 'v99.0',
  configId: '45678',
};
const token = 'fake-long-user-token-12345';
const page = { pageId: '77101', name: 'Page', token: 'fake-page-token-12345', canMessage: true };
const metadata = (type = 'USER') => ({
  app_id: config.appId,
  is_valid: true,
  type,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  data_access_expires_at: 0,
  scopes: OAUTH_SCOPES,
});
function mock(t, handler) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    assert.equal(url.origin, 'https://graph.facebook.com');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(await handler(url, options)), { status: 200 });
  });
  return calls;
}
test('OAuth exchanges code server-side, inspects app/scopes and paginates using only bounded cursors', async (t) => {
  const calls = mock(t, (url) => {
    if (url.pathname.endsWith('oauth/access_token')) return { access_token: token };
    if (url.pathname.endsWith('debug_token')) return { data: metadata() };
    if (!url.searchParams.has('after'))
      return {
        data: [
          {
            id: page.pageId,
            name: page.name,
            tasks: ['PROFILE_PLUS_MESSAGING'],
            access_token: page.token,
          },
        ],
        paging: {
          next: 'https://attacker.invalid/steal?token=bad',
          cursors: { after: 'safe-cursor' },
        },
      };
    assert.equal(url.searchParams.get('after'), 'safe-cursor');
    return { data: [{ id: '77102', name: 'Read-only', tasks: ['ANALYZE'] }] };
  });
  const result = await new MetaOAuthGateway().discover(
    'fake-code',
    'https://sakura.test/callback',
    config,
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].canMessage, true);
  assert.equal(result[1].canMessage, false);
  assert.equal(calls[0].url.searchParams.get('redirect_uri'), 'https://sakura.test/callback');
  assert.equal(calls[1].url.searchParams.get('grant_type'), 'fb_exchange_token');
  assert.equal(calls[3].options.headers.Authorization, 'Bearer ' + token);
  assert.equal(
    calls[3].url.searchParams.get('appsecret_proof'),
    createHmac('sha256', config.secret).update(token).digest('hex'),
  );
  assert.ok(!JSON.stringify(result).includes(token));
});
test('Page validation rejects a token for another app, expired/revoked token, wrong type or missing scopes', async (t) => {
  let data;
  mock(t, () => ({ data }));
  for (const override of [
    { app_id: '999' },
    { is_valid: false },
    { type: 'USER' },
    { expires_at: 1 },
    { data_access_expires_at: 1 },
    { scopes: ['pages_show_list'] },
  ]) {
    data = { ...metadata('PAGE'), ...override };
    await assert.rejects(
      new MetaOAuthGateway().validatePage(page, config),
      /Facebook chưa cấp đủ quyền/,
    );
  }
});
test('Page identity must match the selected Page even after valid debug_token metadata', async (t) => {
  let returnedId = 'wrong';
  mock(t, (url) =>
    url.pathname.endsWith('debug_token')
      ? { data: metadata('PAGE') }
      : { id: returnedId, name: 'Page' },
  );
  await assert.rejects(new MetaOAuthGateway().validatePage(page, config));
  returnedId = page.pageId;
  await new MetaOAuthGateway().validatePage(page, config);
});
test('pagination loops fail instead of repeatedly requesting Pages', async (t) => {
  const calls = mock(t, (url) => {
    if (url.pathname.endsWith('oauth/access_token')) return { access_token: token };
    if (url.pathname.endsWith('debug_token')) return { data: metadata() };
    return {
      data: [],
      paging: { next: 'https://graph.facebook.com/fake', cursors: { after: 'repeat' } },
    };
  });
  await assert.rejects(
    new MetaOAuthGateway().discover('fake-code', 'https://sakura.test/callback', config),
  );
  assert.equal(calls.length, 5);
});
test('provider and network errors cannot echo a token or raw provider message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw Error('secret-token-in-provider-error');
  });
  await assert.rejects(
    new MetaOAuthGateway().discover('fake-code', 'https://sakura.test/callback', config),
    (error) => !error.message.includes('secret-token') && error.getStatus() === 400,
  );
});

test('Automatic subscription posts only messages with the selected Page token and does not send messages', async (t) => {
  let success = true;
  const calls = mock(t, (url, options) => {
    assert.equal(url.pathname, '/v99.0/77101/subscribed_apps');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer ' + page.token);
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('subscribed_fields'), 'messages');
    assert.equal(
      body.get('appsecret_proof'),
      createHmac('sha256', config.secret).update(page.token).digest('hex'),
    );
    return { success };
  });
  await new MetaOAuthGateway().subscribePage(page, config);
  success = false;
  await assert.rejects(new MetaOAuthGateway().subscribePage(page, config), /pages_manage_metadata/);
  assert.equal(calls.length, 2);
});
