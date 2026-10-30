import { Prisma } from '@sakura/database';
import { Database } from '../db';
export async function purchaseCounts(db: Pick<Database, '$queryRaw'>, customerIds: string[]) {
  const ids = [...new Set(customerIds)];
  if (!ids.length) return new Map<string, number>();
  const params = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await db.$queryRaw<{ customerId: string; count: number }[]>(Prisma.sql`
    SELECT "customerId",COUNT(*)::int count FROM (
      SELECT "customerId" FROM "Order" WHERE "customerId" IN (${params}) AND status IN ('CONFIRMED','COMPLETED')
      UNION ALL SELECT "customerId" FROM "HistoricalOrder" WHERE "customerId" IN (${params})
      AND LOWER(TRANSLATE(TRIM("sourceStatus"),'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ','àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ')) IN ('đã hoàn thành','hoàn thành','đang giao dịch','đã xác nhận','completed','confirmed')
    ) orders GROUP BY "customerId"
  `);
  return new Map(rows.map((r) => [r.customerId, r.count]));
}
