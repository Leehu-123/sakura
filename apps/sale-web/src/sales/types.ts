export type Actor = { id: string; grants: { permission: string; scope: string }[] };
export type Person = { id: string; displayName: string };
export type Region = { id: string; name: string };
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Assignment = {
  id: string;
  user: Person;
  assignedBy?: Person;
  reason: string;
  startedAt: string;
  endedAt: string | null;
};
export type Customer = {
  sourceData?: Record<string, unknown>;
  id: string;
  name: string;
  phone: string | null;
  address: string;
  status: string;
  regionId?: string;
  region?: Region;
  expectedProducts?: string[];
  version: number;
  assignments: Assignment[];
  activities?: { id: string; note: string; createdAt: string; author: Person }[];
  assignmentHistory?: Assignment[];
};
export type Variant = {
  images?: { id: string; title: string }[];
  id: string;
  sku: string;
  name: string;
  unit: string;
  price: string;
  isActive: boolean;
  version: number;
};
export type Product = {
  images?: { id: string; title: string }[];
  sourceData?: Record<string, unknown>;
  id: string;
  name: string;
  category: string;
  description: string;
  isActive: boolean;
  version: number;
  variants: Variant[];
};
export type OrderItem = {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  unit: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
};
export type Order = {
  id: string;
  number: number;
  customer: { id: string; name: string };
  createdBy: Person;
  closedBy: Person | null;
  closedByUserId: string | null;
  status: string;
  paymentStatus: string;
  shippingStatus: string;
  carrierName: string;
  trackingCode: string;
  version: number;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  note: string;
  subtotal: string;
  discount: string;
  shippingFee: string;
  total: string;
  paidAmount: string;
  createdAt: string;
  items?: OrderItem[];
  history?: { id: string; actor: Person; action: string; note: string; createdAt: string }[];
};
export const customerStatuses: Record<string, string> = {
  NEW: 'Khách mới',
  CONSULTING: 'Đang tư vấn',
  WON: 'Đã chốt đơn',
  RETURNING: 'Khách cũ',
  INACTIVE: 'Tạm dừng',
};
export const orderStatuses: Record<string, string> = {
  DRAFT: 'Đơn nháp',
  CONFIRMED: 'Đã chốt',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};
export const paymentStatuses: Record<string, string> = {
  UNPAID: 'Chưa thu',
  PARTIAL: 'Thu một phần',
  PAID: 'Đã thu đủ',
};
export const money = (n?: string | number | bigint | null) => {
  if (n === undefined || n === null || n === '') return '0 đ';
  try {
    let intVal: bigint;
    if (typeof n === 'bigint') {
      intVal = n;
    } else if (typeof n === 'number') {
      intVal = BigInt(Math.round(isNaN(n) ? 0 : n));
    } else {
      const s = String(n).trim().split('.')[0].replace(/[^\d-]/g, '');
      intVal = s ? BigInt(s) : 0n;
    }
    return new Intl.NumberFormat('vi-VN').format(intVal) + ' đ';
  } catch {
    return '0 đ';
  }
};
export const date = (s?: string | null) => {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(d);
  } catch {
    return '—';
  }
};
export const number = (n: number) => 'SK-' + String(n).padStart(6, '0');
export const has = (actor: Actor, p: string) =>
  actor.grants.some((g) => g.permission === p && ['GLOBAL', 'ASSIGNED'].includes(g.scope));

export const shippingStatuses: Record<string, string> = {
  NOT_CREATED: 'Chưa có vận đơn',
  WAITING_PICKUP: 'Chờ lấy hàng',
  PICKED_UP: 'Đã lấy hàng',
  IN_TRANSIT: 'Đang giao',
  DELIVERED: 'Đã giao',
  RETURNED: 'Hoàn hàng',
  CANCELLED: 'Đã hủy vận chuyển',
};
