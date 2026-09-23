# Nhóm phụ trách Fanpage và ca trực

Mở **Hộp thư Messenger → Ca trực**. Bản này phục vụ nhận việc và bàn giao thủ công; chưa tự xếp lịch theo giờ hoặc tự chia lượt.

## Quản trị thiết lập nhóm

1. Bấm **Thêm nhóm**, đặt tên theo vị trí/nhóm làm việc, ví dụ Tư vấn bán hàng.
2. Chọn nhân viên và các Fanpage phụ trách, rồi lưu. Mỗi Fanpage thuộc một nhóm; một nhóm có nhiều người và nhiều Fanpage. Một nhân viên có thể thuộc nhiều nhóm nhưng chỉ có một ca đang mở tại một thời điểm.
3. Nếu chưa có Fanpage, tạo nhóm trước. Sau khi thêm Page trong **Cấu hình → Kết nối Fanpage**, quay lại nhóm để chọn Page đó.

Chỉ người có `core.messenger.manage` GLOBAL quản lý nhóm hoặc kết thúc ca của người khác. Thành viên phải đang hoạt động và có quyền sử dụng hội thoại. Chưa tự tạo nhóm/phân công nhân sự trên dữ liệu công ty vì chưa có danh sách phân nhóm thực tế.

**Lưu ý phạm vi:** Thành viên có quyền chat được xem hội thoại của các Page thuộc nhóm đang hoạt động, kể cả khách chưa gắn hồ sơ; người ngoài nhóm chỉ xem được nếu có quyền chat GLOBAL. Quyền xem/sửa hồ sơ khách, tạo/chốt đơn vẫn theo vai trò và phân công khách riêng. Nhóm không tự cấp quyền truy cập toàn bộ dữ liệu khách hàng/đơn hàng. Nhân viên ngoài ca vẫn có thể đọc hội thoại trong nhóm, nhưng phải bắt đầu ca và nhận việc mới được gửi.

Gán Page vào nhóm đưa hội thoại hiện có của Page về hàng chờ, thay phân hỗ trợ cũ bằng quy trình theo ca; không đổi người phụ trách khách/người chốt đơn. Khi nhóm có ca chưa kết thúc, cần kết thúc các ca trước khi sửa nhóm. Page có tin đang gửi/chưa rõ kết quả phải được đối chiếu trước khi đổi nhóm. Tắt nhóm giữ dữ liệu, hạn chế truy cập của thành viên; quản trị có quyền chat toàn công ty vẫn xem được. Page chưa gán nhóm tiếp tục dùng quy trình phân hỗ trợ trước đây.

## Nhân viên làm việc

1. Đăng nhập tài khoản Sakura riêng. Vào **Ca trực**, chọn nhóm, nhập tên ca và bấm **Bắt đầu ca**.
2. Vào **Hội thoại → Chờ nhận**, mở hội thoại và bấm **Nhận xử lý**. Chỉ một người nhận thành công nếu hai người bấm cùng lúc.
3. Người đang nhận hội thoại có thể trả lời khi kết nối Meta/cửa sổ gửi cho phép. Tên tài khoản và ca được gắn vào từng tin gửi từ Sakura. Đồng nghiệp đang đọc cùng hội thoại không tự có quyền gửi thay.
4. Khi cần đổi người, bấm **Bàn giao**, chọn đồng nghiệp đang trực cùng nhóm và ghi chú. Người cũ mất quyền gửi trong hội thoại; người nhận tiếp tục công việc. Đây là bàn giao trực tiếp, chưa có bước người nhận chấp nhận riêng.
5. Bấm **Hoàn tất xử lý** khi việc đã xong. Hội thoại rời hàng chờ; một tin khách mới hơn tin đến gần nhất sẽ đưa hội thoại về hàng chờ. Webhook lặp không mở lại. Nếu khách nhắn thêm sau phiên bản đang xem, làm mới trước khi hoàn tất.
6. Cần nhường việc chưa xong: **Trả về hàng chờ** kèm ghi chú. Quản trị có thể **Tiếp quản**, nhưng vẫn phải là thành viên và đang có ca trong nhóm trước khi nhận/gửi.

## Kết thúc ca và tra cứu

Trong **Ca trực**, bấm **Kết thúc ca của tôi**, ghi chú và xác nhận. Mọi hội thoại còn nhận trong ca được trả về hàng chờ; những việc đã hoàn tất giữ trạng thái hoàn tất. Chưa tự phân cho người khác khi hết ca. Ca chưa kết thúc không tự đóng khi người dùng đóng trình duyệt; quản trị có thể kết thúc ca bị bỏ quên.

Tin đang gửi hoặc chưa rõ kết quả chặn đổi người/kết thúc ca cho đến khi đối chiếu. Không tự gửi lại tin. Mỗi lần nhận, bàn giao, trả việc, hoàn tất và kết thúc ca đều có nhật ký người thao tác/thời gian/ghi chú. Khung hội thoại hiển thị 20 sự kiện gần nhất; nhật ký cũ vẫn được lưu trong Nhật ký thao tác.

Tên người gửi và thời gian hiển thị ngay dưới từng tin trong hội thoại; rê chuột lên ghi chú để xem tên ca nếu có. Không có trang lịch sử riêng. Ca vẫn được lưu cùng tin; tin trước khi có tính năng này không được tự gán ca. Tên ca không sửa sau khi bắt đầu; tên nhân viên/nhóm là tên hiện tại của tài khoản/nhóm.

Hội thoại, người nhận và ca của đồng nghiệp tự cập nhật khi đang mở app; vẫn có thể bấm **Làm mới**. Bản nháp đang soạn được giữ qua lần cập nhật, còn người vừa hết ca/bàn giao sẽ mất quyền gửi. Máy chủ vẫn kiểm tra người nhận, phiên bản và ca tại thời điểm thao tác. Xem [hướng dẫn tự cập nhật](LIVE-CHAT-UPDATES.md). Chưa có thông báo đẩy khi đóng app.

## Triển khai và kiểm thử

Áp dụng migration `202609130003_chat_shifts`, sinh lại Prisma Client, build và khởi động lại API. Backup trước cập nhật tại máy: `.local/backups/2026-09-13T11-41-21-107Z-6f7b30a1`.

Kiểm thử dùng schema riêng và bộ gửi Meta giả. Đã thử giao diện bằng tài khoản giả tại địa chỉ loopback riêng: đăng nhập, bắt đầu ca, hàng chờ, nhận xử lý và kết thúc ca; không gửi tin khách thật hoặc thay đổi tài khoản thật. Môi trường thử đã dọn.

Đã bổ sung [đăng nhập Facebook để quản trị viên kết nối Page](FACEBOOK-LOGIN.md), kiểm thử bằng giả lập và chờ HTTPS/Meta thật. Chưa triển khai lịch ca tự động, phân tải tự động, báo cáo hiệu suất theo ca hoặc đồng bộ người trả lời trực tiếp trong Business Suite.
