const { test } = require('node:test');
const assert = require('node:assert/strict');
const { customerPredicate, hasPermission, orderPredicate } = require('../dist/auth/policy');
const regional = {
  id: 'sale-north',
  sessionId: 's',
  email: 'sale@example.test',
  displayName: 'Sale',
  mustChangePassword: false,
  grants: [
    { permission: 'sales.customers.read', scope: 'ASSIGNED' },
    { permission: 'sales.orders.read', scope: 'ASSIGNED' },
  ],
};
test('Sale vùng chỉ được lọc qua phân công khách đang hiệu lực', () => {
  assert.deepEqual(customerPredicate(regional), {
    assignments: { some: { userId: 'sale-north', endedAt: null } },
  });
  assert.equal(JSON.stringify(customerPredicate(regional)).includes('region'), false);
});
test('Đơn hàng theo khách được giao, không theo người chốt lịch sử', () => {
  assert.deepEqual(orderPredicate(regional), {
    customer: { assignments: { some: { userId: 'sale-north', endedAt: null } } },
  });
  assert.equal(JSON.stringify(orderPredicate(regional)).includes('closedBy'), false);
});
test('Không có quyền thì truy vấn trả về tập rỗng', () => {
  assert.deepEqual(customerPredicate({ ...regional, grants: [] }), { id: { in: [] } });
  assert.deepEqual(orderPredicate({ ...regional, grants: [] }), { id: { in: [] } });
});
test('GLOBAL mở phạm vi theo đúng permission, không mở các quyền khác', () => {
  assert.deepEqual(
    customerPredicate({
      ...regional,
      grants: [{ permission: 'sales.customers.read', scope: 'GLOBAL' }],
    }),
    {},
  );
  assert.equal(hasPermission(regional.grants, 'core.users.manage', 'GLOBAL'), false);
  assert.equal(hasPermission(regional.grants, 'sales.customers.read', 'GLOBAL'), false);
  assert.equal(hasPermission(regional.grants, 'sales.customers.read', 'ASSIGNED'), true);
});
