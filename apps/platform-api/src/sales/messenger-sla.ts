import { Body, Controller, Get, Injectable, Patch, Query } from '@nestjs/common';
import { IsInt, Matches, IsOptional, Min, Max } from 'class-validator';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal, hasPermission } from '../auth/policy';
import { checkVersion } from '../common/version';
import { reportRange, ReportQuery } from './reports';
class SlaDto {
  @IsInt() @Min(0) version!: number;
  @IsInt() @Min(1) @Max(604800) responseSeconds!: number;
}
class SlaQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
@Injectable()
export class MessengerSla {
  constructor(private readonly db: Database) {}
  async config() {
    const c = await this.db.messengerSlaConfig.findUnique({ where: { id: 1 } });
    return { version: c?.version ?? 0, responseSeconds: c?.responseSeconds ?? 180 };
  }
  async save(actor: Principal, dto: SlaDto) {
    await this.db.$transaction(
      async (tx) => {
        const c = await tx.messengerSlaConfig.findUnique({ where: { id: 1 } });
        checkVersion(c?.version ?? 0, dto.version);
        await tx.messengerSlaConfig.upsert({
          where: { id: 1 },
          create: { responseSeconds: dto.responseSeconds },
          update: { responseSeconds: dto.responseSeconds, version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'messenger.sla_updated',
            entity: 'MessengerSlaConfig',
            entityId: '1',
            metadata: {
              beforeSeconds: c?.responseSeconds ?? 180,
              responseSeconds: dto.responseSeconds,
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return this.config();
  }
  async report(actor: Principal, q: SlaQuery) {
    const range = reportRange(Object.assign(new ReportQuery(), q));
    const config = await this.config(),
      now = new Date();
    const global = hasPermission(actor.grants, 'sales.reports.read', 'GLOBAL');
    const rows = await this.db.$queryRaw<any[]>(Prisma.sql`
      WITH messages AS (
        SELECT m.*,COALESCE(m."responseSentAt",m."sourceAt") at
        FROM "ChatMessage" m WHERE (m.direction='INBOUND' AND m.state='RECEIVED') OR (m.direction='OUTBOUND' AND m.state='SENT')
      ), sequenced AS (
        SELECT *,COALESCE(SUM(CASE WHEN direction='OUTBOUND' THEN 1 ELSE 0 END) OVER (
          PARTITION BY "conversationId" ORDER BY at,CASE WHEN direction='INBOUND' THEN 0 ELSE 1 END,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) grp
        FROM messages WHERE at<=(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      ), episodes AS (
        SELECT "conversationId",grp,MIN(at) FILTER(WHERE direction='INBOUND') started,
          MIN(at) FILTER(WHERE direction='OUTBOUND') answered,
          (array_agg("actorId") FILTER(WHERE direction='OUTBOUND'))[1] responder,
          BOOL_OR(direction='OUTBOUND' AND "responseSentAt" IS NULL AND imported=false) estimated
        FROM sequenced GROUP BY "conversationId",grp
      ), attributed AS (
        SELECT e.*,CASE WHEN answered IS NOT NULL THEN responder ELSE c."supportUserId" END staff
        FROM episodes e JOIN "ChatConversation" c ON c.id=e."conversationId"
        WHERE started>=(${range.start.toISOString()}::timestamptz AT TIME ZONE 'UTC') AND started<(${range.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      ) SELECT u.id,u."displayName",COUNT(*) FILTER(WHERE answered IS NOT NULL)::int answered,
        COUNT(*) FILTER(WHERE answered IS NOT NULL AND EXTRACT(EPOCH FROM answered-started)<=${config.responseSeconds})::int "onTime",
        COUNT(*) FILTER(WHERE answered IS NOT NULL AND EXTRACT(EPOCH FROM answered-started)>${config.responseSeconds})::int late,
        COUNT(*) FILTER(WHERE answered IS NOT NULL AND estimated)::int estimated,
        COUNT(*) FILTER(WHERE answered IS NULL)::int pending,
        COUNT(*) FILTER(WHERE answered IS NULL AND EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')-started)>${config.responseSeconds})::int "pendingLate"
      FROM attributed a LEFT JOIN "User" u ON u.id=a.staff
      WHERE (${global} OR a.staff=${actor.id}::uuid) GROUP BY u.id,u."displayName" ORDER BY u."displayName" NULLS LAST
    `);
    const summary = rows.reduce(
      (s, r) => {
        for (const k of ['answered', 'onTime', 'late', 'pending', 'pendingLate', 'estimated'])
          s[k] += r[k];
        return s;
      },
      { answered: 0, onTime: 0, late: 0, pending: 0, pendingLate: 0, estimated: 0 },
    );
    const rates = (r: any) => ({
      ...r,
      onTimeRate: r.answered ? Math.round((10000 * r.onTime) / r.answered) / 100 : null,
      lateRate: r.answered ? Math.round((10000 * r.late) / r.answered) / 100 : null,
    });
    return {
      ...config,
      from: range.from,
      to: range.to,
      asOf: now.toISOString(),
      summary: rates(summary),
      rows: rows.map(rates),
      scope: global ? 'GLOBAL' : 'ASSIGNED',
    };
  }
}
@Controller('sales/messenger-sla')
export class MessengerSlaController {
  constructor(private readonly sla: MessengerSla) {}
  @Get('config') @RequirePermission('core.messenger.manage') config() {
    return this.sla.config();
  }
  @Patch('config') @RequirePermission('core.messenger.manage') save(
    @CurrentUser() actor: Principal,
    @Body() dto: SlaDto,
  ) {
    return this.sla.save(actor, dto);
  }
  @Get() @RequirePermission('sales.reports.read', 'ASSIGNED') report(
    @CurrentUser() actor: Principal,
    @Query() q: SlaQuery,
  ) {
    return this.sla.report(actor, q);
  }
}
