import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { CurrentUser, Public, RequirePermission } from '../auth/access';
import { hasPermission, Principal } from '../auth/policy';
import { configuration } from '../config';
import { Database } from '../db';
import { seal, unseal } from './connection-crypto';
import { MessengerConnections } from './connection.service';
import { MetaOAuthGateway, OAuthPage } from './oauth.gateway';

const lifetime = 10 * 60 * 1000;
const callbackPath = '/api/v1/messenger/oauth/callback';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Attempt = {
  id: string;
  actorId: string;
  sessionId: string;
  stateHash: string;
  cookieHash: string;
  version: number;
  expiresAt: number;
  payload: string;
  status: 'WAITING' | 'PROCESSING' | 'READY' | 'SAVING' | 'DONE' | 'FAILED' | 'CANCELLED';
  message: string;
};
class SelectPagesDto {
  @IsOptional() @IsBoolean() connectNow?: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^\d{1,40}$/, { each: true })
  pageIds!: string[];
}
@Injectable()
export class MessengerOAuth implements OnModuleDestroy {
  // Deliberately ephemeral for the single local API instance. Restart requires a fresh login.
  private readonly attempts = new Map<string, Attempt>();
  private readonly cleanup = setInterval(() => this.prune(), 30000).unref();
  constructor(
    private readonly db: Database,
    private readonly connections: MessengerConnections,
    private readonly meta: MetaOAuthGateway,
  ) {}
  onModuleDestroy() {
    clearInterval(this.cleanup);
    this.attempts.clear();
  }
  private prune() {
    for (const [id, a] of this.attempts) if (a.expiresAt <= Date.now()) this.attempts.delete(id);
  }
  async info() {
    const c = await this.connections.view();
    const redirectUri = configuration().origin + callbackPath;
    const reasons = [
      ...(!c.keyReady ? ['Máy chủ cần khóa bảo vệ cấu hình.'] : []),
      ...(!c.facebookLoginEnabled ? ['Chưa bật kết nối bằng đăng nhập Facebook.'] : []),
      ...(!c.appId || !c.hasAppSecret || !c.graphVersion || !c.facebookLoginConfigId
        ? ['Quản trị hệ thống cần điền thông tin ứng dụng Meta và mã cấu hình đăng nhập một lần.']
        : []),
      ...(!redirectUri.startsWith('https://')
        ? [
            'Bản tại máy đã sẵn sàng cấu hình. Cần địa chỉ Sakura HTTPS trước khi đăng nhập Facebook thật.',
          ]
        : []),
    ];
    return {
      ready: !reasons.length,
      reasons,
      redirectUri,
      automaticReady: !reasons.length && !!c.webhookVerifiedAt,
      setupMessage: !c.webhookVerifiedAt
        ? 'Quản trị Sakura cần xác minh webhook chung một lần trước khi người dùng kết nối tự động.'
        : null,
    };
  }
  private get(actor: Principal, id: string) {
    this.prune();
    const a = this.attempts.get(id);
    if (!a || a.actorId !== actor.id || a.sessionId !== actor.sessionId)
      throw new NotFoundException(
        'Phiên kết nối đã hết hạn hoặc thuộc phiên đăng nhập khác. Bắt đầu lại để tiếp tục.',
      );
    return a;
  }
  private async active(a: Attempt) {
    const s = await this.db.session.findUnique({
      where: { id: a.sessionId },
      include: {
        user: {
          include: {
            roleAssignments: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    });
    if (
      !s ||
      s.userId !== a.actorId ||
      s.revokedAt ||
      s.expiresAt <= new Date() ||
      s.user.status !== 'ACTIVE' ||
      s.user.mustChangePassword ||
      !hasPermission(
        s.user.roleAssignments.flatMap((r) =>
          r.role.permissions.map((p) => ({ permission: p.permission.code, scope: p.scope })),
        ),
        'core.messenger.manage',
        'GLOBAL',
      )
    )
      throw new ForbiddenException('Phiên Sakura không còn quyền kết nối Fanpage.');
    if (a.expiresAt <= Date.now() || !this.attempts.has(a.id))
      throw new BadRequestException('Phiên kết nối đã hết hạn.');
  }
  async start(actor: Principal) {
    const info = await this.info();
    if (!info.ready) throw new BadRequestException(info.reasons.join(' '));
    this.prune();
    for (const a of this.attempts.values()) {
      if (a.sessionId !== actor.sessionId) continue;
      if (a.status === 'SAVING')
        throw new ConflictException('Đang lưu Fanpage. Đợi hoàn tất trước khi đăng nhập lại.');
      this.attempts.delete(a.id);
    }
    if (this.attempts.size >= 50)
      throw new BadRequestException('Đang có nhiều phiên kết nối. Vui lòng thử lại sau.');
    const c = await this.connections.oauthSettings();
    const state = randomBytes(32).toString('hex'),
      cookie = randomBytes(32).toString('hex');
    const a: Attempt = {
      id: randomUUID(),
      actorId: actor.id,
      sessionId: actor.sessionId,
      stateHash: digest(state),
      cookieHash: digest(cookie),
      version: c.version,
      expiresAt: Date.now() + lifetime,
      status: 'WAITING',
      payload: '',
      message: '',
    };
    this.attempts.set(a.id, a);
    const url = new URL('https://www.facebook.com/' + c.graphVersion + '/dialog/oauth');
    url.search = new URLSearchParams({
      client_id: c.appId,
      redirect_uri: info.redirectUri,
      state,
      config_id: c.configId,
      response_type: 'code',
      override_default_response_type: 'true',
    }).toString();
    return {
      id: a.id,
      authorizationUrl: url.toString(),
      expiresAt: new Date(a.expiresAt).toISOString(),
      cookie,
    };
  }
  async callback(
    q: Record<string, unknown>,
    cookie: unknown,
  ): Promise<'ready' | 'cancelled' | 'failed'> {
    this.prune();
    if (
      typeof q.state !== 'string' ||
      !/^[a-f0-9]{64}$/.test(q.state) ||
      typeof cookie !== 'string' ||
      !/^[a-f0-9]{64}$/.test(cookie)
    )
      return 'failed';
    const stateHash = digest(q.state),
      cookieHash = digest(cookie);
    const a = [...this.attempts.values()].find(
      (a) => a.stateHash === stateHash && a.cookieHash === cookieHash,
    );
    if (!a || a.status !== 'WAITING') return 'failed';
    a.status = 'PROCESSING'; // Consume state before awaiting any network/database work.
    try {
      await this.active(a);
      if (q.error) {
        a.status = 'CANCELLED';
        a.message = 'Bạn đã hủy hoặc chưa cấp quyền trên Facebook.';
        return 'cancelled';
      }
      if (typeof q.code !== 'string' || !q.code || q.code.length > 4096)
        throw new BadRequestException();
      const c = await this.connections.oauthSettings();
      if (!c.enabled || c.version !== a.version) throw new ConflictException();
      const pages = await this.meta.discover(q.code, configuration().origin + callbackPath, c);
      await this.active(a);
      if (a.status !== 'PROCESSING') return 'failed';
      if ((await this.connections.view()).version !== a.version) throw new ConflictException();
      a.payload = seal(JSON.stringify(pages), 'oauth:' + a.id);
      a.status = 'READY';
      return 'ready';
    } catch {
      a.payload = '';
      a.status = 'FAILED';
      a.message =
        'Không hoàn tất được kết nối. Kiểm tra quyền Facebook, cấu hình Meta và phiên Sakura, rồi bắt đầu lại.';
      return 'failed';
    }
  }
  async status(actor: Principal, id: string) {
    const a = this.get(actor, id);
    const existing = new Set((await this.connections.view()).pages.map((p) => p.pageId));
    const pages: OAuthPage[] =
      a.status === 'READY' && a.payload ? JSON.parse(unseal(a.payload, 'oauth:' + a.id)) : [];
    return {
      id,
      status: a.status,
      message: a.message,
      expiresAt: new Date(a.expiresAt).toISOString(),
      pages: pages.map((p) => ({
        pageId: p.pageId,
        name: p.name,
        canMessage: p.canMessage,
        existing: existing.has(p.pageId),
      })),
    };
  }
  cancel(actor: Principal, id: string) {
    const a = this.get(actor, id);
    if (a.status === 'SAVING')
      throw new ConflictException('Đang lưu Fanpage. Đợi thao tác hoàn tất.');
    a.status = 'CANCELLED';
    a.payload = '';
    return { status: a.status };
  }
  async confirm(actor: Principal, id: string, pageIds: string[], connectNow = false) {
    const a = this.get(actor, id);
    if (a.status !== 'READY')
      throw new ConflictException('Phiên chưa sẵn sàng hoặc đã được sử dụng. Bắt đầu lại nếu cần.');
    const candidates: OAuthPage[] = JSON.parse(unseal(a.payload, 'oauth:' + a.id));
    const selected = pageIds.map((id) => candidates.find((p) => p.pageId === id && p.canMessage));
    if (selected.some((p) => !p))
      throw new BadRequestException('Chỉ chọn Fanpage có quyền nhắn tin trong phiên này.');
    a.status = 'SAVING';
    try {
      await this.active(a);
      const c = await this.connections.oauthSettings();
      if (!c.enabled || c.version !== a.version)
        throw new ConflictException('Cấu hình đã thay đổi. Đăng nhập Facebook lại trước khi lưu.');
      if (connectNow && !(await this.connections.view()).webhookVerifiedAt)
        throw new BadRequestException(
          'Quản trị Sakura cần xác minh webhook chung trước khi kết nối tự động.',
        );
      const pages = selected as OAuthPage[];
      for (let i = 0; i < pages.length; i += 5)
        await Promise.all(pages.slice(i, i + 5).map((p) => this.meta.validatePage(p, c)));
      await this.active(a);
      if (connectNow) {
        for (let i = 0; i < pages.length; i += 5)
          await Promise.all(pages.slice(i, i + 5).map((p) => this.meta.subscribePage(p, c)));
        await this.active(a);
      }
      const result = await this.connections.saveOAuthPages(actor, a.version, pages, connectNow);
      a.status = 'DONE';
      a.payload = '';
      return { saved: pageIds.length, connected: connectNow, configuration: result };
    } catch (e) {
      a.status = 'FAILED';
      a.payload = '';
      a.message =
        'Chưa hoàn tất kết nối. Kiểm tra quyền của các Page đã chọn và đăng nhập Facebook lại.';
      throw e;
    }
  }
}
@Controller('messenger/oauth')
@ApiTags('Đăng nhập Facebook để kết nối Fanpage')
@ApiBearerAuth()
@RequirePermission('core.messenger.manage', 'GLOBAL')
export class MessengerOAuthController {
  constructor(private readonly oauth: MessengerOAuth) {}
  @Get('info') info() {
    return this.oauth.info();
  }
  @Post('start') async start(
    @CurrentUser() actor: Principal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.headers.origin !== configuration().origin)
      throw new ForbiddenException('Nguồn yêu cầu không hợp lệ.');
    const { cookie, ...result } = await this.oauth.start(actor);
    res.cookie('sakura_meta_oauth', cookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: callbackPath,
      maxAge: lifetime,
    });
    return result;
  }
  @Get('attempts/:id') status(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.oauth.status(actor, id);
  }
  @Post('attempts/:id/cancel') cancel(@CurrentUser() actor: Principal, @Param('id') id: string) {
    return this.oauth.cancel(actor, id);
  }
  @Post('attempts/:id/confirm') confirm(
    @CurrentUser() actor: Principal,
    @Param('id') id: string,
    @Body() dto: SelectPagesDto,
  ) {
    return this.oauth.confirm(actor, id, dto.pageIds, dto.connectNow);
  }
  @Public() @Get('callback') async callback(
    @Query() q: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    const result = await this.oauth.callback(q, req.cookies?.sakura_meta_oauth);
    return res.redirect(303, '/api/v1/messenger/oauth/result?status=' + result);
  }
  @Public() @Get('result') result(@Query('status') status: string, @Res() res: Response) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    const text =
      status === 'ready'
        ? 'Facebook đã trả về danh sách Fanpage. Quay lại thẻ Sakura đang mở để chọn Page và xác nhận lưu.'
        : status === 'cancelled'
          ? 'Đã hủy đăng nhập Facebook. Bạn có thể đóng thẻ này và quay lại Sakura.'
          : 'Không hoàn tất được đăng nhập. Quay lại Sakura để kiểm tra và bắt đầu lại.';
    return res
      .type('html')
      .send(
        '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sakura · Kết nối Facebook</title><main><h1>Kết nối Fanpage</h1><p>' +
          text +
          '</p><p>Không có tin nhắn nào được gửi trong bước kết nối này.</p></main></html>',
      );
  }
}
