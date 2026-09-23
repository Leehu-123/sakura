# Giao diện hội thoại — 22/09/2026

Người dùng xác nhận Sakura đã nhận và trả lời được tin Facebook thật. Đợt này chỉ đổi giao diện web và thao tác bàn phím; không đổi cấu hình Meta, API hay schema database.

## Thay đổi

- Không gian chat sát mép màn hình: thanh điều hướng tối, chọn Fanpage, cột bộ lọc, danh sách hội thoại, khung tin và thông tin khách/đơn hàng.
- Thu gọn thanh điều hướng chính; phân biệt hội thoại bằng tên, avatar chữ cái, nhãn màu, người hỗ trợ và trạng thái bản nháp/chưa đọc.
- Tin khách và tin nhân viên có màu riêng; giữ ghi chú tên nhân viên dưới tin đã gửi.
- Khung soạn ở cuối hội thoại, truy cập ảnh sản phẩm và mẫu trả lời; quản lý mẫu và phân công/ca trực được thu gọn.
- Enter gửi, Shift + Enter xuống dòng. Không gửi từ phím xác nhận bộ gõ, phím giữ lặp, hội thoại chưa được phép gửi hoặc khi đang xử lý lần gửi trước.
- Màn hình nhỏ dùng nút quay lại danh sách và nút mở thông tin khách, không ép nhiều cột chật vào cùng màn hình.

## Kiểm tra tại máy

- Build toàn bộ database/API/worker/web thành công; 18 kiểm thử web đạt.
- Kiểm tra giao diện thực qua trình duyệt với Inbox thật và API giả tại 1440×900, 1280×720 và 390×780.
- Shift + Enter tạo xuống dòng và không phát yêu cầu gửi; Enter tạo đúng một yêu cầu, xóa bản nháp đã gửi và trả focus về ô nhập.
- Chuyển hội thoại rồi quay lại vẫn có bản nháp; Enter khi canSend=false không phát yêu cầu và giữ nội dung.
- Mở thông tin khách trên điện thoại thành công; không tràn ngang tại 390 px.
- Bảo vệ IME và phím giữ lặp được kiểm tra bằng unit test; chưa thử bộ gõ tiếng Việt thực trên máy người dùng.
- Dữ liệu kiểm thử giả, không gửi tin tới Meta hay khách hàng.

## Gói triển khai

- Release: `2026-09-22T11-15-38-988Z-77e58b46`.
- Archive SHA-256: `411ad124fabbdae25b631f7b04783699450ea10a16240347907b8be92fbcebc4`.
- Web bundle: `index-BGzB2BsL.js`, `index-BcGxSns1.css`.
- Đối chiếu API source và Prisma với release đang chạy trước cập nhật: không khác biệt.
- Dọn riêng `node_modules` có thể tạo lại của hai release cũ `2026-09-21T02-33-30-573Z-6f9ae07f` và `2026-09-21T03-38-15-581Z-c3b222fa`; giữ source, dữ liệu, ảnh, backup, current và previous. Dung lượng trống tăng từ 1,3 lên 2,2 GiB trước cài release mới.
- Cập nhật qua `/srv/sakura/bin/update.sh`, unit `sakura-update-20260922-ui`, giới hạn CPU/RAM như quy trình VPS.
- Trước cập nhật Tomeco PID `1774178`, khởi chạy `Tue Sep 22 00:00:03 2026`; HTTP và hash trang chủ/config khớp mốc triển khai ban đầu.

## Xác minh sau triển khai

- Hoàn tất lúc 18:21 ngày 22/09/2026 (UTC+7); update unit thành công, không có migration chờ.
- Backup trước cập nhật thành công. Sakura API và database active; HTTPS health trả `status: ok`.
- Trang công khai tải bundle mới; SHA-256 bundle qua HTTPS khớp tệp trong release: `fcf6668ecd0bc03421496d13a5a573e13f0e7a0550c3a19a779ae29c90594c56`.
- Tomeco vẫn PID `1774178` và thời điểm khởi chạy cũ; hash nội dung trang chủ và hai cấu hình Nginx không đổi. Không reload Nginx hay thay đổi PM2.
- Gỡ quyền ghi group/other trên release mới sau khi nhận thấy tar từ Windows mang mode 666. Mã thuộc root và tài khoản Sakura không được ghi.
- Đĩa còn khoảng 1,5 GiB sau cập nhật và backup.
- Không kiểm thử gửi tin khách thật sau triển khai; kiểm thử phím và bố cục dùng dữ liệu giả tại máy như mô tả trên.
