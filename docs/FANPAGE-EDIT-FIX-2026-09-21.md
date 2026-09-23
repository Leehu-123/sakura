# Sửa cập nhật Fanpage — 21/09/2026

## Thay đổi

- Form cập nhật trước đây khóa Page ID, API cũng từ chối mã khác với mã trong đường dẫn.
- Cho phép quản trị sửa Page ID nhập nhầm. Đổi mã cần token mới và không được trùng một Fanpage đã lưu. Token được mã hóa theo Page ID mới.
- Khi đổi kết nối, phải kiểm tra token và đăng ký nhận tin lại trước khi bật nhận/gửi. Việc sửa Fanpage không thay mã xác minh webhook chung.
- Không chuyển lịch sử hội thoại hoặc phân công của Page cũ sang Page mới. Để vận hành đồng thời hai Fanpage, thêm Fanpage riêng.
- Hộp thoại đóng khi lưu thành công để không giữ đối tượng Fanpage và Page ID cũ cho lần lưu tiếp theo.
- Token đã lưu vẫn được giữ khi chỉ sửa tên và để trống ô token.

## Kiểm tra tại máy

- Build database/API/worker/web đạt.
- Kiểm thử tích hợp connections.test.cjs đạt: phân quyền, mã hóa, xác minh webhook, kiểm tra token, đăng ký nhận tin, đổi Page ID, yêu cầu token mới, chặn mã trùng/phiên bản cũ, giữ lịch sử cũ và đổi tên không làm mất token.
- Kiểm thử chạy trong schema tạm trên database localhost, không gửi yêu cầu Meta thật.

## Bản triển khai

- Release: `2026-09-21T03-38-15-581Z-c3b222fa`.
- Source archive SHA256: `ea3af96598d2d2830ab2fee30884a2b03f140c6c6c53560cddfd3618c5640450`.
- Không kèm dữ liệu công ty hoặc cấu hình bí mật; không có migration mới.
- Cập nhật bằng `/srv/sakura/bin/update.sh`, bổ sung HOME trỏ kho cache Sakura cho bước chuẩn bị Prisma dưới tài khoản không có thư mục nhà.
- Đã chuyển release thành công; backup trả về success, 10 migration hiện có không có thay đổi chờ áp dụng, HTTPS health trả về ok và trang web phục vụ bundle mới `index-D_moehzj.js`.
- Sau triển khai, tiến trình Tomeco vẫn PID 1740254 với cùng thời điểm khởi động. Hash trang chủ Tomeco, nginx.conf và default virtual host khớp trước triển khai. Không reload Nginx hoặc khởi động lại app Tomeco.
