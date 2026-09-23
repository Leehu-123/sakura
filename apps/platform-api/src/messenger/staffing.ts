import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
  MinLength,
  IsBoolean,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  Matches,
  IsIn,
} from 'class-validator';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal, hasPermission } from '../auth/policy';
import { chatScope } from './domain';
import { checkVersion } from '../common/version';
export const staffingLock = (tx: Prisma.TransactionClient) =>
  tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(736251902)`;
const eligible: Prisma.UserWhereInput = {
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
};
const person = { id: true, displayName: true } as const;
const manager = (a: Principal) => hasPermission(a.grants, 'core.messenger.manage', 'GLOBAL');
class TeamDto {
  @IsInt() @Min(0) version!: number;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/\S/) name!: string;
  @IsBoolean() isActive!: boolean;
  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true }) memberIds!: string[];
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Matches(/^\d{1,40}$/, { each: true })
  pageIds!: string[];
}
class StartDto {
  @IsUUID() teamId!: string;
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/\S/) label!: string;
}
class EndDto {
  @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/) note!: string;
}
class WorkDto extends EndDto {
  @IsInt() @Min(1) version!: number;
  @IsInt() @Min(0) inboundSeq!: number;
  @IsIn(['CLAIM', 'HANDOFF', 'RELEASE', 'COMPLETE', 'TAKEOVER']) action!: string;
  @IsOptional() @IsUUID() targetUserId?: string;
}
@Injectable()
export class ChatStaffing {
  constructor(private readonly db: Database) {}
  private async tx<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await staffingLock(tx);
        return work(tx);
      },
      { timeout: 15000 },
    );
  }
  private audit(
    tx: Prisma.TransactionClient,
    a: Principal,
    entity: string,
    id: string,
    action: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: { actorId: a.id, entity, entityId: id, action: 'staffing.' + action, metadata },
    });
  }
  async overview(a: Principal) {
    const all = manager(a);
    const [teams, shifts, users] = await Promise.all([
      this.db.chatTeam.findMany({
        where: all ? {} : { members: { some: { userId: a.id } } },
        include: { members: { include: { user: { select: person } } }, pages: true },
        orderBy: { name: 'asc' },
      }),
      this.db.chatShift.findMany({
        where: { endedAt: null, ...(all ? {} : { team: { members: { some: { userId: a.id } } } }) },
        include: { user: { select: person }, team: { select: { name: true } } },
        orderBy: { startedAt: 'asc' },
      }),
      all
        ? this.db.user.findMany({
            where: eligible,
            select: person,
            orderBy: { displayName: 'asc' },
          })
        : Promise.resolve([]),
    ]);
    return { teams, shifts, users, canManage: all };
  }
  async saveTeam(a: Principal, d: TeamDto, id?: string) {
    if (!manager(a)) throw new ForbiddenException();
    return this.tx(async (tx) => {
      const previous = id ? await tx.chatTeam.findUnique({ where: { id } }) : null;
      if (id && !previous) throw new NotFoundException('Không tìm thấy nhóm.');
      if ((previous?.version || 0) !== d.version)
        throw new ConflictException('Nhóm vừa thay đổi. Tải lại trước khi lưu.');
      if (
        id &&
        ((await tx.chatShift.count({ where: { teamId: id, endedAt: null } })) ||
          (await tx.chatConversation.count({
            where: { teamId: id, supportShiftId: { not: null } },
          })))
      )
        throw new ConflictException(
          'Kết thúc các ca và bàn giao việc trong nhóm trước khi thay đổi nhóm.',
        );
      if (
        (await tx.user.count({ where: { ...eligible, id: { in: d.memberIds } } })) !==
        d.memberIds.length
      )
        throw new BadRequestException(
          'Thành viên cần tài khoản hoạt động và quyền sử dụng hội thoại.',
        );
      if (
        await tx.chatTeamPage.count({
          where: { pageId: { in: d.pageIds }, ...(id ? { teamId: { not: id } } : {}) },
        })
      )
        throw new ConflictException('Một Fanpage đã thuộc nhóm khác. Gỡ khỏi nhóm cũ trước.');
      // Prevent routing changes while any affected legacy/new conversation has an in-flight send.
      if (
        await tx.chatMessage.count({
          where: {
            state: { in: ['SENDING', 'UNKNOWN'] },
            conversation: { OR: [{ pageId: { in: d.pageIds } }, ...(id ? [{ teamId: id }] : [])] },
          },
        })
      )
        throw new ConflictException(
          'Còn tin đang gửi hoặc chưa rõ kết quả. Đối chiếu trước khi đổi nhóm.',
        );
      const team = previous
        ? await tx.chatTeam.update({
            where: { id },
            data: { name: d.name.trim(), isActive: d.isActive, version: { increment: 1 } },
          })
        : await tx.chatTeam.create({ data: { name: d.name.trim(), isActive: d.isActive } });
      await tx.chatTeamMember.deleteMany({ where: { teamId: team.id } });
      await tx.chatTeamMember.createMany({
        data: d.memberIds.map((userId) => ({ teamId: team.id, userId })),
      });
      await tx.chatTeamPage.deleteMany({ where: { teamId: team.id } });
      await tx.chatTeamPage.createMany({
        data: d.pageIds.map((pageId) => ({ teamId: team.id, pageId })),
      });
      await tx.chatConversation.updateMany({
        where: { teamId: team.id, pageId: { notIn: d.pageIds } },
        data: {
          teamId: null,
          supportUserId: null,
          supportShiftId: null,
          workState: 'WAITING',
          version: { increment: 1 },
        },
      });
      await tx.chatConversation.updateMany({
        where: { pageId: { in: d.pageIds }, teamId: null },
        data: {
          teamId: team.id,
          supportUserId: null,
          supportShiftId: null,
          workState: 'WAITING',
          version: { increment: 1 },
        },
      });
      await this.audit(tx, a, 'ChatTeam', team.id, 'team_saved', {
        memberIds: d.memberIds,
        pageIds: d.pageIds,
        isActive: d.isActive,
      });
      return team;
    });
  }
  async start(a: Principal, d: StartDto) {
    return this.tx(async (tx) => {
      if (
        !(await tx.chatTeam.findFirst({
          where: {
            id: d.teamId,
            isActive: true,
            members: { some: { userId: a.id, user: eligible } },
          },
        }))
      )
        throw new ForbiddenException('Bạn chưa thuộc nhóm đang hoạt động này.');
      if (await tx.chatShift.findFirst({ where: { userId: a.id, endedAt: null } }))
        throw new ConflictException('Bạn đang có ca chưa kết thúc.');
      const shift = await tx.chatShift.create({
        data: { teamId: d.teamId, userId: a.id, label: d.label.trim() },
      });
      await this.audit(tx, a, 'ChatShift', shift.id, 'shift_started', {
        teamId: d.teamId,
        label: shift.label,
      });
      return shift;
    });
  }
  async end(a: Principal, id: string, d: EndDto) {
    return this.tx(async (tx) => {
      const shift = await tx.chatShift.findUnique({ where: { id } });
      if (!shift || (shift.userId !== a.id && !manager(a)))
        throw new NotFoundException('Không tìm thấy ca trong phạm vi.');
      if (shift.endedAt) throw new ConflictException('Ca đã kết thúc.');
      if (
        await tx.chatMessage.count({
          where: { conversation: { supportShiftId: id }, state: { in: ['SENDING', 'UNKNOWN'] } },
        })
      )
        throw new ConflictException(
          'Còn tin đang gửi/chưa rõ kết quả. Đối chiếu trước khi kết thúc ca.',
        );
      const chats = await tx.chatConversation.findMany({
        where: { supportShiftId: id },
        select: { id: true, supportUserId: true },
      });
      await tx.chatConversation.updateMany({
        where: { supportShiftId: id },
        data: {
          supportUserId: null,
          supportShiftId: null,
          workState: 'WAITING',
          version: { increment: 1 },
        },
      });
      for (const c of chats)
        await this.audit(tx, a, 'ChatConversation', c.id, 'shift_released', {
          fromUserId: c.supportUserId,
          toUserId: null,
          note: d.note,
          shiftId: id,
        });
      await tx.chatShift.update({
        where: { id },
        data: { endedAt: new Date(), endNote: d.note.trim() },
      });
      await this.audit(tx, a, 'ChatShift', id, 'shift_ended', {
        note: d.note,
        returnedToQueue: chats.length,
      });
      return { returnedToQueue: chats.length };
    });
  }
  async context(a: Principal, id: string) {
    const c = await this.db.chatConversation.findFirst({
      where: { AND: [{ id }, chatScope(a)] },
      include: { team: { select: { id: true, name: true, isActive: true } } },
    });
    if (!c) throw new NotFoundException();
    if (!c.teamId) return { managed: false };
    const [shifts, events] = await Promise.all([
      this.db.chatShift.findMany({
        where: { teamId: c.teamId, endedAt: null, user: eligible, team: { isActive: true } },
        include: { user: { select: person } },
      }),
      this.db.auditLog.findMany({
        where: { entity: 'ChatConversation', entityId: id, action: { startsWith: 'staffing.' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
          id: true,
          action: true,
          createdAt: true,
          metadata: true,
          actor: { select: person },
        },
      }),
    ]);
    return {
      managed: true,
      team: c.team,
      workState: c.workState,
      version: c.version,
      inboundSeq: c.inboundSeq,
      supportUserId: c.supportUserId,
      shifts,
      events,
      canManage: manager(a),
    };
  }
  async work(a: Principal, id: string, d: WorkDto) {
    return this.tx(async (tx) => {
      const c = await tx.chatConversation.findFirst({ where: { AND: [{ id }, chatScope(a)] } });
      if (!c || !c.teamId) throw new NotFoundException('Hội thoại chưa thuộc nhóm trực.');
      checkVersion(c.version, d.version);
      if (d.action === 'COMPLETE' && d.inboundSeq !== c.inboundSeq)
        throw new ConflictException('Có tin mới từ khách. Làm mới và xem tin trước khi hoàn tất.');
      if (
        await tx.chatMessage.count({
          where: { conversationId: id, state: { in: ['SENDING', 'UNKNOWN'] } },
        })
      )
        throw new ConflictException(
          'Đối chiếu tin đang gửi/chưa rõ kết quả trước khi đổi người xử lý.',
        );
      const mine = c.supportUserId === a.id;
      if (d.action === 'CLAIM' && (c.supportUserId || c.workState === 'DONE'))
        throw new ConflictException('Hội thoại đã được nhận hoặc hoàn tất.');
      if (d.action === 'TAKEOVER' && !manager(a))
        throw new ForbiddenException('Chỉ quản trị được tiếp quản thay người khác.');
      if (['HANDOFF', 'RELEASE', 'COMPLETE'].includes(d.action) && !mine && !manager(a))
        throw new ForbiddenException('Chỉ người xử lý hoặc quản trị được bàn giao.');
      if (['HANDOFF', 'RELEASE', 'COMPLETE'].includes(d.action) && !c.supportUserId)
        throw new ConflictException('Hội thoại chưa có người xử lý.');
      const target =
        d.action === 'HANDOFF'
          ? d.targetUserId
          : ['CLAIM', 'TAKEOVER'].includes(d.action)
            ? a.id
            : undefined;
      if (d.action === 'HANDOFF' && (!target || target === c.supportUserId))
        throw new BadRequestException('Chọn người khác đang trực để bàn giao.');
      const shift = target
        ? await tx.chatShift.findFirst({
            where: {
              userId: target,
              teamId: c.teamId,
              endedAt: null,
              user: eligible,
              team: { isActive: true, members: { some: { userId: target } } },
            },
            include: { user: { select: person } },
          })
        : null;
      if (target && !shift)
        throw new BadRequestException('Người nhận cần đang trực trong nhóm phụ trách.');
      if (target && c.blocked)
        throw new BadRequestException('Bỏ chặn hội thoại trước khi nhận xử lý.');
      const updated = await tx.chatConversation.update({
        where: { id },
        data: {
          supportUserId: target || null,
          supportShiftId: shift?.id || null,
          workState: d.action === 'COMPLETE' ? 'DONE' : target ? 'ACTIVE' : 'WAITING',
          version: { increment: 1 },
        },
      });
      await this.audit(tx, a, 'ChatConversation', id, d.action.toLowerCase(), {
        fromUserId: c.supportUserId,
        toUserId: target || null,
        toName: shift?.user.displayName || null,
        note: d.note.trim(),
        shiftId: shift?.id || null,
      });
      return updated;
    });
  }
}
export async function currentWorkShift(
  tx: Prisma.TransactionClient,
  actorId: string,
  c: { teamId: string | null; supportUserId: string | null; supportShiftId: string | null },
) {
  if (!c.teamId) return null;
  if (c.supportUserId !== actorId || !c.supportShiftId)
    throw new ConflictException('Bắt đầu ca và nhận xử lý hội thoại trước khi gửi.');
  const shift = await tx.chatShift.findFirst({
    where: {
      id: c.supportShiftId,
      userId: actorId,
      teamId: c.teamId,
      endedAt: null,
      user: eligible,
      team: { isActive: true, members: { some: { userId: actorId } } },
    },
  });
  if (!shift) throw new ConflictException('Ca trực hoặc quyền trong nhóm đã thay đổi.');
  return shift.id;
}
@Controller('messenger/staffing')
@RequirePermission('sales.chat.use', 'ASSIGNED')
export class ChatStaffingController {
  constructor(private readonly service: ChatStaffing) {}
  @Get() overview(@CurrentUser() a: Principal) {
    return this.service.overview(a);
  }
  @Post('teams') @RequirePermission('core.messenger.manage', 'GLOBAL') create(
    @CurrentUser() a: Principal,
    @Body() d: TeamDto,
  ) {
    return this.service.saveTeam(a, d);
  }
  @Patch('teams/:id') @RequirePermission('core.messenger.manage', 'GLOBAL') update(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: TeamDto,
  ) {
    return this.service.saveTeam(a, d, id);
  }
  @Post('shifts') start(@CurrentUser() a: Principal, @Body() d: StartDto) {
    return this.service.start(a, d);
  }
  @Post('shifts/:id/end') end(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: EndDto,
  ) {
    return this.service.end(a, id, d);
  }
  @Get('conversations/:id') context(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.context(a, id);
  }
  @Post('conversations/:id') work(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: WorkDto,
  ) {
    return this.service.work(a, id, d);
  }
}
