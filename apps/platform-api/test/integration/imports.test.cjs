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

const { fields } = require('../../dist/imports/format');
function csv(kind, rows) {
  const headers = fields[kind].map((f) => f.key);
  const quote = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  return {
    kind,
    fileName: kind + '.csv',
    mapping: Object.fromEntries(headers.map((h) => [h, h])),
    content: [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))]
      .map((r) => r.map(quote).join(','))
      .join('\r\n'),
  };
}
test('Sapo: xem trước, nhập nguyên tử, chạy lại và phạm vi đơn cũ', async (t) => {
  let a, b, ta, tb, ca, batch, orderId;
  const send = (method, path, body, who = token) => {
    const q = http()
      [method]('/api/v1' + path)
      .set('Authorization', 'Bearer ' + who);
    return body === undefined ? q : q.send(body);
  };
  const preview = (kind, rows, who = token) =>
    send('post', '/imports/sapo/preview', csv(kind, rows), who);
  const commit = (p, who = token) =>
    send('post', '/imports/sapo/batches/' + p.id + '/commit', { digest: p.digest }, who);
  const customer = (externalId, phone, ownerEmail = 'a@imports.test') => ({
    externalId,
    name: 'Khách ' + externalId,
    phone,
    address: '12 Đường Hoa, Hà Nội',
    ownerEmail,
    regionCode: 'NORTH',
  });
  const product = (externalId, sku) => ({
    externalId,
    productId: 'SP-01',
    productName: 'Ruy băng Sakura',
    sku,
    variantName: sku,
    unit: 'Cuộn',
    price: '120000',
    category: 'Lụa',
  });
  const order = (externalId = 'DH-01', sku = 'SKU-OLD') => ({
    externalId,
    number: 'SO-2020-001',
    customerId: 'KH-01',
    orderedAt: '2020-02-29T09:30:00+07:00',
    sourceStatus: 'Đã hoàn tất từ Sapo',
    sourcePaymentStatus: 'Thanh toán tại cửa hàng',
    sourceShippingStatus: 'Đã giao (lịch sử)',
    sourceClosedBy: 'Sale cũ đã nghỉ',
    recipientName: 'Người nhận cũ',
    recipientPhone: '0912000000',
    shippingAddress: 'Địa chỉ tại lúc bán',
    sku,
    productName: 'Tên hàng năm 2020',
    unit: 'Cuộn',
    quantity: '2',
    unitPrice: '45000',
    lineTotal: '90000',
    subtotal: '90000',
    discount: '10000',
    shippingFee: '20000',
    total: '100000',
    paidAmount: '100000',
  });
  await t.test('Chuẩn bị quản trị và hai Sale cùng khu vực', async () => {
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
    a = await staff('a@imports.test');
    b = await staff('b@imports.test');
    ta = await mint(a.id);
    tb = await mint(b.id);
  });
  await t.test('Chỉ quyền nhập toàn công ty được tải và xem dữ liệu nguồn', async () => {
    await http().get('/api/v1/imports/sapo/fields').expect(401);
    await send('get', '/imports/sapo/fields', undefined, ta).expect(403);
    await send('post', '/imports/sapo/inspect', { content: 'a,b\n1,2' }, ta).expect(403);
    await preview('CUSTOMERS', [customer('A', '0912345678')], ta).expect(403);
    await send('get', '/imports/sapo/batches', undefined, ta).expect(403);
  });
  await t.test('Nhận file trên 100 KB trong giới hạn và từ chối file vượt 500 KB', async () => {
    const content =
      'a,b\n' + Array.from({ length: 180 }, (_, i) => i + ',' + 'x'.repeat(700)).join('\n');
    assert.ok(Buffer.byteLength(content) > 100000);
    const r = await send('post', '/imports/sapo/inspect', { content }).expect(201);
    assert.equal(r.body.rowCount, 180);
    await send('post', '/imports/sapo/inspect', { content: 'a,b\n' + 'x'.repeat(512001) }).expect(
      400,
    );
  });
  await t.test('Đọc CSV và ghép cột tiếng Việt; không thêm khách khi xem trước', async () => {
    const c = customer('KH-01', '+84 912 345 678');
    const dto = csv('CUSTOMERS', [c]);
    dto.content = dto.content.replace('"phone"', '"Điện thoại"');
    dto.mapping.phone = 'Điện thoại';
    const inspected = await send('post', '/imports/sapo/inspect', { content: dto.content }).expect(
      201,
    );
    assert.equal(inspected.body.rowCount, 1);
    assert.ok(inspected.body.headers.includes('Điện thoại'));
    batch = (await send('post', '/imports/sapo/preview', dto).expect(201)).body;
    assert.equal(batch.counts.create, 1);
    assert.equal(batch.counts.errors, 0);
    assert.equal(batch.plan[0].data.phone, '0912345678');
    assert.equal(await db.customer.count(), 0);
    assert.equal(await db.sapoReference.count(), 0);
    assert.equal(batch.rows, undefined);
    await send('get', '/imports/sapo/batches/' + batch.id, undefined, ta).expect(403);
    await commit(batch, ta).expect(403);
  });
  await t.test(
    'Xác nhận đúng bản xem trước; gắn Sale và khu vực; chạy lại không nhân đôi',
    async () => {
      await send('post', '/imports/sapo/batches/' + batch.id + '/commit', { digest: 'bad' }).expect(
        409,
      );
      await commit(batch).expect(201);
      await commit(batch).expect(201);
      ca = await db.customer.findUniqueOrThrow({
        where: { phone: '0912345678' },
        include: { assignments: true },
      });
      assert.equal(ca.assignments[0].userId, a.id);
      assert.equal(await db.customer.count(), 1);
      const repeat = (await preview('CUSTOMERS', [customer('KH-01', '0912345678')]).expect(201))
        .body;
      assert.equal(repeat.counts.skip, 1);
      await commit(repeat).expect(201);
      assert.equal(await db.customer.count(), 1);
      const changed = (
        await preview('CUSTOMERS', [
          { ...customer('KH-01', '0912345678'), name: 'Nội dung khác' },
        ]).expect(201)
      ).body;
      assert.equal(changed.counts.errors, 1);
      await commit(changed).expect(400);
    },
  );
  await t.test('Báo lỗi trùng và email phân công; một lỗi chặn toàn bộ lần nhập', async () => {
    const p = (
      await preview('CUSTOMERS', [
        customer('KH-NEW', '0987654321'),
        customer('KH-DUP', '0912345678'),
        customer('KH-OWNER', '0977654321', 'missing@imports.test'),
        customer('KH-PHONE', 'not-phone'),
      ]).expect(201)
    ).body;
    assert.equal(p.counts.create, 1);
    assert.equal(p.counts.errors, 3);
    await commit(p).expect(400);
    assert.equal(await db.customer.count(), 1);
    const within = (
      await preview('CUSTOMERS', [
        customer('DUP-1', '0987654321'),
        customer('DUP-2', '+84 987 654 321'),
      ]).expect(201)
    ).body;
    assert.equal(within.counts.errors, 1);
    await commit(within).expect(400);
  });
  await t.test(
    'Đổi trạng thái Sale và bản xem trước hết hạn đều yêu cầu kiểm tra lại',
    async () => {
      const p = (await preview('CUSTOMERS', [customer('STALE', '0987654321')]).expect(201)).body;
      await db.user.update({ where: { id: a.id }, data: { status: 'DISABLED' } });
      await commit(p).expect(409);
      assert.equal(await db.customer.count(), 1);
      await db.user.update({ where: { id: a.id }, data: { status: 'ACTIVE' } });
      await db.importBatch.update({
        where: { id: p.id },
        data: { createdAt: new Date(Date.now() - 86401000) },
      });
      await commit(p).expect(409);
    },
  );
  await t.test('Hai bản xem trước xác nhận đồng thời chỉ tạo một khách', async () => {
    const dto = [customer('KH-RACE', '0987654321', 'b@imports.test')];
    const p1 = (await preview('CUSTOMERS', dto).expect(201)).body,
      p2 = (await preview('CUSTOMERS', dto).expect(201)).body;
    const responses = await Promise.all([commit(p1), commit(p2)]);
    assert.equal(responses.filter((r) => r.status === 201).length, 1);
    assert.equal(responses.filter((r) => r.status === 409).length, 1);
    assert.equal(await db.customer.count({ where: { phone: '0987654321' } }), 1);
    assert.equal(
      await db.sapoReference.count({ where: { kind: 'CUSTOMERS', externalId: 'KH-RACE' } }),
      1,
    );
  });
  await t.test('Lỗi cơ sở dữ liệu ở dòng sau hoàn tác toàn bộ dữ liệu và mã nguồn', async () => {
    const p = (
      await preview('CUSTOMERS', [
        customer('ROLLBACK-1', '0961000001'),
        customer('ROLLBACK-2', '0961000002'),
      ]).expect(201)
    ).body;
    await db.$executeRawUnsafe(
      `ALTER TABLE "Customer" ADD CONSTRAINT "Customer_test_rollback" CHECK ("name" <> 'Khách ROLLBACK-2')`,
    );
    try {
      await commit(p).expect(500);
      assert.equal(
        await db.customer.count({ where: { phone: { in: ['0961000001', '0961000002'] } } }),
        0,
      );
      assert.equal(
        await db.sapoReference.count({
          where: { externalId: { in: ['ROLLBACK-1', 'ROLLBACK-2'] } },
        }),
        0,
      );
      assert.equal(
        (await db.importBatch.findUniqueOrThrow({ where: { id: p.id } })).status,
        'PREVIEW',
      );
      assert.equal(
        await db.auditLog.count({ where: { action: 'import.committed', entityId: p.id } }),
        0,
      );
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "Customer" DROP CONSTRAINT "Customer_test_rollback"');
    }
  });
  await t.test('Nhập nhiều biến thể vào cùng một sản phẩm và đối chiếu SKU', async () => {
    const rows = [product('BT-01', 'SKU-01'), product('BT-02', 'SKU-02')];
    const p = (await preview('PRODUCTS', rows).expect(201)).body;
    assert.equal(p.counts.create, 2);
    await commit(p).expect(201);
    assert.equal(await db.product.count(), 1);
    assert.equal(await db.productVariant.count(), 2);
    const repeat = (await preview('PRODUCTS', rows).expect(201)).body;
    assert.equal(repeat.counts.skip, 2);
    await commit(repeat).expect(201);
    assert.equal(await db.productVariant.count(), 2);
    const duplicate = (await preview('PRODUCTS', [product('BT-03', 'SKU-01')]).expect(201)).body;
    assert.equal(duplicate.counts.errors, 1);
    const mismatch = (
      await preview('PRODUCTS', [
        product('BT-03', 'SKU-03'),
        { ...product('BT-04', 'SKU-04'), productName: 'Khác tên' },
      ]).expect(201)
    ).body;
    assert.ok(mismatch.counts.errors > 0);
    await commit(mismatch).expect(400);
    assert.equal(await db.productVariant.count(), 2);
  });
  await t.test('Thêm biến thể vào sản phẩm đã nhập và chặn ghi từ giá trị âm', async () => {
    const p = (await preview('PRODUCTS', [product('BT-03', 'SKU-03')]).expect(201)).body;
    await commit(p).expect(201);
    assert.equal(await db.product.count(), 1);
    assert.equal(await db.productVariant.count(), 3);
    const invalid = (
      await preview('PRODUCTS', [{ ...product('BT-04', 'SKU-04'), price: '-1' }]).expect(201)
    ).body;
    assert.equal(invalid.counts.errors, 1);
  });
  await t.test('Đơn cũ thiếu khách, sai ngày hoặc lệch tiền bị chặn', async () => {
    const p = (
      await preview('ORDERS', [
        { ...order('BAD-CUSTOMER'), customerId: 'UNKNOWN' },
        { ...order('BAD-DATE'), orderedAt: '2026-02-30' },
        { ...order('BAD-TOTAL'), total: '1' },
        { ...order('BAD-LINE'), lineTotal: '80000' },
      ]).expect(201)
    ).body;
    assert.equal(p.counts.errors, 4);
    await commit(p).expect(400);
    assert.equal(await db.historicalOrder.count(), 0);
  });
  await t.test(
    'Ghép dòng hàng; giữ giá, người chốt, trạng thái nguồn và không tạo đơn vận hành',
    async () => {
      const first = { ...order(), subtotal: '135000', total: '145000', paidAmount: '145000' };
      const second = { ...first, sku: 'SKU-OTHER', quantity: '1', lineTotal: '45000' };
      const p = (await preview('ORDERS', [first, second]).expect(201)).body;
      assert.equal(p.counts.create, 1);
      assert.equal(p.plan[0].items.length, 2);
      await commit(p).expect(201);
      const saved = await db.historicalOrder.findUniqueOrThrow({ where: { externalId: 'DH-01' } });
      orderId = saved.id;
      assert.equal(saved.sourceClosedBy, 'Sale cũ đã nghỉ');
      assert.equal(saved.sourceShippingStatus, 'Đã giao (lịch sử)');
      assert.equal(saved.total.toString(), '145000');
      assert.equal(saved.orderedAt.toISOString(), '2020-02-29T02:30:00.000Z');
      assert.equal(saved.items[0].unitPrice, '45000');
      assert.equal(await db.order.count(), 0);
      assert.equal(await db.orderHistory.count(), 0);
      const again = (await preview('ORDERS', [second, first]).expect(201)).body;
      assert.equal(again.counts.skip, 1);
      await commit(again).expect(201);
      assert.equal(await db.historicalOrder.count(), 1);
    },
  );
  await t.test(
    'Thiếu người chốt giữ trống có cảnh báo, không nhận người nhập làm người chốt',
    async () => {
      const p = (
        await preview('ORDERS', [{ ...order('DH-NO-CLOSER'), sourceClosedBy: '' }]).expect(201)
      ).body;
      assert.equal(p.counts.errors, 0);
      assert.equal(p.plan[0].warnings.length, 1);
      await commit(p).expect(201);
      assert.equal(
        (await db.historicalOrder.findUniqueOrThrow({ where: { externalId: 'DH-NO-CLOSER' } }))
          .sourceClosedBy,
        '',
      );
    },
  );
  await t.test('Phạm vi đơn cũ đi theo khách và đổi ngay sau bàn giao', async () => {
    assert.equal(
      (await send('get', '/sales/historical-orders', undefined, ta).expect(200)).body.total,
      2,
    );
    assert.equal(
      (await send('get', '/sales/historical-orders?search=SO-2020', undefined, tb).expect(200)).body
        .total,
      0,
    );
    await send('get', '/sales/historical-orders/' + orderId, undefined, tb).expect(404);
    await send('get', '/sales/historical-orders/' + orderId, undefined, ta).expect(200);
    await send('post', '/sales/customers/' + ca.id + '/handoff', {
      userId: b.id,
      version: ca.version,
      reason: 'Bàn giao khách sau nhập',
    }).expect(201);
    await send('get', '/sales/historical-orders/' + orderId, undefined, ta).expect(404);
    const d = (await send('get', '/sales/historical-orders/' + orderId, undefined, tb).expect(200))
      .body;
    assert.equal(d.sourceClosedBy, 'Sale cũ đã nghỉ');
    assert.equal(d.items.length, 2);
    await send('patch', '/sales/historical-orders/' + orderId, { sourceStatus: 'Đổi' }).expect(404);
    await send('patch', '/sales/orders/' + orderId + '/status', {
      version: 1,
      status: 'CONFIRMED',
      reason: '',
    }).expect(404);
    await send('post', '/sales/orders/' + orderId + '/payments', {
      version: 1,
      paidAmount: '1',
      note: 'Kiểm tra chỉ đọc',
    }).expect(404);
  });
  await t.test('Dữ liệu khách đổi sau xem trước thì không nhập đơn theo bản cũ', async () => {
    const p = (await preview('ORDERS', [order('DH-STALE')]).expect(201)).body;
    await db.customer.update({ where: { id: ca.id }, data: { version: { increment: 1 } } });
    await commit(p).expect(409);
    assert.equal(await db.historicalOrder.count({ where: { externalId: 'DH-STALE' } }), 0);
  });
  await t.test(
    'Không cấp quyền nhập cho Sale tổng và nhật ký không chứa dòng dữ liệu',
    async () => {
      const leadRole = await db.role.findUniqueOrThrow({
        where: { code: 'sales_lead' },
        include: { permissions: { include: { permission: true } } },
      });
      assert.equal(
        leadRole.permissions.some((p) => p.permission.code === 'core.imports.manage'),
        false,
      );
      const log = await db.auditLog.findFirstOrThrow({ where: { action: 'import.committed' } });
      assert.equal(log.entity, 'ImportBatch');
      assert.ok(log.metadata.create >= 0);
      assert.equal(JSON.stringify(log.metadata).includes('0912345678'), false);
      const history = (await send('get', '/imports/sapo/batches').expect(200)).body;
      assert.ok(history.total > 0);
      assert.ok(history.items.length <= 20);
      assert.equal(history.items[0].rows, undefined);
      assert.equal(history.items[0].plan, undefined);
    },
  );
});
