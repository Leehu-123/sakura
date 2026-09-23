# Kiểm chứng bản dựng tại máy và bộ triển khai — 13/09/2026

- Bộ database/API/worker/web đã build thành công; không sửa schema hoặc dữ liệu Sapo trong bước này.
- 3 kiểm thử triển khai đạt: cấu hình production, gói source loại trừ dữ liệu/khóa và Caddy Windows thật. Lỗi đường dẫn có khoảng trắng đã sửa bằng cách đặt đường dẫn web trong dấu nháy.
- Caddy 2.11.4 tải từ bản phát hành chính thức, đối chiếu SHA-512 theo checksums. Kiểm tra định tuyến SPA/API, CSP, cookie, không nhận forwarded IP giả, body quá giới hạn trả 413, đường dẫn riêng/asset thiếu trả 404, logo trả 200. Cấu hình HTTPS chuyển đổi được nhưng chưa cấp chứng chỉ công khai.
- compose.production.yaml đọc YAML thành công; chỉ web có cổng host và API tin 1 proxy. Chưa chạy Docker Engine/Compose thực tế.
- Đã khởi động lại PostgreSQL từ thư mục dữ liệu cũ, API và giao diện bản dựng qua Caddy tại localhost:5173. Smoke: trang chủ/orders/health 200; storage chưa đăng nhập 401; Swagger qua web 404.
- Chưa chạy Redis/worker, kiểm thử trực quan/đăng nhập người dùng, VPS, CDN hoặc kết nối cloud. Không cài tự khởi động Windows.
- [Hướng dẫn tại máy và bộ triển khai](LOCAL-DEPLOYMENT.md).

---

# Kiểm chứng cấu hình Drive/R2 — 09/09/2026

- Theo yêu cầu cấu hình trước/kết nối sau: chưa đăng nhập, chưa tải dữ liệu ra ngoài, chưa cài lịch chạy hoặc tự xóa.
- Có công cụ tạo cấu hình/khóa tại máy, mã hóa database/danh sách/ảnh, tái sử dụng ảnh theo nội dung, tải lên hai kho và tải về để xác minh trước khi công bố hoàn tất. Adapter rclone đã chuẩn bị nhưng chưa chạy trên Google/Cloudflare thật.
- Bộ kiểm thử vận hành gồm 6 bài (2 bài sao lưu cũ, 4 bài mã hóa/phân tách mới): khóa sai, tệp sửa, đường dẫn không hợp lệ, không ghi trùng ảnh, không commit khi tải/kiểm tra thất bại, khôi phục ảnh dự phòng Drive.
- Thử gói dữ liệu thật qua hai kho mô phỏng tại máy: giải mã, khôi phục 31 bảng / 34.930 bản ghi / 453 ảnh, đối chiếu hash từng bảng/tệp và bộ đếm mã đơn: đạt. Database thử đã dọn, database vận hành không ghi đè.
- Lệnh offsite run khi cấu hình tắt trả lỗi như thiết kế trước khi tạo bản sao/tải lên. Chưa kiểm thử adapter rclone, OAuth/token, mạng, quota, lịch và giữ/xóa 30 ngày. Không sửa giao diện/API hoặc schema trong bước này.
- [Cấu hình, kết quả và bước kết nối sau](DRIVE-R2-BACKUP.md).

---

# Kiểm chứng sao lưu và lưu trữ — 09/09/2026

- API và web biên dịch thành công; 18 kiểm thử Core/API đạt, gồm quyền xem trạng thái lưu trữ và không có API phục hồi ghi đè.
- 2 kiểm thử đường dẫn/checksum và 1 kiểm thử sao lưu tích hợp trên PostgreSQL thật đạt. Kiểm tra dữ liệu số 30 chữ số, thời gian microsecond, bản ghi phát sinh sau snapshot, ảnh thiếu, marker hoàn tất và bộ đếm mã.
- Bản sao dữ liệu thật: 31 bảng, 34.922 bản ghi, 453 ảnh, 258.337.748 byte. pg_dump 17.11, server 17.9; archive custom cùng snapshot với bảng đối chiếu và ảnh.
- Đã phục hồi bản thật vào database mới, đối chiếu mọi bảng/bản ghi bằng SHA-256 và toàn bộ ảnh; bộ đếm mã đơn hợp lệ. Thử phục hồi 36,6 giây, sau đó dọn riêng database/ảnh thử. Dữ liệu sử dụng không bị ghi đè.
- Màn hình Lưu trữ & sao lưu chỉ đọc, mặc định dành cho Admin qua core.audit.read GLOBAL. Cảnh báo thực tế: ổ lưu trữ dùng khoảng 78%, còn khoảng 78 GB.
- Chưa kiểm thử trực quan bằng trình duyệt trong lượt này; chưa có lịch chạy tự động, sao lưu ngoài máy, WAL/PITR hoặc kiểm chứng Docker/VPS.
- [Hướng dẫn và biên bản](BACKUP-AND-STORAGE.md).

---

# Kiểm chứng ảnh Sapo và danh sách đơn chung — 09/09/2026

- Đã áp dụng migration 202609090002_product_media, xây dựng lại API và web thành công; API đang chạy bản mới. Health/web trả 200, danh sách đơn chung chưa đăng nhập trả 401.
- 20 kiểm thử đơn vị đạt. Lượt đầy đủ đầu tiên đạt 90/90 kiểm thử tích hợp. Lượt lặp sau đó lỗi khởi tạo Core (before hook vượt thời gian trong môi trường chạy chậm), đã dừng; chạy riêng bản cuối đạt 8/8 kiểm thử Sapo/ảnh/danh sách chung và 17/17 kiểm thử Core. Không ghi nhận lỗi chức năng trong các lượt riêng này.
- 553 URL ảnh tải thành công, 453 tệp khác nội dung/252.327.283 byte, 977 liên kết. Đối chiếu đủ 977 liên kết theo mã sản phẩm/biến thể nguồn, kiểm tra hash và giải mã cả 453 tệp: đạt. Nhập lại tạo 0, bỏ qua 977; không còn lỗi tải.
- 26 sản phẩm có ảnh; 424 biến thể có ảnh riêng, 7 biến thể không có ảnh riêng trong nguồn. Ảnh lưu ngoài database và thư viện chat đọc được qua API phân quyền; ảnh thử nghiệm dùng môi trường riêng.
- Danh sách đơn chung kiểm tra nguồn, trạng thái, phân trang, mã đơn dài hơn 6 chữ số, tìm kiếm, khách chưa liên kết và thu hồi quyền sau bàn giao. Đơn Sapo không dùng được với API chốt đơn vận hành.
- Dữ liệu làm việc vẫn có 0 đơn vận hành, 0 tin nhắn và 0 phiếu giao. Không gửi ảnh thật qua Meta.
- Kiểm thử trình duyệt ở môi trường riêng bị timeout khi mở trang; chưa hoàn tất QA trực quan. Đã dừng môi trường thử và dọn schema UI do lượt này tạo. Chưa kiểm thử Docker/VPS hoặc kho S3.
- [Phân tích tăng trưởng và lưu trữ 1–5 năm](STORAGE-PLAN-2026-09-09.md).

---

# Kiểm chứng nhập Excel Sapo thật — 09/09/2026

- Database/API/worker/web biên dịch thành công; 20 kiểm thử đơn vị và 88 kiểm thử tích hợp đạt.
- Kiểm thử riêng trên schema cô lập bằng ba file nguồn thật: 4.063 khách, 26 sản phẩm, 431 biến thể, 11.732 đơn và 31.662 dòng hàng; kiểm tra nguồn độc lập, nhập lại, chữ ký nội dung và phân quyền.
- Migration 202609090001_sapo_native_export đã áp dụng và dữ liệu thật đã nhập vào cơ sở dữ liệu cục bộ. Đối chiếu đủ 16.252 bản ghi cùng toàn bộ dòng hàng, trường ánh xạ và dữ liệu nguồn: đạt.
- Nhập lại ở chế độ xem trước: tạo 0, bỏ qua 16.252. Đơn vận hành, tin nhắn, phiếu giao và phân công vẫn bằng 0.
- 6.110 đơn liên kết bằng số điện thoại duy nhất; 5.622 đơn chưa liên kết, 405 khách thiếu số điện thoại. Không tự bổ sung dữ liệu thiếu. Nhân viên tạo đơn được lưu riêng với người chốt.
- Trình duyệt mở được màn hình đăng nhập; chưa có phiên người dùng để kiểm thử thao tác sau đăng nhập. Chưa chuyển dữ liệu lên VPS.
- HTTP smoke sau khởi động lại API: health, web và proxy health trả 200; đơn cũ chưa đăng nhập trả 401.
- Chi tiết và giới hạn: [báo cáo nhập dữ liệu](SAPO-IMPORT-2026-09-09.md).

---

# Kiểm chứng bản Sakura Social — 08/09/2026

- Toàn bộ các phần database, API, worker và web biên dịch thành công.
- 20 kiểm thử đơn vị đạt, gồm multipart upload ảnh, định tuyến token đúng Fanpage, lỗi upload không gửi cho khách và từ chối cấu hình nhiều Page không hợp lệ.
- 82 kiểm thử tích hợp đạt (78 ca + 4 nhóm tổng): Core 16, nhập Sapo 17, Sales 16, Messenger/Social 29.
- Các ca bổ sung kiểm tra phạm vi khi phân hỗ trợ, trạng thái đọc riêng và tin đến sau bản đang xem, chống lặp webhook, chặn gửi nhưng lưu tin đến, nhiều Page cùng PSID, thư viện ảnh và đúng biến thể, gửi ảnh không lặp, tạo/chốt đơn nguyên tử, bản xác nhận cũ/khác khách, phiếu giao không trùng và giữ bản trước, hủy phiếu theo đơn, chưa trả lời theo kết quả gửi thành công.
- Lượt chạy toàn bộ song song ban đầu lỗi khởi tạo test. Chạy lại riêng Messenger đạt; chuyển trình chạy các file tích hợp sang tuần tự để tránh tranh chấp khởi tạo/migration trên PostgreSQL cục bộ, toàn bộ 82 kiểm thử đạt trong khoảng 57 giây. Các ca đồng thời bên trong từng bộ vẫn chạy và đạt.
- Đã áp dụng migration 202609080005_social_workspace vào cơ sở dữ liệu cục bộ. Migration bổ sung dữ liệu đọc/hỗ trợ/ảnh/phiếu và chuyển mốc tin cũ; không sửa migration đã áp dụng trước đó.
- Test dùng schema ngẫu nhiên, tách dữ liệu làm việc; transport/fetch giả lập, không gửi tin thật cho khách. Không nhập dữ liệu mẫu từ ảnh Sapo.
- Chưa thao tác QA trình duyệt hoặc in giấy, chưa kết nối Fanpage thực tế, chưa triển khai Docker/VPS hoặc hãng vận chuyển. Xác nhận đơn gửi dưới dạng văn bản tối đa 2.000 ký tự; phiếu giao chỉ là phiếu nội bộ. Xem SOCIAL-WORKSPACE-GUIDE.md.

---

## Nhật ký kiểm chứng các giai đoạn trước

# Kiểm tra ngày 08/09/2026

Môi trường: Windows, Node.js 22.16, PostgreSQL 17.9 cục bộ.

## Messenger bổ sung

- Build database/API/worker/web sau cập nhật Messenger: đạt.
- 19 unit test: đạt; thêm chữ ký raw body, gợi ý, cửa sổ trả lời và transport giả lập.
- Bộ integration chung đạt 70 test có tính test cha; sau đó kiểm tra riêng Messenger đạt 19 test gồm 18 tình huống và một test cha (bổ sung tắt/khôi phục mẫu). Tổng hiện có 67 tình huống nghiệp vụ: Core 16, Sales 16, Sapo 17, Messenger 18.
- Kiểm tra Messenger: mặc định tắt; handshake; chữ ký sai; webhook lặp/đồng thời; Page khác/echo/tin cũ; không tải URL tệp; scope hội thoại chưa gắn và đã gắn; kiểm tra phiên bản; gợi ý chưa tự ghi; mẫu; cửa sổ gửi; idempotency; kết quả UNKNOWN; tiến trình dừng và đối chiếu; bàn giao đổi quyền.
- Transport/fetch được giả lập trong test; không gọi Meta hoặc gửi tin thật.
- Migration 202609080004_messenger áp dụng vào cơ sở dữ liệu cục bộ; seed thêm quyền quản lý Messenger cho Admin và giữ mật khẩu cũ.
- HTTP smoke: API, giao diện, proxy và OpenAPI 200; hộp thư chưa đăng nhập trả 401; webhook chưa bật trả 503.
- Cấu hình nhận/gửi cục bộ đều false; cơ sở dữ liệu làm việc có 0 hội thoại và 0 tin. Không thêm tin giả vào môi trường sử dụng.
- Không thêm thư viện ngoài trong bước Messenger. Logo chính thức vẫn có trong bản build.
- Chưa kiểm tra trình duyệt, Fanpage thật, quyền/token Meta, webhook HTTPS, Docker hoặc tải trên VPS. Xem MESSENGER.md về giới hạn echo/tệp/lưu giữ dữ liệu và đối chiếu kết quả gửi.

## Kết quả bước Sapo trước đó

- Build database package, NestJS API, worker và React/Vite: đạt.
- 14 unit test: đạt (mật khẩu/cấu hình/quyền, CSV, ngày nguồn, chữ ký JSONB).
- 49 tình huống HTTP integration trên PostgreSQL thật: đạt (16 Core + 16 Sales + 17 Sapo; trình chạy báo 52 khi tính ba test cha).
- Migration 202609080003_sapo áp dụng thành công vào cơ sở dữ liệu cục bộ; seed thêm quyền nhập cho Admin, không đổi mật khẩu tài khoản cũ.
- API health, giao diện, proxy API, mẫu CSV và hướng dẫn tải về: HTTP 200. OpenAPI có các route nhập mới; chi tiết đơn lịch sử chỉ có GET.
- Schema làm việc hiện có 0 ImportBatch và 0 HistoricalOrder: chưa nhập file kinh doanh thật.

## Tình huống Sapo đã xác minh

- Sale không có quyền tải, xem hoặc xác nhận dữ liệu nhập toàn công ty; quyền nhập mặc định chỉ thuộc Admin.
- CSV ghép cột tiếng Việt, giữ ô có dấu phẩy/ngoặc kép/xuống dòng, đọc UTF-8 BOM/phẩy/chấm phẩy/tab.
- Chặn sai cấu trúc, sai mã hóa, ánh xạ thiếu/trùng/sai kiểu; giới hạn dòng, cột, ô và dung lượng.
- Nhận file lớn hơn 100 KB trong giới hạn 500 KB qua HTTP.
- Xem trước không tạo dữ liệu kinh doanh. Số điện thoại chuẩn hóa, email Sale và khu vực được kiểm tra.
- Một dòng lỗi chặn cả lô; trùng điện thoại/SKU/mã nguồn hoặc nội dung mã cũ thay đổi được báo lỗi.
- JSONB đổi thứ tự khóa không làm đổi chữ ký kế hoạch.
- Bản xác nhận khác chữ ký, hết 24 giờ, Sale bị khóa hoặc khách đổi sau xem trước đều bị chặn.
- Hai bản xem trước xác nhận đồng thời cùng mã chỉ tạo một khách/mã nguồn.
- Lỗi cơ sở dữ liệu ở dòng sau rollback cả bản ghi đã tạo trước, mã nguồn, trạng thái và audit xác nhận.
- Nhiều biến thể cùng sản phẩm tạo một sản phẩm; có thể thêm biến thể vào mã sản phẩm đã nhập.
- Đơn nhiều dòng được ghép; ngày nhuận, tiền dòng/tổng đơn được đối chiếu.
- Giá, người chốt và trạng thái nguồn được giữ; thiếu người chốt cảnh báo và để trống.
- Chạy lại cùng file hoặc đổi thứ tự dòng hàng không nhân đôi dữ liệu.
- Đơn cũ không tạo Order/OrderHistory vận hành. ID lịch sử không dùng để chốt đơn/thu tiền; không có API sửa lịch sử.
- Quyền xem đơn lịch sử theo khách được giao; bàn giao đổi quyền ngay nhưng giữ người chốt gốc.
- Nhật ký chỉ ghi loại/số lượng/ID lần nhập, không sao chép dữ liệu cá nhân từng dòng vào audit.

## Các chức năng cũ vẫn đạt

Core: đăng nhập, refresh/cookie/CSRF, đổi mật khẩu, khóa user, chống tăng quyền, Admin cuối cùng, quản lý vai trò/danh mục/audit.

Sales: phạm vi khách, chống trùng điện thoại, phiên bản hồ sơ, ghi chú, sản phẩm/SKU, giá và phép tính Decimal, chốt đơn, bàn giao, giữ người chốt, thu tiền lũy kế, trạng thái và audit. Hai bàn giao đồng thời chỉ một owner; tạo đơn cùng requestKey không trùng. Giá/tên hàng/địa chỉ mới không đổi lịch sử. GLOBAL đọc khách không mở rộng ASSIGNED quản lý đơn.

Logo chính thức vẫn dùng từ packages/brand và có trong bản build. SHA-256 đã đối chiếu với file gốc ở bước trước.

Integration test tạo schema ngẫu nhiên test_..., áp dụng cả ba migration và seed, sau đó chỉ dọn schema kiểm thử. Không thêm dữ liệu kinh doanh giả vào schema làm việc.

## Phạm vi chưa kiểm chứng

Chưa có file export Sapo thật của Sakura; bộ nhập hiện là định dạng CSV trung gian có ghép cột, không phải kết nối API Sapo. Chưa thao tác kiểm thử giao diện bằng trình duyệt.

Chưa chạy Docker Compose/Nginx/Redis worker trên máy hiện tại vì chưa có Docker; worker đã biên dịch. Chưa triển khai VPS, Messenger/VNPost hoặc vận hành bán hàng thực tế.

npm audit đã ghi nhận 0 cảnh báo cuối Giai đoạn 0. Bước Sapo chỉ khai báo trực tiếp Express đã có sẵn trong dependency tree và cập nhật lockfile offline; chưa chạy audit trực tuyến lại.

Xem SAPO-IMPORT.md và SALES-GUIDE.md để biết giới hạn định dạng, đối chiếu dữ liệu, sửa đơn và hoàn/đổi trả.
# Bổ sung quản lý Fanpage trong Cấu hình — 13/09/2026

- Build database/API/worker/web đạt. 21 kiểm thử đơn vị và 31 kiểm thử tích hợp cấu hình/hội thoại đạt; Meta gateway/transport giả lập, schema thử riêng. Kiểm tra phân quyền, mã hóa/không lộ khóa, phiên bản xung đột, thêm trùng, token sai/đúng, xác minh webhook, đăng ký, công tắc nhận/gửi, lưu qua service mới và giữ hội thoại khi tắt Page.
- Đã sao lưu trước thay đổi và áp dụng migration `202609130001_messenger_configuration` vào database tại máy. Đã tạo khóa mã hóa riêng và khởi động API bản mới. Chưa lưu thông tin Fanpage thật hoặc gọi Meta thật.
- Trình duyệt mở được trang đăng nhập; không có phiên đăng nhập để kiểm tra trực quan biểu mẫu cấu hình. Chưa kiểm thử Fanpage thật/HTTPS/OAuth; OAuth chưa được triển khai.
- Hai kiểm thử đóng gói/cấu hình triển khai đạt sau khi thêm khóa Fanpage. Smoke bản chạy tại máy: trang chủ và health 200, cấu hình chưa đăng nhập 401, webhook chưa bật 503. Web đã dựng lại với mục Fanpage và danh sách Page làm mới sau khi lưu cấu hình.
# Tra cứu lịch sử trả lời — 13/09/2026

- Bổ sung API/trang Lịch sử trả lời, lọc người gửi, ngày UTC+7, Fanpage, nội dung và kết quả. Chỉ quyền chat GLOBAL được truy cập; tin cũ giữ người gửi độc lập với người hỗ trợ hiện tại. Mở kết quả định vị đúng trang/tin trong hội thoại.
- Kiểm thử lịch sử đạt 4 kịch bản (5 mục tính cả nhóm): phân quyền, người đã khóa/trùng tên, mốc đầu/cuối ngày, lọc kết hợp/phân trang, SENDING quá hạn, dữ liệu không hợp lệ và định vị tin trùng thời điểm/ngoài phạm vi. 29 kịch bản hội thoại hiện có (30 mục tính cả nhóm) vẫn đạt. Lỗi fixture ban đầu thiếu requestKey đã sửa; không thay ràng buộc dữ liệu.
- Backup trước migration: `.local/backups/2026-09-13T11-19-19-773Z-52b85790`, 32 bảng / 34.981 bản ghi / 453 ảnh. Migration `202609130002_messenger_history` thêm 2 chỉ mục đã áp dụng.
- Trình duyệt hiện ở trang đăng nhập, chưa kiểm tra trực quan trang lịch sử sau đăng nhập. Không kết nối/gửi Meta thật; chưa có phân ca hoặc Facebook OAuth.
- API và web đã build thành công, API đã khởi động lại bản mới. Smoke qua Caddy: trang chủ/health 200, API lịch sử và danh sách bộ lọc chưa đăng nhập 401; bản web phục vụ đã có trang lịch sử và nhãn định vị tin.
# Ca trực và nhóm Fanpage — 13/09/2026

- Migration `202609130003_chat_shifts` đã áp dụng sau backup `.local/backups/2026-09-13T11-41-21-107Z-6f7b30a1` (32 bảng / 34.982 bản ghi / 453 ảnh). Không tự tạo nhóm/ca hoặc phân công nhân sự thật.
- 21 kiểm thử đơn vị đạt. Bộ lịch sử/hội thoại/ca trực đạt 43 mục (40 kịch bản con và 3 nhóm). Sau khi thêm kiểm soát tin mới lúc hoàn tất, chạy lại 7 kịch bản ca trực (8 mục gồm nhóm) đạt.
- Kiểm tra phân quyền nhóm, nhận cùng lúc chỉ một người thành công, không dùng phân hỗ trợ cũ để vượt quyền, gắn đúng người/ca trên tin, bàn giao giữ người gửi cũ, kết thúc ca trả việc kèm ghi chú, chặn thay người khi gửi chưa rõ, hoàn tất/mở lại/chống webhook lặp, thu hồi quyền khi bỏ thành viên và tiếp quản của quản trị.
- QA trình duyệt bằng đăng nhập bình thường với tài khoản giả trên schema/địa chỉ loopback riêng: menu màn hình nhỏ, bắt đầu ca, lọc Chờ nhận, nhận việc, thấy trạng thái Đang xử lý/tên người/ca trên tin, kết thúc ca về 0 ca đang mở. Đã xem biểu mẫu nhóm và chỉnh kích thước checkbox cho màn hình nhỏ. Không đăng nhập/thay đổi tài khoản thật, không gửi Meta thật; môi trường thử tự đóng và dọn schema.
- Chưa kiểm chứng tải nhiều người thực tế, chưa có lịch/phân tải tự động, thông báo đẩy, Facebook OAuth hoặc kết nối Fanpage thật.
- API/web bản cuối build đạt; API đã khởi động lại. Smoke qua Caddy: trang chủ/health 200, API ca trực và bộ lọc lịch sử chưa đăng nhập 401. Database công ty hiện chưa có nhóm/ca thật, chờ quản trị thiết lập trên giao diện.

# Ghi chú người gửi và hội thoại tự cập nhật — 13/09/2026

- Theo yêu cầu, bỏ trang/menu Lịch sử trả lời; ghi chú người gửi và thời gian nằm dưới tin nhắn, ảnh và xác nhận đơn. Dữ liệu người/ca/nhật ký và API lịch sử được giữ nguyên.
- Thêm cập nhật định kỳ cho danh sách hội thoại, chi tiết và ca trực; tạm dừng khi ẩn/offline hoặc đang sửa biểu mẫu liên quan, hủy phản hồi cũ khi đổi màn hình, thử lại có giãn khoảng khi lỗi. Giữ trang tin đang đọc, báo tin mới và chỉ đánh dấu đọc phần mới nhất đang mở.
- 11 kiểm thử frontend đạt: chống tải chồng, ẩn/offline/quay lại, phục hồi lỗi, dừng khi hết quyền, hủy khi rời trang, giữ trang tin cũ nhưng cập nhật người/quyền gửi, mở tin mới, phản hồi HTTP bị hủy/sai định dạng. Lệnh: `npm run test -w @sakura/sale-web`.
- Bộ ca trực chạy lại đạt 7 kịch bản (8 mục kể cả nhóm), trong schema PostgreSQL thử riêng với Meta giả.
- QA trên trình duyệt: tạo 45 tin giả để có hai trang, thêm tin từ ngoài phiên đang xem; tin tự hiện và bản nháp giữ nguyên. Khi xem trang 2, tin đến hiện nút báo mới, trang/số tin đang đọc giữ nguyên; bấm nút mở trang 1 có đủ tin mới và giữ bản nháp. Giả lập nhận việc/kết thúc ca ở dữ liệu thử: người hỗ trợ/trạng thái tự đổi, nút gửi bật rồi khóa đúng, bản nháp giữ nguyên. Không bấm gửi và không gọi Meta thật. Không có lỗi console trong lần kiểm tra.
- Không thay đổi schema/dữ liệu công ty. Môi trường thử đã đóng và dọn schema. Chưa kiểm thử tải nhiều nhân viên hoặc kết nối Meta thật; chưa có thông báo đẩy khi app đóng.

# Đăng nhập Facebook để chọn Fanpage — 13/09/2026

- Thêm cấu hình Facebook Login for Business, nút chuẩn bị đăng nhập, danh sách Page được cấp quyền và xác nhận lưu. HTTP tại máy chỉ cấu hình trước; cần WEB_ORIGIN HTTPS để bắt đầu OAuth thật. Không thay đổi schema database, không lưu cấu hình Meta thật.
- Callback ràng buộc state dùng một lần/cookie Secure HttpOnly Lax/phiên Sakura và quyền quản trị; kiểm tra lại khi lưu. Token ứng viên mã hóa trong bộ nhớ API 10 phút, token Page đã chọn mã hóa trong cấu hình database. Chỉ lưu toàn bộ khi mọi Page được chọn xác minh thành công; lưu đồng thời chỉ một lần, không lộ khóa qua API/audit, giữ hội thoại khi kết nối lại Page.
- 26 kiểm thử đơn vị đạt, trong đó 5 kiểm thử gateway mới: đổi code/kiểm tra ứng dụng và quyền/đúng Page, token hết hạn hoặc bị thu hồi, phân trang không theo URL lạ, vòng lặp cursor và che lỗi có thông tin nhạy cảm. Bộ cấu hình + OAuth tích hợp đạt 10 mục, gồm 8 kịch bản OAuth và 2 nhóm; chạy PostgreSQL schema riêng, Meta giả lập.
- QA trình duyệt trên schema riêng: đăng nhập tài khoản giả, mở Cấu hình, bắt đầu phiên mô phỏng, xem danh sách 3 Page, Page thiếu quyền bị khóa, chọn và lưu 1 Page, thấy thời điểm kiểm tra Page thay đổi. Đã xem ảnh giao diện trên màn hình nhỏ; không có lỗi console trong lượt thử. Sau đó sửa vị trí lưu thông báo thành công để thông báo không mất khi tải lại cấu hình, build web cuối đạt. Môi trường thử tự dừng/dọn schema sau 4 phút; chưa kiểm tra lại thông báo cuối trên trình duyệt sau sửa nhỏ này.
- API/web build thành công; API tại máy đã khởi động lại bản mới. Smoke qua Caddy: trang chủ và health 200, thông tin OAuth chưa đăng nhập 401, trang kết quả callback 200. Bản web đang phục vụ chứa luồng Facebook mới.
- Chưa có đăng nhập Facebook/Meta thật, Page thật, webhook HTTPS hoặc kiểm tra xét duyệt/quyền Meta thực tế. Chưa kiểm thử chuyển hướng/cookie qua tên miền công khai. Phiên OAuth tạm chỉ hỗ trợ một tiến trình API; cần kho phiên dùng chung trước khi chạy nhiều instance.
# Bản nháp hội thoại và khôi phục lần gửi — 14/09/2026

- Frontend 16 kiểm thử đạt, gồm 5 nhóm mới: tách khách/tài khoản, khôi phục trong 24 giờ, gửi ảnh giữ chữ, gửi thất bại giữ nội dung, khóa lần gửi chưa rõ và dùng lại cùng mã, phản hồi muộn sau đăng xuất/sửa nội dung, bộ nhớ trình duyệt bị từ chối hoặc dữ liệu hỏng.
- Bộ Messenger tích hợp đạt 29 kịch bản (30 mục kể cả nhóm), PostgreSQL schema riêng và bộ gửi Meta giả. Thêm kiểm tra API tra cứu trạng thái chỉ dành cho người gửi trong phạm vi hội thoại, chặn chưa đăng nhập/sai UUID/ngoài phạm vi, không lộ lần gửi của tài khoản khác, trạng thái SENT/UNKNOWN/FAILED và SENDING quá hạn, kiểm tra không gọi thêm bộ gửi.
- Lượt đầu chuẩn bị fixture quá 60 giây; tăng thời gian chuẩn bị lên 120 giây. Có lượt sau không chạy được do PostgreSQL tại máy đã dừng; khởi động lại cluster hiện có rồi chạy lại bộ kiểm thử đạt đầy đủ. Không tạo lại database công ty hoặc thay schema.
- QA trình duyệt với fixture ca trực riêng: soạn hai khách khác nhau, đổi khách giữ đúng nội dung, thấy hai dấu Bản nháp, tải lại toàn trang vẫn khôi phục nội dung khách A; đăng xuất/đăng nhập lại không còn bản nháp. Console không có lỗi. Đã xem ảnh danh sách trên màn hình hẹp; chưa thử trực quan các trạng thái gửi lỗi hoặc mất mạng thật. Tab thử đã đóng.
- API/web build đạt. Bản web cuối bổ sung màu nhãn/bố cục thông báo, timeout gửi 30 giây và giữ mã yêu cầu khi mất phản hồi. PostgreSQL/API/Caddy đã chạy lại tại máy; trang chủ và health trả 200, API tra cứu chưa đăng nhập trả 401. Không có kết nối/gửi Meta thật, không thay đổi dữ liệu nghiệp vụ công ty. Xem CHAT-DRAFTS.md.

# Nhập Excel Sapo trực tiếp — 14/09/2026

- API 30 kiểm thử đơn vị, frontend 17, hồi quy nhập CSV 18 mục, tích hợp Excel 8 mục (7 kịch bản và nhóm) và Caddy 1 mục đều đạt. Kiểm tra quyền, giới hạn upload/ZIP, công thức và mẫu sai, ánh xạ tiêu đề, phân trang, xác nhận nguyên tử, mã kiểm tra sai, nguồn thay đổi, hết hạn, xác nhận đồng thời, giữ trường thiếu/số lượng thập phân và tiếp tục tải ảnh không trùng. Ảnh tải trong kiểm thử dùng mạng giả lập.
- Đã sửa giới hạn multipart từ 1 thành 2 phần sau khi kiểm thử phát hiện file hợp lệ bị từ chối. Route Excel qua proxy nhận tệp lớn hơn giới hạn JSON thông thường; kiểm thử Caddy xác nhận 2 MB được chuyển tiếp, 12 MB bị chặn, JSON thường vẫn giới hạn 1 MB.
- Đối chiếu chỉ đọc ba file thật trong Desktop/Sakura: 4.063 khách hàng, 11.732 đơn từ 31.662 dòng và 457 bản ghi sản phẩm/biến thể (26 sản phẩm, 431 biến thể). Tất cả được nhận diện đã có, không tạo mới và không có lỗi đối chiếu. Không nhập lại hoặc thay đổi dữ liệu nghiệp vụ công ty, không tải ảnh Sapo thật trong bước này.
- QA trình duyệt trên schema riêng: mở lần nhập từ lịch sử, xem 50/55 khách ở trang 1 và 5 khách ở trang 2, mở dữ liệu chi tiết, xác nhận nhập 55 khách giả và thấy thông báo thành công; mở lần nhập sản phẩm đã hoàn tất, thấy tiến độ ảnh 1/1 và nút tải bị khóa khi đã đủ. Console không có lỗi. Kiểm thử chọn file trên trình duyệt bị công cụ kéo dài tới khi phiên thử hết hạn, nên chưa xác nhận trực quan toàn bộ luồng upload; upload multipart đã được kiểm thử tự động qua API.
- Sau QA, đã chuyển thông báo thành công lên đầu phần xem trước, đổi nhãn sang “đã tạo” và tự cuộn tới bản xem trước khi mở lịch sử/chuyển trang. Build frontend cuối đạt; sửa bố cục nhỏ này chưa kiểm tra lại trong phiên đăng nhập trình duyệt.
- API/web đã build, bản cuối được phục vụ tại localhost:5173. Smoke trang chủ và health trả 200; xem trước/chi tiết Excel khi chưa đăng nhập trả 401. Không cần migration. Chưa kiểm chứng Docker/Nginx thực tế, Meta, R2 hoặc Drive thật. Hướng dẫn và giới hạn: EXCEL-IMPORT.md.
