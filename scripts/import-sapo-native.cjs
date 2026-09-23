const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@sakura/database');
const { hash } = require('./sapo-native.cjs');
async function importPlan(db, plan, actorId, { dryRun = false } = {}) {
  const { digest, ...body } = plan;
  if (hash(body) !== digest) throw new Error('Bản chuẩn hóa đã thay đổi');
  const actor = await db.user.findUnique({
    where: { id: actorId },
    include: {
      roleAssignments: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });
  if (
    !actor ||
    actor.status !== 'ACTIVE' ||
    !actor.roleAssignments.some((a) =>
      a.role.permissions.some(
        (p) => p.permission.code === 'core.imports.manage' && p.scope === 'GLOBAL',
      ),
    )
  )
    throw new Error('Người nhập không có quyền nhập Sapo toàn cục');
  const refs = await db.sapoReference.findMany(),
    byRef = new Map(refs.map((r) => [r.kind + ':' + r.externalId, r]));
  const currentCustomers = await db.customer.findMany({ select: { id: true, phone: true } }),
    byPhone = new Map(currentCustomers.filter((c) => c.phone).map((c) => [c.phone, c.id]));
  const currentVariants = await db.productVariant.findMany({ select: { id: true, sku: true } }),
    bySku = new Map(currentVariants.map((v) => [v.sku, v.id]));
  const maps = {
      CUSTOMERS: new Map(),
      PRODUCT_GROUP: new Map(),
      PRODUCTS: new Map(),
      ORDERS: new Map(),
    },
    parts = [];
  const counts = { create: 0, skip: 0 };
  for (const [kind, list] of [
    ['CUSTOMERS', plan.customers],
    ['PRODUCT_GROUP', plan.products],
    ['PRODUCTS', plan.variants],
    ['ORDERS', plan.orders],
  ]) {
    const pending = [];
    for (const row of list) {
      const fingerprint = hash(row),
        ref = byRef.get(kind + ':' + row.externalId);
      if (ref && ref.fingerprint !== fingerprint)
        throw new Error('Mã nguồn đã nhập với nội dung khác: ' + kind + ' ' + row.externalId);
      if (!ref && kind === 'CUSTOMERS' && row.data.phone && byPhone.has(row.data.phone))
        throw new Error('Điện thoại đã tồn tại chưa liên kết Sapo: ' + row.externalId);
      if (!ref && kind === 'PRODUCTS' && bySku.has(row.data.sku))
        throw new Error('SKU đã tồn tại chưa liên kết Sapo: ' + row.externalId);
      const targetId = ref?.targetId || randomUUID();
      maps[kind].set(row.externalId, targetId);
      if (ref) {
        counts.skip++;
        continue;
      }
      counts.create++;
      pending.push({ row, targetId, fingerprint });
    }
    parts.push({ kind, pending });
  }
  if (dryRun) return { digest, ...plan.summary, ...counts };
  for (const { kind, pending } of parts) {
    for (let offset = 0; offset < pending.length; offset += 100) {
      const slice = pending.slice(offset, offset + 100);
      await db.$transaction(
        async (tx) => {
          const data = slice.map((p) => {
            const row = p.row;
            return kind === 'CUSTOMERS'
              ? { id: p.targetId, ...row.data, createdById: actorId }
              : kind === 'PRODUCT_GROUP'
                ? { id: p.targetId, ...row.data }
                : kind === 'PRODUCTS'
                  ? {
                      id: p.targetId,
                      ...row.data,
                      productId: maps.PRODUCT_GROUP.get(row.productExternalId),
                    }
                  : {
                      id: p.targetId,
                      ...row.data,
                      customerId: row.customerExternalId
                        ? maps.CUSTOMERS.get(row.customerExternalId)
                        : null,
                    };
          });
          const model = {
            CUSTOMERS: tx.customer,
            PRODUCT_GROUP: tx.product,
            PRODUCTS: tx.productVariant,
            ORDERS: tx.historicalOrder,
          }[kind];
          await model.createMany({ data });
          await tx.sapoReference.createMany({
            data: slice.map((p) => ({
              kind,
              externalId: p.row.externalId,
              targetId: p.targetId,
              fingerprint: p.fingerprint,
            })),
          });
          const auditKind = kind === 'PRODUCT_GROUP' ? 'PRODUCTS' : kind,
            sourceFile = plan.files.find((f) =>
              f.file.startsWith(
                kind === 'CUSTOMERS' ? 'customers' : kind === 'ORDERS' ? 'order_' : 'products',
              ),
            ).file;
          const planRows = slice.map((p, i) => ({
            line: offset + i + 1,
            action: 'CREATE',
            data: {
              externalId: p.row.externalId,
              name: p.row.data.name || p.row.data.number || '',
            },
            items: [],
            errors: [],
            warnings: [],
            fingerprint: p.fingerprint,
            dependency: { targetId: p.targetId },
          }));
          const batch = await tx.importBatch.create({
            data: {
              actorId,
              kind: auditKind,
              fileName: sourceFile,
              rows: slice.map((p) => ({ externalId: p.row.externalId, sourceDigest: digest })),
              plan: planRows,
              digest: hash(planRows),
              status: 'COMMITTED',
              committedAt: new Date(),
            },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: 'import.committed',
              entity: 'ImportBatch',
              entityId: batch.id,
              metadata: {
                format: 'SAPO_XLSX_NATIVE_V1',
                kind,
                created: slice.length,
                sourceDigest: digest,
              },
            },
          });
        },
        { isolationLevel: 'Serializable', timeout: 30000, maxWait: 10000 },
      );
      if (offset === 0 || offset + 100 >= pending.length || (offset + 100) % 1000 === 0)
        process.stdout.write(
          kind + ' ' + Math.min(offset + 100, pending.length) + '/' + pending.length + '\n',
        );
    }
  }
  return { digest, ...plan.summary, ...counts };
}
module.exports = { importPlan };
if (require.main === module) {
  (async () => {
    const dir = process.argv[2],
      mode = process.argv[3],
      expected = process.argv[4],
      url = new URL(process.env.DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error('CLI này chỉ dành cho DB cục bộ');
    const plan = JSON.parse(fs.readFileSync(path.join(dir, 'prepared.json'), 'utf8'));
    if (!['preview', 'commit'].includes(mode)) throw new Error('Chọn preview hoặc commit');
    if (mode === 'commit' && expected !== plan.digest)
      throw new Error('Cần digest đúng bản xem trước');
    const db = new PrismaClient();
    try {
      const admins = await db.user.findMany({
        where: { status: 'ACTIVE', roleAssignments: { some: { role: { code: 'admin' } } } },
        select: { id: true },
      });
      if (admins.length !== 1) throw new Error('Cần xác định người nhập khi có nhiều Admin');
      const result = await importPlan(db, plan, admins[0].id, { dryRun: mode === 'preview' });
      fs.writeFileSync(path.join(dir, mode + '-result.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await db.$disconnect();
    }
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
