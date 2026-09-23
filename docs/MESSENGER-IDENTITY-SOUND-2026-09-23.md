# Tên/ảnh Facebook, nhãn và âm báo — 23/09/2026

## Thay đổi

Trước đây hội thoại chỉ hiển thị tên hồ sơ khách nội bộ hoặc phần cuối PSID và chữ cái làm avatar. Bổ sung đọc `first_name,last_name,profile_pic` từ User Profile API bằng token đúng Fanpage; ưu tiên tên Facebook trong danh sách/đầu chat, giữ nguyên hồ sơ khách nội bộ.

Đồng bộ nền tối đa hai hồ sơ cùng lúc khi mở danh sách/chi tiết; không chặn webhook hoặc phần đọc tin nhắn. Kết quả đầy đủ làm mới sau bảy ngày; kết quả chưa đầy đủ/lỗi có thời gian chờ một giờ. Meta không trả hồ sơ vẫn chat bình thường, không xóa tên/ảnh đã biết. Trạng thái chưa lấy được tên được giải thích ngay trong đầu hội thoại.

Ảnh được lấy qua HTTPS từ host Meta được cho phép; mỗi lần chuyển hướng đều kiểm tra lại, không gửi token tới CDN. Giới hạn dung lượng tải và thời gian chờ. Ảnh được lưu theo mã băm trong media ngoài release, API tải ảnh yêu cầu quyền xem hội thoại. Đã bổ sung avatar vào danh mục sao lưu/khôi phục; không dùng URL ảnh có thời hạn trực tiếp trên trình duyệt.

Nhãn có màu xuất hiện dưới tên khách trong danh sách và đầu khung chat. Dùng cùng cấu hình nhãn hiện có, bỏ dòng nhãn lặp trong đầu chat.

Nút âm báo trên menu Chat lưu lựa chọn theo tài khoản/trình duyệt. Trình duyệt cần một thao tác người dùng để kích hoạt âm thanh. Chime phát khi API phát hiện tin INBOUND mới trong hội thoại được phân quyền, không phụ thuộc bộ lọc danh sách. Không báo cho lịch sử ban đầu, tin đi hoặc lần polling lặp; giữ mốc thời gian khi phạm vi hội thoại thay đổi. Web Locks và localStorage hạn chế phát trùng giữa các tab. Tắt âm dừng polling âm báo.

Sakura phải còn mở; timer/âm thanh chạy nền có thể bị trình duyệt hoặc hệ điều hành trì hoãn. Đây chưa phải push notification khi đóng tab.

## Kiểm thử tại máy

- Build toàn bộ đạt; 37 kiểm thử đơn vị API và 21 kiểm thử đơn vị web đạt.
- Bộ tích hợp Messenger: 32 trường hợp con và suite cha đạt (33 mục trình chạy), có kiểm tra đọc/tìm tên Facebook, quyền xem ảnh, chỉ báo tin đến trong phạm vi được xem, không báo tin đi.
- Sao lưu/khôi phục trên database thử riêng đạt với ba tệp: ảnh sản phẩm, tệp chat, avatar.
- Giao diện giả lập: bảy ảnh đại diện tải thành công; nhãn ở tên khách; tin mới tạo đúng một chime hai nốt, polling lặp và tắt âm không tạo thêm nốt. Bố cục rộng 390 px không tràn ngang.
- Không gửi tin tới khách hàng trong các phép thử.

## Triển khai

Release đang chạy: `2026-09-23T04-22-03-046Z-2eaa062d`.
Migration cộng thêm: `202609230001_messenger_profiles` (các trường hồ sơ/ảnh và index tin nhắn theo thời điểm nhận vào database).
Không đổi Nginx hoặc cấu hình Meta. Quy trình update hoàn tất, API/DB active, HTTPS health trả `ok`.

Sao lưu trước migration thành công lúc 11:26:20; release hoạt động lúc 11:26:31. JS `index-IkGzxx2J.js` và CSS `index-aRzXWvwA.css` qua HTTPS khớp hash bản build tại máy. API avatar và âm báo không đăng nhập trả 401; mã nguồn root:root 644. Tomeco giữ PID 1805366, thời điểm chạy, hash trang chủ và hash Nginx global/default trước/sau giống nhau.

Kiểm tra trực tiếp kết nối Fanpage trên VPS: 1/1 hội thoại hiện có đã lấy được tên và ảnh đại diện, trạng thái READY. Chỉ đọc User Profile API và lưu cache; không gửi tin nhắn, không thay token hoặc quyền Meta.

Đã bỏ riêng node_modules có thể cài lại của release `2026-09-21T08-42-23-606Z-037247c2`, sau khi kiểm tra không phải current/previous, để đủ chỗ cho bản cập nhật và sao lưu. Không xóa database, media hoặc backup công ty.
