const { PrismaClient } = require('@sakura/database');
const { storageStatus } = require('../../apps/platform-api/dist/common/storage-status');
const fs = require('fs/promises'),
  path = require('path');
(async () => {
  const db = new PrismaClient();
  try {
    const report = await storageStatus(db),
      dir = path.resolve(__dirname, '../../.local/storage-checks');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, Date.now() + '.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.warnings.length) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
