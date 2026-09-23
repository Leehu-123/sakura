import { Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../db';
import { Principal } from '../auth/policy';
import { chatScope, settings } from './domain';
import { MessengerConnections } from './connection.service';
import { mediaPayload, storeMedia } from '../common/media-store';

export function safeAvatarUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === '443') &&
      ['fbcdn.net', 'fbsbx.com', 'facebook.com'].some(
        (d) => u.hostname === d || u.hostname.endsWith('.' + d),
      )
      ? u
      : null;
  } catch {
    return null;
  }
}
export async function boundedBody(response: Response, limit: number) {
  if (!response.ok || Number(response.headers.get('content-length') || 0) > limit)
    throw Error('Invalid profile response');
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty profile response');
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(parts);
      size += next.value.length;
      if (size > limit) throw Error('Profile response too large');
      parts.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
@Injectable()
export class MetaProfileGateway {
  constructor(private readonly connections: MessengerConnections) {}
  async load(pageId: string, psid: string) {
    const c = settings(pageId, await this.connections.runtime());
    if (
      !c.receiving ||
      !c.accessToken ||
      !/^v\d+\.\d+$/.test(c.version) ||
      !/^\d{1,40}$/.test(psid)
    )
      return null;
    const response = await fetch(
      `https://graph.facebook.com/${c.version}/${psid}?fields=first_name,last_name,profile_pic`,
      {
        headers: { Authorization: 'Bearer ' + c.accessToken },
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return null;
    const profile = JSON.parse((await boundedBody(response, 32768)).toString());
    const name = [profile.first_name, profile.last_name]
      .filter((v) => typeof v === 'string')
      .join(' ')
      .trim()
      .slice(0, 200);
    let avatar: Awaited<ReturnType<typeof storeMedia>> | undefined;
    try {
      let url = safeAvatarUrl(profile.profile_pic);
      for (let redirects = 0; url && redirects < 4; redirects++) {
        const image = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
        if ([301, 302, 303, 307, 308].includes(image.status)) {
          const location = image.headers.get('location');
          await image.body?.cancel();
          url = location ? safeAvatarUrl(new URL(location, url).toString()) : null;
          continue;
        }
        avatar = await storeMedia(await boundedBody(image, 1024 * 1024));
        break;
      }
    } catch {
      /* A missing picture must not hide a usable name or prevent chat. */
    }
    return name || avatar ? { name, avatar } : null;
  }
}
type ProfileRow = {
  id: string;
  pageId: string;
  psid: string;
  profileCheckedAt: Date | null;
  profileState: string;
};
@Injectable()
export class MessengerProfiles {
  private running = new Set<string>();
  constructor(
    private readonly db: Database,
    private readonly gateway: MetaProfileGateway,
  ) {}
  // Background work is bounded; it never delays webhook acknowledgement or message reads.
  schedule(rows: ProfileRow[]) {
    for (const c of rows) {
      const ttl = c.profileState === 'READY' ? 7 * 86400000 : 3600000;
      if (this.running.size >= 2) break;
      if (
        this.running.has(c.id) ||
        (c.profileCheckedAt && Date.now() - c.profileCheckedAt.getTime() < ttl)
      )
        continue;
      this.running.add(c.id);
      void this.refresh(c)
        .catch(() => undefined)
        .finally(() => this.running.delete(c.id));
    }
  }
  async refresh(c: ProfileRow) {
    // Persist retry backoff before calling Meta, including across application restarts.
    const cutoff = new Date(Date.now() - (c.profileState === 'READY' ? 7 * 86400000 : 3600000));
    const claimed = await this.db.chatConversation.updateMany({
      where: { id: c.id, OR: [{ profileCheckedAt: null }, { profileCheckedAt: { lt: cutoff } }] },
      data: { profileCheckedAt: new Date() },
    });
    if (!claimed.count) return;
    const result = await this.gateway.load(c.pageId, c.psid).catch(() => null);
    await this.db.chatConversation.update({
      where: { id: c.id },
      data: result
        ? {
            profileState: result.name && result.avatar ? 'READY' : 'PARTIAL',
            ...(result.name ? { facebookName: result.name } : {}),
            ...(result.avatar
              ? {
                  avatarKey: result.avatar.storageKey,
                  avatarMime: result.avatar.mime,
                  avatarBytes: result.avatar.byteSize,
                }
              : {}),
          }
        : { profileState: 'UNAVAILABLE' },
    });
  }
  async avatar(actor: Principal, id: string) {
    const c = await this.db.chatConversation.findFirst({
      where: { AND: [{ id }, chatScope(actor)] },
    });
    if (!c?.avatarKey || !c.avatarMime)
      throw new NotFoundException('Chưa có ảnh đại diện Facebook.');
    const payload = await mediaPayload({ storageKey: c.avatarKey, data: '' });
    return { mime: c.avatarMime, data: payload.data };
  }
}
