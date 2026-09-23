import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return 'scrypt:' + salt + ':' + derived.toString('hex');
}
export async function verifyPassword(password: string, hash: string) {
  const [algorithm, salt, stored] = hash.split(':');
  if (algorithm !== 'scrypt' || !salt || !stored || stored.length !== 128) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(stored, 'hex'));
}
