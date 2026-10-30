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
    contents: `export {ResponseRateChart,MessengerSlaSettings,MessengerSlaPanel} from './src/sales/MessengerSla';export {ShipmentTracking} from './src/shipping/ShipmentTracking'; export {ShippingSettings} from './src/shipping/ShippingSettings';export {SalesReport} from './src/sales/Reports';export {MonthlyComparison,monthGrowth} from './src/sales/MonthlyComparison';export {ReportAiSettings,ReportAiPanel} from './src/sales/ReportAiSettings';`,
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
const { ShipmentTracking, ShippingSettings, SalesReport, MonthlyComparison, monthGrowth, ReportAiSettings, ReportAiPanel } = compiled.exports;
const actor = {
  id: 'tester',
  grants: [{ permission: 'sales.shipments.manage', scope: 'ASSIGNED' }],
};
test('Response rate chart compares total and staff, preserves sample counts and empty states', async () => {
  const counts={answered:10,onTime:8,late:2,pending:3,pendingLate:1,estimated:0,onTimeRate:80,lateRate:20};
  const root=await mount(compiled.exports.ResponseRateChart,{summary:counts,rows:[{...counts,id:'staff',displayName:'Nhân sự A'},{...counts,id:'empty',displayName:'Nhân sự B',answered:0,onTime:0,late:0,onTimeRate:null,lateRate:null}]});
  assert.equal(node.querySelectorAll('.response-rate-row').length,3);
  assert.match(node.querySelector('figcaption').textContent,/tỷ lệ phản hồi/);
  const bars=node.querySelectorAll('.response-rate-bar');
  assert.equal(bars[0].querySelector('.response-on-time').style.width,'80%');
  assert.equal(bars[0].querySelector('.response-late').style.width,'20%');
  assert.match(bars[1].getAttribute('aria-label'),/10 lượt đã trả lời/);
  assert.match(bars[2].textContent,/Chưa có mẫu/);
  assert.equal(bars[2].querySelector('.response-on-time'),null);
  await act(async()=>root.unmount());
});
test('Messenger SLA settings persist seconds and report explains 24/7 rates and pending work', async () => {
  const {MessengerSlaSettings,MessengerSlaPanel}=compiled.exports;
  const calls=[];
  globalThis.shippingHttp=async (...a)=>{calls.push(a);return {version:0,responseSeconds:180};};
  let root=await mount(MessengerSlaSettings,{});
  assert.match(node.textContent,/24\/7/);
  node.querySelector('[name=responseSeconds]').value='90';
  await act(async()=>node.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(calls.find(x=>x[1]==='PATCH')[2],{version:0,responseSeconds:90});
  await act(async()=>root.unmount());
  const summary={answered:0,onTime:0,late:0,pending:2,pendingLate:1,estimated:0,onTimeRate:null,lateRate:null};
  globalThis.shippingHttp=async path=>{assert.match(path,/from=2026-10-01/);return {from:'2026-10-01',to:'2026-10-30',responseSeconds:90,summary,rows:[]};};
  root=await mount(MessengerSlaPanel,{actor:{id:'reader',grants:[{permission:'sales.reports.read',scope:'ASSIGNED'}]},from:'2026-10-01',to:'2026-10-30'});
  assert.match(node.textContent,/Chưa có mẫu/);assert.match(node.textContent,/Chưa trả lời quá hạn/);assert.match(node.textContent,/Hạn 90 giây/);
  await act(async()=>root.unmount());
});
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
    returned: 0, returnRate: 0,
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
  globalThis.shippingHttp = async (path) => path.startsWith('/sales/messenger-sla') ? {
    from:'2026-08-20',to:'2026-08-20',responseSeconds:180,summary:{answered:1,onTime:1,late:0,pending:0,pendingLate:0,estimated:0,onTimeRate:100,lateRate:0},rows:[]
  } : path.startsWith('/sales/productivity') ? {rows:[],asOf:'2026-08-20T00:00:00Z'} : ({
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
  const reportActor={...actor,grants:[...actor.grants,{permission:'sales.reports.read',scope:'ASSIGNED'}]};
  const root = await mount(SalesReport, { actor: reportActor, detailed: true, openReports: () => {} });
  assert.match(node.textContent,/Phản hồi Messenger đúng giờ/);
  assert.match(node.textContent, /1 đơn chưa có phí thực trả/);
  assert.match(node.textContent, /29\.000/);
  assert.match(node.textContent, /VNPost/);
  assert.ok(node.querySelectorAll('table').length >= 2);
  assert.ok([...node.querySelectorAll('button')].some((b) => b.textContent.includes('Xuất CSV')));
  await act(async () => root.unmount());
  const overview=await mount(SalesReport,{actor:reportActor,detailed:false,openReports:()=>{}});
  assert.match(node.textContent,/Phản hồi Messenger đúng giờ/);
  await act(async()=>overview.unmount());
});

test('Monthly comparison preserves zero months, partial periods and metric switching', async () => {
  assert.equal(monthGrowth('150', '100'), '+50%');
  assert.equal(monthGrowth('0', '100'), '-100%');
  assert.equal(monthGrowth('100', '0'), '—');
  assert.equal(monthGrowth('100'), '—');
  const root = await mount(MonthlyComparison, { from: '2026-07-01', to: '2026-09-28', rows: [
    { label: '2026-07', sales: '0', paid: '0', validOrders: 0, cancelled: 0, shippingCharged: '0', shippingActual: '0', shippingUnknown: 0 },
    { label: '2026-08', sales: '100000', paid: '50000', validOrders: 2, cancelled: 1, shippingCharged: '30000', shippingActual: '20000', shippingUnknown: 1 },
    { label: '2026-09', sales: '200000', paid: '60000', validOrders: 4, cancelled: 0, shippingCharged: '40000', shippingActual: '30000', shippingUnknown: 2 },
  ].map(r=>({...r,returned:0,returnRate:0,shippingEstimated:'0',deliveredOnTime:0,deliveredLate:0,deliveryUnknown:0,shippingReturned:0,shippingCancelled:0})) });
  assert.equal(node.querySelectorAll('.month-column').length, 3);
  assert.match(node.textContent, /Chưa so sánh/);
  assert.doesNotMatch(node.textContent, /\+100%/);
  await click('Đơn hàng');
  assert.match(node.querySelector('thead').textContent, /Đơn hợp lệ/);
  await click('Chi phí vận chuyển');
  assert.equal(node.querySelectorAll('.month-column:first-child .month-bar').length,3);
  assert.match(node.textContent,/Cước tạm tính/);
  assert.match(node.textContent, /Đơn chưa có phí thực trả/);
  assert.match(node.textContent, /không phải lợi nhuận/);
  await click('Kết quả giao hàng');
  assert.equal(node.querySelectorAll('.month-column:first-child .month-bar').length,4);
  assert.match(node.textContent,/thiếu mốc thời gian/);
  await act(async () => root.unmount());
});

test('AI preferences save without credentials or activation; report links to settings', async () => {
  const calls = []; let config = { version: 0, provider: 'OPENAI', allowWeb: false, enabled: false, status: 'AWAITING_API_SETUP' };
  globalThis.shippingHttp = async (...a) => { calls.push(a); if (a[1] === 'PATCH') config = { ...config, ...a[2], version: 1 }; return config; };
  let root = await mount(ReportAiSettings, {});
  node.querySelector('[name=provider]').value = 'GEMINI';
  node.querySelector('[name=allowWeb]').checked = true;
  await act(async () => node.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
  assert.deepEqual(calls.find(a => a[1] === 'PATCH')[2], { version: 0, provider: 'GEMINI', allowWeb: true });
  assert.equal(node.querySelector('[name=provider]').value, 'GEMINI');
  assert.match(node.textContent, /AI vẫn chưa được kích hoạt/);
  assert.equal(node.querySelector('[type=password]'), null);
  await act(async () => root.unmount());
  let opened = false;
  root = await mount(ReportAiPanel, { openSettings: () => { opened = true; } });
  assert.ok(node.querySelector('button').disabled);
  await click('Thiết lập AI'); assert.ok(opened);
  await act(async () => root.unmount());
});
