import { readFile, readdir, statfs } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@sakura/database';
const root = resolve(__dirname, '../../../..');
export async function storageStatus(db: PrismaClient) {
  const backupRoot = resolve(process.env.BACKUP_ROOT || join(root, '.local/backups'));
  const mediaRoot = resolve(process.env.MEDIA_ROOT || join(root, '.local/media'));
  const [size, tables, images] = await Promise.all([
    db.$queryRaw<{ bytes: string }[]>`SELECT pg_database_size(current_database())::text AS bytes`,
    db.$queryRaw<
      { name: string; bytes: string }[]
    >`SELECT relname AS name, pg_total_relation_size(relid)::text AS bytes FROM pg_statio_user_tables WHERE schemaname=current_schema() ORDER BY pg_total_relation_size(relid) DESC`,
    db.$queryRaw<
      { files: string; bytes: string; links: string }[]
    >`SELECT count(*)::text AS files, coalesce(sum(bytes),0)::text AS bytes,
      (SELECT count(*)::text FROM "ProductImage" WHERE "storageKey" IS NOT NULL) AS links
      FROM (SELECT "storageKey", max("byteSize") AS bytes FROM "ProductImage" WHERE "storageKey" IS NOT NULL GROUP BY "storageKey") m`,
  ]);
  const warnings: string[] = [];
  const disks = [];
  for (const [label, directory] of [
    ['Kho ảnh', mediaRoot],
    ['Kho sao lưu', backupRoot],
  ]) {
    try {
      const s = await statfs(directory, { bigint: true });
      const total = Number(s.blocks * s.bsize),
        free = Number(s.bavail * s.bsize);
      const usedPercent = total ? 100 * (1 - free / total) : 0;
      disks.push({ label, total, free, usedPercent });
      if (usedPercent >= 70)
        warnings.push(
          label + ': ổ đĩa đã dùng ' + Math.round(usedPercent) + '%. Cần kiểm tra dung lượng.',
        );
    } catch {
      warnings.push(label + ': chưa đo được ổ đĩa.');
    }
  }
  let backups: {
    id: string;
    createdAt: string;
    bytes: number;
    mediaFiles: number;
    rows: number;
    verifiedAt: string | null;
  }[] = [];
  let incomplete = 0;
  try {
    const entries = (await readdir(backupRoot, { withFileTypes: true })).filter(
      (e) => e.isDirectory() && /^\d{4}-[\w-]+$/.test(e.name),
    );
    for (const e of entries.sort((a, b) => b.name.localeCompare(a.name))) {
      const folder = join(backupRoot, e.name);
      try {
        const raw = await readFile(join(folder, 'manifest.json'));
        const complete = JSON.parse(await readFile(join(folder, 'COMPLETE.json'), 'utf8'));
        if (createHash('sha256').update(raw).digest('hex') !== complete.manifestSha256)
          throw Error();
        const m = JSON.parse(raw.toString());
        if (m.format !== 'SAKURA_BACKUP_V1') throw Error();
        if (
          typeof m.createdAt !== 'string' ||
          !Number.isFinite(new Date(m.createdAt).getTime()) ||
          ![m.bytes, m.mediaFiles, m.rows].every((n) => Number.isSafeInteger(n) && n >= 0)
        )
          throw Error();
        const checks = (await readdir(folder))
          .filter((f) => /^restore-verified-\d+\.json$/.test(f))
          .sort()
          .reverse();
        const verified = checks[0]
          ? JSON.parse(await readFile(join(folder, checks[0]), 'utf8'))
          : null;
        backups.push({
          id: e.name,
          createdAt: m.createdAt,
          bytes: m.bytes,
          mediaFiles: m.mediaFiles,
          rows: m.rows,
          verifiedAt: verified?.verifiedAt || null,
        });
      } catch {
        incomplete++;
      }
    }
  } catch {
    /* A missing backup root is represented explicitly below. */
  }
  const latest = backups[0] || null;
  if (!latest) warnings.push('Chưa có bản sao lưu hoàn tất.');
  else {
    if (Date.now() - new Date(latest.createdAt).getTime() > 24 * 3600000)
      warnings.push('Bản sao gần nhất đã quá 24 giờ.');
    if (!latest.verifiedAt) warnings.push('Bản sao gần nhất chưa được thử phục hồi.');
  }
  if (incomplete)
    warnings.push('Có ' + incomplete + ' thư mục sao lưu chưa hoàn tất hoặc không đọc được.');
  return {
    checkedAt: new Date().toISOString(),
    databaseBytes: Number(size[0].bytes),
    tableBytes: tables.reduce((s, t) => s + Number(t.bytes), 0),
    tables: tables.slice(0, 10).map((t) => ({ name: t.name, bytes: Number(t.bytes) })),
    media: {
      files: Number(images[0].files),
      links: Number(images[0].links),
      bytes: Number(images[0].bytes),
    },
    disks,
    backups: backups.slice(0, 10),
    backupCount: backups.length,
    incomplete,
    warnings,
    automaticBackup: false,
    offsiteBackup: false,
  };
}
