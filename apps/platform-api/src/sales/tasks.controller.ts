import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, TaskQuery } from './tasks.dto';

@ApiTags('Công việc')
@ApiBearerAuth()
@Controller('sales/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermission('sales.tasks.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Danh sách công việc' })
  list(@CurrentUser() actor: Principal, @Query() query: TaskQuery) {
    return this.tasks.list(actor, query);
  }

  @Get('daily')
  @RequirePermission('sales.tasks.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Checklist công việc lặp lại hàng ngày' })
  dailyChecklist(@CurrentUser() actor: Principal) {
    return this.tasks.dailyChecklist(actor);
  }

  @Get('today')
  @RequirePermission('sales.tasks.read', 'ASSIGNED')
  @ApiOperation({ summary: 'Công việc hôm nay' })
  today(@CurrentUser() actor: Principal) {
    return this.tasks.today(actor);
  }

  @Post()
  @RequirePermission('sales.tasks.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Tạo công việc' })
  create(@CurrentUser() actor: Principal, @Body() dto: CreateTaskDto) {
    return this.tasks.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermission('sales.tasks.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Cập nhật công việc' })
  update(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermission('sales.tasks.manage', 'ASSIGNED')
  @ApiOperation({ summary: 'Xóa công việc' })
  remove(@CurrentUser() actor: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.remove(actor, id);
  }
}
