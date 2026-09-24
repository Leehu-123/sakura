import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { hasPermission, Principal } from '../auth/policy';
import { hashPassword } from '../auth/password';
import { CatalogDto, CreateUserDto, EmployeeDto, PageDto, RoleDto, TelegramConfigDto, UpdateUserDto } from './dto';
const userSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  mustChangePassword: true,
  telegramChatId: true,
  createdAt: true,
  roleAssignments: { select: { role: { select: { id: true, code: true, name: true } } } },
  employee: { include: { department: true, branch: true, region: true } },
} satisfies Prisma.UserSelect;
@Injectable()
export class CoreService {
  constructor(private readonly db: Database) {}
  private async assertTargetAccess(tx: Prisma.TransactionClient, actor: Principal, userId: string) {
    if (hasPermission(actor.grants, 'core.roles.manage', 'GLOBAL')) return;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roleAssignments: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    const targetGrants = user.roleAssignments.flatMap((a) => a.role.permissions);
    if (targetGrants.some((g) => !hasPermission(actor.grants, g.permission.code, g.scope))) {
      throw new ForbiddenException(
        'Không được thay đổi tài khoản có quyền vượt quá quyền của bạn.',
      );
    }
  }
  async users(query: PageDto) {
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { displayName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async createUser(actor: Principal, dto: CreateUserDto) {
    const actorId = actor.id;
    if (dto.roleIds.length && !hasPermission(actor.grants, 'core.roles.manage', 'GLOBAL'))
      throw new ForbiddenException('Bạn không có quyền phân vai trò.');
    const passwordHash = await hashPassword(dto.password);
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          displayName: dto.displayName,
          passwordHash,
          roleAssignments: { create: dto.roleIds.map((roleId) => ({ roleId })) },
        },
        select: userSelect,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'user.created',
          entity: 'User',
          entityId: user.id,
          metadata: { email: dto.email, roleIds: dto.roleIds },
        },
      });
      return user;
    });
  }
  async updateUser(actor: Principal, id: string, dto: UpdateUserDto) {
    const actorId = actor.id;
    if (dto.roleIds !== undefined && !hasPermission(actor.grants, 'core.roles.manage', 'GLOBAL'))
      throw new ForbiddenException('Bạn không có quyền phân vai trò.');
    return this.db.$transaction(
      async (tx) => {
        await this.assertTargetAccess(tx, actor, id);
        const old = await tx.user.findUniqueOrThrow({
          where: { id },
          include: { roleAssignments: { include: { role: true } } },
        });
        const adminRole = await tx.role.findUniqueOrThrow({ where: { code: 'admin' } });
        const wasAdmin =
          old.status === 'ACTIVE' && old.roleAssignments.some((a) => a.roleId === adminRole.id);
        const removesAdmin =
          dto.status === 'DISABLED' ||
          (dto.roleIds !== undefined && !dto.roleIds.includes(adminRole.id));
        if (wasAdmin && removesAdmin) {
          const admins = await tx.user.count({
            where: { status: 'ACTIVE', roleAssignments: { some: { roleId: adminRole.id } } },
          });
          if (admins <= 1)
            throw new BadRequestException('Phải giữ ít nhất một quản trị viên đang hoạt động.');
        }
        if (dto.roleIds) {
          await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
          await tx.userRoleAssignment.createMany({
            data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
        const user = await tx.user.update({
          where: { id },
          data: { displayName: dto.displayName, status: dto.status, telegramChatId: dto.telegramChatId },
          select: userSelect,
        });
        if (dto.status === 'DISABLED')
          await tx.session.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'user.updated',
            entity: 'User',
            entityId: id,
            metadata: {
              before: {
                displayName: old.displayName,
                status: old.status,
                roleIds: old.roleAssignments.map((a) => a.roleId),
              },
              after: JSON.parse(JSON.stringify(dto)),
            },
          },
        });
        return user;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async resetPassword(actor: Principal, id: string, password: string) {
    const actorId = actor.id;
    const passwordHash = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      await this.assertTargetAccess(tx, actor, id);
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: { actorId, action: 'user.password_reset', entity: 'User', entityId: id },
      });
    });
    return { message: 'Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập.' };
  }
  roles() {
    return this.db.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  permissions() {
    return this.db.permission.findMany({
      include: { application: true },
      orderBy: { code: 'asc' },
    });
  }
  async saveRole(actorId: string, dto: RoleDto, id?: string) {
    if (new Set(dto.grants.map((g) => g.permissionId)).size !== dto.grants.length)
      throw new BadRequestException('Quyền không được trùng.');
    return this.db.$transaction(async (tx) => {
      if (id) {
        const old = await tx.role.findUniqueOrThrow({ where: { id } });
        if (old.isSystem)
          throw new ForbiddenException('Vai trò mặc định được bảo vệ. Hãy tạo vai trò tùy chỉnh.');
      }
      for (const grant of dto.grants) {
        const permission = await tx.permission.findUnique({ where: { id: grant.permissionId } });
        if (!permission || !permission.allowedScopes.includes(grant.scope))
          throw new BadRequestException('Phạm vi không phù hợp với quyền được chọn.');
      }
      const data = { code: dto.code, name: dto.name, description: dto.description };
      const role = id
        ? await tx.role.update({ where: { id }, data })
        : await tx.role.create({ data });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: dto.grants.map((g) => ({
          roleId: role.id,
          permissionId: g.permissionId,
          scope: g.scope,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: id ? 'role.updated' : 'role.created',
          entity: 'Role',
          entityId: role.id,
          metadata: JSON.parse(JSON.stringify(dto)),
        },
      });
      return role;
    });
  }
  async catalogs() {
    const [regions, departments, branches, employees] = await this.db.$transaction([
      this.db.region.findMany({ orderBy: { code: 'asc' } }),
      this.db.department.findMany({ orderBy: { code: 'asc' } }),
      this.db.branch.findMany({ orderBy: { code: 'asc' } }),
      this.db.employee.findMany({
        include: {
          region: true,
          department: true,
          branch: true,
          user: { select: { id: true, email: true } },
        },
        orderBy: { code: 'asc' },
      }),
    ]);
    return { regions, departments, branches, employees };
  }
  async createCatalog(actorId: string, type: string, dto: CatalogDto) {
    if (!['regions', 'departments', 'branches'].includes(type))
      throw new BadRequestException('Danh mục không hợp lệ.');
    return this.db.$transaction(async (tx) => {
      const item =
        type === 'regions'
          ? await tx.region.create({ data: dto })
          : type === 'departments'
            ? await tx.department.create({ data: dto })
            : await tx.branch.create({ data: dto });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'catalog.created',
          entity: type,
          entityId: item.id,
          metadata: { code: dto.code, name: dto.name },
        },
      });
      return item;
    });
  }
  async createEmployee(actorId: string, dto: EmployeeDto) {
    return this.db.$transaction(async (tx) => {
      const item = await tx.employee.create({ data: dto });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'employee.created',
          entity: 'Employee',
          entityId: item.id,
          metadata: { code: dto.code },
        },
      });
      return item;
    });
  }
  async audit(query: PageDto) {
    const where = query.search
      ? { action: { contains: query.search, mode: 'insensitive' as const } }
      : {};
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        include: { actor: { select: { displayName: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async telegramConfig() {
    const config = await this.db.telegramConfig.findUnique({ where: { id: 1 } });
    if (!config) return { id: 1, botToken: '', enabled: false, hasToken: false };
    return {
      id: config.id,
      botToken: config.botToken ? '••••••' + config.botToken.slice(-6) : '',
      enabled: config.enabled,
      hasToken: !!config.botToken,
    };
  }
  async updateTelegramConfig(actorId: string, dto: TelegramConfigDto) {
    const data: Record<string, unknown> = {};
    if (dto.botToken !== undefined) data.botToken = dto.botToken;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    const config = await this.db.telegramConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    await this.db.auditLog.create({
      data: {
        actorId,
        action: 'telegram.config_updated',
        entity: 'TelegramConfig',
        entityId: '1',
        metadata: { enabled: config.enabled, hasToken: !!config.botToken },
      },
    });
    return {
      id: config.id,
      botToken: config.botToken ? '••••••' + config.botToken.slice(-6) : '',
      enabled: config.enabled,
      hasToken: !!config.botToken,
    };
  }
}
