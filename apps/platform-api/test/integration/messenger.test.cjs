const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const { PrismaClient } = require('@sakura/database');
const { JwtService } = require('@nestjs/jwt');
const root = resolve(__dirname, '../../../..');
const schema = 'test_' + randomUUID().replaceAll('-', '');
let db, adminDb, app, token, admin, adminRole, regionalRole, sale, saleToken, cookie;
const origin = 'http://localhost:5173';
const initialPassword = 'Sakura-integration-initial-123';
const changedPassword = 'Sakura-integration-changed-456';
let originalUrl;
before(
  async () => {
    originalUrl = process.env.DATABASE_URL;
    const url = new URL(originalUrl);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || process.env.NODE_ENV === 'production')
      throw new Error('Chỉ chạy integration test trên PostgreSQL cục bộ.');
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_ROOT = resolve(root, '.local/test-media', schema);
    process.env.WEB_ORIGIN = origin;
    process.env.COOKIE_SECURE = 'false';
    process.env.JWT_SECRET = 'integration-only-'.repeat(5);
    process.env.SEED_ADMIN_EMAIL = 'admin@integration.test';
    process.env.SEED_ADMIN_PASSWORD = initialPassword;
    adminDb = new PrismaClient({ datasources: { db: { url: originalUrl } } });
    await adminDb.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
    execFileSync(
      process.execPath,
      [
        resolve(root, 'node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        resolve(root, 'packages/database/prisma/schema.prisma'),
      ],
      { cwd: root, env: process.env, stdio: 'pipe', windowsHide: true },
    );
    execFileSync(
      process.execPath,
      [resolve(root, 'packages/database/dist-seed/packages/database/prisma/seed.js')],
      { cwd: root, env: process.env, stdio: 'pipe', windowsHide: true },
    );
    const { Test } = require('@nestjs/testing');
    const { AppModule } = require('../../dist/app');
    const { configureApp } = require('../../dist/bootstrap');
    const { MetaProfileGateway } = require('../../dist/messenger/profiles');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MetaProfileGateway)
      .useValue({ load: async () => null })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = new PrismaClient();
    admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@integration.test' } });
    adminRole = await db.role.findUniqueOrThrow({ where: { code: 'admin' } });
    regionalRole = await db.role.findUniqueOrThrow({ where: { code: 'regional_sales' } });
  },
  { timeout: 120000 },
);
after(async () => {
  if (app) await app.close();
  if (db) await db.$disconnect();
  if (adminDb) {
    // Generated schema only; never removes the application's public schema.
    if (!/^test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test schema');
    await adminDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await adminDb.$disconnect();
  }
  process.env.DATABASE_URL = originalUrl;
});
const http = () => request(app.getHttpServer());
const auth = () => ({ Authorization: 'Bearer ' + token });
async function mint(userId) {
  const session = await db.session.create({
    data: { userId, expiresAt: new Date(Date.now() + 86400000) },
  });
  return new JwtService({ secret: process.env.JWT_SECRET }).sign(
    { sub: userId, sid: session.id },
    { issuer: 'sakura-platform', audience: 'sakura', expiresIn: '15m' },
  );
}

const { createHmac } = require('node:crypto');
const messengerEnv = [
  'MESSENGER_ENABLED',
  'MESSENGER_SEND_ENABLED',
  'MESSENGER_PAGE_ID',
  'MESSENGER_APP_SECRET',
  'MESSENGER_VERIFY_TOKEN',
  'MESSENGER_PAGE_ACCESS_TOKEN',
  'MESSENGER_GRAPH_VERSION',
  'MESSENGER_PAGES_JSON',
];
const savedEnv = Object.fromEntries(messengerEnv.map((k) => [k, process.env[k]]));
after(() => {
  for (const k of messengerEnv) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});
const pageId = '10001',
  psid = '20001',
  otherPsid = '20002',
  secret = 'test-messenger-secret-not-real';
const event = (mid, who = psid, at = Date.now(), text = 'Xin chào Sakura') => ({
  sender: { id: who },
  recipient: { id: pageId },
  timestamp: at,
  message: { mid, text },
});
const envelope = (messages) => ({ object: 'page', entry: [{ id: pageId, messaging: messages }] });
const signed = (payload, signature) => {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return http()
    .post('/api/v1/messenger/webhook')
    .set('Content-Type', 'application/json')
    .set(
      'X-Hub-Signature-256',
      signature || 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'),
    )
    .send(raw);
};
test('Messenger: webhook, phạm vi, trả lời và đối chiếu kết quả', async (t) => {
  let a,
    b,
    ta,
    tb,
    c,
    conversation,
    transport,
    calls = 0;
  const send = (method, path, body, who = token) => {
    const q = http()
      [method]('/api/v1/messenger' + path)
      .set('Authorization', 'Bearer ' + who);
    return body === undefined ? q : q.send(body);
  };
  await t.test('Mặc định tắt webhook và gửi ra ngoài', async () => {
    delete process.env.MESSENGER_PAGES_JSON;
    process.env.MESSENGER_ENABLED = 'false';
    process.env.MESSENGER_SEND_ENABLED = 'false';
    await http().get('/api/v1/messenger/webhook').expect(503);
    await signed(envelope([event('disabled')])).expect(503);
    assert.equal(await db.chatConversation.count(), 0);
  });
  await t.test('Chuẩn bị cấu hình giả và tài khoản trong schema kiểm thử', async () => {
    Object.assign(process.env, {
      MESSENGER_ENABLED: 'true',
      MESSENGER_SEND_ENABLED: 'false',
      MESSENGER_PAGE_ID: pageId,
      MESSENGER_APP_SECRET: secret,
      MESSENGER_VERIFY_TOKEN: 'verify-token-only-for-integration-tests',
      MESSENGER_PAGE_ACCESS_TOKEN: 'fake-token-never-send-to-network',
      MESSENGER_GRAPH_VERSION: 'v99.0',
    });
    await db.user.update({ where: { id: admin.id }, data: { mustChangePassword: false } });
    token = await mint(admin.id);
    async function staff(email) {
      return db.user.create({
        data: {
          email,
          displayName: email,
          passwordHash: admin.passwordHash,
          mustChangePassword: false,
          roleAssignments: { create: { roleId: regionalRole.id } },
        },
      });
    }
    a = await staff('a@messenger.test');
    b = await staff('b@messenger.test');
    ta = await mint(a.id);
    tb = await mint(b.id);
    c = await db.customer.create({
      data: {
        name: 'Khách hội thoại',
        phone: '0912345678',
        address: 'Địa chỉ đang lưu',
        createdById: a.id,
        assignments: { create: { userId: a.id, assignedById: admin.id, reason: 'Fixture' } },
      },
    });
    const { MessengerTransport } = require('../../dist/messenger/transport');
    transport = app.get(MessengerTransport);
    transport.send = async () => {
      calls++;
      return { state: 'SENT', mid: 'out-' + calls };
    };
  });
  await t.test('Xác minh token handshake; trả challenge dạng văn bản', async () => {
    const r = await http()
      .get('/api/v1/messenger/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env.MESSENGER_VERIFY_TOKEN,
        'hub.challenge': '123456',
      })
      .expect(200);
    assert.equal(r.text, '123456');
    assert.match(r.headers['content-type'], /text\/plain/);
    await http()
      .get('/api/v1/messenger/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '123' })
      .expect(403);
  });
  await t.test('Chữ ký sai hoặc body bị sửa bị chặn trước ghi dữ liệu', async () => {
    await signed(envelope([event('bad')]), 'sha256=' + '0'.repeat(64)).expect(403);
    await http()
      .post('/api/v1/messenger/webhook')
      .send(envelope([event('unsigned')]))
      .expect(403);
    assert.equal(await db.chatMessage.count(), 0);
  });
  await t.test(
    'Chữ ký dùng byte gốc; nhận lô nhiều hội thoại, chống lặp tuần tự và đồng thời',
    async () => {
      const payload = envelope([
        event('m1', psid, Date.now() - 5000, 'SĐT: 0987654321\nĐịa chỉ: 12 Đường Hoa, Hà Nội'),
        event('m2', otherPsid),
      ]);
      const raw = JSON.stringify(payload, null, 2);
      await signed(raw).expect(200);
      await signed(raw).expect(200);
      const responses = await Promise.all([
        signed(envelope([event('race')])),
        signed(envelope([event('race')])),
      ]);
      assert.deepEqual(
        responses.map((r) => r.status),
        [200, 200],
      );
      assert.equal(await db.chatConversation.count(), 2);
      assert.equal(await db.chatMessage.count(), 3);
      conversation = await db.chatConversation.findUniqueOrThrow({
        where: { pageId_psid: { pageId, psid } },
      });
    },
  );
  await t.test(
    'Bỏ qua Page khác, echo và sự kiện không hỗ trợ; tin cũ không lùi mốc nhận',
    async () => {
      const previous = conversation.lastInboundAt;
      await signed({
        object: 'page',
        entry: [{ id: '99999', messaging: [event('otherpage')] }],
      }).expect(200);
      const echo = event('echo');
      echo.message.is_echo = true;
      await signed(
        envelope([
          echo,
          {
            delivery: { mids: ['m1'] },
            sender: { id: psid },
            recipient: { id: pageId },
            timestamp: Date.now(),
          },
          event('older', psid, Date.now() - 86400000),
        ]),
      ).expect(200);
      const now = await db.chatConversation.findUniqueOrThrow({ where: { id: conversation.id } });
      assert.equal(now.lastInboundAt.toISOString(), previous.toISOString());
      assert.equal(await db.chatMessage.count(), 4);
    },
  );
  await t.test('Tệp đính kèm chỉ lưu loại, không tải URL không tin cậy', async () => {
    const e = event('file');
    delete e.message.text;
    e.message.attachments = [{ type: 'image', payload: { url: 'http://127.0.0.1/private' } }];
    await signed(envelope([e])).expect(200);
    const m = await db.chatMessage.findUniqueOrThrow({ where: { remoteKey: pageId + ':file' } });
    assert.deepEqual(m.attachmentTypes, ['image']);
    assert.equal(JSON.stringify(m).includes('http://'), false);
  });
  await t.test(
    'Sale vùng không thấy hội thoại chưa gắn; phản hồi không lộ bí mật cấu hình',
    async () => {
      assert.equal((await send('get', '/conversations', undefined, ta).expect(200)).body.total, 0);
      assert.equal((await send('get', '/conversations?filter=UNLINKED').expect(200)).body.total, 2);
      await send('get', '/conversations/' + conversation.id, undefined, ta).expect(404);
      const status = (await send('get', '/status', undefined, ta).expect(200)).body;
      assert.equal(status.receiving, true);
      assert.equal(status.sending, false);
      assert.equal(JSON.stringify(status).includes(secret), false);
      assert.equal('accessToken' in status, false);
    },
  );
  await t.test('Gắn khách có xác nhận; không gắn lại hay dùng phiên bản cũ', async () => {
    await send(
      'post',
      '/conversations/' + conversation.id + '/link',
      { version: 1, customerId: c.id },
      ta,
    ).expect(403);
    await send('post', '/conversations/' + conversation.id + '/link', {
      version: 999,
      customerId: c.id,
    }).expect(409);
    await send('post', '/conversations/' + conversation.id + '/link', {
      version: 1,
      customerId: c.id,
    }).expect(201);
    await send('post', '/conversations/' + conversation.id + '/link', {
      version: 2,
      customerId: c.id,
    }).expect(409);
    assert.equal((await send('get', '/conversations', undefined, ta).expect(200)).body.total, 1);
    await send('get', '/conversations/' + conversation.id, undefined, tb).expect(404);
    await send(
      'patch',
      '/conversations/' + conversation.id + '/tags',
      { version: 2, tags: ['Không được'] },
      tb,
    ).expect(404);
    await send(
      'post',
      '/conversations/' + conversation.id + '/reply',
      { requestKey: randomUUID(), text: 'Không được' },
      tb,
    ).expect(404);
  });
  await t.test('Gợi ý điện thoại/địa chỉ chưa tự cập nhật khách; nhãn có phiên bản', async () => {
    const d = (await send('get', '/conversations/' + conversation.id, undefined, ta).expect(200))
      .body;
    assert.deepEqual(d.suggestions.phones, ['0987654321']);
    assert.deepEqual(d.suggestions.addresses, ['12 Đường Hoa, Hà Nội']);
    assert.equal(
      (await db.customer.findUniqueOrThrow({ where: { id: c.id } })).phone,
      '0912345678',
    );
    await send(
      'patch',
      '/conversations/' + conversation.id + '/tags',
      { version: 2, tags: ['Cần tư vấn'] },
      ta,
    ).expect(200);
    await send(
      'patch',
      '/conversations/' + conversation.id + '/tags',
      { version: 2, tags: ['Cũ'] },
      ta,
    ).expect(409);
  });
  await t.test('Mẫu trả lời dùng chung; chỉ quản trị được sửa', async () => {
    await send(
      'post',
      '/templates',
      { title: 'Chào khách', text: 'Sakura xin chào anh/chị.' },
      ta,
    ).expect(403);
    const p = (
      await send('post', '/templates', {
        title: 'Chào khách',
        text: 'Sakura xin chào anh/chị.',
      }).expect(201)
    ).body;
    assert.equal((await send('get', '/templates', undefined, ta).expect(200)).body.length, 1);
    await send('patch', '/templates/' + p.id, {
      title: p.title,
      text: 'Đã sửa',
      version: 1,
      isActive: true,
    }).expect(200);
    await send('patch', '/templates/' + p.id, {
      title: p.title,
      text: 'Cũ',
      version: 1,
      isActive: true,
    }).expect(409);
    assert.equal(calls, 0);
  });
  await t.test('Tắt mẫu ẩn khỏi Sale; quản trị xem và khôi phục được', async () => {
    const p = (await send('get', '/templates').expect(200)).body[0];
    await send('patch', '/templates/' + p.id, {
      title: p.title,
      text: p.text,
      version: p.version,
      isActive: false,
    }).expect(200);
    assert.equal((await send('get', '/templates', undefined, ta).expect(200)).body.length, 0);
    const hidden = (await send('get', '/templates').expect(200)).body[0];
    assert.equal(hidden.isActive, false);
    await send('patch', '/templates/' + p.id, {
      title: p.title,
      text: p.text,
      version: hidden.version,
      isActive: true,
    }).expect(200);
    assert.equal((await send('get', '/templates', undefined, ta).expect(200)).body.length, 1);
  });
  await t.test('Chặn gửi khi chưa bật hoặc quá 24 giờ; không gọi bộ gửi', async () => {
    const body = { requestKey: randomUUID(), text: 'Xin chào' };
    await send('post', '/conversations/' + conversation.id + '/reply', body, ta).expect(503);
    process.env.MESSENGER_SEND_ENABLED = 'true';
    await db.chatConversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: new Date(Date.now() - 86401000) },
    });
    await send('post', '/conversations/' + conversation.id + '/reply', body, ta).expect(400);
    assert.equal(calls, 0);
    await db.chatConversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: new Date() },
    });
  });
  await t.test(
    'Gửi cùng khóa nhiều lần chỉ gọi bộ gửi một lần; chặn nội dung thay đổi',
    async () => {
      const body = { requestKey: randomUUID(), text: 'Sakura đã nhận yêu cầu của bạn.' };
      const r = await send('post', '/conversations/' + conversation.id + '/reply', body, ta).expect(
        201,
      );
      assert.equal(r.body.state, 'SENT');
      const status = await send(
        'get',
        '/conversations/' + conversation.id + '/requests/' + body.requestKey,
        undefined,
        ta,
      ).expect(200);
      assert.deepEqual(status.body, { requestKey: body.requestKey, state: 'SENT' });
      await http()
        .get('/api/v1/messenger/conversations/' + conversation.id + '/requests/' + body.requestKey)
        .expect(401);
      await send(
        'get',
        '/conversations/' + conversation.id + '/requests/not-a-uuid',
        undefined,
        ta,
      ).expect(400);
      await send(
        'get',
        '/conversations/' + conversation.id + '/requests/' + body.requestKey,
        undefined,
        tb,
      ).expect(404);
      const anotherActor = await send(
        'get',
        '/conversations/' + conversation.id + '/requests/' + body.requestKey,
      ).expect(200);
      assert.equal(anotherActor.body.state, 'NOT_RECORDED');
      const missingKey = randomUUID();
      assert.deepEqual(
        (
          await send(
            'get',
            '/conversations/' + conversation.id + '/requests/' + missingKey,
            undefined,
            ta,
          ).expect(200)
        ).body,
        { requestKey: missingKey, state: 'NOT_RECORDED' },
      );
      assert.equal(calls, 1); // Read-only checks never call Meta.
      const same = await send(
        'post',
        '/conversations/' + conversation.id + '/reply',
        body,
        ta,
      ).expect(201);
      assert.equal(same.body.id, r.body.id);
      assert.equal(calls, 1);
      await send(
        'post',
        '/conversations/' + conversation.id + '/reply',
        { ...body, text: 'Khác nội dung' },
        ta,
      ).expect(409);
    },
  );
  await t.test('Hai yêu cầu gửi đồng thời không gọi bộ gửi hai lần', async () => {
    const before = calls,
      body = { requestKey: randomUUID(), text: 'Kiểm tra đồng thời' };
    const r = await Promise.all([
      send('post', '/conversations/' + conversation.id + '/reply', body, ta),
      send('post', '/conversations/' + conversation.id + '/reply', body, ta),
    ]);
    assert.ok(r.every((x) => [201, 409].includes(x.status)));
    assert.equal(calls, before + 1);
  });
  await t.test('Kết quả không rõ chặn gửi tiếp; chỉ quản trị đối chiếu rồi mở lại', async () => {
    transport.send = async () => {
      calls++;
      return { state: 'UNKNOWN' };
    };
    const m = (
      await send(
        'post',
        '/conversations/' + conversation.id + '/reply',
        { requestKey: randomUUID(), text: 'Chưa rõ' },
        ta,
      ).expect(201)
    ).body;
    assert.equal(m.state, 'UNKNOWN');
    assert.equal(
      (
        await send(
          'get',
          '/conversations/' + conversation.id + '/requests/' + m.requestKey,
          undefined,
          ta,
        ).expect(200)
      ).body.state,
      'UNKNOWN',
    );
    const before = calls;
    await send(
      'post',
      '/conversations/' + conversation.id + '/reply',
      { requestKey: randomUUID(), text: 'Không gửi tiếp' },
      ta,
    ).expect(409);
    assert.equal(calls, before);
    await send(
      'post',
      '/conversations/' + conversation.id + '/messages/' + m.id + '/resolve',
      { state: 'FAILED', reason: 'Đã kiểm tra Fanpage' },
      ta,
    ).expect(403);
    await send('post', '/conversations/' + conversation.id + '/messages/' + m.id + '/resolve', {
      state: 'FAILED',
      reason: 'Đã kiểm tra Fanpage',
    }).expect(201);
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: m.id } })).state, 'FAILED');
    assert.equal(
      (
        await send(
          'get',
          '/conversations/' + conversation.id + '/requests/' + m.requestKey,
          undefined,
          ta,
        ).expect(200)
      ).body.state,
      'FAILED',
    );
  });
  await t.test('Tiến trình dừng khi gửi: giữ trạng thái chưa rõ, không tự phát lại', async () => {
    const m = await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        actorId: a.id,
        requestKey: randomUUID(),
        direction: 'OUTBOUND',
        state: 'SENDING',
        text: 'Dở dang',
        sourceAt: new Date(),
        createdAt: new Date(Date.now() - 60000),
      },
    });
    const d = (await send('get', '/conversations/' + conversation.id, undefined, ta).expect(200))
      .body;
    assert.equal(d.messages.items.find((x) => x.id === m.id).state, 'UNKNOWN');
    assert.equal(
      (
        await send(
          'get',
          '/conversations/' + conversation.id + '/requests/' + m.requestKey,
          undefined,
          ta,
        ).expect(200)
      ).body.state,
      'UNKNOWN',
    );
    assert.equal(d.canSend, false);
    await send('post', '/conversations/' + conversation.id + '/messages/' + m.id + '/resolve', {
      state: 'SENT',
      reason: 'Đã thấy tin trên Fanpage',
    }).expect(201);
  });
  await t.test(
    'Bàn giao khách đổi quyền đọc/gửi hội thoại ngay; nhật ký không chứa nội dung tin',
    async () => {
      await http()
        .post('/api/v1/sales/customers/' + c.id + '/handoff')
        .set('Authorization', 'Bearer ' + token)
        .send({ userId: b.id, version: c.version, reason: 'Bàn giao chăm sóc' })
        .expect(201);
      await send('get', '/conversations/' + conversation.id, undefined, ta).expect(404);
      await send(
        'post',
        '/conversations/' + conversation.id + '/reply',
        { requestKey: randomUUID(), text: 'Sau bàn giao' },
        ta,
      ).expect(404);
      await send('get', '/conversations/' + conversation.id, undefined, tb).expect(200);
      const logs = await db.auditLog.findMany({ where: { action: { startsWith: 'chat.' } } });
      assert.ok(logs.some((l) => l.action === 'chat.delivery_resolved'));
      assert.equal(JSON.stringify(logs).includes('Sakura đã nhận yêu cầu'), false);
    },
  );
  const path = () => '/conversations/' + conversation.id;
  let product, image, order;
  const sales = (method, path, body, who = token) => {
    const q = http()
      [method]('/api/v1/sales' + path)
      .set('Authorization', 'Bearer ' + who);
    return body === undefined ? q : q.send(body);
  };
  await t.test(
    'Phân hỗ trợ chỉ chọn người có quyền; không cấp thêm quyền hay đổi chủ khách',
    async () => {
      const eligible = (await send('get', path() + '/supporters', undefined, tb).expect(200)).body;
      assert.ok(eligible.some((u) => u.id === b.id));
      assert.ok(!eligible.some((u) => u.id === a.id));
      const current = (await send('get', path(), undefined, tb).expect(200)).body;
      await send(
        'patch',
        path() + '/support',
        { version: current.version, userId: a.id },
        tb,
      ).expect(400);
      await send(
        'patch',
        path() + '/support',
        { version: current.version, userId: b.id },
        tb,
      ).expect(200);
      await send(
        'patch',
        path() + '/support',
        { version: current.version, userId: null },
        tb,
      ).expect(409);
      assert.equal(
        (await send('get', '/conversations?filter=MINE', undefined, tb).expect(200)).body.total,
        1,
      );
      await send('get', path(), undefined, ta).expect(404);
      const owner = await db.customerAssignment.findFirst({
        where: { customerId: c.id, endedAt: null },
      });
      assert.equal(owner.userId, b.id);
    },
  );
  await t.test('Đọc riêng từng người; tin đến đồng thời không bị đánh dấu đã đọc', async () => {
    const before = (await send('get', path(), undefined, tb).expect(200)).body;
    await send(
      'post',
      path() + '/read',
      { inboundSeq: before.inboundSeq, unread: false },
      tb,
    ).expect(201);
    assert.equal(
      (await send('get', '/conversations?filter=UNREAD', undefined, tb).expect(200)).body.total,
      0,
    );
    assert.ok((await send('get', '/conversations?filter=UNREAD').expect(200)).body.total > 0);
    await signed(envelope([event('workspace-new')])).expect(200);
    await send(
      'post',
      path() + '/read',
      { inboundSeq: before.inboundSeq, unread: false },
      tb,
    ).expect(409);
    const after = (await send('get', path(), undefined, tb).expect(200)).body;
    assert.equal(after.inboundSeq, before.inboundSeq + 1);
    await signed(envelope([event('workspace-new')])).expect(200);
    assert.equal(
      (await send('get', path(), undefined, tb).expect(200)).body.inboundSeq,
      after.inboundSeq,
    );
    const unread = (await send('get', '/conversations?filter=UNREAD', undefined, tb).expect(200))
      .body;
    assert.equal(unread.total, 1);
    assert.equal(unread.items[0].reads[0].unread, true);
    await send(
      'post',
      path() + '/read',
      { inboundSeq: after.inboundSeq, unread: false },
      tb,
    ).expect(201);
    await send('post', path() + '/read', { inboundSeq: after.inboundSeq, unread: true }, tb).expect(
      201,
    );
    assert.equal(
      (await send('get', '/conversations?filter=UNREAD', undefined, tb).expect(200)).body.total,
      1,
    );
  });
  await t.test('Chặn nội bộ dừng gửi nhưng giữ tin đến; bộ lọc có phạm vi', async () => {
    const current = (await send('get', path(), undefined, tb).expect(200)).body;
    await send(
      'patch',
      path() + '/block',
      { version: current.version, blocked: true, reason: 'Kiểm thử chặn' },
      tb,
    ).expect(200);
    const before = calls;
    await send(
      'post',
      path() + '/reply',
      { requestKey: randomUUID(), text: 'Không được gửi' },
      tb,
    ).expect(400);
    assert.equal(calls, before);
    assert.equal((await send('get', '/conversations', undefined, tb).expect(200)).body.total, 0);
    assert.equal(
      (await send('get', '/conversations?filter=BLOCKED', undefined, tb).expect(200)).body.total,
      1,
    );
    assert.equal(
      (await send('get', '/conversations?filter=BLOCKED', undefined, ta).expect(200)).body.total,
      0,
    );
    await signed(envelope([event('blocked-incoming')])).expect(200);
    assert.ok(
      await db.chatMessage.findUnique({ where: { remoteKey: pageId + ':blocked-incoming' } }),
    );
    await send(
      'patch',
      path() + '/block',
      { version: current.version + 1, blocked: false, reason: 'Đã kiểm tra' },
      tb,
    ).expect(200);
  });
  await t.test('Nhiều Fanpage được tách PSID, lọc đúng và không lộ token', async () => {
    process.env.MESSENGER_PAGES_JSON = JSON.stringify([
      { pageId, name: 'Sakura A', accessToken: 'fake-a', sendEnabled: true },
      { pageId: '10002', name: 'Sakura B', accessToken: 'fake-b', sendEnabled: false },
    ]);
    const pages = (await send('get', '/pages').expect(200)).body;
    assert.equal(pages.length, 2);
    assert.equal(JSON.stringify(pages).includes('fake-'), false);
    const e = event('page-b-same-psid');
    e.recipient.id = '10002';
    await signed({ object: 'page', entry: [{ id: '10002', messaging: [e] }] }).expect(200);
    const pageB = (await send('get', '/conversations?pageId=10002').expect(200)).body;
    assert.equal(pageB.total, 1);
    assert.equal(pageB.items[0].psid, psid);
    assert.notEqual(pageB.items[0].id, conversation.id);
    await send('post', '/conversations/' + pageB.items[0].id + '/reply', {
      requestKey: randomUUID(),
      text: 'Chưa bật gửi',
    }).expect(503);
    const pageA = (await send('get', '/conversations?pageId=' + pageId).expect(200)).body;
    assert.ok(pageA.items.every((x) => x.pageId === pageId));
    delete process.env.MESSENGER_PAGES_JSON;
  });
  await t.test('Thư viện ảnh kiểm tra quyền, loại tệp và đúng biến thể', async () => {
    product = await db.product.create({
      data: {
        name: 'Hoa kiểm thử',
        variants: { create: { name: 'Hồng', sku: 'TEST-FLOWER', unit: 'bó', price: 10000 } },
      },
      include: { variants: true },
    });
    const data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7V8AAAAASUVORK5CYII=';
    const body = {
      productId: product.id,
      variantId: product.variants[0].id,
      title: 'Ảnh hoa',
      mime: 'image/png',
      data,
    };
    await send('post', '/images', body, tb).expect(403);
    await send('post', '/images', { ...body, mime: 'image/svg+xml' }).expect(400);
    await send('post', '/images', {
      ...body,
      data: Buffer.from('not a png file at all').toString('base64'),
    }).expect(400);
    await send('post', '/images', { ...body, variantId: randomUUID() }).expect(400);
    image = (await send('post', '/images', body).expect(201)).body;
    const list = (await send('get', '/images', undefined, tb).expect(200)).body;
    assert.equal(list.total, 1);
    assert.equal(list.items[0].data, undefined);
    assert.equal(
      (await send('get', '/images/' + image.id, undefined, tb).expect(200)).body.data,
      data,
    );
  });
  await t.test('Gửi ảnh giữ khóa chống lặp và kiểm tra ảnh đang hoạt động', async () => {
    let received;
    transport.send = async (...args) => {
      received = args;
      calls++;
      return { state: 'SENT', mid: 'workspace-' + calls };
    };
    const payload = { requestKey: randomUUID(), imageId: image.id },
      before = calls;
    const m = (await send('post', path() + '/reply', payload, tb).expect(201)).body;
    assert.equal(m.imageId, image.id);
    assert.equal(received[0], pageId);
    assert.equal(received[1], psid);
    assert.equal(received[3].mime, 'image/png');
    await send('post', path() + '/reply', payload, tb).expect(201);
    assert.equal(calls, before + 1);
    await db.productImage.update({ where: { id: image.id }, data: { isActive: false } });
    await send(
      'post',
      path() + '/reply',
      { requestKey: randomUUID(), imageId: image.id },
      tb,
    ).expect(404);
    await send('get', path() + '/messages/' + m.id + '/image', undefined, tb).expect(200);
    await send('get', path() + '/messages/' + m.id + '/image', undefined, ta).expect(404);
    await db.productImage.update({ where: { id: image.id }, data: { isActive: true } });
  });
  await t.test(
    'Tạo và chốt nguyên tử từ hội thoại; kiểm tra giá, khách, chống tạo trùng',
    async () => {
      const customer = (await sales('get', '/customers/' + c.id, undefined, tb).expect(200)).body;
      const body = {
        requestKey: randomUUID(),
        conversationId: conversation.id,
        confirm: true,
        customerId: c.id,
        customerVersion: customer.version,
        items: [{ variantId: product.variants[0].id, quantity: 2, expectedPrice: '10000' }],
      };
      await sales(
        'post',
        '/orders',
        { ...body, items: [{ ...body.items[0], expectedPrice: '9999' }] },
        tb,
      ).expect(409);
      assert.equal(await db.order.count(), 0);
      await sales('post', '/orders', { ...body, conversationId: randomUUID() }, tb).expect(404);
      order = (await sales('post', '/orders', body, tb).expect(201)).body;
      assert.equal(order.status, 'CONFIRMED');
      assert.equal(order.closedByUserId, b.id);
      assert.equal(order.total, '20000');
      assert.equal((await sales('post', '/orders', body, tb).expect(201)).body.id, order.id);
      assert.equal(await db.order.count(), 1);
      assert.equal(
        (await send('get', '/conversations?filter=HAS_ORDER', undefined, tb).expect(200)).body
          .total,
        1,
      );
    },
  );
  await t.test('Xác nhận đơn lưu bản gửi, từ chối bản cũ và đơn khác khách', async () => {
    const preview = (
      await send('get', path() + '/confirmation/' + order.id, undefined, tb).expect(200)
    ).body;
    assert.match(preview.text, /20.000/);
    assert.equal(preview.orderVersion, order.version);
    const another = await db.chatConversation.create({
      data: { pageId, psid: '999888777', lastInboundAt: new Date() },
    });
    await send('get', '/conversations/' + another.id + '/confirmation/' + order.id).expect(404);
    const payload = { requestKey: randomUUID(), orderId: order.id, orderVersion: order.version };
    const msg = (await send('post', path() + '/reply', payload, tb).expect(201)).body;
    assert.equal(msg.text, preview.text);
    assert.equal(msg.snapshot.total, '20000');
    order = (
      await sales(
        'post',
        '/orders/' + order.id + '/payments',
        { version: order.version, paidAmount: '1000', note: 'Thu thử trong kiểm thử' },
        tb,
      ).expect(201)
    ).body;
    await send('post', path() + '/reply', { ...payload, requestKey: randomUUID() }, tb).expect(409);
    assert.equal((await send('post', path() + '/reply', payload, tb).expect(201)).body.id, msg.id);
    const history = (await send('get', path() + '?interaction=ORDER', undefined, tb).expect(200))
      .body;
    assert.equal(history.messages.total, 1);
    assert.ok(history.messages.items.every((m) => m.orderId === order.id));
  });
  await t.test('Phiếu giao không trùng; cập nhật lưu bản cũ và chặn ngoài phạm vi', async () => {
    await sales(
      'post',
      '/orders/' + order.id + '/delivery-slip',
      { version: order.version },
      ta,
    ).expect(404);
    const slip = (
      await sales(
        'post',
        '/orders/' + order.id + '/delivery-slip',
        { version: order.version },
        tb,
      ).expect(201)
    ).body;
    const again = (
      await sales(
        'post',
        '/orders/' + order.id + '/delivery-slip',
        { version: order.version },
        tb,
      ).expect(201)
    ).body;
    assert.equal(again.id, slip.id);
    assert.equal(await db.deliverySlip.count(), 1);
    assert.equal(slip.snapshot.paidAmount, '1000');
    order = (
      await sales(
        'post',
        '/orders/' + order.id + '/payments',
        { version: order.version, paidAmount: '2000', note: 'Thu thêm kiểm thử' },
        tb,
      ).expect(201)
    ).body;
    await sales(
      'post',
      '/orders/' + order.id + '/delivery-slip',
      { version: order.version - 1 },
      tb,
    ).expect(409);
    const updated = (
      await sales(
        'post',
        '/orders/' + order.id + '/delivery-slip',
        { version: order.version },
        tb,
      ).expect(201)
    ).body;
    assert.equal(updated.id, slip.id);
    assert.equal(updated.revision, 2);
    assert.equal(updated.previousSnapshots.length, 1);
    assert.equal(updated.snapshot.paidAmount, '2000');
    await sales('get', '/orders/' + order.id + '/delivery-slip', undefined, ta).expect(404);
  });
  await t.test(
    'Hủy đơn vô hiệu hóa phiếu; đơn nháp không được lập phiếu hoặc gửi xác nhận',
    async () => {
      const customer = (await sales('get', '/customers/' + c.id, undefined, tb).expect(200)).body;
      const body = {
        requestKey: randomUUID(),
        conversationId: conversation.id,
        customerId: c.id,
        customerVersion: customer.version,
        items: [{ variantId: product.variants[0].id, quantity: 1, expectedPrice: '10000' }],
      };
      let draft = (await sales('post', '/orders', body, tb).expect(201)).body;
      await sales(
        'post',
        '/orders/' + draft.id + '/delivery-slip',
        { version: draft.version },
        tb,
      ).expect(400);
      await send('get', path() + '/confirmation/' + draft.id, undefined, tb).expect(400);
      draft = (
        await sales(
          'patch',
          '/orders/' + draft.id + '/status',
          { version: draft.version, status: 'CONFIRMED' },
          tb,
        ).expect(200)
      ).body;
      const slip = (
        await sales(
          'post',
          '/orders/' + draft.id + '/delivery-slip',
          { version: draft.version },
          tb,
        ).expect(201)
      ).body;
      draft = (
        await sales(
          'patch',
          '/orders/' + draft.id + '/status',
          { version: draft.version, status: 'CANCELLED', reason: 'Khách đổi ý kiểm thử' },
          tb,
        ).expect(200)
      ).body;
      assert.ok((await db.deliverySlip.findUnique({ where: { id: slip.id } })).voidedAt);
      await sales(
        'post',
        '/orders/' + draft.id + '/delivery-slip',
        { version: draft.version },
        tb,
      ).expect(400);
      await send(
        'post',
        path() + '/reply',
        { requestKey: randomUUID(), orderId: draft.id, orderVersion: draft.version },
        tb,
      ).expect(400);
    },
  );

  await t.test(
    'Chưa trả lời chỉ được xóa bởi tin gửi thành công; tin mới vẫn chờ trả lời',
    async () => {
      const now = new Date();
      await db.chatConversation.update({
        where: { id: conversation.id },
        data: { lastInboundAt: now, lastSentAt: new Date(now.getTime() - 1000) },
      });
      assert.equal(
        (await send('get', '/conversations?filter=UNANSWERED', undefined, tb).expect(200)).body
          .total,
        1,
      );
      transport.send = async () => ({ state: 'FAILED' });
      await send(
        'post',
        path() + '/reply',
        { requestKey: randomUUID(), text: 'Tin thất bại' },
        tb,
      ).expect(201);
      assert.equal(
        (await send('get', '/conversations?filter=UNANSWERED', undefined, tb).expect(200)).body
          .total,
        1,
      );
      transport.send = async () => ({ state: 'SENT', mid: 'answered-final' });
      await send(
        'post',
        path() + '/reply',
        { requestKey: randomUUID(), text: 'Trả lời thành công' },
        tb,
      ).expect(201);
      assert.equal(
        (await send('get', '/conversations?filter=UNANSWERED', undefined, tb).expect(200)).body
          .total,
        0,
      );
      await signed(envelope([event('unanswered-again')])).expect(200);
      assert.equal(
        (await send('get', '/conversations?filter=UNANSWERED', undefined, tb).expect(200)).body
          .total,
        1,
      );
    },
  );
  await t.test('Thanh nhãn dùng chung, ngày hợp lệ, version và quyền quản trị', async () => {
    const cfg = (await send('get', '/toolbar').expect(200)).body;
    await send('patch', '/toolbar', { version: cfg.version, days: 8, labels: [] }, tb).expect(403);
    const saved = (
      await send('patch', '/toolbar', {
        version: cfg.version,
        days: 6,
        labels: [{ name: 'Khách quen', color: '#aabbcc' }],
      }).expect(200)
    ).body;
    assert.equal(saved.version, 1);
    assert.deepEqual(
      (await send('get', '/toolbar', undefined, tb).expect(200)).body.labels,
      saved.labels,
    );
    await send('patch', '/toolbar', { version: 0, days: 6, labels: [] }).expect(409);
    await send('patch', '/toolbar', { version: 1, days: 99, labels: [] }).expect(400);
    await send('patch', '/toolbar', {
      version: 1,
      days: 8,
      labels: [{ name: 'x', color: 'url(bad)' }],
    }).expect(400);
    const d = (await send('get', path(), undefined, tb).expect(200)).body;
    await send('patch', path() + '/date', { version: d.version, date: '2026-02-30' }, tb).expect(
      400,
    );
    const tagged = (
      await send('patch', path() + '/date', { version: d.version, date: '2026-09-23' }, tb).expect(
        200,
      )
    ).body;
    assert.equal(tagged.taggedDate, '2026-09-23');
    await send('patch', path() + '/date', { version: d.version, date: '' }, tb).expect(409);
    await send('patch', path() + '/date', { version: tagged.version, date: '' }, tb).expect(200);
  });
  await t.test('Đính kèm: phạm vi, kiểm tra tệp, gửi đúng loại và chống gửi lặp', async () => {
    const upload = (who, buffer, name, conv = conversation.id) =>
      http()
        .post('/api/v1/messenger/conversations/' + conv + '/attachments')
        .set('Authorization', 'Bearer ' + who)
        .attach('file', buffer, name);
    const doc = Buffer.from('%PDF-1.4\nSakura test only');
    await upload(ta, doc, 'test.pdf').expect(404);
    await upload(tb, Buffer.from('<svg/>'), 'fake.png').expect(400);
    await upload(tb, Buffer.alloc(10 * 1024 * 1024 + 1, 65), 'big.txt').expect(413);
    const f = (await upload(tb, doc, 'bao-gia.pdf').expect(201)).body;
    assert.equal(f.kind, 'file');
    assert.equal(f.mime, 'application/pdf');
    const read = (await send('get', path() + '/attachments/' + f.id, undefined, tb).expect(200))
      .body;
    assert.equal(read.data, doc.toString('base64'));
    await send('get', path() + '/attachments/' + f.id, undefined, ta).expect(404);
    const second = await db.chatConversation.create({
      data: { pageId, psid: '99999', lastInboundAt: new Date() },
    });
    await send('post', '/conversations/' + second.id + '/reply', {
      requestKey: randomUUID(),
      attachmentId: f.id,
    }).expect(404);
    await send('post', path() + '/reply', { requestKey: randomUUID(), attachmentId: f.id }).expect(
      404,
    ); // Another employee cannot send the staged file.
    let sends = 0;
    transport.send = async (page, recipient, text, file) => {
      sends++;
      assert.equal(file.kind, 'file');
      assert.equal(file.mime, 'application/pdf');
      assert.equal(file.data, doc.toString('base64'));
      return { state: 'SENT', mid: 'attachment-test-mid' };
    };
    const body = { requestKey: randomUUID(), attachmentId: f.id };
    const m = (await send('post', path() + '/reply', body, tb).expect(201)).body;
    assert.equal(m.attachmentId, f.id);
    assert.equal(m.actorId, b.id);
    assert.deepEqual(m.attachmentTypes, ['file']);
    assert.equal((await send('post', path() + '/reply', body, tb).expect(201)).body.id, m.id);
    assert.equal(sends, 1);
    await send('post', path() + '/reply', { ...body, text: 'different' }, tb).expect(400);
    const f2 = (await upload(tb, doc, 'other.pdf').expect(201)).body;
    await send('post', path() + '/reply', { ...body, attachmentId: f2.id }, tb).expect(409);
    const detail = (await send('get', path(), undefined, tb).expect(200)).body;
    assert.ok(detail.messages.items.some((x) => x.attachmentId === f.id));
  });
  await t.test('Facebook identity and notification feed enforce conversation scope', async () => {
    const { storeMedia } = require('../../dist/common/media-store');
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const media = await storeMedia(image);
    await db.chatConversation.update({
      where: { id: conversation.id },
      data: {
        facebookName: 'Khách Facebook',
        avatarKey: media.storageKey,
        avatarMime: media.mime,
        avatarBytes: media.byteSize,
        profileState: 'READY',
        profileCheckedAt: new Date(),
      },
    });
    const detail = (await send('get', path(), undefined, tb).expect(200)).body;
    assert.equal(detail.facebookName, 'Khách Facebook');
    assert.equal(
      (await send('get', path() + '/avatar', undefined, tb).expect(200)).body.data,
      image.toString('base64'),
    );
    await send('get', path() + '/avatar', undefined, ta).expect(404);
    assert.equal(
      (
        await send(
          'get',
          '/conversations?search=' + encodeURIComponent('Khách Facebook'),
          undefined,
          tb,
        ).expect(200)
      ).body.total,
      1,
    );
    const before = (await send('get', '/notifications', undefined, tb).expect(200)).body;
    const unrelated = await db.chatConversation.create({ data: { pageId, psid: '8888888' } });
    await db.chatMessage.create({
      data: {
        conversationId: unrelated.id,
        direction: 'INBOUND',
        state: 'RECEIVED',
        text: 'hidden test',
        remoteKey: 'profile-hidden-test',
        sourceAt: new Date(),
      },
    });
    assert.deepEqual(
      (await send('get', '/notifications', undefined, tb).expect(200)).body.latest,
      before.latest,
    );
    const inbound = await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        state: 'RECEIVED',
        text: 'visible test',
        remoteKey: 'profile-visible-test',
        sourceAt: new Date(),
      },
    });
    assert.equal(
      (await send('get', '/notifications', undefined, tb).expect(200)).body.latest.id,
      inbound.id,
    );
    await db.chatMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        state: 'SENT',
        text: 'reply test',
        actorId: b.id,
        requestKey: randomUUID(),
        sourceAt: new Date(),
      },
    });
    assert.equal(
      (await send('get', '/notifications', undefined, tb).expect(200)).body.latest.id,
      inbound.id,
    );
  });
  await t.test(
    'Import lịch sử: phân trang, chống trùng, không gán nhân viên hoặc báo tin mới',
    async () => {
      const { MetaHistoryGateway } = require('../../dist/messenger/history-import');
      const gateway = app.get(MetaHistoryGateway),
        original = gateway.get;
      const current = await db.chatConversation.findUnique({ where: { id: conversation.id } });
      const before = (await send('get', '/notifications').expect(200)).body.latest;
      const msg = (id, out = false) => ({
        id,
        created_time: '2024-01-01T00:00:00Z',
        message: 'Old test',
        from: { id: out ? pageId : current.psid },
        to: { data: [{ id: out ? current.psid : pageId }] },
      });
      const job = '/pages/' + pageId + '/history-import';
      let calls = 0;
      gateway.get = async (page, node, fields, after, list) => {
        calls++;
        if (list)
          return {
            rows: [
              {
                id: 't_history',
                participants: { data: [{ id: pageId }, { id: current.psid, name: 'Test name' }] },
              },
            ],
          };
        return after
          ? { rows: [msg('old-in'), msg('old-next')] }
          : { rows: [msg('old-in'), msg('old-out', true)], next: 'next-message' };
      };
      try {
        await send('post', job, {}, tb).expect(403);
        const first = (await send('post', job, {}).expect(201)).body;
        assert.equal(first.importedMessages, 2);
        assert.equal(first.complete, false);
        const second = (await send('post', job, {}).expect(201)).body;
        assert.equal(second.importedMessages, 3);
        assert.equal(second.complete, true);
        assert.equal((await send('post', job, {}).expect(201)).body.importedMessages, 3);
        assert.equal(calls, 3);
        const old = await db.chatMessage.findUnique({ where: { remoteKey: pageId + ':old-out' } });
        assert.equal(old.actorId, null);
        assert.equal(old.imported, true);
        assert.equal(old.state, 'SENT');
        const after = await db.chatConversation.findUnique({ where: { id: conversation.id } });
        assert.equal(after.inboundSeq, current.inboundSeq);
        assert.equal(after.lastInboundAt.toISOString(), current.lastInboundAt.toISOString());
        assert.deepEqual((await send('get', '/notifications').expect(200)).body.latest, before);
        await db.chatHistoryImport.update({
          where: { pageId },
          data: { leaseUntil: new Date(Date.now() + 60000), leaseToken: 'other-test' },
        });
        await send('post', job, {}).expect(409);
        await db.chatHistoryImport.update({
          where: { pageId },
          data: { leaseUntil: null, leaseToken: null },
        });
        gateway.get = async () => {
          throw Error('upstream temporarily unavailable');
        };
        await send('post', job, { restart: true }).expect(400);
        assert.equal((await db.chatHistoryImport.findUnique({ where: { pageId } })).complete, true);
      } finally {
        gateway.get = original;
      }
    },
  );
  await t.test('Contact panel respects scope and atomically creates/links a confirmed profile', async()=>{
    const fresh=await db.chatConversation.create({data:{pageId,psid:'contact-fixture',facebookName:'Facebook fixture'}});
    await db.chatMessage.createMany({data:[{conversationId:fresh.id,direction:'INBOUND',state:'RECEIVED',remoteKey:'contact-fixture-in',text:'Tên người nhận: Nguyễn Lan\n0388684946\nđịa chỉ: 053 đường Ngô Quyền, phường Lào Cai',sourceAt:new Date()},{conversationId:fresh.id,direction:'OUTBOUND',state:'SENT',actorId:admin.id,requestKey:randomUUID(),text:'Hotline shop: 0999999999',sourceAt:new Date()}]});
    const p='/conversations/'+fresh.id;
    await send('get',p+'/contact-suggestions',undefined,ta).expect(404);
    const hints=(await send('get',p+'/contact-suggestions').expect(200)).body;
    assert.deepEqual(hints.phones,['0388684946']);assert.deepEqual(hints.names,['Nguyễn Lan']);assert.ok(hints.addressSuggestion.options.length);
    const body={conversationVersion:fresh.version,name:'Nguyễn Lan',phone:'0388684946',address:'053 đường Ngô Quyền, Phường Lào Cai, Tỉnh Lào Cai'};
    await send('post',p+'/customer',body,ta).expect(404);
    await send('post',p+'/customer',{...body,conversationVersion:999}).expect(409);
    const created=(await send('post',p+'/customer',body).expect(201)).body;
    assert.equal((await db.chatConversation.findUnique({where:{id:fresh.id}})).customerId,created.id);
    assert.equal(await db.customerAssignment.count({where:{customerId:created.id,userId:admin.id,endedAt:null}}),1);
    await send('post',p+'/customer',body).expect(409);
    assert.equal(await db.customer.count({where:{phone:body.phone}}),1);
    const other=await db.chatConversation.create({data:{pageId,psid:'contact-duplicate'}});
    await send('post','/conversations/'+other.id+'/customer',{...body,conversationVersion:1}).expect(409);
    assert.equal((await db.chatConversation.findUnique({where:{id:other.id}})).customerId,null);
  });
  await t.test('Sent media gallery is scoped and does not expose staged or failed files',async()=>{
    await send('get',path()+'/media',undefined,ta).expect(404);
    const gallery=(await send('get',path()+'/media',undefined,tb).expect(200)).body;
    assert.ok(gallery.items.some(m=>m.imageId));assert.ok(gallery.items.some(m=>m.attachmentId));
    for(const m of gallery.items.filter(m=>m.imageId||m.attachmentId)){
      assert.ok((await send('get',path()+'/media/'+m.id,undefined,tb).expect(200)).body.data);
      await send('get',path()+'/media/'+m.id,undefined,ta).expect(404);
    }
    const fail=await db.chatMessage.create({data:{conversationId:conversation.id,direction:'OUTBOUND',state:'FAILED',actorId:b.id,requestKey:randomUUID(),text:'failed',sourceAt:new Date(),imageId:image.id}});
    await send('get',path()+'/media/'+fail.id,undefined,tb).expect(404);
    assert.ok(!(await send('get',path()+'/media',undefined,tb).expect(200)).body.items.some(m=>m.id===fail.id));
  });
  await t.test('Shipping updates validate scope/version and invoice sends keep idempotency',async()=>{
    let o=(await sales('get','/orders/'+order.id,undefined,tb).expect(200)).body;
    const shipping={version:o.version,carrierName:'Test carrier',trackingCode:'TEST-001',shippingStatus:'IN_TRANSIT'};
    await sales('patch','/orders/'+o.id+'/shipping',shipping,ta).expect(404);
    await sales('patch','/orders/'+o.id+'/shipping',{...shipping,trackingCode:''},tb).expect(400);
    o=(await sales('patch','/orders/'+o.id+'/shipping',shipping,tb).expect(200)).body;
    assert.equal(o.carrierName,'Test carrier');assert.equal(o.shippingStatus,'IN_TRANSIT');
    await sales('patch','/orders/'+o.id+'/shipping',shipping,tb).expect(409);
    const preview=(await send('get',path()+'/invoice/'+o.id,undefined,tb).expect(200)).body;
    assert.match(preview.text,/HÓA ĐƠN BÁN HÀNG/);assert.match(preview.text,/không phải hóa đơn GTGT/);
    let sent=0;transport.send=async()=>{sent++;return{state:'SENT',mid:'invoice-test-'+sent};};
    const body={requestKey:randomUUID(),orderId:o.id,orderVersion:o.version,orderDocument:'INVOICE'};
    const invoice=(await send('post',path()+'/reply',body,tb).expect(201)).body;
    assert.equal(invoice.text,preview.text);assert.equal(invoice.snapshot.documentKind,'INVOICE');
    await send('post',path()+'/reply',body,tb).expect(201);assert.equal(sent,1);
    await send('post',path()+'/reply',{...body,orderDocument:undefined},tb).expect(409);
    await send('post',path()+'/reply',{requestKey:randomUUID(),text:'bad',orderDocument:'INVOICE'},tb).expect(400);
  });

});
