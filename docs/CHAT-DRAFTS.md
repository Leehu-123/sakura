# Bản nháp và khôi phục lần gửi

Trong Hộp thư Messenger, Sakura giữ nội dung đang soạn và ảnh đang chọn khi đổi khách, đổi menu hoặc tải lại trang trong cùng tab. Danh sách hội thoại hiện **Bản nháp** để tìm lại khách đang soạn dở. Có nút **Xóa bản nháp** trong ô soạn.

Bản nháp gắn với tài khoản Sakura đang đăng nhập, được lưu trong bộ nhớ của tab và `sessionStorage`. Khi mở lại app trong tab, chỉ khôi phục bản nháp cập nhật trong 24 giờ. Giữ khoảng 100 hội thoại gần nhất; tại giới hạn sẽ bỏ bản nháp thường cũ nhất, giữ các lần gửi đang chờ kiểm tra. Không lưu tệp ảnh vào trình duyệt, chỉ lưu mã và tên ảnh. Ảnh đã ngừng hoạt động vẫn bị máy chủ từ chối khi gửi.

Đăng xuất thành công, đổi mật khẩu hoặc nhận thông báo hết phiên sẽ xóa bản nháp. Chuyển sang tài khoản khác cũng bỏ bản nháp tài khoản trước. Không đồng bộ giữa thiết bị/tab; đóng tab có thể mất bản nháp. Nếu trình duyệt không cho lưu, app báo rõ chỉ giữ trong bộ nhớ khi đang mở. Đây không phải bản sao lưu dữ liệu.

## Khi gửi tin hoặc ảnh

- Gửi thành công: bỏ phần vừa gửi. Gửi ảnh riêng vẫn giữ nguyên phần chữ chưa gửi.
- Gửi thất bại đã xác định: giữ nội dung/ảnh để sửa hoặc bấm gửi lại. Mỗi lần gửi mới có mã yêu cầu mới.
- Mất phản hồi hoặc chờ quá 30 giây: giữ nguyên mã yêu cầu và nội dung; khóa sửa/xóa cho đến khi kiểm tra được kết quả. App chỉ tự **tra cứu**, không tự gửi lại.
- Máy chủ chưa ghi nhận: có nút **Thử lại lần gửi này**, dùng cùng mã/nội dung để tránh tạo hai lần gửi khi phản hồi trước về muộn. Vẫn phải có quyền gửi và nhận việc đúng ca.
- Máy chủ đang gửi hoặc chưa rõ kết quả: tiếp tục kiểm tra. Với kết quả chưa rõ, quản lý dùng **Đối chiếu kết quả** dưới tin nhắn sau khi kiểm tra trên Fanpage. Sau khi xác định đã gửi, app bỏ phần đã gửi; xác định thất bại thì mở lại bản nháp.

Phản hồi cũ không được tạo lại bản nháp sau đăng xuất hoặc ghi đè nội dung đã sửa. Việc tra cứu chỉ thực hiện khi mở hội thoại, tab hiển thị và có mạng, theo cơ chế tự cập nhật hiện có.

## Phần máy chủ

`GET /api/v1/messenger/conversations/:id/requests/:requestKey` kiểm tra quyền đọc hội thoại hiện tại và chỉ trả trạng thái lần gửi của chính nhân viên đang đăng nhập. Trả mã yêu cầu cùng trạng thái, không trả nội dung, khách hàng hoặc khóa kết nối. Không có tác dụng gửi tin/ghi dữ liệu. `SENDING` quá 30 giây được hiển thị là `UNKNOWN`, giống chi tiết hội thoại. Không cần thay đổi schema.

Đã kiểm thử bằng dữ liệu và bộ gửi Meta giả tại máy. Chưa kiểm chứng mất mạng/kết quả gửi với Fanpage thật.
