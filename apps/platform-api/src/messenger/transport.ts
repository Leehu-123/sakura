import { Injectable } from '@nestjs/common';
import { settings } from './domain';
import { MessengerConnections } from './connection.service';
export type SendResult = { state: 'SENT' | 'FAILED' | 'UNKNOWN'; mid?: string };
@Injectable()
export class MessengerTransport {
  constructor(private readonly connections: MessengerConnections) {}
  async send(
    pageId: string,
    psid: string,
    text: string,
    image?: { mime: string; data: string; title?: string; kind?: string },
  ): Promise<SendResult> {
    const c = settings(pageId, await this.connections.runtime());
    if (!c.sending || c.pageId !== pageId) return { state: 'FAILED' };
    let message: unknown = { text };
    if (image) {
      const type = image.kind === 'video' ? 'video' : image.kind === 'file' ? 'file' : 'image';
      try {
        const form = new FormData();
        form.set(
          'message',
          JSON.stringify({ attachment: { type, payload: { is_reusable: true } } }),
        );
        form.set(
          'filedata',
          new Blob([new Uint8Array(Buffer.from(image.data, 'base64'))], { type: image.mime }),
          image.title ||
            (image.mime === 'image/png'
              ? 'product.png'
              : image.mime === 'image/webp'
                ? 'product.webp'
                : 'product.jpg'),
        );
        const upload = await fetch(
          'https://graph.facebook.com/' + c.version + '/' + pageId + '/message_attachments',
          {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
            headers: { Authorization: 'Bearer ' + c.accessToken },
            body: form,
          },
        );
        const data = (await upload.json()) as { attachment_id?: unknown };
        if (
          !upload.ok ||
          typeof data.attachment_id !== 'string' ||
          !/^\d{1,100}$/.test(data.attachment_id)
        )
          return { state: 'FAILED' };
        message = { attachment: { type, payload: { attachment_id: data.attachment_id } } };
      } catch {
        return { state: 'FAILED' };
      }
    }
    try {
      const response = await fetch(
        'https://graph.facebook.com/' + c.version + '/' + pageId + '/messages',
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.accessToken },
          body: JSON.stringify({
            recipient: { id: psid },
            messaging_type: 'RESPONSE',
            message,
          }),
        },
      );
      const data = (await response.json()) as {
        message_id?: unknown;
        recipient_id?: unknown;
        error?: unknown;
      };
      if (
        response.ok &&
        typeof data.message_id === 'string' &&
        data.message_id.length <= 250 &&
        data.recipient_id === psid
      )
        return { state: 'SENT', mid: data.message_id };
      if (response.status >= 400 && response.status < 500 && data.error) return { state: 'FAILED' };
      return { state: 'UNKNOWN' };
    } catch {
      return { state: 'UNKNOWN' };
    }
  }
}
