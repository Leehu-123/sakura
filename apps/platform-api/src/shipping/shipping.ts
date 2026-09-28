import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Injectable,
  Module,
  OnModuleInit,
  OnModuleDestroy,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsString,
  Min,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { createHash } from 'node:crypto';
import { Order } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal, orderPredicate } from '../auth/policy';
import { seal, unseal } from '../messenger/connection-crypto';
import { VersionDto, checkVersion } from '../common/version';
import { isVnpost, VnpostGateway } from './vnpost';

class ConnectDto {
  @IsInt() @Min(0) version!: number;
  @IsString() @MinLength(1) @MaxLength(255) username!: string;
  @IsString() @MinLength(1) @MaxLength(255) password!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,20}$/) customerCode!: string;
}
class EnableDto extends VersionDto {
  @IsBoolean() enabled!: boolean;
}
class CostDto extends VersionDto {
  @ValidateIf((_o, v) => v !== null) @IsString() @Matches(/^\d{1,12}$/) amount!: string | null;
  @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}
@Injectable()
export class ShippingService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private polling = false;
  private active = new Set<string>();
  constructor(
    private readonly db: Database,
    private readonly gateway: VnpostGateway,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.poll().catch(() => undefined);
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async config() {
    const c = await this.db.shippingConnection.findUnique({ where: { id: 1 } });
    return {
      version: c?.version || 0,
      connected: !!c,
      customerCode: c?.customerCode || '',
      enabled: c?.enabled || false,
      updatedAt: c?.updatedAt || null,
    };
  }
  async connect(actor: Principal, dto: ConnectDto) {
    const old = await this.config();
    checkVersion(old.version, dto.version);
    const token = await this.gateway.login(
      'PRODUCTION',
      dto.username.trim(),
      dto.password,
      dto.customerCode,
    );
    await this.db.$transaction(
      async (tx) => {
        const current = await tx.shippingConnection.findUnique({ where: { id: 1 } });
        checkVersion(current?.version || 0, dto.version);
        await tx.shippingConnection.upsert({
          where: { id: 1 },
          create: {
            customerCode: dto.customerCode,
            tokenEncrypted: seal(token, 'shipping:vnpost'),
            enabled: true,
          },
          update: {
            customerCode: dto.customerCode,
            tokenEncrypted: seal(token, 'shipping:vnpost'),
            enabled: true,
            version: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'shipping.connected',
            entity: 'ShippingConnection',
            entityId: '1',
            metadata: { provider: 'VNPOST', customerCode: dto.customerCode },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return this.config();
  }
  async enable(actor: Principal, dto: EnableDto) {
    const result = await this.db.shippingConnection.updateMany({
      where: { id: 1, version: dto.version },
      data: { enabled: dto.enabled, version: { increment: 1 } },
    });
    if (!result.count) throw new ConflictException('Cấu hình đã thay đổi. Hãy tải lại.');
    await this.db.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'shipping.enabled',
        entity: 'ShippingConnection',
        entityId: '1',
        metadata: { enabled: dto.enabled },
      },
    });
    return this.config();
  }
  private async visible(actor: Principal, id: string, permission: string) {
    const o = await this.db.order.findFirst({
      where: { AND: [{ id }, orderPredicate(actor, permission)] },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn trong phạm vi của bạn.');
    return o;
  }
  async history(actor: Principal, id: string) {
    await this.visible(actor, id, 'sales.orders.read');
    return this.db.shippingEvent.findMany({
      where: { orderId: id },
      orderBy: [{ carrierUpdatedAt: 'desc' }, { observedAt: 'desc' }],
      take: 50,
    });
  }
  async cost(actor: Principal, id: string, dto: CostDto) {
    if (!dto.note.trim() || dto.note.trim().length < 3)
      throw new BadRequestException('Nhập ghi chú đối soát.');
    return this.db.$transaction(
      async (tx) => {
        const o = await tx.order.findFirst({
          where: { AND: [{ id }, orderPredicate(actor, 'sales.shipments.manage')] },
        });
        if (!o) throw new NotFoundException('Không tìm thấy đơn trong phạm vi của bạn.');
        checkVersion(o.version, dto.version);
        if (o.status === 'DRAFT')
          throw new BadRequestException('Chốt đơn trước khi ghi phí thực trả.');
        await tx.order.update({
          where: { id },
          data: {
            shippingCost: dto.amount,
            shippingCostNote: dto.note.trim(),
            version: { increment: 1 },
            history: {
              create: {
                actorId: actor.id,
                action: 'shipping_cost',
                note: `Phí vận chuyển thực trả: ${dto.amount === null ? 'chưa xác định' : dto.amount + ' đ'}. ${dto.note.trim()}`,
              },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'order.shipping_cost',
            entity: 'Order',
            entityId: id,
            metadata: {
              before: o.shippingCost?.toString() ?? null,
              after: dto.amount,
              note: dto.note.trim(),
            },
          },
        });
        return { ok: true };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async sync(actor: Principal, id: string, dto: VersionDto) {
    const o = await this.visible(actor, id, 'sales.shipments.manage');
    checkVersion(o.version, dto.version);
    if (o.status === 'DRAFT')
      throw new BadRequestException('Chốt đơn trước khi đồng bộ vận chuyển.');
    if (o.shippingSyncedAt && Date.now() - o.shippingSyncedAt.getTime() < 30000)
      throw new BadRequestException('Vừa đồng bộ. Vui lòng đợi 30 giây rồi thử lại.');
    await this.syncOrder(o, actor);
    return { ok: true };
  }
  private async syncOrder(o: Order, actor?: Principal) {
    if (!isVnpost(o.carrierName) || !/^[A-Za-z0-9_-]{5,50}$/.test(o.trackingCode))
      throw new BadRequestException(
        'Chọn đối tác VNPost và nhập đúng mã vận đơn trước khi đồng bộ.',
      );
    if (this.active.has(o.id)) throw new ConflictException('Đơn đang được đồng bộ.');
    const c = await this.db.shippingConnection.findUnique({ where: { id: 1 } });
    if (!c?.enabled)
      throw new BadRequestException('Chưa bật kết nối VNPost tại Cài đặt → Vận chuyển.');
    this.active.add(o.id);
    try {
      const s = await this.gateway.track(
        c.environment,
        unseal(c.tokenEncrypted, 'shipping:vnpost'),
        o.trackingCode,
        c.customerCode,
      );
      const now = new Date();
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([o.trackingCode, s.statusCode, s.fee, s.updatedAt.toISOString()]))
        .digest('hex');
      await this.db.$transaction(
        async (tx) => {
          const config = await tx.shippingConnection.findUnique({ where: { id: 1 } });
          if (!config?.enabled || config.version !== c.version)
            throw new ConflictException('Cấu hình VNPost đã thay đổi. Đồng bộ lại.');
          // Recheck authorization after the network call, including staff reassignment.
          const current = await tx.order.findFirst({
            where: {
              AND: [
                { id: o.id },
                ...(actor ? [orderPredicate(actor, 'sales.shipments.manage')] : []),
              ],
            },
          });
          if (!current) throw new NotFoundException('Không tìm thấy đơn trong phạm vi của bạn.');
          checkVersion(current.version, o.version);
          if (current.carrierUpdatedAt && s.updatedAt < current.carrierUpdatedAt)
            throw new BadRequestException(
              'VNPost trả dữ liệu cũ hơn lần đồng bộ trước. Giữ nguyên dữ liệu hiện tại.',
            );
          const changed =
            current.carrierUpdatedAt?.getTime() !== s.updatedAt.getTime() ||
            current.carrierStatusCode !== s.statusCode ||
            (current.carrierEstimatedFee?.toString() ?? null) !== s.fee;
          await tx.order.update({
            where: { id: o.id },
            data: {
              carrierEstimatedFee: s.fee,
              carrierStatusCode: s.statusCode,
              carrierStatusLabel: s.statusLabel,
              carrierUpdatedAt: s.updatedAt,
              shippingSyncedAt: now,
              shippingSyncError: '',
              shippingNextSyncAt: new Date(now.getTime() + 15 * 60000),
              ...(changed ? { shippingStatus: s.shippingStatus, version: { increment: 1 } } : {}),
            },
          });
          await tx.shippingEvent.createMany({
            data: [
              {
                orderId: o.id,
                trackingCode: o.trackingCode,
                statusCode: s.statusCode,
                statusLabel: s.statusLabel,
                estimatedFee: s.fee,
                carrierUpdatedAt: s.updatedAt,
                fingerprint,
              },
            ],
            skipDuplicates: true,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (e) {
      const message =
        e instanceof Error && 'getStatus' in e
          ? e.message
          : 'Không đồng bộ được VNPost. Vui lòng thử lại.';
      await this.db.order.updateMany({
        where: { id: o.id, version: o.version, trackingCode: o.trackingCode },
        data: {
          shippingSyncError: message.slice(0, 300),
          shippingNextSyncAt: new Date(Date.now() + 15 * 60000),
        },
      });
      throw e;
    } finally {
      this.active.delete(o.id);
    }
  }
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const c = await this.db.shippingConnection.findUnique({ where: { id: 1 } });
      if (!c?.enabled) return;
      // One bounded batch per minute. Pending older shipments remain eligible; terminal ones
      // are refreshed for 30 days after the last carrier change to pick up fee corrections.
      const rows = await this.db.order.findMany({
        where: {
          AND: [
            { status: { not: 'DRAFT' } },
            { carrierName: { equals: 'VNPost', mode: 'insensitive' } },
            { trackingCode: { not: '' } },
            { OR: [{ shippingNextSyncAt: null }, { shippingNextSyncAt: { lte: new Date() } }] },
            {
              OR: [
                { shippingStatus: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } },
                { carrierUpdatedAt: null },
                { carrierUpdatedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
              ],
            },
          ],
        },
        orderBy: [{ shippingNextSyncAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        take: 5,
      });
      for (const o of rows) {
        try {
          await this.syncOrder(o);
        } catch {
          // Invalid pre-existing tracking codes must not starve the rest of the queue.
          await this.db.order.updateMany({
            where: { id: o.id, version: o.version },
            data: { shippingNextSyncAt: new Date(Date.now() + 15 * 60000) },
          });
        }
      }
    } finally {
      this.polling = false;
    }
  }
}
@Controller('shipping/vnpost')
@RequirePermission('core.shipping.manage')
export class ShippingConfigController {
  constructor(private readonly service: ShippingService) {}
  @Get() config() {
    return this.service.config();
  }
  @Post('connect') connect(@CurrentUser() a: Principal, @Body() d: ConnectDto) {
    return this.service.connect(a, d);
  }
  @Patch() enable(@CurrentUser() a: Principal, @Body() d: EnableDto) {
    return this.service.enable(a, d);
  }
}
@Controller('sales/orders/:id')
export class ShipmentController {
  constructor(private readonly service: ShippingService) {}
  @Get('shipping-events') @RequirePermission('sales.orders.read', 'ASSIGNED') history(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.history(a, id);
  }
  @Post('shipping-sync') @RequirePermission('sales.shipments.manage', 'ASSIGNED') sync(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: VersionDto,
  ) {
    return this.service.sync(a, id, d);
  }
  @Patch('shipping-cost') @RequirePermission('sales.shipments.manage', 'ASSIGNED') cost(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CostDto,
  ) {
    return this.service.cost(a, id, d);
  }
}
@Module({
  controllers: [ShippingConfigController, ShipmentController],
  providers: [ShippingService, VnpostGateway],
})
export class ShippingModule {}
