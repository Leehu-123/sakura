# Ranh giới module Sale

SalesModule dùng DatabaseModule/AuthModule, tách khỏi CoreModule và CatalogModule.

- Khách, phân công, ghi chú: lưu trong Customer, CustomerAssignment, CareActivity.
- Khách mới tự giao cho người tạo. Handoff có transaction Serializable, version và partial unique index một người chăm sóc đang hiệu lực.
- Danh sách/chi tiết/mutation khách và đơn dùng cùng các predicate trong auth/policy.ts, theo permission riêng cho từng thao tác.
- Order.closedByUserId được ghi khi chuyển DRAFT sang CONFIRMED. Không có đường cập nhật lại người chốt; FK của người chốt RESTRICT khi xóa.
- Đơn giữ bản sao tên/giá/đơn vị/SKU từng dòng và thông tin giao hàng tại lúc tạo. Decimal VND không có phần lẻ. API nhận tiền dưới dạng chuỗi số.
- requestKey duy nhất cùng requestHash chống gửi lại tạo đơn trùng. Trước khi trả lại đơn đã tạo phải kiểm tra lại scope hiện tại.
- Tiền đã thu là lũy kế, không giảm trong bản này. Trạng thái thanh toán và vận chuyển riêng với trạng thái đơn.
- CatalogModule quản lý sản phẩm dùng chung; không phụ thuộc SalesModule.
- Import/webhook/báo cáo sau này phải tiếp tục dùng cùng scope, có idempotency và không kích hoạt side effect cho đơn lịch sử.
