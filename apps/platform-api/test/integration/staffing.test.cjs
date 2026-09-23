const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const { PrismaClient } = require('@sakura/database');
const { JwtService } = require('@nestjs/jwt');
test(
  'Teams, shifts, exclusive work ownership, handover and preserved message authors',
  { timeout: process.env.SAKURA_UI_QA === 'true' ? 360000 : 120000 },
  async (t) => {
    const root = resolve(__dirname, '../../../..'),
      originalUrl = process.env.DATABASE_URL;
    const url = new URL(originalUrl),
      schema = 'test_staffing_' + randomUUID().replaceAll('-', '');
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || process.env.NODE_ENV === 'production')
      throw Error('Local test only');
    const adminDb = new PrismaClient({ datasources: { db: { url: originalUrl } } });
    let app, db, preview;
    try {
      await adminDb.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
      url.searchParams.set('schema', schema);
      Object.assign(process.env, {
        DATABASE_URL: url.toString(),
        NODE_ENV: 'test',
        WEB_ORIGIN: 'http://localhost:5173',
        COOKIE_SECURE: 'false',
        JWT_SECRET: 'staffing-test-only-'.repeat(5),
        SEED_ADMIN_EMAIL: 'admin@staffing.test',
        SEED_ADMIN_PASSWORD: 'Staffing-test-only-password-123',
        MESSENGER_ENABLED: 'false',
        MESSENGER_SEND_ENABLED: 'false',
        MESSENGER_PAGES_JSON: '',
      });
      if (process.env.SAKURA_UI_QA === 'true') process.env.WEB_ORIGIN = 'http://127.0.0.1:5188';
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
      const { MessengerTransport } = require('../../dist/messenger/transport'),
        { MessengerConnections } = require('../../dist/messenger/connection.service'),
        { MessengerService } = require('../../dist/messenger/messenger.service');
      const source = {
        enabled: true,
        sendEnabled: true,
        secret: 'staffing-fake-secret-123456789',
        verifyToken: 'staffing-fake-verify-token-123456789',
        version: 'v99.0',
        pages: [
          { pageId: '99101', name: 'Page nhóm', accessToken: 'fake-page-token', sendEnabled: true },
        ],
      };
      let sends = 0;
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MessengerTransport)
        .useValue({
          send: async () => {
            sends++;
            return { state: 'SENT', mid: 'fake-' + sends };
          },
        })
        .overrideProvider(MessengerConnections)
        .useValue({
          runtime: async () => source,
          view: async () => ({ pages: [{ pageId: '99101', name: 'Page nhóm' }] }),
        })
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.init();
      db = new PrismaClient();
      const admin = await db.user.update({
        where: { email: 'admin@staffing.test' },
        data: { mustChangePassword: false },
      });
      const role = await db.role.findUniqueOrThrow({ where: { code: 'regional_sales' } });
      async function user(name) {
        return db.user.create({
          data: {
            email: name + '@staffing.test',
            displayName: name,
            passwordHash: admin.passwordHash,
            mustChangePassword: false,
            roleAssignments: { create: { roleId: role.id } },
          },
        });
      }
      const a = await user('Ca A'),
        b = await user('Ca B'),
        outsider = await user('Ngoai nhom');
      async function mint(id) {
        const s = await db.session.create({
          data: { userId: id, expiresAt: new Date(Date.now() + 86400000) },
        });
        return new JwtService({ secret: process.env.JWT_SECRET }).sign(
          { sub: id, sid: s.id },
          { issuer: 'sakura-platform', audience: 'sakura', expiresIn: '15m' },
        );
      }
      const tokens = {
        [admin.id]: await mint(admin.id),
        [a.id]: await mint(a.id),
        [b.id]: await mint(b.id),
        [outsider.id]: await mint(outsider.id),
      };
      const http = () => request(app.getHttpServer());
      function req(method, path, body, uid = admin.id) {
        const r = http()
          [method]('/api/v1/messenger/' + path)
          .set('Authorization', 'Bearer ' + tokens[uid]);
        return body === undefined ? r : r.send(body);
      }
      const chat = await db.chatConversation.create({
        data: { pageId: '99101', psid: '88101', lastInboundAt: new Date() },
      });
      const legacy = await db.chatConversation.create({ data: { pageId: '99102', psid: '88102' } });
      let team, sa, sb, owner, next, sent;
      const teamBody = {
        version: 0,
        name: 'Tư vấn theo ca',
        isActive: true,
        memberIds: [a.id, b.id, admin.id],
        pageIds: ['99101'],
      };
      const current = () => db.chatConversation.findUniqueOrThrow({ where: { id: chat.id } });
      async function work(uid, action, targetUserId) {
        const c = await current();
        return req(
          'post',
          'staffing/conversations/' + chat.id,
          {
            version: c.version,
            inboundSeq: c.inboundSeq,
            action,
            note: 'Ghi chú công việc kiểm thử',
            ...(targetUserId ? { targetUserId } : {}),
          },
          uid,
        );
      }
      await t.test('Configuration authorization, membership and unique Page routing', async () => {
        await http().get('/api/v1/messenger/staffing').expect(401);
        await req('post', 'staffing/teams', teamBody, a.id).expect(403);
        team = (await req('post', 'staffing/teams', teamBody).expect(201)).body;
        assert.equal((await current()).teamId, team.id);
        await req('post', 'staffing/teams', teamBody).expect(409);
        await req('post', 'staffing/teams', {
          ...teamBody,
          pageIds: [],
          memberIds: [randomUUID()],
        }).expect(400);
        await req('get', 'conversations/' + chat.id, undefined, a.id).expect(200);
        await req('get', 'conversations/' + chat.id, undefined, outsider.id).expect(404);
        await req('get', 'conversations/' + legacy.id, undefined, a.id).expect(404);
        assert.equal(
          (await req('get', 'conversations?filter=WAITING', undefined, a.id).expect(200)).body
            .total,
          1,
        );
      });
      await t.test(
        'Start shifts only for members; reject duplicate shifts and edits while staff are on duty',
        async () => {
          await req(
            'post',
            'staffing/shifts',
            { teamId: team.id, label: 'Ngoài nhóm' },
            outsider.id,
          ).expect(403);
          sa = (
            await req(
              'post',
              'staffing/shifts',
              { teamId: team.id, label: 'Ca sáng A' },
              a.id,
            ).expect(201)
          ).body;
          sb = (
            await req(
              'post',
              'staffing/shifts',
              { teamId: team.id, label: 'Ca sáng B' },
              b.id,
            ).expect(201)
          ).body;
          await req('post', 'staffing/shifts', { teamId: team.id, label: 'Ca lặp' }, a.id).expect(
            409,
          );
          await req('patch', 'staffing/teams/' + team.id, {
            ...teamBody,
            version: team.version,
            name: 'Đổi khi trực',
          }).expect(409);
        },
      );
      await t.test(
        'Concurrent claims yield one owner and a conflict; legacy assignment cannot bypass shift ownership',
        async () => {
          const c = await current(),
            body = {
              version: c.version,
              inboundSeq: c.inboundSeq,
              action: 'CLAIM',
              note: 'Cùng nhận hội thoại',
            };
          const results = await Promise.all([
            req('post', 'staffing/conversations/' + chat.id, body, a.id),
            req('post', 'staffing/conversations/' + chat.id, body, b.id),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          owner = (await current()).supportUserId;
          next = owner === a.id ? b.id : a.id;
          await req('patch', 'conversations/' + chat.id + '/support', {
            version: (await current()).version,
            userId: next,
          }).expect(400);
          assert.equal((await work(next, 'COMPLETE')).status, 403);
          assert.equal((await work(next, 'TAKEOVER')).status, 403);
          await req(
            'post',
            'conversations/' + chat.id + '/reply',
            { text: 'Không phải người nhận', requestKey: randomUUID() },
            next,
          ).expect(409);
          assert.equal(sends, 0);
        },
      );
      await t.test(
        'Reply records the actual sender and shift, handoff does not reattribute old messages',
        async () => {
          sent = (
            await req(
              'post',
              'conversations/' + chat.id + '/reply',
              { text: 'Tin của người nhận đầu', requestKey: randomUUID() },
              owner,
            ).expect(201)
          ).body;
          const recorded = await db.chatMessage.findUniqueOrThrow({ where: { id: sent.id } });
          assert.equal(recorded.actorId, owner);
          assert.equal(recorded.shiftId, owner === a.id ? sa.id : sb.id);
          assert.equal((await work(owner, 'HANDOFF', outsider.id)).status, 400);
          assert.equal((await work(owner, 'HANDOFF', next)).status, 201);
          assert.equal((await current()).supportUserId, next);
          await req(
            'post',
            'conversations/' + chat.id + '/reply',
            { text: 'Người cũ không gửi tiếp', requestKey: randomUUID() },
            owner,
          ).expect(409);
          await req(
            'post',
            'conversations/' + chat.id + '/reply',
            { text: 'Người nhận bàn giao trả lời', requestKey: randomUUID() },
            next,
          ).expect(201);
          assert.equal(
            (await db.chatMessage.findUnique({ where: { id: sent.id } })).actorId,
            owner,
          );
          const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
          const history = (
            await req(
              'get',
              'history?from=' + day + '&to=' + day + '&shiftId=' + recorded.shiftId,
            ).expect(200)
          ).body;
          assert.equal(history.total, 1);
          assert.equal(history.items[0].actor.id, owner);
          assert.ok(history.items[0].shift.label);
          assert.equal(await db.customerAssignment.count(), 0);
        },
      );
      await t.test(
        'Uncertain send blocks handoff/end; ending a shift releases work with notes and cannot be forced by peers',
        async () => {
          const pending = await db.chatMessage.create({
            data: {
              conversationId: chat.id,
              actorId: next,
              requestKey: randomUUID(),
              direction: 'OUTBOUND',
              state: 'UNKNOWN',
              text: 'Chờ đối chiếu',
              sourceAt: new Date(),
            },
          });
          const active = next === a.id ? sa : sb;
          assert.equal((await work(next, 'RELEASE')).status, 409);
          await req(
            'post',
            'staffing/shifts/' + active.id + '/end',
            { note: 'Kết thúc ca chưa đối chiếu' },
            next,
          ).expect(409);
          await req(
            'post',
            'staffing/shifts/' + active.id + '/end',
            { note: 'Đồng nghiệp kết thúc hộ' },
            owner,
          ).expect(404);
          await db.chatMessage.update({ where: { id: pending.id }, data: { state: 'FAILED' } });
          const ended = (
            await req(
              'post',
              'staffing/shifts/' + active.id + '/end',
              { note: 'Khách đang chờ báo giá' },
              next,
            ).expect(201)
          ).body;
          assert.equal(ended.returnedToQueue, 1);
          assert.equal((await current()).supportUserId, null);
          assert.equal((await current()).workState, 'WAITING');
          await req(
            'post',
            'conversations/' + chat.id + '/reply',
            { text: 'Đã hết ca', requestKey: randomUUID() },
            next,
          ).expect(409);
          const ctx = (
            await req('get', 'staffing/conversations/' + chat.id, undefined, owner).expect(200)
          ).body;
          assert.ok(ctx.events.some((e) => e.metadata.note === 'Khách đang chờ báo giá'));
        },
      );
      await t.test(
        'Complete clears work, a new inbound reopens it, duplicate webhook does not reopen again',
        async () => {
          assert.equal((await work(owner, 'CLAIM')).status, 201);
          const stale = await current();
          await db.chatConversation.update({
            where: { id: chat.id },
            data: { inboundSeq: { increment: 1 } },
          });
          await req(
            'post',
            'staffing/conversations/' + chat.id,
            {
              version: stale.version,
              inboundSeq: stale.inboundSeq,
              action: 'COMPLETE',
              note: 'Chưa xem tin mới',
            },
            owner,
          ).expect(409);
          assert.equal((await work(owner, 'COMPLETE')).status, 201);
          assert.equal((await current()).workState, 'DONE');
          const payload = {
            object: 'page',
            entry: [
              {
                id: '99101',
                messaging: [
                  {
                    sender: { id: '88101' },
                    recipient: { id: '99101' },
                    timestamp: Date.now(),
                    message: { mid: 'shift-inbound-1', text: 'Khách hỏi tiếp' },
                  },
                ],
              },
            ],
          };
          const service = app.get(MessengerService);
          await service.receive(payload, source);
          assert.equal((await current()).workState, 'WAITING');
          assert.equal((await work(owner, 'CLAIM')).status, 201);
          assert.equal((await work(owner, 'COMPLETE')).status, 201);
          await service.receive(payload, source);
          assert.equal((await current()).workState, 'DONE');
          const adminShift = (
            await req('post', 'staffing/shifts', { teamId: team.id, label: 'Ca quản trị' }).expect(
              201,
            )
          ).body;
          assert.equal((await work(admin.id, 'TAKEOVER')).status, 201);
          await req('post', 'staffing/shifts/' + adminShift.id + '/end', {
            note: 'Trả lại hàng chờ',
          }).expect(201);
        },
      );
      await t.test(
        'Removing membership after shifts end revokes Page chat access while retaining authors and shift history',
        async () => {
          const remaining = owner === a.id ? sa : sb;
          await req('post', 'staffing/shifts/' + remaining.id + '/end', {
            note: 'Quản trị kết thúc ca bị bỏ quên',
          }).expect(201);
          await req('patch', 'staffing/teams/' + team.id, {
            ...teamBody,
            version: team.version,
            memberIds: [admin.id],
          }).expect(200);
          await req('get', 'conversations/' + chat.id, undefined, a.id).expect(404);
          await req('get', 'staffing/conversations/' + chat.id, undefined, b.id).expect(404);
          assert.equal(
            (await db.chatMessage.findUnique({ where: { id: sent.id } })).actorId,
            owner,
          );
          assert.ok(await db.chatShift.count({ where: { endedAt: { not: null } } }));
        },
      );
      if (process.env.SAKURA_UI_QA === 'true') {
        const fs = require('node:fs');
        const stop = resolve(root, '.local/stop-staffing-ui-test');
        if (fs.existsSync(stop)) fs.unlinkSync(stop);
        await app.listen(3303, '127.0.0.1');
        preview = require('node:child_process').spawn(
          resolve(root, '.local/caddy/caddy.exe'),
          ['run', '--config', resolve(root, 'infra/Caddyfile'), '--adapter', 'caddyfile'],
          {
            windowsHide: true,
            stdio: 'ignore',
            env: {
              ...process.env,
              SAKURA_DOMAIN: 'http://127.0.0.1:5188',
              SAKURA_BIND: '127.0.0.1',
              SAKURA_API_UPSTREAM: '127.0.0.1:3303',
              SAKURA_WEB_ROOT: resolve(root, 'apps/sale-web/dist').replaceAll('\\', '/'),
            },
          },
        );
        console.log('Isolated UI fixture ready at http://127.0.0.1:5188');
        await new Promise((resolveWait) => {
          const started = Date.now();
          const timer = setInterval(() => {
            if (fs.existsSync(stop) || Date.now() - started > 240000) {
              clearInterval(timer);
              resolveWait();
            }
          }, 1000);
        });
        if (fs.existsSync(stop)) fs.unlinkSync(stop);
      }
    } finally {
      if (preview) preview.kill();
      if (app) await app.close();
      if (db) await db.$disconnect();
      if (!/^test_staffing_[a-f0-9]{32}$/.test(schema)) throw Error('Invalid schema');
      await adminDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await adminDb.$disconnect();
    }
  },
);
