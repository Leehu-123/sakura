import { BadRequestException, Controller, Get, Injectable, Query } from '@nestjs/common';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal, hasPermission } from '../auth/policy';
export class ReportQuery {
  @IsOptional() @IsIn(['3', '6', '12']) months = '6';
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsIn(['ALL', 'SAKURA', 'SAPO']) source = 'ALL';
}
export function reportRange(q: ReportQuery, now = new Date()) {
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const from = q.from || today.slice(0, 8) + '01',
    to = q.to || today;
  const parse = (s: string) => {
    const d = new Date(s + 'T00:00:00+07:00');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      !Number.isFinite(d.getTime()) ||
      new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== s
    )
      throw new BadRequestException('Ngày báo cáo không hợp lệ.');
    return d;
  };
  const start = parse(from),
    end = new Date(parse(to).getTime() + 86400000),
    days = (end.getTime() - start.getTime()) / 86400000;
  if (days < 1 || days > 366)
    throw new BadRequestException('Chọn khoảng thời gian từ 1 đến 366 ngày.');
  return { from, to, start, end, previousStart: new Date(start.getTime() - days * 86400000), days };
}
@Injectable()
export class SalesReports {
  constructor(private readonly db: Database) {}
  async read(actor: Principal, q: ReportQuery) {
    const r = reportRange(q);
    const monthLabels = Array.from({ length: Number(q.months || 6) }, (_, i) => {
      const d = new Date(
        Date.UTC(Number(r.to.slice(0, 4)), Number(r.to.slice(5, 7)) - Number(q.months || 6) + i, 1),
      );
      return d.toISOString().slice(0, 7);
    });
    const monthStart = new Date(monthLabels[0] + '-01T00:00:00+07:00');
    const feedStart = new Date(Math.min(r.previousStart.getTime(), monthStart.getTime()));
    const source = q.source || 'ALL';
    const scope = hasPermission(actor.grants, 'sales.reports.read', 'GLOBAL')
      ? Prisma.sql`TRUE`
      : hasPermission(actor.grants, 'sales.reports.read', 'ASSIGNED')
        ? Prisma.sql`EXISTS(SELECT 1 FROM "CustomerAssignment" a WHERE a."customerId"=f."customerId" AND a."userId"=${actor.id}::uuid AND a."endedAt" IS NULL)`
        : Prisma.sql`FALSE`;
    const base = Prisma.sql`WITH feed AS (
      SELECT o.id,'SAKURA'::text source,o."customerId",o."createdAt" at,o.total,o."paidAmount" paid,o.status::text status,
      o."shippingFee" "shippingCharged",o."shippingCost" "shippingActual",o."carrierEstimatedFee" "shippingEstimated",COALESCE(NULLIF(o."carrierName",''),'Chưa có đối tác') carrier,
      CASE WHEN o.status IN ('CONFIRMED','COMPLETED') THEN 'VALID' WHEN o.status='CANCELLED' THEN 'CANCELLED' ELSE 'DRAFT' END category,
      COALESCE(u."displayName",'Chưa ghi nhận') closer,COALESCE(o."closedByUserId"::text,'unknown') "closerKey"
      FROM "Order" o LEFT JOIN "User" u ON u.id=o."closedByUserId" WHERE o."createdAt">=(${feedStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND o."createdAt"<(${r.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      UNION ALL
      SELECT h.id,'SAPO',h."customerId",h."orderedAt",h.total,h."paidAmount",h."sourceStatus",
      h."shippingFee",NULL::numeric,NULL::numeric,'Sapo (chưa có dữ liệu đối tác)',
      CASE WHEN lower(translate(trim(h."sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('đã hoàn thành','hoàn thành','đang giao dịch','đã xác nhận','completed','confirmed') THEN 'VALID'
      WHEN lower(translate(trim(h."sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('đã hủy','đã huỷ','hủy','huỷ','cancelled','canceled') THEN 'CANCELLED'
      WHEN lower(translate(trim(h."sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('đặt hàng','nháp','draft') THEN 'DRAFT' ELSE 'UNKNOWN' END,
      COALESCE(NULLIF(h."sourceClosedBy",''),'Chưa ghi nhận'),COALESCE(NULLIF(h."sourceClosedBy",''),'unknown')
      FROM "HistoricalOrder" h WHERE h."orderedAt">=(${feedStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND h."orderedAt"<(${r.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    ), visible AS(SELECT * FROM feed f WHERE ${scope} AND (${source}='ALL' OR source=${source})), current AS(SELECT * FROM visible WHERE at>=(${r.start.toISOString()}::timestamptz AT TIME ZONE 'UTC'))`;
    const metrics = Prisma.sql`COUNT(*)::int orders,COUNT(*) FILTER(WHERE category='VALID')::int "validOrders",
      COUNT(*) FILTER(WHERE category='CANCELLED')::int cancelled,COUNT(*) FILTER(WHERE category='DRAFT')::int draft,
      COUNT(*) FILTER(WHERE category='UNKNOWN')::int unclassified,
      COALESCE(SUM(total) FILTER(WHERE category='VALID'),0)::text sales,
      COALESCE(SUM(paid) FILTER(WHERE category='VALID'),0)::text paid,
      COALESCE(SUM(GREATEST(total-paid,0)) FILTER(WHERE category='VALID' AND paid IS NOT NULL),0)::text unpaid,
      COUNT(*) FILTER(WHERE category='VALID' AND paid IS NULL)::int "unknownPayments",
      COUNT(DISTINCT "customerId") FILTER(WHERE category='VALID')::int customers,
      COALESCE(SUM("shippingCharged") FILTER(WHERE category='VALID'),0)::text "shippingCharged",
      COALESCE(SUM("shippingEstimated") FILTER(WHERE category<>'DRAFT'),0)::text "shippingEstimated",
      COALESCE(SUM("shippingActual") FILTER(WHERE category<>'DRAFT'),0)::text "shippingActual",
      COUNT(*) FILTER(WHERE category<>'DRAFT' AND "shippingActual" IS NULL)::int "shippingUnknown",
      COUNT(*) FILTER(WHERE category='VALID' AND "shippingCharged" IS NULL)::int "shippingChargedUnknown",
      COUNT(*) FILTER(WHERE category<>'DRAFT' AND "shippingEstimated" IS NOT NULL)::int "shippingEstimatedOrders",
      COUNT(*) FILTER(WHERE category<>'DRAFT' AND "shippingActual" IS NOT NULL AND (category='CANCELLED' OR (category='VALID' AND "shippingCharged" IS NOT NULL)))::int "shippingComparedOrders",
      COALESCE(SUM((CASE WHEN category='VALID' THEN "shippingCharged" ELSE 0 END)-"shippingActual") FILTER(WHERE "shippingActual" IS NOT NULL AND (category='CANCELLED' OR (category='VALID' AND "shippingCharged" IS NOT NULL))),0)::text "shippingDifference"`;
    return this.db.$transaction(
      async (tx) => {
        const summary = await tx.$queryRaw<any[]>(
          Prisma.sql`${base} SELECT ${metrics} FROM current`,
        );
        const previous = await tx.$queryRaw<any[]>(
          Prisma.sql`${base} SELECT ${metrics} FROM visible WHERE at>=(${r.previousStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND at<(${r.start.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
        );
        const monthly = await tx.$queryRaw<any[]>(
          Prisma.sql`${base} SELECT to_char(at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM') label,${metrics} FROM visible WHERE at>=(${monthStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') GROUP BY label ORDER BY label`,
        );
        const empty = Object.fromEntries(
          Object.entries(summary[0]).map(([k, v]) => [k, typeof v === 'number' ? 0 : '0']),
        );
        const comparison = monthLabels.map((label) => ({
          ...empty,
          ...monthly.find((row) => row.label === label),
          label,
        }));
        const bucket = r.days > 62 ? 'month' : 'day';
        const timeline = await tx.$queryRaw(
          Prisma.sql`${base} SELECT to_char(date_trunc(${bucket},at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'),'YYYY-MM-DD') label,${metrics} FROM current GROUP BY label ORDER BY label`,
        );
        const sources = await tx.$queryRaw(
          Prisma.sql`${base} SELECT source label,${metrics} FROM current GROUP BY source ORDER BY source`,
        );
        const staff = await tx.$queryRaw(
          Prisma.sql`${base} SELECT source,closer label,${metrics} FROM current GROUP BY source,"closerKey",closer ORDER BY SUM(total) FILTER(WHERE category='VALID') DESC NULLS LAST LIMIT 50`,
        );
        const statuses = await tx.$queryRaw(
          Prisma.sql`${base} SELECT source,status label,category,COUNT(*)::int orders,SUM(total)::text value FROM current GROUP BY source,status,category ORDER BY source,orders DESC`,
        );
        const carriers = await tx.$queryRaw(
          Prisma.sql`${base} SELECT carrier label,${metrics} FROM current GROUP BY carrier ORDER BY carrier`,
        );
        return {
          from: r.from,
          to: r.to,
          source,
          bucket,
          comparison,
          comparisonFrom: monthLabels[0] + '-01',
          comparisonTo: r.to,
          summary: summary[0],
          previous: previous[0],
          timeline,
          sources,
          staff,
          statuses,
          carriers,
          scope: hasPermission(actor.grants, 'sales.reports.read', 'GLOBAL')
            ? 'GLOBAL'
            : 'ASSIGNED',
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 20000 },
    );
  }
}
@Controller('sales/reports')
@RequirePermission('sales.reports.read', 'ASSIGNED')
export class ReportsController {
  constructor(private readonly reports: SalesReports) {}
  @Get() read(@CurrentUser() actor: Principal, @Query() q: ReportQuery) {
    return this.reports.read(actor, q);
  }
}
