import { summarizePipeline, probability, forecastRevenue } from './pipeline';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, customerPredicate, hasPermission } from '../auth/policy';
import { CustomerQuery } from './dto';

@Injectable()
export class DashboardService {
  constructor(private readonly db: Database) {}

  async myDashboard(actor: Principal) {
    const now = new Date();
    const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const startOfMonth = new Date(today.slice(0, 8) + '01T00:00:00+07:00');

    const kpiResult = await this.db.$queryRaw<
      { ordersThisMonth: bigint; revenue: string; paid: string }[]
    >`
      SELECT 
        COUNT(id) as "ordersThisMonth",
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(SUM("paidAmount"), 0) as paid
      FROM "Order"
      WHERE ("closedByUserId" = ${actor.id}::uuid OR "createdById" = ${actor.id}::uuid)
        AND "createdAt" >= ${startOfMonth}
        AND status IN ('CONFIRMED', 'COMPLETED')
    `;

    const kpi = kpiResult[0] || { ordersThisMonth: 0n, revenue: '0', paid: '0' };
    const revenue = Number(kpi.revenue) || 0;
    const paid = Number(kpi.paid) || 0;

    const isGlobal = hasPermission(actor.grants, 'sales.orders.read', 'GLOBAL');

    const recentOrders = await this.db.order.findMany({
      where: isGlobal
        ? { closedByUserId: actor.id }
        : {
            OR: [
              { createdById: actor.id },
              { closedByUserId: actor.id },
              { customer: { assignments: { some: { userId: actor.id, endedAt: null } } } },
            ],
          },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      ordersThisMonth: Number(kpi.ordersThisMonth),
      revenue: String(revenue),
      paid: String(paid),
      unpaid: String(Math.max(revenue - paid, 0)),
      recentOrders,
    };
  }

  async myPipeline(actor: Principal) {
    const rows = await this.db.customer.findMany({
      where: customerPredicate(actor),
      select: {
        status: true,
        closingProbability: true,
        expectedRevenue: true,
        expectedItems: true,
        expectedProducts: true,
      },
    });
    const summary = summarizePipeline(rows);
    return { ...summary, totalExpected: summary.totalExpectedRevenue };
  }

  async myPipelineBoard(actor: Principal) {
    const assignmentFilter = customerPredicate(actor);
    return this.db.$transaction(
      async (tx) => {
        const allForecasts = await tx.customer.findMany({
          where: assignmentFilter,
          select: {
            status: true,
            expectedRevenue: true,
            closingProbability: true,
            expectedItems: true,
            expectedProducts: true,
          },
        });
        const summary = summarizePipeline(allForecasts);
        const standardStatuses = ['NEW', 'CONSULTING', 'WON', 'RETURNING', 'INACTIVE'] as const;
        const now = new Date();

        const columns = await Promise.all(
          standardStatuses.map(async (status) => {
            const items = await tx.customer.findMany({
              where: { AND: [assignmentFilter, { status }] },
              select: {
                id: true,
                name: true,
                phone: true,
                version: true,
                status: true,
                expectedRevenue: true,
                closingProbability: true,
                expectedItems: true,
                nextContactDate: true,
                lastContactDate: true,
                tags: true,
                expectedProducts: true,
                region: { select: { name: true } },
                assignments: { where: { userId: actor.id, endedAt: null }, select: { id: true } },
              },
              orderBy: [
                { lastContactDate: { sort: 'asc', nulls: 'first' } },
                { nextContactDate: { sort: 'asc', nulls: 'first' } },
                { name: 'asc' },
                { id: 'asc' },
              ],
              take: 30,
            });
            const group = summary.groups.find((g) => g.status === status)!;
            const mappedItems = items.map((c) => {
              const lastContact = c.lastContactDate ? c.lastContactDate.getTime() : null;
              const nextContact = c.nextContactDate ? c.nextContactDate.getTime() : null;
              const daysSinceContact = lastContact
                ? Math.floor((now.getTime() - lastContact) / 86400000)
                : null;
              const daysUntilNext = nextContact
                ? Math.floor((nextContact - now.getTime()) / 86400000)
                : null;

              let urgency: 'overdue' | 'due-soon' | 'ok' = 'ok';

              if (daysUntilNext !== null && daysUntilNext < 0) {
                urgency = 'overdue';
              } else if (daysUntilNext !== null && daysUntilNext <= 2) {
                urgency = 'due-soon';
              } else if (status === 'NEW') {
                if (lastContact === null || (daysSinceContact !== null && daysSinceContact > 3)) {
                  urgency = 'overdue';
                } else if (daysSinceContact !== null && daysSinceContact > 1) {
                  urgency = 'due-soon';
                }
              } else if (status === 'CONSULTING') {
                if (lastContact === null || (daysSinceContact !== null && daysSinceContact > 7)) {
                  urgency = 'overdue';
                } else if (daysSinceContact !== null && daysSinceContact > 5) {
                  urgency = 'due-soon';
                }
              } else if (status === 'RETURNING' || status === 'INACTIVE') {
                if (lastContact === null || (daysSinceContact !== null && daysSinceContact > 15)) {
                  urgency = 'overdue';
                } else if (daysSinceContact !== null && daysSinceContact > 10) {
                  urgency = 'due-soon';
                }
              }

              return {
                id: c.id,
                version: c.version,
                status: c.status,
                closingProbability: c.closingProbability,
                effectiveProbability: probability(c),
                weightedRevenue: forecastRevenue(c.expectedRevenue, probability(c)).toFixed(0),
                expectedItems: c.expectedItems,
                canManage:
                  hasPermission(actor.grants, 'sales.customers.manage', 'GLOBAL') ||
                  (hasPermission(actor.grants, 'sales.customers.manage', 'ASSIGNED') &&
                    c.assignments.length > 0),
                name: c.name,
                phone: c.phone,
                expectedRevenue: c.expectedRevenue?.toString() ?? null,
                lastContactDate: c.lastContactDate?.toISOString() || null,
                nextContactDate: c.nextContactDate?.toISOString() || null,
                daysSinceContact,
                daysUntilNext,
                urgency,
                tags: c.tags,
                expectedProducts: c.expectedProducts,
                regionName: c.region?.name || null,
              };
            });

            // Sort: overdue first, then due-soon, then ok
            const urgencyOrder = { overdue: 0, 'due-soon': 1, ok: 2 };
            mappedItems.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

            return {
              status,
              count: group.count,
              expectedRevenue: group.expectedRevenue,
              items: mappedItems,
            };
          }),
        );

        return { ...summary, columns };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }

  async myCustomers(actor: Principal, query: CustomerQuery) {
    const phone = query.search?.replace(/[^\d]/g, '');
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
          include: {
            region: true,
            assignments: {
              where: { endedAt: null },
              include: { user: { select: { id: true, displayName: true } } },
            },
          },
          orderBy: [{ lastContactDate: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.customer.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    const customerIds = items.map((c) => c.id);
    const lastActivities = await this.db.careActivity.findMany({
      where: { customerId: { in: customerIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerId'],
      select: { customerId: true, note: true, createdAt: true },
    });

    const activityMap = new Map(lastActivities.map((a) => [a.customerId, a]));

    const mappedItems = items.map((c) => {
      const activity = activityMap.get(c.id);
      return {
        ...c,
        effectiveProbability: probability(c),
        weightedRevenue: forecastRevenue(c.expectedRevenue, probability(c)).toFixed(0),
        canManage:
          hasPermission(actor.grants, 'sales.customers.manage', 'GLOBAL') ||
          (hasPermission(actor.grants, 'sales.customers.manage', 'ASSIGNED') &&
            c.assignments.some((a) => a.userId === actor.id)),
        lastActivityDate: activity?.createdAt || null,
        lastActivityNotePreview: activity?.note ? activity.note.substring(0, 100) : null,
      };
    });

    return { items: mappedItems, total, page: query.page, pageSize: query.pageSize };
  }

  async careAlerts(actor: Principal) {
    const isGlobal = hasPermission(actor.grants, 'sales.customers.read', 'GLOBAL');
    const assignmentFilter: Prisma.CustomerWhereInput = isGlobal
      ? {}
      : { assignments: { some: { userId: actor.id, endedAt: null } } };

    const now = new Date();
    const cutoff3 = new Date(now.getTime() - 3 * 86400000);
    const cutoff7 = new Date(now.getTime() - 7 * 86400000);
    const cutoff15 = new Date(now.getTime() - 15 * 86400000);
    const cutoff1 = new Date(now.getTime() - 1 * 86400000);
    const cutoff5 = new Date(now.getTime() - 5 * 86400000);
    const cutoff10 = new Date(now.getTime() - 10 * 86400000);

    const totalManaged = await this.db.customer.count({ where: { ...assignmentFilter } });

    const overdueCustomers = await this.db.customer.count({
      where: {
        ...assignmentFilter,
        OR: [
          { status: 'NEW', OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff3 } }] },
          {
            status: 'CONSULTING',
            OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff7 } }],
          },
          {
            status: { in: ['RETURNING', 'INACTIVE'] },
            OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff15 } }],
          },
          { nextContactDate: { lt: now } },
        ],
      },
    });

    const dueSoonCustomers = await this.db.customer.count({
      where: {
        ...assignmentFilter,
        OR: [
          { status: 'NEW', lastContactDate: { gte: cutoff3, lt: cutoff1 } },
          { status: 'CONSULTING', lastContactDate: { gte: cutoff7, lt: cutoff5 } },
          {
            status: { in: ['RETURNING', 'INACTIVE'] },
            lastContactDate: { gte: cutoff15, lt: cutoff10 },
          },
          { nextContactDate: { gte: now, lt: new Date(now.getTime() + 2 * 86400000) } },
        ],
      },
    });

    const unansweredConversations = await this.db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint as count FROM "ChatConversation"
      WHERE "supportUserId" = ${actor.id}::uuid
        AND blocked = false
        AND "lastInboundAt" IS NOT NULL
        AND ("lastSentAt" IS NULL OR "lastSentAt" < "lastInboundAt")
    `;
    const unansweredCount = Number(unansweredConversations[0]?.count || 0n);

    return {
      totalManaged,
      overdueCustomers,
      dueSoonCustomers,
      unansweredConversations: unansweredCount,
    };
  }

  async careAlertCustomers(actor: Principal, type: string, query: CustomerQuery) {
    const isGlobal = hasPermission(actor.grants, 'sales.customers.read', 'GLOBAL');
    const assignmentFilter: Prisma.CustomerWhereInput = isGlobal
      ? {}
      : { assignments: { some: { userId: actor.id, endedAt: null } } };

    const now = new Date();
    const cutoff3 = new Date(now.getTime() - 3 * 86400000);
    const cutoff7 = new Date(now.getTime() - 7 * 86400000);
    const cutoff15 = new Date(now.getTime() - 15 * 86400000);
    const cutoff1 = new Date(now.getTime() - 1 * 86400000);
    const cutoff5 = new Date(now.getTime() - 5 * 86400000);
    const cutoff10 = new Date(now.getTime() - 10 * 86400000);

    if (type === 'unanswered') {
      const skip = (query.page - 1) * query.pageSize;
      const [items, totalRes] = await Promise.all([
        this.db.$queryRaw<any[]>`
          SELECT * FROM "ChatConversation"
          WHERE "supportUserId" = ${actor.id}::uuid
            AND blocked = false
            AND "lastInboundAt" IS NOT NULL
            AND ("lastSentAt" IS NULL OR "lastSentAt" < "lastInboundAt")
          ORDER BY "lastInboundAt" ASC
          LIMIT ${query.pageSize} OFFSET ${skip}
        `,
        this.db.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint as count FROM "ChatConversation"
          WHERE "supportUserId" = ${actor.id}::uuid
            AND blocked = false
            AND "lastInboundAt" IS NOT NULL
            AND ("lastSentAt" IS NULL OR "lastSentAt" < "lastInboundAt")
        `,
      ]);

      const customerIds = items.map((i) => i.customerId).filter(Boolean);
      const customers = customerIds.length
        ? await this.db.customer.findMany({
            where: { id: { in: customerIds } },
          })
        : [];
      const customerMap = new Map(customers.map((c) => [c.id, c]));

      const mappedItems = items.map((item) => ({
        ...item,
        customer: item.customerId ? customerMap.get(item.customerId) : null,
      }));

      return {
        items: mappedItems,
        total: Number(totalRes[0]?.count || 0n),
        page: query.page,
        pageSize: query.pageSize,
      };
    }

    let whereCondition: Prisma.CustomerWhereInput = { ...assignmentFilter };

    if (type === 'overdue') {
      whereCondition.OR = [
        { status: 'NEW', OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff3 } }] },
        {
          status: 'CONSULTING',
          OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff7 } }],
        },
        {
          status: { in: ['RETURNING', 'INACTIVE'] },
          OR: [{ lastContactDate: null }, { lastContactDate: { lt: cutoff15 } }],
        },
        { nextContactDate: { lt: now } },
      ];
    } else if (type === 'due-soon') {
      whereCondition.OR = [
        { status: 'NEW', lastContactDate: { gte: cutoff3, lt: cutoff1 } },
        { status: 'CONSULTING', lastContactDate: { gte: cutoff7, lt: cutoff5 } },
        {
          status: { in: ['RETURNING', 'INACTIVE'] },
          lastContactDate: { gte: cutoff15, lt: cutoff10 },
        },
        { nextContactDate: { gte: now, lt: new Date(now.getTime() + 2 * 86400000) } },
      ];
    }

    const [items, total] = await this.db.$transaction([
      this.db.customer.findMany({
        where: whereCondition,
        include: {
          region: true,
          assignments: {
            where: { endedAt: null },
            include: { user: { select: { id: true, displayName: true } } },
          },
        },
        orderBy: [{ lastContactDate: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.customer.count({ where: whereCondition }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
