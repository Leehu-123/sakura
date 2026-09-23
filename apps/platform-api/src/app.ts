import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Database } from './db';
import { DatabaseModule } from './database.module';
import { Public } from './auth/access';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { SalesModule } from './sales/sales.controller';
import { ImportsModule } from './imports/imports.module';
import { MessengerModule } from './messenger/messenger.module';
import { CatalogModule } from './catalog/catalog.module';
@Controller('health')
@ApiTags('Vận hành')
class HealthController {
  constructor(private readonly db: Database) {}
  @Get() @Public() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CoreModule,
    SalesModule,
    CatalogModule,
    ImportsModule,
    MessengerModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
