import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
for (const name of ['window', 'document', 'navigator', 'FormData']) {
  Object.defineProperty(globalThis, name, {
    value: name === 'window' ? dom.window : dom.window[name],
    configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const { createRoot } = await import('react-dom/client');
const bundle = await build({
  stdin: {
    contents: `export { CustomerForm } from './src/sales/Customers'; export { ForecastEditor } from './src/sales/MyPipeline';`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
  loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
  plugins: [
    {
      name: 'http-fixture',
      setup(builder) {
        builder.onLoad({ filter: /[\\/]api\.ts$/ }, () => ({
          loader: 'ts',
          contents: `
      export const api = (...args) => globalThis.catalogHttp(...args);
      export class ApiError extends Error {}
      export const setToken = () => {}; export const refreshSession = async () => null;
    `,
        }));
        builder.onLoad({ filter: /(?:Customers|MyPipeline)\.tsx$/ }, async (args) => ({
          loader: 'tsx',
          contents: (await readFile(args.path, 'utf8'))
            .replace('function CustomerForm(', 'export function CustomerForm(')
            .replace('function ForecastEditor(', 'export function ForecastEditor('),
        }));
      },
    },
  ],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports,
);
const actor = { id: 'tester', grants: [{ permission: 'catalog.products.read', scope: 'GLOBAL' }] };
const products = Array.from({ length: 26 }, (_, i) => ({
  id: String(i + 1),
  name: i === 25 ? 'Lụa & hồng' : 'Sản phẩm ' + (i + 1),
  isActive: i !== 1,
  variants: [{ sku: 'SKU_' + (i + 1), unit: 'cuộn', isActive: true }],
}));
const customer = {
  id: 'customer-test',
  name: 'Khách kiểm thử',
  phone: '0900000000',
  address: 'Địa chỉ mẫu',
  status: 'CONSULTING',
  version: 7,
  expectedRevenue: '1000000',
  closingProbability: 50,
  expectedProducts: ['Loại cũ'],
  expectedItems: [{ name: 'Loại cũ', unit: 'cuộn', quantity: 2 }],
};
const click = async (element) => {
  assert.ok(element, 'button exists');
  await act(async () => element.click());
};
const button = (container, label) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const selectProduct = (container, name) =>
  [...container.querySelectorAll('.catalog-product-results button')].find(
    (b) => b.querySelector('span').textContent === name,
  );
async function search(container, text) {
  const input = container.querySelector('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
      input,
      text,
    );
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 280)));
}
for (const [name, Form] of Object.entries(compiled.exports)) {
  test(name + ': search all catalog pages, retain selection, and save catalog names', async () => {
    const requests = [],
      writes = [];
    let releaseSlow;
    globalThis.catalogHttp = async (path, method = 'GET', body) => {
      if (method !== 'GET') {
        writes.push(body);
        return { id: customer.id };
      }
      if (path === '/sales/regions') return [];
      const url = new URL(path, 'http://localhost');
      requests.push(url);
      const q = url.searchParams.get('search') || '';
      if (q === 'lỗi') throw Error('Không tải được danh mục');
      if (q === 'Chậm')
        return new Promise((resolve) => {
          releaseSlow = resolve;
        });
      const matches = products.filter((p) =>
        (p.name + ' ' + p.variants[0].sku).toLowerCase().includes(q.toLowerCase()),
      );
      const page = Number(url.searchParams.get('page') || 1);
      return {
        items: matches.slice((page - 1) * 20, page * 20),
        total: matches.length,
        page,
        pageSize: 20,
      };
    };
    const container = document.getElementById('root');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(React.createElement(Form, { customer, actor, close() {}, done() {} })),
      );
      assert.equal(selectProduct(container, 'Sản phẩm 2').disabled, true);
      assert.equal(selectProduct(container, 'Sản phẩm 21'), undefined);
      await click(button(container, 'Sau'));
      assert.ok(selectProduct(container, 'Sản phẩm 21'));
      assert.equal(writes.length, 0, 'pagination must not submit the parent form');
      await search(container, 'SKU_21');
      assert.equal(requests.at(-1).searchParams.get('page'), '1');
      await click(selectProduct(container, 'Sản phẩm 21'));
      await search(container, 'Lụa & hồng');
      assert.equal(requests.at(-1).searchParams.get('search'), 'Lụa & hồng');
      await act(async () =>
        container
          .querySelector('input[type="search"]')
          .dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key: 'Enter',
              bubbles: true,
              cancelable: true,
            }),
          ),
      );
      assert.equal(writes.length, 0, 'Enter in search must not save customer');
      await click(selectProduct(container, 'Lụa & hồng'));
      await search(container, 'SKU_21');
      assert.equal(
        selectProduct(container, 'Sản phẩm 21').disabled,
        true,
        'selection survives a different search',
      );
      await search(container, 'Không tìm thấy');
      assert.match(container.textContent, /Chưa có dữ liệu phù hợp/);
      await search(container, 'lỗi');
      assert.match(container.textContent, /Không tải được danh mục/);
      await search(container, 'Chậm');
      await search(container, 'SKU_26');
      await act(async () => releaseSlow({ items: [products[0]], total: 1, page: 1, pageSize: 20 }));
      assert.ok(selectProduct(container, 'Lụa & hồng'));
      assert.equal(
        selectProduct(container, 'Sản phẩm 1'),
        undefined,
        'late HTTP response must not replace current results',
      );
      await act(async () =>
        container
          .querySelector('form')
          .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
      );
      assert.equal(writes.length, 1);
      const saved =
        name === 'CustomerForm'
          ? writes[0].expectedProducts
          : writes[0].expectedItems.map((i) => i.name);
      assert.deepEqual(saved, ['Loại cũ', 'Sản phẩm 21', 'Lụa & hồng']);
      if (name === 'ForecastEditor')
        assert.deepEqual(writes[0].expectedItems[1], {
          name: 'Sản phẩm 21',
          quantity: 1,
          unit: 'cuộn',
        });
    } finally {
      await act(async () => root.unmount());
    }
  });
}
