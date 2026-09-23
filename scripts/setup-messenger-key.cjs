const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { parseEnv } = require('node:util');
const file = '.env',
  content = fs.readFileSync(file, 'utf8'),
  env = parseEnv(content);
if (env.MESSENGER_CONFIG_KEY) {
  if (!/^[a-f0-9]{64}$/.test(env.MESSENGER_CONFIG_KEY))
    throw Error('Khóa hiện có chưa hợp lệ; không tự ghi đè.');
  console.log('Giữ nguyên khóa bảo vệ cấu hình Fanpage hiện có.');
} else {
  const line = 'MESSENGER_CONFIG_KEY=' + randomBytes(32).toString('hex');
  const next = /^MESSENGER_CONFIG_KEY=.*$/m.test(content)
    ? content.replace(/^MESSENGER_CONFIG_KEY=.*$/m, line)
    : content + '\n' + line + '\n';
  fs.writeFileSync(file, next, { mode: 0o600 });
  console.log(
    'Đã tạo khóa bảo vệ Fanpage tại máy; không hiển thị giá trị khóa. Cần lưu khóa riêng khi chuyển máy/phục hồi.',
  );
}
