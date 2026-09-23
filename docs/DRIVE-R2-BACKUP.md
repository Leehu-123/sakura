# Cấu hình dữ liệu trên Google Drive, ảnh trên Cloudflare R2

Theo yêu cầu ngày 09/09/2026: **cấu hình trước, kết nối sau**. Chưa đăng nhập Google/Cloudflare, chưa tạo bucket, chưa tải dữ liệu ra ngoài, chưa cài lịch chạy và chưa bật tự xóa. PostgreSQL và ảnh phục vụ ứng dụng tiếp tục ở máy hiện tại. Phần R2 trong bước này là kho sao lưu ảnh đã mã hóa; chưa chuyển ứng dụng sang đọc ảnh trực tiếp từ R2.

## Phân bố dữ liệu đã chuẩn bị

| Nơi lưu                                | Nội dung                                                                |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Drive: `snapshots/<mã bản sao>/`       | Database đã nén/mã hóa, danh sách dữ liệu–ảnh đã mã hóa và dấu hoàn tất |
| R2: `<mã khóa>/media/`                 | Ảnh mã hóa, mỗi nội dung chỉ một bản cho mỗi khóa                       |
| Drive: `media-backup/<mã khóa>/media/` | Bản ảnh dự phòng độc lập nếu R2 mất/hỏng ảnh                            |
| Máy đang chạy Sakura                   | Database vận hành, ảnh đang dùng và bản sao cục bộ                      |

Giữ 30 bản database cỡ hiện tại (~6 MB/bản) cần khoảng 180 MB trên Drive; thêm bộ ảnh dự phòng ~252 MB là khoảng **433 MB**, chưa tính danh sách và tăng trưởng. R2 chứa bộ ảnh khoảng **252 MB** thay vì lặp toàn bộ bộ ảnh mỗi ngày. Ảnh cũ tiếp tục được giữ khi bản sao còn tham chiếu. Không gắn quy tắc hết hạn 30 ngày lên thư mục ảnh chung vì sẽ làm hỏng các bản sao còn dùng ảnh đó.

Drive miễn phí tối đa 15 GB dùng chung với Gmail/Photos; R2 Standard có 10 GB-tháng và hạn mức thao tác miễn phí. Chưa kiểm tra dung lượng trống thực tế trong tài khoản. Nguồn: [Google](https://support.google.com/drive/answer/9312312?hl=en), [R2](https://developers.cloudflare.com/r2/pricing/).

## Cấu hình cục bộ

`npm run backup:offsite:init` tạo `.local/offsite/config.json` và khóa ngẫu nhiên 32 byte `.local/offsite/recovery.key`; chạy lại không ghi đè cấu hình hoặc khóa. Thư mục `.local` đã được loại khỏi Git. Không hiển thị hoặc đưa khóa vào tài liệu, log, bản sao hay kho cloud.

Các trường cấu hình:

- `enabled: false`: kết nối cloud tắt.
- `driveRemote: null`, `r2Remote: null`: chưa chỉ định tài khoản/kho thật.
- `rcloneConfig`: đường dẫn tuyệt đối tới cấu hình tài khoản dành riêng cho Sakura.
- `rcloneBin: "rclone"`: dùng chương trình rclone trong PATH; có thể thay bằng đường dẫn tuyệt đối sau khi cài.
- `keyFile`: đường dẫn tới khóa phục hồi. Phải giữ một bản khóa riêng ngoài máy trước khi bật tải lên. Không đặt khóa cùng các bản sao được mã hóa bằng khóa đó.
- `recoveryKeySecured: false`: chỉ chuyển true sau khi đã lưu khóa riêng an toàn. Mất khóa sẽ không giải mã được bản sao.
- `schedule`: dự kiến mỗi ngày 02:00 giờ Việt Nam; `enabled: false`. Đây là cấu hình dự kiến, chưa có bộ lập lịch đọc trường này.
- `retentionDays: 30`, `automaticDeletion: false`: dự kiến giữ 30 ngày; chưa thực hiện xóa theo thời hạn.
- `warningBytes: 8000000000`: ngưỡng dự kiến 8 GB; chưa có giám sát quota cloud hoặc gửi cảnh báo.

Có thể đổi vị trí cấu hình bằng biến `OFFSITE_CONFIG`. Khóa và thông tin OAuth/R2 chỉ nhập/lưu tại máy trong tệp bí mật. Quyền mode 0600 được dùng trên hệ Unix; khi triển khai Windows cần kiểm tra ACL tài khoản chạy tác vụ tại thời điểm kết nối.

## Chuẩn bị và thử phục hồi không cần tài khoản

```powershell
npm run backup:create
npm run backup:offsite:prepare
npm run backup:offsite:local-drill -- '<thư mục prepared được trả về>'
```

Lệnh prepare lấy bản sao cục bộ hoàn tất mới nhất; có thể truyền đường dẫn bản cụ thể. Nó kiểm tra toàn bộ bản nguồn, mã hóa database, lập danh sách ảnh nhất quán, tái sử dụng ảnh mã hóa đã kiểm chứng. Dấu `READY.json` chỉ nói gói cục bộ sẵn sàng, **không phải đã sao lưu ngoài máy**.

`local-drill` mô phỏng hai kho bằng tệp tại máy, giải mã/kiểm tra từng tệp và dùng công cụ cũ phục hồi vào database mới ngẫu nhiên. Không ghi đè database vận hành. Kết quả có `mode: LOCAL_SIMULATION`. Database thử được dọn; bộ tệp khôi phục và gói mã hóa giữ trong `.local/offsite` để kiểm tra.

## Khi công ty sẵn sàng kết nối

1. Cài [rclone từ nguồn chính thức](https://rclone.org/downloads/); công cụ này chạy độc lập với cuộc trò chuyện. Rclone chưa được cài/kiểm thử trong bước cấu hình này.
2. Tạo OAuth client riêng của công ty và đăng nhập Drive qua trình duyệt bằng `rclone --config '<đường dẫn rcloneConfig>' config`. Dùng remote `sakura_drive`, scope `drive.file` để chỉ truy cập tệp/thư mục do ứng dụng tạo. Tạo thư mục Sakura qua remote này; thư mục có sẵn được tạo bằng cách khác có thể không nhìn thấy với scope này. Xem [rclone Drive](https://rclone.org/drive/).
3. Tạo bucket R2 **riêng tư, Standard**, ví dụ `sakura-backup`, và khóa Object Read & Write chỉ cho bucket đó. Thiết lập remote `sakura_r2` theo [hướng dẫn R2](https://rclone.org/s3/#cloudflare-r2). Mẫu không chứa bí mật ở `scripts/ops/rclone.conf.example`. Không cần bật truy cập công khai.
4. Điền `driveRemote: "sakura_drive:Sakura-Backup"`, `r2Remote: "sakura_r2:sakura-backup"` theo kho đã xác nhận. Lưu khóa phục hồi riêng, đặt `recoveryKeySecured: true`, sau đó `enabled: true`.
5. Chạy `npm run backup:offsite:upload -- '<thư mục prepared>'`, rồi `npm run backup:offsite:restore-drill -- '<mã bản sao>'`. Chỉ công nhận kết nối hoàn tất sau khi tải về và khôi phục dữ liệu thật đạt.
6. Sau đó mới cài lịch vận hành Windows Task Scheduler/systemd gọi `npm run backup:offsite:run`, kiểm soát không chạy chồng, cảnh báo thất bại/quota, và triển khai chính sách giữ/xóa 30 ngày có bảo vệ các ảnh còn được tham chiếu. Thao tác này chưa được thực hiện.

`run` tạo bản sao database/ảnh mới, chuẩn bị mã hóa rồi tải lên. Chưa đăng ký chạy định kỳ. Giai đoạn hiện tại chỉ chạy một lượt tại một thời điểm; không chạy các lệnh prepare/upload/run đồng thời.

## Tính toàn vẹn và phục hồi

- AES-256-GCM, nonce ngẫu nhiên 96 bit cho mỗi lần mã hóa, tag 128 bit; kiểm tra xác thực trước khi công bố tệp giải mã. Không tự xây dựng thuật toán mật mã, sử dụng Node crypto.
- Ảnh được lưu theo SHA-256 nội dung và mã nhận diện khóa. Thay ảnh tạo nội dung mới; đổi khóa tạo nhóm ảnh mới, không ghi đè ảnh dùng khóa cũ. Giữ khóa cũ cho các bản sao cũ.
- Mỗi bản database kèm danh sách ảnh của cùng snapshot PostgreSQL. Database và danh sách được mã hóa; tên thư mục/mã băm/kích thước vẫn là metadata thấy được trong kho.
- Rclone chỉ copy với immutable/checksum, không dùng sync/delete/purge. Sau tải lên, tải lại để so SHA-256. Chỉ ghi COMPLETE lên Drive sau khi database, danh sách, ảnh R2 và ảnh Drive đều đạt.
- Khi phục hồi, nếu ảnh R2 thiếu/hỏng hoặc không đọc được thì thử ảnh dự phòng trên Drive. Nếu cả hai không đạt, dừng, không đánh dấu bản phục hồi hoàn tất.
- Bản khôi phục vẫn chứa dữ liệu nhạy cảm và lệnh SQL PostgreSQL; chỉ dùng bản do công ty kiểm soát. Thử phục hồi luôn trong database mới.
- Cấu hình sao lưu ngoài máy chưa xuất hiện dưới dạng đã kết nối trên giao diện. Màn hình lưu trữ vẫn báo chưa bật vì chưa có lần tải lên thật. Chưa kiểm thử quyền OAuth, token R2, quota, mạng, rclone, Docker/VPS hay lịch tự động.

## Kiểm thử

Kết quả thực tế ngày 09/09/2026:

- Gói cục bộ `2026-09-09T07-55-22-620Z-d1e83c3a`, từ bản snapshot `2026-09-09T07-51-44-586Z-89617002`.
- Database nén 6.011.050 byte, sau mã hóa 6.011.086 byte. 453 ảnh sau mã hóa 252.343.591 byte.
- Đã ghép lại gói từ hai kho mô phỏng tại máy, giải mã và phục hồi **31 bảng / 34.930 bản ghi / 453 ảnh** vào database riêng. Đối chiếu từng bảng và tệp đạt; bộ đếm mã đơn hợp lệ. Database thử đã dọn; dữ liệu đang dùng không bị ghi đè.
- Phần thử PostgreSQL của lượt này mất khoảng 54 giây; chưa đo thời gian mạng hoặc cam kết thời gian phục hồi sự cố.
- Lệnh chạy tải lên bị từ chối khi cấu hình còn tắt, không phát sinh kết nối cloud.

`npm run test:ops` bao gồm kiểm tra mã hóa/khóa sai/tệp bị sửa, không công bố dữ liệu giải mã khi xác thực thất bại, chống đường dẫn không hợp lệ, không tải trùng ảnh, chỉ đánh dấu hoàn tất sau kiểm tra hai kho, từ chối tải lên khi chưa bật kết nối, và phục hồi dự phòng khi ảnh R2 hỏng. Các kho trong kiểm thử là mô phỏng; không gọi dịch vụ Google/Cloudflare.
