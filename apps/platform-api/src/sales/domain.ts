import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@sakura/database';
export function normalizePhone(input: string) {
  let value = input.trim().replace(/[\s().-]/g, '');
  if (value.startsWith('+84')) value = '0' + value.slice(3);
  else if (value.startsWith('0084')) value = '0' + value.slice(4);
  else if (value.startsWith('84')) value = '0' + value.slice(2);
  if (!/^0[235789]\d{8,9}$/.test(value))
    throw new BadRequestException('Số điện thoại Việt Nam chưa hợp lệ.');
  return value;
}
export function orderTotals(
  lines: { price: Prisma.Decimal; quantity: number }[],
  discount: string,
  shippingFee: string,
) {
  const subtotal = lines.reduce(
    (total, line) => total.plus(line.price.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  const reduction = new Prisma.Decimal(discount),
    shipping = new Prisma.Decimal(shippingFee);
  if (reduction.gt(subtotal))
    throw new BadRequestException('Giảm giá không được vượt quá tiền hàng.');
  const total = subtotal.minus(reduction).plus(shipping);
  if (total.gt('999999999999999'))
    throw new BadRequestException('Giá trị đơn vượt quá giới hạn hỗ trợ.');
  return { subtotal, discount: reduction, shippingFee: shipping, total };
}
export function checkTransition(
  from: OrderStatus,
  to: OrderStatus,
  paid: Prisma.Decimal,
  reason: string,
) {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    DRAFT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (!allowed[from].includes(to))
    throw new BadRequestException('Không thể chuyển sang trạng thái này.');
  if (to === 'CANCELLED' && paid.gt(0))
    throw new BadRequestException(
      'Đơn đã nhận tiền cần xử lý hoàn tiền trước; chức năng hoàn tiền chưa được bật.',
    );
  if (to === 'CANCELLED' && reason.trim().length < 3)
    throw new BadRequestException('Vui lòng ghi rõ lý do hủy đơn.');
}
