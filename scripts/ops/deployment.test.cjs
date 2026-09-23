const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { allowed, validateEnvironment, prepareRelease } = require('./deployment.cjs');
const { fileHash } = require('./backup.cjs');
const good = {
  SAKURA_DOMAIN: 'sale.sakura-company.vn',
  SAKURA_RELEASE: '2026-09-test',
  SAKURA_BACKUP_DIR: '/srv/sakura/backups',
  POSTGRES_USER: 'sakura',
  POSTGRES_DB: 'sakura',
  POSTGRES_PASSWORD: 'a1B2_3d4'.repeat(8),
  JWT_SECRET: 'aB1cD2'.repeat(16),
  MESSENGER_CONFIG_KEY: 'ab'.repeat(32),
  SEED_ADMIN_EMAIL: 'admin@sakura-company.vn',
  SEED_ADMIN_PASSWORD: 'aBc1234_xyz98765L',
};
test('Production validation rejects placeholders, injection and URL-unsafe database secrets without exposing values', () => {
  assert.equal(validateEnvironment(good).ready, true);
  for (const [key, value] of [
    ['SAKURA_DOMAIN', 'REPLACE_COMPANY_DOMAIN'],
    ['SAKURA_DOMAIN', 'sakura.example.com'],
    ['SAKURA_DOMAIN', 'https://sale.company.vn'],
    ['SAKURA_DOMAIN', 'sale.company.vn/path'],
    ['POSTGRES_PASSWORD', 'secret-that-is-long-but-contains@unsafe'],
    ['JWT_SECRET', 'short'],
    ['MESSENGER_CONFIG_KEY', 'REPLACE_MESSENGER_CONFIG_KEY'],
    ['MESSENGER_CONFIG_KEY', 'too-short'],
    ['SAKURA_BACKUP_DIR', '/'],
    ['SAKURA_BACKUP_DIR', '/srv/../etc'],
    ['POSTGRES_USER', 'user:password'],
    ['SAKURA_RELEASE', 'name${secret}'],
  ]) {
    const result = validateEnvironment({ ...good, [key]: value });
    assert.equal(result.ready, false, key);
    assert.equal(
      JSON.stringify(result).includes(value),
      false,
      'Never print supplied secret/config values',
    );
  }
});
test('Release excludes local data and credentials, preserves brand/source, verifies hashes and keeps generated environment outside build context', async () => {
  const root = path.resolve(__dirname, '../../.local/deployment-tests/' + randomUUID());
  await fs.mkdir(root, { recursive: true });
  const fixture = path.join(root, 'fixture');
  for (const f of [
    'package-lock.json',
    'Dockerfile',
    'compose.production.yaml',
    'infra/Caddyfile',
    'packages/brand/logo.jpg',
    'apps/app/src/main.ts',
    'apps/app/.env.production',
    'apps/app/node_modules/private.js',
    'apps/app/dist/build.js',
    'apps/app/recovery.key',
    '.env',
    '.local/database.dump',
  ]) {
    await fs.mkdir(path.dirname(path.join(fixture, f)), { recursive: true });
    await fs.writeFile(path.join(fixture, f), f);
  }
  await fs.copyFile(
    path.resolve(__dirname, '../../infra/production.env.example'),
    path.join(fixture, 'infra/production.env.example'),
  );
  const first = await prepareRelease(fixture, path.join(root, 'releases'));
  const m = JSON.parse(await fs.readFile(path.join(first.folder, 'manifest.json'), 'utf8'));
  assert.ok(m.files.some((f) => f.file === 'packages/brand/logo.jpg'));
  assert.ok(m.files.some((f) => f.file === 'apps/app/src/main.ts'));
  assert.equal(
    m.files.some((f) => /(?:^|\/)\.env|private|recovery|database\.dump|dist\//.test(f.file)),
    false,
  );
  assert.ok(m.files.some((f) => f.file === 'infra/production.env.example'));
  for (const f of m.files)
    assert.deepEqual(await fileHash(path.join(first.folder, 'source', f.file)), {
      sha256: f.sha256,
      bytes: f.bytes,
    });
  await assert.rejects(fs.stat(path.join(first.folder, 'source/.env.production')), {
    code: 'ENOENT',
  });
  const env = await fs.readFile(path.join(first.folder, '.env.production'), 'utf8');
  const parsed = require('node:util').parseEnv(env);
  assert.match(parsed.MESSENGER_CONFIG_KEY, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(first).includes(parsed.MESSENGER_CONFIG_KEY), false);
  const second = await prepareRelease(fixture, path.join(root, 'releases'));
  assert.notEqual(await fs.readFile(path.join(second.folder, '.env.production'), 'utf8'), env);
  assert.equal(await fs.readFile(path.join(fixture, '.env'), 'utf8'), '.env');
  assert.equal(first.environment.ready, false);
  assert.equal(allowed(['apps', '.local', 'whatever']), false);
});
