export type Scope = 'GLOBAL' | 'ASSIGNED' | 'SELF';
export type Grant = { permission: string; scope: Scope };
export type Principal = {
  id: string;
  sessionId: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  grants: Grant[];
};
export function hasPermission(grants: Grant[], permission: string, requiredScope?: Scope) {
  return grants.some(
    (g) =>
      g.permission === permission &&
      (!requiredScope || g.scope === requiredScope || g.scope === 'GLOBAL'),
  );
}
// Applied to Sales queries before pagination, detail access and mutations.
// Region and the historical closer never grant customer visibility.
export function customerPredicate(principal: Principal, permission = 'sales.customers.read') {
  const grants = principal.grants.filter((g) => g.permission === permission);
  if (grants.some((g) => g.scope === 'GLOBAL')) return {};
  if (grants.some((g) => g.scope === 'ASSIGNED'))
    return { assignments: { some: { userId: principal.id, endedAt: null } } };
  return { id: { in: [] as string[] } };
}
export function orderPredicate(principal: Principal, permission = 'sales.orders.read') {
  const grants = principal.grants.filter((g) => g.permission === permission);
  if (grants.some((g) => g.scope === 'GLOBAL')) return {};
  if (grants.some((g) => g.scope === 'ASSIGNED'))
    return { customer: { assignments: { some: { userId: principal.id, endedAt: null } } } };
  return { id: { in: [] as string[] } };
}
