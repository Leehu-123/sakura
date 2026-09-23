const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verify, inventory } = require('./source-sync.cjs');
test('release manifest detects altered files and a different commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sakura-sync-'));
  try {
    fs.writeFileSync(path.join(root, 'app.js'), 'checked source');
    const manifest = { format: 1, repository: 'https://github.com/Leehu-123/sakura.git', commit: 'a'.repeat(40), files: inventory(root) };
    fs.writeFileSync(path.join(root, 'SOURCE-REVISION.json'), JSON.stringify(manifest));
    assert.equal(verify(root, 'a'.repeat(40)).verifiedFiles, 1);
    assert.throws(() => verify(root, 'b'.repeat(40)), /commit/);
    fs.writeFileSync(path.join(root, 'app.js'), 'changed after packaging');
    assert.throws(() => verify(root), /không khớp/);
    manifest.files[0].file = '../outside';
    fs.writeFileSync(path.join(root, 'SOURCE-REVISION.json'), JSON.stringify(manifest));
    assert.throws(() => verify(root), /không an toàn/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
