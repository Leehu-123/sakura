const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@sakura/database');
const {
  storeMedia,
  mediaPayload,
  MAX_MEDIA_BYTES,
} = require('../apps/platform-api/dist/common/media-store');
const sha = (s) => createHash('sha256').update(s).digest('hex');
function imagePlan(plan) {
  const refs = new Map();
  const add = (p, variant, url, title) => {
    if (!url) return;
    const u = new URL(url);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'bizweb.dktcdn.net' ||
      u.username ||
      u.password ||
      u.port ||
      !u.pathname.startsWith('/100/557/101/products/')
    )
      throw new Error('URL ảnh ngoài kho sản phẩm Sapo đã kiểm chứng.');
    const sourceKey = 'SAPO_IMAGE:' + sha([p.externalId, variant || '', u.href].join('\n'));
    refs.set(sourceKey, {
      sourceKey,
      productExternalId: p.externalId,
      variantExternalId: variant || null,
      sourceUrl: u.href,
      title: title.slice(0, 120),
    });
  };
  for (const p of plan.products) {
    const rows = p.data.sourceData.rows;
    for (const r of rows) {
      const v = r.values;
      add(p, null, v['Ảnh đại diện'], p.data.name);
      if (v['Ảnh phiên bản']) {
        if (!v['Id phiên bản']) throw new Error('Ảnh phiên bản thiếu mã.');
        add(p, String(v['Id phiên bản']), v['Ảnh phiên bản'], p.data.name + ' · ' + v['Mã SKU']);
      }
    }
  }
  return [...refs.values()];
}
async function download(url, fetcher = fetch) {
  const r = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
  if (!r.ok || !r.body) throw new Error('Tải ảnh HTTP ' + r.status);
  if (Number(r.headers.get('content-length')) > MAX_MEDIA_BYTES) {
    await r.body.cancel();
    throw new Error('Ảnh lớn hơn 20 MB');
  }
  const chunks = [];
  let size = 0;
  for await (const c of r.body) {
    size += c.length;
    if (size > MAX_MEDIA_BYTES) throw new Error('Ảnh lớn hơn 20 MB');
    chunks.push(Buffer.from(c));
  }
  return storeMedia(Buffer.concat(chunks));
}
async function importImages(db, plan, actorId, directory, { fetcher = fetch } = {}) {
  const actor = await db.user.findFirst({
    where: {
      id: actorId,
      status: 'ACTIVE',
      roleAssignments: {
        some: {
          role: {
            permissions: { some: { permission: { code: 'core.imports.manage' }, scope: 'GLOBAL' } },
          },
        },
      },
    },
  });
  if (!actor) throw new Error('Không có quyền nhập.');
  const links = imagePlan(plan);
  const products = await db.product.findMany({ select: { id: true, sourceData: true } });
  const variants = await db.productVariant.findMany({
    select: { id: true, productId: true, sourceData: true },
  });
  const productIds = new Map(
    products
      .filter((p) => p.sourceData?.rows)
      .map((p) => [String(p.sourceData.rows[0].values['Id sản phẩm']), p.id]),
  );
  const variantIds = new Map(
    variants
      .filter((v) => v.sourceData?.values)
      .map((v) => [String(v.sourceData.values['Id phiên bản']), v]),
  );
  for (const l of links) {
    l.productId = productIds.get(l.productExternalId);
    l.variantId = l.variantExternalId ? variantIds.get(l.variantExternalId)?.id : null;
    if (
      !l.productId ||
      (l.variantExternalId &&
        (!l.variantId || variantIds.get(l.variantExternalId).productId !== l.productId))
    )
      throw new Error('Thiếu hoặc sai liên kết sản phẩm/biến thể.');
  }
  const manifestFile = path.join(directory, 'image-manifest.json');
  let cached = {};
  try {
    cached = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const urls = [...new Set(links.map((l) => l.sourceUrl))];
  let next = 0,
    done = 0;
  const failures = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        try {
          if (cached[url]) await mediaPayload({ data: '', ...cached[url] });
          else cached[url] = await download(url, fetcher);
        } catch (e) {
          failures.push({ url, error: e.message });
        }
        done++;
        if (done % 50 === 0 || done === urls.length)
          console.log('Ảnh đã kiểm tra ' + done + '/' + urls.length);
      }
    }),
  );
  await fs.writeFile(manifestFile, JSON.stringify(cached, null, 2));
  let created = 0,
    skipped = 0;
  for (const l of links) {
    if (!cached[l.sourceUrl] || failures.some((f) => f.url === l.sourceUrl)) continue;
    const stored = cached[l.sourceUrl];
    await db.$transaction(async (tx) => {
      const existing = await tx.productImage.findUnique({ where: { sourceKey: l.sourceKey } });
      if (existing) {
        if (
          existing.productId !== l.productId ||
          existing.variantId !== l.variantId ||
          existing.storageKey !== stored.storageKey
        )
          throw new Error('Ảnh đã nhập có liên kết/nội dung khác.');
        skipped++;
        return;
      }
      const image = await tx.productImage.create({
        data: {
          productId: l.productId,
          variantId: l.variantId,
          title: l.title,
          sourceKey: l.sourceKey,
          sourceUrl: l.sourceUrl,
          ...stored,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'chat.image_added',
          entity: 'ProductImage',
          entityId: image.id,
          metadata: { source: 'SAPO', byteSize: stored.byteSize },
        },
      });
      created++;
    });
  }
  const unique = new Map(Object.values(cached).map((v) => [v.storageKey, v]));
  const result = {
    requestedUrls: urls.length,
    downloadedUrls: Object.keys(cached).length,
    uniqueFiles: unique.size,
    bytes: [...unique.values()].reduce((s, v) => s + v.byteSize, 0),
    links: links.length,
    created,
    skipped,
    failures,
  };
  await fs.writeFile(
    path.join(directory, 'image-import-result.json'),
    JSON.stringify(result, null, 2),
  );
  return result;
}
module.exports = { imagePlan, download, importImages };
if (require.main === module)
  (async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))
      throw new Error('Chỉ nhập DB cục bộ.');
    const directory = path.resolve(process.argv[2]);
    const plan = JSON.parse(await fs.readFile(path.join(directory, 'prepared.json'), 'utf8'));
    const db = new PrismaClient();
    try {
      const admins = await db.user.findMany({
        where: { status: 'ACTIVE', roleAssignments: { some: { role: { code: 'admin' } } } },
        select: { id: true },
      });
      if (admins.length !== 1) throw new Error('Cần xác định Admin nhập.');
      const r = await importImages(db, plan, admins[0].id, directory);
      console.log(JSON.stringify(r, null, 2));
      if (r.failures.length) process.exitCode = 1;
    } finally {
      await db.$disconnect();
    }
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
