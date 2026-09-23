# Sử dụng phần khách hàng và đơn hàng

## Bắt đầu

1. Admin tạo tài khoản Sale tổng và Sale vùng; mỗi nhân viên đổi mật khẩu khi đăng nhập lần đầu.
2. Admin/Sale tổng vào **Sản phẩm**, tạo tên sản phẩm và các biến thể (mã hàng, đơn vị, giá bán). Sale vùng chỉ xem bảng giá.
3. Vào **Khách hàng**, thêm tên, số điện thoại và địa chỉ. Khách mới tự giao cho người tạo.
4. Mở hồ sơ khách để sửa thông tin, phân loại hoặc thêm ghi chú chăm sóc.
5. Sale tổng/Admin chọn **Bàn giao khách**, chọn người nhận và ghi lý do. Người nhận phải đang hoạt động và có quyền xem/chăm sóc khách.

Khu vực chỉ để phân loại. Hai Sale cùng Miền Bắc vẫn không xem được khách của nhau nếu chưa được giao. Sau bàn giao, Sale cũ mất quyền đọc/ghi khách và các đơn của khách; ghi chú và người chốt lịch sử được giữ nguyên.

## Lập và xử lý đơn

- Mở hồ sơ khách có địa chỉ → **Lập đơn** → tìm mã/tên hàng → chọn biến thể, số lượng, giảm giá toàn đơn và phí giao hàng → **Tạo đơn nháp**.
- Giá được lấy và kiểm tra từ bảng giá ở máy chủ. Nếu giá vừa đổi, tải lại hồ sơ/biểu mẫu và kiểm tra bảng giá trước khi lập.
- **Chốt đơn** ghi nhận người đang thao tác là người chốt. Không được tự chọn một người chốt khác.
- **Ghi nhận tiền đã thu** nhập tổng tiền lũy kế đã nhận cho đơn, kèm ghi chú. Ví dụ đã thu 100.000, nhận thêm 50.000 thì nhập 150.000.
- Không được thu vượt tổng đơn hoặc giảm số tiền đã ghi nhận trong bản hiện tại. Chức năng hoàn/điều chỉnh tiền chưa được bật.
- **Đánh dấu hoàn tất** ghi nhận việc xử lý đơn đã hoàn tất; trạng thái thanh toán vẫn độc lập.
- Hủy cần lý do và chưa nhận tiền. Đơn đã hoàn tất/hủy không được mở lại.
- Thay đổi giá, tên sản phẩm, địa chỉ khách hoặc người chăm sóc không thay đổi thông tin đã lưu trên đơn.

Đơn hiện chưa tạo vận đơn hoặc gửi tin nhắn. Hiển thị **Chưa tạo vận đơn** có chủ đích; chưa bật VNPost.

## Giới hạn của bước này

- Một số điện thoại và một địa chỉ chính cho mỗi khách. Số 0… và +84… được chuẩn hóa để tìm trùng; số điện thoại không phải khóa chính.
- Ghi chú, phân công và lịch sử đơn hiển thị tối đa 100 mục gần nhất; dữ liệu cũ vẫn được giữ trong database.
- Dòng hàng và địa chỉ của đơn không sửa sau khi tạo. Nếu sai ở đơn nháp, hủy và lập lại. Chưa có chỉnh sửa đơn đã chốt/hoàn tiền/đổi trả.
- Các biến thể được nhập lúc tạo sản phẩm; hiện chỉnh giá và trạng thái từng biến thể, chưa thêm biến thể cho sản phẩm đã tạo.
- Chưa quản lý tồn kho, thuế/hóa đơn, tự phân loại khách từ chat hoặc tự đổi trạng thái khách khi chốt.
- Khi hai người sửa/bàn giao đồng thời, thao tác dùng phiên bản cũ bị từ chối. Tải lại để xem dữ liệu hiện tại.
- Mỗi biểu mẫu lập đơn có khóa chống gửi trùng. Gửi lại cùng yêu cầu được trả về đơn đã tạo; mở biểu mẫu mới là một yêu cầu mới.

## Cập nhật từ Giai đoạn 0

Dừng API đang chạy trước khi generate Prisma trên Windows, sau đó:

```powershell
npm ci
npm run db:generate
npm run build
npm run db:migrate
npm run db:seed
```

Migration chỉ thêm bảng/ràng buộc, không xóa dữ liệu Core. Seed bổ sung quyền bảng giá cho vai trò mặc định; không đổi mật khẩu tài khoản đã tồn tại. Khởi động lại API, tải lại trang để lấy quyền mới.

Dữ liệu dùng kiểm thử nằm trong schema riêng và đã được dọn. Không tự tạo sản phẩm, khách hoặc đơn giả vào dữ liệu làm việc.
