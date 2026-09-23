const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Prisma } = require('@sakura/database');
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const str = (v) => (v == null ? '' : String(v).trim());
const phone = (v) =>
  str(v)
    .replace(/[\s().-]/g, '')
    .replace(/^(\+84|0084)/, '0');
function id(v) {
  if (typeof v === 'number' && !Number.isSafeInteger(v))
    throw new Error('Mã số mất độ chính xác trong nguồn');
  const s = str(v);
  if (!s) throw new Error('Thiếu mã nguồn');
  return s;
}
function money(v) {
  const s = str(v).replace(/,/g, '');
  if (!/^-?\d+$/.test(s)) throw new Error('Tiền không phải số nguyên: ' + s);
  return new Prisma.Decimal(s).toFixed(0);
}
function sourceDate(v) {
  const m = str(v).match(/^(\d{2})[-/](\d{2})[-/](\d{4}) (\d{2}):(\d{2})$/);
  if (!m) throw new Error('Ngày nguồn không đúng định dạng');
  const iso = m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':00+07:00';
  const d = new Date(iso);
  if (
    !Number.isFinite(d.getTime()) ||
    new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== iso.slice(0, 16)
  )
    throw new Error('Ngày nguồn không hợp lệ');
  return d.toISOString();
}
function rows(file, first) {
  const sheet = file.sheets[0];
  if (
    !sheet ||
    sheet.rows[first]?.[0] !==
      (first === 4
        ? 'STT'
        : first === 0 && file.file.startsWith('customers')
          ? 'Id khách hàng'
          : 'Đường dẫn/Alias')
  )
    throw new Error('Cấu trúc Excel không đúng mẫu đã kiểm chứng');
  return sheet.rows.slice(first + 1).map((r, i) => ({ row: i + first + 2, values: r }));
}
function raw(file, headers, record) {
  return {
    file: file.file,
    sha256: file.sha256,
    sheet: file.sheets[0].sheet,
    row: record.row,
    values: Object.fromEntries(headers.map((h, i) => [h, record.values[i] ?? null])),
  };
}
function prepare(files) {
  const cf = files.find((f) => f.file.startsWith('customers')),
    pf = files.find((f) => f.file.startsWith('products')),
    of = files.find((f) => f.file.startsWith('order_'));
  if (!cf || !pf || !of || files.length !== 3)
    throw new Error('Cần đúng ba file khách, sản phẩm, đơn');
  const customers = rows(cf, 0).map((r) => {
    const v = r.values,
      externalId = id(v[0]),
      n = [str(v[2]), str(v[1])].filter(Boolean).join(' '),
      p = phone(v[4]);
    if (p && !/^0[235789]\d{8,9}$/.test(p))
      throw new Error('Số liên hệ chưa hỗ trợ tại dòng ' + r.row);
    return {
      externalId,
      data: {
        name: n || 'Khách Sapo #' + externalId,
        phone: p || null,
        address: [v[6], v[7], v[13], v[11], v[9], v[8]]
          .map(str)
          .filter((x, i, a) => x && a.indexOf(x) === i)
          .join(', '),
        status: 'RETURNING',
        sourceData: {
          ...raw(cf, cf.sheets[0].rows[0], r),
          warnings: [
            ...(!p ? ['Nguồn thiếu số liên hệ'] : []),
            ...(!n ? ['Nguồn thiếu tên; dùng nhãn mã Sapo'] : []),
            'Chưa phân công người chăm sóc',
          ],
        },
      },
    };
  });
  const ph = new Map();
  for (const c of customers) {
    if (c.data.phone) {
      if (ph.has(c.data.phone)) throw new Error('Trùng điện thoại khách nguồn, cần đối chiếu');
      ph.set(c.data.phone, c.externalId);
    }
  }
  if (new Set(customers.map((c) => c.externalId)).size !== customers.length)
    throw new Error('Trùng mã khách nguồn');
  const groups = new Map();
  for (const r of rows(pf, 0)) {
    const v = r.values,
      k = id(v[42]);
    const g = groups.get(k) || [];
    g.push(r);
    groups.set(k, g);
  }
  const products = [],
    variants = [];
  const skus = new Set();
  let imageRows = 0;
  for (const [externalId, g] of groups) {
    const first = g.find((r) => str(r.values[1]));
    if (!first) throw new Error('Nhóm sản phẩm thiếu tên');
    const v = first.values;
    products.push({
      externalId,
      data: {
        name: str(v[1]),
        category: str(v[12]),
        description: '',
        sourceData: {
          file: pf.file,
          sha256: pf.sha256,
          sheet: pf.sheets[0].sheet,
          rows: g.map((r) => raw(pf, pf.sheets[0].rows[0], r)),
        },
      },
    });
    for (const r of g) {
      const v = r.values;
      if (!v[43]) {
        if (v[8] || v[1]) throw new Error('Dòng sản phẩm thiếu mã phiên bản');
        imageRows++;
        continue;
      }
      const sku = str(v[8]).toUpperCase();
      if (!/^[A-Z0-9_-]{2,50}$/.test(sku) || skus.has(sku))
        throw new Error('SKU không hợp lệ/trùng: ' + sku);
      skus.add(sku);
      const price = money(v[29]);
      if (BigInt(price) < 0n) throw new Error('Giá bán âm');
      variants.push({
        externalId: id(v[43]),
        productExternalId: externalId,
        data: {
          sku,
          name: [v[3], v[5], v[7]].map(str).filter(Boolean).join(' / ') || 'Mặc định',
          unit: str(v[10]),
          price,
          sourceData: raw(pf, pf.sheets[0].rows[0], r),
        },
      });
    }
  }
  if (new Set(variants.map((v) => v.externalId)).size !== variants.length)
    throw new Error('Trùng mã biến thể');
  const grouped = new Map();
  for (const r of rows(of, 4)) {
    const k = id(r.values[1]),
      g = grouped.get(k) || [];
    g.push(r);
    grouped.set(k, g);
  }
  const orders = [];
  let linked = 0,
    fractional = 0,
    zero = 0;
  for (const [externalId, g] of grouped) {
    const v = g[0].values;
    for (const r of g)
      for (const col of [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 17])
        if (str(r.values[col]) !== str(v[col]))
          throw new Error('Thông tin giữa các dòng đơn khác nhau: ' + externalId);
    const items = g.map((r) => {
      const x = r.values,
        q = new Prisma.Decimal(str(x[12]));
      if (q.lt(0)) throw new Error('Số lượng âm cần đối chiếu: ' + externalId);
      if (!q.isInteger()) fractional++;
      if (q.eq(0)) zero++;
      return {
        sourceRow: r.row,
        productName: str(x[10]),
        sku: str(x[11]),
        quantity: q.toString(),
        unit: '',
        unitPrice: money(x[13]),
        lineTotal: null,
      };
    });
    const qty = items.reduce((a, i) => a.plus(i.quantity), new Prisma.Decimal(0));
    if (!qty.eq(str(v[14]))) throw new Error('Tổng số lượng không khớp ' + externalId);
    const total = money(v[15]);
    if (BigInt(total) < 0n) throw new Error('Tổng tiền âm: ' + externalId);
    const customerExternalId = ph.get(phone(v[9])) || null;
    if (customerExternalId) linked++;
    orders.push({
      externalId,
      customerExternalId,
      data: {
        externalId,
        number: externalId,
        sourceCustomerName: str(v[7]),
        sourceCreatedBy: str(v[5]),
        sourceChannel: str(v[4]),
        linkMethod: customerExternalId ? 'UNIQUE_NORMALIZED_PHONE' : 'UNLINKED',
        sourceStatus: str(v[6]),
        sourcePaymentStatus: '',
        sourceShippingStatus: '',
        sourceClosedBy: '',
        orderedAt: sourceDate(v[2]),
        recipientName: '',
        recipientPhone: '',
        shippingAddress: '',
        subtotal: null,
        discount: null,
        shippingFee: null,
        total,
        paidAmount: null,
        items,
        sourceData: {
          file: of.file,
          sha256: of.sha256,
          sheet: of.sheets[0].sheet,
          sourcePhone: str(v[9]),
          sourceEmail: str(v[8]),
          branch: str(v[3]),
          note: str(v[16]),
          tags: str(v[17]),
          totalQuantity: qty.toString(),
          rows: g.map((r) => raw(of, of.sheets[0].rows[4], r)),
          warnings: [
            'Nguồn không có người chốt, địa chỉ giao, thanh toán hoặc phí/giảm giá',
            'Thành tiền dòng không có trong nguồn; không suy ra từ đơn giá',
            ...(!customerExternalId ? ['Chưa liên kết hồ sơ khách'] : []),
          ],
        },
      },
    });
  }
  const summary = {
    customers: customers.length,
    missingPhone: customers.filter((c) => !c.data.phone).length,
    missingName: customers.filter((c) => c.data.name.startsWith('Khách Sapo #')).length,
    products: products.length,
    variants: variants.length,
    imageRows,
    missingUnit: variants.filter((v) => !v.data.unit).length,
    orders: orders.length,
    orderLines: orders.reduce((a, o) => a + o.data.items.length, 0),
    linkedOrders: linked,
    unlinkedOrders: orders.length - linked,
    fractionalLines: fractional,
    zeroQuantityLines: zero,
    orderTotal: orders.reduce((a, o) => a + BigInt(o.data.total), 0n).toString(),
  };
  const plan = {
    version: 1,
    files: files.map((f) => ({ file: f.file, sha256: f.sha256 })),
    summary,
    customers,
    products,
    variants,
    orders,
  };
  return { ...plan, digest: hash(plan) };
}
module.exports = { prepare, hash, phone, sourceDate };
if (require.main === module) {
  const dir = process.argv[2];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^(customers|products|order_).*\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const p = prepare(files);
  fs.writeFileSync(path.join(dir, 'prepared.json'), JSON.stringify(p));
  console.log(JSON.stringify({ digest: p.digest, ...p.summary }, null, 2));
}
