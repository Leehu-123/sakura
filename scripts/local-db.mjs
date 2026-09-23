import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const run = promisify(execFile);
const platform = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
if (!platform) throw new Error('Hãy dùng Docker để chạy PostgreSQL trên hệ điều hành này.');
const { initdb, pg_ctl, postgres } = await import(
  '@embedded-postgres/' + platform + '-' + process.arch
);
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Chỉ cho phép PostgreSQL phát triển trên máy này.');
const dir = resolve('.local/postgres');
mkdirSync(resolve('.local'), { recursive: true });
const pwfile = resolve('.local/postgres-init-password');
let started = false;
let timer;
let server;
async function stop() {
  if (!started) return;
  started = false;
  clearInterval(timer);
  await run(pg_ctl, ['-D', dir, '-m', 'fast', '-w', 'stop'], { windowsHide: true, timeout: 30000 });
}
try {
  if (!existsSync(resolve(dir, 'PG_VERSION'))) {
    writeFileSync(pwfile, decodeURIComponent(url.password) + '\n', { mode: 0o600, flag: 'wx' });
    try {
      await run(
        initdb,
        [
          '-D',
          dir,
          '--username=' + decodeURIComponent(url.username),
          '--pwfile=' + pwfile,
          '--auth=scram-sha-256',
          '--encoding=UTF8',
          '--locale=C',
        ],
        { windowsHide: true, timeout: 60000 },
      );
    } finally {
      unlinkSync(pwfile);
    }
  }
  server = spawn(postgres, ['-D', dir, '-h', '127.0.0.1', '-p', String(Number(url.port || 5432))], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((ready, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('PostgreSQL chưa sẵn sàng sau 30 giây.')),
      30000,
    );
    let output = '';
    server.stderr.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('database system is ready to accept connections')) {
        clearTimeout(timeout);
        ready();
      }
    });
    server.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('PostgreSQL dừng, mã ' + code + ': ' + output.slice(-1000)));
    });
  });
  started = true;
  const client = new Client({
    host: '127.0.0.1',
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: 'postgres',
  });
  await client.connect();
  const name = url.pathname.slice(1);
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Tên cơ sở dữ liệu không hợp lệ.');
  const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!found.rowCount) await client.query('CREATE DATABASE "' + name + '"');
  await client.end();
  console.log('PostgreSQL cục bộ đã sẵn sàng. Dữ liệu được lưu trong .local/postgres.');
  timer = setInterval(() => {}, 30000);
  process.on('SIGINT', () => stop().then(() => process.exit(0)));
  process.on('SIGTERM', () => stop().then(() => process.exit(0)));
} catch (error) {
  console.error('Không khởi động được PostgreSQL cục bộ:', error.message);
  await stop().catch(() => {});
  process.exitCode = 1;
}
