import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
function root() {
  return process.env.MEDIA_ROOT
    ? resolve(process.env.MEDIA_ROOT)
    : resolve(__dirname, '../../../../.local/media');
}
function file(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Mã tệp ảnh không hợp lệ.');
  return join(root(), key.slice(0, 2), key);
}
export function imageMime(b: Buffer) {
  if (!b.length || b.length > MAX_MEDIA_BYTES) throw new Error('Ảnh vượt giới hạn 20 MB.');
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  throw new Error('Tệp không có định dạng ảnh PNG/JPEG/WebP.');
}
export async function storeMedia(b: Buffer) {
  const mime = imageMime(b);
  return storeMediaBytes(b, mime);
}
// Callers validate accepted file types before storing; shared content-addressed backup root.
export async function storeMediaBytes(b: Buffer, mime: string) {
  if (!b.length || b.length > MAX_MEDIA_BYTES) throw new Error('Tệp vượt giới hạn lưu trữ.');
  const storageKey = createHash('sha256').update(b).digest('hex');
  const destination = file(storageKey);
  await mkdir(join(root(), storageKey.slice(0, 2)), { recursive: true });
  try {
    const existing = await readFile(destination);
    if (!existing.equals(b)) throw new Error('Tệp ảnh lưu trữ không khớp mã kiểm tra.');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const temporary = destination + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, b, { flag: 'wx' });
    try {
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  return { storageKey, byteSize: b.length, mime };
}
export async function mediaPayload<T extends { data: string; storageKey?: string | null }>(
  record: T,
) {
  if (!record.storageKey) return record;
  const b = await readFile(file(record.storageKey));
  if (createHash('sha256').update(b).digest('hex') !== record.storageKey)
    throw new Error('Tệp ảnh lưu trữ bị thay đổi.');
  return { ...record, data: b.toString('base64') };
}
