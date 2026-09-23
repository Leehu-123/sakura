const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Client } = require('pg');
const run = promisify(execFile);
const ROOT = path.resolve(__dirname, '../..');
const digest = (b) => createHash('sha256').update(b).digest('hex');
const ident = (n) => '"' + n.replaceAll('"', '""') + '"';
function config(overrides = {}) {
  const url = new URL(overrides.url || process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw Error('Công cụ sao lưu hiện chỉ hỗ trợ PostgreSQL cục bộ.');
  if ((url.searchParams.get('schema') || 'public') !== 'public')
    throw Error('Backup chỉ hỗ trợ schema public của Sakura.');
  return {
    connection: {
      host: url.hostname,
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      connectionTimeoutMillis: 10000,
    },
    backupRoot: path.resolve(process.env.BACKUP_ROOT || path.join(ROOT, '.local/backups')),
    mediaRoot: path.resolve(process.env.MEDIA_ROOT || path.join(ROOT, '.local/media')),
    ...overrides,
  };
}
function within(root, name) {
  if (path.isAbsolute(name) || name.includes('\\')) throw Error('Đường dẫn bản sao không hợp lệ.');
  const dest = path.resolve(root, name);
  if (!dest.startsWith(path.resolve(root) + path.sep)) throw Error('Đường dẫn ra ngoài bản sao.');
  return dest;
}
async function fileHash(file) {
  if (!(await fs.lstat(file)).isFile()) throw Error('Thành phần bản sao phải là tệp thông thường.');
  const h = createHash('sha256');
  let bytes = 0;
  for await (const b of createReadStream(file)) {
    h.update(b);
    bytes += b.length;
  }
  return { sha256: h.digest('hex'), bytes };
}
async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
}
async function tool(name, args, c, database = c.connection.database) {
  let executable = name;
  const local = path.join(ROOT, '.local/pg-tools', name + '.exe');
  if (process.env.PG_BIN)
    executable = path.join(process.env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : ''));
  else if (process.platform === 'win32' && (await fs.stat(local).catch(() => false)))
    executable = local;
  const env = {
    ...process.env,
    PGHOST: c.connection.host,
    PGPORT: String(c.connection.port),
    PGUSER: c.connection.user,
    PGPASSWORD: c.connection.password,
    PGDATABASE: database,
    PGCONNECT_TIMEOUT: '10',
  };
  if (process.platform === 'win32')
    env.PATH =
      path.join(ROOT, 'node_modules/@embedded-postgres/windows-x64/native/bin') +
      path.delimiter +
      env.PATH;
  try {
    return await run(executable, args, {
      env,
      windowsHide: true,
      timeout: 600000,
      maxBuffer: 1024 * 1024,
    });
  } catch (e) {
    throw Error(
      name +
        ' không hoàn tất (mã ' +
        (e.code || 'unknown') +
        '). Kiểm tra công cụ PostgreSQL, kết nối và dung lượng.',
    );
  }
}
async function mediaInventory(client) {
  const avatars =
    (
      await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ChatConversation' AND column_name='avatarKey'`,
      )
    ).rowCount > 0;
  const attachments = (await client.query(`SELECT to_regclass('public."ChatAttachment"') AS name`))
    .rows[0].name;
  return (
    await client.query(
      'SELECT DISTINCT "storageKey", "byteSize" FROM public."ProductImage" WHERE "storageKey" IS NOT NULL' +
        (attachments ? ' UNION SELECT "storageKey", "byteSize" FROM public."ChatAttachment"' : '') +
        (avatars
          ? ' UNION SELECT "avatarKey" AS "storageKey", "avatarBytes" AS "byteSize" FROM public."ChatConversation" WHERE "avatarKey" IS NOT NULL'
          : '') +
        ' ORDER BY "storageKey"',
    )
  ).rows;
}
async function inventory(client) {
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const out = [];
  for (const { tablename: name } of tables) {
    const h = createHash('sha256');
    let rows = 0;
    await client.query(
      'DECLARE backup_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS value FROM public.' +
        ident(name) +
        ' t ORDER BY to_jsonb(t)::text COLLATE "C"',
    );
    while (true) {
      const batch = await client.query('FETCH 500 FROM backup_rows');
      if (!batch.rowCount) break;
      for (const row of batch.rows) {
        h.update(row.value + '\n');
        rows++;
      }
    }
    await client.query('CLOSE backup_rows');
    out.push({ name, rows, sha256: h.digest('hex') });
  }
  return out;
}
async function sequenceChecks(client) {
  const columns = (
    await client.query(`SELECT table_name, column_name, pg_get_serial_sequence(format('%I.%I',table_schema,table_name),column_name) AS sequence
    FROM information_schema.columns WHERE table_schema='public' AND (column_default LIKE 'nextval(%' OR is_identity='YES')`)
  ).rows;
  const results = [];
  for (const c of columns) {
    const max = (
      await client.query(
        'SELECT max(' +
          ident(c.column_name) +
          ')::text AS value FROM public.' +
          ident(c.table_name),
      )
    ).rows[0].value;
    const next = (await client.query('SELECT nextval($1::regclass)::text AS value', [c.sequence]))
      .rows[0].value;
    if (max !== null && BigInt(next) <= BigInt(max))
      throw Error('Bộ đếm mã chưa vượt mã đã phục hồi.');
    results.push({ table: c.table_name, column: c.column_name, valid: true });
  }
  return results;
}
async function createBackup(c) {
  const id =
    new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') +
    '-' +
    randomUUID().slice(0, 8);
  await fs.mkdir(c.backupRoot, { recursive: true, mode: 0o700 });
  const folder = path.join(c.backupRoot, id);
  await fs.mkdir(folder, { mode: 0o700 });
  const client = new Client(c.connection);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    if (c.onSnapshot) await c.onSnapshot();
    const server = (await client.query('SHOW server_version')).rows[0].server_version;
    const version = (await tool('pg_dump', ['--version'], c)).stdout.trim();
    const tables = await inventory(client);
    const images = await mediaInventory(client);
    const space = await fs.statfs(c.backupRoot, { bigint: true });
    const databaseSize = (
      await client.query('SELECT pg_database_size(current_database())::text AS bytes')
    ).rows[0].bytes;
    const estimated =
      images.reduce((sum, image) => sum + BigInt(image.byteSize || 0), 0n) +
      BigInt(databaseSize) * 2n +
      128n * 1024n * 1024n;
    if (space.bavail * space.bsize < estimated)
      throw Error('Không đủ chỗ trống để tạo bản sao an toàn.');
    const files = [];
    for (const image of images) {
      const key = image.storageKey;
      if (!/^[a-f0-9]{64}$/.test(key) || !Number.isInteger(image.byteSize) || image.byteSize < 1)
        throw Error('Liên kết tệp ảnh không hợp lệ.');
      const relative = 'media/' + key.slice(0, 2) + '/' + key;
      const source = within(c.mediaRoot, key.slice(0, 2) + '/' + key),
        dest = within(folder, relative);
      await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
      if (!(await fs.lstat(source)).isFile()) throw Error('Ảnh nguồn không phải tệp thông thường.');
      await fs.copyFile(source, dest);
      const hash = await fileHash(dest);
      if (hash.sha256 !== key || hash.bytes !== image.byteSize)
        throw Error('Ảnh bị thiếu hoặc sai mã kiểm tra.');
      files.push({ file: relative, ...hash });
    }
    await tool(
      'pg_dump',
      [
        '--format=custom',
        '--compress=6',
        '--schema=public',
        '--strict-names',
        '--no-owner',
        '--no-privileges',
        '--snapshot=' + snapshot,
        '--file=' + path.join(folder, 'database.dump'),
      ],
      c,
    );
    files.push({ file: 'database.dump', ...(await fileHash(path.join(folder, 'database.dump'))) });
    await client.query('COMMIT');
    const manifest = {
      format: 'SAKURA_BACKUP_V1',
      id,
      createdAt: new Date().toISOString(),
      snapshotConsistent: true,
      server,
      pgDump: version,
      tables,
      files,
      mediaFiles: images.length,
      rows: tables.reduce((s, t) => s + t.rows, 0),
      bytes: files.reduce((s, f) => s + f.bytes, 0),
    };
    await writeJson(path.join(folder, 'manifest.json'), manifest);
    await writeJson(path.join(folder, 'COMPLETE.json'), {
      manifestSha256: (await fileHash(path.join(folder, 'manifest.json'))).sha256,
    });
    return {
      id,
      folder,
      rows: manifest.rows,
      tables: tables.length,
      mediaFiles: images.length,
      bytes: manifest.bytes,
    };
  } catch (e) {
    if (connected) await client.query('ROLLBACK').catch(() => {});
    await writeJson(path.join(folder, 'FAILED.json'), {
      failedAt: new Date().toISOString(),
      message: 'Sao lưu chưa hoàn tất; không dùng để phục hồi.',
    }).catch(() => {});
    throw e;
  } finally {
    await client.end().catch(() => {});
  }
}
async function verifyBundle(folder) {
  const completion = JSON.parse(await fs.readFile(path.join(folder, 'COMPLETE.json'), 'utf8'));
  const mbytes = await fs.readFile(path.join(folder, 'manifest.json'));
  if (digest(mbytes) !== completion.manifestSha256) throw Error('Danh sách bản sao bị thay đổi.');
  const m = JSON.parse(mbytes);
  if (m.format !== 'SAKURA_BACKUP_V1' || !Array.isArray(m.files) || !Array.isArray(m.tables))
    throw Error('Định dạng bản sao không hỗ trợ.');
  if (
    m.files.filter((f) => f.file === 'database.dump').length !== 1 ||
    new Set(m.files.map((f) => f.file)).size !== m.files.length
  )
    throw Error('Thành phần bản sao thiếu hoặc trùng.');
  for (const f of m.files) {
    if (f.file !== 'database.dump' && !/^media\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(f.file))
      throw Error('Đường dẫn thành phần không hợp lệ.');
    const target = within(folder, f.file);
    const real = await fs.realpath(target),
      base = await fs.realpath(folder);
    if (!real.startsWith(base + path.sep)) throw Error('Liên kết tệp ra ngoài bản sao.');
    const h = await fileHash(target);
    if (h.sha256 !== f.sha256 || h.bytes !== f.bytes)
      throw Error('Bản sao bị thiếu hoặc hỏng: ' + f.file);
  }
  return m;
}
async function drill(c, folder) {
  if (!['127.0.0.1', 'localhost'].includes(c.connection.host))
    throw Error('Thử phục hồi chỉ chạy trên PostgreSQL cục bộ.');
  const m = await verifyBundle(folder);
  const target = 'sakura_restore_' + randomUUID().replaceAll('-', '');
  const media = path.join(c.backupRoot, 'restore-tests', target);
  const admin = new Client({ ...c.connection, database: 'postgres' });
  let created = false,
    restored;
  const started = Date.now();
  let report;
  try {
    await admin.connect();
    await admin.query('CREATE DATABASE ' + ident(target) + ' TEMPLATE template0');
    created = true;
    restored = new Client({ ...c.connection, database: target });
    await restored.connect();
    // Only the database created above is ever modified by this command.
    await restored.query('DROP SCHEMA public');
    await tool(
      'pg_restore',
      [
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-privileges',
        '--dbname=' + target,
        path.join(folder, 'database.dump'),
      ],
      c,
      target,
    );
    await restored.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actual = await inventory(restored);
    if (JSON.stringify(actual) !== JSON.stringify(m.tables))
      throw Error('Dữ liệu phục hồi không khớp từng bảng/bản ghi.');
    await restored.query('COMMIT');
    const counters = await sequenceChecks(restored);
    const images = await mediaInventory(restored);
    await fs.mkdir(media, { recursive: true, mode: 0o700 });
    for (const image of images) {
      if (!/^[a-f0-9]{64}$/.test(image.storageKey)) throw Error('Mã ảnh phục hồi không hợp lệ.');
      const rel = image.storageKey.slice(0, 2) + '/' + image.storageKey,
        dest = within(media, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(within(folder, 'media/' + rel), dest);
      const h = await fileHash(dest);
      if (h.sha256 !== image.storageKey || h.bytes !== image.byteSize)
        throw Error('Ảnh phục hồi không khớp.');
    }
    report = {
      backupId: m.id,
      verifiedAt: new Date().toISOString(),
      tables: actual.length,
      rows: m.rows,
      mediaFiles: images.length,
      counters,
      durationSeconds: (Date.now() - started) / 1000,
      isolatedDatabase: true,
    };
  } finally {
    if (restored) await restored.end().catch(() => {});
    if (created) {
      if (!/^sakura_restore_[a-f0-9]{32}$/.test(target) || target === c.connection.database)
        throw Error('Không được dọn database làm việc.');
      await admin.query('DROP DATABASE ' + ident(target));
    }
    await admin.end().catch(() => {});
    // Remove only individual files copied by this drill; preserve the backup bundle.
    if (await fs.stat(media).catch(() => false)) {
      for (const entry of await fs.readdir(media)) {
        if (!/^[a-f0-9]{2}$/.test(entry)) throw Error('Thư mục thử ảnh không hợp lệ.');
        const sub = within(media, entry);
        for (const key of await fs.readdir(sub)) {
          if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Tệp thử ảnh không hợp lệ.');
          await fs.unlink(within(sub, key));
        }
        await fs.rmdir(sub);
      }
      await fs.rmdir(media);
    }
  }
  await writeJson(path.join(folder, 'restore-verified-' + Date.now() + '.json'), report);
  return report;
}
async function latest(root) {
  const names = (await fs.readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^\d{4}-/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const n of names)
    if (await fs.stat(path.join(root, n, 'COMPLETE.json')).catch(() => false))
      return path.join(root, n);
  throw Error('Chưa có bản sao hoàn tất.');
}
module.exports = { config, within, fileHash, createBackup, verifyBundle, drill, inventory, latest };
if (require.main === module)
  (async () => {
    const c = config(),
      command = process.argv[2];
    if (command === 'create') console.log(JSON.stringify(await createBackup(c), null, 2));
    else if (['verify', 'drill'].includes(command)) {
      const folder = process.argv[3] ? path.resolve(process.argv[3]) : await latest(c.backupRoot);
      const r = command === 'drill' ? await drill(c, folder) : await verifyBundle(folder);
      console.log(
        JSON.stringify(
          command === 'verify'
            ? { id: r.id, verified: true, files: r.files.length, rows: r.rows }
            : r,
          null,
          2,
        ),
      );
    } else throw Error('Chọn create, verify hoặc drill.');
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
