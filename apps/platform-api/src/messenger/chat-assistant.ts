import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal, hasPermission } from '../auth/policy';
import { checkVersion } from '../common/version';
import { chatScope } from './domain';
import { MessengerConnections } from './connection.service';
import { staffingLock } from './staffing';
import { aiContext, aiFingerprint } from './ai-context';
class PageSettingsDto {
  @IsInt() @Min(0) version!: number;
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(4000) instructions!: string;
  @IsString() @MaxLength(300) greeting!: string;
  @IsString() @MaxLength(1200) policy!: string;
  @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsUUID('4', { each: true }) productIds!: string[];
}
class AssistantDto {
  @IsIn(['PRODUCTS', 'POLICY', 'ASK', 'TEMPLATE']) kind!: string;
  @IsArray() @ArrayUnique() @ArrayMaxSize(6) @IsUUID('4', { each: true }) variantIds!: string[];
  @IsOptional() @IsUUID() templateId?: string;
}
class SearchDto {
  @IsOptional() @IsString() @MaxLength(80) q = '';
}
type Snapshot = Awaited<ReturnType<ChatAssistant['snapshot']>>;
@Injectable()
export class ChatAssistant {
  constructor(
    private readonly db: Database,
    private readonly connections: MessengerConnections,
  ) {}
  async settings() {
    const pages = (await this.connections.view()).pages;
    const rows = await this.db.chatAiPage.findMany({
      where: { pageId: { in: pages.map((p) => p.pageId) } },
    });
    const ids = [...new Set(rows.flatMap((p) => p.productIds))];
    const products = await this.db.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, isActive: true },
    });
    return {
      mode: 'LOCAL',
      pages: pages.map((p) => {
        const c = rows.find((c) => c.pageId === p.pageId);
        return {
          pageId: p.pageId,
          name: p.name,
          enabled: c?.enabled || false,
          version: c?.version || 0,
          instructions: c?.instructions || '',
          greeting: c?.greeting ?? 'Dạ, anh/chị tham khảo thông tin bên dưới nhé.',
          policy: c?.policy || '',
          productIds: c?.productIds || [],
          products: products.filter((v) => c?.productIds.includes(v.id)),
        };
      }),
    };
  }
  async save(actor: Principal, pageId: string, dto: PageSettingsDto) {
    if (!(await this.connections.view()).pages.some((p) => p.pageId === pageId))
      throw new NotFoundException('Fanpage chưa được cấu hình.');
    return this.db.$transaction(
      async (tx) => {
        const old = await tx.chatAiPage.findUnique({ where: { pageId } });
        checkVersion(old?.version || 0, dto.version);
        if (
          dto.productIds.length &&
          !hasPermission(actor.grants, 'catalog.products.read', 'GLOBAL')
        )
          throw new ForbiddenException('Cần quyền xem sản phẩm.');
        if (
          (await tx.product.count({ where: { id: { in: dto.productIds } } })) !==
          dto.productIds.length
        )
          throw new BadRequestException('Có danh mục không còn tồn tại.');
        const data = {
          enabled: dto.enabled,
          instructions: dto.instructions.trim(),
          greeting: dto.greeting.trim(),
          policy: dto.policy.trim(),
          productIds: dto.productIds,
        };
        await tx.chatAiPage.upsert({
          where: { pageId },
          create: { pageId, ...data },
          update: { ...data, version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'chat.assistant.configured',
            entity: 'ChatAiPage',
            entityId: pageId,
            metadata: { enabled: dto.enabled, products: dto.productIds.length, mode: 'LOCAL' },
          },
        });
        return { saved: true };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async catalog(actor: Principal, q: string) {
    if (!hasPermission(actor.grants, 'catalog.products.read', 'GLOBAL'))
      throw new ForbiddenException('Cần quyền xem sản phẩm.');
    if (!q.trim()) return [];
    return this.db.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q.trim(), mode: 'insensitive' } },
          {
            variants: {
              some: { isActive: true, sku: { contains: q.trim(), mode: 'insensitive' } },
            },
          },
        ],
      },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 20,
    });
  }
  async conversation(tx: Prisma.TransactionClient, actor: Principal, id: string) {
    const c = await tx.chatConversation.findFirst({ where: { AND: [{ id }, chatScope(actor)] } });
    if (!c) throw new NotFoundException('Không tìm thấy hội thoại trong phạm vi.');
    return c;
  }
  async context(actor: Principal, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const c = await this.conversation(tx, actor, id);
        const page = await tx.chatAiPage.findUnique({ where: { pageId: c.pageId } });
        const messages = await tx.chatMessage.findMany({
          where: { conversationId: id, state: { in: ['RECEIVED', 'SENT'] } },
          orderBy: [{ sourceAt: 'desc' }, { id: 'desc' }],
          take: 20,
          select: { text: true, direction: true },
        });
        return {
          mode: 'LOCAL',
          enabled: !!page?.enabled && !c.blocked,
          instructions: page?.instructions || '',
          hasPolicy: !!page?.policy,
          messages: aiContext(messages),
          catalogAllowed: hasPermission(actor.grants, 'catalog.products.read', 'GLOBAL'),
          hasProducts: !!page?.productIds.length,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async products(actor: Principal, id: string, q: string) {
    return this.db.$transaction(
      async (tx) => {
        const c = await this.conversation(tx, actor, id);
        if (!hasPermission(actor.grants, 'catalog.products.read', 'GLOBAL'))
          throw new ForbiddenException('Cần quyền xem sản phẩm.');
        const page = await tx.chatAiPage.findUnique({ where: { pageId: c.pageId } });
        if (!page?.enabled || !q.trim()) return [];
        return tx.productVariant.findMany({
          where: {
            isActive: true,
            product: { isActive: true, id: { in: page.productIds } },
            OR: [
              { name: { contains: q.trim(), mode: 'insensitive' } },
              { sku: { contains: q.trim(), mode: 'insensitive' } },
              { product: { name: { contains: q.trim(), mode: 'insensitive' } } },
            ],
          },
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            price: true,
            product: { select: { name: true } },
          },
          orderBy: [{ sku: 'asc' }, { id: 'asc' }],
          take: 20,
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async snapshot(tx: Prisma.TransactionClient, actor: Principal, id: string, dto: AssistantDto) {
    const c = await this.conversation(tx, actor, id);
    if (c.blocked) throw new BadRequestException('Hội thoại đang bị chặn.');
    const page = await tx.chatAiPage.findUnique({ where: { pageId: c.pageId } });
    if (!page?.enabled)
      throw new BadRequestException('Quản trị chưa bật trợ lý nội bộ cho Fanpage.');
    if (dto.variantIds.length && !hasPermission(actor.grants, 'catalog.products.read', 'GLOBAL'))
      throw new ForbiddenException('Cần quyền xem sản phẩm.');
    const variants = await tx.productVariant.findMany({
      where: {
        id: { in: dto.variantIds },
        isActive: true,
        product: { isActive: true, id: { in: page.productIds } },
      },
      include: { product: { select: { name: true, version: true } } },
      orderBy: { id: 'asc' },
    });
    if (variants.length !== dto.variantIds.length)
      throw new BadRequestException('Sản phẩm không còn hoạt động hoặc ngoài danh mục Fanpage.');
    const products = variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.product.name + ' · ' + v.name,
      unit: v.unit,
      price: v.price.toFixed(0),
      version: v.version,
      productVersion: v.product.version,
    }));
    const template =
      dto.kind === 'TEMPLATE' && dto.templateId
        ? await tx.chatTemplate.findFirst({ where: { id: dto.templateId, isActive: true } })
        : null;
    if (dto.kind === 'TEMPLATE' && !template)
      throw new BadRequestException('Chọn mẫu trả lời đang hoạt động.');
    if (dto.kind !== 'PRODUCTS' && dto.variantIds.length)
      throw new BadRequestException('Chỉ chọn sản phẩm cho bản nháp báo giá.');
    const messages = await tx.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, text: true, direction: true, state: true },
    });
    const fingerprint = aiFingerprint({
      version: c.version,
      seq: c.inboundSeq,
      messages,
      pageVersion: page.version,
      products,
      template,
    });
    return {
      page,
      products,
      template,
      fingerprint,
      latestCustomer: messages.find((m) => m.direction === 'INBOUND')?.text.slice(0, 500) || '',
    };
  }
  async compose(actor: Principal, id: string, dto: AssistantDto) {
    return this.db.$transaction(
      async (tx) => {
        await staffingLock(tx);
        const s: Snapshot = await this.snapshot(tx, actor, id, dto);
        let reply = '';
        if (dto.kind === 'PRODUCTS') {
          if (!s.products.length) throw new BadRequestException('Chọn ít nhất một sản phẩm.');
          reply = [
            s.page.greeting,
            ...s.products.map(
              (p) =>
                `${p.name} (${p.sku}): ${new Intl.NumberFormat('vi-VN').format(BigInt(p.price))} đ/${p.unit}.`,
            ),
            'Anh/chị muốn lấy mẫu nào và số lượng bao nhiêu ạ?',
          ]
            .filter(Boolean)
            .join('\n');
        } else if (dto.kind === 'POLICY') {
          if (!s.page.policy) throw new BadRequestException('Fanpage chưa có chính sách được lưu.');
          reply = s.page.policy;
        } else if (dto.kind === 'TEMPLATE') reply = s.template!.text;
        else
          reply =
            'Anh/chị cho cửa hàng biết mẫu hoặc mã sản phẩm cần tìm và số lượng dự kiến nhé. Cửa hàng sẽ kiểm tra thông tin để tư vấn cụ thể ạ.';
        if (reply.length > 2000)
          throw new BadRequestException('Bản nháp quá 2.000 ký tự. Hãy chọn ít sản phẩm hơn.');
        const warnings = [
          'Đây là bản nháp từ mẫu và bảng giá nội bộ, không phải kết quả AI.',
          ...(dto.kind === 'PRODUCTS' ? ['Chưa xác nhận tồn kho, ưu đãi và phí vận chuyển.'] : []),
        ];
        const draft = await tx.chatAiDraft.create({
          data: {
            conversationId: id,
            actorId: actor.id,
            fingerprint: s.fingerprint,
            variantIds: dto.variantIds,
            reply,
            summary: s.latestCustomer,
            warnings,
            products: { items: s.products, kind: dto.kind, templateId: dto.templateId || null },
            expiresAt: new Date(Date.now() + 10 * 60000),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'chat.assistant.drafted',
            entity: 'ChatAiDraft',
            entityId: draft.id,
            metadata: { mode: 'LOCAL', kind: dto.kind },
          },
        });
        return {
          id: draft.id,
          reply,
          warnings,
          products: s.products,
          expiresAt: draft.expiresAt,
          mode: 'LOCAL',
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async validateDraft(tx: Prisma.TransactionClient, actor: Principal, id: string, draftId: string) {
    const d = await tx.chatAiDraft.findFirst({
      where: { id: draftId, conversationId: id, actorId: actor.id },
      include: { message: { select: { id: true } } },
    });
    if (!d || d.message || d.expiresAt <= new Date())
      throw new ConflictException('Bản nháp đã hết hạn, đã gửi hoặc không thuộc bạn. Hãy tạo lại.');
    const meta = d.products as { kind: string; templateId: string | null };
    const s = await this.snapshot(tx, actor, id, {
      kind: meta.kind,
      templateId: meta.templateId || undefined,
      variantIds: d.variantIds,
    });
    if (d.fingerprint !== s.fingerprint)
      throw new ConflictException(
        'Hội thoại, bảng giá hoặc hướng dẫn đã thay đổi. Hãy tạo lại bản nháp trước khi gửi.',
      );
    return d;
  }
}
@Controller('messenger/assistant')
@RequirePermission('sales.chat.use', 'ASSIGNED')
export class ChatAssistantController {
  constructor(private readonly assistant: ChatAssistant) {}
  @Get('settings') @RequirePermission('core.messenger.manage') settings() {
    return this.assistant.settings();
  }
  @Patch('pages/:pageId') @RequirePermission('core.messenger.manage') save(
    @CurrentUser() a: Principal,
    @Param('pageId') id: string,
    @Body() d: PageSettingsDto,
  ) {
    return this.assistant.save(a, id, d);
  }
  @Get('catalog') @RequirePermission('core.messenger.manage') catalog(
    @CurrentUser() a: Principal,
    @Query() q: SearchDto,
  ) {
    return this.assistant.catalog(a, q.q);
  }
  @Get('conversations/:id') context(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assistant.context(a, id);
  }
  @Get('conversations/:id/products') products(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: SearchDto,
  ) {
    return this.assistant.products(a, id, q.q);
  }
  @Post('conversations/:id/drafts') compose(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AssistantDto,
  ) {
    return this.assistant.compose(a, id, d);
  }
}
