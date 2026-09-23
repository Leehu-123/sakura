const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { PrismaClient } = require('@sakura/database');
(async () => {
  const dir = process.argv[2],
    plan = JSON.parse(fs.readFileSync(path.join(dir, 'prepared.json'), 'utf8')),
    db = new PrismaClient();
  try {
    const refs = await db.sapoReference.findMany();
    const ids = new Map(refs.map((r) => [r.kind + ':' + r.externalId, r.targetId]));
    let checked = 0;
    for (const [kind, model, rows] of [
      ['CUSTOMERS', db.customer, plan.customers],
      ['PRODUCT_GROUP', db.product, plan.products],
      ['PRODUCTS', db.productVariant, plan.variants],
      ['ORDERS', db.historicalOrder, plan.orders],
    ]) {
      const records = await model.findMany(),
        byId = new Map(records.map((r) => [r.id, r]));
      for (const p of rows) {
        const actual = byId.get(ids.get(kind + ':' + p.externalId));
        assert.ok(actual, 'Thiếu ' + kind + ' ' + p.externalId);
        for (const [key, value] of Object.entries(p.data)) {
          const v = actual[key];
          assert.deepEqual(
            v instanceof Date
              ? v.toISOString()
              : v && typeof v.toFixed === 'function'
                ? v.toFixed(0)
                : v,
            value,
            kind + ' ' + p.externalId + ' ' + key,
          );
        }
        if (kind === 'ORDERS')
          assert.equal(
            actual.customerId,
            p.customerExternalId ? ids.get('CUSTOMERS:' + p.customerExternalId) : null,
          );
        checked++;
      }
    }
    const summary = {
      verifiedRecords: checked,
      ...plan.summary,
      operationalOrders: await db.order.count(),
      chatMessages: await db.chatMessage.count(),
      deliverySlips: await db.deliverySlip.count(),
      assignments: await db.customerAssignment.count(),
      verifiedAt: new Date().toISOString(),
    };
    assert.equal(summary.operationalOrders, 0);
    assert.equal(summary.chatMessages, 0);
    assert.equal(summary.deliverySlips, 0);
    assert.equal(summary.assignments, 0);
    fs.writeFileSync(path.join(dir, 'verified.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
