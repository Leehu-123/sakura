# Kết nối và thử tin Messenger — 21/09/2026

## Kết quả điều tra

- Người dùng xác nhận gửi bằng Facebook không có vai trò trong ứng dụng Meta đang ở chế độ Phát triển.
- Meta API xác nhận app 660010340430881 đang đăng ký object page, sự kiện messages, callback HTTPS chính xác và active. Page 745831148604981 cũng đăng ký messages với đúng ứng dụng.
- Token đúng Page, đủ các quyền đã kiểm tra; Sakura bật nhận/gửi và giữ webhook verified.
- Tại thời điểm điều tra, database chưa có hội thoại và Nginx chưa ghi nhận POST webhook từ Meta. Chỉ có hai lần tự kiểm tra lúc triển khai ban đầu. Chưa có bằng chứng nhận/gửi tin Facebook thật.
- Yêu cầu dùng tài khoản có vai trò admin/developer/tester trong app Meta để thử, hoặc hoàn tất quyền xét duyệt và chế độ công khai trước khi thử với khách ngoài vai trò. Quyền quản trị Fanpage không thay cho vai trò trong app.

## Cải thiện

- Một nút Kết nối nhận tin: kiểm tra token, đăng ký messages, bật nhận tin. Dừng khi bước trước lỗi, kiểm tra version giữa các bước; không tự bật gửi hoặc thay các Page khác.
- Phân biệt lỗi token hết hạn, token của Page khác, thiếu quyền đọc Page, thiếu quyền đăng ký và Meta không phản hồi. Không trả nguyên văn lỗi Meta/token về trình duyệt.
- Trình tự trên giao diện: chọn Page bằng Facebook, kết nối nhận tin, thử nhận tin. Đưa kiểm tra từng bước vào phần nâng cao; giữ nút sửa ngoài phần thu gọn.
- Diagnostics dành riêng cho quản trị: tổng inboundSeq và thời điểm lastInboundAt của các Page đã cấu hình; không trả nội dung tin hoặc thông tin khách.
- Thử nhận tin lấy số tin làm mốc khi bắt đầu, tự cập nhật mỗi 10 giây khi tab hoạt động, báo nhận được tin mới khi số lượng tăng. Tin cũ không được coi là lần thử mới.
- Hướng dẫn chế độ Phát triển, vai trò tester, link Messenger đúng Page và phân biệt cấu hình xong với nhận tin thật.

## Kiểm thử

- Build toàn bộ dự án thành công.
- Kiểm thử gateway và tích hợp connections đạt: quyền truy cập, version, dừng khi token/subscription lỗi, không tự bật gửi, bảo toàn dữ liệu, diagnostics đếm tin và chống trùng, không lộ nội dung.
- Kiểm tra giao diện qua trình duyệt với fixture localhost tách biệt, không gọi Meta: kết nối một nút, chờ tin, mô phỏng tin và tự hiển thị thành công. Đây không phải tin Facebook thật.

## Triển khai

- Release: 2026-09-21T04-28-39-738Z-82b121a8.
- SHA256 archive: f8fa95014eae989292c60ad01faff04341e1a4fd3fd639535ad58bbe669433d3.
- Không có migration mới, không đổi token, Page ID hoặc webhook trên VPS.
- Phiên SSH đầu bị ngắt trước khi chuyển release; bản cũ vẫn hoạt động. Chạy lại update bằng systemd unit riêng `sakura-update-20260921-0430` để không phụ thuộc SSH. Unit hoàn tất thành công, chuyển release lúc 15:23:31 giờ VPS ngày 21/09; 10 migration không có thay đổi chờ áp dụng.
- Xác nhận HTTPS health ok, bundle index-sFd2jkam.js, backup success; diagnostics yêu cầu đăng nhập (401 nếu chưa đăng nhập). Cấu hình vẫn version 22, nhận/gửi bật, webhook verified; số tin nhận thực tế vẫn 0 ở lần kiểm tra cuối.
- Tomeco vẫn PID 1740254, cùng thời điểm khởi động; hash trang chủ và hai file Nginx của app cũ giữ nguyên. Không khởi động lại Tomeco hoặc Nginx.
