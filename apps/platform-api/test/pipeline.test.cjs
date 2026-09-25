const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@sakura/database');
const { summarizePipeline, probability } = require('../dist/sales/pipeline');
test('pipeline weights revenue and quantities, separates units and preserves unknown rates', () => {
  const row = (status, p, amount, unit, quantity) => ({
    status,
    closingProbability: p,
    expectedRevenue: new Prisma.Decimal(amount),
    expectedProducts: [],
    expectedItems: [{ name: 'Ribbon', unit, quantity }],
  });
  const result = summarizePipeline([
    row('CONSULTING', 25, '1000000', 'cuộn', 20),
    row('WON', 5, '100000', 'cuộn', 3),
    row('INACTIVE', 90, '999999', 'cuộn', 7),
    row('NEW', null, '500000', 'mét', 100),
    row('RETURNING', 50, '100001', 'mét', 1.5),
  ]);
  assert.equal(result.totalExpectedRevenue, '400001');
  assert.equal(result.missingProbability, 1);
  assert.deepEqual(result.expectedShipments.sort((a,b)=>a.unit.localeCompare(b.unit)), [
    { unit: 'cuộn', quantity: '8.00' },
    { unit: 'mét', quantity: '0.75' },
  ]);
  assert.equal(probability({ status: 'WON', closingProbability: 0 }), 100);
  assert.equal(probability({ status: 'INACTIVE', closingProbability: 100 }), 0);
});
