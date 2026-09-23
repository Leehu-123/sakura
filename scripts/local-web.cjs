// Serve the compiled application locally through the same gateway used for deployment.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseEnv } = require('node:util');
const root = path.resolve(__dirname, '..');
const config = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
const origin = new URL(config.WEB_ORIGIN || 'http://localhost:5173');
if (
  origin.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(origin.hostname) ||
  origin.pathname !== '/'
)
  throw Error('Web cục bộ chỉ chấp nhận địa chỉ HTTP localhost trong WEB_ORIGIN.');
if (!fs.existsSync(path.join(root, 'apps/sale-web/dist/index.html')))
  throw Error('Cần dựng ứng dụng trước khi chạy.');
const exe =
  process.env.CADDY_BIN ||
  (process.platform === 'win32' ? path.join(root, '.local/caddy/caddy.exe') : 'caddy');
const child = spawn(
  exe,
  ['run', '--config', path.join(root, 'infra/Caddyfile'), '--adapter', 'caddyfile'],
  {
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      SAKURA_DOMAIN: origin.origin,
      SAKURA_BIND: '127.0.0.1',
      SAKURA_WEB_ROOT: path.join(root, 'apps/sale-web/dist').replaceAll('\\', '/'),
      SAKURA_API_UPSTREAM: '127.0.0.1:' + (config.PORT || '3000'),
      XDG_DATA_HOME: path.join(root, '.local/caddy/runtime/data'),
      XDG_CONFIG_HOME: path.join(root, '.local/caddy/runtime/config'),
    },
  },
);
child.on('error', () => {
  console.error('Không chạy được Caddy; kiểm tra CADDY_BIN.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code || 0;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
console.log('Web bản dựng: ' + origin.origin + ' (chỉ tại máy này).');
