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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const kpiResult = await this.db.$queryRaw<{ ordersThisMonth: bigint, revenue: string, paid: string }[]>`
      SELECT 
        COUNT(id) as "ordersThisMonth",
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(SUM("paidAmount"), 0) as paid
      FROM "Order"
      WHERE "closedByUserId" = ${actor.id}::uuid
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
              { closedByUserId: actor.id }
            ]
          },
      include: {
        customer: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      kpi: {
        ordersThisMonth: Number(kpi.ordersThisMonth),
        revenue,
        paid,
        unpaid: revenue - paid,
      },
      recentOrders
    };
  }

  async myPipeline(actor: Principal) {
    const isGlobal = hasPermission(actor.grants, 'sales.customers.read', 'GLOBAL');

    let whereClause = Prisma.empty;
    if (!isGlobal) {
      whereClause = Prisma.sql`
        WHERE EXISTS (
          SELECT 1 FROM "CustomerAssignment" a 
          WHERE a."customerId" = "Customer".id 
            AND a."endedAt" IS NULL 
            AND a."userId" = ${actor.id}::uuid
        )
      `;
    }

    const pipeline = await this.db.$queryRaw<{ status: string, count: bigint, expectedRevenue: string }[]>`
      SELECT 
        status,
        COUNT(id) as count,
        COALESCE(SUM("expectedRevenue"), 0) as "expectedRevenue"
      FROM "Customer"
      ${whereClause}
      GROUP BY status
    `;

    const result = pipeline.map(p => ({
      status: p.status,
      count: Number(p.count),
      expectedRevenue: Number(p.expectedRevenue)
    }));

    const totalExpectedRevenue = result.reduce((sum, item) => sum + item.expectedRevenue, 0);

    return { pipeline: result, totalExpectedRevenue };
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

    const [items, total] = await this.db.$transaction([
      this.db.customer.findMany({
        where,
        include: {
          region: true,
          assignments: { where: { endedAt: null }, include: { user: { select: { id: true, displayName: true } } } },
        },
        orderBy: [{ lastContactDate: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.customer.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });

    const customerIds = items.map(c => c.id);
    const lastActivities = await this.db.careActivity.findMany({
      where: { customerId: { in: customerIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerId'],
      select: { customerId: true, note: true, createdAt: true },
    });

    const activityMap = new Map(lastActivities.map(a => [a.customerId, a]));

    const mappedItems = items.map(c => {
      const activity = activityMap.get(c.id);
      return {
        ...c,
        lastActivityDate: activity?.createdAt || null,
        lastActivityNotePreview: activity?.note ? activity.note.substring(0, 100) : null,
      };
    });

    return { items: mappedItems, total, page: query.page, pageSize: query.pageSize };
  }
}
