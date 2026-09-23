// Package only a clean Git commit already published to origin/main.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const REPOSITORY = 'https://github.com/Leehu-123/sakura.git';
function git(...args) {
  return execFileSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}
function check() {
  if (git('remote', 'get-url', 'origin') !== REPOSITORY) throw Error('origin không đúng kho Sakura.');
  if (git('branch', '--show-current') !== 'main') throw Error('Chuyển về main trước khi phát hành.');
  if (git('status', '--porcelain')) throw Error('PC còn thay đổi chưa commit hoặc tệp chưa được quản lý.');
  const commit = git('rev-parse', 'HEAD');
  const remote = git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0];
  if (commit !== remote) throw Error('PC và GitHub main chưa cùng commit. Fetch/reconcile/push trước.');
  return commit;
}
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function inventory(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    const file = [relative, entry.name].filter(Boolean).join('/');
    if (entry.isSymbolicLink()) throw Error('Không đóng gói symlink: ' + file);
    if (entry.isDirectory()) return inventory(root, file);
    if (!entry.isFile()) throw Error('Tệp không được hỗ trợ: ' + file);
    return [{ file, sha256: digest(path.join(root, file)) }];
  });
}
function verify(root, expected) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE-REVISION.json'), 'utf8'));
  if (manifest.repository !== REPOSITORY || !/^[a-f0-9]{40}$/.test(manifest.commit) || manifest.format !== 1) throw Error('Manifest không hợp lệ.');
  if (expected && manifest.commit !== expected) throw Error('VPS chưa đúng commit yêu cầu.');
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw Error('Manifest không có tệp.');
  for (const entry of manifest.files) {
    if (typeof entry.file !== 'string' || entry.file.includes('\\') || entry.file.split('/').some(p=>!p || p==='.' || p==='..') || path.isAbsolute(entry.file)) throw Error('Đường dẫn manifest không an toàn.');
    const target = path.resolve(root, entry.file);
    const actual = fs.realpathSync(target);
    const base = fs.realpathSync(root) + path.sep;
    if (!actual.startsWith(base) || digest(target) !== entry.sha256) throw Error('Tệp không khớp: ' + entry.file);
  }
  return { commit: manifest.commit, verifiedFiles: manifest.files.length, repository: manifest.repository };
}
function packageRelease() {
  const commit = check();
  // Build in the same clean checkout, then confirm no generated source changed.
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const args of [['run', 'build'], ['test']]) execFileSync(npm, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (check() !== commit) throw Error('Commit đã thay đổi trong lúc build.');
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + commit.slice(0, 12);
  const folder = path.join(ROOT, '.local/releases', id), source = path.join(folder, 'source');
  fs.mkdirSync(source, { recursive: true });
  const tar = path.join(folder, 'git-source.tar');
  git('archive', '--format=tar', '--output=' + tar, commit);
  execFileSync('tar', ['-xf', tar, '-C', source]);
  for (const relative of ['apps/platform-api/dist', 'apps/sale-web/dist', 'apps/worker/dist', 'packages/database/dist', 'packages/database/dist-seed']) fs.cpSync(path.join(ROOT, relative), path.join(source, relative), { recursive: true });
  const manifest = { format: 1, repository: REPOSITORY, commit, release: id, builtAt: new Date().toISOString(), files: inventory(source) };
  fs.writeFileSync(path.join(source, 'SOURCE-REVISION.json'), JSON.stringify(manifest, null, 2) + '\n');
  verify(source, commit);
  const archive = path.join(folder, 'source.tgz');
  execFileSync('tar', ['-czf', archive, '-C', source, '.']);
  const result = { id, commit, archive, sha256: digest(archive), files: manifest.files.length };
  fs.writeFileSync(path.join(ROOT, '.local/vps-update.json'), JSON.stringify(result, null, 2));
  return result;
}
module.exports = { verify, inventory };
if (require.main === module) try {
  const command = process.argv[2];
  const result = command === 'check' ? { commit: check(), pcMatchesGithub: true, vpsRequiresSeparateVerification: true }
    : command === 'package' ? packageRelease()
    : command === 'verify' ? verify(path.resolve(process.argv[3] || ROOT), process.argv[4])
    : (()=>{ throw Error('Chọn check, package hoặc verify <release> [commit].'); })();
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
