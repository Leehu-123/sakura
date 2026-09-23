# Sao lưu, thử phục hồi và theo dõi dung lượng

Đã bổ sung màn hình **Lưu trữ & sao lưu** và bộ công cụ sao lưu database cùng kho ảnh. Công cụ hiện hỗ trợ PostgreSQL cục bộ, schema `public`. Chưa bật lịch chạy tự động, sao lưu ngoài máy hoặc phục hồi theo thời điểm bằng WAL.

Đã chuẩn bị phương án database trên Drive và ảnh trên R2, kèm mã hóa và ảnh dự phòng trên Drive. Theo yêu cầu công ty, cấu hình trước và kết nối sau; xem [hướng dẫn Drive/R2](DRIVE-R2-BACKUP.md).

## Sử dụng trong Sakura

Đăng nhập quản trị viên, mở **Lưu trữ & sao lưu**. Màn hình hiển thị:

- Dung lượng database, các bảng/chỉ mục và ảnh được dữ liệu tham chiếu.
- Dung lượng còn trống trên ổ chứa ảnh và bản sao; hai vị trí có thể nằm cùng một ổ, không cộng dung lượng của chúng.
- Bản sao hoàn tất gần đây, dung lượng, số bản ghi/tệp ảnh và lần thử phục hồi.
- Cảnh báo ổ dùng từ 70%, bản sao quá 24 giờ, chưa thử phục hồi hoặc có bản chưa hoàn tất.

Nút **Kiểm tra lại** chỉ đọc trạng thái; không tạo bản sao, thay đổi dữ liệu hoặc tự dọn tệp. Quyền xem là `core.audit.read / GLOBAL`. Không có API ghi đè database hoặc tải bản sao chứa dữ liệu cá nhân qua màn hình này. Tình trạng chưa có lịch tự động/bản sao ngoài máy được hiển thị riêng.

## Kết quả thực hiện ngày 09/09/2026

- Bản sao: `2026-09-09T07-12-06-740Z-aa2e926d`, lưu trong `.local/backups` của dự án.
- 31 bảng, **34.922 bản ghi**, **453 tệp ảnh**, tổng **258.337.748 byte**, khoảng **258,34 MB**. Các dòng hàng Sapo nằm trong dữ liệu JSON của đơn, đã được đối chiếu toàn bộ cùng bản ghi đơn.
- Database nén trong bản sao khoảng 6,01 MB; ảnh giữ nguyên 252,33 MB, không nén lại hoặc thay đổi ảnh gốc.
- Phục hồi vào database mới, kiểm tra đủ từng bảng/bản ghi và 453 ảnh, kiểm tra bộ đếm mã đơn: **đạt**. Thời gian lần thử khoảng **36,6 giây** trên máy hiện tại, không phải cam kết RTO khi có sự cố.
- Database thử và bản ảnh phục hồi tạm đã được dọn; database làm việc và bộ ảnh gốc giữ nguyên.
- Tại lần đo, ổ lưu ảnh/bản sao dùng khoảng **78%**, còn khoảng **78 GB**. Đây là mức dùng của cả ổ đĩa, không phải riêng Sakura; công cụ không xóa dữ liệu khác trên máy.

## Công cụ vận hành

Chạy tại thư mục dự án sau khi đã build database/API. `.env` được đọc tại chỗ; không đưa mật khẩu database vào tham số dòng lệnh.

```powershell
npm run backup:create
npm run backup:verify
npm run backup:drill
npm run storage:check
```

- `backup:create`: tạo một thư mục mới, chụp dữ liệu nhất quán và sao chép các tệp ảnh được tham chiếu tại thời điểm đó. Không ghi đè bản cũ.
- `backup:verify`: kiểm tra bản hoàn tất gần nhất, mã kiểm tra của danh sách và từng tệp. Có thể chỉ định đường dẫn bằng `npm run backup:verify -- '<đường dẫn bản sao>'`.
- `backup:drill`: kiểm tra bản sao rồi tạo **database mới có tên ngẫu nhiên** để thử phục hồi; không nhận tên database đích từ người dùng, không phục hồi đè database làm việc. Có thể chọn một thư mục bản sao như lệnh verify.
- `storage:check`: ghi một báo cáo dung lượng không chứa tên/điện thoại khách vào `.local/storage-checks`. Trả mã khác 0 khi có cảnh báo/lỗi để công cụ giám sát nhận biết; chạy trực tiếp script trả mã 2 cho cảnh báo, npm có thể quy về mã lỗi chung.

Cấu hình tùy chọn: `MEDIA_ROOT`, `BACKUP_ROOT`, `PG_BIN` là đường dẫn tuyệt đối. Mặc định hai kho là `.local/media` và `.local/backups`. Máy này đã có `pg_dump`/`pg_restore` 17.11 tải từ [bộ nhị phân chính thức EDB](https://www.enterprisedb.com/download-postgresql-binaries), dùng với PostgreSQL 17.9. Trên máy mới cần cài công cụ PostgreSQL phù hợp hoặc đặt `PG_BIN`; không chỉ sao chép mỗi tệp EXE mà bỏ các thư viện phụ thuộc. Thông tin nguồn tải và SHA-256 được giữ tại `.local/pg-tools/provenance.json` trên máy này.

## Cách bảo đảm bản sao dùng được

Database và danh sách ảnh được đọc trong một transaction chỉ đọc ở mức Repeatable Read. Snapshot được xuất và truyền cho `pg_dump --snapshot`; bản ghi mới phát sinh sau snapshot không lọt vào bản sao. File ảnh có tên theo SHA-256 và được kiểm tra sau khi sao chép. Cách dùng snapshot và định dạng archive tùy chỉnh dựa trên [tài liệu pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).

Mỗi bảng được đối chiếu bằng số dòng và SHA-256 của toàn bộ nội dung hàng sắp xếp ổn định. Dữ liệu đi qua biểu diễn JSON của PostgreSQL ở dạng văn bản, không chuyển số tiền lớn sang số thực JavaScript. Kiểm thử đã xác minh số 30 chữ số, thời điểm có microsecond và dữ liệu phát sinh đồng thời sau snapshot.

Trong thư mục bản sao:

```text
database.dump                  Database ở định dạng custom của PostgreSQL
media/<2 ký tự>/<SHA-256>       Tệp ảnh được tham chiếu, mỗi nội dung lưu một lần
manifest.json                  Danh sách bảng, số dòng và mã kiểm tra tệp
COMPLETE.json                  Chỉ xuất hiện khi đã hoàn tất toàn bộ
restore-verified-<time>.json    Biên bản thử phục hồi thành công
```

Bản thiếu ảnh, thiếu dung lượng hoặc công cụ sao lưu lỗi không được đánh dấu hoàn tất. Thư mục thất bại được giữ lại để kiểm tra và không tự chọn làm bản phục hồi. Việc kiểm tra checksum nhằm phát hiện thiếu/hỏng/thay đổi ngoài ý muốn; không thay thế xác thực chữ ký từ một nguồn không tin cậy. Chỉ phục hồi bản do công ty tạo và kiểm soát vì archive PostgreSQL chứa lệnh SQL.

Phục hồi sử dụng `pg_restore --exit-on-error --single-transaction` vào database mới; sau đó đối chiếu nội dung và ảnh, kiểm tra mã kế tiếp không trùng dữ liệu phục hồi. Chỉ database do lần thử vừa tạo được dọn. Xem [tài liệu pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html).

## Giới hạn và bước vận hành tiếp theo

- Đây là bản sao **database ứng dụng và ảnh**, không phải bản sao toàn bộ máy. Không kèm `.env`, mã nguồn/bản phát hành, file Excel trên Desktop, Redis, vai trò PostgreSQL toàn cluster hoặc thiết lập chủ sở hữu/quyền cấp database. Lưu bản phát hành tương ứng và cấu hình bí mật ở nơi được kiểm soát riêng khi chuẩn bị chuyển máy.
- Bản sao chứa hồ sơ khách và thông tin xác thực lưu trong database. Không đưa `.local/backups` vào Git, thư mục công khai hoặc kênh gửi tệp không được công ty cho phép.
- Bản sao trên cùng ổ đĩa chỉ giúp khôi phục lỗi dữ liệu; sự cố/mất máy vẫn có thể làm mất cả dữ liệu lẫn bản sao. Cần thêm bản mã hóa ở thiết bị/kho ngoài máy đã được công ty chọn.
- Chưa có lịch chạy tự động, tự xóa theo thời hạn hoặc tự gửi cảnh báo. Các ngưỡng chỉ được đánh giá khi mở trang/bấm kiểm tra/chạy công cụ.
- Chưa đạt mục tiêu mất dữ liệu tối đa 15 phút: cần triển khai lưu WAL liên tục và sao lưu ngoài máy, kiểm tra phục hồi định kỳ. Backup hiện tại là bản đầy đủ mỗi lần chạy, phù hợp giai đoạn dữ liệu hiện tại; dung lượng lớn hơn cần thiết kế lưu gia tăng/phiên bản ở kho ảnh riêng.
- Công cụ từ chối database ngoài localhost và schema khác public. Docker/VPS chưa được thử chạy; trang quản trị đọc vị trí `BACKUP_ROOT` của môi trường đó, không tự nhìn thấy bản sao trên máy phát triển. Chỉ mục tiêu thử phục hồi mới được triển khai; chưa có quy trình một nút chuyển database vận hành sang bản đã khôi phục.

Phương án dung lượng dài hạn và các giả định tăng trưởng: [báo cáo 1–5 năm](STORAGE-PLAN-2026-09-09.md).
