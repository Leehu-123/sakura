import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, customerPredicate, hasPermission, orderPredicate } from '../auth/policy';
import { checkVersion } from '../common/version';
import { mediaPayload } from '../common/media-store';
import { chatScope, events, inWindow, settings, suggestions, MessengerSource } from './domain';
import { MessengerConnections } from './connection.service';
import {
  InboxQuery,
  LinkDto,
  TagsDto,
  ReplyDto,
  TemplateDto,
  TemplateUpdateDto,
  ResolveDto,
} from './dto';
import { InteractionQuery } from './dto';
import { confirmation } from './workspace.service';
import { MessengerTransport } from './transport';
import { staffingLock, currentWorkShift } from './staffing';
import { MessengerProfiles } from './profiles';
const customer = { select: { id: true, name: true } };
@Injectable()
export class MessengerService {
  constructor(
    private readonly db: Database,
    private readonly transport: MessengerTransport,
    private readonly connections: MessengerConnections,
    private readonly profiles: MessengerProfiles,
  ) {}
  private tx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
  }
  private async conversation(tx: Prisma.TransactionClient, actor: Principal, id: string) {
    const c = await tx.chatConversation.findFirst({
      where: { AND: [{ id }, chatScope(actor)] },
      include: { customer, supportUser: { select: { id: true, displayName: true } } },
    });
    if (!c) throw new NotFoundException('Không tìm thấy hội thoại trong phạm vi của bạn.');
    return c;
  }
  async status() {
    const c = settings(undefined, await this.connections.runtime());
    return { receiving: c.receiving, sending: c.sending, pageId: c.receiving ? c.pageId : null };
  }
  async receive(body: unknown, source?: MessengerSource) {
    const incoming = events(body, source).sort((a, b) =>
      (a.pageId + ':' + a.psid).localeCompare(b.pageId + ':' + b.psid),
    );
    return this.db.$transaction(
      async (tx) => {
        let accepted = 0;
        await staffingLock(tx);
        for (const e of incoming) {
          const key = e.pageId + ':' + e.psid;
          // Serialize each Page/PSID while preserving transactional message-ID deduplication.
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
          const route = await tx.chatTeamPage.findUnique({ where: { pageId: e.pageId } });
          const c = await tx.chatConversation.upsert({
            where: { pageId_psid: { pageId: e.pageId, psid: e.psid } },
            create: { pageId: e.pageId, psid: e.psid, lastActivityAt: e.at, teamId: route?.teamId },
            update: {},
          });
          const result = await tx.chatMessage.createMany({
            data: [
              {
                conversationId: c.id,
                remoteKey: e.pageId + ':' + e.mid,
                direction: 'INBOUND',
                state: 'RECEIVED',
                text: e.text,
                attachmentTypes: e.types,
                sourceAt: e.at,
              },
            ],
            skipDuplicates: true,
          });
          if (!result.count) continue;
          accepted++;
          await tx.chatConversation.update({
            where: { id: c.id },
            data: {
              inboundSeq: { increment: 1 },
              ...(c.teamId && c.workState === 'DONE' && (!c.lastInboundAt || e.at > c.lastInboundAt)
                ? { workState: 'WAITING', version: { increment: 1 } }
                : {}),
            },
          });
          await tx.chatRead.updateMany({ where: { conversationId: c.id }, data: { unread: true } });
          await tx.chatConversation.updateMany({
            where: { id: c.id, OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: e.at } }] },
            data: { lastInboundAt: e.at },
          });
          await tx.chatConversation.updateMany({
            where: { id: c.id, lastActivityAt: { lt: e.at } },
            data: { lastActivityAt: e.at },
          });
        }
        return { accepted };
      },
      { timeout: 20000 },
    );
  }
  async list(actor: Principal, q: InboxQuery) {
    const where: Prisma.ChatConversationWhereInput = {
      AND: [
        chatScope(actor),
        q.pageId ? { pageId: q.pageId } : {},
        q.tag ? { tags: { has: q.tag } } : {},
        q.filter === 'BLOCKED' ? { blocked: true } : { blocked: false },
        q.filter === 'UNLINKED' ? { customerId: null } : {},
        q.filter === 'MINE' ? { supportUserId: actor.id } : {},
        q.filter === 'UNASSIGNED' ? { supportUserId: null } : {},
        q.filter === 'WAITING' ? { teamId: { not: null }, workState: 'WAITING' } : {},
        q.filter === 'UNREAD'
          ? {
              OR: [
                { reads: { some: { userId: actor.id, unread: true } } },
                { inboundSeq: { gt: 0 }, reads: { none: { userId: actor.id } } },
              ],
            }
          : {},
        q.filter === 'UNANSWERED'
          ? {
              lastInboundAt: { not: null },
              OR: [
                { lastSentAt: null },
                { lastInboundAt: { gt: this.db.chatConversation.fields.lastSentAt } },
              ],
            }
          : {},
        q.filter === 'HAS_ORDER'
          ? {
              customer: {
                orders: { some: { AND: [{ status: 'CONFIRMED' }, orderPredicate(actor)] } },
              },
            }
          : {},
        q.search
          ? {
              OR: [
                { customer: { name: { contains: q.search, mode: 'insensitive' } } },
                { facebookName: { contains: q.search, mode: 'insensitive' } },
                { psid: { contains: q.search } },
                { tags: { has: q.search } },
              ],
            }
          : {},
      ],
    };
    const result = await this.db.$transaction(
      async (tx) => ({
        items: await tx.chatConversation.findMany({
          where,
          include: {
            customer,
            supportUser: { select: { id: true, displayName: true } },
            reads: { where: { userId: actor.id }, select: { unread: true } },
          },
          orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        total: await tx.chatConversation.count({ where }),
        page: q.page,
        pageSize: q.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
    this.profiles.schedule(result.items);
    return result;
  }
  async notifications(actor: Principal) {
    const latest = await this.db.chatMessage.findFirst({
      where: {
        direction: 'INBOUND',
        imported: false,
        conversation: { AND: [chatScope(actor), { blocked: false }] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true },
    });
    return { latest, serverAt: new Date().toISOString() };
  }
  async detail(actor: Principal, id: string, q: InteractionQuery) {
    const source = await this.connections.runtime();
    return this.db.$transaction(
      async (tx) => {
        const c = await this.conversation(tx, actor, id);
        this.profiles.schedule([c]);
        const messageWhere: Prisma.ChatMessageWhereInput = {
          conversationId: id,
          ...(q.interaction === 'INBOUND' || q.interaction === 'OUTBOUND'
            ? { direction: q.interaction }
            : {}),
          ...(q.interaction === 'IMAGE'
            ? { OR: [{ imageId: { not: null } }, { attachmentTypes: { has: 'image' } }] }
            : {}),
          ...(q.interaction === 'ORDER' ? { orderId: { not: null } } : {}),
        };
        let messagePage = q.page;
        if (q.messageId) {
          const target = await tx.chatMessage.findFirst({
            where: { AND: [messageWhere, { id: q.messageId }] },
            select: { id: true, sourceAt: true },
          });
          if (!target)
            throw new NotFoundException('Không tìm thấy tin nhắn trong hội thoại và bộ lọc này.');
          const newer = await tx.chatMessage.count({
            where: {
              AND: [
                messageWhere,
                {
                  OR: [
                    { sourceAt: { gt: target.sourceAt } },
                    { sourceAt: target.sourceAt, id: { gt: target.id } },
                  ],
                },
              ],
            },
          });
          messagePage = Math.floor(newer / q.pageSize) + 1;
        }
        const items = await tx.chatMessage.findMany({
          where: messageWhere,
          orderBy: [{ sourceAt: 'desc' }, { id: 'desc' }],
          skip: (messagePage - 1) * q.pageSize,
          take: q.pageSize,
          include: { actor: { select: { displayName: true } }, shift: { select: { label: true } } },
        });
        const unresolved = await tx.chatMessage.count({
          where: { conversationId: id, state: { in: ['SENDING', 'UNKNOWN'] } },
        });
        let workAllowed = true;
        try {
          await currentWorkShift(tx, actor.id, c);
        } catch (e) {
          if (e instanceof ConflictException) workAllowed = false;
          else throw e;
        }
        return {
          ...c,
          canSend:
            workAllowed &&
            !c.blocked &&
            settings(c.pageId, source).sending &&
            inWindow(c.lastInboundAt) &&
            !unresolved,
          messages: {
            items: items.map((m) => ({
              ...m,
              state:
                m.state === 'SENDING' && Date.now() - m.createdAt.getTime() > 30000
                  ? 'UNKNOWN'
                  : m.state,
            })),
            total: await tx.chatMessage.count({ where: messageWhere }),
            page: messagePage,
            pageSize: q.pageSize,
          },
          suggestions: suggestions(
            items
              .filter((m) => m.direction === 'INBOUND')
              .map((m) => m.text)
              .join('\n'),
          ),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  link(actor: Principal, id: string, dto: LinkDto) {
    return this.tx(async (tx) => {
      const c = await this.conversation(tx, actor, id);
      checkVersion(c.version, dto.version);
      if (c.customerId)
        throw new ConflictException(
          'Hội thoại đã gắn khách. Không tự chuyển toàn bộ lịch sử sang hồ sơ khác.',
        );
      const target = await tx.customer.findFirst({
        where: { AND: [{ id: dto.customerId }, customerPredicate(actor)] },
      });
      if (!target) throw new NotFoundException('Không tìm thấy khách được phép liên kết.');
      const result = await tx.chatConversation.update({
        where: { id },
        data: { customerId: target.id, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.linked',
          entity: 'ChatConversation',
          entityId: id,
          metadata: { customerId: target.id },
        },
      });
      return result;
    });
  }
  tags(actor: Principal, id: string, dto: TagsDto) {
    return this.tx(async (tx) => {
      const c = await this.conversation(tx, actor, id);
      checkVersion(c.version, dto.version);
      const result = await tx.chatConversation.update({
        where: { id },
        data: { tags: dto.tags, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.tagged',
          entity: 'ChatConversation',
          entityId: id,
        },
      });
      return result;
    });
  }
  requestStatus(actor: Principal, id: string, requestKey: string) {
    return this.db.$transaction(
      async (tx) => {
        await this.conversation(tx, actor, id);
        const message = await tx.chatMessage.findFirst({
          where: { conversationId: id, actorId: actor.id, requestKey, direction: 'OUTBOUND' },
          select: { state: true, createdAt: true },
        });
        return {
          requestKey,
          state: !message
            ? 'NOT_RECORDED'
            : message.state === 'SENDING' && Date.now() - message.createdAt.getTime() > 30000
              ? 'UNKNOWN'
              : message.state,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async reply(actor: Principal, id: string, dto: ReplyDto) {
    if (
      Number(!!dto.text) +
        Number(!!dto.imageId) +
        Number(!!dto.attachmentId) +
        Number(!!dto.orderId) !==
        1 ||
      !!dto.orderId !== !!dto.orderVersion ||
      (!!dto.orderDocument && !dto.orderId)
    )
      throw new BadRequestException(
        'Chọn một loại nội dung để gửi: tin nhắn, ảnh, tệp hoặc xác nhận đơn.',
      );
    const source = await this.connections.runtime();
    const prepared = await this.tx(async (tx) => {
      await staffingLock(tx);
      const c = await this.conversation(tx, actor, id);
      const existing = await tx.chatMessage.findUnique({ where: { requestKey: dto.requestKey } });
      if (existing) {
        if (
          existing.conversationId !== id ||
          existing.actorId !== actor.id ||
          (existing.imageId || null) !== (dto.imageId || null) ||
          (existing.attachmentId || null) !== (dto.attachmentId || null) ||
          (existing.orderId || null) !== (dto.orderId || null) ||
          (existing.orderVersion || null) !== (dto.orderVersion || null) ||
          ((existing.snapshot as Prisma.JsonObject | null)?.documentKind || null) !==
            (dto.orderDocument || null) ||
          (!dto.imageId && !dto.attachmentId && !dto.orderId && existing.text !== dto.text)
        )
          throw new ConflictException('Yêu cầu gửi đã được dùng cho nội dung khác.');
        return { message: existing, c, send: false };
      }
      if (c.blocked) throw new BadRequestException('Hội thoại đang bị chặn trong Sakura.');
      const shiftId = await currentWorkShift(tx, actor.id, c);
      let image: { mime: string; data: string; title: string; kind?: string } | null = null;
      if (dto.attachmentId) {
        const file = await tx.chatAttachment.findFirst({
          where: { id: dto.attachmentId, conversationId: id, createdById: actor.id },
        });
        if (!file) throw new NotFoundException('Tệp không thuộc bạn và hội thoại này.');
        image = await mediaPayload({ ...file, data: '' });
      }
      if (dto.imageId) {
        if (!hasPermission(actor.grants, 'catalog.products.read', 'GLOBAL'))
          throw new NotFoundException('Không có quyền dùng thư viện ảnh.');
        const storedImage = await tx.productImage.findFirst({
          where: {
            id: dto.imageId,
            isActive: true,
            product: { isActive: true },
            OR: [{ variantId: null }, { variant: { isActive: true } }],
          },
          select: { mime: true, data: true, title: true, storageKey: true },
        });
        if (!storedImage) throw new NotFoundException('Ảnh không còn hoạt động.');
        image = await mediaPayload(storedImage);
      }
      const order = dto.orderId
        ? await confirmation(
            tx,
            actor,
            c.customerId,
            dto.orderId,
            dto.orderVersion,
            dto.orderDocument,
          )
        : null;
      if (!settings(c.pageId, source).sending)
        throw new ServiceUnavailableException('Chưa bật gửi Messenger cho Fanpage này.');
      if (!inWindow(c.lastInboundAt))
        throw new BadRequestException('Đã hết thời gian trả lời tiêu chuẩn. Chờ khách nhắn lại.');
      if (
        await tx.chatMessage.count({
          where: { conversationId: id, state: { in: ['SENDING', 'UNKNOWN'] } },
        })
      )
        throw new ConflictException(
          'Có tin chưa rõ kết quả. Cần đối chiếu trên Fanpage trước khi gửi tiếp.',
        );
      const message = await tx.chatMessage.create({
        data: {
          conversationId: id,
          actorId: actor.id,
          requestKey: dto.requestKey,
          shiftId,
          direction: 'OUTBOUND',
          state: 'SENDING',
          text: order?.text || image?.title || dto.text!,
          imageId: dto.imageId,
          attachmentId: dto.attachmentId,
          attachmentTypes: dto.attachmentId ? [image!.kind || 'file'] : [],
          orderId: dto.orderId,
          orderVersion: dto.orderVersion,
          snapshot: order?.snapshot,
          sourceAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.send_requested',
          entity: 'ChatMessage',
          entityId: message.id,
        },
      });
      return { message, c, send: true, image };
    });
    if (!prepared.send) return prepared.message;
    // Claim is durable before I/O. Never retry an uncertain delivery automatically.
    const result = await this.transport.send(
      prepared.c.pageId,
      prepared.c.psid,
      prepared.message.text,
      prepared.image || undefined,
    );
    return this.db.$transaction(async (tx) => {
      const message = await tx.chatMessage.update({
        where: { id: prepared.message.id },
        data: {
          state: result.state,
          remoteKey: result.mid ? prepared.c.pageId + ':' + result.mid : null,
        },
      });
      if (result.state === 'SENT')
        await tx.chatConversation.updateMany({
          where: {
            id,
            OR: [{ lastSentAt: null }, { lastSentAt: { lt: prepared.message.sourceAt } }],
          },
          data: { lastSentAt: prepared.message.sourceAt },
        });
      const at = new Date();
      await tx.chatConversation.updateMany({
        where: { id, lastActivityAt: { lt: at } },
        data: { lastActivityAt: at },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.send_finished',
          entity: 'ChatMessage',
          entityId: message.id,
          metadata: { state: result.state },
        },
      });
      return message;
    });
  }
  resolve(actor: Principal, id: string, messageId: string, dto: ResolveDto) {
    return this.tx(async (tx) => {
      await this.conversation(tx, actor, id);
      const m = await tx.chatMessage.findFirst({
        where: { id: messageId, conversationId: id, direction: 'OUTBOUND' },
      });
      if (!m) throw new NotFoundException();
      if (!(
        m.state === 'UNKNOWN' ||
        (m.state === 'SENDING' && Date.now() - m.createdAt.getTime() > 30000)
      ))
        throw new ConflictException('Tin này chưa cần đối chiếu hoặc vẫn đang gửi.');
      const result = await tx.chatMessage.update({
        where: { id: m.id },
        data: { state: dto.state },
      });
      if (dto.state === 'SENT')
        await tx.chatConversation.updateMany({
          where: { id, OR: [{ lastSentAt: null }, { lastSentAt: { lt: m.sourceAt } }] },
          data: { lastSentAt: m.sourceAt },
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.delivery_resolved',
          entity: 'ChatMessage',
          entityId: m.id,
          metadata: { state: dto.state, reason: dto.reason },
        },
      });
      return result;
    });
  }
  templates(actor: Principal) {
    return this.db.chatTemplate.findMany({
      where: hasPermission(actor.grants, 'core.messenger.manage', 'GLOBAL')
        ? {}
        : { isActive: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  }
  createTemplate(actor: Principal, dto: TemplateDto) {
    return this.tx(async (tx) => {
      const result = await tx.chatTemplate.create({ data: dto });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.template_created',
          entity: 'ChatTemplate',
          entityId: result.id,
        },
      });
      return result;
    });
  }
  updateTemplate(actor: Principal, id: string, dto: TemplateUpdateDto) {
    return this.tx(async (tx) => {
      const old = await tx.chatTemplate.findUnique({ where: { id } });
      if (!old) throw new NotFoundException();
      checkVersion(old.version, dto.version);
      const result = await tx.chatTemplate.update({
        where: { id },
        data: {
          title: dto.title,
          text: dto.text,
          isActive: dto.isActive,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'chat.template_updated',
          entity: 'ChatTemplate',
          entityId: id,
        },
      });
      return result;
    });
  }
}
