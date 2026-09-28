import { Body, Controller, Get, Injectable, Patch } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, Min } from 'class-validator';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { checkVersion } from '../common/version';

class AiPreferencesDto {
  @IsInt() @Min(0) version!: number;
  @IsIn(['OPENAI', 'GEMINI']) provider!: string;
  @IsBoolean() allowWeb!: boolean;
}
@Injectable()
export class ReportAiSettings {
  constructor(private readonly db: Database) {}
  async read() {
    const c = await this.db.reportAiConfig.findUnique({ where: { id: 1 } });
    return {
      version: c?.version || 0,
      provider: c?.provider || 'OPENAI',
      allowWeb: c?.allowWeb || false,
      status: 'AWAITING_API_SETUP',
      enabled: false,
    };
  }
  async save(actor: Principal, dto: AiPreferencesDto) {
    await this.db.$transaction(
      async (tx) => {
        const c = await tx.reportAiConfig.findUnique({ where: { id: 1 } });
        checkVersion(c?.version || 0, dto.version);
        const data = { provider: dto.provider, allowWeb: dto.allowWeb };
        await tx.reportAiConfig.upsert({
          where: { id: 1 },
          create: data,
          update: { ...data, version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'reports.ai.preferences',
            entity: 'ReportAiConfig',
            entityId: '1',
            metadata: data,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return this.read();
  }
}
@Controller('sales/report-ai')
export class ReportAiController {
  constructor(private readonly settings: ReportAiSettings) {}
  @Get('status') @RequirePermission('sales.reports.read', 'ASSIGNED') status() {
    return this.settings.read();
  }
  @Get('config') @RequirePermission('core.ai.manage') config() {
    return this.settings.read();
  }
  @Patch('config') @RequirePermission('core.ai.manage') save(
    @CurrentUser() a: Principal,
    @Body() d: AiPreferencesDto,
  ) {
    return this.settings.save(a, d);
  }
}
