const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { parseEnv } = require('node:util');
const { fileHash } = require('./backup.cjs');
const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = ['apps', 'packages', 'scripts', 'infra', 'docs'];
const SOURCE_FILES = [
  'package.json',
  'package-lock.json',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  '.env.example',
  'compose.yaml',
  'compose.dev.yaml',
  'compose.production.yaml',
  'README.md',
  'tsconfig.base.json',
];
function allowed(parts) {
  return !parts.some(
    (p) =>
      ['node_modules', 'dist', 'dist-seed', '.git', '.local', 'coverage', '.npm-cache'].includes(
        p,
      ) ||
      (p.startsWith('.env') && p !== '.env.example') ||
      /\.(key|pem|dump|log|xlsx|csv|zip|exe)$/i.test(p) ||
      p === 'rclone.conf',
  );
}
function validateEnvironment(env) {
  const errors = [];
  const domain = env.SAKURA_DOMAIN || '';
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
    /(^|\.)(example\.(com|net|org)|localhost|invalid|test)$/.test(domain)
  )
    errors.push('Điền tên miền thật của công ty, không kèm https hoặc đường dẫn.');
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$/.test(env.SAKURA_RELEASE || '') ||
    /REPLACE/.test(env.SAKURA_RELEASE || '')
  )
    errors.push('Thiếu mã bản phát hành.');
  for (const k of ['POSTGRES_USER', 'POSTGRES_DB'])
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(env[k] || ''))
      errors.push(k + ' phải là tên chữ thường/số/gạch dưới.');
  if (
    !/^[A-Za-z0-9_-]{32,}$/.test(env.POSTGRES_PASSWORD || '') ||
    /REPLACE/.test(env.POSTGRES_PASSWORD || '')
  )
    errors.push('Mật khẩu database phải ngẫu nhiên, ít nhất 32 ký tự an toàn cho URL.');
  if ((env.JWT_SECRET || '').length < 48 || /REPLACE/.test(env.JWT_SECRET || ''))
    errors.push('Thiếu khóa JWT ngẫu nhiên ít nhất 48 ký tự.');
  if (!/^[a-f0-9]{64}$/.test(env.MESSENGER_CONFIG_KEY || ''))
    errors.push(
      'Thiếu khóa bảo vệ cấu hình Fanpage gồm 64 ký tự hex. Khi phục hồi phải giữ khóa gốc.',
    );
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SEED_ADMIN_EMAIL || '') ||
    /REPLACE/.test(env.SEED_ADMIN_EMAIL || '')
  )
    errors.push('Điền email quản trị cho trường hợp cài mới trống.');
  if ((env.SEED_ADMIN_PASSWORD || '').length < 16 || /REPLACE/.test(env.SEED_ADMIN_PASSWORD || ''))
    errors.push('Mật khẩu quản trị cài mới phải có ít nhất 16 ký tự.');
  if (
    !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(env.SAKURA_BACKUP_DIR || '') ||
    (env.SAKURA_BACKUP_DIR || '').split('/').filter(Boolean).length < 2
  )
    errors.push('Kho backup cần đường dẫn Linux tuyệt đối dành riêng cho Sakura.');
  // Variables are interpolated into Compose; dollar signs would change their meaning.
  if (Object.values(env).some((v) => /[$\r\n]/.test(v)))
    errors.push('Cấu hình không được chứa ký tự nội suy hoặc xuống dòng trong giá trị.');
  return {
    ready: errors.length === 0,
    errors,
    checks: ['domain', 'release', 'database', 'secrets', 'backup-directory'],
  };
}
async function prepareRelease(root = ROOT, outputRoot = path.join(ROOT, '.local/releases')) {
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const release = path.join(outputRoot, id),
    source = path.join(release, 'source');
  await fs.mkdir(source, { recursive: true, mode: 0o700 });
  const files = [];
  async function copy(relative) {
    if (!allowed(relative.split('/'))) return;
    const from = path.join(root, relative),
      to = path.join(source, relative);
    const stat = await fs.lstat(from);
    if (stat.isSymbolicLink()) throw Error('Không đóng gói liên kết tệp: ' + relative);
    if (stat.isDirectory()) {
      for (const entry of (await fs.readdir(from)).sort()) await copy(relative + '/' + entry);
    } else if (stat.isFile()) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to, require('node:fs').constants.COPYFILE_EXCL);
      files.push({ file: relative, ...(await fileHash(to)) });
    } else throw Error('Loại tệp không hỗ trợ.');
  }
  for (const f of [...SOURCE_FILES, ...SOURCE_DIRS]) {
    if (await fs.stat(path.join(root, f)).catch(() => false)) await copy(f);
  }
  for (const required of [
    'package-lock.json',
    'Dockerfile',
    'compose.production.yaml',
    'infra/Caddyfile',
  ])
    if (!files.some((f) => f.file === required))
      throw Error('Thiếu thành phần triển khai: ' + required);
  const env = (await fs.readFile(path.join(root, 'infra/production.env.example'), 'utf8'))
    .replace('REPLACE_RELEASE', id)
    .replace('REPLACE_DB_PASSWORD', randomBytes(32).toString('hex'))
    .replace('REPLACE_JWT_SECRET', randomBytes(48).toString('hex'))
    .replace('REPLACE_MESSENGER_CONFIG_KEY', randomBytes(32).toString('hex'))
    .replace('REPLACE_ADMIN_PASSWORD', randomBytes(24).toString('base64url'));
  // This private file lives OUTSIDE the source/build context and is never part of its manifest.
  await fs.writeFile(path.join(release, '.env.production'), env, { flag: 'wx', mode: 0o600 });
  const manifest = { format: 'SAKURA_RELEASE_V1', id, createdAt: new Date().toISOString(), files };
  await fs.writeFile(path.join(release, 'manifest.json'), JSON.stringify(manifest, null, 2), {
    flag: 'wx',
  });
  const report = {
    id,
    folder: release,
    sourceFiles: files.length,
    sourceBytes: files.reduce((n, f) => n + f.bytes, 0),
    environment: validateEnvironment(parseEnv(env)),
    deployed: false,
    containsCompanyDatabase: false,
    containsRecoveryKey: false,
  };
  await fs.writeFile(path.join(release, 'report.json'), JSON.stringify(report, null, 2), {
    flag: 'wx',
  });
  return report;
}
module.exports = { allowed, validateEnvironment, prepareRelease };
if (require.main === module)
  (async () => {
    if (process.argv[2] === 'prepare') console.log(JSON.stringify(await prepareRelease(), null, 2));
    else if (process.argv[2] === 'check') {
      if (!process.argv[3]) throw Error('Cần chỉ định tệp cấu hình triển khai.');
      const result = validateEnvironment(
        parseEnv(await fs.readFile(path.resolve(process.argv[3]), 'utf8')),
      );
      console.log(JSON.stringify(result, null, 2));
      if (!result.ready) process.exitCode = 2;
    } else throw Error('Chọn prepare hoặc check.');
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
