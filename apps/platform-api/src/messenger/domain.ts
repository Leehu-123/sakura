import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Principal, orderPredicate, hasPermission } from '../auth/policy';
import { Prisma } from '@sakura/database';
export type MessengerSource = {
  enabled: boolean;
  sendEnabled: boolean;
  secret: string;
  verifyToken: string;
  version: string;
  pages: {
    pageId: string;
    name: string;
    accessToken: string;
    sendEnabled: boolean;
    enabled?: boolean;
  }[];
};
export function pageConfigs(source?: MessengerSource): {
  pageId: string;
  name: string;
  accessToken: string;
  sendEnabled: boolean;
  enabled?: boolean;
}[] {
  if (source) return source.pages;
  if (process.env.MESSENGER_PAGES_JSON) {
    try {
      const rows: unknown = JSON.parse(process.env.MESSENGER_PAGES_JSON);
      if (!Array.isArray(rows) || rows.length > 50) return [];
      if (
        rows.some(
          (p) =>
            !p ||
            typeof p.pageId !== 'string' ||
            !/^\d{1,40}$/.test(p.pageId) ||
            typeof p.name !== 'string' ||
            !p.name.trim() ||
            p.name.length > 100 ||
            typeof p.accessToken !== 'string' ||
            typeof p.sendEnabled !== 'boolean',
        ) ||
        new Set(rows.map((p) => p.pageId)).size !== rows.length
      )
        return [];
      return rows.map((p) => ({
        pageId: p.pageId,
        name: p.name,
        accessToken: p.accessToken,
        sendEnabled: p.sendEnabled,
      }));
    } catch {
      return [];
    }
  }
  const pageId = process.env.MESSENGER_PAGE_ID || '';
  return /^\d{1,40}$/.test(pageId)
    ? [
        {
          pageId,
          name: process.env.MESSENGER_PAGE_NAME || 'Fanpage ' + pageId,
          accessToken: process.env.MESSENGER_PAGE_ACCESS_TOKEN || '',
          sendEnabled: true,
        },
      ]
    : [];
}
export function settings(selectedPageId?: string, source?: MessengerSource) {
  const pages = pageConfigs(source),
    page =
      selectedPageId === undefined
        ? pages.find((p) => p.enabled !== false) || pages[0]
        : pages.find((p) => p.pageId === selectedPageId);
  const pageId = page?.pageId || '',
    secret = source ? source.secret : process.env.MESSENGER_APP_SECRET || '',
    verifyToken = source ? source.verifyToken : process.env.MESSENGER_VERIFY_TOKEN || '',
    accessToken = page?.accessToken || '',
    version = source ? source.version : process.env.MESSENGER_GRAPH_VERSION || '';
  const receiving =
    (source ? source.enabled : process.env.MESSENGER_ENABLED === 'true') &&
    !!page &&
    page.enabled !== false &&
    secret.length >= 16 &&
    verifyToken.length >= 24;
  return {
    pageId,
    secret,
    verifyToken,
    accessToken,
    version,
    receiving,
    sending:
      receiving &&
      page?.sendEnabled === true &&
      (source ? source.sendEnabled : process.env.MESSENGER_SEND_ENABLED === 'true') &&
      accessToken.length > 0 &&
      /^v\d{1,3}\.0$/.test(version),
  };
}
export function sameSecret(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
export function verifySignature(
  raw: Buffer | undefined,
  signature: unknown,
  source?: MessengerSource,
) {
  const c = settings(undefined, source);
  if (!(source ? source.enabled && source.secret.length >= 16 : c.receiving))
    throw new ServiceUnavailableException('Messenger chưa được cấu hình.');
  if (
    !raw ||
    typeof signature !== 'string' ||
    !/^sha256=[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(
      createHmac('sha256', c.secret).update(raw).digest(),
      Buffer.from(signature.slice(7), 'hex'),
    )
  )
    throw new ForbiddenException('Chữ ký webhook không hợp lệ.');
}
export const chatScope = (actor: Principal): Prisma.ChatConversationWhereInput => {
  if (hasPermission(actor.grants, 'sales.chat.use', 'GLOBAL')) return {};
  if (!hasPermission(actor.grants, 'sales.chat.use', 'ASSIGNED')) return { id: { in: [] } };
  return {
    OR: [
      { teamId: null, ...orderPredicate(actor, 'sales.chat.use') },
      { team: { isActive: true, members: { some: { userId: actor.id } } } },
    ],
  };
};
export const inWindow = (last: Date | null) =>
  !!last && last.getTime() <= Date.now() && Date.now() - last.getTime() < 24 * 3600000;
export function suggestions(text: string) {
  const phones = [
    ...new Set(
      (text.match(/(?:\+84|0084|0)[\d .()-]{8,22}\d/g) || [])
        .map((v) => v.replace(/[\s().-]/g, '').replace(/^(\+84|0084)/, '0'))
        .filter((v) => /^0[235789]\d{8,9}$/.test(v)),
    ),
  ].slice(0, 5);
  const addresses = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.match(/^(?:địa chỉ|dia chi|đc|dc|đ\/c)\s*:\s*(.{5,1000})$/i)?.[1])
        .filter((s): s is string => !!s),
    ),
  ].slice(0, 5);
  return { phones, addresses };
}
type Event = { pageId: string; psid: string; mid: string; text: string; types: string[]; at: Date };
const obj = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
export function events(payload: unknown, source?: MessengerSource): Event[] {
  const root = obj(payload),
    out: Event[] = [];
  if (root.object !== 'page') return out;
  if (!Array.isArray(root.entry) || root.entry.length > 100)
    throw new BadRequestException('Gói webhook không hợp lệ.');
  let count = 0;
  for (const value of root.entry) {
    const entry = obj(value);
    if (typeof entry.id !== 'string' || !settings(entry.id, source).receiving) continue;
    if (!Array.isArray(entry.messaging)) continue;
    for (const value of entry.messaging) {
      if (++count > 200) throw new BadRequestException('Gói webhook quá lớn.');
      const e = obj(value),
        message = obj(e.message),
        sender = obj(e.sender),
        recipient = obj(e.recipient);
      if (message.is_echo || recipient.id !== entry.id) continue;
      if (
        typeof sender.id !== 'string' ||
        !/^\d{1,40}$/.test(sender.id) ||
        typeof message.mid !== 'string' ||
        message.mid.length > 250 ||
        !message.mid
      )
        continue;
      if (
        !Number.isSafeInteger(e.timestamp) ||
        e.timestamp < 946684800000 ||
        e.timestamp > Date.now() + 60000
      )
        continue;
      const text = typeof message.text === 'string' ? message.text.slice(0, 10000) : '';
      const types = Array.isArray(message.attachments)
        ? message.attachments
            .slice(0, 20)
            .map((a: unknown) => String(obj(a).type || 'file').slice(0, 30))
        : [];
      if (!text && !types.length) continue;
      out.push({
        pageId: entry.id,
        psid: sender.id,
        mid: message.mid,
        text,
        types,
        at: new Date(Math.min(e.timestamp, Date.now())),
      });
    }
  }
  return out;
}
