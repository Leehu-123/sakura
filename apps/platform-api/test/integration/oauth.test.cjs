const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const { PrismaClient } = require('@sakura/database');
const { JwtService } = require('@nestjs/jwt');

test(
  'Facebook OAuth: bound sessions, state, review, encrypted atomic Page import and failure recovery',
  { timeout: process.env.SAKURA_OAUTH_UI_QA === 'true' ? 360000 : 120000 },
  async (t) => {
    const root = resolve(__dirname, '../../../..'),
      originalUrl = process.env.DATABASE_URL;
    const url = new URL(originalUrl),
      schema = 'test_oauth_' + randomUUID().replaceAll('-', '');
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || process.env.NODE_ENV === 'production')
      throw Error('Local test only');
    const adminDb = new PrismaClient({ datasources: { db: { url: originalUrl } } });
    let app, db, preview, simulation;
    try {
      await adminDb.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
      url.searchParams.set('schema', schema);
      Object.assign(process.env, {
        DATABASE_URL: url.toString(),
        NODE_ENV: 'test',
        WEB_ORIGIN: 'https://sakura.test',
        COOKIE_SECURE: 'true',
        JWT_SECRET: 'oauth-test-only-'.repeat(5),
        MESSENGER_CONFIG_KEY: 'a4'.repeat(32),
        MESSENGER_ENABLED: 'false',
        MESSENGER_SEND_ENABLED: 'false',
        MESSENGER_PAGES_JSON: '',
        SEED_ADMIN_EMAIL: 'admin@oauth.test',
        SEED_ADMIN_PASSWORD: 'OAuth-test-only-password-123',
      });
      for (const args of [
        [
          resolve(root, 'node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          '--schema',
          resolve(root, 'packages/database/prisma/schema.prisma'),
        ],
        [resolve(root, 'packages/database/dist-seed/packages/database/prisma/seed.js')],
      ])
        execFileSync(process.execPath, args, {
          cwd: root,
          env: process.env,
          windowsHide: true,
          stdio: 'pipe',
        });
      const { Test } = require('@nestjs/testing'),
        { AppModule } = require('../../dist/app'),
        { configureApp } = require('../../dist/bootstrap');
      const { MetaOAuthGateway } = require('../../dist/messenger/oauth.gateway'),
        { MessengerOAuth } = require('../../dist/messenger/oauth');
      const candidates = [
        {
          pageId: '77801',
          name: 'Sakura QA One',
          token: 'oauth-page-token-one-123456',
          canMessage: true,
        },
        {
          pageId: '77802',
          name: 'Sakura QA Two',
          token: 'oauth-page-token-two-123456',
          canMessage: true,
        },
        { pageId: '77803', name: 'Read only Page', token: '', canMessage: false },
      ];
      let discoveries = 0,
        validations = 0,
        failDiscovery = false,
        failSubscription = '',
        subscriptions = [],
        failPage = '';
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MetaOAuthGateway)
        .useValue({
          discover: async (code, redirect, config) => {
            discoveries++;
            assert.equal(redirect, 'https://sakura.test/api/v1/messenger/oauth/callback');
            assert.equal(config.configId, '55502');
            if (failDiscovery) throw Error('sensitive-provider-error-with-token');
            return candidates;
          },
          validatePage: async (p) => {
            validations++;
            if (p.pageId === failPage)
              throw new (require('@nestjs/common').BadRequestException)(
                'Page no longer authorized',
              );
          },
          subscribePage: async (p) => {
            subscriptions.push(p.pageId);
            if (p.pageId === failSubscription)
              throw new (require('@nestjs/common').BadRequestException)('Subscription denied');
          },
        })
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.init();
      db = new PrismaClient();
      const admin = await db.user.update({
        where: { email: 'admin@oauth.test' },
        data: { mustChangePassword: false },
      });
      const role = await db.role.findUniqueOrThrow({ where: { code: 'regional_sales' } });
      const sale = await db.user.create({
        data: {
          email: 'sale@oauth.test',
          displayName: 'Sale',
          passwordHash: admin.passwordHash,
          mustChangePassword: false,
          roleAssignments: { create: { roleId: role.id } },
        },
      });
      async function mint(userId = admin.id) {
        const s = await db.session.create({
          data: { userId, expiresAt: new Date(Date.now() + 86400000) },
        });
        return {
          sid: s.id,
          token: new JwtService({ secret: process.env.JWT_SECRET }).sign(
            { sub: userId, sid: s.id },
            { issuer: 'sakura-platform', audience: 'sakura', expiresIn: '15m' },
          ),
        };
      }
      const auth = await mint(),
        saleAuth = await mint(sale.id),
        second = await mint();
      const http = () => request(app.getHttpServer()),
        prefix = '/api/v1/messenger';
      const req = (method, path, body, who = auth) => {
        const r = http()
          [method](prefix + path)
          .set('Authorization', 'Bearer ' + who.token)
          .set('Origin', 'https://sakura.test');
        return body === undefined ? r : r.send(body);
      };
      const fields = {
        appId: '55501',
        graphVersion: 'v99.0',
        webhookUrl: '',
        enabled: false,
        sendEnabled: false,
        facebookLoginEnabled: true,
        facebookLoginConfigId: '55502',
      };
      await req('patch', '/configuration', {
        ...fields,
        version: 0,
        appSecret: 'oauth-app-secret-12345678',
      }).expect(200);
      async function start(who = auth) {
        const response = await req('post', '/oauth/start', {}, who).expect(201);
        const authorization = new URL(response.body.authorizationUrl);
        return {
          ...response.body,
          state: authorization.searchParams.get('state'),
          cookie: response.headers['set-cookie'][0].split(';')[0],
          response,
        };
      }
      const callback = (a, extra = {}) =>
        http()
          .get(prefix + '/oauth/callback')
          .set('Cookie', a.cookie)
          .query({ state: a.state, code: 'fake-authorization-code', ...extra });
      const status = (a, who = auth) => req('get', '/oauth/attempts/' + a.id, undefined, who);
      const confirm = (a, ids = ['77801', '77802']) =>
        req('post', '/oauth/attempts/' + a.id + '/confirm', { pageIds: ids });
      const service = app.get(MessengerOAuth);

      await t.test(
        'only global configuration managers with a matching Origin can start; local HTTP stays configuration-only',
        async () => {
          await http()
            .post(prefix + '/oauth/start')
            .send({})
            .expect(401);
          await req('post', '/oauth/start', {}, saleAuth).expect(403);
          await http()
            .post(prefix + '/oauth/start')
            .set('Authorization', 'Bearer ' + auth.token)
            .set('Origin', 'https://untrusted.test')
            .send({})
            .expect(403);
          process.env.WEB_ORIGIN = 'http://localhost:5173';
          assert.equal((await req('get', '/oauth/info').expect(200)).body.ready, false);
          await http()
            .post(prefix + '/oauth/start')
            .set('Authorization', 'Bearer ' + auth.token)
            .set('Origin', 'http://localhost:5173')
            .send({})
            .expect(400);
          process.env.WEB_ORIGIN = 'https://sakura.test';
          assert.equal(discoveries, 0);
        },
      );
      await t.test(
        'unguessable state + HttpOnly Secure callback cookie; mismatches never exchange the code',
        async () => {
          const a = await start();
          assert.match(a.state, /^[a-f0-9]{64}$/);
          assert.match(a.response.headers['set-cookie'][0], /HttpOnly/);
          assert.match(a.response.headers['set-cookie'][0], /Secure/);
          assert.match(a.response.headers['set-cookie'][0], /SameSite=Lax/);
          assert.equal(new URL(a.authorizationUrl).searchParams.get('response_type'), 'code');
          assert.ok(!JSON.stringify(a.response.body).includes('oauth-app-secret'));
          await http()
            .get(prefix + '/oauth/callback')
            .query({ state: a.state, code: 'fake' })
            .expect(303);
          await callback(a, { state: 'f'.repeat(64) }).expect(303);
          assert.equal(discoveries, 0);
          assert.equal((await status(a).expect(200)).body.status, 'WAITING');
          await status(a, second).expect(404);
          await status(a, saleAuth).expect(403);
          await callback(a)
            .expect(303)
            .expect('Location', '/api/v1/messenger/oauth/result?status=ready');
          assert.equal(discoveries, 1);
          await callback(a)
            .expect(303)
            .expect('Location', '/api/v1/messenger/oauth/result?status=failed');
          assert.equal(discoveries, 1);
          const view = (await status(a).expect(200)).body;
          assert.equal(view.pages.length, 3);
          assert.equal(view.pages[2].canMessage, false);
          assert.ok(!JSON.stringify(view).includes('oauth-page-token'));
          assert.ok(!service.attempts.get(a.id).payload.includes('oauth-page-token'));
          await confirm(a, ['unknown']).expect(400);
          await confirm(a, ['77803']).expect(400);
          await confirm(a, ['77801', '77801']).expect(400);
          await confirm(a, []).expect(400);
          assert.equal(validations, 0);
        },
      );
      await t.test(
        'one selected Page failing verification prevents the entire batch from saving',
        async () => {
          const a = await start();
          await callback(a).expect(303);
          failPage = '77802';
          await confirm(a).expect(400);
          assert.equal((await req('get', '/configuration').expect(200)).body.pages.length, 0);
          assert.equal(service.attempts.get(a.id).payload, '');
          failPage = '';
        },
      );
      await t.test(
        'concurrent confirmations save once, encrypt tokens, keep sending off and audit the administrator',
        async () => {
          const a = await start();
          await callback(a).expect(303);
          const responses = await Promise.all([confirm(a), confirm(a)]);
          assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
          const view = responses.find((r) => r.status === 201).body.configuration;
          assert.equal(view.pages.length, 2);
          assert.ok(
            view.pages.every(
              (p) => p.hasToken && p.checkedAt && !p.enabled && !p.sendEnabled && !p.registeredAt,
            ),
          );
          assert.ok(!JSON.stringify(view).includes('oauth-page-token'));
          const row = await db.messengerConfiguration.findUniqueOrThrow({ where: { id: 1 } });
          assert.ok(!JSON.stringify(row.config).includes('oauth-page-token'));
          assert.equal(service.attempts.get(a.id).status, 'DONE');
          assert.equal(service.attempts.get(a.id).payload, '');
          const logs = await db.auditLog.findMany({
            where: { action: 'messenger.oauth.pages.saved' },
          });
          assert.equal(logs.length, 1);
          assert.equal(logs[0].actorId, admin.id);
          assert.deepEqual(logs[0].metadata.pageIds, ['77801', '77802']);
          assert.ok(!JSON.stringify(logs).includes('oauth-page-token'));
        },
      );
      await t.test(
        'reconnecting an existing Page updates that Page only, preserving conversations',
        async () => {
          const chat = await db.chatConversation.create({
            data: { pageId: '77801', psid: '88901' },
          });
          const a = await start();
          await callback(a).expect(303);
          assert.equal((await status(a).expect(200)).body.pages[0].existing, true);
          await confirm(a, ['77801']).expect(201);
          assert.equal((await req('get', '/configuration').expect(200)).body.pages.length, 2);
          assert.ok(await db.chatConversation.findUnique({ where: { id: chat.id } }));
        },
      );
      await t.test(
        'configuration changes reject both old callbacks and previously reviewed selections',
        async () => {
          const a = await start();
          await callback(a).expect(303);
          let version = (await req('get', '/configuration').expect(200)).body.version;
          await req('patch', '/configuration', { ...fields, version }).expect(200);
          await confirm(a).expect(409);
          const b = await start();
          version = (await req('get', '/configuration').expect(200)).body.version;
          await req('patch', '/configuration', { ...fields, version }).expect(200);
          const before = discoveries;
          await callback(b)
            .expect(303)
            .expect('Location', '/api/v1/messenger/oauth/result?status=failed');
          assert.equal(discoveries, before);
        },
      );
      await t.test(
        'automatic connection subscribes and enables selected Pages without reactivating unrelated Pages',
        async () => {
          let a = await start();
          await callback(a).expect(303);
          await req('post', '/oauth/attempts/' + a.id + '/confirm', {
            pageIds: ['77801'],
            connectNow: true,
          }).expect(400);
          assert.equal(subscriptions.length, 0, 'No subscriptions before shared webhook setup');
          let row = await db.messengerConfiguration.findUniqueOrThrow({ where: { id: 1 } });
          const crypto = require('../../dist/messenger/connection-crypto');
          await db.messengerConfiguration.update({
            where: { id: 1 },
            data: {
              version: { increment: 1 },
              config: {
                ...row.config,
                webhookUrl: 'https://sakura.test/api/v1/messenger/webhook',
                verify: crypto.seal('oauth-test-verify-token-123456', 'verify-token'),
                webhookVerifiedAt: new Date().toISOString(),
                enabled: false,
                sendEnabled: false,
                pages: row.config.pages.map((p) => ({ ...p, enabled: true, sendEnabled: true })),
              },
            },
          });
          assert.equal((await req('get', '/oauth/info').expect(200)).body.automaticReady, true);
          a = await start();
          await callback(a).expect(303);
          const result = (
            await req('post', '/oauth/attempts/' + a.id + '/confirm', {
              pageIds: ['77801'],
              connectNow: true,
            }).expect(201)
          ).body;
          assert.equal(result.connected, true);
          assert.equal(result.configuration.enabled, true);
          assert.equal(result.configuration.sendEnabled, true);
          const selected = result.configuration.pages.find((p) => p.pageId === '77801');
          const unrelated = result.configuration.pages.find((p) => p.pageId === '77802');
          assert.ok(
            selected.enabled && selected.sendEnabled && selected.checkedAt && selected.registeredAt,
          );
          assert.equal(unrelated.enabled, false);
          assert.equal(unrelated.sendEnabled, false);
          assert.deepEqual(subscriptions, ['77801']);
          row = await db.messengerConfiguration.findUniqueOrThrow({ where: { id: 1 } });
          a = await start();
          await callback(a).expect(303);
          failSubscription = '77802';
          await req('post', '/oauth/attempts/' + a.id + '/confirm', {
            pageIds: ['77801', '77802'],
            connectNow: true,
          }).expect(400);
          assert.deepEqual(
            (await db.messengerConfiguration.findUniqueOrThrow({ where: { id: 1 } })).config,
            row.config,
            'Failed subscription must not change local configuration',
          );
          assert.equal(service.attempts.get(a.id).payload, '');
          failSubscription = '';
          a = await start();
          await callback(a).expect(303);
          const retry = (
            await req('post', '/oauth/attempts/' + a.id + '/confirm', {
              pageIds: ['77802'],
              connectNow: true,
            }).expect(201)
          ).body;
          assert.ok(
            retry.configuration.pages.every((p) => p.enabled && p.sendEnabled && p.registeredAt),
          );
          assert.ok(await db.chatConversation.findFirst({ where: { pageId: '77801' } }));
        },
      );
      await t.test(
        'revoked sessions cannot finish OAuth, and expired attempts are removed',
        async () => {
          const who = await mint(),
            a = await start(who);
          await db.session.update({ where: { id: who.sid }, data: { revokedAt: new Date() } });
          const before = discoveries;
          await callback(a)
            .expect(303)
            .expect('Location', '/api/v1/messenger/oauth/result?status=failed');
          assert.equal(discoveries, before);
          const b = await start();
          service.attempts.get(b.id).expiresAt = Date.now() - 1;
          await status(b).expect(404);
          assert.equal(service.attempts.has(b.id), false);
        },
      );
      await t.test(
        'cancelled, replaced and provider-failed attempts never write Page configuration or expose provider secrets',
        async () => {
          const a = await start();
          await callback(a, { error: 'access_denied' }).expect(303);
          assert.equal((await status(a).expect(200)).body.status, 'CANCELLED');
          await confirm(a).expect(409);
          const b = await start(),
            c = await start();
          await status(b).expect(404);
          await req('post', '/oauth/attempts/' + c.id + '/cancel', {}).expect(201);
          await callback(c)
            .expect(303)
            .expect('Location', '/api/v1/messenger/oauth/result?status=failed');
          const d = await start();
          failDiscovery = true;
          await callback(d)
            .expect(303)
            .expect('Location', '/api/v1/messenger/oauth/result?status=failed');
          const view = (await status(d).expect(200)).body;
          assert.equal(view.status, 'FAILED');
          assert.ok(!JSON.stringify(view).includes('sensitive-provider-error'));
          await http()
            .get(prefix + '/oauth/result?status=%3Cscript%3Ebad%3C%2Fscript%3E')
            .expect(200)
            .expect('Referrer-Policy', 'no-referrer')
            .then((r) => assert.ok(!r.text.includes('<script>')));
        },
      );
      if (process.env.SAKURA_OAUTH_UI_QA === 'true') {
        const fs = require('node:fs'),
          stop = resolve(root, '.local/stop-oauth-ui-test');
        if (fs.existsSync(stop)) fs.unlinkSync(stop);
        process.env.WEB_ORIGIN = 'http://127.0.0.1:5189';
        process.env.COOKIE_SECURE = 'false';
        service.info = async () => ({
          ready: true,
          automaticReady: true,
          setupMessage: null,
          reasons: [
            'Môi trường thử riêng: danh sách Facebook được giả lập, không đăng nhập hoặc gọi Meta thật.',
          ],
          redirectUri: process.env.WEB_ORIGIN + '/api/v1/messenger/oauth/callback',
        });
        const actualStart = service.start.bind(service);
        service.start = async (actor) => ({
          ...(await actualStart(actor)),
          authorizationUrl: process.env.WEB_ORIGIN + '/api/v1/messenger/oauth/result?status=ready',
        });
        simulation = setInterval(() => {
          for (const a of service.attempts.values())
            if (a.status === 'WAITING') {
              a.payload = require('../../dist/messenger/connection-crypto').seal(
                JSON.stringify(candidates),
                'oauth:' + a.id,
              );
              a.status = 'READY';
            }
        }, 1000);
        await app.listen(3304, '127.0.0.1');
        preview = require('node:child_process').spawn(
          resolve(root, '.local/caddy/caddy.exe'),
          ['run', '--config', resolve(root, 'infra/Caddyfile'), '--adapter', 'caddyfile'],
          {
            windowsHide: true,
            stdio: 'ignore',
            env: {
              ...process.env,
              SAKURA_DOMAIN: 'http://127.0.0.1:5189',
              SAKURA_BIND: '127.0.0.1',
              SAKURA_API_UPSTREAM: '127.0.0.1:3304',
              SAKURA_WEB_ROOT: resolve(root, 'apps/sale-web/dist').replaceAll('\\', '/'),
            },
          },
        );
        console.log('OAuth UI simulation ready at http://127.0.0.1:5189');
        await new Promise((resolveWait) => {
          const started = Date.now(),
            timer = setInterval(() => {
              if (fs.existsSync(stop) || Date.now() - started > 240000) {
                clearInterval(timer);
                resolveWait();
              }
            }, 1000);
        });
        if (fs.existsSync(stop)) fs.unlinkSync(stop);
      }
    } finally {
      if (simulation) clearInterval(simulation);
      if (preview) preview.kill();
      if (app) await app.close();
      if (db) await db.$disconnect();
      if (!/^test_oauth_[a-f0-9]{32}$/.test(schema)) throw Error('Invalid schema');
      await adminDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await adminDb.$disconnect();
    }
  },
);
