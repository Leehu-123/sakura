# Sakura Sale App · Khách hàng, đơn hàng và chuyển dữ liệu Sapo

Nền tảng dùng chung cho Sakura: NestJS modular monolith, React/Vite, PostgreSQL/Prisma và worker Redis/BullMQ. Triển khai bằng Docker trên VPS riêng. Không sử dụng Firebase/Supabase.

## Đã triển khai

- Lưu trữ & sao lưu: màn hình quản trị dung lượng, bản sao database kèm ảnh và công cụ thử phục hồi vào database riêng. [Hướng dẫn và kết quả kiểm chứng](docs/BACKUP-AND-STORAGE.md).

- Đã nhập ảnh Sapo vào kho tệp riêng: 453 tệp, 977 liên kết; danh mục sản phẩm và thư viện chat dùng chung ảnh. Đơn Sakura và Sapo tra cứu chung trong Đơn hàng. Xem [phương án lưu trữ 1–5 năm](docs/STORAGE-PLAN-2026-09-09.md).

- Logo Sakura Ribbon chính thức, dùng asset chung trong packages/brand cho các frontend hiện tại và tương lai.
- Khách hàng: chuẩn hóa số điện thoại, chống trùng, phân loại, địa chỉ, khu vực và ghi chú chăm sóc.
- Bàn giao khách: một người chăm sóc đang hiệu lực; quyền khách và đơn đi theo khách, người chốt lịch sử không đổi.
- Sản phẩm/biến thể: mã hàng, đơn vị, giá bán, ngừng bán; danh mục nằm trong CatalogModule dùng chung.
- Đơn nháp → chốt → hoàn tất hoặc hủy; lưu bản giá và địa chỉ tại lúc tạo. Tiền Decimal VND, tiền đã thu và vận chuyển tách riêng.
- Nhập CSV Sapo: ghép cột, xem trước lỗi/trùng, phân công khách, xác nhận nguyên tử và chống nhân đôi khi chạy lại.
- Đơn cũ Sapo chỉ tra cứu theo phạm vi khách; giữ người chốt/trạng thái/giá nguồn, không kích hoạt giao hàng hoặc nhắn tin.
- Hộp thư Messenger: webhook có chữ ký/chống lặp, gắn khách theo phạm vi, nhãn, mẫu trả lời, gợi ý thông tin chờ xác nhận; bộ gửi có kiểm soát và đối chiếu khi không rõ kết quả. Nhận/gửi thật mặc định tắt, chờ cấu hình Meta.
- Chống ghi đè phiên bản cũ và trùng đơn khi gửi lại cùng requestKey.

- Đăng nhập JWT 15 phút; refresh token ngẫu nhiên trong cookie HttpOnly, xoay mỗi lần dùng, hết hạn sau 7 ngày; thu hồi phiên khi phát lại token, khóa tài khoản hoặc đổi mật khẩu.
- Đổi mật khẩu bắt buộc lần đầu; quản trị viên đặt lại mật khẩu; đăng xuất.
- Quản lý tài khoản, gán nhiều vai trò; vai trò tùy chỉnh có permission và phạm vi.
- Ba vai trò mặc định: Quản trị viên, Sale tổng, Sale vùng. Hai khu vực: Miền Bắc và Miền Nam.
- Danh mục nhân viên, phòng ban, chi nhánh, khu vực: xem và thêm; liên kết nhân viên với tài khoản.
- Nhật ký thao tác có phân trang. Không ghi mật khẩu/token trong audit.
- Giao diện responsive tiếng Việt, dùng API thật; không có dữ liệu bán hàng giả.
- API REST /api/v1; Swagger /api/docs, OpenAPI JSON /api/docs-json.

**Chưa triển khai:** kết nối API Sapo tự động, kết nối Fanpage thật, VNPost, báo cáo bán hàng, tồn kho, hoàn tiền/đổi trả. Mỗi khách hiện có một số điện thoại và một địa chỉ chính. Chưa sửa dòng hàng sau khi tạo đơn (hủy đơn nháp và lập lại khi cần), chưa có màn hình thêm biến thể vào sản phẩm đã tạo (bộ nhập có thể thêm vào sản phẩm đã liên kết Sapo). Danh mục nhân sự chưa có màn hình sửa/xóa; quên mật khẩu qua Admin, chưa có email tự động.

Xem [cách dùng phần bán hàng](docs/SALES-GUIDE.md) và [hướng dẫn nhập Sapo](docs/SAPO-IMPORT.md). Phần Messenger xem [cách dùng và cấu hình](docs/MESSENGER.md). Bộ nhập trên giao diện nhận CSV UTF-8 tối đa 200 dòng/500 KB mỗi file. Ba file Excel thật đã được nhập và kiểm thử bằng bộ chuyển đổi riêng: [kết quả ngày 09/09/2026](docs/SAPO-IMPORT-2026-09-09.md).

## Chạy trên máy phát triển

Yêu cầu Node.js 22.16 trở lên (Node 22 LTS), npm.

```powershell
npm ci
npm run setup:env
npm run db:generate
npm run build
```

Lệnh setup tạo .env với khóa và mật khẩu ngẫu nhiên, không ghi đè file đã có. Không đưa .env vào Git. Tài khoản mặc định là admin@sakura.local; xem SEED_ADMIN_PASSWORD trong .env để đăng nhập lần đầu.

**Cách A — có Docker**, mở terminal riêng:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres redis
```

**Cách B — chưa có Docker**, chạy PostgreSQL đi kèm cho phát triển trong terminal riêng:

```powershell
npm run dev:db
```

Cách B chỉ chạy PostgreSQL, lưu dữ liệu trong .local/postgres và chỉ lắng nghe 127.0.0.1. Giữ terminal này mở; Ctrl+C để dừng. Không chạy đồng thời hai cách trên cùng cổng. Đây không phải phương án vận hành VPS. Linux chạy bằng tài khoản thường; dùng Docker nếu chạy dưới root.

Khởi tạo dữ liệu:

```powershell
npm run db:migrate
npm run db:seed
```

Mở hai terminal riêng cho API và giao diện:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

- Giao diện: http://localhost:5173
- API docs: http://localhost:3000/api/docs
- Health: http://localhost:3000/api/v1/health
- Worker (cần Redis): npm run dev:worker

Đăng nhập lần đầu buộc đổi mật khẩu; sau đó tạo tài khoản nhân viên, gán vai trò và thêm hồ sơ nhân viên. Seed không tạo tài khoản Sale với mật khẩu dùng chung. Có thể chạy seed lại: không trùng user/role/region, không đặt lại mật khẩu hoặc tự cấp lại quyền Admin cho tài khoản đã tồn tại. Các quyền của ba vai trò mặc định được đưa về cấu hình chuẩn; vai trò tùy chỉnh không bị sửa.

## Chạy cả bộ bằng Docker

```powershell
npm run setup:env
docker compose build
docker compose run --rm seed
docker compose up -d
```

Mở http://localhost:8080. Trong Compose, PUBLIC_WEB_ORIGIN được dùng cho CORS/cookie-origin; WEB_ORIGIN dùng cho chạy phát triển trực tiếp. Dữ liệu PostgreSQL và Redis có volume riêng; database/Redis/API không mở cổng ra Internet. Cổng web mặc định chỉ bind loopback.

Đã chuẩn bị cấu hình; chưa kiểm thử Docker trên máy hiện tại vì chưa cài Docker. Chưa triển khai lên VPS. Xem [hướng dẫn VPS](docs/DEPLOYMENT.md) trước khi vận hành thật.

## Kiểm tra

```powershell
npm run build
npm test
npm run test:integration
npm audit
```

Integration test cần PostgreSQL cục bộ hoạt động và bản build mới nhất. Bộ kiểm tra tạo schema có tên ngẫu nhiên test_..., áp dụng migration/seed, chạy HTTP API thật, sau đó chỉ xóa schema kiểm thử đó. Từ chối chạy với NODE_ENV=production hoặc máy chủ database ngoài localhost. Không nhập dữ liệu vào schema public trong kiểm thử.

## Cấu trúc

```text
apps/platform-api/src/
  auth/       Đăng nhập, phiên, guard, chính sách quyền
  core/       Tài khoản, vai trò, danh mục, nhật ký
  sales/      Khách, phân công, chăm sóc và đơn
  catalog/    Danh mục sản phẩm dùng chung
  imports/    Nhập Sapo có xác nhận và tra cứu đơn lịch sử
  messenger/  Webhook, hộp thư theo khách, mẫu và gửi tin
apps/sale-web/    Giao diện React tiếng Việt
apps/worker/      Công việc nền; hiện chỉ dọn phiên hết hạn
packages/database/
  prisma/schema.prisma
  prisma/migrations/
  prisma/seed.ts
infra/           Nginx
docs/            Thiết kế quyền, triển khai và việc tiếp theo
```

API tách AuthModule, CoreModule, CatalogModule, SalesModule, ImportsModule, MessengerModule và DatabaseModule; dùng chung auth/user/database. Worker chạy độc lập, không nhận webhook tích hợp cho đến khi xác thực chữ ký và tính idempotent được triển khai.

Các phiên bản được khóa trong package-lock.json. deepmerge-ts được override sang 8.x để xử lý cảnh báo bảo mật ở dependency của Prisma; migration, seed và generate phải được chạy lại khi nâng phiên bản. Không tự động nâng major trong môi trường vận hành.

Tài liệu nền tảng: [NestJS](https://docs.nestjs.com/), [Prisma](https://www.prisma.io/docs/), [PostgreSQL cục bộ cho phát triển](https://github.com/leinelissen/embedded-postgres).

## Bổ sung Sakura Social — 08/09/2026

Đã bổ sung menu/bộ lọc theo ảnh Sapo, phân hỗ trợ/chặn/chưa đọc, thư viện ảnh, hồ sơ khách bên phải, tạo và chốt đơn trong chat, gửi xác nhận đơn và phiếu giao nội bộ có lưu lịch sử. Admin có thể thêm Fanpage ngay trong Cấu hình, kiểm tra token và đăng ký nhận tin; xem [hướng dẫn Fanpage](docs/FANPAGE-CONFIGURATION.md) và [Sakura Social](docs/SOCIAL-WORKSPACE-GUIDE.md). Áp dụng đầy đủ migration trước khi chạy bản mới. Nhận/gửi Meta vẫn tắt khi chưa có cấu hình thực tế.
