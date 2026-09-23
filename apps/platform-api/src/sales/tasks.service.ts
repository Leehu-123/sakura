import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
} satisfies Prisma.SalesTaskInclude;

@Injectable()
export class TasksService {
  constructor(private readonly db: Database) {}

  private transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
  }

  async list(actor: Principal, query: TaskQuery) {
    const isGlobal = hasPermission(actor.grants, 'sales.tasks.read', 'GLOBAL');

    let dueDateFilter: Prisma.DateTimeNullableFilter | undefined;
    if (query.dueDate) {
      const endOfDay = new Date(`${query.dueDate}T23:59:59.999+07:00`);
      dueDateFilter = { lte: endOfDay };
    }

    const where: Prisma.SalesTaskWhereInput = {
      ...(isGlobal ? {} : { userId: actor.id }),
      ...(query.status ? { status: query.status } : {}),
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

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async today(actor: Principal) {
    const now = new Date(Date.now() + 7 * 3600000);
    const todayStr = now.toISOString().slice(0, 10);
    const startOfToday = new Date(todayStr + 'T00:00:00+07:00');
    const endOfToday = new Date(todayStr + 'T23:59:59.999+07:00');

    const items = await this.db.salesTask.findMany({
      where: {
        userId: actor.id,
        OR: [
          { dueDate: { lte: endOfToday }, status: { in: ['TODO', 'IN_PROGRESS'] } },
          { completedAt: { gte: startOfToday, lte: endOfToday } },
        ],
      },
      include: taskInclude,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    const overdue: typeof items = [];
    const due: typeof items = [];
    const completed: typeof items = [];
    for (const t of items) {
      if (t.status === 'DONE') completed.push(t);
      else if (t.dueDate && t.dueDate < startOfToday) overdue.push(t);
      else due.push(t);
    }
    return { overdue, due, completed };
  }

  async create(actor: Principal, dto: CreateTaskDto) {
    return this.transaction(async (tx) => {
      if (dto.customerId) {
        const customer = await tx.customer.findFirst({
          where: { AND: [{ id: dto.customerId }, customerPredicate(actor, 'sales.customers.read')] },
        });
        if (!customer) throw new NotFoundException('Không tìm thấy khách trong phạm vi của bạn.');
      }

      return tx.salesTask.create({
        data: {
          title: dto.title,
          userId: actor.id,
          customerId: dto.customerId || null,
          note: dto.note || '',
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          priority: dto.priority || 'NORMAL',
          contactChannel: dto.contactChannel || '',
        },
        include: taskInclude,
      });
    });
  }

  async update(actor: Principal, id: string, dto: UpdateTaskDto) {
    return this.transaction(async (tx) => {
      const task = await tx.salesTask.findUnique({ where: { id } });
      if (!task) throw new NotFoundException('Không tìm thấy công việc.');

      const isGlobal = hasPermission(actor.grants, 'sales.tasks.manage', 'GLOBAL');
      if (task.userId !== actor.id && !isGlobal) {
        throw new BadRequestException('Bạn không có quyền cập nhật công việc này.');
      }

      checkVersion(task.version, dto.version);

      const data: Prisma.SalesTaskUpdateInput = { version: { increment: 1 } };
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.note !== undefined) data.note = dto.note;
      if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.priority !== undefined) data.priority = dto.priority;
      if (dto.contactChannel !== undefined) data.contactChannel = dto.contactChannel;

      if (dto.status !== undefined) {
        data.status = dto.status;
        if (dto.status === 'DONE' && task.status !== 'DONE') data.completedAt = new Date();
        else if (dto.status !== 'DONE' && task.status === 'DONE') data.completedAt = null;
      }

      if (dto.customerId !== undefined) {
        if (dto.customerId) {
          data.customer = { connect: { id: dto.customerId } };
        } else {
          data.customer = { disconnect: true };
        }
      }

      return tx.salesTask.update({
        where: { id },
        data,
        include: taskInclude,
      });
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
