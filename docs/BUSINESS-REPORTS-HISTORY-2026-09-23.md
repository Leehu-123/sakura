# Báo cáo kinh doanh và lịch sử Messenger — 23/09/2026

## Chức năng

- Tổng quan hiển thị doanh số, đơn hợp lệ/nháp/hủy, tiền đã thu/còn phải thu và khách đã liên kết; so sánh với khoảng thời gian liền trước có cùng độ dài.
- Báo cáo dùng dữ liệu Order và HistoricalOrder, lọc ngày (tối đa 366 ngày/lượt) và nguồn Sakura/Sapo; biểu đồ ngày hoặc tháng, bảng nguồn, 50 nhóm người chốt, đối chiếu trạng thái và xuất CSV.
- Ngày theo Asia/Ho_Chi_Minh, dựa trên createdAt của đơn Sakura hoặc orderedAt của đơn Sapo. Tham số SQL đổi rõ về timestamp UTC, không phụ thuộc múi giờ của PostgreSQL. Nhận diện tiếng Việt không phụ thuộc locale của PostgreSQL.
- Doanh số gồm phí giao hàng và giảm giá của đơn hợp lệ. Không phải báo cáo lợi nhuận hoặc doanh thu kế toán sau hoàn trả. Tiền đã thu là lũy kế trên các đơn được chọn, không phải dòng tiền thu trong kỳ. Trạng thái Sapo chưa xác định (ví dụ Đã lưu trữ) và khoản thu chưa biết được cảnh báo, không tự đoán.
- Quyền sales.reports.read GLOBAL xem toàn công ty; ASSIGNED chỉ xem đơn của khách đang được giao, lọc trước khi tổng hợp. Khách chưa liên kết chỉ xuất hiện trong số liệu toàn công ty.
- Cài đặt chứa Lưu trữ & sao lưu, Nhập dữ liệu Sapo, Nhật ký thao tác. Tài khoản chứa tài khoản, Vai trò & phân quyền, Danh mục công ty; vẫn giữ quyền từng trang.

## Tải lịch sử Messenger

Trong Hộp thư Messenger → Cấu hình → Fanpage → Tải lịch sử từ Facebook. Quản trị có thể tải tiếp, dừng sau đợt đang chạy hoặc quét lại.

- Conversations API và Messages API chỉ lấy phần lịch sử Meta còn cung cấp. Không bảo đảm khôi phục tin đã xóa hoặc bị hạn chế. Đã kiểm tra thực tế Fanpage kết nối trả HTTP 200 cho cả hai API, có from/to/created_time.
- Mỗi bước tải một trang tối đa 50 tin; mỗi lượt giao diện tối đa 20 bước, lưu cursor ở máy chủ để tiếp tục. Khóa theo Page tránh nhiều phiên chạy cùng lúc; cursor và dữ liệu ghi trong cùng transaction.
- Không theo URL next do Meta trả về; chỉ lấy cursor rồi gửi tới máy chủ Graph cố định. Chặn cursor lặp và phản hồi vượt giới hạn.
- remoteKey chống trùng với tin đã có; giữ nhân viên của tin đã gửi từ Sakura. Tin nhập ngoài Sakura không đoán nhân viên; ghi “Gửi từ Facebook · chưa xác định nhân viên”.
- Tin nhập không tăng số chưa đọc, không kích hoạt âm báo. Giữ thời điểm gốc, cập nhật mốc hoạt động theo giá trị lớn nhất.
- Nội dung văn bản và loại đính kèm được nhập; chưa tải lại nội dung ảnh/tệp cũ. Không gửi tin tới khách khi nhập lịch sử.
- Migration 202609230002_messenger_history_import thêm cờ imported và bảng tiến độ, bổ sung trạng thái hợp lệ cho tin đã gửi ngoài Sakura; không xóa dữ liệu.

## Kiểm tra trước triển khai

- Build database/API/worker/web đạt.
- 37 kiểm thử đơn vị, 18 kiểm thử tích hợp bán hàng, 34 kiểm thử tích hợp Messenger đạt.
- Kiểm tra báo cáo: ranh giới ngày Việt Nam, trạng thái Sapo, tiền chưa biết, phạm vi nhân viên, nguồn đơn, ngày không hợp lệ.
- Kiểm tra lịch sử: phân quyền, nhiều trang, chống trùng, khóa đồng thời, lỗi Meta giữ cursor, không âm báo/chưa đọc, không gán nhân viên giả.
- Giao diện trên trình duyệt: tổng quan, bộ lọc nguồn, báo cáo, nhóm Tài khoản/Cài đặt và chiều rộng 390px; dữ liệu mô phỏng chỉ dùng tại máy.

## Triển khai

Release: 2026-09-23T07-33-53-730Z-5396e96d. Dùng update.sh, bản sao trước migration, không thay Nginx hoặc PM2/Tomeco. Kết quả sau triển khai được ghi tiếp bên dưới.

- Cập nhật hoàn tất 14:37 giờ Việt Nam, migration thành công, HTTPS health OK.
- Báo cáo thực tế tháng 9 đến 23/09: 293 đơn, 274 đơn hợp lệ, 19 hủy, doanh số 72.350.049 VND; truy vấn mất 133ms. Cả 274 đơn thiếu thông tin số tiền đã thu trong dữ liệu nguồn, đã cảnh báo trong giao diện.
- Đợt nhập thực tế hoàn tất phần Meta trả về: quét 1 hội thoại, thêm 3 tin, tổng inboundSeq trước/sau không đổi. Không gửi tin ra Facebook.
- Kiểm tra sau triển khai: bundle mới HTTP 200; báo cáo/lịch sử không đăng nhập trả 401; backup Result=success; mã phát hành root:root 644; API và database active.
- Tomeco vẫn PID 1805366, nội dung trang chủ và hai file cấu hình Nginx giữ nguyên checksum trước/sau. Không restart/reload Tomeco hay Nginx.
