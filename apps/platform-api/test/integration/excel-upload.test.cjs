const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const request = require('supertest');
const { PrismaClient } = require('@sakura/database');
const { JwtService } = require('@nestjs/jwt');
const { workbook, customer, product, order } = require('../excel-fixture.cjs');

test(
  'Excel upload: authorized preview, atomic confirmation, duplicate detection and resumable images',
  { timeout: process.env.SAKURA_EXCEL_UI_QA === 'true' ? 600000 : 180000 },
  async (t) => {
    const root = resolve(__dirname, '../../../..'),
      url = new URL(process.env.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || process.env.NODE_ENV === 'production')
      throw Error('Local test only');
    const schema = 'test_excel_' + randomUUID().replaceAll('-', ''),
      adminDb = new PrismaClient();
    let db, app, preview;
    try {
      await adminDb.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
      url.searchParams.set('schema', schema);
      Object.assign(process.env, {
        DATABASE_URL: url.toString(),
        NODE_ENV: 'test',
        COOKIE_SECURE: 'false',
        WEB_ORIGIN:
          process.env.SAKURA_EXCEL_UI_QA === 'true'
            ? 'http://127.0.0.1:5190'
            : 'http://localhost:5173',
        JWT_SECRET: 'excel-upload-test-only-'.repeat(4),
        SEED_ADMIN_EMAIL: 'admin@excel.test',
        SEED_ADMIN_PASSWORD: 'Excel-test-only-password-123',
        MEDIA_ROOT: resolve(root, '.local/test-media', schema),
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
          stdio: 'pipe',
          windowsHide: true,
        });
      const { Test } = require('@nestjs/testing'),
        { AppModule } = require('../../dist/app'),
        { configureApp } = require('../../dist/bootstrap');
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app, false);
      await app.init();
      db = new PrismaClient();
      const admin = await db.user.update({
        where: { email: 'admin@excel.test' },
        data: { mustChangePassword: false },
      });
      const session = await db.session.create({
        data: { userId: admin.id, expiresAt: new Date(Date.now() + 86400000) },
      });
      const token = new JwtService({ secret: process.env.JWT_SECRET }).sign(
        { sub: admin.id, sid: session.id },
        { issuer: 'sakura-platform', audience: 'sakura', expiresIn: '30m' },
      );
      const auth = { Authorization: 'Bearer ' + token },
        http = () => request(app.getHttpServer());
      const upload = (buffer, name = 'upload.xlsx') =>
        http().post('/api/v1/imports/sapo/excel/preview').set(auth).attach('file', buffer, name);
      const commit = (b) =>
        http()
          .post('/api/v1/imports/sapo/excel/batches/' + b.id + '/commit')
          .set(auth)
          .send({ digest: b.digest });
      let c, p;
      await t.test('Guard and multipart limits; preview makes no customer records', async () => {
        const buffer = await workbook('CUSTOMERS', [customer(), customer(101, null)]);
        await http()
          .post('/api/v1/imports/sapo/excel/preview')
          .attach('file', buffer, 'a.xlsx')
          .expect(401);
        const noRole = await db.user.create({
          data: {
            email: 'no-role@excel.test',
            displayName: 'No role',
            passwordHash: 'not-a-login',
            status: 'ACTIVE',
            mustChangePassword: false,
          },
        });
        const s = await db.session.create({
          data: { userId: noRole.id, expiresAt: new Date(Date.now() + 100000) },
        });
        const denied = new JwtService({ secret: process.env.JWT_SECRET }).sign(
          { sub: noRole.id, sid: s.id },
          { issuer: 'sakura-platform', audience: 'sakura', expiresIn: '5m' },
        );
        await http()
          .post('/api/v1/imports/sapo/excel/preview')
          .set('Authorization', 'Bearer ' + denied)
          .attach('file', buffer, 'a.xlsx')
          .expect(403);
        await upload(buffer, 'wrong.xls').expect(400);
        await upload(Buffer.alloc(10 * 1024 * 1024 + 1)).expect(413);
        c = (await upload(buffer, 'Khach_hang.xlsx').expect(201)).body;
        assert.deepEqual(c.counts, { create: 2, skip: 0, errors: 0 });
        assert.equal(await db.customer.count(), 0);
        await http()
          .post('/api/v1/imports/sapo/batches/' + c.id + '/commit')
          .set(auth)
          .send({ digest: c.digest })
          .expect(400);
      });
      await t.test(
        'Digest validation, repeat confirmation, renamed exports and changed source',
        async () => {
          await http()
            .post('/api/v1/imports/sapo/excel/batches/' + c.id + '/commit')
            .set(auth)
            .send({ digest: 'bad' })
            .expect(409);
          await commit(c).expect(201);
          await commit(c).expect(201);
          assert.equal(await db.customer.count(), 2);
          assert.equal(await db.customerAssignment.count(), 0);
          const same = (
            await upload(
              await workbook('CUSTOMERS', [customer(), customer(101, null)]),
              'renamed.xlsx',
            ).expect(201)
          ).body;
          assert.deepEqual(same.counts, { create: 0, skip: 2, errors: 0 });
          const changed = (
            await upload(
              await workbook('CUSTOMERS', [
                { ...customer(), 'First Name(Tên)': 'Tên khác' },
                customer(102, null),
              ]),
            ).expect(201)
          ).body;
          assert.deepEqual(changed.counts, { create: 1, skip: 0, errors: 1 });
          await commit(changed).expect(400);
          assert.equal(await db.customer.count(), 2);
        },
      );
      await t.test('Dependency changes and expired previews cannot commit', async () => {
        const b = (
          await upload(await workbook('CUSTOMERS', [customer(103, '+84987654321')])).expect(201)
        ).body;
        await db.customer.create({
          data: { name: 'Existing', phone: '0987654321', address: '', createdById: admin.id },
        });
        await commit(b).expect(409);
        const expired = (
          await upload(await workbook('CUSTOMERS', [customer(104, null)])).expect(201)
        ).body;
        await db.importBatch.update({
          where: { id: expired.id },
          data: { createdAt: new Date(Date.now() - 86400001) },
        });
        await commit(expired).expect(409);
      });
      await t.test(
        'Products, variants and image links; no network while previewing or committing data',
        async () => {
          p = (await upload(await workbook('PRODUCTS', [product()]), 'San_pham.xlsx').expect(201))
            .body;
          assert.deepEqual(p.counts, { create: 2, skip: 0, errors: 0 });
          await commit(p).expect(201);
          assert.equal(await db.product.count(), 1);
          assert.equal(await db.productVariant.count(), 1);
          assert.equal(await db.productImage.count(), 0);
          const endpoint = '/api/v1/imports/sapo/excel/batches/' + p.id + '/images';
          const initial = (await http().get(endpoint).set(auth).expect(200)).body;
          assert.equal(initial.remaining, 1);
          const realFetch = global.fetch;
          let calls = 0;
          try {
            global.fetch = async () => {
              calls++;
              throw Error('network failure');
            };
            const failed = (await http().post(endpoint).set(auth).expect(201)).body;
            assert.equal(failed.remaining, 1);
            assert.equal(failed.failures.length, 1);
            global.fetch = async (url, options) => {
              calls++;
              assert.equal(new URL(url).hostname, 'bizweb.dktcdn.net');
              assert.equal(options.redirect, 'error');
              return new Response(
                Buffer.from(
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
                  'base64',
                ),
              );
            };
            assert.equal((await http().post(endpoint).set(auth).expect(201)).body.remaining, 0);
            await http().post(endpoint).set(auth).expect(201);
            assert.equal(calls, 2);
            assert.equal(await db.productImage.count(), 1);
          } finally {
            global.fetch = realFetch;
          }
        },
      );
      await t.test(
        'Historical orders keep source gaps and link exact phone; appear in existing orders API',
        async () => {
          const o = (await upload(await workbook('ORDERS', [order()]), 'Don_hang.xlsx').expect(201))
            .body;
          await commit(o).expect(201);
          const saved = await db.historicalOrder.findUniqueOrThrow({
            where: { externalId: 'TEST-300' },
          });
          assert.ok(saved.customerId);
          assert.equal(saved.sourceClosedBy, '');
          assert.equal(saved.paidAmount, null);
          assert.equal(saved.items[0].quantity, '1.5');
          assert.equal(saved.items[0].lineTotal, null);
          assert.equal(await db.order.count(), 0);
          assert.equal(await db.chatMessage.count(), 0);
          assert.equal(await db.deliverySlip.count(), 0);
          await http()
            .get('/api/v1/sales/historical-orders/' + saved.id)
            .set(auth)
            .expect(200);
        },
      );
      await t.test('Concurrent confirmation keeps one set of records', async () => {
        const b = (await upload(await workbook('CUSTOMERS', [customer(8888, null)])).expect(201))
          .body;
        const result = await Promise.all([commit(b), commit(b)]);
        assert.ok(result.some((r) => r.status === 201));
        assert.ok(result.every((r) => [201, 409].includes(r.status)));
        assert.equal(
          await db.sapoReference.count({ where: { kind: 'CUSTOMERS', externalId: '8888' } }),
          1,
        );
      });
      await t.test('Preview is paginated and available from shared history', async () => {
        const b = (
          await upload(
            await workbook(
              'CUSTOMERS',
              Array.from({ length: 55 }, (_, i) => customer(1000 + i, null)),
            ),
            'Nhieu_khach.xlsx',
          ).expect(201)
        ).body;
        assert.equal(b.plan.items.length, 50);
        assert.equal(b.plan.total, 55);
        const second = (
          await http()
            .get('/api/v1/imports/sapo/excel/batches/' + b.id + '?page=2')
            .set(auth)
            .expect(200)
        ).body;
        assert.equal(second.plan.items.length, 5);
        assert.equal(
          (
            await http()
              .get('/api/v1/imports/sapo/batches/' + b.id)
              .set(auth)
              .expect(200)
          ).body.format,
          'SAPO_EXCEL_V2',
        );
        await http()
          .get('/api/v1/imports/sapo/excel/batches/' + b.id + '?page=0')
          .set(auth)
          .expect(400);
      });
      if (process.env.SAKURA_EXCEL_UI_QA === 'true') {
        const folder = resolve(root, '.local/excel-ui');
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(
          resolve(folder, 'khach-thu.xlsx'),
          await workbook('CUSTOMERS', [customer(9999, null)]),
        );
        await app.listen(3305, '127.0.0.1');
        preview = spawn(
          resolve(root, '.local/caddy/caddy.exe'),
          ['run', '--config', resolve(root, 'infra/Caddyfile'), '--adapter', 'caddyfile'],
          {
            windowsHide: true,
            stdio: 'ignore',
            env: {
              ...process.env,
              SAKURA_DOMAIN: 'http://127.0.0.1:5190',
              SAKURA_BIND: '127.0.0.1',
              SAKURA_API_UPSTREAM: '127.0.0.1:3305',
              SAKURA_WEB_ROOT: resolve(root, 'apps/sale-web/dist').replaceAll('\\', '/'),
            },
          },
        );
        console.log('Excel UI ready: http://127.0.0.1:5190');
        await new Promise((r) => setTimeout(r, 360000));
      }
    } finally {
      if (preview) preview.kill();
      if (app) await app.close();
      if (db) await db.$disconnect();
      if (!/^test_excel_[a-f0-9]{32}$/.test(schema)) throw Error('Invalid schema');
      await adminDb.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await adminDb.$disconnect();
    }
  },
);
