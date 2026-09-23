// Read-only comparison of the original Sapo workbooks against the current database.
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@sakura/database');
const { ExcelImports } = require('../apps/platform-api/dist/imports/excel.service');
(async () => {
  const db = new PrismaClient(),
    service = new ExcelImports(db);
  try {
    const folder = process.argv[2];
    const result = [];
    for (const name of fs.readdirSync(folder).filter((f) => f.endsWith('.xlsx'))) {
      const started = Date.now();
      const source = await service.read(fs.readFileSync(path.join(folder, name)), name);
      const plan = await db.$transaction((tx) => service.plan(tx, source), {
        isolationLevel: 'RepeatableRead',
        timeout: 60000,
      });
      result.push({
        file: name,
        kind: source.kind,
        rows: source.rowCount,
        records: plan.length,
        create: plan.filter((p) => p.action === 'CREATE').length,
        skip: plan.filter((p) => p.action === 'SKIP').length,
        errors: plan.filter((p) => p.action === 'ERROR').length,
        seconds: Math.round((Date.now() - started) / 1000),
        messages: [...new Set(plan.flatMap((p) => p.errors))],
      });
    }
    fs.writeFileSync('.local/excel-upload-check.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (result.some((r) => r.create || r.errors)) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
