import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentUser, RequirePermission } from '../auth/access';
import { hasPermission, Principal } from '../auth/policy';
import { Database } from '../db';
import { Prisma } from '@sakura/database';
class ProductivityQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(168) overdueHours = 4;
}
@Injectable()
export class ProductivityService {
  constructor(private readonly db: Database) {}
  async read(actor: Principal, query: ProductivityQuery) {
    const global = hasPermission(actor.grants, 'sales.reports.read', 'GLOBAL');
    const now = new Date(),
      cutoff = new Date(now.getTime() - query.overdueHours * 3600000);
    const rows = await this.db.$queryRaw(Prisma.sql`
      WITH people AS (
        SELECT u.id,u."displayName" FROM "User" u WHERE u.status='ACTIVE' AND (${global} OR u.id=${actor.id}::uuid)
        AND EXISTS(SELECT 1 FROM "UserRoleAssignment" a JOIN "RolePermission" rp ON rp."roleId"=a."roleId" JOIN "Permission" p ON p.id=rp."permissionId" WHERE a."userId"=u.id AND p.code='sales.customers.read')
      ), care AS (
        SELECT a."userId",COUNT(*)::int managed,COUNT(*) FILTER(WHERE
          c."nextContactDate"<(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC') OR
          (c.status='NEW' AND (c."lastContactDate" IS NULL OR c."lastContactDate"<(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')-INTERVAL '3 days')) OR
          (c.status='CONSULTING' AND (c."lastContactDate" IS NULL OR c."lastContactDate"<(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')-INTERVAL '7 days')) OR
          (c.status IN ('RETURNING','INACTIVE') AND (c."lastContactDate" IS NULL OR c."lastContactDate"<(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')-INTERVAL '15 days'))
        )::int overdue FROM "CustomerAssignment" a JOIN "Customer" c ON c.id=a."customerId" JOIN people p ON p.id=a."userId" WHERE a."endedAt" IS NULL GROUP BY a."userId"
      ), waiting AS (
        SELECT c.id,c."supportUserId",MIN(m."sourceAt") since FROM "ChatConversation" c JOIN people p ON p.id=c."supportUserId"
        JOIN "ChatMessage" m ON m."conversationId"=c.id AND m.direction='INBOUND' AND m."sourceAt">COALESCE(c."lastSentAt",'1970-01-01'::timestamp)
        AND m."sourceAt"<=(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC') WHERE c.blocked=false GROUP BY c.id,c."supportUserId"
      ), replies AS (
        SELECT "supportUserId",COUNT(*)::int waiting,COUNT(*) FILTER(WHERE since<(${cutoff.toISOString()}::timestamptz AT TIME ZONE 'UTC'))::int late FROM waiting GROUP BY "supportUserId"
      ) SELECT p.id,p."displayName",COALESCE(c.managed,0)::int managed,COALESCE(c.overdue,0)::int overdue,COALESCE(r.waiting,0)::int waiting,COALESCE(r.late,0)::int late,
        CASE WHEN COALESCE(c.managed,0)=0 THEN NULL ELSE ROUND(100.0*c.overdue/c.managed,2)::float8 END "overdueRate",
        CASE WHEN COALESCE(r.waiting,0)=0 THEN NULL ELSE ROUND(100.0*r.late/r.waiting,2)::float8 END "waitingLateRate"
      FROM people p LEFT JOIN care c ON c."userId"=p.id LEFT JOIN replies r ON r."supportUserId"=p.id ORDER BY p."displayName",p.id
    `);
    return {
      rows,
      overdueHours: query.overdueHours,
      asOf: now.toISOString(),
      scope: global ? 'GLOBAL' : 'ASSIGNED',
    };
  }
}
@Controller('sales/productivity')
@RequirePermission('sales.reports.read', 'ASSIGNED')
export class ProductivityController {
  constructor(private readonly service: ProductivityService) {}
  @Get() read(@CurrentUser() actor: Principal, @Query() query: ProductivityQuery) {
    return this.service.read(actor, query);
  }
}
