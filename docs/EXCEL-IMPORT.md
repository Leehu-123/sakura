# Nhập Excel Sapo trực tiếp

Mở **Nhập dữ liệu Sapo → Excel Sapo (.xlsx)**. Chọn lần lượt file khách hàng, sản phẩm rồi đơn hàng để đơn mới nhập có thể liên kết với khách đã có. Bấm **Kiểm tra file Excel và xem trước**, đối chiếu bản ghi mới/bỏ qua/lỗi, mở **Xem dữ liệu sẽ lưu**, đánh dấu xác nhận rồi bấm **Xác nhận nhập**.

App tự nhận diện ba mẫu đã kiểm chứng với file xuất của Sakura. Cột được tìm theo tên, không dựa vào tên file. Khách/sản phẩm có dòng tiêu đề đầu tiên; báo cáo đơn hàng có tiêu đề ở dòng 5. Sản phẩm được gom nhóm, biến thể và các dòng ảnh giữ theo mã Sapo. Đơn cũ được gom toàn bộ dòng cùng mã, không chia một đơn sang nhiều lần nhập.

## Dữ liệu và nhập lại

- Khách thiếu điện thoại được giữ trống, cảnh báo chưa phân công Sale. Không tự giao cho người nhập. Tên thiếu dùng nhãn mã Sapo.
- Đơn cũ xuất hiện trong **Đơn hàng → Sapo đã nhập**, giữ trạng thái/người tạo nguồn. Không tự suy diễn người chốt, tiền đã thanh toán, địa chỉ giao hoặc thành tiền dòng bị thiếu. Giữ số lượng lẻ và số lượng 0 trong báo cáo lịch sử.
- Đơn mới nhập chỉ liên kết hồ sơ khách bằng số điện thoại chuẩn hóa khớp chính xác. Không ghép theo tên. Các đơn đã nhập vẫn giữ liên kết hiện có.
- Mã đã có cùng dữ liệu nguồn được bỏ qua, kể cả khi đổi tên file, vị trí dòng hoặc mã băm workbook. Việc so sánh giữ các chỉnh sửa/phân công hiện tại trong Sakura.
- Nếu mã đã có nhưng dữ liệu nguồn khác, điện thoại/SKU trùng hồ sơ chưa gắn mã, hoặc dữ liệu không thể đối chiếu thì báo lỗi. Không tự cập nhật, ghi đè hoặc gộp. File tái xuất với tổng chi tiêu/trạng thái nguồn thay đổi có thể cần đối chiếu; đây chưa phải luồng đồng bộ cập nhật.
- Một lỗi chặn toàn bộ dữ liệu nghiệp vụ của lần nhập. Trước xác nhận chỉ lưu bản xem trước và nhật ký. Khi xác nhận, kiểm tra lại dữ liệu liên quan và lưu nguyên tử trong một giao dịch; xác nhận lại cùng lần nhập không tạo trùng. Nếu mất phản hồi, mở lại lần nhập trong lịch sử để kiểm tra và tiếp tục.
- Bản xem trước có hiệu lực 24 giờ. Lịch sử chứa dữ liệu nguồn và thông tin cá nhân, chỉ người có quyền nhập toàn công ty truy cập. Chưa tự dọn staging.

## Ảnh sản phẩm

Sau khi xác nhận dữ liệu sản phẩm, mục **Ảnh sản phẩm** cho biết số liên kết đã có/còn thiếu. Bấm **Tải / tiếp tục nhập ảnh** để lưu ảnh từ URL nguồn vào kho Sakura. App xử lý từng nhóm 10 liên kết, giữ ảnh đã tải và cho thử lại khi lỗi; có thể dừng sau nhóm đang xử lý. Đóng app không tiếp tục tải ngầm; mở lại lịch sử để tiếp tục.

Ảnh gắn theo mã sản phẩm/biến thể, không tải lại liên kết đã có. Chỉ chấp nhận kho Sapo Sakura `https://bizweb.dktcdn.net/100/557/101/products/`, không theo chuyển hướng. PNG/JPEG/WebP tối đa 20 MB mỗi ảnh. Chưa hỗ trợ ảnh nhúng trong ô Excel hoặc kho ảnh của cửa hàng khác. Dữ liệu sản phẩm được lưu trước; ảnh tải lỗi được báo riêng, không đảo ngược dữ liệu đã nhập.

## Giới hạn file

XLSX tối đa 10 MB, một trang tính có dữ liệu, tối đa 50.000 dòng dữ liệu/100 cột/1.500.000 ô. Giải nén tối đa 100 MB; đọc trong tiến trình worker riêng, giới hạn bộ nhớ và 60 giây, mỗi API xử lý một file Excel tại một thời điểm. File có mật khẩu, XLS cũ, công thức/lỗi ô, macro, liên kết workbook ngoài hoặc dữ liệu không đúng mẫu sẽ bị từ chối. Không thực thi công thức. Cột mã/điện thoại nên là văn bản để bảo toàn số 0 đầu và số dài.

CSV theo mẫu Sakura vẫn giữ luồng ghép cột và giới hạn riêng 200 dòng/500 KB. Không cần migration database cho bước này.

## API và vận hành

- `POST /api/v1/imports/sapo/excel/preview`: multipart với một trường file `file`.
- `GET /api/v1/imports/sapo/excel/batches/:id?page=1`: xem trước, 50 bản ghi/trang, tối đa 20 dòng hàng chi tiết mỗi đơn trong phần xem trước; nhập vẫn giữ đủ dòng.
- `POST /api/v1/imports/sapo/excel/batches/:id/commit`: `{digest}`.
- `GET /api/v1/imports/sapo/excel/batches/:id/images`: tiến độ ảnh.
- `POST /api/v1/imports/sapo/excel/batches/:id/images`: tải nhóm tiếp theo, không tự gọi khi chỉ xem trước dữ liệu.

Các API yêu cầu `core.imports.manage / GLOBAL`. Caddy/Nginx chỉ nới giới hạn tải file riêng tại endpoint Excel preview lên 11 MB gồm phần multipart, các API JSON giữ 1 MB. Xử lý workbook dùng [ExcelJS](https://github.com/exceljs/exceljs); upload dùng [FileInterceptor của NestJS](https://docs.nestjs.com/techniques/file-upload). Bộ chuyển đổi Sapo và quy tắc URL ảnh đã có trong scripts được dùng chung, cần giữ thư mục scripts trong gói triển khai (Dockerfile hiện tại đã sao chép).

Đối chiếu đọc-only ba file công ty: 4.063 khách, 457 bản ghi sản phẩm/biến thể và 11.732 đơn đều SKIP, 0 CREATE/ERROR. Không nhập lại hoặc sửa dữ liệu công ty trong kiểm thử. Tải ảnh mới ở luồng này được kiểm thử bằng ảnh/HTTP giả; chưa tải thêm từ Sapo thật.
