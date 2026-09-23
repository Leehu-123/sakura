import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';

export type OAuthSettings = {
  version: number;
  enabled: boolean;
  appId: string;
  secret: string;
  graphVersion: string;
  configId: string;
};
export type OAuthPage = { pageId: string; name: string; token: string; canMessage: boolean };
export const OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_messaging',
];
const fail = () =>
  new BadRequestException(
    'Facebook chưa cấp đủ quyền hoặc thông tin kết nối không hợp lệ. Đăng nhập lại và cấp quyền cho Fanpage cần dùng.',
  );
const tokenValue = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 10 || value.length > 4096) throw fail();
  return value;
};
@Injectable()
export class MetaOAuthGateway {
  private async call(
    c: OAuthSettings,
    path: string,
    params: Record<string, string>,
    bearer?: string,
  ): Promise<any> {
    // Only fixed Graph endpoints; never follow pagination URLs supplied in responses.
    const url = new URL('https://graph.facebook.com/' + c.graphVersion + '/' + path);
    url.search = new URLSearchParams(params).toString();
    try {
      const response = await fetch(url, {
        headers: bearer ? { Authorization: 'Bearer ' + bearer } : {},
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw fail();
      const data = await response.json();
      if (!data || typeof data !== 'object' || (data as any).error) throw fail();
      return data;
    } catch {
      throw fail();
    }
  }
  private proof(token: string, c: OAuthSettings) {
    return createHmac('sha256', c.secret).update(token).digest('hex');
  }
  private async inspect(token: string, c: OAuthSettings, type: 'USER' | 'PAGE') {
    const { data } = await this.call(
      c,
      'debug_token',
      { input_token: token },
      c.appId + '|' + c.secret,
    );
    const now = Date.now() / 1000;
    if (
      !data ||
      data.is_valid !== true ||
      data.app_id !== c.appId ||
      data.type !== type ||
      !Array.isArray(data.scopes) ||
      !OAUTH_SCOPES.filter((s) => type === 'USER' || s !== 'pages_show_list').every((s) =>
        data.scopes.includes(s),
      ) ||
      typeof data.expires_at !== 'number' ||
      (data.expires_at !== 0 && data.expires_at <= now) ||
      (typeof data.data_access_expires_at === 'number' &&
        data.data_access_expires_at !== 0 &&
        data.data_access_expires_at <= now)
    )
      throw fail();
  }
  async discover(code: string, redirectUri: string, c: OAuthSettings): Promise<OAuthPage[]> {
    const client = { client_id: c.appId, client_secret: c.secret };
    const short = await this.call(c, 'oauth/access_token', {
      ...client,
      code,
      redirect_uri: redirectUri,
    });
    const extended = await this.call(c, 'oauth/access_token', {
      ...client,
      grant_type: 'fb_exchange_token',
      fb_exchange_token: tokenValue(short.access_token),
    });
    const token = tokenValue(extended.access_token);
    await this.inspect(token, c, 'USER');
    const pages = new Map<string, OAuthPage>();
    const cursors = new Set<string>();
    let after = '';
    for (let batch = 0; batch < 4; batch++) {
      const result = await this.call(
        c,
        'me/accounts',
        {
          fields: 'id,name,access_token,tasks',
          limit: '50',
          appsecret_proof: this.proof(token, c),
          ...(after ? { after } : {}),
        },
        token,
      );
      if (!Array.isArray(result.data) || result.data.length > 50) throw fail();
      for (const p of result.data) {
        if (
          !/^\d{1,40}$/.test(p.id) ||
          typeof p.id !== 'string' ||
          typeof p.name !== 'string' ||
          !p.name.trim() ||
          !Array.isArray(p.tasks)
        )
          throw fail();
        // Some Pages are visible but the person cannot use their Messenger inbox.
        const canMessage =
          p.tasks.some((task: string) => ['MESSAGING', 'PROFILE_PLUS_MESSAGING'].includes(task)) &&
          typeof p.access_token === 'string';
        pages.set(p.id, {
          pageId: p.id,
          name: p.name.slice(0, 100),
          token: canMessage ? tokenValue(p.access_token) : '',
          canMessage,
        });
      }
      if (!result.paging?.next) return [...pages.values()];
      after = result.paging?.cursors?.after;
      if (typeof after !== 'string' || !after || after.length > 2000 || cursors.has(after))
        throw fail();
      cursors.add(after);
    }
    throw new BadRequestException(
      'Có hơn 200 Fanpage được chia sẻ. Đăng nhập lại và chỉ cấp quyền cho các Page cần kết nối Sakura.',
    );
  }
  async validatePage(page: OAuthPage, c: OAuthSettings) {
    await this.inspect(page.token, c, 'PAGE');
    const result = await this.call(
      c,
      'me',
      { fields: 'id,name', appsecret_proof: this.proof(page.token, c) },
      page.token,
    );
    if (result.id !== page.pageId) throw fail();
  }
  async subscribePage(page: OAuthPage, c: OAuthSettings) {
    try {
      const response = await fetch(
        'https://graph.facebook.com/' + c.graphVersion + '/' + page.pageId + '/subscribed_apps',
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: 'Bearer ' + page.token,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            subscribed_fields: 'messages',
            appsecret_proof: this.proof(page.token, c),
          }).toString(),
        },
      );
      const data = (await response.json()) as { success?: unknown };
      if (!response.ok || data.success !== true) throw Error();
    } catch {
      throw new BadRequestException(
        'Meta chưa cho phép đăng ký nhận tin cho Fanpage ' +
          page.pageId +
          '. Cấp quyền pages_manage_metadata cho đúng Page rồi kết nối lại.',
      );
    }
  }
}
