# Thanh ngày, nhãn và công cụ chat — 23/09/2026

Đã triển khai lên https://sakura.ldhuy.name.vn lúc 11:01 giờ Việt Nam.
Release: `2026-09-23T03-54-01-461Z-f343acbd`.

## Sử dụng

- Thanh trên ô nhập gồm ngày chăm sóc và nhãn hội thoại. Bấm lại ngày/nhãn đã chọn để bỏ chọn; biểu tượng lịch cho phép chọn ngày khác.
- Quản trị viên dùng nút tùy chỉnh thanh ngày & nhãn để đổi số ngày gần đây (1–14), tên/màu nhãn và thêm/bớt nhãn (tối đa 20 mẫu). Cấu hình dùng chung cả đội. Đổi tên mẫu không đổi các nhãn đã gắn trước đó; mỗi hội thoại tối đa 10 nhãn.
- Biểu tượng cảm xúc và câu trả lời mẫu chèn tại vị trí con trỏ. Câu trả lời mẫu có tìm kiếm; quản trị viên có thể thêm/sửa trong bảng này.
- Nhãn dán Sakura là ảnh được tạo từ bộ mẫu Sakura, không phải toàn bộ kho sticker của Facebook. Chọn để xem trước rồi bấm gửi.
- Nút đính kèm chọn một tệp từ máy, tối đa 10 MiB: PNG/JPEG/WebP/GIF, PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP. Thư viện ảnh sản phẩm vẫn được giữ.
- Ảnh/tệp gửi thành tin riêng, giữ lại văn bản đang soạn. Enter gửi tin; Shift+Enter xuống dòng; không gửi khi đang gõ dấu bằng bộ gõ hoặc đang tải tệp.

## Lưu trữ và quyền truy cập

Migration cộng thêm `202609220001_chat_toolbar_attachments`: ngày trên hội thoại, cấu hình thanh nhãn dùng chung, thông tin tệp đính kèm và liên kết tới tin nhắn. Không thay thế dữ liệu công ty.

Tệp nằm trong kho media ngoài release, dùng mã băm nội dung. Tải/xem tệp yêu cầu đăng nhập và quyền truy cập hội thoại; tệp chưa gửi chỉ người tải lên được xem/gửi. Giữ kiểm tra phân công, ca làm việc, khóa hội thoại, thời hạn gửi và chống gửi trùng hiện có. Sao lưu/khôi phục đã bổ sung danh mục tệp chat, tương thích database cũ chưa có bảng tệp.

## Kiểm thử

- Build database, API, worker và web đạt.
- 34 kiểm thử đơn vị API và 19 kiểm thử đơn vị web đạt.
- Bộ tích hợp Messenger: 31 trường hợp con và suite cha đạt (32 mục do trình chạy báo cáo), gồm quyền sửa nhãn, xung đột phiên bản, ngày sai, phạm vi/ownership tệp, giới hạn kích thước, gửi trùng và lịch sử tin.
- Sao lưu/khôi phục trên database thử riêng đạt, gồm ảnh và tệp chat dùng chung kho nội dung.
- Trình duyệt với dữ liệu và API giả lập: gắn ngày/nhãn, sửa cấu hình, chèn emoji/mẫu trả lời, xem trước/gửi sticker, chọn/gửi tệp máy và giữ bản nháp; khung điện thoại 390 × 780 không tràn ngang.
- Các phép thử gửi dùng transport giả lập, không gửi tin cho khách thật. Cần người dùng thử ảnh/tệp với Fanpage để xác nhận hành vi cuối cùng của Meta.

## Kiểm tra triển khai

- Sao lưu trước migration thành công lúc 11:01:34; migration thành công; Sakura API và PostgreSQL hoạt động; HTTPS health trả `ok`.
- Trang chính phục vụ `index-CCml32VE.js` và `index-DjUji8J7.css`; hash qua HTTPS khớp bản build tại máy.
- Chỉ thêm location upload hội thoại của Sakura với giới hạn Nginx 11 MiB để chứa multipart cho tệp tối đa 10 MiB. Cấu hình toàn Nginx hợp lệ trước graceful reload. Yêu cầu upload thử 2 MiB chưa đăng nhập tới được API và trả 401, không bị giới hạn 1 MiB cũ và không lưu tệp.
- API cấu hình thanh nhãn khi chưa đăng nhập trả 401.
- Tomeco giữ PID 1805366, thời điểm bắt đầu và hash nội dung trang chủ. Hash Nginx global/default không đổi.
- Bổ sung `chmod -R go-w` sau bước chown root trong update.sh; file ứng dụng đang chạy là root:root, 644. Bản script/vhost trước sửa nằm riêng trong `/srv/sakura/shared`.
- Đã bỏ node_modules có thể cài lại của release cũ `2026-09-21T04-28-39-738Z-82b121a8` sau khi xác minh không phải current/previous. Không xóa database, media hoặc bản sao lưu. Đĩa còn khoảng 1,4 GB sau cập nhật; Drive/R2 vẫn chưa được kết nối trong bước này.

Release trước được giữ trong `/srv/sakura/previous`; khóa cấu hình Meta, token và dữ liệu sản xuất không bị thay bằng dữ liệu tại máy.
