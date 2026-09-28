import { createHash } from 'node:crypto';
export function maskAiText(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(?:\+84|0084|0)[\d .()-]{8,22}\d/g, '[số điện thoại]');
}
export function aiContext(messages: { text: string; direction: string }[]) {
  let remaining = 12000;
  return messages
    .slice(0, 20)
    .map((m) => {
      const text = maskAiText(m.text).slice(0, Math.min(2000, remaining));
      remaining -= text.length;
      return { role: m.direction === 'INBOUND' ? 'khách' : 'cửa hàng', text };
    })
    .filter((m) => m.text)
    .reverse();
}
export function aiFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
