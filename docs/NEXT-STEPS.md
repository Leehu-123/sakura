# Bước tiếp theo của Sakura

Đã có Core, khách/bàn giao, danh mục, đơn vận hành, nhập dữ liệu Sapo thật, ảnh sản phẩm, danh sách đơn chung và hộp thư Messenger có kiểm soát. Đã bổ sung kho ảnh riêng, đo dung lượng, sao lưu database + ảnh và thử phục hồi thành công trên máy này.

## Ưu tiên tiếp theo

Ngày 14/09: đã thêm [bản nháp theo tài khoản/hội thoại](CHAT-DRAFTS.md), khôi phục khi đổi menu/tải lại cùng tab, dấu Bản nháp trong danh sách và kiểm tra lần gửi mất phản hồi trước khi thử lại. Gửi ảnh giữ phần chữ chưa gửi. Đã bổ sung [nhập XLSX trực tiếp](EXCEL-IMPORT.md) với xem trước, chống trùng và tiếp tục tải ảnh. Bước vận hành tiếp theo vẫn là cấu hình nhóm/nhân sự thật và kiểm chứng HTTPS/Meta khi có thông tin kết nối.

Đã có ghi chú người gửi dưới từng tin nhắn, nhóm phụ trách Fanpage, bắt đầu/kết thúc ca, hàng chờ, nhận việc, hoàn tất và tiếp quản/bàn giao hội thoại. Trang lịch sử riêng đã được bỏ theo yêu cầu. Hội thoại, người nhận và ca trực đã tự cập nhật, giữ bản nháp trong hội thoại đang mở và báo tin mới khi xem trang cũ. Xem [hướng dẫn ca trực](CHAT-SHIFTS.md) và [tự cập nhật](LIVE-CHAT-UPDATES.md). Đã bổ sung [đăng nhập Facebook để chọn Fanpage](FACEBOOK-LOGIN.md), kiểm thử bằng giả lập; nhân viên vẫn dùng tài khoản Sakura riêng. Tiếp theo cần HTTPS/cấu hình Meta thật để kiểm chứng đăng nhập/nhận/gửi, thiết lập nhóm/nhân sự thật và mở rộng lịch ca/phân tải nếu cần. Bản HTTP tại máy cho phép cấu hình trước, chưa mở đăng nhập Facebook thật.

1. Đã chọn Drive lưu database, R2 lưu ảnh và Drive giữ ảnh dự phòng. Đã chuẩn bị cấu hình/mã hóa/kiểm thử tại máy; theo yêu cầu sẽ kết nối tài khoản sau. Tiếp theo xác thực tài khoản/kho, giữ khóa phục hồi riêng, kiểm thử tải lên–tải về thật, rồi mới bật lịch/cảnh báo/chính sách giữ 30 ngày. Xem DRIVE-R2-BACKUP.md. Chưa tự xóa dữ liệu.
2. Đã chuẩn bị bộ triển khai riêng, Docker/Caddy/HTTPS, kiểm tra cấu hình và đóng gói source; app dùng bản dựng tại máy. Chờ VPS/tên miền để kiểm chứng Docker và diễn tập chuyển database/ảnh. Chưa tự chuyển dữ liệu hoặc đưa app lên mạng. Xem LOCAL-DEPLOYMENT.md.
3. Bổ sung đơn Sapo từ 06/2025 đến 13/01/2026 nếu cần phân tích đầy đủ; đối chiếu 5.622 đơn chưa liên kết, bổ sung điện thoại cho 405 khách và bảng phân công Sale. Không tự ghép khách theo tên.
4. Đã có nhập XLSX trực tiếp, xem trước/phân trang, xác nhận nguyên tử và tiếp tục tải ảnh theo mẫu Sapo thật; xem EXCEL-IMPORT.md. Bước tiếp theo là màn hình đối chiếu các mã có dữ liệu thay đổi và đơn chưa liên kết; không tự gộp/ghi đè hồ sơ đang dùng.
5. Kết nối ứng dụng Meta/Fanpage thật, webhook HTTPS và kiểm thử nhận/gửi được cho phép. Nhận/gửi mặc định tắt khi chưa có cấu hình. Xem MESSENGER.md.
6. Kết nối VNPost/đơn vị vận chuyển, đối soát COD; báo cáo bán hàng, tồn kho, chỉnh sửa đơn và hoàn/đổi theo quy trình công ty.

## Thông tin cần cho các bước phụ thuộc

- Vị trí/kho sao lưu ngoài máy, VPS, tên miền và cách truy cập.
- File đơn còn thiếu và bảng phân công khách cho Sale.
- Cấu hình Meta/Fanpage, quyền ứng dụng và tài liệu/tài khoản hãng vận chuyển.

Ảnh đã nhập đủ 26 sản phẩm; 424 biến thể có ảnh riêng trong nguồn. Dữ liệu đơn Sapo xuất hiện ngay trong Đơn hàng và giữ trạng thái lịch sử. Các app Sakura tiếp tục dùng logo chung từ @sakura/brand/logo.jpg.
