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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { SalesService } from './sales.service';
import { OrderFeedService, OrderFeedQuery } from './order-feed';
import { SalesReports, ReportsController } from './reports';
import { VersionDto } from '../common/version';
import {
  CustomerDto,
  CustomerUpdateDto,
  CustomerQuery,
  HandoffDto,
  CareDto,
  CreateOrderDto,
  OrderQuery,
  OrderStatusDto,
  PaymentDto,
  ShippingDto,
} from './dto';
@ApiTags('Khách hàng và đơn hàng')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly feed: OrderFeedService,
  ) {}
  @Get('order-feed')
  @RequirePermission('sales.orders.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Tra cứu chung đơn Sakura và đơn lịch sử Sapo' })
  orderFeed(@CurrentUser() actor: Principal, @Query() query: OrderFeedQuery) {
    return this.feed.list(actor, query);
  }
  @Get('orders/:id/delivery-slip') @RequirePermission('sales.orders.read', 'ASSIGNED') slip(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.deliverySlip(a, id);
  }
  @Post('orders/:id/delivery-slip')
  @RequirePermission('sales.shipments.manage', 'ASSIGNED')
  createSlip(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: VersionDto,
  ) {
    return this.sales.deliverySlip(a, id, d.version);
  }
  @Get('regions')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Khu vực để phân loại khách; không cấp quyền theo khu vực' })
  regions() {
    return this.sales.regions();
  }
  @Get('assignees')
  @RequirePermission('sales.customers.handoff')
  @ApiOperation({ summary: 'Người nhận bàn giao hợp lệ' })
  assignees() {
    return this.sales.assignees();
  }
  @Get('customers')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Tìm khách trong phạm vi được giao' })
  customers(@CurrentUser() actor: Principal, @Query() query: CustomerQuery) {
    return this.sales.customers(actor, query);
  }
  @Post('customers')
  @RequirePermission('sales.customers.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Tạo khách và tự nhận chăm sóc' })
  createCustomer(@CurrentUser() actor: Principal, @Body() dto: CustomerDto) {
    return this.sales.createCustomer(actor, dto);
  }
  @Get('customers/:id')
  @RequirePermission('sales.customers.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Hồ sơ, 100 ghi chú và 100 phân công gần nhất' })
  customer(@CurrentUser() actor: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.customerDetail(actor, id);
  }
  @Patch('customers/:id')
  @RequirePermission('sales.customers.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Cập nhật hồ sơ khách' })
  updateCustomer(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerUpdateDto,
  ) {
    return this.sales.updateCustomer(actor, id, dto);
  }
  @Post('customers/:id/handoff')
  @RequirePermission('sales.customers.handoff')
  @ApiOperation({ summary: 'Bàn giao khách; giữ nguyên người chốt lịch sử' })
  handoff(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandoffDto,
  ) {
    return this.sales.handoff(actor, id, dto);
  }
  @Post('customers/:id/activities')
  @RequirePermission('sales.customers.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Thêm ghi chú chăm sóc' })
  care(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CareDto,
  ) {
    return this.sales.care(actor, id, dto);
  }
  @Get('orders')
  @RequirePermission('sales.orders.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Đơn hàng theo khách trong phạm vi' })
  orders(@CurrentUser() actor: Principal, @Query() query: OrderQuery) {
    return this.sales.orders(actor, query);
  }
  @Post('orders')
  @RequirePermission('sales.orders.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Lập đơn nháp với giá và địa chỉ được chụp tại lúc tạo' })
  createOrder(@CurrentUser() actor: Principal, @Body() dto: CreateOrderDto) {
    return this.sales.createOrder(actor, dto);
  }
  @Get('orders/:id')
  @RequirePermission('sales.orders.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Chi tiết đơn và 100 thao tác gần nhất' })
  order(@CurrentUser() actor: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.orderDetail(actor, id);
  }
  @Patch('orders/:id/status')
  @RequirePermission('sales.orders.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Chốt, hoàn tất hoặc hủy đơn' })
  status(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderStatusDto,
  ) {
    return this.sales.changeOrderStatus(actor, id, dto);
  }
  @Patch('orders/:id/shipping') @RequirePermission('sales.shipments.manage', 'ASSIGNED') shipping(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShippingDto,
  ) {
    return this.sales.shipping(a, id, dto);
  }
  @Post('orders/:id/payments')
  @RequirePermission('sales.orders.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Ghi nhận tổng tiền đã nhận; chưa có hoàn tiền' })
  payment(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentDto,
  ) {
    return this.sales.payment(actor, id, dto);
  }
}
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [SalesController, ReportsController, TasksController, DashboardController],
  providers: [SalesService, OrderFeedService, SalesReports, TasksService, DashboardService],
})
export class SalesModule {}
