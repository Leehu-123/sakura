import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@sakura/database';
import { Database } from '../db';
import { Principal } from '../auth/policy';
import { pageConfigs, settings, MessengerSource } from './domain';
import { seal, unseal } from './connection-crypto';
import { AppConnectionDto, PageConnectionDto } from './connection.dto';
type Page = {
  pageId: string;
  name: string;
  token: string;
  enabled: boolean;
  sendEnabled: boolean;
  checkedAt: string | null;
  registeredAt: string | null;
  lastResult: string | null;
};
type Config = {
  facebookLoginEnabled?: boolean;
  facebookLoginConfigId?: string;
  appId: string;
  secret: string;
  verify: string;
  graphVersion: string;
  webhookUrl: string;
  enabled: boolean;
  sendEnabled: boolean;
  webhookVerifiedAt: string | null;
  pages: Page[];
};
@Injectable()
export class MetaConnectionGateway {
  async call(
    version: string,
    pageId: string,
    token: string,
    subscribe = false,
  ): Promise<{ ok: boolean; name?: string; reason?: string }> {
    try {
      const response = await fetch(
        'https://graph.facebook.com/' +
          version +
          '/' +
          (subscribe ? pageId + '/subscribed_apps' : 'me?fields=id,name'),
        {
          method: subscribe ? 'POST' : 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: 'Bearer ' + token,
            ...(subscribe ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          ...(subscribe ? { body: 'subscribed_fields=messages' } : {}),
        },
      );
      const data = (await response.json()) as {
        id?: unknown;
        name?: unknown;
        success?: unknown;
        error?: { code?: number };
      };
      if (!response.ok)
        return {
          ok: false,
          reason:
            data.error?.code === 190
              ? 'TOKEN_EXPIRED'
              : [10, 100, 200].includes(data.error?.code || 0)
                ? subscribe
                  ? 'SUBSCRIPTION_PERMISSION'
                  : 'TOKEN_PERMISSION'
                : 'META_UNAVAILABLE',
        };
      return subscribe
        ? { ok: data.success === true }
        : {
            ok: data.id === pageId && typeof data.name === 'string',
            ...(data.id !== pageId ? { reason: 'TOKEN_PAGE_MISMATCH' } : {}),
            ...(typeof data.name === 'string' ? { name: data.name.slice(0, 100) } : {}),
          };
    } catch {
      return { ok: false, reason: 'META_UNAVAILABLE' };
    }
  }
}
@Injectable()
export class MessengerConnections {
  constructor(
    private readonly db: Database,
    private readonly meta: MetaConnectionGateway,
  ) {}
  private legacy(encrypt: boolean): Config {
    const c = settings();
    const protect = (value: string, context: string) =>
      value ? (encrypt ? seal(value, context) : 'configured') : '';
    return {
      appId: process.env.MESSENGER_APP_ID || '',
      secret: protect(c.secret, 'app-secret'),
      verify: protect(c.verifyToken, 'verify-token'),
      graphVersion: c.version,
      webhookUrl: '',
      enabled: process.env.MESSENGER_ENABLED === 'true',
      sendEnabled: process.env.MESSENGER_SEND_ENABLED === 'true',
      webhookVerifiedAt: null,
      pages: pageConfigs().map((p) => ({
        pageId: p.pageId,
        name: p.name,
        token: protect(p.accessToken, 'page:' + p.pageId),
        enabled: true,
        sendEnabled: p.sendEnabled,
        checkedAt: null,
        registeredAt: null,
        lastResult: null,
      })),
    };
  }
  async runtime(): Promise<MessengerSource | undefined> {
    const row = await this.db.messengerConfiguration.findUnique({ where: { id: 1 } });
    if (!row) return undefined;
    const c = row.config as unknown as Config;
    return {
      enabled: c.enabled,
      sendEnabled: c.sendEnabled,
      secret: c.secret ? unseal(c.secret, 'app-secret') : '',
      verifyToken: c.verify ? unseal(c.verify, 'verify-token') : '',
      version: c.graphVersion,
      pages: c.pages.map((p) => ({
        pageId: p.pageId,
        name: p.name,
        enabled: p.enabled,
        sendEnabled: p.sendEnabled,
        accessToken: p.token ? unseal(p.token, 'page:' + p.pageId) : '',
      })),
    };
  }
  async view() {
    const row = await this.db.messengerConfiguration.findUnique({ where: { id: 1 } });
    const c = row ? (row.config as unknown as Config) : this.legacy(false);
    return {
      version: row?.version || 0,
      facebookLoginEnabled: c.facebookLoginEnabled ?? false,
      facebookLoginConfigId: c.facebookLoginConfigId ?? '',
      source: row ? 'APP' : 'ENVIRONMENT',
      keyReady: /^[a-f0-9]{64}$/.test(process.env.MESSENGER_CONFIG_KEY || ''),
      appId: c.appId,
      graphVersion: c.graphVersion,
      webhookUrl: c.webhookUrl,
      enabled: c.enabled,
      sendEnabled: c.sendEnabled,
      hasAppSecret: !!c.secret,
      hasVerifyToken: !!c.verify,
      webhookVerifiedAt: c.webhookVerifiedAt,
      pages: c.pages.map(({ token, ...p }) => ({ ...p, hasToken: !!token })),
    };
  }
  private async mutate(
    actor: Principal,
    version: number,
    action: string,
    edit: (c: Config) => void,
    pageId?: string,
    details: Prisma.InputJsonObject = {},
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(736251901)`;
      const row = await tx.messengerConfiguration.findUnique({ where: { id: 1 } });
      if ((row?.version || 0) !== version)
        throw new ConflictException('Cấu hình đã thay đổi. Bấm tải lại trước khi tiếp tục.');
      const c = row ? (row.config as unknown as Config) : this.legacy(true);
      edit(c);
      const config = c as unknown as Prisma.InputJsonValue;
      if (row)
        await tx.messengerConfiguration.update({
          where: { id: 1 },
          data: { config, version: { increment: 1 } },
        });
      else await tx.messengerConfiguration.create({ data: { id: 1, config } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action,
          entity: 'MessengerConfiguration',
          entityId: '1',
          metadata: { ...details, ...(pageId ? { pageId } : {}), version: version + 1 },
        },
      });
    });
    return this.view();
  }
  async saveApp(actor: Principal, d: AppConnectionDto) {
    return this.mutate(actor, d.version, 'messenger.configuration.updated', (c) => {
      if (d.webhookUrl) {
        let u: URL;
        try {
          u = new URL(d.webhookUrl);
        } catch {
          throw new BadRequestException('Địa chỉ webhook chưa hợp lệ.');
        }
        if (
          u.protocol !== 'https:' ||
          u.username ||
          u.password ||
          u.hash ||
          u.search ||
          u.pathname !== '/api/v1/messenger/webhook'
        )
          throw new BadRequestException(
            'Webhook phải là HTTPS và kết thúc bằng /api/v1/messenger/webhook.',
          );
      }
      const changed =
        d.appId !== c.appId ||
        !!d.appSecret ||
        !!d.verifyToken ||
        d.webhookUrl !== c.webhookUrl ||
        d.graphVersion !== c.graphVersion;
      c.appId = d.appId;
      c.graphVersion = d.graphVersion;
      c.webhookUrl = d.webhookUrl;
      if (d.appSecret) c.secret = seal(d.appSecret, 'app-secret');
      if (d.verifyToken) c.verify = seal(d.verifyToken, 'verify-token');
      if (d.facebookLoginEnabled !== undefined) c.facebookLoginEnabled = d.facebookLoginEnabled;
      if (d.facebookLoginConfigId !== undefined) c.facebookLoginConfigId = d.facebookLoginConfigId;
      if (
        c.facebookLoginEnabled &&
        (!c.appId || !c.secret || !c.graphVersion || !c.facebookLoginConfigId)
      )
        throw new BadRequestException(
          'Điền ứng dụng Meta, khóa và mã cấu hình đăng nhập Facebook trước khi bật kết nối bằng đăng nhập.',
        );
      if (changed) {
        c.webhookVerifiedAt = null;
        for (const p of c.pages) {
          p.sendEnabled = false;
          p.checkedAt = null;
          p.registeredAt = null;
          p.lastResult = null;
        }
      }
      if (d.enabled && (!c.appId || !c.secret || !c.verify || !c.graphVersion || !c.webhookUrl))
        throw new BadRequestException(
          'Điền đủ ứng dụng Meta, khóa, phiên bản API và địa chỉ webhook trước khi bật nhận tin.',
        );
      if (d.sendEnabled && (!d.enabled || changed || !c.webhookVerifiedAt))
        throw new BadRequestException('Cần xác minh webhook hiện tại trước khi bật gửi tin.');
      c.enabled = d.enabled;
      c.sendEnabled = d.sendEnabled;
    });
  }
  async savePage(actor: Principal, d: PageConnectionDto, existingId?: string) {
    return this.mutate(
      actor,
      d.version,
      existingId ? 'messenger.page.updated' : 'messenger.page.added',
      (c) => {
        let page = c.pages.find((p) => p.pageId === (existingId || d.pageId));
        if (existingId && !page) throw new NotFoundException('Không tìm thấy Fanpage.');
        const changedId = !!existingId && existingId !== d.pageId;
        if (changedId) {
          if (c.pages.some((p) => p.pageId === d.pageId))
            throw new ConflictException('Fanpage này đã có trong danh sách.');
          if (!d.accessToken)
            throw new BadRequestException('Khi đổi Page ID, cần nhập token của Fanpage mới.');
          page!.pageId = d.pageId;
        }
        if (!existingId) {
          if (page) throw new ConflictException('Fanpage này đã có trong danh sách.');
          if (c.pages.length >= 50) throw new BadRequestException('Tối đa 50 Fanpage.');
          if (!d.accessToken) throw new BadRequestException('Cần token để thêm Fanpage.');
          page = {
            pageId: d.pageId,
            name: d.name,
            token: '',
            enabled: false,
            sendEnabled: false,
            checkedAt: null,
            registeredAt: null,
            lastResult: null,
          };
          c.pages.push(page);
        }
        page!.name = d.name.trim();
        if (d.accessToken) {
          page!.token = seal(d.accessToken, 'page:' + d.pageId);
          page!.checkedAt = null;
          page!.registeredAt = null;
          page!.lastResult = null;
        }
        if (d.enabled && (!c.enabled || !page!.checkedAt))
          throw new BadRequestException(
            'Bật kết nối chung và kiểm tra token trước khi bật Fanpage.',
          );
        if (
          d.sendEnabled &&
          (!d.enabled || !c.sendEnabled || !page!.registeredAt || !c.webhookVerifiedAt)
        )
          throw new BadRequestException(
            'Cần xác minh webhook, đăng ký nhận tin và bật gửi chung trước.',
          );
        page!.enabled = d.enabled;
        page!.sendEnabled = d.sendEnabled;
      },
      d.pageId,
    );
  }
  async check(actor: Principal, pageId: string, version: number, subscribe: boolean) {
    const row = await this.db.messengerConfiguration.findUnique({ where: { id: 1 } });
    if (!row || row.version !== version)
      throw new ConflictException('Lưu cấu hình hoặc tải lại danh sách trước khi kiểm tra.');
    const c = row.config as unknown as Config,
      page = c.pages.find((p) => p.pageId === pageId);
    if (!page) throw new NotFoundException('Không tìm thấy Fanpage.');
    if (!/^v\d{1,3}\.0$/.test(c.graphVersion))
      throw new BadRequestException('Điền phiên bản Graph API trong cấu hình chung.');
    if (subscribe && (!c.enabled || !c.webhookVerifiedAt || !page.checkedAt))
      throw new BadRequestException(
        'Xác minh webhook trên Meta và kiểm tra token trước khi đăng ký nhận tin.',
      );
    const result = await this.meta.call(
      c.graphVersion,
      pageId,
      unseal(page.token, 'page:' + pageId),
      subscribe,
    );
    return this.mutate(
      actor,
      version,
      subscribe ? 'messenger.page.subscription.checked' : 'messenger.page.token.checked',
      (current) => {
        const p = current.pages.find((p) => p.pageId === pageId)!;
        p.lastResult = result.ok
          ? subscribe
            ? 'SUBSCRIBED'
            : 'TOKEN_VALID'
          : result.reason || (subscribe ? 'SUBSCRIPTION_FAILED' : 'TOKEN_FAILED');
        if (subscribe) p.registeredAt = result.ok ? new Date().toISOString() : null;
        else {
          p.checkedAt = result.ok ? new Date().toISOString() : null;
          if (result.ok && result.name) p.name = result.name;
        }
        if (!result.ok) {
          p.sendEnabled = false;
          if (!subscribe) {
            p.enabled = false;
            p.registeredAt = null;
          }
        }
      },
      pageId,
    );
  }
  async activate(actor: Principal, pageId: string, version: number) {
    const initial = await this.view();
    if (initial.version !== version)
      throw new ConflictException('Cấu hình đã thay đổi. Bấm tải lại trước khi tiếp tục.');
    if (!initial.enabled || !initial.webhookVerifiedAt)
      throw new BadRequestException(
        'Quản trị viên cần hoàn tất xác minh webhook trước khi kết nối Fanpage.',
      );
    const checked = await this.check(actor, pageId, version, false);
    if (!checked.pages.find((p) => p.pageId === pageId)?.checkedAt) return checked;
    const subscribed = await this.check(actor, pageId, checked.version, true);
    if (!subscribed.pages.find((p) => p.pageId === pageId)?.registeredAt) return subscribed;
    return this.mutate(
      actor,
      subscribed.version,
      'messenger.page.activated',
      (c) => {
        const p = c.pages.find((p) => p.pageId === pageId)!;
        if (!c.enabled || !c.webhookVerifiedAt || !p?.checkedAt || !p.registeredAt)
          throw new ConflictException('Kết nối vừa thay đổi. Vui lòng thử lại.');
        p.enabled = true;
        p.lastResult = 'RECEIVING_READY';
      },
      pageId,
    );
  }
  async diagnostics() {
    const config = await this.view();
    const grouped = await this.db.chatConversation.groupBy({
      by: ['pageId'],
      where: { pageId: { in: config.pages.map((p) => p.pageId) } },
      _max: { lastInboundAt: true },
      _sum: { inboundSeq: true },
    });
    return {
      checkedAt: new Date().toISOString(),
      pages: config.pages.map((p) => {
        const actual = grouped.find((g) => g.pageId === p.pageId);
        return {
          pageId: p.pageId,
          receivedCount: actual?._sum.inboundSeq || 0,
          lastInboundAt: actual?._max.lastInboundAt?.toISOString() || null,
        };
      }),
    };
  }
  async verifiedWebhook(source: MessengerSource | undefined) {
    if (!source) return;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(736251901)`;
      const row = await tx.messengerConfiguration.findUnique({ where: { id: 1 } });
      if (!row) return;
      const c = row.config as unknown as Config;
      if (!c.enabled || unseal(c.verify, 'verify-token') !== source.verifyToken)
        throw new ConflictException('Cấu hình webhook vừa thay đổi.');
      c.webhookVerifiedAt = new Date().toISOString();
      await tx.messengerConfiguration.update({
        where: { id: 1 },
        data: { config: c as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
      });
    });
  }
  async oauthSettings() {
    const row = await this.db.messengerConfiguration.findUnique({ where: { id: 1 } });
    const c = row?.config as unknown as Config | undefined;
    return {
      version: row?.version || 0,
      enabled: c?.facebookLoginEnabled ?? false,
      appId: c?.appId || '',
      secret: c?.secret ? unseal(c.secret, 'app-secret') : '',
      graphVersion: c?.graphVersion || '',
      configId: c?.facebookLoginConfigId || '',
    };
  }
  async saveOAuthPages(
    actor: Principal,
    version: number,
    pages: { pageId: string; name: string; token: string }[],
    connectNow = false,
  ) {
    return this.mutate(
      actor,
      version,
      'messenger.oauth.pages.saved',
      (c) => {
        if (!c.facebookLoginEnabled)
          throw new BadRequestException('Kết nối bằng đăng nhập đã tắt.');
        const ids = new Set([...c.pages.map((p) => p.pageId), ...pages.map((p) => p.pageId)]);
        if (ids.size > 50) throw new BadRequestException('Tối đa 50 Fanpage trong Sakura.');
        if (connectNow) {
          if (!c.webhookVerifiedAt || !c.secret || !c.verify || !c.webhookUrl)
            throw new BadRequestException('Quản trị Sakura cần hoàn tất webhook chung trước.');
          // Preserve the effective state of unrelated Pages when enabling global switches.
          const selected = new Set(pages.map((p) => p.pageId));
          for (const p of c.pages) {
            if (selected.has(p.pageId)) continue;
            if (!c.enabled) p.enabled = false;
            if (!c.enabled || !c.sendEnabled) p.sendEnabled = false;
          }
          c.enabled = true;
          c.sendEnabled = true;
        }
        for (const candidate of pages) {
          const old = c.pages.find((p) => p.pageId === candidate.pageId);
          const page: Page = {
            pageId: candidate.pageId,
            name: candidate.name,
            token: seal(candidate.token, 'page:' + candidate.pageId),
            enabled: connectNow,
            sendEnabled: connectNow,
            checkedAt: new Date().toISOString(),
            registeredAt: connectNow ? new Date().toISOString() : null,
            lastResult: connectNow ? 'CONNECTED' : 'TOKEN_VALID',
          };
          if (old) Object.assign(old, page);
          else c.pages.push(page);
        }
      },
      undefined,
      { pageIds: pages.map((p) => p.pageId), connected: connectNow },
    );
  }
}
