const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const {
  config: backupConfig,
  latest,
  verifyBundle,
  fileHash,
  within,
  drill,
  createBackup,
} = require('./backup.cjs');
const { readKey, encrypt, decrypt, sha } = require('./offsite-crypto.cjs');
const ROOT = path.resolve(__dirname, '../..');
const ID = /^\d{4}-[A-Za-z0-9-]+$/;
const HASH = /^[a-f0-9]{64}$/;
const run = promisify(execFile);
async function json(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
}
async function readJson(file) {
  const s = await fs.lstat(file);
  if (!s.isFile() || s.size > 32 * 1024 * 1024) throw Error('Tệp cấu hình/danh sách không hợp lệ.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function settings() {
  const filename = path.resolve(
    process.env.OFFSITE_CONFIG || path.join(ROOT, '.local/offsite/config.json'),
  );
  const c = await readJson(filename);
  if (c.format !== 'SAKURA_OFFSITE_CONFIG_V1') throw Error('Cấu hình ngoài máy không hỗ trợ.');
  for (const k of ['workRoot', 'keyFile', 'rcloneConfig']) {
    if (typeof c[k] !== 'string' || !path.isAbsolute(c[k]))
      throw Error('Cần đường dẫn tuyệt đối: ' + k);
  }
  return c;
}
async function init() {
  const base = path.join(ROOT, '.local/offsite');
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  const keyFile = path.join(base, 'recovery.key');
  try {
    await fs.writeFile(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  await readKey(keyFile);
  const c = {
    format: 'SAKURA_OFFSITE_CONFIG_V1',
    workRoot: base,
    keyFile,
    rcloneBin: 'rclone',
    rcloneConfig: path.join(base, 'rclone.conf'),
    driveRemote: null,
    r2Remote: null,
    enabled: false,
    recoveryKeySecured: false,
    schedule: { enabled: false, time: '02:00', timezone: 'Asia/Bangkok' },
    retentionDays: 30,
    automaticDeletion: false,
    warningBytes: 8000000000,
  };
  try {
    await json(path.join(base, 'config.json'), c);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  return { configured: true, connected: false, automaticBackup: false };
}
function validManifest(m) {
  if (
    m.format !== 'SAKURA_BACKUP_V1' ||
    !ID.test(m.id) ||
    !Array.isArray(m.files) ||
    !Array.isArray(m.tables)
  )
    throw Error('Danh sách phục hồi không hỗ trợ.');
  if (
    m.files.filter((f) => f.file === 'database.dump').length !== 1 ||
    new Set(m.files.map((f) => f.file)).size !== m.files.length
  )
    throw Error('Thành phần thiếu hoặc trùng.');
  for (const f of m.files) {
    if (!HASH.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0)
      throw Error('Mã kiểm tra không hợp lệ.');
    if (f.file !== 'database.dump' && f.file !== `media/${f.sha256.slice(0, 2)}/${f.sha256}`)
      throw Error('Đường dẫn ảnh không khớp nội dung.');
  }
}
async function assertHash(file, expected) {
  const actual = await fileHash(file);
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
    throw Error('Tệp không khớp mã kiểm tra.');
}
async function prepare(c, source) {
  const m = await verifyBundle(source);
  validManifest(m);
  const key = await readKey(c.keyFile),
    keyId = sha(key);
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const folder = path.join(c.workRoot, 'prepared', id);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const media = [];
  let reused = 0;
  for (const f of m.files.filter((f) => f.file !== 'database.dump')) {
    const name = `${keyId}/media/${f.sha256}.enc`;
    const cached = within(path.join(c.workRoot, 'objects'), name);
    if (await fs.stat(cached).catch(() => false)) {
      // Validate cached ciphertext with the key and plaintext hash, not just its filename.
      const check = path.join(folder, randomUUID() + '.check');
      await decrypt(cached, check, key, f);
      await fs.unlink(check);
      reused++;
    } else await encrypt(within(source, f.file), cached, key);
    media.push({ file: f.file, object: name, ...(await fileHash(cached)) });
  }
  const dump = m.files.find((f) => f.file === 'database.dump');
  await encrypt(path.join(source, 'database.dump'), path.join(folder, 'database.enc'), key);
  const database = await fileHash(path.join(folder, 'database.enc'));
  const payloadFile = path.join(folder, 'index.plain.tmp');
  try {
    await json(payloadFile, {
      format: 'SAKURA_SPLIT_INDEX_V1',
      id,
      keyId,
      manifest: m,
      database,
      media,
    });
    await encrypt(payloadFile, path.join(folder, 'index.enc'), key);
  } finally {
    await fs.unlink(payloadFile).catch(() => {});
  }
  const completion = {
    format: 'SAKURA_SPLIT_V1',
    id,
    keyId,
    index: await fileHash(path.join(folder, 'index.enc')),
  };
  await json(path.join(folder, 'READY.json'), completion);
  const summary = {
    preparedAt: new Date().toISOString(),
    id,
    databaseBytes: dump.bytes,
    encryptedDatabaseBytes: database.bytes,
    mediaFiles: media.length,
    mediaBytes: media.reduce((n, f) => n + f.bytes, 0),
    reusedMedia: reused,
    uploaded: false,
    automaticBackup: false,
  };
  await json(path.join(folder, 'summary.json'), summary);
  return { ...summary, folder };
}
async function readIndex(c, folder, marker = 'READY.json') {
  const completion = await readJson(path.join(folder, marker));
  const key = await readKey(c.keyFile);
  if (
    completion.format !== 'SAKURA_SPLIT_V1' ||
    !ID.test(completion.id) ||
    completion.keyId !== sha(key)
  )
    throw Error('Sai khóa phục hồi hoặc định dạng bản sao.');
  await assertHash(path.join(folder, 'index.enc'), completion.index);
  const tmp = path.join(folder, randomUUID() + '.index');
  let index;
  try {
    await decrypt(path.join(folder, 'index.enc'), tmp, key);
    index = await readJson(tmp);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
  if (
    index.format !== 'SAKURA_SPLIT_INDEX_V1' ||
    index.id !== completion.id ||
    index.keyId !== completion.keyId
  )
    throw Error('Danh sách không thuộc bản sao đã chọn.');
  validManifest(index.manifest);
  const media = index.manifest.files.filter((f) => f.file !== 'database.dump');
  if (!Array.isArray(index.media) || index.media.length !== media.length)
    throw Error('Thiếu danh sách ảnh.');
  for (let i = 0; i < media.length; i++) {
    const f = index.media[i];
    if (
      f.file !== media[i].file ||
      f.object !== `${index.keyId}/media/${media[i].sha256}.enc` ||
      !HASH.test(f.sha256) ||
      f.bytes !== media[i].bytes + 36
    )
      throw Error('Liên kết ảnh không hợp lệ.');
  }
  const dump = index.manifest.files.find((f) => f.file === 'database.dump');
  if (!HASH.test(index.database.sha256) || index.database.bytes !== dump.bytes + 36)
    throw Error('Dữ liệu sao lưu không hợp lệ.');
  return { index, key, completion };
}
function remoteRoot(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]+:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value)
  )
    throw Error('Cần remote và thư mục/bucket dành riêng cho Sakura.');
  return value;
}
function rcloneTransport(c) {
  const roots = { drive: remoteRoot(c.driveRemote), r2: remoteRoot(c.r2Remote) };
  if (roots.drive === roots.r2) throw Error('Hai kho phải tách riêng.');
  async function command(args) {
    try {
      return await run(
        c.rcloneBin || 'rclone',
        [
          ...args,
          '--config',
          c.rcloneConfig,
          '--retries',
          '3',
          '--low-level-retries',
          '3',
          '--contimeout',
          '15s',
          '--timeout',
          '2m',
          '--log-level',
          'ERROR',
        ],
        { windowsHide: true, timeout: 600000, maxBuffer: 1024 * 1024 },
      );
    } catch (e) {
      // rclone stderr may contain account/file details; do not expose it to logs or UI.
      throw Error(
        'Kết nối kho sao lưu thất bại; kiểm tra rclone và quyền truy cập (mã ' +
          (e.code || 'unknown') +
          ').',
      );
    }
  }
  function dest(store, name) {
    if (
      !roots[store] ||
      !/^[A-Za-z0-9_./-]+$/.test(name) ||
      name.split('/').some((p) => !p || p === '.' || p === '..')
    )
      throw Error('Đường dẫn kho không hợp lệ.');
    return roots[store] + '/' + name;
  }
  return {
    async put(store, name, file) {
      await command(['copyto', file, dest(store, name), '--immutable', '--checksum']);
    },
    async get(store, name, file) {
      await command(['copyto', dest(store, name), file, '--immutable', '--checksum']);
    },
  };
}
async function publish(c, folder, transport) {
  if (!c.enabled || !c.recoveryKeySecured)
    throw Error('Chưa bật kết nối hoặc chưa xác nhận giữ khóa phục hồi riêng.');
  const { index, completion } = await readIndex(c, folder);
  const verifyRoot = path.join(folder, 'remote-check-' + randomUUID());
  await fs.mkdir(verifyRoot, { mode: 0o700 });
  async function checkedPut(store, name, source, expected) {
    await assertHash(source, expected);
    await transport.put(store, name, source);
    const check = path.join(verifyRoot, randomUUID());
    try {
      await transport.get(store, name, check);
      await assertHash(check, expected);
    } finally {
      await fs.unlink(check).catch(() => {});
    }
  }
  try {
    for (const f of index.media) {
      const source = within(path.join(c.workRoot, 'objects'), f.object);
      await checkedPut('r2', f.object, source, f);
      await checkedPut('drive', 'media-backup/' + f.object, source, f);
    }
    const prefix = 'snapshots/' + index.id + '/';
    await checkedPut(
      'drive',
      prefix + 'database.enc',
      path.join(folder, 'database.enc'),
      index.database,
    );
    await checkedPut(
      'drive',
      prefix + 'index.enc',
      path.join(folder, 'index.enc'),
      completion.index,
    );
    // Commit only after both stores have been downloaded and checked. No sync/delete operations.
    await checkedPut(
      'drive',
      prefix + 'COMPLETE.json',
      path.join(folder, 'READY.json'),
      await fileHash(path.join(folder, 'READY.json')),
    );
    const result = {
      id: index.id,
      uploadedAt: new Date().toISOString(),
      downloadedAndVerified: true,
      mediaFiles: index.media.length,
      driveMediaFallback: true,
    };
    await json(path.join(folder, 'uploaded-' + Date.now() + '.json'), result);
    return result;
  } finally {
    await fs.rmdir(verifyRoot).catch(() => {});
  }
}
async function restore(c, id, transport) {
  if (!ID.test(id)) throw Error('Mã bản sao không hợp lệ.');
  const folder = path.join(c.workRoot, 'recovered', id + '-' + randomUUID().slice(0, 8));
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const prefix = 'snapshots/' + id + '/';
  await transport.get('drive', prefix + 'COMPLETE.json', path.join(folder, 'REMOTE-COMPLETE.json'));
  await transport.get('drive', prefix + 'index.enc', path.join(folder, 'index.enc'));
  const { index, key } = await readIndex(c, folder, 'REMOTE-COMPLETE.json');
  if (index.id !== id) throw Error('Mã bản sao tải về không khớp.');
  const encryptedDb = path.join(folder, 'database.enc');
  await transport.get('drive', prefix + 'database.enc', encryptedDb);
  await assertHash(encryptedDb, index.database);
  await decrypt(
    encryptedDb,
    path.join(folder, 'database.dump'),
    key,
    index.manifest.files.find((f) => f.file === 'database.dump'),
  );
  let fallbackImages = 0;
  for (const f of index.media) {
    const encrypted = path.join(folder, randomUUID() + '.enc');
    try {
      try {
        await transport.get('r2', f.object, encrypted);
        await assertHash(encrypted, f);
      } catch {
        await fs.unlink(encrypted).catch(() => {});
        await transport.get('drive', 'media-backup/' + f.object, encrypted);
        await assertHash(encrypted, f);
        fallbackImages++;
      }
      await decrypt(
        encrypted,
        within(folder, f.file),
        key,
        index.manifest.files.find((p) => p.file === f.file),
      );
    } finally {
      await fs.unlink(encrypted).catch(() => {});
    }
  }
  await json(path.join(folder, 'manifest.json'), index.manifest);
  await json(path.join(folder, 'COMPLETE.json'), {
    manifestSha256: (await fileHash(path.join(folder, 'manifest.json'))).sha256,
  });
  await verifyBundle(folder);
  return { folder, id, filesVerified: true, fallbackImages };
}
async function localTransport(c, prepared) {
  const { index } = await readIndex(c, prepared);
  const prefix = 'snapshots/' + index.id + '/';
  return {
    async get(store, name, dest) {
      let source;
      if (store === 'drive' && name.startsWith(prefix)) {
        const leaf = name.slice(prefix.length);
        if (!['COMPLETE.json', 'database.enc', 'index.enc'].includes(leaf))
          throw Error('Thành phần không hợp lệ.');
        source = path.join(prepared, leaf === 'COMPLETE.json' ? 'READY.json' : leaf);
      } else {
        const object = store === 'drive' ? name.replace(/^media-backup\//, '') : name;
        if (!index.media.some((f) => f.object === object)) throw Error('Ảnh không thuộc bản sao.');
        source = within(path.join(c.workRoot, 'objects'), object);
      }
      await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
      await fs.copyFile(source, dest, require('node:fs').constants.COPYFILE_EXCL);
    },
  };
}
module.exports = {
  init,
  settings,
  prepare,
  readIndex,
  publish,
  restore,
  localTransport,
  rcloneTransport,
  remoteRoot,
  validManifest,
};
if (require.main === module)
  (async () => {
    const command = process.argv[2];
    if (command === 'init') return console.log(JSON.stringify(await init(), null, 2));
    const c = await settings();
    if (command === 'prepare') {
      const b = backupConfig();
      const source = process.argv[3] ? path.resolve(process.argv[3]) : await latest(b.backupRoot);
      console.log(JSON.stringify(await prepare(c, source), null, 2));
    } else if (command === 'upload') {
      if (!process.argv[3]) throw Error('Cần chỉ định thư mục bản đã chuẩn bị.');
      console.log(
        JSON.stringify(
          await publish(c, path.resolve(process.argv[3]), rcloneTransport(c)),
          null,
          2,
        ),
      );
    } else if (command === 'run') {
      if (!c.enabled || !c.recoveryKeySecured)
        throw Error('Chưa bật kết nối hoặc chưa giữ khóa phục hồi riêng.');
      const transport = rcloneTransport(c);
      const b = await createBackup(backupConfig());
      const p = await prepare(c, b.folder);
      console.log(JSON.stringify(await publish(c, p.folder, transport), null, 2));
    } else if (command === 'local-drill') {
      if (!process.argv[3]) throw Error('Cần chỉ định thư mục bản đã chuẩn bị.');
      const prepared = path.resolve(process.argv[3]);
      const { index } = await readIndex(c, prepared);
      const r = await restore(c, index.id, await localTransport(c, prepared));
      console.log(
        JSON.stringify(
          { ...r, mode: 'LOCAL_SIMULATION', database: await drill(backupConfig(), r.folder) },
          null,
          2,
        ),
      );
    } else if (command === 'restore-drill') {
      if (!c.enabled) throw Error('Chưa bật kết nối ngoài máy.');
      const r = await restore(c, process.argv[3] || '', rcloneTransport(c));
      console.log(
        JSON.stringify({ ...r, database: await drill(backupConfig(), r.folder) }, null, 2),
      );
    } else throw Error('Chọn init, prepare, upload, run, local-drill hoặc restore-drill.');
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
