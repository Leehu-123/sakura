# Bản dựng tại máy và bộ triển khai riêng

Theo yêu cầu hiện tại, Sakura chạy tại máy trước; chưa kết nối VPS, Drive/R2 hoặc Meta. `.env` và dữ liệu Sapo đang dùng được giữ nguyên.

## Mở ứng dụng

Truy cập **http://localhost:5173**, dùng tài khoản Sakura hiện có. Giao diện được phục vụ từ bản dựng qua Caddy; PostgreSQL/API/web chỉ lắng nghe tại máy. Chưa chạy worker/Redis hay tự khởi động sau khi bật Windows.

Sau khi khởi động lại máy, chạy từng lệnh trong terminal riêng tại thư mục dự án, chờ PostgreSQL sẵn sàng trước API:

```powershell
node --env-file=.env scripts/local-db.mjs
node --env-file=.env apps/platform-api/dist/main.js
npm run start:web:local
```

Không chạy Vite đồng thời trên cổng 5173. Khi sửa mã ứng dụng, chạy `npm run build` rồi khởi động lại API/web. Caddy tại máy dùng HTTP localhost, không cài chứng chỉ vào hệ thống.

Đã tải Caddy 2.11.4 từ [bản phát hành chính thức](https://github.com/caddyserver/caddy/releases/tag/v2.11.4) và đối chiếu SHA-512 theo checksums của nhà phát hành. Công cụ ở `.local/caddy/caddy.exe`; thông tin nguồn tại `.local/caddy/provenance.json`. Máy khác cần cài Caddy hoặc đặt `CADDY_BIN`.

## Chuẩn bị bản phát hành

```powershell
npm run deploy:prepare
npm run deploy:check -- '<thư mục bản phát hành>/.env.production'
```

Mỗi lần prepare tạo thư mục `.local/releases/<mã>/` mới:

- `source/`: mã ứng dụng, logo, migration, cấu hình và hướng dẫn. Không kèm `.local`, `.env` thật, database dump, khóa phục hồi, Excel, node_modules hoặc bản build.
- `manifest.json`: danh sách tệp và SHA-256 của bản đóng gói.
- `.env.production`: mật khẩu database/JWT/Admin và khóa bảo vệ cấu hình Fanpage cài mới ngẫu nhiên, **ở ngoài source/build context**. Đây là tệp riêng tư, không chia sẻ cùng gói source thông thường. Khi phục hồi database cũ, phải dùng lại `MESSENGER_CONFIG_KEY` của máy nguồn; khóa mới không giải mã được cấu hình Fanpage cũ.
- `report.json`: kết quả không chứa giá trị bí mật. Tên miền/email quản trị còn chờ nên `ready: false` là đúng ở bước này.

Check chỉ kiểm tra cấu hình, không xác minh DNS, tài khoản hoặc Docker. Không in cấu hình chứa mật khẩu ra log chia sẻ; khi dùng Docker chọn `config --quiet`.

## Bộ Docker production

`compose.production.yaml` là bản độc lập, không ghép với `compose.dev.yaml`:

- Chỉ Caddy mở 80/443; PostgreSQL/Redis/API không mở cổng host. Database, ảnh, Redis và chứng chỉ có volume riêng.
- Caddy phục vụ React và chuyển `/api` trực tiếp đến API; API tin 1 proxy. Giá trị forwarded IP do client giả gửi bị loại bỏ.
- HTTPS/cookie secure/origin HTTPS được cấu hình sẵn, tự cấp chứng chỉ khi DNS/tên miền thực tế sẵn sàng. Xem [Caddy HTTPS](https://caddyserver.com/docs/automatic-https), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
- API/worker chờ migration; seed chỉ gọi riêng cho cài mới trống. Xem [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/).
- Log giới hạn 3 tệp × 10 MB mỗi dịch vụ. API gắn kho backup host chỉ đọc; trước triển khai phải tạo đường dẫn và cho UID 1000 đọc được.
- Messenger nhận/gửi vẫn tắt. Swagger và đường dẫn tệp riêng bị chặn. Ảnh dùng API phân quyền, asset không tồn tại trả 404, đường dẫn màn hình dùng React.

Mặc định DNS trỏ trực tiếp VPS. Nếu sau này đặt Cloudflare proxy/CDN phía trước, cần cấu hình nguồn proxy tin cậy và kiểm thử lại IP/giới hạn đăng nhập; không tin mọi proxy.

Khi có VPS Linux, chuyển source và cấu hình riêng qua kênh công ty kiểm soát, điền tên miền/email, tạo kho backup và thiết lập DNS. Chạy tại `source/` (chưa thực hiện):

```sh
docker compose --env-file ../.env.production -f compose.production.yaml config --quiet
docker compose --env-file ../.env.production -f compose.production.yaml build
docker compose --env-file ../.env.production -f compose.production.yaml run --rm seed
docker compose --env-file ../.env.production -f compose.production.yaml up -d
```

**Chỉ seed cho cài mới trống.** Với dữ liệu đã phục hồi, dùng tài khoản cũ; mật khẩu seed không thay thế mật khẩu đang dùng.

## Chuyển database và ảnh: quy trình chưa thực hiện

1. Chốt thời điểm chuyển, tạm dừng ghi ở nguồn, tạo/kiểm tra bản sao mới. Không dùng bản ngày cũ khi đã có dữ liệu mới.
2. Chuyển bản mã hóa và bản phát hành tương ứng; giữ khóa qua kênh riêng. Xem [Drive/R2](DRIVE-R2-BACKUP.md).
3. Tạo database/volume đích mới hoàn toàn, chưa chạy API/worker/seed/migration. Phục hồi archive và đủ tệp media vào kho mới.
4. Đối chiếu hash/số lượng từng bảng và ảnh, bộ đếm mã đơn, tài khoản/quyền và migration. Công cụ drill hiện chỉ tạo database thử tại localhost; chưa có lệnh tự nạp dữ liệu vào Compose.
5. Khi bản khôi phục đạt, chạy migration còn thiếu của đúng bản phát hành, mở API/web, thử đăng nhập/đơn Sapo/ảnh/quyền rồi mới cho người dùng ghi dữ liệu. JWT mới yêu cầu đăng nhập lại.
6. Giữ nguồn và backup để quay lại. Nếu đích đã có ghi mới, phải đối soát trước khi quay lại nguồn để không bỏ dữ liệu phát sinh.

Không dùng migrate reset, db push, down -v hoặc phục hồi đè database đang hoạt động. Mỗi lần cập nhật cần backup mới và giữ bản phát hành trước; chỉ quay lại image cũ khi tương thích schema.

## Kiểm chứng và giới hạn

Toàn bộ database/API/worker/web đã build tại máy. Kiểm thử Caddy Windows thật với giao diện đã dựng và API giả lập bao gồm định tuyến, CSP, cookie, IP giả, giới hạn body, đường dẫn riêng, asset và logo. Cấu hình HTTPS được chuyển đổi/kiểm tra, chưa cấp chứng chỉ công khai. Kiểm thử đóng gói xác minh hash và loại trừ dữ liệu/khóa khỏi source.

Chưa chạy Docker Engine/Compose, Redis/worker, CDN hoặc chuyển dữ liệu lên VPS trên máy này. Không coi build, đọc YAML và Caddy tại máy là bằng chứng đã triển khai Docker/VPS. Chưa kiểm thử trực quan hoặc đăng nhập bằng tài khoản người dùng trong lượt này.
