# Hội thoại tự cập nhật

Hộp thư, trạng thái nhận việc và màn hình Ca trực tự tải thay đổi khi bạn đang mở Sakura. Bình thường app kiểm tra khoảng 5 giây sau mỗi lần tải xong. Vẫn có thể bấm **Làm mới** để kiểm tra ngay.

## Khi làm việc

- Ở cuối trang tin mới nhất, tin mới xuất hiện và khung tin cuộn theo. Tên người gửi vẫn nằm dưới từng tin trả lời.
- Nếu đang cuộn lên, xem trang cũ hoặc lọc tương tác, nội dung đang đọc được giữ nguyên. Khi có tin mới, bấm **Có tin mới · Xem tin mới nhất** để về trang đầu với tất cả tương tác.
- Tin mới chưa được mở trong các trường hợp trên không tự đánh dấu đã đọc. Trạng thái chưa đọc là riêng từng tài khoản.
- Nội dung đang soạn và ảnh đang chọn được giữ khi tự cập nhật, đổi hội thoại/menu và tải lại trang trong cùng tab. Bản nháp riêng từng tài khoản, xóa khi đăng xuất; xem [bản nháp và khôi phục lần gửi](CHAT-DRAFTS.md) để biết giới hạn lưu và xử lý gửi lỗi.
- Danh sách hội thoại cập nhật người đang hỗ trợ; khung nhận việc và quyền gửi cập nhật khi đồng nghiệp nhận/bàn giao/kết thúc ca. Máy chủ luôn kiểm tra quyền tại thời điểm gửi, dù màn hình chưa kịp cập nhật.
- Khi đang mở biểu mẫu chỉnh sửa/xác nhận, phần dữ liệu liên quan tạm dừng cập nhật để giữ nội dung và phiên bản đang thao tác. Nếu có thay đổi từ người khác, máy chủ có thể yêu cầu tải lại trước khi lưu.

## Kết nối và giới hạn

Nhãn **Đang tự cập nhật** cho biết app đang kiểm tra thay đổi. Rê chuột để xem thời điểm cập nhật gần nhất. Khi không tải được, Sakura giữ dữ liệu đã tải, báo lỗi và tạm khóa nút gửi trong hội thoại. Lỗi tạm thời được thử lại sau 10, 20 rồi tối đa 30 giây; yêu cầu tải quá 20 giây được hủy để thử lại. Nếu máy chủ báo hết quyền hoặc không còn hội thoại, dữ liệu tương ứng được bỏ khỏi màn hình; cần làm mới sau khi quyền được khôi phục.

App tạm dừng khi tab bị ẩn hoặc trình duyệt báo mất mạng và kiểm tra lại khi quay lại/có mạng. Đây là cập nhật định kỳ trong app, chưa phải thông báo đẩy khi đóng trình duyệt. Bản nháp không đồng bộ giữa máy hoặc tab.

Không cần thay đổi database hay kết nối thêm dịch vụ cho bước này. Meta/Fanpage thật vẫn cần được cấu hình và kết nối riêng. Chưa đo tải khi nhiều nhân viên cùng làm việc; cần kiểm tra tải trước khi triển khai quy mô lớn.
