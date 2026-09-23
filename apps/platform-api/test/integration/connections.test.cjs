const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const { PrismaClient } = require('@sakura/database');
const { JwtService } = require('@nestjs/jwt');
test(
  'Fanpage configuration permissions, encryption, live runtime and subscription workflow',
  { timeout: 120000 },
  async () => {
    const root = resolve(__dirname, '../../../..'),
      originalUrl = process.env.DATABASE_URL;
    const url = new URL(originalUrl),
      schema = 'test_connections_' + randomUUID().replaceAll('-', '');
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || process.env.NODE_ENV === 'production')
      throw Error('Local test only');
    const adminDb = new PrismaClient({ datasources: { db: { url: originalUrl } } });
    let app, db;
    try {
      await adminDb.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
      url.searchParams.set('schema', schema);
      Object.assign(process.env, {
        DATABASE_URL: url.toString(),
        NODE_ENV: 'test',
        WEB_ORIGIN: 'http://localhost:5173',
        COOKIE_SECURE: 'false',
        JWT_SECRET: 'integration-only-'.repeat(5),
        MESSENGER_CONFIG_KEY: 'c3'.repeat(32),
        MESSENGER_ENABLED: 'false',
        MESSENGER_SEND_ENABLED: 'false',
        MESSENGER_PAGE_ID: '',
        MESSENGER_PAGES_JSON: '',
        SEED_ADMIN_EMAIL: 'admin@connections.test',
        SEED_ADMIN_PASSWORD: 'Integration-only-password-123',
      });
      execFileSync(
        process.execPath,
        [
          resolve(root, 'node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          '--schema',
          resolve(root, 'packages/database/prisma/schema.prisma'),
        ],
        { cwd: root, env: process.env, windowsHide: true, stdio: 'pipe' },
      );
      execFileSync(
        process.execPath,
        [resolve(root, 'packages/database/dist-seed/packages/database/prisma/seed.js')],
        { cwd: root, env: process.env, windowsHide: true, stdio: 'pipe' },
      );
      const { Test } = require('@nestjs/testing'),
        { AppModule } = require('../../dist/app'),
        { configureApp } = require('../../dist/bootstrap');
      const {
        MetaConnectionGateway,
        MessengerConnections,
      } = require('../../dist/messenger/connection.service');
      let valid = true,
        subscriptionValid = true,
        gatewayCalls = 0;
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MetaConnectionGateway)
        .useValue({
          call: async (_version, id, token, subscribe) => {
            gatewayCalls++;
            assert.equal(id, '999001');
            assert.equal(token, 'fixture-page-token-123456789');
            return { ok: subscribe ? subscriptionValid : valid, name: 'Fanpage kiểm thử' };
          },
        })
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.init();
      db = new PrismaClient();
      const admin = await db.user.update({
        where: { email: 'admin@connections.test' },
        data: { mustChangePassword: false },
      });
      const role = await db.role.findUniqueOrThrow({ where: { code: 'regional_sales' } });
      const sale = await db.user.create({
        data: {
          email: 'sale@connections.test',
          displayName: 'Sale',
          passwordHash: admin.passwordHash,
          mustChangePassword: false,
          roleAssignments: { create: { roleId: role.id } },
        },
      });
      async function mint(userId) {
        const session = await db.session.create({
          data: { userId, expiresAt: new Date(Date.now() + 86400000) },
        });
        return new JwtService({ secret: process.env.JWT_SECRET }).sign(
          { sub: userId, sid: session.id },
          { issuer: 'sakura-platform', audience: 'sakura', expiresIn: '15m' },
        );
      }
      const token = await mint(admin.id),
        saleToken = await mint(sale.id),
        prefix = '/api/v1/messenger/configuration';
      const http = () => request(app.getHttpServer());
      const send = (method, path, body, auth = token) => {
        const r = http()
          [method](prefix + path)
          .set('Authorization', 'Bearer ' + auth);
        return body === undefined ? r : r.send(body);
      };
      await http().get(prefix).expect(401);
      await send('get', '', undefined, saleToken).expect(403);
      await send('get', '/diagnostics', undefined, saleToken).expect(403);
      const secret = 'fixture-app-secret-123456789',
        verify = 'fixture-verify-token-123456789';
      const appFields = {
        appId: '55555',
        graphVersion: 'v99.0',
        webhookUrl: 'https://sakura.test/api/v1/messenger/webhook',
        enabled: true,
        sendEnabled: false,
      };
      let s = (await send('get', '').expect(200)).body;
      assert.equal(s.version, 0);
      s = (
        await send('patch', '', {
          ...appFields,
          version: s.version,
          appSecret: secret,
          verifyToken: verify,
        }).expect(200)
      ).body;
      const pageFields = {
        pageId: '999001',
        name: 'Page test',
        enabled: false,
        sendEnabled: false,
      };
      s = (
        await send('post', '/pages', {
          ...pageFields,
          version: s.version,
          accessToken: 'fixture-page-token-123456789',
        }).expect(201)
      ).body;
      await send('post', '/pages', {
        ...pageFields,
        version: s.version,
        accessToken: 'fixture-page-token-123456789',
      }).expect(409);
      await send('patch', '/pages/999001', {
        ...pageFields,
        version: s.version,
        enabled: true,
      }).expect(400);
      await send('patch', '', { ...appFields, version: 0 }).expect(409);
      await send('post', '/pages/999001/check', { version: s.version }, saleToken).expect(403);
      await send('post', '/pages/999001/activate', { version: s.version }, saleToken).expect(403);
      await send('post', '/pages/999001/activate', { version: s.version }).expect(400);
      assert.equal(gatewayCalls, 0);
      const stored = JSON.stringify(
        (await db.messengerConfiguration.findUniqueOrThrow({ where: { id: 1 } })).config,
      );
      for (const value of [secret, verify, 'fixture-page-token-123456789']) {
        assert.equal(stored.includes(value), false);
        assert.equal(JSON.stringify(s).includes(value), false);
      }
      valid = false;
      s = (await send('post', '/pages/999001/check', { version: s.version }).expect(201)).body;
      assert.equal(s.pages[0].lastResult, 'TOKEN_FAILED');
      valid = true;
      s = (await send('post', '/pages/999001/check', { version: s.version }).expect(201)).body;
      assert.ok(s.pages[0].checkedAt);
      await http()
        .get('/api/v1/messenger/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '123' })
        .expect(403);
      await http()
        .get('/api/v1/messenger/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': verify, 'hub.challenge': '123' })
        .expect(200, '123');
      s = (await send('get', '').expect(200)).body;
      assert.ok(s.webhookVerifiedAt);
      await send('post', '/pages/999001/activate', { version: 0 }).expect(409);
      valid = false;
      s = (await send('post', '/pages/999001/activate', { version: s.version }).expect(201)).body;
      assert.equal(s.pages[0].enabled, false);
      assert.equal(s.pages[0].lastResult, 'TOKEN_FAILED');
      valid = true;
      subscriptionValid = false;
      s = (await send('post', '/pages/999001/activate', { version: s.version }).expect(201)).body;
      assert.equal(s.pages[0].enabled, false);
      assert.equal(s.pages[0].lastResult, 'SUBSCRIPTION_FAILED');
      subscriptionValid = true;
      s = (await send('post', '/pages/999001/activate', { version: s.version }).expect(201)).body;
      assert.equal(s.pages[0].enabled, true);
      assert.equal(s.pages[0].sendEnabled, false, 'Activation does not enable sending');
      assert.equal(s.pages[0].lastResult, 'RECEIVING_READY');
      let diagnostic = (await send('get', '/diagnostics').expect(200)).body;
      assert.equal(diagnostic.pages[0].receivedCount, 0);
      assert.equal(diagnostic.pages[0].lastInboundAt, null);
      s = (await send('post', '/pages/999001/subscribe', { version: s.version }).expect(201)).body;
      assert.ok(s.pages[0].registeredAt);
      s = (
        await send('patch', '', { ...appFields, version: s.version, sendEnabled: true }).expect(200)
      ).body;
      s = (
        await send('patch', '/pages/999001', {
          ...pageFields,
          version: s.version,
          enabled: true,
          sendEnabled: true,
        }).expect(200)
      ).body;
      let runtime = await app.get(MessengerConnections).runtime();
      assert.equal(runtime.pages[0].accessToken, 'fixture-page-token-123456789');
      assert.equal(runtime.pages[0].sendEnabled, true);
      const body = {
        object: 'page',
        entry: [
          {
            id: '999001',
            messaging: [
              {
                sender: { id: '999009' },
                recipient: { id: '999001' },
                timestamp: Date.now(),
                message: { mid: 'configuration-test-mid', text: 'Tin kiểm thử' },
              },
            ],
          },
        ],
      };
      const raw = JSON.stringify(body),
        signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
      await http()
        .post('/api/v1/messenger/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(raw)
        .expect(200);
      assert.equal(await db.chatConversation.count(), 1);
      diagnostic = (await send('get', '/diagnostics').expect(200)).body;
      assert.equal(diagnostic.pages[0].receivedCount, 1);
      assert.ok(diagnostic.pages[0].lastInboundAt);
      assert.equal(JSON.stringify(diagnostic).includes('Tin kiểm thử'), false);
      s = (await send('patch', '/pages/999001', { ...pageFields, version: s.version }).expect(200))
        .body;
      runtime = await app.get(MessengerConnections).runtime();
      assert.equal(runtime.pages[0].enabled, false);
      assert.equal(
        (
          await http()
            .get('/api/v1/messenger/pages')
            .set('Authorization', 'Bearer ' + token)
            .expect(200)
        ).body.length,
        0,
      );
      await http()
        .post('/api/v1/messenger/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(raw)
        .expect(200);
      assert.equal(await db.chatMessage.count(), 1);
      assert.equal((await send('get', '/diagnostics').expect(200)).body.pages[0].receivedCount, 1);
      // Correct a Page ID without reusing the old page's credentials or moving its history.
      const replacement = {
        ...pageFields,
        pageId: '999002',
        name: 'Fanpage đã sửa',
        accessToken: 'fixture-replacement-token-123456789',
      };
      await send('patch', '/pages/999001', {
        ...pageFields,
        pageId: replacement.pageId,
        version: s.version,
      }).expect(400);
      await send('patch', '/pages/999001', {
        ...replacement,
        enabled: true,
        version: s.version,
      }).expect(400);
      await send('patch', '/pages/999001', {
        ...replacement,
        version: 0,
      }).expect(409);
      await send(
        'patch',
        '/pages/999001',
        {
          ...replacement,
          version: s.version,
        },
        saleToken,
      ).expect(403);
      s = (
        await send('post', '/pages', {
          ...replacement,
          pageId: '999003',
          version: s.version,
        }).expect(201)
      ).body;
      await send('patch', '/pages/999001', {
        ...replacement,
        pageId: '999003',
        version: s.version,
      }).expect(409);
      s = (
        await send('patch', '/pages/999001', {
          ...replacement,
          version: s.version,
        }).expect(200)
      ).body;
      assert.equal(s.pages[0].pageId, '999002');
      assert.equal(s.pages[0].checkedAt, null);
      assert.equal(s.pages[0].registeredAt, null);
      assert.equal(s.pages[0].enabled, false);
      assert.equal(s.pages[0].sendEnabled, false);
      assert.ok(s.webhookVerifiedAt, 'Page correction preserves app webhook verification');
      runtime = await app.get(MessengerConnections).runtime();
      assert.equal(runtime.pages[0].accessToken, replacement.accessToken);
      assert.equal((await db.chatConversation.findFirstOrThrow()).pageId, '999001');
      s = (
        await send('patch', '/pages/999002', {
          ...pageFields,
          pageId: '999002',
          name: 'Tên mới',
          version: s.version,
        }).expect(200)
      ).body;
      assert.equal(s.pages[0].name, 'Tên mới');
      assert.equal(
        (await app.get(MessengerConnections).runtime()).pages[0].accessToken,
        replacement.accessToken,
      );
      const audits = JSON.stringify(
        await db.auditLog.findMany({ where: { entity: 'MessengerConfiguration' } }),
      );
      for (const value of [secret, verify, 'fixture-page-token-123456789', replacement.accessToken])
        assert.equal(audits.includes(value), false);
      const service2 = new MessengerConnections(db, {
        call: async () => {
          throw Error('No network');
        },
      });
      assert.equal(
        (await service2.view()).version,
        s.version,
        'Another instance sees persisted configuration',
      );
    } finally {
      if (app) await app.close();
      if (db) await db.$disconnect();
      if (!/^test_connections_[a-f0-9]{32}$/.test(schema)) throw Error('Invalid test schema');
      await adminDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await adminDb.$disconnect();
    }
  },
);
