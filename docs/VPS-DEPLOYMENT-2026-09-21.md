# Sakura trên VPS dùng chung — 21/09/2026

## Truy cập và dữ liệu

- Ứng dụng: https://sakura.ldhuy.name.vn
- VPS: 103.124.94.254, Ubuntu 22.04; 1 CPU, khoảng 1 GB RAM, ổ đĩa 15 GB.
- Bản phát hành: `2026-09-21T02-33-30-573Z-6f9ae07f`.
- Đăng nhập bằng tài khoản Sakura hiện có; mật khẩu và phân quyền từ máy nguồn được giữ nguyên. Không dùng mật khẩu root VPS để đăng nhập Sakura.
- Đã chuyển snapshot ngày 21/09: 36 bảng, 34.999 bản ghi, 453 tệp ảnh. Toàn bộ hash nội dung bảng và ảnh sau khôi phục khớp nguồn.
- API đã đọc được 4.063 khách hàng, 11.732 đơn lịch sử; thư viện ảnh có 977 liên kết tới 453 tệp ảnh dùng chung.
- PostgreSQL ở VPS là bản sao độc lập. Dữ liệu nhập mới tại localhost không tự đồng bộ sang VPS hoặc ngược lại. Từ khi chuyển sang vận hành, dùng URL VPS làm nơi nhập liệu chính.

## Tách khỏi app Tomeco đang chạy

| Thành phần | Sakura | App hiện có |
| --- | --- | --- |
| Mã nguồn | `/srv/sakura/releases/<release>` | `/var/www/tomeco` |
| Bản đang chạy | `/srv/sakura/current` | Giữ nguyên |
| Node | `/opt/sakura/node` — 22.23.2 | `/usr/bin/node` — 20.20.2, giữ nguyên |
| API | `127.0.0.1:3100` | Cổng 3001, giữ nguyên |
| Database | PostgreSQL 17.9, `127.0.0.1:55432`, `/srv/sakura/database` | Không chỉnh sửa |
| Tài khoản hệ điều hành | `sakura`, `sakura-db`, không cho đăng nhập shell | Giữ nguyên |
| Dịch vụ | `sakura-api`, `sakura-db` và timer riêng | Không gọi PM2 restart/reload |
| Web | Nginx virtual host `sakura.ldhuy.name.vn` | Giữ nguyên default virtual host |

Không thay Node hệ thống, không khởi động lại VPS, không cài Docker, không thay Nginx mặc định. Chỉ reload Nginx sau khi `nginx -t` đạt. Sau triển khai, tiến trình app cũ vẫn cùng PID 1740254; HTTP 200 và hash trang chủ/config cũ vẫn khớp trước triển khai.

Tất cả dịch vụ Sakura nằm trong `sakura.slice`: CPU tối đa 60% một lõi, MemoryHigh 400 MiB, MemoryMax 480 MiB, swap tối đa 128 MiB. API tối đa 272 MiB, PostgreSQL tối đa 192 MiB. Cài dependency cho bản mới dùng tiến trình riêng, CPU 35%, RAM 320 MiB và ưu tiên thấp. Giới hạn này ưu tiên bảo vệ VPS; thao tác nặng có thể làm Sakura bị giới hạn hoặc bị khởi động lại.

Hai app vẫn dùng chung CPU/đĩa/Nginx và máy chủ vật lý. Đây là cách giảm ảnh hưởng, không phải cam kết cách ly tuyệt đối. Chưa thực hiện kiểm thử tải nhiều nhân viên hoặc nhập Excel lớn đồng thời trên VPS 1 GB. Nếu tải tăng, nên tăng RAM hoặc chuyển Sakura sang máy riêng.

## HTTPS và bảo vệ dữ liệu

- Let's Encrypt cấp chứng chỉ cho `sakura.ldhuy.name.vn`, chứng chỉ đầu tiên hết hạn 20/12/2026. Certbot dùng webroot, không tự sửa virtual host cũ.
- Certbot có hook kiểm tra Nginx rồi reload sau khi gia hạn.
- HTTP của domain Sakura chuyển sang HTTPS. API và PostgreSQL chỉ nghe loopback.
- File cấu hình: `/srv/sakura/shared/app.env`, root sở hữu, nhóm Sakura chỉ đọc; không đặt trong thư mục web.
- Giữ khóa mã hóa Messenger của nguồn để đọc được token Page/App Secret đã lưu. JWT mới; người dùng đăng nhập lại trên domain mới.
- Mã phát hành root sở hữu; API không có quyền sửa mã nguồn. API chỉ ghi vào kho ảnh được cấp.
- Log truy cập Sakura không ghi query string để tránh lưu OAuth code/Verify Token. Log Nginx Sakura xoay vòng, tối đa 7 tệp lịch sử.
- Không thêm khóa SSH hoặc thay cách đăng nhập quản trị VPS; triển khai dùng mật khẩu được cung cấp.

## Sao lưu và bảo trì

- Kho ảnh: `/srv/sakura/shared/media`.
- Kho backup: `/srv/sakura/shared/backups`; bản `initial` giữ snapshot chuyển máy.
- `sakura-backup.timer`: hằng ngày khoảng 02:30 giờ VPS, tạo bản sao database + ảnh và kiểm tra checksum; giữ 7 bản hoàn tất gần nhất và bản initial.
- Backup từ chối chạy khi ổ đĩa còn dưới 1 GiB. Bản sao đầu trên VPS đã tạo/kiểm tra thành công.
- Đây là backup trên cùng VPS. Drive/R2 chưa được kết nối; bản sao nguồn còn trên máy Windows. Cần bổ sung backup ngoài VPS cho vận hành lâu dài.
- `sakura-maintenance.timer`: dọn session hết hạn quá 30 ngày, khoảng 03:30. Chức năng hiện có của worker được chạy bằng timer để không cần thêm Redis và tiến trình worker thường trực trên máy 1 GB.

Lệnh quản trị chỉ tác động Sakura:

```sh
systemctl status sakura-api sakura-db
journalctl -u sakura-api -n 100 --no-pager
systemctl restart sakura-api
systemctl start sakura-backup.service
```

## Cập nhật sau này

1. Build và kiểm thử ở máy phát triển. Đóng gói source, migrations và các thư mục `dist`, không kèm `.env`, database, ảnh hoặc `node_modules` Windows.
2. Upload và giải nén vào thư mục release mới dưới `/srv/sakura/releases`. Không sửa trực tiếp release đang chạy.
3. Xem trước migration, nhất là thay đổi không tương thích hoặc có xóa dữ liệu. Bản cập nhật không cần và không được thay Nginx/PM2 của Tomeco.
4. Chạy `/srv/sakura/bin/update.sh <release>`. Lệnh chuẩn bị dependency trong thư mục mới, sao lưu, chỉ dừng Sakura API, migrate, chuyển con trỏ `current`, khởi động lại Sakura và kiểm tra health.
5. Release trước được giữ tại `/srv/sakura/previous`. Chỉ quay lại mã cũ nếu tương thích database hiện tại. Nếu migration lỗi, script dừng và yêu cầu xem xét database; không tự xóa hoặc phục hồi đè dữ liệu.

`update.sh` đã kiểm tra cú pháp; chưa chạy thử một lần nâng cấp/rollback thực tế. Không dùng `pm2 restart all`, `systemctl restart nginx`, nâng cấp Node toàn máy, hoặc khôi phục database đè trong quy trình sửa Sakura.

## Kết nối Messenger trên domain mới

Trong Sakura đã đổi callback từ Beeceptor sang domain VPS và bật tiếp nhận webhook; giữ gửi tin ở trạng thái tắt đến khi hoàn tất kết nối Meta.

| Trường Meta | Giá trị |
| --- | --- |
| App Domains | `sakura.ldhuy.name.vn` |
| Website URL, nếu được yêu cầu | `https://sakura.ldhuy.name.vn` |
| Webhook Callback URL | `https://sakura.ldhuy.name.vn/api/v1/messenger/webhook` |
| Valid OAuth Redirect URI | `https://sakura.ldhuy.name.vn/api/v1/messenger/oauth/callback` |

1. Đăng nhập Sakura, mở Hộp thư Messenger → Cấu hình → Thiết lập Meta. App ID hiện lưu là `660010340430881`, Graph API `v23.0`; cần bảo đảm đây là app Meta có Messenger và đúng token Fanpage.
2. Nếu không còn mã Verify Token, bấm Tạo mã xác minh, sao chép mã mới rồi lưu cấu hình. Điền cùng mã đó vào Meta. Không dùng Page Access Token làm Verify Token.
3. Trong Meta, lưu callback HTTPS trên và bấm Verify and save. Đăng ký sự kiện `messages` theo luồng hiện tại của Sakura.
4. Quay về Sakura, tải lại trạng thái → kiểm tra token Page → Đăng ký nhận tin → bật nhận của Page.
5. Để chọn Page bằng đăng nhập Facebook, thêm Redirect URI trên vào cấu hình Facebook Login for Business, tạo Configuration ID dùng User Access Token rồi điền vào Sakura và bật kết nối Facebook. Các quyền cần thiết được mô tả tại `FACEBOOK-LOGIN.md`.
6. Bật gửi chung và gửi cho từng Page sau khi hoàn tất xác minh/đăng ký. Gửi thử tới Page bằng tài khoản thử nghiệm hợp lệ với chế độ/quyền của app Meta, sau đó trả lời từ Sakura.

Máy chủ đã qua kiểm tra challenge, chữ ký hợp lệ, từ chối token/chữ ký sai qua HTTPS. Kiểm tra dùng webhook rỗng, không gửi tin cho khách và không tạo hội thoại giả. Trạng thái Meta verification vẫn để pending vì kiểm tra của máy chủ không thay thế nút Verify and save trong tài khoản Meta. Chưa thử nhận/gửi với Facebook thật.

## Kết quả kiểm tra

- Build database/API/worker/web thành công.
- 30 kiểm thử đơn vị và 122 kiểm thử tích hợp đạt tại máy phát triển.
- Đối chiếu đầy đủ database và ảnh sau restore trên VPS đạt; không còn migration chờ.
- HTTPS trang chủ và health đạt; đã xem trang đăng nhập trong trình duyệt.
- Đăng nhập qua HTTPS với tài khoản kiểm tra tạm, cookie Secure, truy cập khách hàng/đơn/sản phẩm/hội thoại/thư viện và tải ảnh có xác thực đều đạt. Tài khoản tạm và session của nó đã được xóa; audit kiểm tra được giữ.
- Kiểm tra webhook thành công nhưng kết nối Meta thật còn cần thao tác trong tài khoản Meta.
