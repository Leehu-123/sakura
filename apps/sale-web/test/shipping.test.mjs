import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'FormData'])
  Object.defineProperty(globalThis, key, {
    value: key === 'window' ? dom.window : dom.window[key],
    configurable: true,
  });
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
    contents: `export {ShipmentTracking} from './src/shipping/ShipmentTracking'; export {ShippingSettings} from './src/shipping/ShippingSettings';export {SalesReport} from './src/sales/Reports';`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
  plugins: [
    {
      name: 'fixture',
      setup(b) {
        b.onLoad({ filter: /[\\/]api\.ts$/ }, () => ({
          loader: 'ts',
          contents: 'export const api=(...a)=>globalThis.shippingHttp(...a);',
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
const { ShipmentTracking, ShippingSettings, SalesReport } = compiled.exports;
const actor = {
  id: 'tester',
  grants: [{ permission: 'sales.shipments.manage', scope: 'ASSIGNED' }],
};
const order = {
  id: 'order',
  version: 3,
  status: 'CONFIRMED',
  carrierName: 'VNPost',
  trackingCode: 'TEST123VN',
  shippingStatus: 'IN_TRANSIT',
  shippingFee: '30000',
  carrierEstimatedFee: '25000',
  shippingCost: null,
  shippingCostNote: '',
  carrierStatusLabel: 'Đang giao hàng',
  shippingSyncError: '',
};
const node = document.getElementById('root');
async function mount(Component, props) {
  const root = createRoot(node);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return root;
}
async function click(label) {
  const b = [...node.querySelectorAll('button')].find((b) => b.textContent === label);
  assert.ok(b, label);
  await act(async () => b.click());
}
test('Shipment UI: unknown expense, explicit reconciliation and scoped controls', async () => {
  const calls = [];
  let changed = 0;
  globalThis.shippingHttp = async (...a) => {
    calls.push(a);
    return [];
  };
  let root = await mount(ShipmentTracking, { order, actor, changed: () => changed++ });
  assert.match(node.textContent, /Chưa đối soát/);
  assert.match(node.textContent, /Cước VNPost tạm tính/);
  await click('Ghi phí thực trả');
  node.querySelector('[name=amount]').value = '24000';
  node.querySelector('[name=note]').value = 'Bảng kê đã đối soát';
  await act(async () =>
    node
      .querySelector('form')
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.deepEqual(calls.at(-1), [
    '/sales/orders/order/shipping-cost',
    'PATCH',
    { version: 3, amount: '24000', note: 'Bảng kê đã đối soát' },
  ]);
  assert.equal(changed, 1);
  await click('Đồng bộ VNPost');
  assert.deepEqual(calls.at(-1), ['/sales/orders/order/shipping-sync', 'POST', { version: 3 }]);
  await act(async () => root.unmount());
  root = await mount(ShipmentTracking, {
    order,
    actor: { id: 'reader', grants: [] },
    changed: () => {},
  });
  assert.ok(
    ![...node.querySelectorAll('button')].some((b) => b.textContent === 'Ghi phí thực trả'),
  );
  await act(async () => root.unmount());
});
test('VNPost settings login clears password after successful connection', async () => {
  let connected = false;
  const calls = [];
  globalThis.shippingHttp = async (...a) => {
    calls.push(a);
    if (a[1] === 'POST') {
      connected = true;
      return {};
    }
    return {
      version: connected ? 1 : 0,
      connected,
      enabled: connected,
      customerCode: 'CMS1',
      updatedAt: null,
    };
  };
  const root = await mount(ShippingSettings, {});
  node.querySelector('[name=username]').value = 'fixture-user';
  node.querySelector('[name=password]').value = 'fixture-password';
  await act(async () =>
    node
      .querySelector('form')
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.equal(calls.find((a) => a[1] === 'POST')[2].customerCode, 'CMS1');
  assert.equal(node.querySelector('[name=password]').value, '');
  assert.match(node.textContent, /Đang bật/);
  await act(async () => root.unmount());
});
test('Shipping report renders separate costs, missing counts and export', async () => {
  const m = {
    orders: 3,
    validOrders: 2,
    cancelled: 1,
    draft: 0,
    unclassified: 0,
    sales: '100000',
    paid: '0',
    unpaid: '100000',
    unknownPayments: 0,
    customers: 2,
    shippingCharged: '40000',
    shippingEstimated: '27000',
    shippingActual: '29000',
    shippingDifference: '1000',
    shippingUnknown: 1,
    shippingChargedUnknown: 0,
    shippingEstimatedOrders: 1,
    shippingComparedOrders: 2,
  };
  globalThis.shippingHttp = async () => ({
    from: '2026-08-20',
    to: '2026-08-20',
    source: 'SAKURA',
    bucket: 'day',
    scope: 'ASSIGNED',
    summary: m,
    previous: m,
    timeline: [{ ...m, label: '2026-08-20' }],
    sources: [{ ...m, label: 'SAKURA' }],
    staff: [],
    statuses: [],
    carriers: [{ ...m, label: 'VNPost' }],
  });
  const root = await mount(SalesReport, { detailed: true, openReports: () => {} });
  assert.match(node.textContent, /1 đơn chưa có phí thực trả/);
  assert.match(node.textContent, /29\.000/);
  assert.match(node.textContent, /VNPost/);
  assert.ok(node.querySelectorAll('table').length >= 2);
  assert.ok([...node.querySelectorAll('button')].some((b) => b.textContent.includes('Xuất CSV')));
  await act(async () => root.unmount());
});
