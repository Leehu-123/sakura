# Đồng bộ PC / GitHub / VPS

Kho chính: https://github.com/Leehu-123/sakura — nhánh `main`.

Mỗi lần sửa dự án phải hoàn tất cả ba nơi trước khi báo hoàn thành. Đây là quy trình triển khai có kiểm tra, không phải tự động đưa mọi tệp vừa lưu trên PC lên máy chủ.

1. Fetch `origin`; xử lý thay đổi từ GitHub trước khi sửa. Không force-push.
2. Sửa tại PC, kiểm thử phù hợp; các thay đổi chức năng phải qua kiểm thử tích hợp liên quan. Không đưa `.env`, khóa, dữ liệu công ty, ảnh khách, backup, `.local` hay `node_modules` lên Git.
3. Kiểm tra diff và bí mật, commit, `git push origin main`.
4. Chạy `npm run sync:package`. Công cụ chỉ nhận nhánh main sạch, có cùng commit với GitHub; chạy build/unit tests và đóng gói đúng nội dung `git archive` của commit đó cùng các bản build. Kết quả ở `.local/vps-update.json`.
5. Đọc hướng dẫn VPS, kiểm tra trạng thái thực tế và dung lượng. Upload archive qua SSH/SCP đã xác thực, kiểm tra SHA-256, giải nén thành release riêng. Không cài GitHub credential lên VPS.
6. Trước cập nhật và sau cập nhật, chạy trên VPS:

   ```sh
   /opt/sakura/node/bin/node /srv/sakura/releases/RELEASE/scripts/ops/source-sync.cjs verify /srv/sakura/releases/RELEASE COMMIT_SHA
   ```

7. Chạy `/srv/sakura/bin/update.sh RELEASE` trong tiến trình giới hạn tài nguyên theo hướng dẫn VPS. Script sao lưu trước migration và chỉ khởi động lại Sakura. Không dùng Docker Compose production trên VPS dùng chung.
8. Kiểm tra HTTPS health, luồng vừa sửa, dịch vụ/băm nội dung Tomeco. Chạy lại bước xác minh với `/srv/sakura/current` và cùng `COMMIT_SHA`, sau đó `npm run sync:check` trên PC. HEAD PC, GitHub main và `SOURCE-REVISION.json` của current phải cùng SHA; mọi tệp trong manifest phải khớp.

`sync:check` chỉ xác minh PC/GitHub, ghi rõ còn phải xác minh VPS. Manifest ghi hash SHA-256 của toàn bộ source và dist đã đóng gói, không chứa bí mật. Không commit manifest vì nó tham chiếu commit đang phát hành; nó được tạo trong release sau khi commit.

Nếu một bước thất bại, không báo đã đồng bộ. Giữ bản production đang hoạt động nếu chưa tới bước chuyển release; sửa lỗi và triển khai lại. Database ở PC/VPS độc lập, không được chép đè để đồng bộ code. Không chạy lệnh gửi tin, thu tiền hoặc hủy đơn thật để thử triển khai.

Lịch sử kiểm tra từng lần được lưu trong `.local` và nhật ký triển khai VPS; tránh sửa thêm tài liệu có quản lý bằng Git sau khi đã phát hành mà không commit/phát hành lại.
