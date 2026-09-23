const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const { PrismaClient } = require('@sakura/database');
const { JwtService } = require('@nestjs/jwt');

test(
  'Reply history: authorization, date boundaries, real authors, states and exact-message navigation',
  { timeout: 120000 },
  async (t) => {
    const root = resolve(__dirname, '../../../..'),
      originalUrl = process.env.DATABASE_URL;
    const url = new URL(originalUrl),
      schema = 'test_history_' + randomUUID().replaceAll('-', '');
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
        JWT_SECRET: 'history-integration-only-'.repeat(5),
        MESSENGER_ENABLED: 'false',
        MESSENGER_SEND_ENABLED: 'false',
        MESSENGER_PAGE_ID: '',
        MESSENGER_PAGES_JSON: '',
        SEED_ADMIN_EMAIL: 'admin@history.test',
        SEED_ADMIN_PASSWORD: 'History-integration-password-123',
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
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.init();
      db = new PrismaClient();
      const admin = await db.user.update({
        where: { email: 'admin@history.test' },
        data: { mustChangePassword: false },
      });
      const role = await db.role.findUniqueOrThrow({ where: { code: 'regional_sales' } });
      const sale = await db.user.create({
        data: {
          email: 'sale@history.test',
          displayName: 'Nhân viên trùng tên',
          passwordHash: admin.passwordHash,
          mustChangePassword: false,
          roleAssignments: { create: { roleId: role.id } },
        },
      });
      const former = await db.user.create({
        data: {
          email: 'former@history.test',
          displayName: sale.displayName,
          passwordHash: admin.passwordHash,
          status: 'DISABLED',
        },
      });
      async function mint(userId) {
        const s = await db.session.create({
          data: { userId, expiresAt: new Date(Date.now() + 86400000) },
        });
        return new JwtService({ secret: process.env.JWT_SECRET }).sign(
          { sub: userId, sid: s.id },
          { issuer: 'sakura-platform', audience: 'sakura', expiresIn: '15m' },
        );
      }
      const token = await mint(admin.id),
        saleToken = await mint(sale.id);
      const http = () => request(app.getHttpServer());
      const get = (path, auth = token) =>
        http()
          .get('/api/v1/messenger/' + path)
          .set('Authorization', 'Bearer ' + auth);
      const base = 'history?from=2026-09-12&to=2026-09-12';
      const chat = await db.chatConversation.create({
        data: { pageId: '11001', psid: '22001', blocked: true, supportUserId: admin.id },
      });
      const other = await db.chatConversation.create({ data: { pageId: '11002', psid: '22002' } });
      async function message(sourceAt, extra = {}) {
        return db.chatMessage.create({
          data: {
            conversationId: chat.id,
            actorId: sale.id,
            requestKey: randomUUID(),
            direction: 'OUTBOUND',
            state: 'SENT',
            text: 'Nội dung tìm kiếm',
            sourceAt: new Date(sourceAt),
            ...extra,
          },
        });
      }
      const before = await message('2026-09-11T16:59:59.999Z');
      const start = await message('2026-09-11T17:00:00.000Z');
      const end = await message('2026-09-12T16:59:59.999Z', { actorId: former.id });
      await message('2026-09-12T17:00:00.000Z');
      await message('2026-09-12T10:00:00Z', {
        direction: 'INBOUND',
        state: 'RECEIVED',
        actorId: null,
        requestKey: null,
        remoteKey: 'inbound-' + randomUUID(),
      });
      const failed = await message('2026-09-12T11:00:00Z', { state: 'FAILED' });
      const uncertain = await message('2026-09-12T11:01:00Z', {
        state: 'SENDING',
        createdAt: new Date(Date.now() - 60000),
      });
      const elsewhere = await message('2026-09-12T12:00:00Z', { conversationId: other.id });
      await t.test(
        'Only global chat readers can query history and its filter options',
        async () => {
          await http()
            .get('/api/v1/messenger/' + base)
            .expect(401);
          await get(base, saleToken).expect(403);
          await get('history/options', saleToken).expect(403);
          const options = (await get('history/options').expect(200)).body;
          assert.equal(options.users.length, 2);
          assert.ok(options.users.some((u) => u.id === former.id && u.status === 'DISABLED'));
          assert.deepEqual(options.pages.map((p) => p.id).sort(), ['11001', '11002']);
          assert.equal(JSON.stringify(options).includes('passwordHash'), false);
        },
      );
      await t.test(
        'UTC+7 calendar range, inclusive end date, sender attribution and combined filters',
        async () => {
          const all = (await get(base).expect(200)).body;
          assert.equal(all.total, 5);
          assert.equal(
            all.items.some((m) => m.id === before.id),
            false,
          );
          assert.ok(all.items.some((m) => m.id === start.id));
          assert.ok(all.items.some((m) => m.id === end.id));
          assert.ok(
            all.items.every((m) => m.actor.id !== admin.id),
            'Support reassignment must not change authors',
          );
          const selected = (
            await get(
              base +
                '&actorId=' +
                former.id +
                '&pageId=11001&state=SENT&search=' +
                encodeURIComponent('tìm kiếm'),
            ).expect(200)
          ).body;
          assert.equal(selected.total, 1);
          assert.equal(selected.items[0].id, end.id);
          assert.equal((await get(base + '&state=FAILED').expect(200)).body.items[0].id, failed.id);
          const unknown = (await get(base + '&state=UNKNOWN').expect(200)).body;
          assert.equal(unknown.total, 1);
          assert.equal(unknown.items[0].id, uncertain.id);
          assert.equal(unknown.items[0].state, 'UNKNOWN');
          assert.equal((await get(base + '&state=SENDING').expect(200)).body.total, 0);
          assert.equal(
            (await get(base + '&pageId=11002').expect(200)).body.items[0].id,
            elsewhere.id,
          );
          const a = (await get(base + '&pageSize=2').expect(200)).body,
            b = (await get(base + '&pageSize=2&page=2').expect(200)).body;
          assert.equal(a.total, b.total);
          assert.equal(new Set([...a.items, ...b.items].map((m) => m.id)).size, 4);
          assert.equal((await get(base + '&search=no-match').expect(200)).body.total, 0);
        },
      );
      await t.test('Invalid dates, ranges and unbounded inputs are rejected', async () => {
        for (const q of [
          'from=2026-02-30&to=2026-03-01',
          'from=2026-09-13&to=2026-09-12',
          'from=2025-01-01&to=2026-09-12',
          'from=2026-09-12',
          'from=no&to=no',
        ])
          await get('history?' + q).expect(400);
        await get(base + '&actorId=bad').expect(400);
        await get(base + '&state=RECEIVED').expect(400);
        await get(base + '&pageSize=101').expect(400);
      });
      await t.test(
        'An old result opens its exact message page, including tied timestamps; foreign messages and unauthorized users fail',
        async () => {
          const tieTime = new Date('2026-09-12T13:00:00Z');
          const ties = [];
          for (let i = 0; i < 36; i++)
            ties.push(await message(tieTime, { text: 'Tin cùng thời điểm ' + i }));
          ties.sort((a, b) => a.id.localeCompare(b.id));
          const target = ties[0];
          const detail = (
            await get('conversations/' + chat.id + '?pageSize=10&messageId=' + target.id).expect(
              200,
            )
          ).body;
          assert.ok(detail.messages.page > 1);
          assert.ok(detail.messages.items.some((m) => m.id === target.id));
          await get('conversations/' + chat.id + '?messageId=' + elsewhere.id).expect(404);
          await get('conversations/' + chat.id + '?messageId=' + target.id, saleToken).expect(404);
          const indexes =
            await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'ChatMessage'`;
          assert.ok(indexes.some((i) => i.indexname === 'ChatMessage_direction_sourceAt_id_idx'));
        },
      );
    } finally {
      if (app) await app.close();
      if (db) await db.$disconnect();
      if (!/^test_history_[a-f0-9]{32}$/.test(schema)) throw Error('Invalid test schema');
      await adminDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await adminDb.$disconnect();
    }
  },
);
