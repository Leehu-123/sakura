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
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = new PrismaClient();
    admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@integration.test' } });
    adminRole = await db.role.findUniqueOrThrow({ where: { code: 'admin' } });
    regionalRole = await db.role.findUniqueOrThrow({ where: { code: 'regional_sales' } });
  },
  { timeout: 60000 },
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

const fs = require('node:fs');
const { prepare } = require('../../../../scripts/sapo-native.cjs');
const { importPlan } = require('../../../../scripts/import-sapo-native.cjs');
const directory = resolve(root, '.local/sapo-20260909');
test(
  'Sapo Excel thực tế: nhập đủ, đối chiếu và quyền tra cứu',
  { skip: !fs.existsSync(resolve(directory, 'prepared.json')) },
  async (t) => {
    const files = fs
      .readdirSync(directory)
      .filter((f) => /^(customers|products|order_).*\.json$/.test(f))
      .map((f) => JSON.parse(fs.readFileSync(resolve(directory, f), 'utf8')));
    const plan = prepare(files);
    await db.user.update({ where: { id: admin.id }, data: { mustChangePassword: false } });
    token = await mint(admin.id);
    await t.test('Kiểm tra đủ dữ liệu từ ba workbook trước khi nhập', () => {
      assert.equal(plan.customers.length, 4063);
      assert.equal(plan.products.length, 26);
      assert.equal(plan.variants.length, 431);
      assert.equal(plan.orders.length, 11732);
      assert.equal(plan.summary.orderLines, 31662);
      assert.equal(plan.summary.orderTotal, '2619538000');
      assert.equal(plan.summary.zeroQuantityLines, 3773);
    });
    await t.test(
      'Nhập vào schema thử nghiệm, không tạo đơn vận hành hoặc phân công giả',
      async () => {
        const r = await importPlan(db, plan, admin.id);
        assert.equal(r.create, 16252);
        assert.equal(r.skip, 0);
        assert.equal(await db.customer.count(), 4063);
        assert.equal(await db.product.count(), 26);
        assert.equal(await db.productVariant.count(), 431);
        assert.equal(await db.historicalOrder.count(), 11732);
        assert.equal(await db.order.count(), 0);
        assert.equal(await db.customerAssignment.count(), 0);
        assert.equal(await db.chatMessage.count(), 0);
        assert.equal(await db.deliverySlip.count(), 0);
      },
    );
    await t.test(
      'Kiểm tra tiền, dòng hàng, trường thiếu và liên kết độc lập với bản chuẩn hóa',
      async () => {
        const source = files.find((f) => f.file.startsWith('order_')).sheets[0].rows.slice(5),
          groups = new Map();
        for (const r of source) {
          const k = String(r[1]);
          const g = groups.get(k) || [];
          g.push(r);
          groups.set(k, g);
        }
        const orders = await db.historicalOrder.findMany({
          include: { customer: { select: { phone: true } } },
        });
        let lines = 0;
        let total = 0n;
        let linked = 0;
        for (const o of orders) {
          const g = groups.get(o.number);
          assert.ok(g);
          assert.equal(o.total.toString(), String(g[0][15]));
          assert.equal(o.sourceCreatedBy, g[0][5]);
          assert.equal(o.sourceClosedBy, '');
          assert.equal(o.sourceCustomerName, g[0][7]);
          assert.equal(o.recipientName, '');
          assert.equal(o.recipientPhone, '');
          assert.equal(o.subtotal, null);
          assert.equal(o.discount, null);
          assert.equal(o.shippingFee, null);
          assert.equal(o.paidAmount, null);
          assert.equal(o.items.length, g.length);
          for (let i = 0; i < g.length; i++) {
            assert.equal(o.items[i].sku, String(g[i][11] || ''));
            assert.equal(o.items[i].productName, g[i][10]);
            assert.equal(o.items[i].quantity, String(g[i][12]));
            assert.equal(o.items[i].unitPrice, String(g[i][13]));
            assert.equal(o.items[i].lineTotal, null);
          }
          lines += o.items.length;
          total += BigInt(o.total.toString());
          if (o.customer) {
            linked++;
            assert.equal(o.customer.phone, String(g[0][9]).replace(/^\+84/, '0'));
          }
        }
        assert.equal(lines, 31662);
        assert.equal(total.toString(), '2619538000');
        assert.equal(linked, 6110);
        assert.equal(await db.customer.count({ where: { phone: null } }), 405);
      },
    );
    await t.test('Chạy lại không nhân đôi, thay đổi nguồn bị chặn trước khi ghi', async () => {
      const r = await importPlan(db, plan, admin.id);
      assert.equal(r.create, 0);
      assert.equal(r.skip, 16252);
      const bad = { ...plan, digest: 'wrong' };
      await assert.rejects(() => importPlan(db, bad, admin.id), /thay đổi/);
    });
    await t.test('API tra cứu đơn không liên kết, tìm tên nguồn và quyền Sale', async () => {
      const get = (path, who = token) =>
        http()
          .get('/api/v1' + path)
          .set('Authorization', 'Bearer ' + who);
      assert.equal((await get('/sales/customers').expect(200)).body.total, 4063);
      assert.equal((await get('/catalog/products').expect(200)).body.total, 26);
      assert.equal((await get('/sales/historical-orders').expect(200)).body.total, 11732);
      assert.equal(
        (await get('/sales/historical-orders?link=UNLINKED').expect(200)).body.total,
        5622,
      );
      const u = await db.historicalOrder.findFirst({
        where: { customerId: null, sourceCustomerName: { not: '' } },
      });
      assert.ok(u);
      const detail = (await get('/sales/historical-orders/' + u.id).expect(200)).body;
      assert.equal(detail.customer, null);
      assert.equal(detail.paidAmount, null);
      assert.ok(
        (
          await get(
            '/sales/historical-orders?search=' + encodeURIComponent(u.sourceCustomerName),
          ).expect(200)
        ).body.total > 0,
      );
      sale = await db.user.create({
        data: {
          email: 'sale@native.test',
          displayName: 'Sale thử nghiệm',
          passwordHash: admin.passwordHash,
          mustChangePassword: false,
          roleAssignments: { create: { roleId: regionalRole.id } },
        },
      });
      saleToken = await mint(sale.id);
      assert.equal((await get('/sales/historical-orders', saleToken).expect(200)).body.total, 0);
      await get('/sales/historical-orders/' + u.id, saleToken).expect(404);
      const linked = await db.historicalOrder.findFirst({ where: { customerId: { not: null } } });
      await db.customerAssignment.create({
        data: {
          customerId: linked.customerId,
          userId: sale.id,
          assignedById: admin.id,
          reason: 'Kiểm thử phạm vi',
        },
      });
      const visible = (await get('/sales/historical-orders', saleToken).expect(200)).body;
      assert.equal(
        visible.total,
        await db.historicalOrder.count({ where: { customerId: linked.customerId } }),
      );
      await get('/sales/historical-orders/' + u.id, saleToken).expect(404);
    });

    await t.test(
      'Danh sách đơn chung: nguồn, trạng thái, phân trang, quyền sau bàn giao',
      async () => {
        const get = (path, who = token) =>
          http()
            .get('/api/v1' + path)
            .set('Authorization', 'Bearer ' + who);
        const c = await db.customer.findFirst({ where: { phone: { not: null } } });
        const native = await db.order.create({
          data: {
            requestKey: randomUUID(),
            requestHash: 'feed-test',
            number: 10000001,
            customerId: c.id,
            createdById: admin.id,
            recipientName: c.name,
            recipientPhone: c.phone,
            shippingAddress: 'Địa chỉ kiểm thử',
            subtotal: 0,
            discount: 0,
            shippingFee: 0,
            total: 0,
            createdAt: new Date('2026-09-09T00:00:00Z'),
          },
        });
        const first = (await get('/sales/order-feed?pageSize=10').expect(200)).body;
        assert.equal(first.total, 11733);
        assert.equal(first.items[0].number, 'SK-10000001');
        assert.equal(first.items[0].source, 'SAKURA');
        assert.equal(first.items[0].id, native.id);
        assert.equal(first.items[1].source, 'SAPO');
        assert.equal(first.items[1].paidAmount, null);
        assert.ok(!('sourceData' in first.items[1]));
        const second = (await get('/sales/order-feed?page=2&pageSize=10').expect(200)).body;
        assert.equal(
          new Set([...first.items, ...second.items].map((x) => x.source + x.id)).size,
          20,
        );
        const sapo = (await get('/sales/order-feed?source=SAPO').expect(200)).body;
        assert.equal(sapo.total, 11732);
        assert.ok(sapo.items.every((x) => x.source === 'SAPO'));
        assert.equal((await get('/sales/order-feed?source=SAKURA').expect(200)).body.total, 1);
        assert.equal((await get('/sales/order-feed?link=UNLINKED').expect(200)).body.total, 5622);
        const cancelled = (
          await get('/sales/order-feed?status=' + encodeURIComponent('SAPO:Đã hủy')).expect(200)
        ).body;
        assert.equal(
          cancelled.total,
          await db.historicalOrder.count({ where: { sourceStatus: 'Đã hủy' } }),
        );
        assert.equal(
          (await get('/sales/order-feed?search=' + encodeURIComponent("' OR 1=1 --")).expect(200))
            .body.total,
          0,
        );
        const visible = (await get('/sales/order-feed', saleToken).expect(200)).body;
        assert.ok(visible.total > 0);
        assert.ok(visible.items.every((x) => x.customerId));
        assert.equal(
          (await get('/sales/order-feed?link=UNLINKED', saleToken).expect(200)).body.total,
          0,
        );
        const historical = await db.historicalOrder.findFirst();
        await http()
          .patch('/api/v1/sales/orders/' + historical.id + '/status')
          .set(auth())
          .send({ version: 1, status: 'CONFIRMED' })
          .expect(404);
        await db.customerAssignment.updateMany({
          where: { userId: sale.id, endedAt: null },
          data: { endedAt: new Date() },
        });
        assert.equal((await get('/sales/order-feed', saleToken).expect(200)).body.total, 0);
        await get('/sales/order-feed?source=INVALID').expect(400);
      },
    );
    await t.test(
      'Ảnh Sapo: gắn đúng sản phẩm/biến thể, tải một lần, thư viện và quyền truy cập',
      async () => {
        const { importImages, imagePlan } = require('../../../../scripts/import-sapo-images.cjs');
        const { mediaPayload } = require('../../dist/common/media-store');
        const imageDir = resolve(directory, 'test-images-' + schema);
        fs.mkdirSync(imageDir, { recursive: true });
        const p = structuredClone(plan.products[0]);
        p.data.sourceData.rows = p.data.sourceData.rows.slice(0, 1);
        const row = p.data.sourceData.rows[0].values;
        const url = 'https://bizweb.dktcdn.net/100/557/101/products/test.png';
        row['Ảnh đại diện'] = url;
        row['Ảnh phiên bản'] = url;
        const imagePlanData = { products: [p] };
        const bytes = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
          'base64',
        );
        let requests = 0;
        const fetcher = async () => {
          requests++;
          return new Response(bytes, { headers: { 'content-type': 'image/png' } });
        };
        const r = await importImages(db, imagePlanData, admin.id, imageDir, { fetcher });
        assert.equal(r.created, 2);
        assert.equal(requests, 1);
        assert.equal(r.uniqueFiles, 1);
        const again = await importImages(db, imagePlanData, admin.id, imageDir, { fetcher });
        assert.equal(again.created, 0);
        assert.equal(again.skipped, 2);
        assert.equal(requests, 1);
        const images = await db.productImage.findMany();
        assert.equal(images.length, 2);
        assert.ok(
          images.every((i) => i.data === '' && i.storageKey && i.byteSize === bytes.length),
        );
        assert.equal(images.filter((i) => i.variantId).length, 1);
        const image = images.find((i) => i.variantId);
        const variant = await db.productVariant.findUnique({ where: { id: image.variantId } });
        assert.equal(image.productId, variant.productId);
        const payload = (
          await http()
            .get('/api/v1/messenger/images/' + image.id)
            .set(auth())
            .expect(200)
        ).body;
        assert.equal(payload.data, bytes.toString('base64'));
        assert.equal(payload.mime, 'image/png');
        assert.ok(!payload.storageKey);
        await http()
          .get('/api/v1/messenger/images/' + image.id)
          .expect(401);
        const library = (
          await http()
            .get('/api/v1/messenger/images?search=' + encodeURIComponent(variant.sku))
            .set(auth())
            .expect(200)
        ).body;
        assert.ok(library.items.some((i) => i.id === image.id));
        assert.ok(!('data' in library.items[0]));
        const products = (
          await http()
            .get('/api/v1/catalog/products?search=' + encodeURIComponent(variant.sku))
            .set(auth())
            .expect(200)
        ).body;
        assert.ok(products.items[0].images.length);
        assert.ok(products.items[0].variants.find((v) => v.id === variant.id).images.length);
        const invalid = structuredClone(imagePlanData);
        invalid.products[0].data.sourceData.rows[0].values['Ảnh đại diện'] =
          'http://127.0.0.1/private';
        assert.throws(() => imagePlan(invalid), /URL/);
        await assert.rejects(
          () => mediaPayload({ data: '', storageKey: '../outside' }),
          /không hợp lệ/,
        );
        await db.productImage.update({ where: { id: image.id }, data: { isActive: false } });
        await http()
          .get('/api/v1/messenger/images/' + image.id)
          .set(auth())
          .expect(404);
        for (const name of fs.readdirSync(imageDir)) fs.unlinkSync(resolve(imageDir, name));
        fs.rmdirSync(imageDir);
      },
    );
  },
);
