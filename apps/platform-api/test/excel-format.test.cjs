const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workbook, customer, product, order } = require('./excel-fixture.cjs');
const { parseExcel, checkZip } = require('../dist/imports/excel-worker');
const { sourceValues } = require('../dist/imports/excel-format');
const { digest } = require('../dist/imports/planner');
test('Native Excel identifies headers regardless of filename, retains absent fields and decimal quantities', async () => {
  const c = await parseExcel(await workbook('CUSTOMERS', [customer(100, null)]), 'khach.xlsx');
  assert.equal(c.kind, 'CUSTOMERS');
  assert.equal(c.customers[0].data.phone, null);
  const p = await parseExcel(await workbook('PRODUCTS', [product()]), 'hang.xlsx');
  assert.equal(p.products.length, 1);
  assert.equal(p.variants[0].data.price, '30000');
  const o = await parseExcel(await workbook('ORDERS', [order()]), 'don.xlsx');
  assert.equal(o.orders[0].data.items[0].quantity, '1.5');
  assert.equal(o.orders[0].data.items[0].lineTotal, null);
  assert.equal(o.orders[0].data.orderedAt, '2026-09-14T03:30:00.000Z');
  assert.equal(o.orders[0].data.total, '40000');
  assert.equal(o.orders[0].data.paidAmount, null);
});
test('Rejects formulas, extra sheets, incomplete headers, unsafe numbers and duplicate source records', async () => {
  await assert.rejects(
    parseExcel(
      await workbook('CUSTOMERS', [customer()], (_b, s) => {
        s.getCell('B2').value = { formula: '1+1', result: 2 };
      }),
      'test.xlsx',
    ),
    /công thức/,
  );
  await assert.rejects(
    parseExcel(
      await workbook('CUSTOMERS', [customer()], (b) => {
        b.addWorksheet('Khác').addRow(['data']);
      }),
      'test.xlsx',
    ),
    /một trang/,
  );
  await assert.rejects(
    parseExcel(
      await workbook('CUSTOMERS', [customer()], (_b, s) => {
        s.getCell('A1').value = 'Mã khác';
      }),
      'test.xlsx',
    ),
    /mẫu Excel/,
  );
  await assert.rejects(
    parseExcel(await workbook('CUSTOMERS', [customer(Number.MAX_SAFE_INTEGER + 10)]), 'test.xlsx'),
    /số quá lớn/,
  );
  await assert.rejects(
    parseExcel(await workbook('CUSTOMERS', [customer(), customer()]), 'test.xlsx'),
    /Trùng/,
  );
});
test('ZIP validation rejects malformed, oversized and dishonest expanded-size archives', async () => {
  assert.throws(() => checkZip(Buffer.from('not excel')), /xlsx/);
  assert.throws(() => checkZip(Buffer.alloc(11 * 1024 * 1024)), /10 MB/);
  const b = await workbook('CUSTOMERS', [customer()]);
  const at = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(at > 0);
  const oversized = Buffer.from(b);
  oversized.writeUInt32LE(101 * 1024 * 1024, at + 24);
  assert.throws(() => checkZip(oversized), /100 MB/);
  const dishonest = Buffer.from(b);
  dishonest.writeUInt32LE(1, at + 24);
  assert.throws(() => checkZip(dishonest));
});
test('Source comparison ignores file provenance and key order, but detects changed values', () => {
  const a = {
    file: 'old.xlsx',
    sha256: 'a',
    row: 2,
    values: { phone: '0123', name: 'A', empty: null },
  };
  const b = {
    file: 'renamed.xlsx',
    sha256: 'b',
    row: 9,
    values: { name: 'A', phone: '0123', empty: '' },
  };
  assert.equal(digest(sourceValues(a)), digest(sourceValues(b)));
  b.values.name = 'B';
  assert.notEqual(digest(sourceValues(a)), digest(sourceValues(b)));
});
