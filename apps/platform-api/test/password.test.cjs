const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../dist/auth/password');
const { configuration } = require('../dist/config');
test('Băm có salt, xác minh đúng/sai và không lưu mật khẩu gốc', async () => {
  const first = await hashPassword('Sakura-password-123');
  const second = await hashPassword('Sakura-password-123');
  assert.notEqual(first, second);
  assert.equal(first.includes('Sakura-password'), false);
  assert.equal(await verifyPassword('Sakura-password-123', first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword('wrong', 'invalid'), false);
});
test('Production từ chối khóa yếu và cấu hình cookie không HTTPS', () => {
  assert.throws(() =>
    configuration({ JWT_SECRET: 'weak', DATABASE_URL: 'postgresql://localhost' }),
  );
  assert.throws(() =>
    configuration({
      JWT_SECRET: 'a'.repeat(64),
      DATABASE_URL: 'postgresql://localhost',
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
      WEB_ORIGIN: 'http://localhost:5173',
    }),
  );
  assert.equal(
    configuration({
      JWT_SECRET: 'a'.repeat(64),
      DATABASE_URL: 'postgresql://localhost',
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      WEB_ORIGIN: 'https://sale.example.test',
    }).secureCookie,
    true,
  );
});
