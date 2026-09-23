# Thêm Fanpage ngay trong Sakura

Ngày cập nhật: 13/09/2026. Mở **Hộp thư Messenger → Cấu hình → Kết nối Fanpage**, bằng tài khoản Admin có quyền `core.messenger.manage` toàn công ty. Nhân viên Sale không được xem/sửa cấu hình kết nối.

## Chuẩn bị ứng dụng Meta một lần

1. Mở **Thiết lập Meta cho quản trị hệ thống (một lần)**, trong mục **Ứng dụng Meta dùng chung**, nhập App ID, phiên bản Graph API đang dùng, App Secret và Callback URL dạng `https://TEN-MIEN/api/v1/messenger/webhook`.
2. Bấm **Tạo mã xác minh**, rồi **Sao chép mã mới** trước khi lưu. Điền cùng mã vào Verify Token trên Meta. Khóa đã lưu không được hiển thị lại; để trống ô khóa khi sửa để giữ nguyên.
3. Bật **Tiếp nhận webhook**, bấm **Lưu cấu hình Meta**. Có thể lưu bản cấu hình chưa đầy đủ khi công tắc nhận vẫn tắt.
4. Trên Meta, khai báo Callback URL/mã xác minh và xác minh webhook; chọn sự kiện `messages`. Quay lại Sakura, bấm **Tải lại trạng thái** để xem thời điểm nhận yêu cầu xác minh hợp lệ.

Máy đang chạy tại localhost chưa có địa chỉ HTTPS công khai để Meta gọi vào. Có thể chuẩn bị và lưu cấu hình trước; kết nối thật cần hoàn thiện địa chỉ này, tài khoản/quyền và thiết lập ứng dụng trên Meta. Đã có luồng đăng nhập Facebook để chọn Page và tự lấy token phía máy chủ. Xem [hướng dẫn đăng nhập Facebook](FACEBOOK-LOGIN.md). Chưa kết nối Meta thật.

## Thêm và bật từng Fanpage

1. Dùng **Kết nối bằng Facebook** và chọn Page theo hướng dẫn trên. Hoặc bấm **Thêm bằng mã kết nối**, nhập tên, Page ID và Page Access Token của đúng Fanpage, được cấp qua cùng ứng dụng Meta phía trên. Fanpage mới được lưu ở trạng thái tắt.
2. Bấm **Kiểm tra token**. Sakura gọi Meta kiểm tra token có trả về đúng Page ID và tên hay không. Kết quả này chưa xác minh token thuộc App ID đã khai báo hoặc có đủ mọi quyền gửi tin.
3. Sau khi webhook đã được xác minh, bấm **Đăng ký nhận tin** để yêu cầu Meta đăng ký sự kiện `messages` cho ứng dụng cấp token. Nếu thất bại, kiểm tra quyền và thiết lập trên Meta rồi thử lại.
4. Bấm **Sửa / bật tắt**, bật **Nhận tin của Fanpage này**, lưu lại.
5. Khi sẵn sàng thử gửi bằng tài khoản được phép: bật **Cho phép gửi tin từ Sakura** trong cấu hình chung, lưu; sau đó bật **Cho phép nhân viên gửi tin** trong từng Fanpage và lưu.

Nút kiểm tra/đăng ký không gửi tin nhắn cho khách. Đăng ký thành công chưa chứng minh luồng nhận/gửi thực tế hoạt động; cần kiểm thử bằng tài khoản được phép trước khi phục vụ khách. Không tự tải tin nhắn lịch sử.

Tối đa 50 Fanpage dùng chung một ứng dụng Meta. Fanpage đang bật xuất hiện trong bộ chọn trên hộp thư. Tắt Page dừng xử lý trong Sakura, giữ hội thoại cũ; không xóa Fanpage hoặc hủy đăng ký trên Meta. Page ID đã lưu không đổi; Page khác cần thêm mục mới.

## Cập nhật và khắc phục

- Thay Page Access Token: lưu ở trạng thái tắt, kiểm tra và đăng ký lại trước khi bật. Token để trống khi sửa nghĩa là giữ nguyên.
- Đổi App ID, App Secret, Verify Token, Callback URL hoặc phiên bản API: trạng thái xác minh/đăng ký bị xóa và gửi tin bị tắt; xác minh lại cấu hình mới.
- Báo cấu hình đã thay đổi: một người khác hoặc yêu cầu xác minh webhook vừa cập nhật phiên bản. Bấm **Tải lại trạng thái** rồi thực hiện lại; dữ liệu đang nhập chưa lưu có thể mất khi tải lại.
- Không thấy mục kết nối: kiểm tra quyền Admin. Thông báo thiếu khóa bảo vệ: quản trị hệ thống cần thiết lập khóa máy chủ bên dưới.

## Lưu trữ và chuyển máy

App Secret, Verify Token và Page Access Token được mã hóa AES-256-GCM trong database; API quản trị chỉ trả trạng thái đã lưu. Giá trị khóa không đưa vào nhật ký thao tác hoặc bộ nhớ lưu lâu dài của trình duyệt. Biểu mẫu chỉ giữ giá trị mới trong lúc nhập để gửi đến máy chủ.

Máy hiện tại đã có `MESSENGER_CONFIG_KEY`. Với cài mới, chạy `npm run setup:fanpage-key` một lần trong thư mục dự án rồi khởi động lại API. Công cụ giữ nguyên khóa hợp lệ đã có. Không đổi/xóa khóa khi database đã có cấu hình mã hóa.

Backup database chứa cấu hình đã mã hóa nhưng **không chứa khóa giải mã**. Giữ `MESSENGER_CONFIG_KEY` qua kênh riêng được công ty kiểm soát và khôi phục đúng khóa khi chuyển máy. Bộ `deploy:prepare` sinh khóa mới dành cho cài mới; khi phục hồi database cũ phải thay khóa sinh mới bằng khóa gốc trước khi mở API. Khóa này độc lập với JWT và khóa mã hóa bản sao lưu Drive/R2.

Lần lưu đầu trong giao diện tiếp nhận cấu hình môi trường cũ nếu có. Sau đó database là nguồn cấu hình cho nhận/gửi và danh sách Fanpage; sửa các biến môi trường Meta cũ không ghi đè cấu hình trong app. Thay đổi qua giao diện có hiệu lực mà không cần khởi động lại API.
