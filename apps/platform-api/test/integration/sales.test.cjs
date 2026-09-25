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

test('Sales: phân quyền, bàn giao và đơn hàng với PostgreSQL thật', async (t) => {
  let a, b, lead, ta, tb, tl, ca, cb, product, order, initialOrderBody;
  const send = (method, path, token, body) => {
    const q = http()
      [method]('/api/v1' + path)
      .set('Authorization', 'Bearer ' + token);
    return body === undefined ? q : q.send(body);
  };
  const get = (path, token) => send('get', path, token);
  const createCustomer = (token, name, phone) =>
    send('post', '/sales/customers', token, {
      name,
      phone,
      address: '12 Đường Hoa, Phường A, Hà Nội',
      regionId: region.id,
    });
  let region;
  await t.test('Chuẩn bị hai Sale cùng khu vực, một Sale tổng', async () => {
    region = await db.region.findUniqueOrThrow({ where: { code: 'NORTH' } });
    const role = await db.role.findUniqueOrThrow({ where: { code: 'sales_lead' } });
    async function staff(email, roleId, code) {
      return db.user.create({
        data: {
          email,
          displayName: code,
          passwordHash: admin.passwordHash,
          mustChangePassword: false,
          roleAssignments: { create: { roleId } },
          employee: { create: { code, fullName: code, regionId: region.id } },
        },
      });
    }
    a = await staff('a@sales.test', regionalRole.id, 'SALE-A');
    b = await staff('b@sales.test', regionalRole.id, 'SALE-B');
    lead = await staff('lead@sales.test', role.id, 'LEAD');
    ta = await mint(a.id);
    tb = await mint(b.id);
    tl = await mint(lead.id);
    ca = (await createCustomer(ta, 'Hoa của A', '+84 912 345 678').expect(201)).body;
    cb = (await createCustomer(tb, 'Hoa của B', '0987654321').expect(201)).body;
    assert.equal(ca.phone, '0912345678');
    assert.equal(ca.assignments[0].user.id, a.id);
  });
  await t.test('Cùng khu vực không được xem khách của nhau, kể cả tìm kiếm', async () => {
    assert.equal((await get('/sales/customers', ta).expect(200)).body.total, 1);
    assert.equal((await get('/sales/customers?search=0987654321', ta).expect(200)).body.total, 0);
    await get('/sales/customers/' + cb.id, ta).expect(404);
    await send('patch', '/sales/customers/' + cb.id, ta, {
      name: 'Xâm nhập',
      phone: cb.phone,
      address: cb.address,
      version: cb.version,
    }).expect(404);
    await send('post', '/sales/customers/' + cb.id + '/activities', ta, {
      version: cb.version,
      note: 'Không được ghi',
    }).expect(404);
    assert.equal((await get('/sales/customers', tl).expect(200)).body.total, 2);
  });
  await t.test('Chặn trùng số chuẩn hóa mà không lộ hồ sơ ngoài phạm vi', async () => {
    const duplicate = await createCustomer(tb, 'Tên khác', '0912.345.678').expect(409);
    assert.equal(JSON.stringify(duplicate.body).includes(ca.id), false);
    await createCustomer(ta, 'Không hợp lệ', 'abc123abc').expect(400);
  });
  await t.test('Khách có phiên bản; ghi chú giữ tác giả; xóa khu vực không cấp quyền', async () => {
    await send('post', '/sales/customers/' + ca.id + '/activities', ta, {
      version: ca.version,
      note: 'Khách cần ruy băng đỏ',
    }).expect(201);
    await send('patch', '/sales/customers/' + ca.id, ta, {
      version: ca.version,
      name: ca.name,
      phone: ca.phone,
      address: ca.address,
    }).expect(409);
    ca = (await get('/sales/customers/' + ca.id, ta).expect(200)).body;
    assert.equal(ca.activities[0].author.id, a.id);
    ca = (
      await send('patch', '/sales/customers/' + ca.id, ta, {
        version: ca.version,
        name: ca.name,
        phone: ca.phone,
        address: ca.address,
        regionId: null,
      }).expect(200)
    ).body;
    assert.equal(ca.regionId, null);
  });
  await t.test('Sale xem bảng giá, Sale tổng quản lý sản phẩm; SKU duy nhất', async () => {
    await get('/catalog/products', ta).expect(200);
    await send('post', '/catalog/products', ta, {
      name: 'Không được tạo',
      variants: [{ sku: 'DENIED', name: 'Đỏ', unit: 'Cuộn', price: '25000' }],
    }).expect(403);
    product = (
      await send('post', '/catalog/products', tl, {
        name: 'Ruy băng',
        category: 'Phụ kiện',
        variants: [
          { sku: 'RB-DO', name: 'Đỏ', unit: 'Cuộn', price: '25000' },
          { sku: 'RB-HONG', name: 'Hồng', unit: 'Cuộn', price: '12000' },
        ],
      }).expect(201)
    ).body;
    await send('post', '/catalog/products', tl, {
      name: 'Sản phẩm trùng',
      variants: [{ sku: 'RB-DO', name: 'Khác', unit: 'Cuộn', price: '1' }],
    }).expect(409);
    assert.equal(await db.product.count(), 1);
  });
  const bodyFor = (c) => ({
    requestKey: randomUUID(),
    customerId: c.id,
    customerVersion: c.version,
    items: product.variants.map((v, i) => ({
      variantId: v.id,
      quantity: i === 0 ? 2 : 3,
      expectedPrice: v.price,
    })),
    discount: '6000',
    shippingFee: '30000',
  });
  await t.test('Tạo đơn ngoài phạm vi, giả giá và dữ liệu tiền sai bị chặn', async () => {
    await send('post', '/sales/orders', ta, bodyFor(cb)).expect(404);
    const fake = bodyFor(ca);
    fake.items[0].expectedPrice = '1';
    await send('post', '/sales/orders', ta, fake).expect(409);
    await send('post', '/sales/orders', ta, { ...bodyFor(ca), closedByUserId: lead.id }).expect(
      400,
    );
    await send('post', '/sales/orders', ta, { ...bodyFor(ca), discount: '999999999999' }).expect(
      400,
    );
    const negative = bodyFor(ca);
    negative.items[0].quantity = -1;
    await send('post', '/sales/orders', ta, negative).expect(400);
  });
  await t.test('Lập đơn tính tiền chính xác; gửi lại cùng yêu cầu không nhân đôi', async () => {
    initialOrderBody = bodyFor(ca);
    order = (await send('post', '/sales/orders', ta, initialOrderBody).expect(201)).body;
    const expected =
      product.variants.reduce((sum, v, i) => sum + BigInt(v.price) * BigInt(i === 0 ? 2 : 3), 0n) -
      6000n +
      30000n;
    assert.equal(order.total, expected.toString());
    assert.equal(order.closedByUserId, null);
    assert.equal(order.shippingStatus, 'NOT_CREATED');
    assert.equal(
      (await send('post', '/sales/orders', ta, initialOrderBody).expect(201)).body.id,
      order.id,
    );
    assert.equal(await db.order.count(), 1);
    await send('post', '/sales/orders', ta, { ...initialOrderBody, note: 'Nội dung khác' }).expect(
      409,
    );
    await send('post', '/sales/orders/' + order.id + '/payments', ta, {
      version: 1,
      paidAmount: '100',
      note: 'Chưa chốt',
    }).expect(400);
  });
  await t.test('Bảng giá, tên hàng và địa chỉ mới không sửa lịch sử đơn', async () => {
    const v = product.variants[0];
    await send('patch', '/catalog/variants/' + v.id, tl, {
      version: v.version,
      price: '99000',
      isActive: true,
    }).expect(200);
    await send('patch', '/catalog/products/' + product.id, tl, {
      version: product.version,
      name: 'Ruy băng đổi tên',
      category: 'Mới',
      description: '',
      isActive: true,
    }).expect(200);
    const previousAddress = ca.address;
    ca = (
      await send('patch', '/sales/customers/' + ca.id, ta, {
        version: ca.version,
        name: ca.name,
        phone: ca.phone,
        address: 'Địa chỉ mới ở Hà Nội',
      }).expect(200)
    ).body;
    const saved = (await get('/sales/orders/' + order.id, ta).expect(200)).body;
    assert.equal(saved.shippingAddress, previousAddress);
    assert.ok(saved.items.every((i) => i.productName === 'Ruy băng'));
    assert.equal(saved.items.find((i) => i.sku === v.sku).unitPrice, v.price);
  });
  await t.test('Chốt đơn ghi người chốt từ phiên đăng nhập; không mở lại đơn đã chốt', async () => {
    order = (
      await send('patch', '/sales/orders/' + order.id + '/status', ta, {
        version: order.version,
        status: 'CONFIRMED',
      }).expect(200)
    ).body;
    assert.equal(order.closedByUserId, a.id);
    await send('patch', '/sales/orders/' + order.id + '/status', ta, {
      version: order.version,
      status: 'DRAFT',
    }).expect(400);
  });
  await t.test(
    'Sale vùng không bàn giao; người nhận phải hợp lệ; bàn giao không sửa người chốt',
    async () => {
      await send('post', '/sales/customers/' + ca.id + '/handoff', ta, {
        version: ca.version,
        userId: b.id,
        reason: 'Tự chuyển',
      }).expect(403);
      await send('post', '/sales/customers/' + ca.id + '/handoff', tl, {
        version: ca.version,
        userId: a.id,
        reason: 'Cùng người',
      }).expect(400);
      const disabled = await db.user.create({
        data: {
          email: 'disabled@sales.test',
          displayName: 'Khóa',
          passwordHash: admin.passwordHash,
          status: 'DISABLED',
        },
      });
      await send('post', '/sales/customers/' + ca.id + '/handoff', tl, {
        version: ca.version,
        userId: disabled.id,
        reason: 'Không hợp lệ',
      }).expect(400);
      ca = (
        await send('post', '/sales/customers/' + ca.id + '/handoff', tl, {
          version: ca.version,
          userId: b.id,
          reason: 'B chuyển sang chăm sóc',
        }).expect(201)
      ).body;
      assert.equal(ca.assignments[0].user.id, b.id);
      assert.equal((await db.order.findUnique({ where: { id: order.id } })).closedByUserId, a.id);
    },
  );
  await t.test(
    'Sau bàn giao, A mất cả quyền đọc/ghi khách và đơn; B nhận toàn bộ lịch sử',
    async () => {
      assert.equal((await get('/sales/customers', ta).expect(200)).body.total, 0);
      assert.equal((await get('/sales/orders', ta).expect(200)).body.total, 0);
      await get('/sales/customers/' + ca.id, ta).expect(404);
      await get('/sales/orders/' + order.id, ta).expect(404);
      await send('post', '/sales/customers/' + ca.id + '/activities', ta, {
        version: ca.version,
        note: 'Ghi sau bàn giao',
      }).expect(404);
      await send('patch', '/sales/orders/' + order.id + '/status', ta, {
        version: order.version,
        status: 'COMPLETED',
      }).expect(404);
      await send('post', '/sales/orders', ta, initialOrderBody).expect(404);
      const received = (await get('/sales/customers/' + ca.id, tb).expect(200)).body;
      assert.equal(received.activities[0].author.id, a.id);
      assert.equal(received.assignmentHistory.length, 2);
      assert.equal(
        (await get('/sales/orders/' + order.id, tb).expect(200)).body.closedByUserId,
        a.id,
      );
    },
  );
  await t.test('Quyền đọc khách GLOBAL không mở rộng quyền quản lý đơn ASSIGNED', async () => {
    const read = await db.permission.findUniqueOrThrow({ where: { code: 'sales.customers.read' } });
    const role = await db.role.create({
      data: {
        code: 'global_customer_reader',
        name: 'Đọc khách rộng hơn',
        permissions: { create: { permissionId: read.id, scope: 'GLOBAL' } },
      },
    });
    await db.userRoleAssignment.create({ data: { userId: a.id, roleId: role.id } });
    await get('/sales/customers/' + ca.id, ta).expect(200);
    const latest = (await get('/catalog/products', tl).expect(200)).body.items[0];
    const body = {
      requestKey: randomUUID(),
      customerId: ca.id,
      customerVersion: ca.version,
      items: [
        { variantId: latest.variants[0].id, quantity: 1, expectedPrice: latest.variants[0].price },
      ],
    };
    await send('post', '/sales/orders', ta, body).expect(404);
  });
  await t.test('Thu tiền lũy kế, chống ghi đè và không hủy đơn đã thu', async () => {
    order = (
      await send('post', '/sales/orders/' + order.id + '/payments', tb, {
        version: order.version,
        paidAmount: '10000',
        note: 'Nhận đặt cọc',
      }).expect(201)
    ).body;
    assert.equal(order.paymentStatus, 'PARTIAL');
    await send('post', '/sales/orders/' + order.id + '/payments', tb, {
      version: order.version,
      paidAmount: '999999999999999',
      note: 'Vượt tổng',
    }).expect(400);
    await send('post', '/sales/orders/' + order.id + '/payments', tb, {
      version: order.version,
      paidAmount: '1',
      note: 'Giảm tiền',
    }).expect(400);
    await send('post', '/sales/orders/' + order.id + '/payments', tb, {
      version: order.version - 1,
      paidAmount: '10000',
      note: 'Ghi đè cũ',
    }).expect(409);
    await send('patch', '/sales/orders/' + order.id + '/status', tb, {
      version: order.version,
      status: 'CANCELLED',
      reason: 'Đã thu tiền',
    }).expect(400);
    order = (
      await send('post', '/sales/orders/' + order.id + '/payments', tb, {
        version: order.version,
        paidAmount: order.total,
        note: 'Thu phần còn lại',
      }).expect(201)
    ).body;
    assert.equal(order.paymentStatus, 'PAID');
    order = (
      await send('patch', '/sales/orders/' + order.id + '/status', tb, {
        version: order.version,
        status: 'COMPLETED',
      }).expect(200)
    ).body;
    assert.equal(order.closedByUserId, a.id);
    await send('patch', '/sales/orders/' + order.id + '/status', tb, {
      version: order.version,
      status: 'CONFIRMED',
    }).expect(400);
  });
  await t.test('Hai bàn giao đồng thời chỉ có một người nhận đang hiệu lực', async () => {
    const results = await Promise.all([
      send('post', '/sales/customers/' + ca.id + '/handoff', tl, {
        version: ca.version,
        userId: a.id,
        reason: 'Chuyển lại A',
      }),
      send('post', '/sales/customers/' + ca.id + '/handoff', tl, {
        version: ca.version,
        userId: lead.id,
        reason: 'Chuyển về tổng',
      }),
    ]);
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok(results.some((r) => r.status === 409));
    assert.equal(
      await db.customerAssignment.count({ where: { customerId: ca.id, endedAt: null } }),
      1,
    );
    ca = (await get('/sales/customers/' + ca.id, tl).expect(200)).body;
    assert.equal((await db.order.findUnique({ where: { id: order.id } })).closedByUserId, a.id);
  });
  await t.test('Hai yêu cầu tạo đơn cùng khóa không tạo đơn trùng', async () => {
    const latest = (await get('/catalog/products', tl).expect(200)).body.items[0];
    const body = {
      requestKey: randomUUID(),
      customerId: ca.id,
      customerVersion: ca.version,
      items: [
        { variantId: latest.variants[0].id, quantity: 1, expectedPrice: latest.variants[0].price },
      ],
    };
    const results = await Promise.all([
      send('post', '/sales/orders', tl, body),
      send('post', '/sales/orders', tl, body),
    ]);
    assert.ok(results.some((r) => r.status === 201));
    assert.ok(results.every((r) => [201, 409].includes(r.status)));
    assert.equal(await db.order.count({ where: { requestKey: body.requestKey } }), 1);
    const draft = (await send('post', '/sales/orders', tl, body).expect(201)).body;
    await send('patch', '/sales/orders/' + draft.id + '/status', tl, {
      version: draft.version,
      status: 'CANCELLED',
    }).expect(400);
    await send('patch', '/sales/orders/' + draft.id + '/status', tl, {
      version: draft.version,
      status: 'CANCELLED',
      reason: 'Khách đổi ý',
    }).expect(200);
  });
  await t.test('Sản phẩm ngừng bán không nhận đơn mới; nhật ký ghi bàn giao và chốt', async () => {
    const latest = (await get('/catalog/products', tl).expect(200)).body.items[0];
    await send('patch', '/catalog/products/' + latest.id, tl, {
      version: latest.version,
      name: latest.name,
      category: latest.category,
      description: latest.description,
      isActive: false,
    }).expect(200);
    const body = {
      requestKey: randomUUID(),
      customerId: ca.id,
      customerVersion: ca.version,
      items: [
        { variantId: latest.variants[0].id, quantity: 1, expectedPrice: latest.variants[0].price },
      ],
    };
    await send('post', '/sales/orders', tl, body).expect(400);
    const logs = await db.auditLog.findMany({ where: { entityId: ca.id } });
    assert.ok(logs.some((l) => l.action === 'customer.handoff'));
    assert.ok(
      (await db.orderHistory.count({ where: { orderId: order.id, action: 'status_changed' } })) >=
        2,
    );
  });
  await t.test(
    'Báo cáo gộp đúng nguồn, giờ Việt Nam, tiền chưa biết và phạm vi khách',
    async () => {
      const mine = await db.customer.create({
        data: {
          name: 'Report test',
          address: 'Test',
          createdById: a.id,
          assignments: {
            create: { userId: a.id, assignedById: admin.id, reason: 'Report fixture' },
          },
        },
      });
      const historical = (
        id,
        status,
        total,
        paid,
        at = '2025-06-01T03:00:00Z',
        customerId = mine.id,
      ) =>
        db.historicalOrder.create({
          data: {
            externalId: 'report-' + id,
            number: 'R' + id,
            customerId,
            sourceStatus: status,
            sourcePaymentStatus: 'Test',
            sourceShippingStatus: 'Test',
            sourceClosedBy: 'Old salesperson',
            orderedAt: new Date(at),
            recipientName: 'Test',
            recipientPhone: '',
            shippingAddress: 'Test',
            total,
            paidAmount: paid,
            items: [],
          },
        });
      await historical('valid', 'Đã hoàn thành', 1000, 400);
      await historical('unknown-paid', 'Đang giao dịch', 2000, null);
      await historical('cancel', 'Đã hủy', 3000, 0);
      await historical('archive', 'Đã lưu trữ', 4000, null);
      await historical('draft', 'Đặt hàng', 500, 0);
      await historical('previous', 'Đã hoàn thành', 200, 200, '2025-05-31T03:00:00Z');
      await historical('unlinked', 'Đã hoàn thành', 9000, 9000, '2025-06-01T03:00:00Z', null);
      await db.order.create({
        data: {
          customerId: mine.id,
          createdById: admin.id,
          requestKey: randomUUID(),
          requestHash: 'fixture',
          recipientName: 'Test',
          recipientPhone: '',
          shippingAddress: 'Test',
          subtotal: 500,
          discount: 0,
          shippingFee: 0,
          total: 500,
          paidAmount: 200,
          paymentStatus: 'PARTIAL',
          status: 'CONFIRMED',
          closedByUserId: admin.id,
          closedAt: new Date('2025-05-31T17:15:00Z'),
          createdAt: new Date('2025-05-31T17:15:00Z'),
        },
      });
      const path = '/sales/reports?from=2025-06-01&to=2025-06-01';
      const r = (await get(path, ta).expect(200)).body;
      assert.equal(r.summary.sales, '3500');
      assert.equal(r.summary.orders, 6);
      assert.equal(r.summary.validOrders, 3);
      assert.equal(r.summary.paid, '600');
      assert.equal(r.summary.unpaid, '900');
      assert.equal(r.summary.unknownPayments, 1);
      assert.equal(r.summary.unclassified, 1);
      assert.equal(r.previous.sales, '200');
      assert.equal(r.timeline[0].label, '2025-06-01');
      assert.equal((await get(path + '&source=SAPO', ta).expect(200)).body.summary.sales, '3000');
      assert.equal((await get(path, tb).expect(200)).body.summary.orders, 0);
      assert.equal((await get(path, tl).expect(200)).body.summary.sales, '12500');
      await get('/sales/reports?from=2025-02-30&to=2025-03-01', ta).expect(400);
      await get('/sales/reports?from=2024-01-01&to=2026-01-01', ta).expect(400);
      const denied = await db.user.create({
        data: {
          email: 'no-reports@test.local',
          displayName: 'No reports',
          passwordHash: admin.passwordHash,
          mustChangePassword: false,
        },
      });
      await get(path, await mint(denied.id)).expect(403);
    },
  );
});

test('Pipeline: totals include hidden cards; moves are scoped, versioned and preserve customer details', async () => {
  const user = await db.user.create({data:{email:'pipeline-owner@test.local',displayName:'Pipeline owner',passwordHash:admin.passwordHash,mustChangePassword:false,roleAssignments:{create:{roleId:regionalRole.id}}}});
  const jwt = await mint(user.id);
  const req = (method,path,body) => { const r=http()[method]('/api/v1'+path).set('Authorization','Bearer '+jwt);return body===undefined?r:r.send(body); };
  const rows=[];
  for(let i=0;i<31;i++)rows.push(await db.customer.create({data:{name:'Pipeline '+String(i).padStart(2,'0'),address:'Keep address',status:'CONSULTING',expectedRevenue:'1000',closingProbability:50,expectedProducts:['Ribbon'],expectedItems:[{name:'Ribbon',unit:'cuộn',quantity:2}],createdById:admin.id,assignments:{create:{userId:user.id,assignedById:admin.id,reason:"Pipeline test"}}}}));
  const foreign=await db.customer.create({data:{name:'Outside pipeline',status:'WON',expectedRevenue:'99999999',createdById:admin.id}});
  let board=(await req('get','/sales/dashboard/pipeline-board').expect(200)).body;
  assert.equal(board.totalExpectedRevenue,'15500');
  assert.equal(board.columns.find(c=>c.status==='CONSULTING').items.length,30);
  assert.equal(board.columns.find(c=>c.status==='CONSULTING').count,31);
  assert.equal(board.expectedShipments[0].quantity,'31.00');
  assert.equal(board.columns.find(c=>c.status==='CONSULTING').items[0].canManage,true);
  const c=rows[0],url='/sales/customers/'+c.id+'/pipeline';
  await req('patch',url,{version:c.version,closingProbability:101}).expect(400);
  await req('patch',url,{version:c.version,expectedItems:[{name:'Ribbon',unit:'cuộn',quantity:-1}]}).expect(400);
  await req('patch','/sales/customers/'+foreign.id+'/pipeline',{version:foreign.version,status:'NEW'}).expect(404);
  await req('patch',url,{version:c.version,status:'WON'}).expect(200);
  await req('patch',url,{version:c.version,status:'INACTIVE'}).expect(409);
  const saved=await db.customer.findUniqueOrThrow({where:{id:c.id}});
  assert.equal(saved.status,'WON');assert.equal(saved.address,'Keep address');assert.equal(saved.expectedRevenue.toString(),'1000');assert.equal(saved.closingProbability,50);
  assert.equal(await db.auditLog.count({where:{entityId:c.id,action:'customer.pipeline_updated'}}),1);
  board=(await req('get','/sales/dashboard/pipeline-board').expect(200)).body;
  assert.equal(board.totalExpectedRevenue,'16000');assert.equal(board.expectedShipments[0].quantity,'32.00');
  await req('patch',url,{version:saved.version,status:'INACTIVE'}).expect(200);
  board=(await req('get','/sales/dashboard/pipeline-board').expect(200)).body;
  assert.equal(board.totalExpectedRevenue,'15000');
  const table=(await req('get','/sales/dashboard/customers?page=1&pageSize=100').expect(200)).body;
  assert.equal(table.total,31);assert.equal(table.items.find(x=>x.id===c.id).effectiveProbability,0);
  const denied=await db.user.create({data:{email:'pipeline-denied@test.local',displayName:'No pipeline permissions',passwordHash:admin.passwordHash,mustChangePassword:false}});
  await http().patch('/api/v1'+url).set('Authorization','Bearer '+await mint(denied.id)).send({version:saved.version+1,status:'NEW'}).expect(403);
});
