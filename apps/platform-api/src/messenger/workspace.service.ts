import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, orderPredicate } from '../auth/policy';
import { checkVersion } from '../common/version';
import { mediaPayload, storeMedia, storeMediaBytes } from '../common/media-store';
import { chatFile } from './attachment-format';
import { PageDto } from '../core/dto';
import { BlockDto, SupportDto, ReadDto, ImageDto, ToolbarDto, TaggedDateDto } from './dto';
import { chatScope, pageConfigs, settings } from './domain';
import { MessengerConnections } from './connection.service';
import { staffingLock } from './staffing';
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly db: Database,
    private readonly connections: MessengerConnections,
  ) {}
  private tx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
  }
  private async conversation(tx: Prisma.TransactionClient, actor: Principal, id: string) {
    const c = await tx.chatConversation.findFirst({ where: { AND: [{ id }, chatScope(actor)] } });
    if (!c) throw new NotFoundException('Không tìm thấy hội thoại trong phạm vi.');
    return c;
  }
  async toolbar() {
    return (
      (await this.db.chatToolbar.findUnique({ where: { id: 1 } })) || {
        id: 1,
        version: 0,
        days: 8,
        labels: [
          { name: 'VIP', color: '#f5a4bc' },
          { name: 'Tư vấn', color: '#d8b9ed' },
          { name: 'Quan tâm', color: '#a4cdf5' },
          { name: 'Đã chốt', color: '#a4dfbc' },
          { name: 'Gửi hàng', color: '#a4dfe9' },
          { name: 'Hoàn thành', color: '#f6dfa0' },
        ],
      }
    );
  }
  saveToolbar(actor: Principal, dto: ToolbarDto) {
    return this.tx(async (tx) => {
      const old = await tx.chatToolbar.findUnique({ where: { id: 1 } });
      checkVersion(old?.version || 0, dto.version);
      const labels = dto.labels.map((l) => ({ name: l.name.trim(), color: l.color }));
      if (labels.some((l) => !l.name) || new Set(labels.map((l) => l.name)).size !== labels.length)
        throw new BadRequestException('Tên nhãn không được trống hoặc trùng nhau.');
      const row = await tx.chatToolbar.upsert({
        where: { id: 1 },
        create: { id: 1, labels, days: dto.days },
        update: { labels, days: dto.days, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.toolbar_updated',
          entity: 'ChatToolbar',
          entityId: '1',
        },
      });
      return row;
    });
  }
  taggedDate(actor: Principal, id: string, dto: TaggedDateDto) {
    return this.tx(async (tx) => {
      const c = await this.conversation(tx, actor, id);
      checkVersion(c.version, dto.version);
      if (
        dto.date &&
        (Number.isNaN(Date.parse(dto.date)) ||
          new Date(dto.date).toISOString().slice(0, 10) !== dto.date)
      )
        throw new BadRequestException('Ngày không hợp lệ.');
      const result = await tx.chatConversation.update({
        where: { id },
        data: { taggedDate: dto.date || null, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.date_tagged',
          entity: 'ChatConversation',
          entityId: id,
          metadata: { date: dto.date },
        },
      });
      return result;
    });
  }
  async uploadAttachment(
    actor: Principal,
    id: string,
    file?: { buffer: Buffer; originalname: string },
  ) {
    await this.conversation(this.db, actor, id);
    const info = chatFile(file);
    const stored = await storeMediaBytes(file!.buffer, info.mime);
    return this.tx(async (tx) => {
      await this.conversation(tx, actor, id);
      const result = await tx.chatAttachment.create({
        data: { ...info, ...stored, conversationId: id, createdById: actor.id },
        select: { id: true, title: true, mime: true, kind: true, byteSize: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.attachment_uploaded',
          entity: 'ChatAttachment',
          entityId: result.id,
        },
      });
      return result;
    });
  }
  async attachment(actor: Principal, id: string, attachmentId: string) {
    await this.conversation(this.db, actor, id);
    const file = await this.db.chatAttachment.findFirst({
      where: {
        id: attachmentId,
        conversationId: id,
        OR: [{ createdById: actor.id }, { messages: { some: {} } }],
      },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp trong hội thoại.');
    const payload = await mediaPayload({ ...file, data: '' });
    return { title: file.title, mime: file.mime, data: payload.data, kind: file.kind };
  }
  async pages() {
    const source = await this.connections.runtime();
    return pageConfigs(source)
      .filter((p) => settings(p.pageId, source).receiving)
      .map((p) => ({ id: p.pageId, name: p.name, sending: settings(p.pageId, source).sending }));
  }
  async supporters(actor: Principal, id: string) {
    return this.tx(async (tx) => {
      const c = await this.conversation(tx, actor, id);
      return this.candidates(tx, c.customerId);
    });
  }
  private async candidates(tx: Prisma.TransactionClient, customerId: string | null) {
    const users = await tx.user.findMany({
      where: {
        status: 'ACTIVE',
        roleAssignments: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: { code: 'sales.chat.use' },
                  scope: { in: ['GLOBAL', 'ASSIGNED'] },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        displayName: true,
        ownedCustomers: {
          where: {
            customerId: customerId || '00000000-0000-0000-0000-000000000000',
            endedAt: null,
          },
          select: { id: true },
        },
        roleAssignments: {
          select: {
            role: {
              select: {
                permissions: {
                  where: { permission: { code: 'sales.chat.use' } },
                  select: { scope: true },
                },
              },
            },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });
    return users
      .filter((u) =>
        u.roleAssignments.some((a) =>
          a.role.permissions.some(
            (p) => p.scope === 'GLOBAL' || (p.scope === 'ASSIGNED' && u.ownedCustomers.length > 0),
          ),
        ),
      )
      .map((u) => ({ id: u.id, displayName: u.displayName }));
  }
  support(actor: Principal, id: string, dto: SupportDto) {
    return this.tx(async (tx) => {
      await staffingLock(tx);
      const c = await this.conversation(tx, actor, id);
      if (c.teamId)
        throw new BadRequestException(
          'Hội thoại theo ca: dùng Nhận xử lý hoặc Bàn giao trong khung Ca trực.',
        );
      checkVersion(c.version, dto.version);
      if (dto.userId && !(await this.candidates(tx, c.customerId)).some((u) => u.id === dto.userId))
        throw new BadRequestException(
          'Người hỗ trợ phải đang hoạt động và đã có quyền xem hội thoại.',
        );
      const result = await tx.chatConversation.update({
        where: { id },
        data: { supportUserId: dto.userId || null, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.support_assigned',
          entity: 'ChatConversation',
          entityId: id,
          metadata: { from: c.supportUserId, to: dto.userId || null },
        },
      });
      return result;
    });
  }
  block(actor: Principal, id: string, dto: BlockDto) {
    return this.tx(async (tx) => {
      const c = await this.conversation(tx, actor, id);
      checkVersion(c.version, dto.version);
      if (!dto.reason.trim()) throw new BadRequestException('Cần lý do chặn hoặc bỏ chặn.');
      const result = await tx.chatConversation.update({
        where: { id },
        data: { blocked: dto.blocked, blockReason: dto.reason, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: dto.blocked ? 'chat.blocked' : 'chat.unblocked',
          entity: 'ChatConversation',
          entityId: id,
          metadata: { reason: dto.reason },
        },
      });
      return result;
    });
  }
  read(actor: Principal, id: string, dto: ReadDto) {
    return this.tx(async (tx) => {
      const c = await this.conversation(tx, actor, id);
      if (!dto.unread) checkVersion(c.inboundSeq, dto.inboundSeq);
      return tx.chatRead.upsert({
        where: { conversationId_userId: { conversationId: id, userId: actor.id } },
        create: {
          conversationId: id,
          userId: actor.id,
          readSeq: dto.unread ? 0 : c.inboundSeq,
          unread: dto.unread,
        },
        update: { readSeq: dto.unread ? 0 : c.inboundSeq, unread: dto.unread },
      });
    });
  }
  async images(q: PageDto) {
    const where = {
      isActive: true,
      product: { isActive: true },
      OR: [{ variantId: null }, { variant: { isActive: true } }],
      ...(q.search
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: q.search, mode: 'insensitive' as const } },
                  { product: { name: { contains: q.search, mode: 'insensitive' as const } } },
                  { variant: { sku: { contains: q.search, mode: 'insensitive' as const } } },
                ],
              },
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.productImage.findMany({
          where,
          select: {
            id: true,
            title: true,
            mime: true,
            product: { select: { name: true } },
            variant: { select: { sku: true, name: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        total: await tx.productImage.count({ where }),
        page: q.page,
        pageSize: q.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async image(id: string) {
    const i = await this.db.productImage.findFirst({
      where: {
        id,
        isActive: true,
        product: { isActive: true },
        OR: [{ variantId: null }, { variant: { isActive: true } }],
      },
      select: { title: true, mime: true, data: true, storageKey: true },
    });
    if (!i) throw new NotFoundException();
    const payload = await mediaPayload(i);
    return { title: payload.title, mime: payload.mime, data: payload.data };
  }
  messageImage(actor: Principal, id: string, mid: string) {
    return this.tx(async (tx) => {
      await this.conversation(tx, actor, id);
      const m = await tx.chatMessage.findFirst({
        where: { id: mid, conversationId: id },
        include: { image: { select: { title: true, mime: true, data: true, storageKey: true } } },
      });
      if (!m?.image) throw new NotFoundException();
      const payload = await mediaPayload(m.image);
      return { title: payload.title, mime: payload.mime, data: payload.data };
    });
  }
  upload(actor: Principal, dto: ImageDto) {
    return this.tx(async (tx) => {
      const b = Buffer.from(dto.data, 'base64');
      if (
        b.length > 512000 ||
        b.toString('base64') !== dto.data ||
        !(dto.mime === 'image/png'
          ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : b[0] === 255 && b[1] === 216 && b[2] === 255)
      )
        throw new BadRequestException('Ảnh phải là PNG/JPEG hợp lệ, tối đa 500 KB.');
      const p = await tx.product.findFirst({ where: { id: dto.productId, isActive: true } });
      if (!p) throw new NotFoundException('Sản phẩm không hoạt động.');
      if (
        dto.variantId &&
        !(await tx.productVariant.findFirst({
          where: { id: dto.variantId, productId: p.id, isActive: true },
        }))
      )
        throw new BadRequestException('Biến thể không thuộc sản phẩm đang chọn.');
      const stored = await storeMedia(b);
      const i = await tx.productImage.create({
        data: { ...dto, ...stored, data: '' },
        select: { id: true, title: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.image_added',
          entity: 'ProductImage',
          entityId: i.id,
        },
      });
      return i;
    });
  }
  confirmation(actor: Principal, id: string, orderId: string, document?: 'INVOICE') {
    return this.tx(async (tx) => {
      const c = await this.conversation(tx, actor, id);
      return confirmation(tx, actor, c.customerId, orderId, undefined, document);
    });
  }
}
export async function confirmation(
  tx: Prisma.TransactionClient,
  actor: Principal,
  customerId: string | null,
  orderId: string,
  version?: number,
  document?: 'INVOICE',
) {
  const o = await tx.order.findFirst({
    where: {
      AND: [
        { id: orderId, customerId: customerId || '00000000-0000-0000-0000-000000000000' },
        orderPredicate(actor),
      ],
    },
    include: { items: { orderBy: { id: 'asc' } } },
  });
  if (!o) throw new NotFoundException('Đơn không thuộc khách hoặc ngoài phạm vi.');
  if (document ? !['CONFIRMED', 'COMPLETED'].includes(o.status) : o.status !== 'CONFIRMED')
    throw new BadRequestException('Chỉ gửi xác nhận cho đơn đang ở trạng thái đã chốt.');
  if (version !== undefined) checkVersion(o.version, version);
  const money = (v: Prisma.Decimal) => v.toNumber().toLocaleString('vi-VN') + 'đ';
  const text = [
    (document ? 'SAKURA · HÓA ĐƠN BÁN HÀNG SK-' : 'SAKURA · XÁC NHẬN ĐƠN SK-') + o.number,
    ...(document ? ['Chứng từ bán hàng nội bộ, không phải hóa đơn GTGT.'] : []),
    o.recipientName + ' · ' + o.recipientPhone,
    'Giao đến: ' + o.shippingAddress,
    ...o.items.map(
      (i) =>
        i.productName +
        ' / ' +
        i.variantName +
        ' [' +
        i.sku +
        '] × ' +
        i.quantity +
        ' ' +
        i.unit +
        ' · ' +
        money(i.lineTotal),
    ),
    'Tiền hàng: ' + money(o.subtotal),
    'Giảm giá: ' + money(o.discount),
    'Phí giao: ' + money(o.shippingFee),
    'Tổng cộng: ' + money(o.total),
    'Đã thanh toán: ' + money(o.paidAmount),
    'Còn thanh toán: ' + money(o.total.minus(o.paidAmount)),
    ...(o.note ? ['Ghi chú: ' + o.note] : []),
  ].join('\n');
  if (text.length > 2000)
    throw new BadRequestException(
      'Xác nhận vượt 2.000 ký tự. Hãy dùng nội dung ngắn trong ô soạn tin; chưa hỗ trợ gửi thẻ đơn dài.',
    );
  return {
    orderId: o.id,
    orderVersion: o.version,
    text,
    snapshot: JSON.parse(
      JSON.stringify({ ...o, documentKind: document || null }),
    ) as Prisma.InputJsonObject,
  };
}
