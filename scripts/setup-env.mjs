import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('Đã có .env; giữ nguyên cấu hình hiện tại.');
} else {
  const dbPassword = randomBytes(24).toString('hex');
  const content = readFileSync('.env.example', 'utf8')
    .replaceAll('CHANGE_ME', dbPassword)
    .replace('REPLACE_WITH_AT_LEAST_48_RANDOM_CHARACTERS', randomBytes(48).toString('hex'))
    .replace('REPLACE_WITH_STRONG_RANDOM_PASSWORD', randomBytes(24).toString('base64url'));
  writeFileSync('.env', content, { mode: 0o600, flag: 'wx' });
  console.log(
    'Đã tạo .env với khóa ngẫu nhiên. Mật khẩu quản trị nằm trong SEED_ADMIN_PASSWORD; không chia sẻ file này.',
  );
}
