import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Param,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { MessengerConnections } from './connection.service';
import { settings } from './domain';
import { boundedBody } from './profiles';
type Cursor = {
  after?: string;
  conversationId?: string;
  psid?: string;
  name?: string;
  messageAfter?: string;
  nextAfter?: string;
};
export class ImportHistoryDto {
  @IsOptional() @IsBoolean() restart = false;
}
@Injectable()
export class MetaHistoryGateway {
  constructor(private readonly connections: MessengerConnections) {}
  async get(pageId: string, node: string, fields: string, after?: string, conversations = false) {
    const c = settings(pageId, await this.connections.runtime());
    if (c.pageId !== pageId || !c.accessToken || !c.receiving || !/^v\d+\.\d+$/.test(c.version))
      throw new BadRequestException(
        'Fanpage chưa sẵn sàng. Kiểm tra kết nối trước khi tải lịch sử.',
      );
    const params = new URLSearchParams({ fields, limit: conversations ? '1' : '50' });
    if (conversations) params.set('platform', 'messenger');
    if (after) params.set('after', after);
    const response = await fetch(
      `https://graph.facebook.com/${c.version}/${encodeURIComponent(node)}/${conversations ? 'conversations' : 'messages'}?${params}`,
      {
        headers: { Authorization: 'Bearer ' + c.accessToken },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new BadRequestException(
        response.status === 429
          ? 'Meta đang giới hạn lượt tải. Chờ vài phút rồi tải tiếp.'
          : 'Meta chưa cho phép đọc lịch sử. Kiểm tra token và quyền pages_messaging, pages_read_engagement, pages_manage_metadata của Fanpage.',
      );
    const data = JSON.parse((await boundedBody(response, 2 * 1024 * 1024)).toString());
    if (!Array.isArray(data.data) || data.data.length > (conversations ? 1 : 50))
      throw new BadRequestException('Meta trả dữ liệu không hợp lệ; chưa cập nhật tiến độ.');
    const next =
      data.paging?.next && typeof data.paging?.cursors?.after === 'string'
        ? data.paging.cursors.after
        : undefined;
    if (next && (next.length > 8192 || next === after)) throw new BadRequestException('Mốc tải lịch sử không hợp lệ.');
    return { rows: data.data, next };
  }
}
export function historicalMessage(m: any, pageId: string, psid: string) {
  if (
    typeof m?.id !== 'string' ||
    m.id.length > 1000 ||
    !m.id ||
    typeof m.created_time !== 'string'
  )
    return null;
  const at = new Date(m.created_time);
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 300000) return null;
  const inbound = m.from?.id === psid,
    outbound = m.from?.id === pageId;
  const recipients = m.to?.data;
  if (
    (!inbound && !outbound) ||
    !Array.isArray(recipients) ||
    !recipients.some((r: any) => r.id === (inbound ? pageId : psid))
  )
    return null;
  const attachments = Array.isArray(m.attachments?.data) ? m.attachments.data : [];
  const types = [
    ...new Set<string>(
      attachments.map((a: any) => (a.image_data ? 'image' : a.video_data ? 'video' : 'file')),
    ),
  ];
  return {
    remoteKey: pageId + ':' + m.id,
    direction: inbound ? 'INBOUND' : 'OUTBOUND',
    state: inbound ? 'RECEIVED' : 'SENT',
    sourceAt: at,
    text: typeof m.message === 'string' ? m.message.slice(0, 20000) : '',
    attachmentTypes: types,
    imported: true,
  };
}
@Injectable()
export class MessengerHistoryImport {
  constructor(
    private readonly db: Database,
    private readonly gateway: MetaHistoryGateway,
  ) {}
  private view(row: any) {
    return {
      complete: row?.complete || false,
      importedMessages: row?.importedMessages || 0,
      conversations: row?.conversations || 0,
      updatedAt: row?.updatedAt || null,
    };
  }
  async status(pageId: string) {
    return this.view(await this.db.chatHistoryImport.findUnique({ where: { pageId } }));
  }
  async step(actor: Principal, pageId: string, restart = false) {
    if (!/^\d{1,40}$/.test(pageId)) throw new BadRequestException('Page ID không hợp lệ.');
    await this.db.chatHistoryImport.upsert({ where: { pageId }, create: { pageId }, update: {} });
    const leaseToken = randomUUID(),
      now = new Date();
    const claim = await this.db.chatHistoryImport.updateMany({
      where: { pageId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseToken, leaseUntil: new Date(Date.now() + 120000) },
    });
    if (!claim.count)
      throw new ConflictException('Fanpage đang được tải lịch sử ở một phiên khác.');
    try {
      const job = await this.db.chatHistoryImport.findUniqueOrThrow({ where: { pageId } });
      if (job.complete && !restart) return this.view(job);
      let cursor: Cursor = restart ? {} : (job.cursor as Cursor),
        completedConversation = 0,
        complete = false;
      if (!cursor.conversationId) {
        const list = await this.gateway.get(pageId, pageId, 'id,participants', cursor.after, true);
        if (!list.rows.length) {
          cursor = { after: list.next };
          complete = !list.next;
        }
        else {
          const c = list.rows[0],
            people = Array.isArray(c.participants?.data)
              ? c.participants.data.filter((p: any) => p.id !== pageId && /^\d{1,40}$/.test(p.id))
              : [];
          if (typeof c.id !== 'string' || c.id.length > 250 || people.length !== 1) {
            cursor = { after: list.next };
            completedConversation = 1;
            complete = !list.next;
          } else
            cursor = {
              conversationId: c.id,
              psid: people[0].id,
              name: typeof people[0].name === 'string' ? people[0].name.slice(0, 200) : undefined,
              nextAfter: list.next,
            };
        }
      }
      let messages: NonNullable<ReturnType<typeof historicalMessage>>[] = [];
      const contact = { ...cursor };
      if (cursor.conversationId && cursor.psid) {
        const batch = await this.gateway.get(
          pageId,
          cursor.conversationId,
          'id,created_time,from,to,message,attachments',
          cursor.messageAfter,
        );
        messages = batch.rows
          .map((m: any) => historicalMessage(m, pageId, cursor.psid!))
          .filter(Boolean) as typeof messages;
        if (batch.next) cursor = { ...cursor, messageAfter: batch.next };
        else {
          completedConversation = 1;
          complete = !cursor.nextAfter;
          cursor = { after: cursor.nextAfter };
        }
      }
      return await this.db.$transaction(
        async (tx) => {
          const owned = await tx.chatHistoryImport.findFirst({
            where: { pageId, leaseToken, leaseUntil: { gt: new Date() } },
          });
          if (!owned) throw new ConflictException('Phiên tải đã hết hạn. Bấm tải tiếp.');
          let imported = 0;
          if (contact.psid && messages.length) {
            const lock = pageId + ':' + contact.psid;
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lock},0))`;
            const route = await tx.chatTeamPage.findUnique({ where: { pageId } });
            const conversation = await tx.chatConversation.upsert({
              where: { pageId_psid: { pageId, psid: contact.psid } },
              create: {
                pageId,
                psid: contact.psid,
                facebookName: contact.name,
                teamId: route?.teamId,
                lastActivityAt: new Date(0),
              },
              update: {},
            });
            imported = (
              await tx.chatMessage.createMany({
                data: messages.map((m) => ({ ...m, conversationId: conversation.id })),
                skipDuplicates: true,
              })
            ).count;
            for (const field of ['lastActivityAt', 'lastInboundAt', 'lastSentAt'] as const) {
              const times = messages
                .filter(
                  (m) =>
                    field === 'lastActivityAt' ||
                    m.direction === (field === 'lastInboundAt' ? 'INBOUND' : 'OUTBOUND'),
                )
                .map((m) => m.sourceAt.getTime());
              if (!times.length) continue;
              const latest = new Date(Math.max(...times));
              await tx.chatConversation.updateMany({
                where: {
                  id: conversation.id,
                  OR: [
                    ...(field === 'lastActivityAt' ? [] : [{ [field]: null }]),
                    { [field]: { lt: latest } },
                  ],
                },
                data: { [field]: latest },
              });
            }
          }
          const saved = await tx.chatHistoryImport.update({
            where: { pageId },
            data: {
              cursor: JSON.parse(JSON.stringify(cursor)) as Prisma.InputJsonValue,
              complete,
              importedMessages: restart ? imported : { increment: imported },
              conversations: restart ? completedConversation : { increment: completedConversation },
              leaseToken: null,
              leaseUntil: null,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: 'chat.history_imported',
              entity: 'Fanpage',
              entityId: pageId,
              metadata: { imported, complete },
            },
          });
          return this.view(saved);
        },
        { timeout: 20000 },
      );
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ConflictException) throw e;
      throw new BadRequestException(
        'Chưa tải được lịch sử từ Facebook. Tiến độ đã lưu được giữ lại; vui lòng thử tiếp.',
      );
    } finally {
      await this.db.chatHistoryImport.updateMany({
        where: { pageId, leaseToken },
        data: { leaseUntil: null, leaseToken: null },
      });
    }
  }
}
@Controller('messenger/pages/:pageId/history-import')
@RequirePermission('core.messenger.manage')
export class HistoryImportController {
  constructor(private readonly importer: MessengerHistoryImport) {}
  @Get() status(@Param('pageId') pageId: string) {
    return this.importer.status(pageId);
  }
  @Post() step(
    @CurrentUser() actor: Principal,
    @Param('pageId') pageId: string,
    @Body() dto: ImportHistoryDto,
  ) {
    return this.importer.step(actor, pageId, dto.restart);
  }
}
