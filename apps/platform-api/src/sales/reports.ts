import { BadRequestException, Controller, Get, Injectable, Query } from '@nestjs/common';
import { IsIn, IsOptional, Matches, IsString, MaxLength } from 'class-validator';
import { PageDto } from '../core/dto';
import { purchaseCounts } from './purchase-counts';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal, hasPermission } from '../auth/policy';
export class ReportQuery extends PageDto {
  @IsOptional() @IsString() @MaxLength(100) status = '';
  @IsOptional() @IsString() @MaxLength(120) carrier = '';
  @IsOptional() @IsString() @MaxLength(100) product = '';
  @IsOptional() @IsIn(['window', 'week', 'month', 'quarter', 'year']) compareUnit = 'window';
  @IsOptional() @IsIn(['month', 'quarter', 'week']) comparisonUnit = 'month';
  @IsOptional() @IsString() @MaxLength(100) team = '';
  @IsOptional() @IsIn(['auto', 'day', 'week', 'month', 'quarter']) bucket = 'auto';
  @IsOptional() @IsIn(['', 'UNKNOWN', 'PAGE', 'ZALO', 'SELF', 'OTHER']) salesChannel = '';
  @IsOptional() @IsString() @MaxLength(150) salesSourceName = '';
  @IsOptional() @IsString() @MaxLength(100) staff = '';
  @IsOptional() @IsIn(['', 'UNKNOWN', 'NORTH', 'CENTRAL', 'SOUTH', 'HIGHLANDS']) deliveryRegion =
    '';
  @IsOptional()
  @IsIn([
    'ALL',
    'VALID',
    'PAID',
    'UNPAID',
    'CUSTOMERS',
    'CANCELLED',
    'RETURNED',
    'SHIPPING_CHARGED',
    'SHIPPING_ESTIMATED',
    'SHIPPING_ACTUAL',
    'SHIPPING_UNKNOWN',
    'SHIPPING_COMPARABLE',
  ])
  metric = 'ALL';
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
  let previousStart = new Date(start.getTime() - days * 86400000),
    previousEnd = start;
  const year = Number(from.slice(0, 4)),
    month = Number(from.slice(5, 7)) - 1;
  const vnDate = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - 7 * 3600000);
  if (q.compareUnit === 'week') {
    const weekday = new Date(start.getTime() + 7 * 3600000).getUTCDay();
    previousEnd = new Date(start.getTime() - ((weekday + 6) % 7) * 86400000);
    previousStart = new Date(previousEnd.getTime() - 7 * 86400000);
  } else if (q.compareUnit === 'month') {
    previousEnd = vnDate(year, month);
    previousStart = vnDate(year, month - 1);
  } else if (q.compareUnit === 'quarter') {
    const qMonth = Math.floor(month / 3) * 3;
    previousEnd = vnDate(year, qMonth);
    previousStart = vnDate(year, qMonth - 3);
  } else if (q.compareUnit === 'year') {
    previousEnd = vnDate(year, 0);
    previousStart = vnDate(year - 1, 0);
  }
  return { from, to, start, end, previousStart, previousEnd, days };
}
@Injectable()
export class SalesReports {
  constructor(private readonly db: Database) {}
  async read(actor: Principal, q: ReportQuery, details = false) {
    const r = reportRange(q);
    const comparisonUnit = q.comparisonUnit || 'month';
    const monthCount =
      comparisonUnit === 'quarter' ? 12 : comparisonUnit === 'week' ? 1 : Number(q.months || 6);
    const endMonth =
      comparisonUnit === 'quarter'
        ? Math.floor((Number(r.to.slice(5, 7)) - 1) / 3) * 3 + 3
        : Number(r.to.slice(5, 7));
    const monthLabels = Array.from({ length: monthCount }, (_, i) => {
      const d = new Date(Date.UTC(Number(r.to.slice(0, 4)), endMonth - monthCount + i, 1));
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
      CASE WHEN o.status IN ('CONFIRMED','COMPLETED') THEN 'VALID' WHEN o.status='CANCELLED' THEN 'CANCELLED' WHEN o.status='RETURNED' THEN 'RETURNED' ELSE 'DRAFT' END category,
      COALESCE(u."displayName",'Chưa ghi nhận') closer,COALESCE(o."closedByUserId"::text,'unknown') "closerKey",
      'SK-' || o.number::text number, ''::text "sourceCustomerName", o."salesChannel", COALESCE(NULLIF(o."salesSourceName",''),o."sourcePageId",'') "salesSourceName", o."deliveryRegion", o."shippingStatus"::text "shippingStatus", o."promisedDeliveryAt", o."deliveredAt",o."salesTeamName",o."sourcePageId"
      FROM "Order" o LEFT JOIN "User" u ON u.id=o."closedByUserId" WHERE o."createdAt">=(${feedStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND o."createdAt"<(${r.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      UNION ALL
      SELECT h.id,'SAPO',h."customerId",h."orderedAt",h.total,h."paidAmount",h."sourceStatus",
      h."shippingFee",NULL::numeric,NULL::numeric,'Sapo (chưa có dữ liệu đối tác)',
      CASE WHEN lower(translate(trim(h."sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('đã hoàn thành','hoàn thành','đang giao dịch','đã xác nhận','completed','confirmed') THEN 'VALID'
      WHEN lower(translate(trim(h."sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('đã hủy','đã huỷ','hủy','huỷ','cancelled','canceled') THEN 'CANCELLED'
      WHEN lower(translate(trim(h."sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('hàng hoàn','hoàn hàng','đã hoàn hàng','trả hàng','đã trả hàng','returned') THEN 'RETURNED'
      WHEN lower(translate(trim(h."sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('đặt hàng','nháp','draft') THEN 'DRAFT' ELSE 'UNKNOWN' END,
      COALESCE(NULLIF(h."sourceClosedBy",''),'Chưa ghi nhận'),COALESCE(NULLIF(h."sourceClosedBy",''),'unknown'),
      h.number,h."sourceCustomerName",'UNKNOWN',h."sourceChannel",'UNKNOWN',h."sourceShippingStatus",NULL::timestamp,NULL::timestamp,''::text,NULL::text
      FROM "HistoricalOrder" h WHERE h."orderedAt">=(${feedStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND h."orderedAt"<(${r.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    ), visible AS(SELECT * FROM feed f WHERE ${scope} AND (${source}='ALL' OR source=${source})
      AND (${q.salesChannel || ''}='' OR "salesChannel"=${q.salesChannel || ''})
      AND (${q.salesSourceName || ''}='' OR POSITION(LOWER(${q.salesSourceName || ''}) IN LOWER("salesSourceName"))>0)
      AND (${q.staff || ''}='' OR POSITION(LOWER(${q.staff || ''}) IN LOWER(closer))>0)
      AND (${q.deliveryRegion || ''}='' OR "deliveryRegion"=${q.deliveryRegion || ''})
      AND (${q.team || ''}='' OR POSITION(LOWER(${q.team || ''}) IN LOWER("salesTeamName"))>0)
      AND (${q.status || ''}='' OR source||':'||status=${q.status || ''})
      AND (${q.carrier || ''}='' OR POSITION(LOWER(${q.carrier || ''}) IN LOWER(carrier))>0)
    ), current AS(SELECT * FROM visible WHERE at>=(${r.start.toISOString()}::timestamptz AT TIME ZONE 'UTC'))`;
    if (details) {
      const filters: Record<string, Prisma.Sql> = {
        ALL: Prisma.sql`TRUE`,
        VALID: Prisma.sql`category='VALID'`,
        PAID: Prisma.sql`category='VALID' AND paid>0`,
        UNPAID: Prisma.sql`category='VALID' AND paid IS NOT NULL AND total>paid`,
        CUSTOMERS: Prisma.sql`category='VALID' AND "customerId" IS NOT NULL`,
        CANCELLED: Prisma.sql`category='CANCELLED'`,
        RETURNED: Prisma.sql`category='RETURNED'`,
        SHIPPING_CHARGED: Prisma.sql`category='VALID' AND "shippingCharged" IS NOT NULL`,
        SHIPPING_ESTIMATED: Prisma.sql`category<>'DRAFT' AND "shippingEstimated" IS NOT NULL`,
        SHIPPING_ACTUAL: Prisma.sql`category<>'DRAFT' AND "shippingActual" IS NOT NULL`,
        SHIPPING_UNKNOWN: Prisma.sql`category<>'DRAFT' AND "shippingActual" IS NULL`,
        SHIPPING_COMPARABLE: Prisma.sql`"shippingActual" IS NOT NULL AND (category IN ('CANCELLED','RETURNED') OR (category='VALID' AND "shippingCharged" IS NOT NULL))`,
      };
      const rows = Prisma.sql`${base}, detail AS (SELECT ${q.metric === 'CUSTOMERS' ? Prisma.sql`DISTINCT ON (f."customerId")` : Prisma.empty} f.*,COALESCE(c.name,NULLIF(f."sourceCustomerName",''),'Chưa liên kết khách') "customerName" FROM current f LEFT JOIN "Customer" c ON c.id=f."customerId" WHERE ${filters[q.metric || 'ALL']} ${q.metric === 'CUSTOMERS' ? Prisma.sql`ORDER BY f."customerId",at DESC,f.id` : Prisma.empty})`;
      return this.db.$transaction(
        async (tx) => {
          const count = await tx.$queryRaw<{ total: number }[]>(
            Prisma.sql`${rows} SELECT COUNT(*)::int total FROM detail`,
          );
          const items = await tx.$queryRaw(
            Prisma.sql`${rows} SELECT * FROM detail ORDER BY at DESC,source,id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
          );
          return { items, total: count[0].total, page: q.page, pageSize: q.pageSize };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    }
    const metrics = Prisma.sql`COUNT(*)::int orders,COUNT(*) FILTER(WHERE category='VALID')::int "validOrders",
      COUNT(*) FILTER(WHERE "shippingStatus"='DELIVERED' AND "promisedDeliveryAt" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "deliveredAt"<="promisedDeliveryAt")::int "deliveredOnTime",
      COUNT(*) FILTER(WHERE "shippingStatus"='DELIVERED' AND "promisedDeliveryAt" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "deliveredAt">"promisedDeliveryAt")::int "deliveredLate",
      COUNT(*) FILTER(WHERE "shippingStatus"='DELIVERED' AND ("promisedDeliveryAt" IS NULL OR "deliveredAt" IS NULL))::int "deliveryUnknown",
      COUNT(*) FILTER(WHERE "shippingStatus"='RETURNED' OR category='RETURNED')::int "shippingReturned",
      COUNT(*) FILTER(WHERE "shippingStatus"='CANCELLED' OR category='CANCELLED')::int "shippingCancelled",
      COUNT(*) FILTER(WHERE category='RETURNED')::int returned,
      COALESCE(ROUND(100.0 * COUNT(*) FILTER(WHERE category='RETURNED') / NULLIF(COUNT(*) FILTER(WHERE category IN ('VALID','RETURNED')),0),2),0)::float8 "returnRate",
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
      COUNT(*) FILTER(WHERE category<>'DRAFT' AND "shippingActual" IS NOT NULL AND (category IN ('CANCELLED','RETURNED') OR (category='VALID' AND "shippingCharged" IS NOT NULL)))::int "shippingComparedOrders",
      COALESCE(SUM((CASE WHEN category='VALID' THEN "shippingCharged" ELSE 0 END)-"shippingActual") FILTER(WHERE "shippingActual" IS NOT NULL AND (category IN ('CANCELLED','RETURNED') OR (category='VALID' AND "shippingCharged" IS NOT NULL))),0)::text "shippingDifference"`;
    return this.db.$transaction(
      async (tx) => {
        const summary = await tx.$queryRaw<any[]>(
          Prisma.sql`${base} SELECT ${metrics} FROM current`,
        );
        const previous = await tx.$queryRaw<any[]>(
          Prisma.sql`${base} SELECT ${metrics} FROM visible WHERE at>=(${r.previousStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND at<(${r.previousEnd.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
        );
        const monthly = await tx.$queryRaw<any[]>(
          Prisma.sql`${base} SELECT to_char(at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM') label,${metrics} FROM visible WHERE at>=(${monthStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') GROUP BY label ORDER BY label`,
        );
        const empty = Object.fromEntries(
          Object.entries(summary[0]).map(([k, v]) => [k, typeof v === 'number' ? 0 : '0']),
        );
        let comparison = monthLabels.map((label) => ({
          ...empty,
          ...monthly.find((row) => row.label === label),
          label,
        }));
        if (comparisonUnit !== 'month') {
          const periods = await tx.$queryRaw<any[]>(
            Prisma.sql`${base} SELECT to_char(date_trunc(${comparisonUnit},at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'),'YYYY-MM-DD') label,${metrics} FROM visible WHERE at>=(${monthStart.toISOString()}::timestamptz AT TIME ZONE 'UTC') GROUP BY label ORDER BY label`,
          );
          const labels: string[] = [];
          if (comparisonUnit === 'quarter') {
            for (let i = 0; i < 12; i += 3) labels.push(monthLabels[i] + '-01');
          } else {
            const day = new Date(monthStart.getTime() + 7 * 3600000).getUTCDay();
            let cursor = monthStart.getTime() - ((day + 6) % 7) * 86400000;
            while (cursor < r.end.getTime()) {
              labels.push(new Date(cursor + 7 * 3600000).toISOString().slice(0, 10));
              cursor += 7 * 86400000;
            }
          }
          comparison = labels.map((label) => ({
            ...empty,
            ...periods.find((row) => row.label === label),
            label,
          }));
        }
        comparison = comparison.map((row) => {
          const start = new Date(
            (row.label.length === 7 ? row.label + '-01' : row.label) + 'T00:00:00+07:00',
          );
          const end =
            comparisonUnit === 'week'
              ? new Date(start.getTime() + 7 * 86400000)
              : new Date(
                  Date.UTC(
                    Number(row.label.slice(0, 4)),
                    Number(row.label.slice(5, 7)) - 1 + (comparisonUnit === 'quarter' ? 3 : 1),
                    1,
                  ) -
                    7 * 3600000,
                );
          return { ...row, partial: start < monthStart || end > r.end };
        });
        const bucket =
          !q.bucket || q.bucket === 'auto' ? (r.days > 62 ? 'month' : 'day') : q.bucket;
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
        const salesSources = await tx.$queryRaw(
          Prisma.sql`${base} SELECT "salesChannel","sourcePageId",COALESCE(NULLIF(MAX("salesSourceName"),''),'Chưa ghi nhận') label,${metrics} FROM current GROUP BY "salesChannel","sourcePageId",CASE WHEN "sourcePageId" IS NULL THEN "salesSourceName" ELSE '' END ORDER BY SUM(total) FILTER(WHERE category='VALID') DESC NULLS LAST`,
        );
        const deliveryRegions = await tx.$queryRaw(
          Prisma.sql`${base} SELECT "deliveryRegion" label,${metrics} FROM current GROUP BY "deliveryRegion" ORDER BY "deliveryRegion"`,
        );
        const buyingCustomers = await tx.$queryRaw<{ customerId: string }[]>(
          Prisma.sql`${base} SELECT DISTINCT "customerId" FROM current WHERE category='VALID' AND "customerId" IS NOT NULL`,
        );
        const lifetimeCounts = await purchaseCounts(
          tx,
          buyingCustomers.map((row) => row.customerId),
        );
        const customerSegments = { once: 0, repeat: 0 };
        for (const row of buyingCustomers) {
          const count = lifetimeCounts.get(row.customerId) || 0;
          if (count === 1) customerSegments.once++;
          else if (count > 1) customerSegments.repeat++;
        }
        const teams = await tx.$queryRaw(
          Prisma.sql`${base} SELECT COALESCE(NULLIF("salesTeamName",''),'Chưa ghi nhận') label,${metrics} FROM current GROUP BY "salesTeamName" ORDER BY label`,
        );
        const products = await tx.$queryRaw(Prisma.sql`${base}, lines AS (
          SELECT f.source,f."deliveryRegion",i."productName",i.sku,i.unit,i.quantity::numeric quantity,i."lineTotal",COALESCE(NULLIF(p.category,''),'Chưa phân nhóm') category
          FROM current f JOIN "OrderItem" i ON i."orderId"=f.id JOIN "ProductVariant" v ON v.id=i."variantId" JOIN "Product" p ON p.id=v."productId" WHERE f.source='SAKURA' AND f.category='VALID'
          UNION ALL
          SELECT f.source,f."deliveryRegion",COALESCE(j->>'productName','Chưa có tên'),COALESCE(j->>'sku',''),COALESCE(NULLIF(j->>'unit',''),'Chưa có đơn vị'),
            CASE WHEN j->>'quantity' ~ '^[0-9]{1,12}$' THEN (j->>'quantity')::numeric ELSE NULL END,
            CASE WHEN j->>'lineTotal' ~ '^[0-9]{1,15}$' THEN (j->>'lineTotal')::numeric ELSE NULL END,COALESCE(NULLIF(p.category,''),'Chưa ghép nhóm')
          FROM current f JOIN "HistoricalOrder" h ON h.id=f.id CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(h.items)='array' THEN h.items ELSE '[]'::jsonb END) j
          LEFT JOIN "ProductVariant" v ON v.sku=j->>'sku' LEFT JOIN "Product" p ON p.id=v."productId" WHERE f.source='SAPO' AND f.category='VALID'
        ) SELECT source,"deliveryRegion",category,"productName",sku,unit,COALESCE(SUM(quantity),0)::text quantity,COALESCE(SUM("lineTotal"),0)::text sales,
          COUNT(*) FILTER(WHERE quantity IS NULL OR "lineTotal" IS NULL)::int "missingLines" FROM lines
          WHERE (${q.product || ''}='' OR POSITION(LOWER(${q.product || ''}) IN LOWER("productName"||' '||sku||' '||category))>0)
          GROUP BY source,"deliveryRegion",category,"productName",sku,unit ORDER BY SUM("lineTotal") DESC NULLS LAST,source,sku LIMIT 200`);
        return {
          from: r.from,
          to: r.to,
          source,
          bucket,
          comparison,
          comparisonUnit,
          comparisonFrom: monthLabels[0] + '-01',
          comparisonTo: r.to,
          summary: summary[0],
          previous: previous[0],
          previousFrom: new Date(r.previousStart.getTime() + 7 * 3600000)
            .toISOString()
            .slice(0, 10),
          previousTo: new Date(r.previousEnd.getTime() - 1 + 7 * 3600000)
            .toISOString()
            .slice(0, 10),
          timeline,
          sources,
          staff,
          statuses,
          carriers,
          salesSources,
          deliveryRegions,
          teams,
          products,
          customerSegments,
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
  @Get('orders') details(@CurrentUser() actor: Principal, @Query() q: ReportQuery) {
    return this.reports.read(actor, q, true);
  }
}
