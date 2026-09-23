const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} = require('node:crypto');
const MAGIC = Buffer.from('SKRBK001');
const sha = (data) => createHash('sha256').update(data).digest('hex');
async function readKey(file) {
  if (!(await fs.lstat(file)).isFile()) throw Error('Khóa phải là tệp thông thường.');
  const key = await fs.readFile(file);
  if (key.length !== 32) throw Error('Khóa phục hồi phải có đúng 32 byte.');
  return key;
}
// AES-256-GCM: authenticated header (magic + random 96-bit nonce), ciphertext, 128-bit tag.
// Plaintext is only published after GCM authentication and the expected SHA-256 both pass.
async function encrypt(source, target, key) {
  const tmp = target + '.' + randomUUID() + '.tmp';
  const header = Buffer.concat([MAGIC, randomBytes(12)]);
  const cipher = createCipheriv('aes-256-gcm', key, header.subarray(8));
  cipher.setAAD(header);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(tmp, header, { flag: 'wx', mode: 0o600 });
    await pipeline(createReadStream(source), cipher, createWriteStream(tmp, { flags: 'a' }));
    await fs.appendFile(tmp, cipher.getAuthTag());
    await fs.copyFile(tmp, target, require('node:fs').constants.COPYFILE_EXCL);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}
async function decrypt(source, target, key, expected) {
  const tmp = target + '.' + randomUUID() + '.tmp';
  const handle = await fs.open(source, 'r');
  let header = Buffer.alloc(20),
    tag = Buffer.alloc(16),
    size;
  try {
    size = (await handle.stat()).size;
    if (size < 36) throw Error('Bản mã hóa bị cắt ngắn.');
    await handle.read(header, 0, 20, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, 8).equals(MAGIC)) throw Error('Định dạng mã hóa không hỗ trợ.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    if (size === 36) {
      decipher.final();
      await fs.writeFile(tmp, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
    } else {
      await pipeline(
        createReadStream(source, { start: 20, end: size - 17 }),
        decipher,
        createWriteStream(tmp, { flags: 'wx', mode: 0o600 }),
      );
    }
    if (expected) {
      const actual = await require('./backup.cjs').fileHash(tmp);
      if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
        throw Error('Nội dung giải mã không khớp bản sao.');
    }
    await fs.copyFile(tmp, target, require('node:fs').constants.COPYFILE_EXCL);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}
module.exports = { readKey, encrypt, decrypt, sha };
