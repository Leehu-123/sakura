import { BadRequestException } from '@nestjs/common';
import { imageMime } from '../common/media-store';
export const MAX_CHAT_FILE = 10 * 1024 * 1024;
export function chatFile(file?: { buffer: Buffer; originalname: string }) {
  if (!file?.buffer?.length || file.buffer.length > MAX_CHAT_FILE)
    throw new BadRequestException('Chọn tệp không rỗng, tối đa 10 MB.');
  const b = file.buffer;
  // Multipart filenames arrive as Latin-1 in Multer; recover UTF-8 where valid.
  const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const filename =
    /^[\x00-\xff]*$/.test(file.originalname) && !decoded.includes('\ufffd')
      ? decoded
      : file.originalname;
  const title = filename.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 180) || 'tep-dinh-kem';
  let mime = '';
  try {
    mime = imageMime(b);
  } catch {
    /* Try supported documents below. */
  }
  if (!mime && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString())) mime = 'image/gif';
  if (mime) return { title, mime, kind: 'image' };
  const ext = title.toLowerCase().split('.').pop();
  if (
    ext === 'mp4' &&
    b.length >= 16 &&
    b.subarray(4, 8).toString() === 'ftyp' &&
    /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(b.subarray(8, 12).toString())
  )
    return { title, mime: 'video/mp4', kind: 'video' };
  if (ext === 'pdf' && b.subarray(0, 5).toString() === '%PDF-') mime = 'application/pdf';
  const zip = b[0] === 0x50 && b[1] === 0x4b && [3, 5, 7].includes(b[2]);
  const office: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
  };
  if (zip && ext && office[ext]) mime = office[ext];
  const ole = b
    .subarray(0, 8)
    .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ole && ['doc', 'xls', 'ppt'].includes(ext || '')) mime = 'application/octet-stream';
  if (['txt', 'csv'].includes(ext || '') && !b.includes(0))
    mime = ext === 'csv' ? 'text/csv' : 'text/plain';
  if (!mime)
    throw new BadRequestException(
      'Hỗ trợ ảnh PNG/JPEG/WebP/GIF, video MP4, PDF, Word, Excel, PowerPoint, TXT, CSV và ZIP.',
    );
  return { title, mime, kind: 'file' };
}
