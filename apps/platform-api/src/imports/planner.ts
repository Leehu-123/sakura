import { createHash } from 'node:crypto';
import { Prisma } from '@sakura/database';
import { hasPermission } from '../auth/policy';
import { Kind, SourceRow, RowError, requireValue, integer, sourceDate, fields } from './format';
// PostgreSQL JSONB may reorder object keys; signatures must depend on content only.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    );
  return v;
}
export const digest = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex');
type Data = Record<string, string>;
export type Plan = {
  lines: number[];
  externalId: string;
  label: string;
  action: 'CREATE' | 'SKIP' | 'ERROR';
  errors: string[];
  warnings: string[];
  data: Data;
  items: Data[];
  fingerprint: string;
  dependency: Data;
};
const lineKeys = ['sku', 'productName', 'unit', 'quantity', 'unitPrice', 'lineTotal'];
function phone(v: string) {
  let s = v.replace(/[\s().-]/g, '').replace(/^(?:\+84|0084|84)/, '0');
  if (!/^0[235789]\d{8,9}$/.test(s)) throw new RowError('Số điện thoại Việt Nam không hợp lệ.');
  return s;
}
export async function planImport(
  tx: Prisma.TransactionClient,
  kind: Kind,
  rows: SourceRow[],
): Promise<Plan[]> {
  const grouped: SourceRow[][] = [];
  for (const row of rows) {
    const group =
      kind === 'ORDERS'
        ? grouped.find((g) => g[0].data.externalId === row.data.externalId)
        : undefined;
    if (group) group.push(row);
    else grouped.push([row]);
  }
  const plans: Plan[] = [];
  const seen = new Set<string>(),
    phones = new Set<string>(),
    skus = new Set<string>(),
    groups = new Map<string, string>();
  for (const group of grouped) {
    const d = { ...group[0].data };
    const items =
      kind === 'ORDERS'
        ? group.map((r) => Object.fromEntries(lineKeys.map((k) => [k, r.data[k]])))
        : [];
    const p: Plan = {
      lines: group.map((r) => r.line),
      externalId: d.externalId,
      label: d.name || d.productName || d.number || d.externalId,
      action: 'CREATE',
      errors: [],
      warnings: [],
      data: d,
      items,
      fingerprint: '',
      dependency: {},
    };
    plans.push(p);
    try {
      for (const r of group)
        for (const f of fields[kind])
          if (f.required)
            requireValue(r.data, f.key, f.key === 'shippingAddress' ? 1000 : 200, f.label);
      requireValue(d, 'externalId', 100, 'Mã nguồn');
      if (seen.has(d.externalId)) throw new RowError('Mã nguồn bị lặp trong file.');
      seen.add(d.externalId);
      if (kind === 'CUSTOMERS') {
        d.phone = phone(d.phone);
        d.ownerEmail = d.ownerEmail.toLowerCase();
        if (d.name.length < 2 || d.name.length > 150 || d.address.length > 1000)
          throw new RowError('Tên cần 2–150, địa chỉ tối đa 1.000 ký tự.');
        if (phones.has(d.phone)) throw new RowError('Trùng số điện thoại trong file.');
        phones.add(d.phone);
      } else if (kind === 'PRODUCTS') {
        d.sku = d.sku.toUpperCase();
        if (!/^[A-Z0-9_-]{2,50}$/.test(d.sku))
          throw new RowError('SKU cần 2–50 ký tự chữ, số, gạch ngang hoặc gạch dưới.');
        if (
          d.productName.length < 2 ||
          d.productName.length > 150 ||
          d.variantName.length > 100 ||
          d.unit.length > 30 ||
          d.category.length > 100
        )
          throw new RowError(
            'Tên sản phẩm cần 2–150 ký tự; tên biến thể/nhóm tối đa 100; đơn vị tối đa 30.',
          );
        requireValue(d, 'productId', 100, 'Mã sản phẩm Sapo');
        d.price = integer(d.price, 'Giá bán', 999999999999n).toString();
        if (skus.has(d.sku)) throw new RowError('Trùng SKU trong file.');
        skus.add(d.sku);
        const groupHash = digest([d.productName, d.category]);
        if (groups.has(d.productId) && groups.get(d.productId) !== groupHash)
          throw new RowError('Cùng mã sản phẩm nhưng khác tên hoặc nhóm hàng.');
        groups.set(d.productId, groupHash);
      } else {
        for (const r of group)
          for (const f of fields.ORDERS.filter((f) => !lineKeys.includes(f.key)))
            if (r.data[f.key] !== d[f.key])
              throw new RowError(
                'Các dòng cùng đơn phải có cùng thông tin khách, ngày, trạng thái và tổng tiền.',
              );
        d.orderedAt = sourceDate(d.orderedAt);
        // Original recipient phone may be foreign or a legacy value; retain it exactly.
        if (!d.sourceClosedBy)
          p.warnings.push('Thiếu người chốt trong nguồn; lưu là chưa có dữ liệu.');
        let sum = 0n;
        const orderSkus = new Set<string>();
        for (const item of items) {
          if (orderSkus.has(item.sku))
            throw new RowError('Cùng đơn có SKU lặp; gộp số lượng hoặc kiểm tra dòng trùng.');
          orderSkus.add(item.sku);
          const qty = integer(item.quantity, 'Số lượng', 1000000n);
          if (qty === 0n) throw new RowError('Số lượng phải lớn hơn 0.');
          const price = integer(item.unitPrice, 'Đơn giá'),
            total = integer(item.lineTotal, 'Thành tiền dòng');
          if (price * qty !== total)
            throw new RowError(
              'Thành tiền dòng phải bằng đơn giá × số lượng. Chuẩn hóa giảm giá dòng trước khi nhập.',
            );
          item.quantity = qty.toString();
          item.unitPrice = price.toString();
          item.lineTotal = total.toString();
          sum += total;
        }
        for (const k of ['subtotal', 'discount', 'shippingFee', 'total', 'paidAmount'])
          d[k] = integer(d[k], fields.ORDERS.find((f) => f.key === k)!.label).toString();
        if (
          sum !== BigInt(d.subtotal) ||
          BigInt(d.discount) > sum ||
          sum - BigInt(d.discount) + BigInt(d.shippingFee) !== BigInt(d.total)
        )
          throw new RowError('Tổng tiền hàng, giảm giá, phí giao và tổng đơn không khớp.');
        if (BigInt(d.paidAmount) > BigInt(d.total))
          throw new RowError(
            'Tiền đã nhận vượt tổng đơn; cần đối chiếu dữ liệu hoàn/đổi trước khi nhập.',
          );
        for (const k of lineKeys) delete d[k];
        items.sort((a, b) => a.sku.localeCompare(b.sku));
      }
      p.fingerprint = digest({ data: d, items });
      const ref = await tx.sapoReference.findUnique({
        where: { kind_externalId: { kind, externalId: d.externalId } },
      });
      if (ref) {
        if (ref.fingerprint !== p.fingerprint)
          throw new RowError(
            'Mã nguồn đã nhập nhưng nội dung khác. Không tự ghi đè dữ liệu; cần đối chiếu bản cũ.',
          );
        p.action = 'SKIP';
        p.dependency = { targetId: ref.targetId };
        continue;
      }
      if (kind === 'CUSTOMERS') {
        if (await tx.customer.findUnique({ where: { phone: d.phone } }))
          throw new RowError(
            'Số điện thoại đã có trong Sakura nhưng chưa liên kết mã Sapo. Cần đối chiếu thủ công; không tự gộp hồ sơ.',
          );
        const owner = await tx.user.findUnique({
          where: { email: d.ownerEmail },
          include: {
            roleAssignments: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        });
        const grants =
          owner?.roleAssignments.flatMap((a) =>
            a.role.permissions.map((p) => ({ permission: p.permission.code, scope: p.scope })),
          ) || [];
        if (
          !owner ||
          owner.status !== 'ACTIVE' ||
          !hasPermission(grants, 'sales.customers.read', 'ASSIGNED') ||
          !hasPermission(grants, 'sales.customers.manage', 'ASSIGNED')
        )
          throw new RowError(
            'Email Sale phải thuộc tài khoản đang hoạt động, có quyền xem và chăm sóc khách.',
          );
        p.dependency.ownerId = owner.id;
        if (d.regionCode) {
          const region = await tx.region.findUnique({ where: { code: d.regionCode } });
          if (!region) throw new RowError('Không tìm thấy mã khu vực.');
          p.dependency.regionId = region.id;
        }
      } else if (kind === 'PRODUCTS') {
        if (await tx.productVariant.findUnique({ where: { sku: d.sku } }))
          throw new RowError('SKU đã tồn tại nhưng chưa liên kết mã Sapo. Không tự ghi đè.');
        const ref = await tx.sapoReference.findUnique({
          where: { kind_externalId: { kind: 'PRODUCT_GROUP', externalId: d.productId } },
        });
        if (ref) {
          if (ref.fingerprint !== digest([d.productName, d.category]))
            throw new RowError('Tên/nhóm sản phẩm khác lần nhập trước.');
          const product = await tx.product.findUnique({ where: { id: ref.targetId } });
          if (!product || !product.isActive)
            throw new RowError('Sản phẩm liên kết không còn hoạt động.');
          p.dependency.productId = product.id;
          p.dependency.version = String(product.version);
        }
      } else {
        const ref = await tx.sapoReference.findUnique({
          where: { kind_externalId: { kind: 'CUSTOMERS', externalId: d.customerId } },
        });
        if (!ref) throw new RowError('Chưa nhập mã khách Sapo này. Nhập khách hàng trước đơn cũ.');
        const customer = await tx.customer.findUnique({ where: { id: ref.targetId } });
        if (!customer) throw new RowError('Khách liên kết không tồn tại.');
        p.dependency.customerId = customer.id;
        p.dependency.version = String(customer.version);
      }
    } catch (e) {
      if (!(e instanceof RowError)) throw e;
      p.action = 'ERROR';
      p.errors.push(e.message);
    }
  }
  // A conflict in a product group must block the entire batch, even if earlier rows were valid.
  return plans;
}
