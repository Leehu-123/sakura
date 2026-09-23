const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { within, fileHash, verifyBundle } = require('./backup.cjs');
const root = path.resolve(__dirname, '../../.local/ops-unit-tests');
test('Không cho đường dẫn bản sao thoát khỏi thư mục', () => {
  assert.throws(() => within(root, '../secret'));
  assert.throws(() => within(root, path.resolve(root, '../secret')));
  assert.throws(() => within(root, 'media\\..\\secret'));
  assert.equal(within(root, 'media/aa/file'), path.join(root, 'media/aa/file'));
});
test('Chỉ nhận bản hoàn tất, phát hiện thay đổi dữ liệu và danh sách tệp', async () => {
  const folder = path.join(root, randomUUID());
  await fs.mkdir(folder, { recursive: true });
  try {
    await fs.writeFile(path.join(folder, 'database.dump'), 'test-only-not-a-real-dump');
    const m = {
      format: 'SAKURA_BACKUP_V1',
      tables: [],
      files: [{ file: 'database.dump', ...(await fileHash(path.join(folder, 'database.dump'))) }],
    };
    const raw = JSON.stringify(m);
    await fs.writeFile(path.join(folder, 'manifest.json'), raw);
    await assert.rejects(() => verifyBundle(folder));
    await fs.writeFile(
      path.join(folder, 'COMPLETE.json'),
      JSON.stringify({ manifestSha256: createHash('sha256').update(raw).digest('hex') }),
    );
    assert.equal((await verifyBundle(folder)).files.length, 1);
    await fs.writeFile(path.join(folder, 'database.dump'), 'changed');
    await assert.rejects(() => verifyBundle(folder), /hỏng/);
    await fs.writeFile(path.join(folder, 'manifest.json'), '{}');
    await assert.rejects(() => verifyBundle(folder), /thay đổi/);
  } finally {
    for (const name of ['database.dump', 'manifest.json', 'COMPLETE.json'])
      await fs.unlink(path.join(folder, name)).catch(() => {});
    await fs.rmdir(folder);
  }
});
