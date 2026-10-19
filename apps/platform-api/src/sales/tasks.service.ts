import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, customerPredicate, hasPermission } from '../auth/policy';
import { checkVersion } from '../common/version';
import { CreateTaskDto, UpdateTaskDto, TaskQuery } from './tasks.dto';

const person = { id: true, displayName: true };
const taskInclude = {
  user: { select: person },
  customer: { select: { id: true, name: true } },
  participants: {
    select: { userId: true, role: true, user: { select: person } },
    orderBy: { userId: 'asc' as const },
  },
} satisfies Prisma.SalesTaskInclude;

const eligiblePeople: Prisma.UserWhereInput = {
  status: 'ACTIVE',
  roleAssignments: {
    some: {
      role: {
        permissions: {
          some: {
            permission: { code: 'sales.tasks.read' },
            scope: { in: ['ASSIGNED', 'GLOBAL'] },
          },
        },
      },
    },
  },
};
type IncludedTask = Prisma.SalesTaskGetPayload<{ include: typeof taskInclude }>;

@Injectable()
export class TasksService {
  constructor(private readonly db: Database) {}

  private transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
  }

  private sharedScope(actor: Principal): Prisma.SalesTaskWhereInput {
    return { OR: [{ userId: actor.id }, { participants: { some: { userId: actor.id } } }] };
  }

  private present(task: IncludedTask, actor: Principal) {
    const canManage =
      hasPermission(actor.grants, 'sales.tasks.manage', 'ASSIGNED') &&
      (task.userId === actor.id || hasPermission(actor.grants, 'sales.tasks.manage', 'GLOBAL'));
    const collaborator = task.participants.some(
      (p) => p.userId === actor.id && p.role === 'COLLABORATOR',
    );
    return {
      ...task,
      canManage,
      canUpdateStatus:
        canManage ||
        (collaborator && hasPermission(actor.grants, 'sales.tasks.manage', 'ASSIGNED')),
    };
  }

  async people(actor: Principal) {
    const users = await this.db.user.findMany({
      where: eligiblePeople,
      select: {
        ...person,
        roleAssignments: {
          select: {
            role: {
              select: {
                permissions: { select: { scope: true, permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      isSelf: u.id === actor.id,
      canCollaborate: u.roleAssignments.some((a) =>
        a.role.permissions.some(
          (p) =>
            p.permission.code === 'sales.tasks.manage' && ['ASSIGNED', 'GLOBAL'].includes(p.scope),
        ),
      ),
    }));
  }

  private async validatePeople(
    tx: Prisma.TransactionClient,
    ownerId: string,
    collaborators: string[],
    followers: string[],
  ) {
    const ids = [...collaborators, ...followers];
    if (ids.includes(ownerId) || new Set(ids).size !== ids.length)
      throw new BadRequestException(
        'Mỗi nhân sự chỉ thuộc một nhóm; người chủ trì không cần gắn thẻ.',
      );
    const users = await tx.user.findMany({
      where: { AND: [eligiblePeople, { id: { in: ids } }] },
      select: { id: true },
    });
    if (users.length !== ids.length)
      throw new BadRequestException(
        'Nhân sự được gắn thẻ phải đang hoạt động và có quyền xem công việc.',
      );
    const managers = await tx.user.count({
      where: {
        id: { in: collaborators },
        roleAssignments: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: { code: 'sales.tasks.manage' },
                  scope: { in: ['ASSIGNED', 'GLOBAL'] },
                },
              },
            },
          },
        },
      },
    });
    if (managers !== collaborators.length)
      throw new BadRequestException('Người cùng triển khai cần có quyền cập nhật công việc.');
    return [
      ...collaborators.map((userId) => ({ userId, role: 'COLLABORATOR' as const })),
      ...followers.map((userId) => ({ userId, role: 'FOLLOWER' as const })),
    ];
  }

  async list(actor: Principal, query: TaskQuery) {
    const isGlobal = hasPermission(actor.grants, 'sales.tasks.read', 'GLOBAL');

    const now = new Date(Date.now() + 7 * 3600000);
    const todayStr = now.toISOString().slice(0, 10);
    const startOfToday = new Date(todayStr + 'T00:00:00+07:00');
    const endOfToday = new Date(todayStr + 'T23:59:59.999+07:00');

    let dueDateFilter: Prisma.DateTimeNullableFilter | undefined;
    let statusFilter: Prisma.SalesTaskWhereInput = query.status ? { status: query.status } : {};

    if (query.timeRange === 'today') {
      dueDateFilter = { gte: startOfToday, lte: endOfToday };
    } else if (query.timeRange === 'week') {
      const dayOfWeek = now.getUTCDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(startOfToday.getTime() - diffToMonday * 86400000);
      const sunday = new Date(monday.getTime() + 7 * 86400000 - 1);
      dueDateFilter = { gte: monday, lte: sunday };
    } else if (query.timeRange === 'month') {
      const startOfMonth = new Date(todayStr.slice(0, 8) + '01T00:00:00+07:00');
      const nextMonth = new Date(startOfMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      dueDateFilter = { gte: startOfMonth, lt: nextMonth };
    } else if (query.timeRange === 'overdue') {
      dueDateFilter = { lt: startOfToday };
      if (!query.status) {
        statusFilter = { status: { in: ['TODO', 'IN_PROGRESS'] } };
      }
    } else if (query.dueDate) {
      const endOfDay = new Date(`${query.dueDate}T23:59:59.999+07:00`);
      dueDateFilter = { lte: endOfDay };
    }

    const searchFilter: Prisma.SalesTaskWhereInput = query.search?.trim()
      ? {
          OR: [
            { title: { contains: query.search.trim(), mode: 'insensitive' } },
            { note: { contains: query.search.trim(), mode: 'insensitive' } },
            { customer: { name: { contains: query.search.trim(), mode: 'insensitive' } } },
          ],
        }
      : {};

    const where: Prisma.SalesTaskWhereInput = {
      AND: [isGlobal ? {} : this.sharedScope(actor), searchFilter],
      ...(query.isRecurring !== undefined ? { isRecurring: query.isRecurring } : {}),
      ...statusFilter,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(dueDateFilter ? { dueDate: dueDateFilter } : {}),
    };

    const [items, total] = await this.db.$transaction(
      [
        this.db.salesTask.findMany({
          where,
          include: taskInclude,
          orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.salesTask.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    return {
      items: items.map((t) => this.present(t, actor)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async dailyChecklist(actor: Principal) {
    const now = new Date(Date.now() + 7 * 3600000);
    const todayStr = now.toISOString().slice(0, 10);
    const startOfToday = new Date(todayStr + 'T00:00:00+07:00');
    const endOfToday = new Date(todayStr + 'T23:59:59.999+07:00');

    const tasks = await this.db.salesTask.findMany({
      where: {
        ...this.sharedScope(actor),
        isRecurring: true,
      },
      include: taskInclude,
      orderBy: [{ createdAt: 'asc' }],
    });

    return tasks.map((t) => {
      const doneToday = !!(
        t.completedAt &&
        t.completedAt >= startOfToday &&
        t.completedAt <= endOfToday
      );
      return {
        ...this.present(t, actor),
        doneToday,
        status: doneToday ? ('DONE' as const) : ('TODO' as const),
      };
    });
  }

  async today(actor: Principal) {
    const now = new Date(Date.now() + 7 * 3600000);
    const todayStr = now.toISOString().slice(0, 10);
    const startOfToday = new Date(todayStr + 'T00:00:00+07:00');
    const endOfToday = new Date(todayStr + 'T23:59:59.999+07:00');

    const items = await this.db.salesTask.findMany({
      where: {
        AND: [this.sharedScope(actor)],
        isRecurring: false,
        OR: [
          { dueDate: { lte: endOfToday }, status: { in: ['TODO', 'IN_PROGRESS'] } },
          { completedAt: { gte: startOfToday, lte: endOfToday } },
        ],
      },
      include: taskInclude,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    const overdue: ReturnType<TasksService['present']>[] = [];
    const due: typeof overdue = [];
    const completed: typeof overdue = [];
    for (const t of items) {
      if (t.status === 'DONE') completed.push(this.present(t, actor));
      else if (t.dueDate && t.dueDate < startOfToday) overdue.push(this.present(t, actor));
      else due.push(this.present(t, actor));
    }
    return { overdue, due, completed };
  }

  async create(actor: Principal, dto: CreateTaskDto) {
    return this.transaction(async (tx) => {
      const customerId = dto.customerId?.trim() || null;
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { AND: [{ id: customerId }, customerPredicate(actor, 'sales.customers.read')] },
        });
        if (!customer) throw new NotFoundException('Không tìm thấy khách trong phạm vi của bạn.');
      }

      const participants = await this.validatePeople(
        tx,
        actor.id,
        dto.collaboratorIds || [],
        dto.followerIds || [],
      );
      const task = await tx.salesTask.create({
        data: {
          title: dto.title,
          userId: actor.id,
          customerId,
          note: dto.note || '',
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          priority: dto.priority || 'NORMAL',
          contactChannel: dto.contactChannel || '',
          isRecurring: dto.isRecurring || false,
          participants: { create: participants },
        },
        include: taskInclude,
      });
      return this.present(task, actor);
    });
  }

  async update(actor: Principal, id: string, dto: UpdateTaskDto) {
    return this.transaction(async (tx) => {
      const task = await tx.salesTask.findUnique({ where: { id }, include: taskInclude });
      if (!task) throw new NotFoundException('Không tìm thấy công việc.');

      const isGlobal = hasPermission(actor.grants, 'sales.tasks.manage', 'GLOBAL');
      if (task.userId !== actor.id && !isGlobal) {
        const collaborator = task.participants.some(
          (p) => p.userId === actor.id && p.role === 'COLLABORATOR',
        );
        if (
          !collaborator ||
          dto.status === undefined ||
          Object.entries(dto).some(
            ([k, v]) => v !== undefined && !['version', 'status'].includes(k),
          )
        )
          throw new ForbiddenException(
            'Chỉ người cùng triển khai được cập nhật tiến độ; nội dung và nhân sự do người chủ trì quản lý.',
          );
      }

      checkVersion(task.version, dto.version);

      const data: Prisma.SalesTaskUpdateInput = { version: { increment: 1 } };
      if (dto.collaboratorIds !== undefined || dto.followerIds !== undefined) {
        const collaborators =
          dto.collaboratorIds ??
          task.participants.filter((p) => p.role === 'COLLABORATOR').map((p) => p.userId);
        const followers =
          dto.followerIds ??
          task.participants.filter((p) => p.role === 'FOLLOWER').map((p) => p.userId);
        const participants = await this.validatePeople(tx, task.userId, collaborators, followers);
        data.participants = { deleteMany: {}, create: participants };
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'task.participants_updated',
            entity: 'SalesTask',
            entityId: id,
            metadata: { collaboratorIds: collaborators, followerIds: followers },
          },
        });
      }
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.note !== undefined) data.note = dto.note;
      if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.priority !== undefined) data.priority = dto.priority;
      if (dto.contactChannel !== undefined) data.contactChannel = dto.contactChannel;
      if (dto.isRecurring !== undefined) data.isRecurring = dto.isRecurring;

      if (dto.status !== undefined) {
        data.status = dto.status;
        if (dto.status === 'DONE') data.completedAt = new Date();
        else data.completedAt = null;
      }

      if (dto.customerId !== undefined) {
        const customerId = dto.customerId?.trim() || null;
        if (customerId) {
          const customer = await tx.customer.findFirst({
            where: { AND: [{ id: customerId }, customerPredicate(actor, 'sales.customers.read')] },
          });
          if (!customer) throw new NotFoundException('Không tìm thấy khách trong phạm vi của bạn.');
          data.customer = { connect: { id: customerId } };
        } else {
          data.customer = { disconnect: true };
        }
      }

      const updated = await tx.salesTask.update({
        where: { id },
        data,
        include: taskInclude,
      });
      return this.present(updated, actor);
    });
  }

  async remove(actor: Principal, id: string) {
    return this.transaction(async (tx) => {
      const task = await tx.salesTask.findUnique({ where: { id } });
      if (!task) throw new NotFoundException('Không tìm thấy công việc.');

      const isGlobal = hasPermission(actor.grants, 'sales.tasks.manage', 'GLOBAL');
      if (task.userId !== actor.id && !isGlobal) {
        throw new BadRequestException('Bạn không có quyền xóa công việc này.');
      }

      await tx.salesTask.delete({ where: { id } });
      return { success: true };
    });
  }

  async generateAutoTasks(tx: Prisma.TransactionClient) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const customersToContact = await tx.$queryRaw<
      { customerId: string; customerName: string; userId: string }[]
    >(Prisma.sql`
      SELECT c.id AS "customerId", c.name AS "customerName", a."userId"
      FROM "Customer" c
      JOIN "CustomerAssignment" a ON a."customerId" = c.id AND a."endedAt" IS NULL
      WHERE (c."lastContactDate" IS NULL OR c."lastContactDate" < ${sevenDaysAgo})
        AND NOT EXISTS (
          SELECT 1 FROM "SalesTask" t
          WHERE t."customerId" = c.id
            AND t."userId" = a."userId"
            AND t.status IN ('TODO', 'IN_PROGRESS')
        )
    `);

    if (customersToContact.length > 0) {
      const now = new Date(Date.now() + 7 * 3600000);
      const todayEnd = new Date(now.toISOString().slice(0, 10) + 'T23:59:59.999+07:00');
      await tx.salesTask.createMany({
        data: customersToContact.map((c) => ({
          title: 'Liên hệ lại ' + c.customerName,
          userId: c.userId,
          customerId: c.customerId,
          status: 'TODO' as const,
          priority: 'NORMAL' as const,
          dueDate: todayEnd,
          autoGenerated: true,
        })),
      });
    }

    return customersToContact.length;
  }
}
