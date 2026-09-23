import { CustomerWorkspace, CustomerWorkspaceController } from './customer-workspace';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_CHAT_FILE } from './attachment-format';
import { ToolbarDto, TaggedDateDto } from './dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser, Public, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { PageDto } from '../core/dto';
import {
  InboxQuery,
  LinkDto,
  TagsDto,
  ReplyDto,
  TemplateDto,
  TemplateUpdateDto,
  ResolveDto,
} from './dto';
import { settings, sameSecret, verifySignature } from './domain';
import { MessengerService } from './messenger.service';
import { MessengerTransport } from './transport';
import { WorkspaceService } from './workspace.service';
import { InteractionQuery, BlockDto, SupportDto, ReadDto, ImageDto } from './dto';
import { MessengerConnections, MetaConnectionGateway } from './connection.service';
import { MessengerConnectionController } from './connection.controller';
import { MessengerHistory, MessengerHistoryController } from './history';
import { ChatStaffing, ChatStaffingController } from './staffing';
import { MessengerOAuth, MessengerOAuthController } from './oauth';
import { MetaOAuthGateway } from './oauth.gateway';
import { MessengerProfiles, MetaProfileGateway } from './profiles';
import {
  HistoryImportController,
  MessengerHistoryImport,
  MetaHistoryGateway,
} from './history-import';
@Controller('messenger/webhook')
@ApiTags('Webhook Messenger')
@Public()
@SkipThrottle()
export class MessengerWebhook {
  constructor(
    private readonly messenger: MessengerService,
    private readonly connections: MessengerConnections,
  ) {}
  @Get()
  @Header('Content-Type', 'text/plain')
  async verify(@Query() q: Record<string, unknown>) {
    const source = await this.connections.runtime();
    const c = settings(undefined, source);
    if (
      !(source
        ? source.enabled && source.secret.length >= 16 && source.verifyToken.length >= 24
        : c.receiving)
    )
      throw new ServiceUnavailableException('Messenger chưa được cấu hình.');
    if (
      q['hub.mode'] !== 'subscribe' ||
      typeof q['hub.verify_token'] !== 'string' ||
      !sameSecret(q['hub.verify_token'], c.verifyToken) ||
      typeof q['hub.challenge'] !== 'string' ||
      q['hub.challenge'].length > 2000
    )
      throw new ForbiddenException('Không xác minh được webhook.');
    await this.connections.verifiedWebhook(source);
    return q['hub.challenge'];
  }
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string,
  ) {
    const source = await this.connections.runtime();
    verifySignature(req.rawBody, signature, source);
    await this.messenger.receive(req.body, source);
    return { status: 'ok' };
  }
}
@Controller('messenger')
@ApiTags('Hộp thư Messenger')
@ApiBearerAuth()
@RequirePermission('sales.chat.use', 'ASSIGNED')
export class MessengerController {
  constructor(
    private readonly messenger: MessengerService,
    private readonly workspace: WorkspaceService,
    private readonly profiles: MessengerProfiles,
  ) {}
  @Get('pages') pages() {
    return this.workspace.pages();
  }
  @Get('notifications') notifications(@CurrentUser() a: Principal) {
    return this.messenger.notifications(a);
  }
  @Get('conversations/:id/avatar') avatar(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.profiles.avatar(a, id);
  }
  @Get('toolbar') toolbar() {
    return this.workspace.toolbar();
  }
  @Patch('toolbar') @RequirePermission('core.messenger.manage') saveToolbar(
    @CurrentUser() a: Principal,
    @Body() dto: ToolbarDto,
  ) {
    return this.workspace.saveToolbar(a, dto);
  }
  @Patch('conversations/:id/date') taggedDate(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaggedDateDto,
  ) {
    return this.workspace.taggedDate(a, id, dto);
  }
  @Post('conversations/:id/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_CHAT_FILE, files: 1, fields: 0, parts: 2 } }),
  )
  attachmentUpload(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    return this.workspace.uploadAttachment(a, id, file);
  }
  @Get('conversations/:id/attachments/:attachmentId') attachment(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.workspace.attachment(a, id, attachmentId);
  }
  @Get('images') @RequirePermission('catalog.products.read') images(@Query() q: PageDto) {
    return this.workspace.images(q);
  }
  @Post('images') @RequirePermission('catalog.products.manage') upload(
    @CurrentUser() a: Principal,
    @Body() d: ImageDto,
  ) {
    return this.workspace.upload(a, d);
  }
  @Get('images/:id') @RequirePermission('catalog.products.read') image(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workspace.image(id);
  }
  @Get('conversations/:id/supporters') supporters(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workspace.supporters(a, id);
  }
  @Patch('conversations/:id/support') support(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SupportDto,
  ) {
    return this.workspace.support(a, id, d);
  }
  @Patch('conversations/:id/block') block(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: BlockDto,
  ) {
    return this.workspace.block(a, id, d);
  }
  @Post('conversations/:id/read') read(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReadDto,
  ) {
    return this.workspace.read(a, id, d);
  }
  @Get('conversations/:id/messages/:mid/image') messageImage(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mid', ParseUUIDPipe) mid: string,
  ) {
    return this.workspace.messageImage(a, id, mid);
  }
  @Get('conversations/:id/invoice/:orderId') invoice(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.workspace.confirmation(a, id, orderId, 'INVOICE');
  }
  @Get('conversations/:id/confirmation/:orderId') confirmation(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.workspace.confirmation(a, id, orderId);
  }
  @Get('status') status() {
    return this.messenger.status();
  }
  @Get('conversations') list(@CurrentUser() a: Principal, @Query() q: InboxQuery) {
    return this.messenger.list(a, q);
  }
  @Get('conversations/:id') detail(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: InteractionQuery,
  ) {
    return this.messenger.detail(a, id, q);
  }
  @Post('conversations/:id/link')
  @RequirePermission('sales.chat.use')
  link(@CurrentUser() a: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkDto) {
    return this.messenger.link(a, id, dto);
  }
  @Patch('conversations/:id/tags') tags(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TagsDto,
  ) {
    return this.messenger.tags(a, id, dto);
  }
  @Get('conversations/:id/requests/:requestKey') requestStatus(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestKey', ParseUUIDPipe) requestKey: string,
  ) {
    return this.messenger.requestStatus(a, id, requestKey);
  }
  @Post('conversations/:id/reply') reply(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.messenger.reply(a, id, dto);
  }
  @Post('conversations/:id/messages/:messageId/resolve')
  @RequirePermission('core.messenger.manage')
  resolve(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) mid: string,
    @Body() dto: ResolveDto,
  ) {
    return this.messenger.resolve(a, id, mid, dto);
  }
  @Get('templates') templates(@CurrentUser() actor: Principal) {
    return this.messenger.templates(actor);
  }
  @Post('templates')
  @RequirePermission('core.messenger.manage')
  createTemplate(@CurrentUser() a: Principal, @Body() dto: TemplateDto) {
    return this.messenger.createTemplate(a, dto);
  }
  @Patch('templates/:id')
  @RequirePermission('core.messenger.manage')
  updateTemplate(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TemplateUpdateDto,
  ) {
    return this.messenger.updateTemplate(a, id, dto);
  }
}
@Module({
  controllers: [
    CustomerWorkspaceController,
    MessengerWebhook,
    MessengerController,
    MessengerConnectionController,
    MessengerHistoryController,
    ChatStaffingController,
    MessengerOAuthController,
    HistoryImportController,
  ],
  providers: [
    CustomerWorkspace,
    MessengerService,
    MessengerTransport,
    WorkspaceService,
    MessengerConnections,
    MetaConnectionGateway,
    MessengerHistory,
    ChatStaffing,
    MessengerOAuth,
    MetaOAuthGateway,
    MessengerProfiles,
    MetaProfileGateway,
    MessengerHistoryImport,
    MetaHistoryGateway,
  ],
})
export class MessengerModule {}
