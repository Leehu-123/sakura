const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { sha, encrypt, decrypt } = require('./offsite-crypto.cjs');
const {
  prepare,
  readIndex,
  publish,
  restore,
  remoteRoot,
  validManifest,
} = require('./offsite.cjs');
const { fileHash, verifyBundle } = require('./backup.cjs');
const BASE = path.resolve(__dirname, '../../.local/ops-unit-tests');
async function area(t) {
  const root = path.join(BASE, 'offsite-' + randomUUID());
  await fs.mkdir(root, { recursive: true });
  t.after(async () => {
    // Only remove our generated fixture directory, never a user-selected directory.
    if (path.dirname(root) !== BASE || !/^offsite-[a-f0-9-]{36}$/.test(path.basename(root)))
      throw Error('Invalid cleanup');
    async function remove(dir) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) await remove(f);
        else await fs.unlink(f);
      }
      await fs.rmdir(dir);
    }
    await remove(root);
  });
  return root;
}
async function fixture(t) {
  const root = await area(t),
    source = path.join(root, 'source');
  await fs.mkdir(source);
  const image = Buffer.from('unique image bytes'),
    hash = sha(image);
  const rel = `media/${hash.slice(0, 2)}/${hash}`;
  await fs.mkdir(path.dirname(path.join(source, rel)), { recursive: true });
  await fs.writeFile(path.join(source, rel), image);
  await fs.writeFile(
    path.join(source, 'database.dump'),
    Buffer.from('confidential customer/order fixture'),
  );
  const files = [];
  for (const file of [rel, 'database.dump'])
    files.push({ file, ...(await fileHash(path.join(source, file))) });
  const m = {
    format: 'SAKURA_BACKUP_V1',
    id: '2026-09-09-fixture',
    tables: [],
    files,
    mediaFiles: 1,
    rows: 0,
  };
  await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify(m));
  await fs.writeFile(
    path.join(source, 'COMPLETE.json'),
    JSON.stringify({ manifestSha256: sha(JSON.stringify(m)) }),
  );
  const keyFile = path.join(root, 'recovery.key');
  await fs.writeFile(keyFile, randomBytes(32));
  return {
    source,
    root,
    c: { keyFile, workRoot: path.join(root, 'work'), enabled: true, recoveryKeySecured: true },
  };
}
function memoryTransport() {
  const data = new Map(),
    writes = [];
  return {
    data,
    writes,
    async put(store, name, file) {
      const b = await fs.readFile(file),
        k = store + '/' + name;
      if (data.has(k))
        assert.deepEqual(data.get(k), b, 'Existing objects must never be overwritten');
      else {
        data.set(k, b);
        writes.push(k);
      }
    },
    async get(store, name, file) {
      const b = data.get(store + '/' + name);
      if (!b) throw Error('Remote object unavailable');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, b, { flag: 'wx' });
    },
  };
}
test('AES-GCM rejects wrong keys, tampered headers/ciphertext/tags and publishes no unauthenticated plaintext', async (t) => {
  const root = await area(t),
    key = randomBytes(32),
    src = path.join(root, 'data');
  const bytes = randomBytes(128 * 1024 + 13);
  await fs.writeFile(src, bytes);
  const enc = path.join(root, 'encrypted');
  await encrypt(src, enc, key);
  await decrypt(enc, path.join(root, 'ok'), key, { sha256: sha(bytes), bytes: bytes.length });
  assert.deepEqual(await fs.readFile(path.join(root, 'ok')), bytes);
  await assert.rejects(() => decrypt(enc, path.join(root, 'wrong'), randomBytes(32)));
  for (const index of [0, 10, 25, bytes.length + 35]) {
    const b = await fs.readFile(enc);
    b[index] ^= 1;
    const tamper = path.join(root, 'tamper-' + index),
      target = path.join(root, 'output-' + index);
    await fs.writeFile(tamper, b);
    await assert.rejects(() => decrypt(tamper, target, key));
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  }
  await assert.rejects(() =>
    decrypt(enc, path.join(root, 'bad-hash'), key, { sha256: '0'.repeat(64), bytes: bytes.length }),
  );
  assert.equal((await fs.readdir(root)).filter((f) => f.endsWith('.tmp')).length, 0);
});
test('Split backup deduplicates encrypted images; both stores verified before completion; restores using Drive fallback', async (t) => {
  const { c, source } = await fixture(t),
    transport = memoryTransport();
  const p = await prepare(c, source),
    first = await readIndex(c, p.folder);
  assert.equal(p.reusedMedia, 0);
  await publish(c, p.folder, transport);
  assert.ok(transport.writes.at(-1).endsWith('/COMPLETE.json'));
  const again = await prepare(c, source);
  assert.equal(again.reusedMedia, 1);
  await publish(c, again.folder, transport);
  assert.equal(transport.writes.filter((s) => s.startsWith('r2/')).length, 1);
  assert.equal(transport.writes.filter((s) => s.startsWith('drive/media-backup/')).length, 1);
  const r = await restore(c, p.id, transport);
  assert.equal(r.fallbackImages, 0);
  assert.deepEqual((await verifyBundle(r.folder)).files, first.index.manifest.files);
  const remoteImage = 'r2/' + first.index.media[0].object;
  transport.data.set(remoteImage, Buffer.from('corrupted image'));
  const fallback = await restore(c, p.id, transport);
  assert.equal(fallback.fallbackImages, 1);
  transport.data.delete('drive/media-backup/' + first.index.media[0].object);
  await assert.rejects(() => restore(c, p.id, transport));
});
test('Failed remote verification never commits a snapshot; upload remains disabled before connection', async (t) => {
  const { c, source } = await fixture(t),
    p = await prepare(c, source),
    transport = memoryTransport();
  await assert.rejects(() => publish({ ...c, enabled: false }, p.folder, transport), /Chưa bật/);
  await assert.rejects(
    () => publish({ ...c, recoveryKeySecured: false }, p.folder, transport),
    /Chưa bật/,
  );
  assert.equal(transport.data.size, 0);
  const failed = {
    put: transport.put,
    get: async () => {
      throw Error('network failure');
    },
  };
  await assert.rejects(() => publish(c, p.folder, failed), /network failure/);
  assert.equal(
    [...transport.data.keys()].some((k) => k.endsWith('COMPLETE.json')),
    false,
  );
  await publish(c, p.folder, transport);
  const b = transport.data.get('drive/snapshots/' + p.id + '/index.enc');
  b[21] ^= 1;
  await assert.rejects(() => restore(c, p.id, transport), /mã kiểm tra/);
});
test('Rejects unsafe remote roots and mismatched image paths', () => {
  for (const value of [
    'C:/private',
    'C:private',
    ':local:/tmp',
    'r2:',
    'r2:bucket/../other',
    'r2:bucket\\other',
    '--config:x',
    'https://example.com',
  ])
    assert.throws(() => remoteRoot(value));
  assert.equal(remoteRoot('sakura_r2:sakura-backup/sakura'), 'sakura_r2:sakura-backup/sakura');
  assert.throws(() =>
    validManifest({
      format: 'SAKURA_BACKUP_V1',
      id: '2026-fixture',
      tables: [],
      files: [
        { file: 'database.dump', bytes: 1, sha256: '1'.repeat(64) },
        { file: 'media/aa/' + 'b'.repeat(64), bytes: 1, sha256: 'b'.repeat(64) },
      ],
    }),
  );
});
