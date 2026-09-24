// @ts-check
// Daily Telegram report script
// Runs via systemd timer (sakura-telegram-report.timer) at 22:00 VN time
// Usage: /opt/sakura/node/bin/node /srv/sakura/current/scripts/ops/daily-telegram-report.cjs

'use strict';

let PrismaClient;
try {
  ({ PrismaClient } = require('@prisma/client'));
} catch {
  ({ PrismaClient } = require('/srv/sakura/current/node_modules/@prisma/client'));
}

const VN_OFFSET_MS = 7 * 3600000;

async function main() {
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

  try {
    // 1. Load Telegram config
    const config = await db.telegramConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.enabled || !config.botToken) {
      console.log('[telegram-report] Disabled or no bot token. Skipping.');
      return;
    }

    const botToken = config.botToken;

    // 2. Calculate today's date range in VN timezone
    const now = new Date();
    const todayVN = new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
    const startOfDay = new Date(todayVN + 'T00:00:00+07:00');
    const endOfDay = new Date(startOfDay.getTime() + 86400000);
    const startOfMonth = new Date(todayVN.slice(0, 8) + '01T00:00:00+07:00');

    console.log(`[telegram-report] Generating report for ${todayVN}`);

    // 3. Query today's sales data (Sakura orders only)
    const todayData = await db.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED'))::int AS "validOrders",
        COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS "cancelledOrders",
        COALESCE(SUM(total) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)::text AS "totalSales",
        COALESCE(SUM("paidAmount") FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)::text AS "totalPaid",
        COALESCE(SUM(GREATEST(total - "paidAmount", 0)) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED') AND "paidAmount" IS NOT NULL), 0)::text AS "totalUnpaid",
        COUNT(DISTINCT "customerId") FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED'))::int AS "customerCount"
      FROM "Order"
      WHERE "createdAt" >= ${startOfDay.toISOString()}::timestamptz
        AND "createdAt" < ${endOfDay.toISOString()}::timestamptz
    `;

    const today = todayData[0] || {
      validOrders: 0, cancelledOrders: 0, totalSales: '0',
      totalPaid: '0', totalUnpaid: '0', customerCount: 0,
    };

    // 4. Query per-region breakdown
    const regionData = await db.$queryRaw`
      SELECT
        COALESCE(r.name, 'Chưa phân vùng') AS "regionName",
        COUNT(*) FILTER (WHERE o.status IN ('CONFIRMED', 'COMPLETED'))::int AS "validOrders",
        COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('CONFIRMED', 'COMPLETED')), 0)::text AS "totalSales"
      FROM "Order" o
      JOIN "Customer" c ON c.id = o."customerId"
      LEFT JOIN "Region" r ON r.id = c."regionId"
      WHERE o."createdAt" >= ${startOfDay.toISOString()}::timestamptz
        AND o."createdAt" < ${endOfDay.toISOString()}::timestamptz
        AND o.status IN ('CONFIRMED', 'COMPLETED')
      GROUP BY r.name
      ORDER BY SUM(o.total) DESC NULLS LAST
    `;

    // 5. Query month-to-date totals
    const monthData = await db.$queryRaw`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)::text AS "monthSales"
      FROM "Order"
      WHERE "createdAt" >= ${startOfMonth.toISOString()}::timestamptz
        AND "createdAt" < ${endOfDay.toISOString()}::timestamptz
    `;

    const monthSales = monthData[0]?.monthSales || '0';

    // 6. Build admin report message
    const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);
    const dateLabel = todayVN.split('-').reverse().join('/');

    let adminMsg = `📊 *Báo cáo doanh số ngày ${dateLabel}*\n\n`;
    adminMsg += `📦 Đơn hợp lệ: *${today.validOrders}*\n`;
    adminMsg += `💰 Doanh số: *${fmt(today.totalSales)} đ*\n`;
    adminMsg += `✅ Đã thu: *${fmt(today.totalPaid)} đ*\n`;
    adminMsg += `⏳ Phải thu: *${fmt(today.totalUnpaid)} đ*\n`;
    adminMsg += `👥 Khách mua: *${today.customerCount}*\n`;
    adminMsg += `❌ Đơn hủy: *${today.cancelledOrders}*\n`;

    if (regionData.length > 0) {
      adminMsg += `\n── *Theo vùng* ──\n`;
      for (const r of regionData) {
        adminMsg += `🟢 ${r.regionName}: ${r.validOrders} đơn — *${fmt(r.totalSales)} đ*\n`;
      }
    }

    adminMsg += `\n📅 Tháng này: *${fmt(monthSales)} đ*`;

    // 7. Get all users with telegramChatId
    const users = await db.user.findMany({
      where: {
        status: 'ACTIVE',
        telegramChatId: { not: null },
      },
      select: {
        id: true,
        displayName: true,
        telegramChatId: true,
        roleAssignments: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: { select: { code: true } },
                    scope: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // 8. Send admin reports
    const isAdmin = (user) =>
      user.roleAssignments.some((a) =>
        a.role.permissions.some(
          (p) => p.permission.code === 'sales.reports.read' && p.scope === 'GLOBAL',
        ),
      );

    for (const user of users) {
      if (!user.telegramChatId) continue;

      if (isAdmin(user)) {
        // Send admin report (total + per-region)
        await sendTelegram(botToken, user.telegramChatId, adminMsg);
        console.log(`[telegram-report] Sent admin report to ${user.displayName}`);
      }

      // Query personal sales for this user
      const personalData = await db.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED'))::int AS "validOrders",
          COALESCE(SUM(total) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)::text AS "totalSales",
          COALESCE(SUM("paidAmount") FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)::text AS "totalPaid",
          COALESCE(SUM(GREATEST(total - "paidAmount", 0)) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED') AND "paidAmount" IS NOT NULL), 0)::text AS "totalUnpaid"
        FROM "Order"
        WHERE ("closedByUserId" = ${user.id}::uuid OR "createdById" = ${user.id}::uuid)
          AND "createdAt" >= ${startOfDay.toISOString()}::timestamptz
          AND "createdAt" < ${endOfDay.toISOString()}::timestamptz
      `;

      const personal = personalData[0] || { validOrders: 0, totalSales: '0', totalPaid: '0', totalUnpaid: '0' };

      // Monthly personal
      const monthPersonalData = await db.$queryRaw`
        SELECT
          COALESCE(SUM(total) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)::text AS "monthSales"
        FROM "Order"
        WHERE ("closedByUserId" = ${user.id}::uuid OR "createdById" = ${user.id}::uuid)
          AND "createdAt" >= ${startOfMonth.toISOString()}::timestamptz
          AND "createdAt" < ${endOfDay.toISOString()}::timestamptz
      `;

      const monthPersonal = monthPersonalData[0]?.monthSales || '0';

      let saleMsg = `📊 *Doanh số cá nhân ngày ${dateLabel}*\n`;
      saleMsg += `👋 Xin chào *${user.displayName}*\n\n`;
      saleMsg += `📦 Đơn hợp lệ: *${personal.validOrders}*\n`;
      saleMsg += `💰 Doanh số: *${fmt(personal.totalSales)} đ*\n`;
      saleMsg += `✅ Đã thu: *${fmt(personal.totalPaid)} đ*\n`;
      saleMsg += `⏳ Phải thu: *${fmt(personal.totalUnpaid)} đ*\n`;
      saleMsg += `\n📅 Tháng này: *${fmt(monthPersonal)} đ*`;

      if (!isAdmin(user)) {
        // Only send personal report for non-admins (admins already got the full report)
        await sendTelegram(botToken, user.telegramChatId, saleMsg);
        console.log(`[telegram-report] Sent personal report to ${user.displayName}`);
      } else {
        // Admin also gets personal stats as a separate message
        await sendTelegram(botToken, user.telegramChatId, saleMsg);
        console.log(`[telegram-report] Sent personal report to admin ${user.displayName}`);
      }
    }

    console.log(`[telegram-report] Done. Sent to ${users.filter(u => u.telegramChatId).length} users.`);
  } finally {
    await db.$disconnect();
  }
}

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[telegram-report] Failed to send to ${chatId}: ${res.status} ${body}`);
  }
}

main().catch((err) => {
  console.error('[telegram-report] Fatal error:', err);
  process.exit(1);
});
