import {
  Injectable,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { IsInt, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, hasPermission, customerPredicate } from '../auth/policy';
import { CurrentUser, RequirePermission } from '../auth/access';
import { CustomerDto } from '../sales/dto';
import { PageDto } from '../core/dto';
import { normalizePhone } from '../sales/domain';
import { checkVersion } from '../common/version';
import { mediaPayload } from '../common/media-store';
import { chatScope } from './domain';
import { extractContact, addressCandidates } from './contact-extraction';
export class ChatCustomerDto extends CustomerDto {
  @IsInt() @Min(1) conversationVersion!: number;
}
export class AddressQuery {
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
}
@Injectable()
export class CustomerWorkspace {
  constructor(private readonly db: Database) {}
  private async conversation(db: Prisma.TransactionClient, actor: Principal, id: string) {
    const c = await db.chatConversation.findFirst({ where: { AND: [{ id }, chatScope(actor)] } });
    if (!c) throw new NotFoundException('Không tìm thấy hội thoại trong phạm vi.');
    return c;
  }
  async suggestions(actor: Principal, id: string, address?: string) {
    return this.db.$transaction(
      async (tx) => {
        const c = await this.conversation(tx, actor, id);
        const messages = await tx.chatMessage.findMany({
          where: { conversationId: id, direction: 'INBOUND' },
          orderBy: [{ sourceAt: 'desc' }, { id: 'desc' }],
          take: 100,
          select: { text: true },
        });
        const found = extractContact(
          messages.map((m) => m.text),
          c.facebookName,
        );
        const matches =
          hasPermission(actor.grants, 'sales.customers.read', 'ASSIGNED') && found.phones.length
            ? await tx.customer.findMany({
                where: { AND: [customerPredicate(actor), { phone: { in: found.phones } }] },
                select: { id: true, name: true, phone: true },
                take: 5,
              })
            : [];
        return {
          ...found,
          matches,
          addressSuggestion: addressCandidates(address ?? found.addresses[0] ?? ''),
          scanned: messages.length,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async createCustomer(actor: Principal, id: string, dto: ChatCustomerDto) {
    if (
      !hasPermission(actor.grants, 'sales.customers.manage', 'ASSIGNED') ||
      !hasPermission(actor.grants, 'sales.customers.read', 'ASSIGNED')
    )
      throw new ForbiddenException('Cần quyền xem và tạo khách hàng.');
    const phone = normalizePhone(dto.phone);
    try {
      return await this.db.$transaction(
        async (tx) => {
          const c = await this.conversation(tx, actor, id);
          checkVersion(c.version, dto.conversationVersion);
          if (c.customerId)
            throw new ConflictException(
              'Hội thoại đã có hồ sơ khách. Tải lại để sửa hồ sơ hiện tại.',
            );
          const customer = await tx.customer.create({
            data: {
              name: dto.name,
              phone,
              address: dto.address,
              status: dto.status,
              regionId: dto.regionId,
              createdById: actor.id,
              assignments: {
                create: {
                  userId: actor.id,
                  assignedById: actor.id,
                  reason: 'Tạo hồ sơ từ hội thoại',
                },
              },
            },
          });
          await tx.chatConversation.update({
            where: { id },
            data: { customerId: customer.id, version: { increment: 1 } },
          });
          await tx.auditLog.createMany({
            data: [
              {
                actorId: actor.id,
                action: 'customer.created',
                entity: 'Customer',
                entityId: customer.id,
              },
              {
                actorId: actor.id,
                action: 'chat.linked',
                entity: 'ChatConversation',
                entityId: id,
                metadata: { customerId: customer.id },
              },
            ],
          });
          return { id: customer.id };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException(
          'Số điện thoại đã có hồ sơ. Tìm và gắn đúng khách; nếu không có quyền xem, liên hệ quản lý.',
        );
      throw e;
    }
  }
  async media(actor: Principal, id: string, q: PageDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.conversation(tx, actor, id);
        const where: Prisma.ChatMessageWhereInput = {
          conversationId: id,
          direction: 'OUTBOUND',
          state: 'SENT',
          OR: [
            { imageId: { not: null } },
            { attachmentId: { not: null } },
            { attachmentTypes: { hasSome: ['image', 'video', 'file'] } },
          ],
        };
        const items = await tx.chatMessage.findMany({
          where,
          orderBy: [{ sourceAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          select: {
            id: true,
            text: true,
            sourceAt: true,
            imageId: true,
            attachmentId: true,
            attachmentTypes: true,
            actor: { select: { displayName: true } },
          },
        });
        return {
          items,
          total: await tx.chatMessage.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async mediaContent(actor: Principal, id: string, messageId: string) {
    await this.conversation(this.db, actor, id);
    const m = await this.db.chatMessage.findFirst({
      where: { id: messageId, conversationId: id, direction: 'OUTBOUND', state: 'SENT' },
      include: { image: true, attachment: true },
    });
    if (!m || (!m.image && !m.attachment))
      throw new NotFoundException('Tệp cũ chưa có bản lưu trong Sakura.');
    const file = m.image || m.attachment!;
    const payload = await mediaPayload({ ...file, data: m.image?.data || '' });
    return { title: file.title, mime: file.mime, data: payload.data };
  }
}
@Controller('messenger/conversations/:id')
@RequirePermission('sales.chat.use', 'ASSIGNED')
export class CustomerWorkspaceController {
  constructor(private readonly service: CustomerWorkspace) {}
  @Get('contact-suggestions') suggestions(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: AddressQuery,
  ) {
    return this.service.suggestions(a, id, q.address);
  }
  @Post('customer') create(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ChatCustomerDto,
  ) {
    return this.service.createCustomer(a, id, d);
  }
  @Get('media') media(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.media(a, id, q);
  }
  @Get('media/:messageId') content(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.service.mediaContent(a, id, messageId);
  }
}
