import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Module,
  Injectable,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { PageDto } from '../core/dto';
import { ProductDto, ProductUpdateDto, VariantUpdateDto, VariantDto } from './dto';
import { checkVersion } from '../common/version';
@Injectable()
export class ProductService {
  constructor(private readonly db: Database) {}
  async list(query: PageDto) {
    const where: Prisma.ProductWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
            { variants: { some: { name: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
      : {};
    const [items, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        include: {
          variants: {
            orderBy: { sku: 'asc' },
            include: {
              images: {
                where: { isActive: true },
                select: { id: true, title: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              },
            },
          },
          images: {
            where: { isActive: true, variantId: null },
            select: { id: true, title: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.product.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async create(actor: Principal, dto: ProductDto) {
    const { variants, ...data } = dto;
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { ...data, variants: { create: variants } },
        include: { variants: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'product.created',
          entity: 'Product',
          entityId: product.id,
        },
      });
      return product;
    });
  }
  async update(actor: Principal, id: string, dto: ProductUpdateDto) {
    return this.db.$transaction(
      async (tx) => {
        const old = await tx.product.findUniqueOrThrow({ where: { id } });
        checkVersion(old.version, dto.version);
        const { version, ...data } = dto;
        const product = await tx.product.update({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
          include: { variants: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'product.updated',
            entity: 'Product',
            entityId: id,
            metadata: { before: { name: old.name, isActive: old.isActive }, after: data },
          },
        });
        return product;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async variant(actor: Principal, id: string, dto: VariantUpdateDto) {
    return this.db.$transaction(
      async (tx) => {
        const old = await tx.productVariant.findUniqueOrThrow({ where: { id } });
        checkVersion(old.version, dto.version);
        const variant = await tx.productVariant.update({
          where: { id, version: dto.version },
          data: {
            price: dto.price,
            isActive: dto.isActive,
            sku: dto.sku,
            name: dto.name,
            unit: dto.unit,
            version: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'variant.updated',
            entity: 'ProductVariant',
            entityId: id,
            metadata: {
              before: {
                price: old.price.toString(),
                isActive: old.isActive,
                sku: old.sku,
                name: old.name,
                unit: old.unit,
              },
              after: { ...dto },
            },
          },
        });
        return variant;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async addVariant(actor: Principal, id: string, dto: VariantDto) {
    return this.db.$transaction(async (tx) => {
      await tx.product.findUniqueOrThrow({ where: { id } });
      const item = await tx.productVariant.create({ data: { ...dto, productId: id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'variant.created',
          entity: 'ProductVariant',
          entityId: item.id,
          metadata: { productId: id, sku: dto.sku },
        },
      });
      return item;
    });
  }
}
@ApiTags('Danh mục sản phẩm dùng chung')
@ApiBearerAuth()
@Controller('catalog')
class ProductController {
  constructor(private readonly products: ProductService) {}
  @Get('products')
  @RequirePermission('catalog.products.read')
  @ApiOperation({ summary: 'Sản phẩm và các biến thể' })
  list(@Query() query: PageDto) {
    return this.products.list(query);
  }
  @Post('products')
  @RequirePermission('catalog.products.manage')
  @ApiOperation({ summary: 'Tạo sản phẩm và biến thể' })
  create(@CurrentUser() actor: Principal, @Body() dto: ProductDto) {
    return this.products.create(actor, dto);
  }
  @Patch('products/:id')
  @RequirePermission('catalog.products.manage')
  @ApiOperation({ summary: 'Sửa hoặc ngừng bán sản phẩm' })
  update(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductUpdateDto,
  ) {
    return this.products.update(actor, id, dto);
  }
  @Patch('variants/:id')
  @RequirePermission('catalog.products.manage')
  @ApiOperation({ summary: 'Cập nhật giá hoặc ngừng bán biến thể' })
  variant(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VariantUpdateDto,
  ) {
    return this.products.variant(actor, id, dto);
  }
  @Post('products/:id/variants')
  @RequirePermission('catalog.products.manage')
  addVariant(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VariantDto,
  ) {
    return this.products.addVariant(actor, id, dto);
  }
}
@Module({ controllers: [ProductController], providers: [ProductService] })
export class CatalogModule {}
