# Nhập dữ liệu Sapo

Từ 14/09/2026 đã có **Excel Sapo (.xlsx)** trên giao diện, tự nhận diện ba mẫu file gốc và tiếp tục nhập ảnh sản phẩm. Xem [hướng dẫn Excel trực tiếp](EXCEL-IMPORT.md). Phần CSV bên dưới vẫn áp dụng riêng cho mẫu CSV.

Đã nhập và kiểm thử ba file Excel xuất thật của Sakura ngày 09/09/2026: 4.063 khách, 26 sản phẩm/431 biến thể và 11.732 đơn lịch sử. Xem [kết quả nhập và cách tra cứu](SAPO-IMPORT-2026-09-09.md). Lần nhập Excel này dùng bộ chuyển đổi riêng, giữ được trường thiếu và thông tin gốc.

Hướng dẫn dưới đây dành cho bộ nhập **CSV** trên giao diện, theo ba loại khách hàng, sản phẩm/biến thể và đơn lịch sử. Quy trình có ghép cột, xem trước, lỗi/cảnh báo, xác nhận và lịch sử lần nhập; các giới hạn và yêu cầu cột dưới đây áp dụng riêng cho CSV.

Cập nhật: đơn Sapo đã được đưa vào **Đơn hàng**, lọc nguồn **Sapo đã nhập**; ảnh đã lưu tại kho tệp Sakura. [Chi tiết và phương án dung lượng](STORAGE-PLAN-2026-09-09.md).

## Cách sử dụng

1. Tạo tài khoản Sale, gán quyền xem/chăm sóc khách và kiểm tra email.
2. Mở **Nhập dữ liệu Sapo** bằng tài khoản có quyền `core.imports.manage / GLOBAL` (mặc định chỉ Admin).
3. Tải mẫu CSV và hướng dẫn trên màn hình. Chuẩn bị dữ liệu theo hướng dẫn.
4. Nhập khách trước, sau đó sản phẩm và đơn cũ. Chọn cột nguồn; xem trước và mở dữ liệu chuẩn hóa từng bản ghi.
5. Sửa hết lỗi, đối chiếu cả cảnh báo và dòng bỏ qua rồi xác nhận.
6. Xem kết quả trong Khách hàng, Sản phẩm và Đơn cũ Sapo; đối chiếu với nguồn.

Chi tiết cột và định dạng: [hướng dẫn tải cùng mẫu](../apps/sale-web/public/import-templates/HUONG-DAN.txt).

## Quy tắc dữ liệu

- CSV UTF-8, phân cách phẩy/chấm phẩy/tab; có xử lý ô có ngoặc kép, dấu phân cách và xuống dòng bên trong. Không thực thi công thức.
- Tối đa 200 dòng, 60 cột, 500 KB mỗi file. XLS/XLSX phải xuất CSV trước. Một đơn không được chia qua nhiều lô.
- Khách mới nhập phải có mã Sapo, tên, số Việt Nam hợp lệ và email Sale hợp lệ. Khu vực không cấp quyền. Phân loại mặc định Khách cũ.
- SKU và điện thoại trùng dữ liệu có sẵn chưa liên kết sẽ báo lỗi; chưa có giao diện đối chiếu/gộp hoặc tự liên kết.
- Mã Sapo duy nhất trong từng loại, cho một cửa hàng. Nhập lại nội dung giống bỏ qua; nội dung khác báo lỗi. Không ghi đè giá, hồ sơ hoặc phân công đang sử dụng.
- Người chốt và mọi trạng thái đơn cũ giữ nguyên văn bản nguồn. Người chốt thiếu được cảnh báo và để trống; không tự gán cho người nhập hoặc Sale hiện tại.
- Tiền lịch sử phải khớp từng dòng và tổng đơn; số nguyên VND. Giảm giá dòng, thuế, số âm, hoàn/đổi hoặc thu vượt tổng cần đối chiếu trước.
- Đơn cũ lưu trong HistoricalOrder độc lập với đơn vận hành; chỉ có API GET và không gọi worker, chat hay carrier.
- Quyền xem đơn cũ đi qua cùng điều kiện khách đang được giao như đơn mới. Bàn giao làm thay đổi quyền xem ngay, không sửa người chốt lịch sử.

## Tính nhất quán

Xem trước chỉ tạo ImportBatch và audit, chưa thêm bản ghi kinh doanh. Các dòng nguồn và kế hoạch được lưu phía máy chủ; xác nhận chỉ nhận ID lần nhập và chữ ký nội dung. Chữ ký sắp xếp khóa object trước khi băm để không phụ thuộc thứ tự JSONB.

Khi xác nhận, hệ thống kiểm tra lại toàn bộ file và dữ liệu liên quan trong transaction Serializable, đối chiếu kế hoạch đã xem, rồi tạo dữ liệu, mã nguồn và trạng thái lần nhập cùng một transaction. Một lỗi hoặc xung đột rollback toàn bộ. Cùng mã nguồn được bảo vệ thêm bằng unique constraint. Xác nhận lại lần đã hoàn tất trả kết quả cũ; gửi lại bằng lần mới bỏ qua bản ghi đã có.

Bản xem trước hết hạn sau 24 giờ. Lịch sử bản kiểm tra vẫn được lưu; chưa có dọn/xóa dữ liệu staging. Quyền nhập cho phép xem và xác nhận mọi lần nhập trong công ty; người thực hiện xác nhận được ghi audit riêng. Lịch sử chứa dữ liệu cá nhân, cần bảo vệ cùng bản sao lưu cơ sở dữ liệu.

## API

- GET /api/v1/imports/sapo/fields
- POST /api/v1/imports/sapo/inspect — content CSV
- POST /api/v1/imports/sapo/preview — kind, fileName, content, mapping
- GET /api/v1/imports/sapo/batches?page=1
- GET /api/v1/imports/sapo/batches/:id
- POST /api/v1/imports/sapo/batches/:id/commit — digest
- GET /api/v1/sales/historical-orders?page=1&search=...&customerId=...
- GET /api/v1/sales/historical-orders/:id

## Giới hạn

Chưa kết nối API Sapo, chưa đồng bộ tự động, chưa hỗ trợ nhiều cửa hàng, chưa nhập vận đơn như tác vụ giao hàng, chưa quy đổi trạng thái nguồn cho báo cáo tổng hợp. Người chốt nguồn được giữ bằng văn bản, chưa ánh xạ sang tài khoản/nhân viên để báo cáo. Chưa kiểm thử giao diện bằng thao tác trình duyệt hoặc chạy Docker/VPS.
