import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/access';
import type { Principal } from '../auth/policy';
import { CoreService } from './core.service';
import {
  CatalogDto,
  CreateUserDto,
  EmployeeDto,
  PageDto,
  ResetPasswordDto,
  RoleDto,
  UpdateUserDto,
} from './dto';
@ApiTags('Nền tảng công ty')
@ApiBearerAuth()
@Controller('core')
export class CoreController {
  constructor(private readonly core: CoreService) {}
  @Get('users')
  @RequirePermission('core.users.read')
  @ApiOperation({ summary: 'Danh sách tài khoản' })
  users(@Query() query: PageDto) {
    return this.core.users(query);
  }
  @Post('users')
  @RequirePermission('core.users.manage')
  @ApiOperation({ summary: 'Tạo tài khoản và gán vai trò' })
  createUser(@CurrentUser() actor: Principal, @Body() dto: CreateUserDto) {
    return this.core.createUser(actor, dto);
  }
  @Patch('users/:id')
  @RequirePermission('core.users.manage')
  @ApiOperation({ summary: 'Cập nhật tài khoản, khóa hoặc đổi vai trò' })
  updateUser(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.core.updateUser(actor, id, dto);
  }
  @Post('users/:id/reset-password')
  @RequirePermission('core.users.manage')
  @ApiOperation({ summary: 'Đặt lại mật khẩu và thu hồi phiên' })
  reset(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.core.resetPassword(actor, id, dto.password);
  }
  @Get('roles')
  @RequirePermission('core.roles.read')
  @ApiOperation({ summary: 'Vai trò và quyền theo phạm vi' })
  roles() {
    return this.core.roles();
  }
  @Get('permissions')
  @RequirePermission('core.roles.read')
  @ApiOperation({ summary: 'Danh sách quyền có thể gán' })
  permissions() {
    return this.core.permissions();
  }
  @Post('roles')
  @RequirePermission('core.roles.manage')
  @ApiOperation({ summary: 'Tạo vai trò tùy chỉnh' })
  createRole(@CurrentUser() actor: Principal, @Body() dto: RoleDto) {
    return this.core.saveRole(actor.id, dto);
  }
  @Patch('roles/:id')
  @RequirePermission('core.roles.manage')
  @ApiOperation({ summary: 'Cập nhật vai trò tùy chỉnh' })
  updateRole(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoleDto,
  ) {
    return this.core.saveRole(actor.id, dto, id);
  }
  @Get('catalogs')
  @RequirePermission('core.catalogs.read')
  @ApiOperation({ summary: 'Nhân viên, phòng ban, chi nhánh và khu vực' })
  catalogs() {
    return this.core.catalogs();
  }
  @Post('catalogs/employees')
  @RequirePermission('core.catalogs.manage')
  @ApiOperation({ summary: 'Thêm nhân viên' })
  employee(@CurrentUser() actor: Principal, @Body() dto: EmployeeDto) {
    return this.core.createEmployee(actor.id, dto);
  }
  @Post('catalogs/:type')
  @RequirePermission('core.catalogs.manage')
  @ApiOperation({ summary: 'Thêm khu vực, phòng ban hoặc chi nhánh' })
  catalog(@CurrentUser() actor: Principal, @Param('type') type: string, @Body() dto: CatalogDto) {
    return this.core.createCatalog(actor.id, type, dto);
  }
  @Get('audit-logs')
  @RequirePermission('core.audit.read')
  @ApiOperation({ summary: 'Nhật ký thao tác' })
  audit(@Query() query: PageDto) {
    return this.core.audit(query);
  }
}
