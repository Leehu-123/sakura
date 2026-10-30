import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { Database } from '../db';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
class AssignDto {
  @IsBoolean() regionalSales!: boolean;
}
@Injectable()
export class SalesStaffService {
  constructor(private readonly db: Database) {}
  list() {
    return this.db.user.findMany({
      where: { roleAssignments: { every: { role: { code: 'regional_sales' } } } },
      select: {
        id: true,
        displayName: true,
        status: true,
        roleAssignments: { select: { role: { select: { code: true } } } },
      },
      orderBy: { displayName: 'asc' },
    });
  }
  assign(actor: Principal, id: string, dto: AssignDto) {
    return this.db.$transaction(
      async (tx) => {
        if (id === actor.id)
          throw new ForbiddenException('Không tự thay đổi vai trò qua chức năng này.');
        const user = await tx.user.findUnique({
          where: { id },
          include: { roleAssignments: { include: { role: true } } },
        });
        if (!user) throw new NotFoundException('Không tìm thấy nhân sự.');
        if (user.roleAssignments.some((a) => a.role.code !== 'regional_sales'))
          throw new ForbiddenException(
            'Chỉ quản lý tài khoản chưa có vai trò hoặc chỉ có vai trò Sale vùng; không được sửa Admin, Sale tổng hay vai trò tùy chỉnh.',
          );
        const role = await tx.role.findUniqueOrThrow({ where: { code: 'regional_sales' } });
        const hadRole = user.roleAssignments.length > 0;
        if (hadRole === dto.regionalSales) return { success: true };
        if (dto.regionalSales)
          await tx.userRoleAssignment.create({ data: { userId: id, roleId: role.id } });
        else await tx.userRoleAssignment.deleteMany({ where: { userId: id, roleId: role.id } });
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'sales.staff_role_changed',
            entity: 'User',
            entityId: id,
            metadata: { role: 'regional_sales', assigned: dto.regionalSales },
          },
        });
        return { success: true };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
@Controller('sales/staff')
@RequirePermission('sales.staff.manage', 'GLOBAL')
export class SalesStaffController {
  constructor(private readonly staff: SalesStaffService) {}
  @Get() list() {
    return this.staff.list();
  }
  @Patch(':id') assign(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDto,
  ) {
    return this.staff.assign(actor, id, dto);
  }
}
