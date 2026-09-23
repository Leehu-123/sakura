import { PrismaClient, AccessScope } from '@prisma/client';
import { hashPassword } from '../../../apps/platform-api/src/auth/password';
const db = new PrismaClient();
const entries: Array<[string, string, AccessScope[]]> = [
  ['catalog.products.read', 'Xem sản phẩm và bảng giá', ['GLOBAL']],
  ['catalog.products.manage', 'Quản lý sản phẩm và bảng giá', ['GLOBAL']],
  ['core.messenger.manage', 'Quản lý Messenger và đối chiếu gửi tin', ['GLOBAL']],
  ['core.imports.manage', 'Nhập dữ liệu Sapo', ['GLOBAL']],
  ['core.users.read', 'Xem tài khoản', ['GLOBAL']],
  ['core.users.manage', 'Quản lý tài khoản', ['GLOBAL']],
  ['core.roles.read', 'Xem vai trò và quyền', ['GLOBAL']],
  ['core.roles.manage', 'Quản lý vai trò và phân quyền', ['GLOBAL']],
  ['core.catalogs.read', 'Xem danh mục công ty', ['GLOBAL']],
  ['core.catalogs.manage', 'Quản lý danh mục công ty', ['GLOBAL']],
  ['core.audit.read', 'Xem nhật ký thao tác', ['GLOBAL']],
  ['sales.customers.read', 'Xem khách hàng', ['GLOBAL', 'ASSIGNED']],
  ['sales.customers.manage', 'Chăm sóc khách hàng', ['GLOBAL', 'ASSIGNED']],
  ['sales.customers.handoff', 'Bàn giao khách hàng', ['GLOBAL']],
  ['sales.orders.read', 'Xem đơn hàng', ['GLOBAL', 'ASSIGNED']],
  ['sales.orders.manage', 'Tạo và cập nhật đơn hàng', ['GLOBAL', 'ASSIGNED']],
  ['sales.chat.use', 'Sử dụng hội thoại', ['GLOBAL', 'ASSIGNED']],
  ['sales.shipments.manage', 'Quản lý vận chuyển', ['GLOBAL', 'ASSIGNED']],
  ['sales.reports.read', 'Xem báo cáo bán hàng', ['GLOBAL', 'ASSIGNED']],
  ['sales.tasks.read', 'Xem công việc', ['GLOBAL', 'ASSIGNED']],
  ['sales.tasks.manage', 'Quản lý công việc', ['GLOBAL', 'ASSIGNED']],
];
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12 || password.startsWith('REPLACE_'))
    throw new Error('Cần cấu hình SEED_ADMIN_EMAIL và SEED_ADMIN_PASSWORD mạnh.');
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const core = await tx.application.upsert({
      where: { code: 'core' },
      create: { code: 'core', name: 'Nền tảng công ty' },
      update: {},
    });
    const sales = await tx.application.upsert({
      where: { code: 'sales' },
      create: { code: 'sales', name: 'Kinh doanh' },
      update: {},
    });
    const catalog = await tx.application.upsert({
      where: { code: 'catalog' },
      create: { code: 'catalog', name: 'Danh mục dùng chung' },
      update: {},
    });
    const permissions = [];
    for (const [code, name, allowedScopes] of entries) {
      permissions.push(
        await tx.permission.upsert({
          where: { code },
          create: {
            code,
            name,
            allowedScopes,
            applicationId: code.startsWith('core.')
              ? core.id
              : code.startsWith('catalog.')
                ? catalog.id
                : sales.id,
          },
          update: { name, allowedScopes },
        }),
      );
    }
    const roles = [
      {
        code: 'admin',
        name: 'Quản trị viên',
        description: 'Quản lý nền tảng và toàn bộ dữ liệu công ty.',
      },
      {
        code: 'sales_lead',
        name: 'Sale tổng',
        description: 'Trực fanpage, chốt đơn, bàn giao khách và tổng hợp bán hàng.',
      },
      {
        code: 'regional_sales',
        name: 'Sale vùng',
        description: 'Chỉ xem khách được giao và đơn của những khách đó.',
      },
    ];
    for (const definition of roles) {
      const role = await tx.role.upsert({
        where: { code: definition.code },
        create: { ...definition, isSystem: true },
        update: { ...definition, isSystem: true },
      });
      const grants = permissions.filter(
        (p) =>
          definition.code === 'admin' ||
          p.code === 'catalog.products.read' ||
          (definition.code === 'sales_lead' && p.code === 'catalog.products.manage') ||
          (p.code.startsWith('sales.') &&
            (definition.code !== 'regional_sales' || p.code !== 'sales.customers.handoff')),
      );
      // System roles are intentionally reset to the documented baseline; custom roles remain untouched.
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: grants.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
          scope:
            definition.code === 'regional_sales' && p.code.startsWith('sales.')
              ? ('ASSIGNED' as const)
              : ('GLOBAL' as const),
        })),
      });
      if (definition.code === 'admin') {
        const existing = await tx.user.findUnique({ where: { email } });
        if (!existing) {
          await tx.user.create({
            data: {
              email,
              displayName: process.env.SEED_ADMIN_NAME || 'Quản trị Sakura',
              passwordHash,
              roleAssignments: { create: { roleId: role.id } },
            },
          });
        }
      }
    }
    for (const [code, name] of [
      ['NORTH', 'Miền Bắc'],
      ['SOUTH', 'Miền Nam'],
    ]) {
      await tx.region.upsert({ where: { code }, create: { code, name }, update: {} });
    }
    await tx.department.upsert({
      where: { code: 'SALES' },
      create: { code: 'SALES', name: 'Kinh doanh' },
      update: {},
    });
    await tx.auditLog.create({
      data: { action: 'system.seed', entity: 'Platform', metadata: { version: '0.1.0' } },
    });
  });
  console.log(
    'Đã khởi tạo 3 vai trò, 2 khu vực và tài khoản quản trị nếu chưa tồn tại. Không thay đổi mật khẩu tài khoản cũ.',
  );
}
main()
  .catch(() => {
    console.error('Khởi tạo thất bại. Kiểm tra cấu hình và kết nối cơ sở dữ liệu.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
