// Read-only sizing snapshot. No customer identifiers, names or contact details are emitted.
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@sakura/database');
async function main() {
  const dir = path.resolve(process.argv[2] || '.local/sapo-20260909');
  const plan = JSON.parse(fs.readFileSync(path.join(dir, 'prepared.json'), 'utf8'));
  const orders = {},
    customers = {};
  for (const o of plan.orders) {
    const day = new Date(new Date(o.data.orderedAt).getTime() + 25200000)
      .toISOString()
      .slice(0, 10);
    const m = (orders[day.slice(0, 7)] ||= {
      orders: 0,
      lines: 0,
      completed: 0,
      cancelled: 0,
      sourceTotal: 0,
      min: day,
      max: day,
    });
    m.orders++;
    m.lines += o.data.items.length;
    m.sourceTotal += Number(o.data.total);
    m.completed += Number(o.data.sourceStatus === 'Đã hoàn thành');
    m.cancelled += Number(o.data.sourceStatus === 'Đã hủy');
    if (day < m.min) m.min = day;
    if (day > m.max) m.max = day;
  }
  for (const c of plan.customers) {
    const date = c.data.sourceData.values['Created On(Ngày tạo)'];
    const match = String(date).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) throw Error('Ngày khách nguồn chưa nhận diện');
    const key = match[3] + '-' + match[2];
    customers[key] = (customers[key] || 0) + 1;
  }
  const complete = Object.keys(orders)
    .filter((m) => m >= '2026-02' && m <= '2026-08')
    .sort();
  const series = Object.keys(orders)
    .sort()
    .map((m) => ({ month: m, ...orders[m], fullMonth: complete.includes(m) }));
  const last3 = ['2026-06', '2026-07', '2026-08'];
  const mean = (keys) => keys.reduce((s, k) => s + orders[k].orders, 0) / keys.length;
  const growth = (a, b) => 100 * (a / b - 1);
  const db = new PrismaClient();
  try {
    const sizes =
      await db.$queryRaw`SELECT relname AS table, pg_total_relation_size(relid)::text AS bytes
      FROM pg_catalog.pg_statio_user_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(relid) DESC`;
    const database = await db.$queryRaw`SELECT pg_database_size(current_database())::text AS bytes`;
    const media = await db.productImage.findMany({
      select: {
        storageKey: true,
        byteSize: true,
        sourceKey: true,
        productId: true,
        variantId: true,
      },
    });
    const sapo = media.filter((x) => x.sourceKey?.startsWith('SAPO_IMAGE:'));
    const files = new Map(sapo.map((x) => [x.storageKey, x.byteSize]));
    const mediaBytes = [...files.values()].reduce((s, n) => s + n, 0);
    const publicBytes = sizes.reduce((s, r) => s + Number(r.bytes), 0);
    const historicalBytes = Number(sizes.find((r) => r.table === 'HistoricalOrder').bytes);
    const projection = [];
    for (const rate of [0, 0.5, 1])
      for (const years of [1, 3, 5]) {
        const added =
          30000 *
          Array.from({ length: years }, (_, y) => (1 + rate) ** y).reduce((a, b) => a + b, 0);
        // Capacity assumptions, not measurements: 32 KiB business/order; 20 messages at 2 KiB;
        // one NEW unique attachment at 0.5 MiB/order. Product catalog grows by 50%/year.
        const databaseBytes = publicBytes + added * (32 + 20 * 2) * 1024;
        const futureMedia = mediaBytes * 1.5 ** years + added * 0.5 * 1024 * 1024;
        projection.push({
          annualGrowth: rate,
          years,
          addedOrders: added,
          totalOrders: plan.orders.length + added,
          databaseGB: databaseBytes / 1e9,
          mediaGB: futureMedia / 1e9,
          with100PercentHeadroomDB: (2 * databaseBytes) / 1e9,
          with100PercentHeadroomMedia: (2 * futureMedia) / 1e9,
        });
      }
    const out = {
      measuredAt: new Date().toISOString(),
      sourceThrough: '2026-09-08',
      companyStartProvided: '2025-06',
      series,
      customersByMonth: customers,
      averageCompleteMonth: mean(complete),
      averageLast3Months: mean(last3),
      annualizedLast3: mean(last3) * 12,
      julyMoM: growth(orders['2026-07'].orders, orders['2026-06'].orders),
      augustMoM: growth(orders['2026-08'].orders, orders['2026-07'].orders),
      augustVsJune: growth(orders['2026-08'].orders, orders['2026-06'].orders),
      recentCustomerMean: (customers['2026-06'] + customers['2026-07'] + customers['2026-08']) / 3,
      linesPerOrder: plan.summary.orderLines / plan.orders.length,
      publicBytes,
      databaseBytes: Number(database[0].bytes),
      tables: sizes,
      historicalBytes,
      historicalBytesPerOrder: historicalBytes / plan.orders.length,
      images: {
        links: sapo.length,
        uniqueFiles: files.size,
        bytes: mediaBytes,
        meanBytes: mediaBytes / files.size,
        productsWithImages: new Set(sapo.map((x) => x.productId)).size,
        variantsWithOwnImages: new Set(sapo.filter((x) => x.variantId).map((x) => x.variantId))
          .size,
      },
      projection,
    };
    fs.writeFileSync(path.join(dir, 'storage-metrics.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
