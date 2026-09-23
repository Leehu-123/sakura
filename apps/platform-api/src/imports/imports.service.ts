import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, orderPredicate } from '../auth/policy';
import { Kind, SourceRow, mapCsv } from './format';
import { PreviewDto, ImportQuery } from './dto';
import { digest, planImport, Plan } from './planner';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const counts = (plan: Plan[]) => ({
  create: plan.filter((p) => p.action === 'CREATE').length,
  skip: plan.filter((p) => p.action === 'SKIP').length,
  errors: plan.filter((p) => p.action === 'ERROR').length,
});
@Injectable()
export class ImportsService {
  constructor(private readonly db: Database) {}
  async preview(actor: Principal, dto: PreviewDto) {
    const rows = mapCsv(dto.kind, dto.content, dto.mapping);
    return this.db.$transaction(
      async (tx) => {
        const plan = await planImport(tx, dto.kind, rows);
        const batch = await tx.importBatch.create({
          data: {
            actorId: actor.id,
            kind: dto.kind,
            fileName: dto.fileName,
            rows: json(rows),
            plan: json(plan),
            digest: digest(plan),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'import.previewed',
            entity: 'ImportBatch',
            entityId: batch.id,
            metadata: { kind: dto.kind, ...counts(plan) },
          },
        });
        return { ...batch, rows: undefined, counts: counts(plan) };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
  async list(query: ImportQuery) {
    const where = {};
    const pageSize = 20;
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.importBatch.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            kind: true,
            fileName: true,
            status: true,
            createdAt: true,
            committedAt: true,
            actor: { select: { displayName: true } },
          },
        }),
        total: await tx.importBatch.count({ where }),
        page: query.page,
        pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(id: string) {
    const b = await this.db.importBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Không tìm thấy lần nhập.');
    if ((b.rows as any)?.format === 'SAPO_EXCEL_V2') return { id: b.id, format: 'SAPO_EXCEL_V2' };
    return { ...b, rows: undefined, counts: counts(b.plan as unknown as Plan[]) };
  }
  async commit(actor: Principal, id: string, expectedDigest: string) {
    return this.db.$transaction(
      async (tx) => {
        const batch = await tx.importBatch.findUnique({ where: { id } });
        if (!batch) throw new NotFoundException('Không tìm thấy lần nhập.');
        if ((batch.rows as any)?.format === 'SAPO_EXCEL_V2')
          throw new BadRequestException('Dùng màn hình xác nhận Excel cho lần nhập này.');
        if (batch.digest !== expectedDigest)
          throw new ConflictException('Bản xác nhận không khớp bản xem trước.');
        if (batch.status === 'COMMITTED')
          return {
            id: batch.id,
            status: batch.status,
            counts: counts(batch.plan as unknown as Plan[]),
          };
        if (Date.now() - batch.createdAt.getTime() > 86400000)
          throw new ConflictException(
            'Bản xem trước đã quá 24 giờ. Vui lòng tải file và kiểm tra lại.',
          );
        const plan = await planImport(tx, batch.kind as Kind, batch.rows as unknown as SourceRow[]);
        if (digest(plan) !== batch.digest)
          throw new ConflictException(
            'Dữ liệu hoặc phân công đã thay đổi. Vui lòng tạo bản xem trước mới.',
          );
        if (plan.some((p) => p.action === 'ERROR'))
          throw new BadRequestException('Cần sửa hết lỗi trong file và xem trước lại.');
        const products = new Map<string, string>();
        for (const p of plan) {
          if (p.action !== 'CREATE') continue;
          const d = p.data;
          let targetId: string;
          if (batch.kind === 'CUSTOMERS') {
            const customer = await tx.customer.create({
              data: {
                name: d.name,
                phone: d.phone,
                address: d.address,
                status: 'RETURNING',
                createdById: actor.id,
                regionId: p.dependency.regionId || null,
                assignments: {
                  create: {
                    userId: p.dependency.ownerId,
                    assignedById: actor.id,
                    reason: 'Phân công ban đầu khi nhập Sapo',
                  },
                },
              },
            });
            targetId = customer.id;
          } else if (batch.kind === 'PRODUCTS') {
            let productId = products.get(d.productId) || p.dependency.productId;
            if (!productId) {
              const product = await tx.product.create({
                data: { name: d.productName, category: d.category },
              });
              productId = product.id;
              await tx.sapoReference.create({
                data: {
                  kind: 'PRODUCT_GROUP',
                  externalId: d.productId,
                  targetId: productId,
                  fingerprint: digest([d.productName, d.category]),
                },
              });
            }
            products.set(d.productId, productId);
            const variant = await tx.productVariant.create({
              data: { productId, sku: d.sku, name: d.variantName, unit: d.unit, price: d.price },
            });
            if (p.dependency.productId)
              await tx.product.update({
                where: { id: productId },
                data: { version: { increment: 1 } },
              });
            targetId = variant.id;
          } else {
            const order = await tx.historicalOrder.create({
              data: {
                externalId: d.externalId,
                number: d.number,
                customerId: p.dependency.customerId,
                sourceStatus: d.sourceStatus,
                sourcePaymentStatus: d.sourcePaymentStatus,
                sourceShippingStatus: d.sourceShippingStatus,
                sourceClosedBy: d.sourceClosedBy,
                orderedAt: new Date(d.orderedAt),
                recipientName: d.recipientName,
                recipientPhone: d.recipientPhone,
                shippingAddress: d.shippingAddress,
                subtotal: d.subtotal,
                discount: d.discount,
                shippingFee: d.shippingFee,
                total: d.total,
                paidAmount: d.paidAmount,
                items: json(p.items),
              },
            });
            targetId = order.id;
          }
          await tx.sapoReference.create({
            data: {
              kind: batch.kind,
              externalId: d.externalId,
              targetId,
              fingerprint: p.fingerprint,
            },
          });
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
            metadata: { kind: batch.kind, ...counts(plan) },
          },
        });
        return { id, status: 'COMMITTED', counts: counts(plan) };
      },
      { isolationLevel: 'Serializable', timeout: 30000, maxWait: 5000 },
    );
  }
  async historical(actor: Principal, q: ImportQuery) {
    const where: Prisma.HistoricalOrderWhereInput = {
      AND: [
        orderPredicate(actor),
        q.customerId ? { customerId: q.customerId } : {},
        q.link === 'UNLINKED'
          ? { customerId: null }
          : q.link === 'LINKED'
            ? { customerId: { not: null } }
            : {},
        q.search
          ? {
              OR: [
                { number: { contains: q.search, mode: 'insensitive' } },
                { externalId: { contains: q.search, mode: 'insensitive' } },
                { customer: { name: { contains: q.search, mode: 'insensitive' } } },
                { sourceCustomerName: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.historicalOrder.findMany({
          where,
          orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
          take: 20,
          skip: (q.page - 1) * 20,
          select: {
            id: true,
            externalId: true,
            number: true,
            customer: { select: { id: true, name: true } },
            sourceCustomerName: true,
            sourceCreatedBy: true,
            sourceChannel: true,
            linkMethod: true,
            sourceStatus: true,
            sourceClosedBy: true,
            total: true,
            orderedAt: true,
          },
        }),
        total: await tx.historicalOrder.count({ where }),
        page: q.page,
        pageSize: 20,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async historicalDetail(actor: Principal, id: string) {
    const order = await this.db.historicalOrder.findFirst({
      where: { AND: [{ id }, orderPredicate(actor)] },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn cũ trong phạm vi của bạn.');
    return order;
  }
}
