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
test('Luồng Core API với PostgreSQL thật', async (t) => {
  await t.test('Migration và seed tạo đúng dữ liệu; seed lại không đổi mật khẩu', async () => {
    assert.equal(await db.role.count(), 3);
    assert.equal(await db.region.count(), 2);
    execFileSync(
      process.execPath,
      [resolve(root, 'packages/database/dist-seed/packages/database/prisma/seed.js')],
      { cwd: root, env: process.env, stdio: 'pipe', windowsHide: true },
    );
    assert.equal(await db.user.count(), 1);
    assert.equal(
      (await db.user.findUnique({ where: { id: admin.id } })).passwordHash,
      admin.passwordHash,
    );
  });
  await t.test('API chặn khách chưa đăng nhập; health và OpenAPI hoạt động', async () => {
    await http().get('/api/v1/core/users').expect(401);
    await http().get('/api/v1/health').expect(200);
    const spec = await http().get('/api/docs-json').expect(200);
    assert.ok(spec.body.paths['/api/v1/core/users']);
  });
  await t.test('Đăng nhập phát cookie HttpOnly và buộc đổi mật khẩu', async () => {
    const response = await http()
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@integration.test', password: initialPassword })
      .expect(201);
    token = response.body.accessToken;
    cookie = response.headers['set-cookie'][0].split(';')[0];
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
    assert.equal(response.body.refreshToken, undefined);
    await http().get('/api/v1/core/users').set(auth()).expect(403);
    await http().get('/api/v1/auth/me').set(auth()).expect(200);
  });
  await t.test('Đổi mật khẩu thu hồi token cũ; đăng nhập lại được', async () => {
    await http()
      .post('/api/v1/auth/change-password')
      .set(auth())
      .send({ currentPassword: initialPassword, password: changedPassword })
      .expect(201);
    await http().get('/api/v1/auth/me').set(auth()).expect(401);
    const result = await http()
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@integration.test', password: changedPassword })
      .expect(201);
    token = result.body.accessToken;
    cookie = result.headers['set-cookie'][0].split(';')[0];
  });
  await t.test('Không trả mật khẩu, phân trang hợp lệ và từ chối trường lạ', async () => {
    const response = await http().get('/api/v1/core/users').set(auth()).expect(200);
    assert.equal(response.body.items[0].passwordHash, undefined);
    await http().get('/api/v1/core/users?page=0').set(auth()).expect(400);
    await http()
      .post('/api/v1/core/users')
      .set(auth())
      .send({
        email: 'sale@integration.test',
        displayName: 'Sale Bắc',
        password: initialPassword,
        roleIds: [regionalRole.id],
        isAdmin: true,
      })
      .expect(400);
  });
  await t.test('Bảo vệ quản trị viên cuối cùng', async () => {
    await http()
      .patch('/api/v1/core/users/' + admin.id)
      .set(auth())
      .send({ status: 'DISABLED' })
      .expect(400);
    await http()
      .patch('/api/v1/core/users/' + admin.id)
      .set(auth())
      .send({ roleIds: [] })
      .expect(400);
  });
  await t.test('Tạo Sale vùng; không được xem tài khoản/nhật ký công ty', async () => {
    sale = (
      await http()
        .post('/api/v1/core/users')
        .set(auth())
        .send({
          email: 'sale@integration.test',
          displayName: 'Sale Bắc',
          password: initialPassword,
          roleIds: [regionalRole.id],
        })
        .expect(201)
    ).body;
    await db.user.update({ where: { id: sale.id }, data: { mustChangePassword: false } });
    saleToken = await mint(sale.id);
    const me = (
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer ' + saleToken)
        .expect(200)
    ).body;
    assert.ok(
      me.grants.every(
        (g) =>
          (g.scope === 'ASSIGNED' && g.permission.startsWith('sales.')) ||
          (g.scope === 'GLOBAL' && g.permission === 'catalog.products.read'),
      ),
    );
    await http()
      .get('/api/v1/core/users')
      .set('Authorization', 'Bearer ' + saleToken)
      .expect(403);
    await http()
      .get('/api/v1/core/audit-logs')
      .set('Authorization', 'Bearer ' + saleToken)
      .expect(403);
  });
  await t.test('Không cấp phạm vi trái phép hoặc sửa vai trò mặc định', async () => {
    const permission = await db.permission.findUniqueOrThrow({
      where: { code: 'core.users.manage' },
    });
    await http()
      .post('/api/v1/core/roles')
      .set(auth())
      .send({
        code: 'bad_scope',
        name: 'Sai phạm vi',
        grants: [{ permissionId: permission.id, scope: 'ASSIGNED' }],
      })
      .expect(400);
    await http()
      .patch('/api/v1/core/roles/' + adminRole.id)
      .set(auth())
      .send({ code: 'admin', name: 'Admin', grants: [] })
      .expect(403);
  });
  await t.test('Quản lý tài khoản không đồng nghĩa quyền tự gán Admin', async () => {
    const permission = await db.permission.findUniqueOrThrow({
      where: { code: 'core.users.manage' },
    });
    const role = await db.role.create({
      data: {
        code: 'user_operator',
        name: 'Quản lý tài khoản',
        permissions: { create: { permissionId: permission.id, scope: 'GLOBAL' } },
      },
    });
    await db.userRoleAssignment.create({ data: { userId: sale.id, roleId: role.id } });
    await http()
      .patch('/api/v1/core/users/' + sale.id)
      .set('Authorization', 'Bearer ' + saleToken)
      .send({ roleIds: [adminRole.id] })
      .expect(403);
    await http()
      .post('/api/v1/core/users')
      .set('Authorization', 'Bearer ' + saleToken)
      .send({
        email: 'escalate@integration.test',
        displayName: 'Escalation',
        password: initialPassword,
        roleIds: [adminRole.id],
      })
      .expect(403);
  });
  await t.test('Không thể chiếm quyền quản trị bằng cách đặt lại mật khẩu', async () => {
    await http()
      .post('/api/v1/core/users/' + admin.id + '/reset-password')
      .set('Authorization', 'Bearer ' + saleToken)
      .send({ password: initialPassword })
      .expect(403);
    await http()
      .patch('/api/v1/core/users/' + admin.id)
      .set('Authorization', 'Bearer ' + saleToken)
      .send({ status: 'DISABLED' })
      .expect(403);
  });
  await t.test('Danh mục và liên kết nhân viên hoạt động', async () => {
    const region = await db.region.findUniqueOrThrow({ where: { code: 'NORTH' } });
    await http()
      .post('/api/v1/core/catalogs/branches')
      .set(auth())
      .send({ code: 'HN', name: 'Hà Nội' })
      .expect(201);
    await http()
      .post('/api/v1/core/catalogs/employees')
      .set(auth())
      .send({ code: 'NV01', fullName: 'Sale Bắc', regionId: region.id, userId: sale.id })
      .expect(201);
    const catalogs = (await http().get('/api/v1/core/catalogs').set(auth()).expect(200)).body;
    assert.equal(catalogs.employees[0].region.code, 'NORTH');
    assert.equal(catalogs.employees[0].user.passwordHash, undefined);
  });
  await t.test(
    'Chỉ quản trị được xem dung lượng và tình trạng sao lưu, không có API phục hồi ghi đè',
    async () => {
      await http().get('/api/v1/core/storage').expect(401);
      const result = (await http().get('/api/v1/core/storage').set(auth()).expect(200)).body;
      assert.ok(Number.isFinite(result.databaseBytes));
      assert.ok(Array.isArray(result.warnings));
      const text = JSON.stringify(result);
      assert.ok(!text.includes('password'));
      assert.ok(!text.includes('DATABASE_URL'));
      assert.ok(!text.includes('storageKey'));
      await http()
        .get('/api/v1/core/storage')
        .set('Authorization', 'Bearer ' + saleToken)
        .expect(403);
      await http().post('/api/v1/core/storage/restore').set(auth()).send({}).expect(404);
    },
  );
  await t.test('Khóa tài khoản thu hồi access token ngay lập tức', async () => {
    await http()
      .patch('/api/v1/core/users/' + sale.id)
      .set(auth())
      .send({ status: 'DISABLED' })
      .expect(200);
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ' + saleToken)
      .expect(401);
  });
  await t.test('Nhật ký ghi thao tác, không ghi mật khẩu/token', async () => {
    const audit = await http().get('/api/v1/core/audit-logs').set(auth()).expect(200);
    assert.ok(audit.body.items.some((a) => a.action === 'user.created'));
    const all = JSON.stringify(await db.auditLog.findMany());
    assert.equal(all.includes(initialPassword), false);
    assert.equal(all.includes(changedPassword), false);
    assert.equal(all.includes(token), false);
  });
  await t.test('Refresh chống CSRF, xoay token và thu hồi cả phiên khi phát lại', async () => {
    await http()
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://untrusted.test')
      .set('Cookie', cookie)
      .expect(403);
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(201);
    const newCookie = refreshed.headers['set-cookie'][0].split(';')[0];
    assert.notEqual(cookie, newCookie);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(401);
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ' + refreshed.body.accessToken)
      .expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', newCookie)
      .expect(401);
  });
  await t.test('Đăng xuất thu hồi phiên ngay cả khi access token còn hạn', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@integration.test', password: changedPassword })
      .expect(201);
    await http()
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', login.headers['set-cookie'][0].split(';')[0])
      .expect(201);
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer ' + login.body.accessToken)
      .expect(401);
  });
  await t.test('Giới hạn số lần đăng nhập', async () => {
    for (let i = 0; i < 2; i++)
      await http()
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email: 'admin@integration.test', password: 'wrong' })
        .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@integration.test', password: 'wrong' })
      .expect(429);
  });
});
