import { createHash } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, customerPredicate, orderPredicate, hasPermission } from '../auth/policy';
import {
  CustomerDto,
  CustomerUpdateDto,
  CustomerQuery,
  HandoffDto,
  CareDto,
  CreateOrderDto,
  OrderQuery,
  OrderStatusDto,
  PaymentDto,
  ShippingDto,
} from './dto';
import { normalizePhone, orderTotals, checkTransition } from './domain';
import { checkVersion } from '../common/version';
import { chatScope } from '../messenger/domain';
const person = { id: true, displayName: true };
const customerInclude = {
  region: true,
  assignments: { where: { endedAt: null }, include: { user: { select: person } } },
} satisfies Prisma.CustomerInclude;
const orderInclude = {
  customer: { select: { id: true, name: true } },
  createdBy: { select: person },
  closedBy: { select: person },
} satisfies Prisma.OrderInclude;
@Injectable()
export class SalesService {
  constructor(private readonly db: Database) {}
  private transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
  }
  private async customer(
    tx: Prisma.TransactionClient,
    actor: Principal,
    id: string,
    permission: string,
  ) {
    const customer = await tx.customer.findFirst({
      where: { AND: [{ id }, customerPredicate(actor, permission)] },
      include: customerInclude,
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách trong phạm vi của bạn.');
    return customer;
  }
  private async order(
    tx: Prisma.TransactionClient,
    actor: Principal,
    id: string,
    permission: string,
  ) {
    const order = await tx.order.findFirst({
      where: { AND: [{ id }, orderPredicate(actor, permission)] },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn trong phạm vi của bạn.');
    return order;
  }
  async customers(actor: Principal, query: CustomerQuery) {
    const phone = query.search.replace(/[^\d]/g, '');
    const where: Prisma.CustomerWhereInput = {
      AND: [
        customerPredicate(actor),
        {
          status: query.status,
          ...(query.search
            ? {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  ...(phone
                    ? [
                        {
                          phone: {
                            contains: phone.startsWith('84') ? '0' + phone.slice(2) : phone,
                          },
                        },
                      ]
                    : []),
                ],
              }
            : {}),
        },
      ],
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.customer.findMany({
          where,
          include: customerInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.customer.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async customerDetail(actor: Principal, id: string) {
    return this.transaction(async (tx) => {
      const customer = await this.customer(tx, actor, id, 'sales.customers.read');
      const [activities, history] = await Promise.all([
        tx.careActivity.findMany({
          where: { customerId: id },
          include: { author: { select: person } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 100,
        }),
        tx.customerAssignment.findMany({
          where: { customerId: id },
          include: { user: { select: person }, assignedBy: { select: person } },
          orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
          take: 100,
        }),
      ]);
      return { ...customer, activities, assignmentHistory: history };
    });
  }
  async createCustomer(actor: Principal, dto: CustomerDto) {
    const phone = normalizePhone(dto.phone);
    try {
      return await this.transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            ...dto,
            phone,
            createdById: actor.id,
            assignments: {
              create: { userId: actor.id, assignedById: actor.id, reason: 'Tạo khách mới' },
            },
          },
          include: customerInclude,
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'customer.created',
            entity: 'Customer',
            entityId: customer.id,
          },
        });
        return customer;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(
          'Số điện thoại đã tồn tại. Liên hệ Sale tổng để kiểm tra phân công.',
        );
      throw error;
    }
  }
  async updateCustomer(actor: Principal, id: string, dto: CustomerUpdateDto) {
    const phone = normalizePhone(dto.phone);
    return this.transaction(async (tx) => {
      const old = await this.customer(tx, actor, id, 'sales.customers.manage');
      checkVersion(old.version, dto.version);
      const { version, ...data } = dto;
      const updated = await tx.customer.update({
        where: { id, version },
        data: { ...data, phone, version: { increment: 1 } },
        include: customerInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'customer.updated',
          entity: 'Customer',
          entityId: id,
          metadata: {
            before: { name: old.name, phone: old.phone, address: old.address, status: old.status },
            after: { ...data, phone },
          },
        },
      });
      return updated;
    });
  }
  async assignees() {
    const candidates = await this.db.user.findMany({
      where: {
        status: 'ACTIVE',
        roleAssignments: {
          some: {
            role: { permissions: { some: { permission: { code: 'sales.customers.read' } } } },
          },
        },
      },
      select: {
        ...person,
        roleAssignments: {
          select: { role: { select: { permissions: { include: { permission: true } } } } },
        },
      },
      orderBy: { displayName: 'asc' },
    });
    return candidates
      .filter((u) => {
        const grants = u.roleAssignments.flatMap((a) =>
          a.role.permissions.map((p) => ({ permission: p.permission.code, scope: p.scope })),
        );
        return (
          hasPermission(grants, 'sales.customers.read', 'ASSIGNED') &&
          hasPermission(grants, 'sales.customers.manage', 'ASSIGNED')
        );
      })
      .map((u) => ({ id: u.id, displayName: u.displayName }));
  }
  async regions() {
    return this.db.region.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }
  async handoff(actor: Principal, id: string, dto: HandoffDto) {
    return this.transaction(async (tx) => {
      const old = await this.customer(tx, actor, id, 'sales.customers.handoff');
      checkVersion(old.version, dto.version);
      const target = await tx.user.findUnique({
        where: { id: dto.userId },
        include: {
          roleAssignments: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      });
      const grants =
        target?.roleAssignments.flatMap((a) =>
          a.role.permissions.map((p) => ({ permission: p.permission.code, scope: p.scope })),
        ) || [];
      if (
        !target ||
        target.status !== 'ACTIVE' ||
        !hasPermission(grants, 'sales.customers.read', 'ASSIGNED') ||
        !hasPermission(grants, 'sales.customers.manage', 'ASSIGNED')
      )
        throw new BadRequestException(
          'Người nhận cần là tài khoản đang hoạt động, có quyền xem và chăm sóc khách.',
        );
      if (old.assignments.some((a) => a.userId === target.id))
        throw new BadRequestException('Khách đã được giao cho người này.');
      const now = new Date();
      await tx.customerAssignment.updateMany({
        where: { customerId: id, endedAt: null },
        data: { endedAt: now },
      });
      await tx.customerAssignment.create({
        data: {
          customerId: id,
          userId: target.id,
          assignedById: actor.id,
          reason: dto.reason,
          startedAt: now,
        },
      });
      const updated = await tx.customer.update({
        where: { id, version: dto.version },
        data: { version: { increment: 1 } },
        include: customerInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'customer.handoff',
          entity: 'Customer',
          entityId: id,
          metadata: {
            fromUserId: old.assignments[0]?.userId || null,
            toUserId: target.id,
            reason: dto.reason,
          },
        },
      });
      return updated;
    });
  }
  async care(actor: Principal, id: string, dto: CareDto) {
    return this.transaction(async (tx) => {
      const customer = await this.customer(tx, actor, id, 'sales.customers.manage');
      checkVersion(customer.version, dto.version);
      await tx.customer.update({
        where: { id, version: dto.version },
        data: { version: { increment: 1 } },
      });
      const activity = await tx.careActivity.create({
        data: { customerId: id, authorId: actor.id, note: dto.note },
        include: { author: { select: person } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'customer.care_added',
          entity: 'Customer',
          entityId: id,
        },
      });
      return activity;
    });
  }
  async orders(actor: Principal, query: OrderQuery) {
    const number = Number(query.search.replace(/^SK-/i, ''));
    const where: Prisma.OrderWhereInput = {
      AND: [
        orderPredicate(actor),
        {
          customerId: query.customerId,
          status: query.status,
          ...(query.search
            ? {
                OR: [
                  { customer: { name: { contains: query.search, mode: 'insensitive' } } },
                  ...(Number.isSafeInteger(number) && number > 0 && number < 2147483647
                    ? [{ number }]
                    : []),
                ],
              }
            : {}),
        },
      ],
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.order.findMany({
          where,
          include: orderInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.order.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async orderDetail(actor: Principal, id: string) {
    return this.transaction(async (tx) => {
      const order = await this.order(tx, actor, id, 'sales.orders.read');
      const [items, history] = await Promise.all([
        tx.orderItem.findMany({ where: { orderId: id }, orderBy: { id: 'asc' } }),
        tx.orderHistory.findMany({
          where: { orderId: id },
          include: { actor: { select: person } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 100,
        }),
      ]);
      return { ...order, items, history };
    });
  }
  async createOrder(actor: Principal, dto: CreateOrderDto) {
    if (new Set(dto.items.map((i) => i.variantId)).size !== dto.items.length)
      throw new BadRequestException('Mỗi biến thể chỉ được xuất hiện một lần trong đơn.');
    return this.transaction(async (tx) => {
      const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
      const existing = await tx.order.findUnique({ where: { requestKey: dto.requestKey } });
      if (existing) {
        if (existing.createdById !== actor.id || existing.requestHash !== requestHash)
          throw new ConflictException('Yêu cầu tạo đơn không khớp. Hãy tải lại biểu mẫu.');
        const allowed = await this.order(tx, actor, existing.id, 'sales.orders.manage');
        return {
          ...allowed,
          items: await tx.orderItem.findMany({ where: { orderId: existing.id } }),
        };
      }
      if (dto.conversationId) {
        const c = await tx.chatConversation.findFirst({
          where: {
            AND: [
              { id: dto.conversationId, customerId: dto.customerId, blocked: false },
              chatScope(actor),
            ],
          },
        });
        if (!c)
          throw new NotFoundException('Hội thoại chưa gắn đúng khách, bị chặn hoặc ngoài phạm vi.');
      }
      // Scope uses the order-management grant even if customer-management scope differs.
      const customer = await this.customer(tx, actor, dto.customerId, 'sales.orders.manage');
      checkVersion(customer.version, dto.customerVersion);
      if (!customer.phone)
        throw new BadRequestException('Hãy bổ sung số điện thoại khách trước khi lập đơn.');
      if (!customer.address.trim())
        throw new BadRequestException('Hãy bổ sung địa chỉ khách trước khi lập đơn.');
      const variants = await tx.productVariant.findMany({
        where: {
          id: { in: dto.items.map((i) => i.variantId) },
          isActive: true,
          product: { isActive: true },
        },
        include: { product: true },
      });
      if (variants.length !== dto.items.length)
        throw new BadRequestException('Có sản phẩm đã ngừng bán hoặc không tồn tại.');
      const lines = dto.items.map((item) => {
        const v = variants.find((v) => v.id === item.variantId)!;
        if (!v.price.eq(item.expectedPrice))
          throw new ConflictException(
            'Giá sản phẩm vừa thay đổi. Hãy tải lại bảng giá trước khi tạo đơn.',
          );
        return {
          variantId: v.id,
          productName: v.product.name,
          variantName: v.name,
          sku: v.sku,
          unit: v.unit,
          unitPrice: v.price,
          quantity: item.quantity,
          lineTotal: v.price.mul(item.quantity),
        };
      });
      const totals = orderTotals(
        lines.map((l) => ({ price: l.unitPrice, quantity: l.quantity })),
        dto.discount,
        dto.shippingFee,
      );
      const order = await tx.order.create({
        data: {
          requestKey: dto.requestKey,
          requestHash,
          ...(dto.confirm
            ? { status: 'CONFIRMED', closedByUserId: actor.id, closedAt: new Date() }
            : {}),
          customerId: customer.id,
          createdById: actor.id,
          recipientName: customer.name,
          recipientPhone: customer.phone,
          shippingAddress: customer.address,
          note: dto.note,
          ...totals,
          items: { create: lines },
          history: {
            create: [
              {
                actorId: actor.id,
                action: 'created',
                note: dto.conversationId ? 'Tạo đơn từ hội thoại' : 'Tạo đơn nháp',
              },
              ...(dto.confirm
                ? [
                    {
                      actorId: actor.id,
                      action: 'status_changed',
                      note: 'Đã chốt với khách khi tạo đơn',
                    },
                  ]
                : []),
            ],
          },
        },
        include: { ...orderInclude, items: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'order.created',
          entity: 'Order',
          entityId: order.id,
          metadata: { conversationId: dto.conversationId || null, confirmed: dto.confirm || false },
        },
      });
      return order;
    });
  }
  async changeOrderStatus(actor: Principal, id: string, dto: OrderStatusDto) {
    return this.transaction(async (tx) => {
      const old = await this.order(tx, actor, id, 'sales.orders.manage');
      checkVersion(old.version, dto.version);
      checkTransition(old.status, dto.status, old.paidAmount, dto.reason);
      if (dto.status === 'CANCELLED')
        await tx.deliverySlip.updateMany({
          where: { orderId: id, voidedAt: null },
          data: { voidedAt: new Date() },
        });
      const updated = await tx.order.update({
        where: { id, version: dto.version },
        data: {
          status: dto.status,
          version: { increment: 1 },
          ...(dto.status === 'CONFIRMED' ? { closedByUserId: actor.id, closedAt: new Date() } : {}),
          history: {
            create: {
              actorId: actor.id,
              action: 'status_changed',
              note: old.status + ' → ' + dto.status + (dto.reason ? ' · ' + dto.reason : ''),
            },
          },
        },
        include: orderInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'order.status_changed',
          entity: 'Order',
          entityId: id,
          metadata: { from: old.status, to: dto.status, reason: dto.reason },
        },
      });
      return updated;
    });
  }
  async payment(actor: Principal, id: string, dto: PaymentDto) {
    return this.transaction(async (tx) => {
      const old = await this.order(tx, actor, id, 'sales.orders.manage');
      checkVersion(old.version, dto.version);
      if (!['CONFIRMED', 'COMPLETED'].includes(old.status))
        throw new BadRequestException('Chỉ ghi nhận tiền cho đơn đã chốt.');
      const paid = new Prisma.Decimal(dto.paidAmount);
      if (paid.lt(old.paidAmount))
        throw new BadRequestException(
          'Không giảm số tiền đã thu; chức năng hoàn/điều chỉnh tiền chưa được bật.',
        );
      if (paid.gt(old.total))
        throw new BadRequestException('Số tiền đã thu không được vượt quá tổng đơn.');
      const paymentStatus = paid.eq(old.total) ? 'PAID' : paid.eq(0) ? 'UNPAID' : 'PARTIAL';
      const updated = await tx.order.update({
        where: { id, version: dto.version },
        data: {
          paidAmount: paid,
          paymentStatus,
          version: { increment: 1 },
          history: {
            create: {
              actorId: actor.id,
              action: 'payment_recorded',
              note: 'Đã thu ' + paid.toFixed(0) + ' đ · ' + dto.note,
            },
          },
        },
        include: orderInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'order.payment_recorded',
          entity: 'Order',
          entityId: id,
          metadata: { before: old.paidAmount.toString(), after: paid.toString(), note: dto.note },
        },
      });
      return updated;
    });
  }
  shipping(actor: Principal, id: string, dto: ShippingDto) {
    return this.transaction(async (tx) => {
      const old = await this.order(tx, actor, id, 'sales.shipments.manage');
      checkVersion(old.version, dto.version);
      if (!['CONFIRMED', 'COMPLETED'].includes(old.status))
        throw new BadRequestException('Chỉ cập nhật vận chuyển cho đơn đã chốt hoặc hoàn tất.');
      const data = {
        carrierName: dto.carrierName.trim(),
        trackingCode: dto.trackingCode.trim(),
        shippingStatus: dto.shippingStatus,
      };
      if (data.shippingStatus !== 'NOT_CREATED' && (!data.carrierName || !data.trackingCode))
        throw new BadRequestException('Bổ sung đối tác và mã vận đơn.');
      const updated = await tx.order.update({
        where: { id },
        data: {
          ...data,
          version: { increment: 1 },
          history: {
            create: {
              actorId: actor.id,
              action: 'shipping_updated',
              note:
                'Cập nhật vận chuyển thủ công: ' +
                data.carrierName +
                ' · ' +
                data.trackingCode +
                ' · ' +
                data.shippingStatus,
            },
          },
        },
        include: orderInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'order.shipping_updated',
          entity: 'Order',
          entityId: id,
          metadata: {
            before: {
              carrierName: old.carrierName,
              trackingCode: old.trackingCode,
              shippingStatus: old.shippingStatus,
            },
            after: data,
          },
        },
      });
      return updated;
    });
  }
  deliverySlip(actor: Principal, id: string, version?: number) {
    return this.transaction(async (tx) => {
      const order = await this.order(
        tx,
        actor,
        id,
        version === undefined ? 'sales.orders.read' : 'sales.shipments.manage',
      );
      const existing = await tx.deliverySlip.findUnique({ where: { orderId: id } });
      if (version === undefined) {
        if (!existing) throw new NotFoundException('Đơn chưa có phiếu giao.');
        return {
          ...existing,
          currentOrderStatus: order.status,
          currentOrderVersion: order.version,
        };
      }
      if (!['CONFIRMED', 'COMPLETED'].includes(order.status))
        throw new BadRequestException('Chỉ tạo phiếu cho đơn đã chốt.');
      checkVersion(order.version, version);
      if (existing) {
        const snapshot = existing.snapshot as Prisma.JsonObject;
        if (snapshot.version === order.version || existing.voidedAt)
          return {
            ...existing,
            currentOrderStatus: order.status,
            currentOrderVersion: order.version,
          };
        const items = await tx.orderItem.findMany({
          where: { orderId: id },
          orderBy: { id: 'asc' },
        });
        const updated = await tx.deliverySlip.update({
          where: { id: existing.id },
          data: {
            revision: { increment: 1 },
            snapshot: JSON.parse(JSON.stringify({ ...order, items })),
            previousSnapshots: [
              ...(Array.isArray(existing.previousSnapshots) ? existing.previousSnapshots : []),
              {
                revision: existing.revision,
                snapshot: existing.snapshot,
                archivedAt: new Date().toISOString(),
              },
            ] as Prisma.InputJsonArray,
          },
        });
        await tx.orderHistory.create({
          data: {
            orderId: id,
            actorId: actor.id,
            action: 'delivery_slip_updated',
            note: 'Cập nhật phiếu giao nội bộ, lần ' + updated.revision,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'order.delivery_slip_updated',
            entity: 'DeliverySlip',
            entityId: updated.id,
            metadata: { revision: updated.revision },
          },
        });
        return { ...updated, currentOrderStatus: order.status, currentOrderVersion: order.version };
      }
      if (order.status !== 'CONFIRMED')
        throw new BadRequestException('Đơn đã hoàn tất, không tạo phiếu mới.');
      const items = await tx.orderItem.findMany({ where: { orderId: id }, orderBy: { id: 'asc' } });
      const slip = await tx.deliverySlip.create({
        data: {
          orderId: id,
          createdById: actor.id,
          snapshot: JSON.parse(JSON.stringify({ ...order, items })),
        },
      });
      await tx.orderHistory.create({
        data: {
          orderId: id,
          actorId: actor.id,
          action: 'delivery_slip_created',
          note: 'Tạo phiếu giao nội bộ ' + slip.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'order.delivery_slip_created',
          entity: 'DeliverySlip',
          entityId: slip.id,
        },
      });
      return { ...slip, currentOrderStatus: order.status, currentOrderVersion: order.version };
    });
  }
}
