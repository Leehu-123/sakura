import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { MessengerConnections } from './connection.service';
import { AppConnectionDto, ConnectionVersionDto, PageConnectionDto } from './connection.dto';
@Controller('messenger/configuration')
@ApiTags('Cấu hình Fanpage')
@ApiBearerAuth()
@RequirePermission('core.messenger.manage', 'GLOBAL')
export class MessengerConnectionController {
  constructor(private readonly connections: MessengerConnections) {}
  @Get() view() {
    return this.connections.view();
  }
  @Get('diagnostics') diagnostics() {
    return this.connections.diagnostics();
  }
  @Post('pages/:id/activate') activate(
    @CurrentUser() a: Principal,
    @Param('id') id: string,
    @Body() d: ConnectionVersionDto,
  ) {
    return this.connections.activate(a, id, d.version);
  }
  @Patch() save(@CurrentUser() a: Principal, @Body() d: AppConnectionDto) {
    return this.connections.saveApp(a, d);
  }
  @Post('pages') add(@CurrentUser() a: Principal, @Body() d: PageConnectionDto) {
    return this.connections.savePage(a, d);
  }
  @Patch('pages/:id') update(
    @CurrentUser() a: Principal,
    @Param('id') id: string,
    @Body() d: PageConnectionDto,
  ) {
    return this.connections.savePage(a, d, id);
  }
  @Post('pages/:id/check') check(
    @CurrentUser() a: Principal,
    @Param('id') id: string,
    @Body() d: ConnectionVersionDto,
  ) {
    return this.connections.check(a, id, d.version, false);
  }
  @Post('pages/:id/subscribe') subscribe(
    @CurrentUser() a: Principal,
    @Param('id') id: string,
    @Body() d: ConnectionVersionDto,
  ) {
    return this.connections.check(a, id, d.version, true);
  }
}
