import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { DashboardService } from './dashboard.service';
import { CustomerQuery } from './dto';

@ApiTags('Bảng điều khiển cá nhân')
@ApiBearerAuth()
@Controller('sales/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('my')
  @RequirePermission('sales.orders.read', 'ASSIGNED')
  @ApiOperation({ summary: 'KPI và đơn hàng gần đây' })
  myDashboard(@CurrentUser() actor: Principal) {
    return this.dashboard.myDashboard(actor);
  }

  @Get('pipeline')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Đường ống bán hàng' })
  myPipeline(@CurrentUser() actor: Principal) {
    return this.dashboard.myPipeline(actor);
  }

  @Get('pipeline-board')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Kanban board pipeline' })
  myPipelineBoard(@CurrentUser() actor: Principal) {
    return this.dashboard.myPipelineBoard(actor);
  }

  @Get('customers')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Khách hàng có CRM' })
  myCustomers(@CurrentUser() actor: Principal, @Query() query: CustomerQuery) {
    return this.dashboard.myCustomers(actor, query);
  }

  @Get('care-alerts')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Cảnh báo chăm sóc khách hàng' })
  careAlerts(@CurrentUser() actor: Principal) {
    return this.dashboard.careAlerts(actor);
  }

  @Get('care-alerts/:type')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Danh sách khách cần chăm sóc' })
  careAlertCustomers(
    @CurrentUser() actor: Principal,
    @Param('type') type: string,
    @Query() query: CustomerQuery,
  ) {
    return this.dashboard.careAlertCustomers(actor, type, query);
  }
}
