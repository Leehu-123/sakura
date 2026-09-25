import { Prisma } from '@sakura/database';
export type ForecastItem = { name: string; unit: string; quantity: number };
export function probability(c: { status: string; closingProbability: number | null }) {
  return c.status === 'WON' ? 100 : c.status === 'INACTIVE' ? 0 : c.closingProbability;
}
export function forecastRevenue(value: Prisma.Decimal | string | null, percent: number | null) {
  return new Prisma.Decimal(value || 0).mul(percent ?? 0).div(100);
}
export function forecastItems(value: unknown): ForecastItem[] {
  return Array.isArray(value)
    ? value.filter(
        (x): x is ForecastItem =>
          !!x &&
          typeof x.name === 'string' &&
          typeof x.unit === 'string' &&
          typeof x.quantity === 'number' &&
          Number.isFinite(x.quantity) &&
          x.quantity > 0,
      )
    : [];
}
export function summarizePipeline(
  customers: {
    status: string;
    closingProbability: number | null;
    expectedRevenue: Prisma.Decimal | null;
    expectedItems: unknown;
    expectedProducts: string[];
  }[],
) {
  let raw = new Prisma.Decimal(0),
    weighted = new Prisma.Decimal(0),
    missingProbability = 0,
    missingQuantities = 0;
  const products = new Map<
    string,
    { name: string; unit: string; quantity: Prisma.Decimal; weightedQuantity: Prisma.Decimal }
  >();
  const groups = ['NEW', 'CONSULTING', 'WON', 'RETURNING', 'INACTIVE'].map((status) => {
    const rows = customers.filter((c) => c.status === status);
    let total = new Prisma.Decimal(0);
    for (const c of rows) {
      const p = probability(c),
        items = forecastItems(c.expectedItems);
      raw = raw.add(c.expectedRevenue || 0);
      total = total.add(forecastRevenue(c.expectedRevenue, p));
      if (p === null) missingProbability++;
      if (c.expectedProducts.some((name) => !items.some((i) => i.name === name)))
        missingQuantities++;
      for (const i of items) {
        const name = i.name.trim(),
          unit = i.unit.trim().toLocaleLowerCase('vi');
        const key = JSON.stringify([name.toLocaleLowerCase('vi'), unit]);
        const row = products.get(key) || {
          name,
          unit,
          quantity: new Prisma.Decimal(0),
          weightedQuantity: new Prisma.Decimal(0),
        };
        row.quantity = row.quantity.add(i.quantity);
        row.weightedQuantity = row.weightedQuantity.add(
          new Prisma.Decimal(i.quantity).mul(p ?? 0).div(100),
        );
        products.set(key, row);
      }
    }
    weighted = weighted.add(total);
    return { status, count: rows.length, expectedRevenue: total.toFixed(0) };
  });
  const unitTotals = new Map<string, Prisma.Decimal>();
  for (const row of products.values())
    unitTotals.set(
      row.unit,
      (unitTotals.get(row.unit) || new Prisma.Decimal(0)).add(row.weightedQuantity),
    );
  return {
    groups,
    totalExpectedRevenue: weighted.toFixed(0),
    totalPotentialRevenue: raw.toFixed(0),
    missingProbability,
    missingQuantities,
    expectedProducts: [...products.values()].map((p) => ({
      ...p,
      quantity: p.quantity.toFixed(2),
      weightedQuantity: p.weightedQuantity.toFixed(2),
    })),
    expectedShipments: [...unitTotals].map(([unit, quantity]) => ({
      unit,
      quantity: quantity.toFixed(2),
    })),
  };
}
