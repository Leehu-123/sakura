# Kết nối Fanpage qua đăng nhập Facebook

## Trải nghiệm

Trong Hộp thư Messenger → Cấu hình, quản trị viên chọn Kết nối bằng Facebook, cấp quyền trên Facebook, chọn các Page và xác nhận kết nối. Sakura lấy và mã hóa token, kiểm tra quyền/đúng Page, đăng ký webhook messages và bật nhận/trả lời cho các Page đã chọn. Không gửi tin nhắn trong quá trình kết nối.

Thiết lập Meta chung, webhook HTTPS và Facebook Login for Business chỉ chuẩn bị một lần. Người thêm Page không phải tạo token hoặc thiết lập webhook thủ công. Meta App Review, quyền truy cập phù hợp và chế độ hoạt động vẫn do Meta quyết định; giao diện này không bỏ qua các điều kiện đó. Nhân viên trả lời dùng tài khoản Sakura và phân quyền hiện có.

## Bảo toàn trạng thái

- Các Page không chọn giữ nguyên trạng thái nhận/gửi thực tế, kể cả khi trước đó công tắc chung đang tắt.
- Kiểm tra lại phiên đăng nhập và phiên bản cấu hình trước khi lưu. Token chỉ lưu khi tất cả Page đã chọn vượt qua kiểm tra và đăng ký thành công.
- Đăng ký trên Meta là tác động bên ngoài: nếu một Page lỗi, một số Page trước đó có thể đã đăng ký trên Meta; cấu hình Sakura chưa thay đổi. Có thể đăng nhập và thử lại an toàn.
- API cũ bỏ qua connectNow vẫn giữ hành vi chỉ lưu token. Giao diện mới gửi connectNow=true và thông báo rõ việc bật nhận/trả lời trước khi xác nhận.

## Kiểm thử

Build toàn dự án đạt. 17 kiểm thử gateway/OAuth/connections đạt, gồm đăng ký tự động, lỗi đăng ký, điều kiện webhook, quyền truy cập, phiên hết hiệu lực, bảo toàn Page khác và lưu nguyên tử. Kiểm tra giao diện dùng API thực với schema riêng và Meta giả lập: đăng nhập, mở cửa sổ kết nối, chọn Page, xác nhận, hiển thị nhận/gửi đã bật; đã dừng fixture và dọn schema.

Chưa xác nhận đăng nhập Facebook và nhận/trả lời tin thật từ đầu đến cuối. Ứng dụng Meta đang ở chế độ Phát triển theo thông tin người dùng; cần tài khoản thử có vai trò hợp lệ trong app hoặc hoàn tất phát hành/quyền phù hợp.

## Bản phát hành

- Release: 2026-09-21T08-42-23-606Z-037247c2.
- SHA256 archive: 69e46cce22445de31f3b9ab9b40f4d5309ce569bccad845523fd59668884814b.
- Bundle: index-D9SngUPk.js.
- Không có migration mới; không sửa token, Page ID hoặc webhook hiện có khi triển khai.
- Cập nhật qua sakura-update-20260921-0842 hoàn tất thành công lúc 15:49:57 giờ VPS ngày 21/09/2026; backup theo quy trình update đạt, không có migration chờ.
- HTTPS health trả ok, bundle đúng bản mới, OAuth info trả ready=true và automaticReady=true. Cấu hình vẫn version 22, Page 745831148604981 giữ nhận/gửi bật.
- Tomeco vẫn PID 1740254 và cùng thời điểm khởi động; checksum trang chủ, nginx.conf và default virtual host khớp trước cập nhật. Không khởi động lại Tomeco hoặc Nginx.
