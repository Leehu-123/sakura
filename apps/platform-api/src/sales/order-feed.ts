import { Injectable } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { reportRange, ReportQuery } from './reports';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal, hasPermission } from '../auth/policy';
import { PageDto } from '../core/dto';
import { purchaseCounts } from './purchase-counts';

export class OrderFeedQuery extends PageDto {
  @IsOptional() @IsIn(['', 'UNKNOWN', 'PAGE', 'ZALO', 'SELF', 'OTHER']) salesChannel = '';
  @IsOptional() @IsIn(['', 'UNKNOWN', 'NORTH', 'CENTRAL', 'SOUTH', 'HIGHLANDS']) deliveryRegion =
    '';
  @IsOptional() @IsString() @MaxLength(100) closer = '';
  @IsOptional() @IsString() @MaxLength(150) salesSourceName = '';
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsIn(['ALL', 'SAKURA', 'SAPO']) source = 'ALL';
  @IsOptional() @IsIn(['ALL', 'LINKED', 'UNLINKED']) link = 'ALL';
  @IsOptional() @IsString() @MaxLength(100) status = '';
}
@Injectable()
export class OrderFeedService {
  constructor(private readonly db: Database) {}
  async list(actor: Principal, q: OrderFeedQuery) {
    const range =
      q.from || q.to
        ? reportRange(Object.assign(new ReportQuery(), { from: q.from, to: q.to }))
        : null;
    const global = hasPermission(actor.grants, 'sales.orders.read', 'GLOBAL');
    const assigned = hasPermission(actor.grants, 'sales.orders.read', 'ASSIGNED');
    // Apply the same customer-assignment boundary to both sources before paging/counting.
    const scope = global
      ? Prisma.sql`TRUE`
      : assigned
        ? Prisma.sql`EXISTS (
      SELECT 1 FROM "CustomerAssignment" a WHERE a."customerId" = f."customerId"
        AND a."userId" = ${actor.id}::uuid AND a."endedAt" IS NULL
    )`
        : Prisma.sql`FALSE`;
    const feed = Prisma.sql`WITH feed AS (
      SELECT o.id, 'SAKURA'::text AS source, 'SK-' || LPAD(o.number::text, GREATEST(6, LENGTH(o.number::text)), '0') AS number,
        o."customerId", o."createdAt" AS "orderedAt", o.status::text AS status,
        o.total, o."paidAmount", o."paymentStatus"::text AS "paymentStatus",
        o."shippingStatus"::text AS "shippingStatus",o."carrierStatusLabel",o."carrierName",o."trackingCode",o."shippingCost",o."shippingSyncError",
        u."displayName" AS "closedBy", ''::text AS "sourceCreatedBy", ''::text AS "sourceCustomerName",
        o."salesChannel",o."salesSourceName",o."sourcePageId",o."deliveryRegion",o."codStatus"
      FROM "Order" o LEFT JOIN "User" u ON u.id = o."closedByUserId"
      UNION ALL
      SELECT h.id, 'SAPO'::text, h.number, h."customerId", h."orderedAt", h."sourceStatus",
        h.total, h."paidAmount", h."sourcePaymentStatus",h."sourceShippingStatus",'','','',NULL::numeric,'',NULLIF(h."sourceClosedBy", ''),
        h."sourceCreatedBy", h."sourceCustomerName",'UNKNOWN',h."sourceChannel",NULL::text,'UNKNOWN','UNKNOWN'
      FROM "HistoricalOrder" h
    ), filtered AS (
      SELECT f.*, COALESCE(c.name, NULLIF(f."sourceCustomerName", ''), 'Chưa xác định khách') AS "customerName",
        c."regionId", r.name AS "regionName"
      FROM feed f LEFT JOIN "Customer" c ON c.id = f."customerId"
      LEFT JOIN "Region" r ON r.id = c."regionId"
      WHERE ${scope}
        ${range ? Prisma.sql`AND f."orderedAt">=(${range.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND f."orderedAt"<(${range.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')` : Prisma.empty}
        AND (${q.salesChannel || ''}='' OR f."salesChannel"=${q.salesChannel || ''})
        AND (${q.deliveryRegion || ''}='' OR f."deliveryRegion"=${q.deliveryRegion || ''})
        AND (${q.closer || ''}='' OR POSITION(LOWER(${q.closer || ''}) IN LOWER(COALESCE(f."closedBy",'')))>0)
        AND (${q.salesSourceName || ''}='' OR POSITION(LOWER(${q.salesSourceName || ''}) IN LOWER(f."salesSourceName"))>0)
        AND (${q.source} = 'ALL' OR f.source = ${q.source})
        AND (${q.link} = 'ALL' OR (${q.link} = 'LINKED' AND f."customerId" IS NOT NULL)
          OR (${q.link} = 'UNLINKED' AND f."customerId" IS NULL))
        AND (${q.status} = '' OR f.source || ':' || f.status = ${q.status})
        AND (${q.search} = '' OR POSITION(LOWER(${q.search}) IN LOWER(f.number)) > 0
          OR POSITION(LOWER(${q.search}) IN LOWER(f."trackingCode")) > 0
          OR POSITION(LOWER(${q.search}) IN LOWER(COALESCE(c.name, ''))) > 0
          OR POSITION(LOWER(${q.search}) IN LOWER(f."sourceCustomerName")) > 0)
    )`;
    return this.db.$transaction(
      async (tx) => {
        const counts = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`${feed} SELECT COUNT(*) AS total FROM filtered`,
        );
        const items = await tx.$queryRaw<any[]>(Prisma.sql`${feed} SELECT * FROM filtered
        ORDER BY "orderedAt" DESC, source ASC, id DESC
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`);
        const purchases = await purchaseCounts(
          tx,
          items.map((item) => item.customerId).filter(Boolean),
        );
        return {
          items: items.map((item) => ({
            ...item,
            validPurchaseCount: item.customerId ? purchases.get(item.customerId) || 0 : null,
          })),
          total: Number(counts[0].total),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
