import {
  Controller,
  Get,
  Injectable,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Prisma } from '@sakura/database';
import { CurrentUser, RequirePermission } from '../auth/access';
import { hasPermission, Principal } from '../auth/policy';
import { Database } from '../db';
import { PageDto } from '../core/dto';
import { MessengerConnections } from './connection.service';

export class HistoryQuery extends PageDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @Matches(/^\d{1,40}$/) pageId?: string;
  @IsOptional() @IsIn(['ALL', 'SENT', 'FAILED', 'SENDING', 'UNKNOWN']) state = 'ALL';
}
const DAY = 86400000;
// Calendar dates are company dates (UTC+7), independent of browser/server timezone.
export function historyRange(from: string, to: string) {
  function day(s: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
      throw new BadRequestException('Ngày cần có dạng YYYY-MM-DD.');
    const utc = new Date(s + 'T00:00:00Z');
    if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== s)
      throw new BadRequestException('Ngày chưa hợp lệ.');
    return utc.getTime() - 7 * 3600000;
  }
  const start = day(from),
    end = day(to) + DAY;
  if (end <= start || end - start > 366 * DAY)
    throw new BadRequestException(
      'Chọn ngày kết thúc từ ngày bắt đầu, tối đa 366 ngày mỗi lần tra cứu.',
    );
  return { gte: new Date(start), lt: new Date(end) };
}
@Injectable()
export class MessengerHistory {
  constructor(
    private readonly db: Database,
    private readonly connections: MessengerConnections,
  ) {}
  private authorize(actor: Principal) {
    if (!hasPermission(actor.grants, 'sales.chat.use', 'GLOBAL'))
      throw new ForbiddenException('Tra cứu lịch sử cần quyền xem hội thoại toàn công ty.');
  }
  async options(actor: Principal) {
    this.authorize(actor);
    const [users, historical, config, shifts] = await Promise.all([
      this.db.user.findMany({
        where: { chatMessages: { some: { direction: 'OUTBOUND' } } },
        select: { id: true, displayName: true, status: true },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      }),
      this.db.chatConversation.findMany({
        where: { messages: { some: { direction: 'OUTBOUND' } } },
        distinct: ['pageId'],
        select: { pageId: true },
      }),
      this.connections.view(),
      this.db.chatShift.findMany({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 200,
        select: { id: true, label: true, startedAt: true, user: { select: { displayName: true } } },
      }),
    ]);
    const pages = new Map(config.pages.map((p) => [p.pageId, { id: p.pageId, name: p.name }]));
    for (const p of historical)
      if (!pages.has(p.pageId)) pages.set(p.pageId, { id: p.pageId, name: 'Fanpage ' + p.pageId });
    return {
      users,
      shifts,
      pages: [...pages.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  async list(actor: Principal, q: HistoryQuery) {
    this.authorize(actor);
    const cutoff = new Date(Date.now() - 30000);
    const status: Prisma.ChatMessageWhereInput =
      q.state === 'UNKNOWN'
        ? { OR: [{ state: 'UNKNOWN' }, { state: 'SENDING', createdAt: { lt: cutoff } }] }
        : q.state === 'SENDING'
          ? { state: 'SENDING', createdAt: { gte: cutoff } }
          : q.state === 'ALL'
            ? {}
            : { state: q.state };
    const where: Prisma.ChatMessageWhereInput = {
      direction: 'OUTBOUND',
      sourceAt: historyRange(q.from, q.to),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.shiftId ? { shiftId: q.shiftId } : {}),
      ...(q.pageId ? { conversation: { pageId: q.pageId } } : {}),
      AND: [
        status,
        ...(q.search.trim()
          ? [
              {
                OR: [
                  { text: { contains: q.search.trim(), mode: 'insensitive' as const } },
                  {
                    conversation: {
                      customer: {
                        name: { contains: q.search.trim(), mode: 'insensitive' as const },
                      },
                    },
                  },
                  { conversation: { psid: { contains: q.search.trim() } } },
                ],
              },
            ]
          : []),
      ],
    };
    return this.db.$transaction(
      async (tx) => {
        const items = await tx.chatMessage.findMany({
          where,
          orderBy: [{ sourceAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          select: {
            id: true,
            conversationId: true,
            text: true,
            state: true,
            sourceAt: true,
            createdAt: true,
            imageId: true,
            orderId: true,
            actor: { select: { id: true, displayName: true, status: true } },
            shift: { select: { id: true, label: true, startedAt: true } },
            conversation: {
              select: { pageId: true, psid: true, customer: { select: { id: true, name: true } } },
            },
          },
        });
        return {
          items: items.map((m) => ({
            ...m,
            state: m.state === 'SENDING' && m.createdAt < cutoff ? 'UNKNOWN' : m.state,
          })),
          total: await tx.chatMessage.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
@Controller('messenger/history')
@RequirePermission('sales.chat.use', 'GLOBAL')
export class MessengerHistoryController {
  constructor(private readonly history: MessengerHistory) {}
  @Get('options') options(@CurrentUser() actor: Principal) {
    return this.history.options(actor);
  }
  @Get() list(@CurrentUser() actor: Principal, @Query() q: HistoryQuery) {
    return this.history.list(actor, q);
  }
}
