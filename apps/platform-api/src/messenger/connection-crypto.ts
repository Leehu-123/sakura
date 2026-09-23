import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
export function connectionKey() {
  const value = process.env.MESSENGER_CONFIG_KEY || '';
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new ServiceUnavailableException('Máy chủ chưa có khóa bảo vệ cấu hình Fanpage.');
  return Buffer.from(value, 'hex');
}
export function seal(value: string, context: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', connectionKey(), nonce);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([
    nonce,
    cipher.update(value, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
}
export function unseal(value: string, context: string) {
  try {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length < 28) throw Error();
    const cipher = createDecipheriv('aes-256-gcm', connectionKey(), bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8');
  } catch {
    throw new ServiceUnavailableException(
      'Không đọc được khóa Fanpage. Kiểm tra khóa bảo vệ cấu hình trên máy chủ.',
    );
  }
}
