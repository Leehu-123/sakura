const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const exe = process.env.CADDY_BIN || path.join(ROOT, '.local/caddy/caddy.exe');
const run = promisify(execFile);
test(
  'Actual Caddy serves built SPA, isolates API routes and discards forged forwarding headers',
  { timeout: 60000 },
  async () => {
    await fs.access(exe);
    const root = path.join(ROOT, '.local/deployment-tests/caddy-' + randomUUID());
    await fs.mkdir(root, { recursive: true });
    const backend = http.createServer(async (req, res) => {
      if (req.url.startsWith('/api/v1/health')) return res.end('healthy');
      try {
        for await (const chunk of req) {
          /* consume to exercise request body limit */
        }
      } catch {
        return res.destroy();
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'fixture=1; HttpOnly; SameSite=Strict');
      res.end(
        JSON.stringify({
          path: req.url,
          forwarded: req.headers['x-forwarded-for'],
          proto: req.headers['x-forwarded-proto'],
        }),
      );
    });
    backend.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    const origin = 'http://127.0.0.1:' + port;
    const env = {
      ...process.env,
      SAKURA_DOMAIN: origin,
      SAKURA_BIND: '127.0.0.1',
      SAKURA_WEB_ROOT: path.join(ROOT, 'apps/sale-web/dist').replaceAll('\\', '/'),
      SAKURA_API_UPSTREAM: '127.0.0.1:' + backend.address().port,
      XDG_DATA_HOME: path.join(root, 'data'),
      XDG_CONFIG_HOME: path.join(root, 'config'),
    };
    let child,
      output = '',
      exited;
    try {
      await run(
        exe,
        ['validate', '--config', path.join(ROOT, 'infra/Caddyfile'), '--adapter', 'caddyfile'],
        { env, windowsHide: true, timeout: 15000 },
      );
      const prod = await run(
        exe,
        ['adapt', '--config', path.join(ROOT, 'infra/Caddyfile'), '--adapter', 'caddyfile'],
        {
          env: { ...env, SAKURA_DOMAIN: 'sale.sakura-company.vn' },
          windowsHide: true,
          timeout: 15000,
        },
      );
      const adapted = JSON.parse(prod.stdout);
      assert.ok(
        Object.values(adapted.apps.http.servers).some((s) =>
          s.listen.some((address) => address.endsWith(':443')),
        ),
      );
      child = spawn(
        exe,
        ['run', '--config', path.join(ROOT, 'infra/Caddyfile'), '--adapter', 'caddyfile'],
        { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      exited = once(child, 'exit');
      child.stdout.on('data', (b) => {
        output += b;
      });
      child.stderr.on('data', (b) => {
        output += b;
      });
      let up = false;
      for (let i = 0; i < 60; i++) {
        try {
          up = (await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(1000) })).ok;
        } catch {}
        if (up) break;
        if (child.exitCode !== null) throw Error('Caddy stopped before health check');
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(up, 'Caddy must start');
      const page = await fetch(origin + '/orders');
      assert.equal(page.status, 200);
      assert.match(await page.text(), /id="root"/);
      assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
      assert.equal(page.headers.get('cache-control'), 'no-cache');
      for (const url of [
        '/api/docs',
        '/api/docs-json',
        '/.env',
        '/.local/test',
        '/assets/not-found.js',
      ])
        assert.equal((await fetch(origin + url)).status, 404, url);
      const proxied = await fetch(origin + '/api/echo?test=1', {
        headers: { 'X-Forwarded-For': '203.0.113.99', 'X-Forwarded-Proto': 'https' },
      });
      const echoed = await proxied.json();
      assert.equal(echoed.path, '/api/echo?test=1');
      assert.equal(echoed.forwarded, '127.0.0.1');
      assert.equal(echoed.proto, 'http');
      assert.match(proxied.headers.get('set-cookie'), /HttpOnly/);
      const large = await fetch(origin + '/api/echo', {
        method: 'POST',
        body: 'x'.repeat(1024 * 1024 + 1),
      });
      assert.equal(large.status, 413);
      const excel = await fetch(origin + '/api/v1/imports/sapo/excel/preview', {
        method: 'POST',
        body: 'x'.repeat(2 * 1024 * 1024),
      });
      assert.equal(excel.status, 200);
      assert.equal((await excel.json()).path, '/api/v1/imports/sapo/excel/preview');
      const excelTooLarge = await fetch(origin + '/api/v1/imports/sapo/excel/preview', {
        method: 'POST',
        body: 'x'.repeat(12 * 1024 * 1024),
      });
      assert.equal(excelTooLarge.status, 413);
      const assets = await fs.readdir(path.join(ROOT, 'apps/sale-web/dist/assets'));
      const logo = assets.find((f) => /^logo-.*\.jpg$/.test(f));
      assert.ok(logo);
      assert.equal((await fetch(origin + '/assets/' + logo)).status, 200);
      await fs.writeFile(
        path.join(root, 'result.json'),
        JSON.stringify(
          {
            passed: true,
            checks: [
              'SPA',
              'CSP',
              'API',
              'forwarded-IP',
              'body-limit',
              'private-paths',
              'brand',
              'https-config',
            ],
            publicTlsIssued: false,
          },
          null,
          2,
        ),
      );
    } finally {
      if (child && child.exitCode === null) {
        child.kill();
        await exited;
      }
      await new Promise((r) => backend.close(r));
      await fs.writeFile(path.join(root, 'caddy.log'), output);
    }
  },
);
