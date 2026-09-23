import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal } from '../auth/policy';
import { ExcelSource, NativeRow, sourceValues } from './excel-format';
import { digest } from './planner';
import { storeMedia, MAX_MEDIA_BYTES } from '../common/media-store';

type Entry = {
  kind: string;
  externalId: string;
  label: string;
  lines: number[];
  action: string;
  errors: string[];
  warnings: string[];
  fingerprint: string;
  targetId: string | null;
  customerId: string | null;
};
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const counts = (p: Entry[]) => ({
  create: p.filter((x) => x.action === 'CREATE').length,
  skip: p.filter((x) => x.action === 'SKIP').length,
  errors: p.filter((x) => x.action === 'ERROR').length,
});
const collection = (s: ExcelSource): [string, NativeRow[]][] => [
  ['CUSTOMERS', s.customers],
  ['PRODUCT_GROUP', s.products],
  ['PRODUCTS', s.variants],
  ['ORDERS', s.orders],
];

@Injectable()
export class ExcelImports {
  private parsing = false;
  private imageJobs = new Set<string>();
  constructor(private readonly db: Database) {}
  async read(buffer: Buffer, fileName: string): Promise<ExcelSource> {
    if (this.parsing)
      throw new ServiceUnavailableException('Đang đọc một file Excel khác. Vui lòng thử lại sau.');
    if (!/\.xlsx$/i.test(fileName) || fileName.length > 150 || /[\\/\x00-\x1f]/.test(fileName))
      throw new BadRequestException('Chọn file .xlsx, tên tối đa 150 ký tự.');
    this.parsing = true;
    try {
      return await new Promise((resolveRead, reject) => {
        const worker = new Worker(join(__dirname, 'excel-worker.js'), {
          workerData: { buffer, fileName },
          resourceLimits: { maxOldGenerationSizeMb: 512 },
        });
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(new BadRequestException('File Excel quá phức tạp hoặc xử lý quá 60 giây.'));
        }, 60000);
        worker.once('message', (m) => {
          clearTimeout(timer);
          void worker.terminate();
          m.error ? reject(new BadRequestException(m.error)) : resolveRead(m.value);
        });
        worker.once('error', () => {
          clearTimeout(timer);
          reject(new BadRequestException('Không đọc được Excel trong giới hạn bộ nhớ.'));
        });
        worker.once('exit', (code) => {
          clearTimeout(timer);
          if (code) reject(new BadRequestException('Không đọc được file Excel.'));
        });
      });
    } finally {
      this.parsing = false;
    }
  }
  async plan(tx: Prisma.TransactionClient, source: ExcelSource): Promise<Entry[]> {
    const refs = await tx.sapoReference.findMany();
    const refMap = new Map(refs.map((r) => [r.kind + ':' + r.externalId, r]));
    const customers = await tx.customer.findMany({
      select: { id: true, phone: true, sourceData: true },
    });
    const products = await tx.product.findMany({ select: { id: true, sourceData: true } });
    const variants = await tx.productVariant.findMany({
      select: { id: true, sku: true, sourceData: true },
    });
    const orders = source.orders.length
      ? await tx.historicalOrder.findMany({
          where: { externalId: { in: source.orders.map((o) => o.externalId) } },
          select: { id: true, sourceData: true },
        })
      : [];
    const targets = new Map(
      [...customers, ...products, ...variants, ...orders].map((r) => [r.id, r.sourceData]),
    );
    const phones = new Map(customers.filter((c) => c.phone).map((c) => [c.phone!, c.id]));
    const skus = new Set(variants.map((v) => v.sku));
    const entries: Entry[] = [];
    for (const [kind, rows] of collection(source))
      for (const row of rows) {
        const ref = refMap.get(kind + ':' + row.externalId),
          raw = row.data.sourceData;
        const e: Entry = {
          kind,
          externalId: row.externalId,
          label: row.data.name || row.data.sku || row.data.number,
          lines: raw.rows ? raw.rows.map((r: any) => r.row) : [raw.row],
          action: 'CREATE',
          errors: [],
          warnings: raw.warnings || [],
          fingerprint: digest(sourceValues(raw)),
          targetId: ref?.targetId || null,
          customerId: null,
        };
        if (row.externalId.length > 100) e.errors.push('Mã Sapo vượt 100 ký tự.');
        if (ref) {
          if (
            targets.has(ref.targetId) &&
            digest(sourceValues(targets.get(ref.targetId))) === e.fingerprint
          )
            e.action = 'SKIP';
          else
            e.errors.push(
              'Mã Sapo đã nhập nhưng dữ liệu nguồn khác hoặc chưa thể đối chiếu. Không tự ghi đè; cần kiểm tra hồ sơ hiện có.',
            );
        } else if (kind === 'CUSTOMERS' && row.data.phone && phones.has(row.data.phone))
          e.errors.push('Số điện thoại đã có trong Sakura nhưng chưa gắn mã Sapo này.');
        else if (kind === 'PRODUCTS' && skus.has(row.data.sku))
          e.errors.push('SKU đã có trong Sakura nhưng chưa gắn mã Sapo này.');
        if (kind === 'ORDERS' && !ref) {
          const phone = String(raw.sourcePhone || '')
            .replace(/[\s().-]/g, '')
            .replace(/^(\+84|0084)/, '0');
          e.customerId = phones.get(phone) || null;
          if (e.customerId)
            e.warnings = e.warnings.filter((w) => w !== 'Chưa liên kết hồ sơ khách');
        }
        if (e.errors.length) e.action = 'ERROR';
        entries.push(e);
      }
    return entries;
  }
  async preview(actor: Principal, file: { buffer: Buffer; originalname: string } | undefined) {
    if (!file) throw new BadRequestException('Chưa chọn file Excel.');
    const source = await this.read(file.buffer, file.originalname);
    return this.db.$transaction(
      async (tx) => {
        const plan = await this.plan(tx, source);
        const batch = await tx.importBatch.create({
          data: {
            actorId: actor.id,
            kind: source.kind,
            fileName: file.originalname,
            rows: json(source),
            plan: json(plan),
            digest: digest({ source, plan }),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'import.previewed',
            entity: 'ImportBatch',
            entityId: batch.id,
            metadata: { format: source.format, kind: source.kind, ...counts(plan) },
          },
        });
        return this.view(batch, 1);
      },
      { isolationLevel: 'RepeatableRead', timeout: 60000 },
    );
  }
  view(b: any, page: number) {
    const source = b.rows as ExcelSource,
      plan = b.plan as Entry[];
    if (source?.format !== 'SAPO_EXCEL_V2')
      throw new BadRequestException('Lần nhập này không phải luồng Excel trực tiếp.');
    const records = new Map(
      collection(source).flatMap(([kind, rows]) =>
        rows.map((r) => [kind + ':' + r.externalId, r.data] as const),
      ),
    );
    const labels: Record<string, string> = {
      name: 'Tên',
      phone: 'Điện thoại',
      address: 'Địa chỉ',
      sku: 'SKU',
      unit: 'Đơn vị',
      price: 'Giá bán',
      category: 'Nhóm sản phẩm',
      number: 'Mã đơn',
      orderedAt: 'Ngày đặt hàng',
      sourceStatus: 'Trạng thái nguồn',
      sourceCreatedBy: 'Người tạo đơn nguồn',
      sourceClosedBy: 'Người chốt nguồn',
      sourceCustomerName: 'Tên khách nguồn',
      total: 'Tổng đơn',
      paidAmount: 'Đã thanh toán',
    };
    return {
      id: b.id,
      format: source.format,
      kind: b.kind,
      fileName: b.fileName,
      digest: b.digest,
      status: b.status,
      createdAt: b.createdAt,
      committedAt: b.committedAt,
      sheet: source.sheet,
      rowCount: source.rowCount,
      counts: counts(plan),
      plan: {
        items: plan.slice((page - 1) * 50, page * 50).map((p) => {
          const d = records.get(p.kind + ':' + p.externalId);
          return {
            ...p,
            data: Object.fromEntries(
              Object.keys(labels)
                .filter((k) => k in d)
                .map((k) => [labels[k], d[k] ?? null]),
            ),
            items: (d.items || []).slice(0, 20),
            itemCount: d.items?.length || 0,
          };
        }),
        page,
        pageSize: 50,
        total: plan.length,
      },
    };
  }
  async detail(id: string, page = 1) {
    const b = await this.db.importBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Không tìm thấy lần nhập.');
    return this.view(b, page);
  }
  async commit(actor: Principal, id: string, expected: string) {
    await this.db.$transaction(
      async (tx) => {
        // Serialize import confirmation so two requests cannot write one batch twice.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(736251903)`;
        const b = await tx.importBatch.findUnique({ where: { id } });
        if (!b) throw new NotFoundException('Không tìm thấy lần nhập.');
        const source = b.rows as unknown as ExcelSource;
        if (source?.format !== 'SAPO_EXCEL_V2')
          throw new BadRequestException('Không phải bản nhập Excel trực tiếp.');
        if (b.digest !== expected)
          throw new ConflictException('Bản xác nhận không khớp bản xem trước.');
        if (b.status === 'COMMITTED') return;
        if (Date.now() - b.createdAt.getTime() > 86400000)
          throw new ConflictException('Bản xem trước quá 24 giờ. Chọn file để kiểm tra lại.');
        const plan = await this.plan(tx, source);
        if (digest({ source, plan }) !== expected)
          throw new ConflictException('Dữ liệu đã thay đổi. Vui lòng xem trước lại.');
        if (plan.some((p) => p.action === 'ERROR'))
          throw new BadRequestException('Cần sửa hết lỗi trước khi nhập.');
        const targets = new Map(
          plan.map((p) => [p.kind + ':' + p.externalId, p.targetId || randomUUID()]),
        );
        const entries = new Map(plan.map((p) => [p.kind + ':' + p.externalId, p]));
        for (const [kind, rows] of collection(source)) {
          const pending = rows.filter(
            (r) => entries.get(kind + ':' + r.externalId)!.action === 'CREATE',
          );
          for (let offset = 0; offset < pending.length; offset += 100) {
            const chunk = pending.slice(offset, offset + 100);
            const data = chunk.map((row) => {
              const e = entries.get(kind + ':' + row.externalId)!,
                id = targets.get(kind + ':' + row.externalId)!;
              if (kind === 'CUSTOMERS') return { id, ...row.data, createdById: actor.id };
              if (kind === 'PRODUCTS')
                return {
                  id,
                  ...row.data,
                  productId: targets.get('PRODUCT_GROUP:' + row.productExternalId)!,
                };
              if (kind === 'ORDERS')
                return {
                  id,
                  ...row.data,
                  customerId: e.customerId,
                  linkMethod: e.customerId ? 'UNIQUE_NORMALIZED_PHONE' : 'UNLINKED',
                };
              return { id, ...row.data };
            });
            if (kind === 'CUSTOMERS') await tx.customer.createMany({ data });
            else if (kind === 'PRODUCT_GROUP') await tx.product.createMany({ data });
            else if (kind === 'PRODUCTS') await tx.productVariant.createMany({ data });
            else await tx.historicalOrder.createMany({ data });
            await tx.sapoReference.createMany({
              data: chunk.map((r) => ({
                kind,
                externalId: r.externalId,
                targetId: targets.get(kind + ':' + r.externalId)!,
                fingerprint: entries.get(kind + ':' + r.externalId)!.fingerprint,
              })),
            });
          }
        }
        await tx.importBatch.update({
          where: { id },
          data: { status: 'COMMITTED', committedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'import.committed',
            entity: 'ImportBatch',
            entityId: id,
            metadata: { format: source.format, kind: source.kind, ...counts(plan) },
          },
        });
      },
      { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 },
    );
    return this.detail(id);
  }
  async images(actor: Principal, id: string, download = false) {
    const b = await this.db.importBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Không tìm thấy lần nhập.');
    const source = b.rows as unknown as ExcelSource;
    if (
      source?.format !== 'SAPO_EXCEL_V2' ||
      source.kind !== 'PRODUCTS' ||
      b.status !== 'COMMITTED'
    )
      throw new BadRequestException('Nhập xong dữ liệu sản phẩm trước khi tải ảnh.');
    const { imagePlan } = require(resolve(__dirname, '../../../../scripts/import-sapo-images.cjs'));
    let links: any[];
    try {
      links = imagePlan(source);
    } catch {
      throw new BadRequestException(
        'Ảnh phải thuộc kho Sapo Sakura đã cấu hình. Hãy kiểm tra đường dẫn ảnh trong file.',
      );
    }
    const present = new Set(
      (
        await this.db.productImage.findMany({
          where: { sourceKey: { in: links.map((l) => l.sourceKey) } },
          select: { sourceKey: true },
        })
      ).map((i) => i.sourceKey),
    );
    const pending = links.filter((l) => !present.has(l.sourceKey));
    if (!download)
      return { total: links.length, done: present.size, remaining: pending.length, failures: [] };
    if (this.imageJobs.has(id))
      throw new ConflictException('Ảnh của lần nhập này đang được xử lý.');
    this.imageJobs.add(id);
    try {
      const refs = new Map(
        (
          await this.db.sapoReference.findMany({
            where: { kind: { in: ['PRODUCT_GROUP', 'PRODUCTS'] } },
          })
        ).map((r) => [r.kind + ':' + r.externalId, r.targetId]),
      );
      const failures: string[] = [];
      let created = 0;
      const cached = new Map<string, Awaited<ReturnType<typeof storeMedia>>>();
      for (const l of pending.slice(0, 10)) {
        try {
          const productId = refs.get('PRODUCT_GROUP:' + l.productExternalId),
            variantId = l.variantExternalId ? refs.get('PRODUCTS:' + l.variantExternalId) : null;
          if (!productId || (l.variantExternalId && !variantId))
            throw Error('Thiếu liên kết sản phẩm.');
          if (
            variantId &&
            !(await this.db.productVariant.findFirst({ where: { id: variantId, productId } }))
          )
            throw Error('Liên kết ảnh không khớp.');
          let stored = cached.get(l.sourceUrl);
          if (!stored) {
            const response = await fetch(l.sourceUrl, {
              redirect: 'error',
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok || !response.body) throw Error('Không tải được ảnh.');
            if (Number(response.headers.get('content-length')) > MAX_MEDIA_BYTES) {
              await response.body.cancel();
              throw Error('Ảnh quá lớn.');
            }
            const chunks: Buffer[] = [];
            let length = 0;
            for await (const part of response.body as any) {
              length += part.length;
              if (length > MAX_MEDIA_BYTES) throw Error('Ảnh quá lớn.');
              chunks.push(Buffer.from(part));
            }
            stored = await storeMedia(Buffer.concat(chunks));
            cached.set(l.sourceUrl, stored);
          }
          await this.db.$transaction(async (tx) => {
            const exists = await tx.productImage.findUnique({ where: { sourceKey: l.sourceKey } });
            if (exists) return;
            const image = await tx.productImage.create({
              data: {
                productId,
                variantId,
                title: l.title,
                sourceKey: l.sourceKey,
                sourceUrl: l.sourceUrl,
                ...stored!,
              },
            });
            await tx.auditLog.create({
              data: {
                actorId: actor.id,
                action: 'chat.image_added',
                entity: 'ProductImage',
                entityId: image.id,
                metadata: { source: 'SAPO', batchId: id },
              },
            });
          });
          created++;
        } catch {
          failures.push(l.title + ': chưa tải được, có thể thử lại.');
        }
      }
      return {
        total: links.length,
        done: present.size + created,
        remaining: pending.length - created,
        failures,
      };
    } finally {
      this.imageJobs.delete(id);
    }
  }
}
