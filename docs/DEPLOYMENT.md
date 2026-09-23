# Chạy thử trên VPS riêng

**Cập nhật 13/09/2026:** có bộ production độc lập dùng Caddy và giao diện bản dựng tại máy. Dùng [hướng dẫn hiện tại](LOCAL-DEPLOYMENT.md) cho bộ này. Nội dung Nginx/compose.yaml bên dưới mô tả cấu hình thử nghiệm cũ, không ghép với compose.production.yaml.

Bộ Docker hiện gồm PostgreSQL, Redis, migration job, API, worker và Nginx phục vụ React. Chưa có máy chủ/tên miền cụ thể và chưa có kết nối Meta/VNPost.

## Lần đầu

1. Cài Docker Engine và Compose trên Linux VPS. Dùng tài khoản triển khai riêng.
2. Sao chép source có package-lock.json; tạo .env bằng npm run setup:env hoặc tự điền đầy đủ theo .env.example với mật khẩu và JWT_SECRET ngẫu nhiên.
3. Cấu hình NODE_ENV=production, COOKIE_SECURE=true, PUBLIC_WEB_ORIGIN=https://ten-mien-cua-ban. WEB_ORIGIN cũng nên đặt cùng origin để các thao tác chạy ngoài Compose nhất quán.
4. Thiết lập HTTPS ở reverse proxy trên host; chuyển tiếp vào 127.0.0.1:8080. Không mở PostgreSQL/Redis ra Internet.
5. Cấu hình chuỗi IP proxy theo môi trường thật. Compose đặt API trust 1 hop (Nginx web); Nginx web hiện ghi đè X-Forwarded-For bằng remote_addr. Nếu có thêm TLS proxy phía trước, phải cấu hình real_ip với đúng IP nguồn tin cậy trên Nginx web, để giới hạn đăng nhập không gộp tất cả người dùng thành IP của TLS proxy. Không bật trust proxy toàn bộ.
6. Chạy docker compose build, docker compose run --rm seed, docker compose up -d.
7. Kiểm tra health, đăng nhập, đổi mật khẩu Admin, tạo tài khoản Sale tổng/Sale vùng và kiểm tra quyền bằng từng tài khoản.

Cổng web đang bind 127.0.0.1. Không đổi thành public HTTP trong production. API từ chối khởi động production khi origin chưa là HTTPS hoặc cookie chưa secure.

## Công cụ đã bổ sung trên máy phát triển

Đã có bản sao database + ảnh và thử phục hồi thành công trên PostgreSQL cục bộ. Xem [sao lưu và theo dõi dung lượng](BACKUP-AND-STORAGE.md). Các công cụ hiện chưa tự chạy theo lịch hoặc sao chép ngoài máy; bản sao trên máy phát triển không tự xuất hiện trên VPS.

## Mỗi lần cập nhật

- Backup database trước migration; dùng pg_dump dạng custom và lưu một bản mã hóa ngoài VPS.
- Build image, chạy migration, khởi động lại API/web/worker.
- Kiểm tra /api/v1/health, đăng nhập và nhật ký.
- Không chạy migrate reset, db push hoặc docker compose down -v với dữ liệu thật.
- Migration được đánh số trong source. Nếu đổi schema: tạo migration mới, duyệt SQL và kiểm thử với bản sao dữ liệu. Không chỉnh migration đã áp dụng.
- Thử khôi phục backup vào database riêng trước khi đưa dữ liệu Sapo thật vào.
- Có giám sát dung lượng, tình trạng dịch vụ và cảnh báo backup lỗi. Các việc này chưa được cấu hình tự động trong Giai đoạn 0.

## Giới hạn đã biết

- Docker Compose/Nginx/Redis worker chưa được chạy kiểm chứng trên máy Windows hiện tại do chưa có Docker. Bản dựng TypeScript và luồng Core API được kiểm tra riêng với PostgreSQL 17 cục bộ.
- Image API/worker hiện dùng lại build stage để giữ công cụ migration/seed cho bản thử; còn dev dependencies, chưa tối ưu kích thước image.
- Swagger hiện có thể truy cập công khai; không chứa dữ liệu tài khoản hay khóa. Có thể hạn chế /api/docs* qua reverse proxy của công ty nếu cần.
- Chưa có dịch vụ gửi email reset, MFA, sao lưu tự động hoặc hệ thống metrics tập trung.
- Không có credential Facebook/VNPost trong source; chưa gửi/nhận dữ liệu từ các hệ thống bên ngoài.
