# Sakura Social — bán hàng trong hội thoại

Triển khai cục bộ ngày 08/09/2026, dựa trên hai ảnh tham khảo Sapo. Giữ logo Sakura dùng chung.

## Chức năng đã triển khai

- Menu Hội thoại / Đơn hàng / Cấu hình. Admin quản lý Fanpage ngay tại Cấu hình → Kết nối Fanpage. Trên desktop rộng có thanh lọc, danh sách hội thoại, chat và hồ sơ bên phải; trên màn hình nhỏ hồ sơ nằm dưới chat.
- Bộ lọc trước phân trang: chưa đọc, chưa trả lời, tôi hỗ trợ, chưa phân công, chưa gắn khách, có đơn đã chốt, đã chặn; kết hợp Page, nhãn và tìm kiếm. Tất cả là các hội thoại chưa chặn trong phạm vi.
- Thanh chat có phân người hỗ trợ, chặn/bỏ chặn nội bộ, đánh dấu chưa đọc và lọc tin đến/tin trả lời/ảnh/xác nhận đơn.
- Khi mở trang tin mới nhất ở chế độ tất cả, đánh dấu đã đọc riêng cho người đang xem. Tin đến sau bản đang xem không bị đánh dấu đã đọc. Chưa trả lời chỉ hết khi có tin gửi thành công từ Sakura sau tin đến gần nhất; tin ngoài Business Suite chưa đồng bộ.
- Hồ sơ khách bên phải: xem/sửa tên, điện thoại, địa chỉ, chủ chăm sóc, ghi chú; xem đơn theo quyền, thu tiền/chốt/hủy trong chi tiết đơn.
- Thư viện ảnh sản phẩm/biến thể: quản trị sản phẩm thêm PNG/JPEG tối đa 500 KB; người có quyền xem bảng giá tìm/chọn/xem trước rồi bấm gửi ảnh. Ảnh gửi riêng với văn bản. Tệp chỉ kiểm tra định dạng base64, chữ ký PNG/JPEG và kích thước, chưa có xử lý ảnh/quét tệp chuyên dụng.
- Tạo đơn từ khách đã gắn hội thoại; chọn “Khách đã đồng ý — lưu và chốt đơn” nếu cần chốt ngay. Đơn nháp vẫn được hỗ trợ. Máy chủ kiểm tra giá, phiên bản hồ sơ, địa chỉ, quyền và trạng thái chặn; lưu người chốt từ phiên đăng nhập. Chốt và tạo cùng một giao dịch, chống tạo trùng.
- Từ đơn đã chốt, mở Xác nhận gửi khách, kiểm tra bản xem trước rồi gửi. Nội dung là tin văn bản Messenger, tối đa 2.000 ký tự; trong Sakura được nhận diện là xác nhận đơn. Không cam kết hình thức thẻ giống Sapo. Đơn dài hơn giới hạn bị từ chối, cần soạn nội dung ngắn trong ô chat. Chưa hỗ trợ receipt template hoặc gửi hóa đơn điện tử.
- Xác nhận lưu ID đơn, phiên bản và nội dung tại lần gửi. Bản xem trước cũ, đơn khác khách hoặc đơn hủy không được gửi. Trạng thái gửi chưa rõ phải đối chiếu; không tự gửi lại.
- Phiếu giao nội bộ lấy dữ liệu từ đơn đã chốt. Mỗi đơn có một phiếu; mở lại không tạo bản trùng. Đơn thay đổi thì cập nhật phiếu, tăng số lần phát hành và giữ bản trước trong dữ liệu. Trước in kiểm tra lại quyền, phiên bản và trạng thái; đơn hủy làm phiếu mất hiệu lực. In không đổi trạng thái giao hàng.

## Cách dùng

1. Vào Hộp thư Messenger, chọn Fanpage hoặc tất cả Page.
2. Với hội thoại chưa gắn khách, Sale tổng/Admin đối chiếu hồ sơ rồi gắn. Khách mới tạo trong mục Khách hàng trước.
3. Phân hỗ trợ, ghi nhận điện thoại/địa chỉ và ghi chú ở bên phải.
4. Dùng thư viện ảnh hoặc mẫu trả lời để soạn; chỉ gửi sau khi bấm nút gửi.
5. Khách đồng ý mua: Tạo đơn từ hội thoại → chọn sản phẩm/số lượng/phí/giảm giá → tích xác nhận khách đã đồng ý → Lưu và chốt đơn.
6. Trong thẻ đơn bên phải, bấm Xác nhận gửi khách → kiểm tra nội dung → Gửi xác nhận.
7. Bấm Phiếu giao hàng → Tạo/cập nhật phiếu → kiểm tra và in. Nếu đơn đã thay đổi, đóng phiếu và làm mới hội thoại trước khi mở lại.

## Cấu hình Fanpage

Làm việc nhiều nhân sự theo ca: quản trị mở **Ca trực** để tạo nhóm/chọn Page/thành viên; nhân viên bắt đầu ca rồi nhận/bàn giao hội thoại. Xem [hướng dẫn ca trực](CHAT-SHIFTS.md). Với Page đã gán nhóm, quy trình này thay nút phân hỗ trợ cũ và cho phép thành viên xem chat trong nhóm.

Xem người trả lời ngay trong hội thoại: tên người gửi và thời gian nằm dưới từng tin gửi từ Sakura. Không có trang lịch sử riêng. Xem [hướng dẫn người gửi](REPLY-HISTORY.md).

Admin mở **Cấu hình → Kết nối Fanpage** để lưu ứng dụng Meta chung, thêm/sửa tối đa 50 Page, kiểm tra token, đăng ký sự kiện messages và bật/tắt nhận/gửi. Khóa đã lưu không được trả lại giao diện. Xem [hướng dẫn thêm Fanpage](FANPAGE-CONFIGURATION.md).

Trước lần lưu đầu trong app, MESSENGER_PAGES_JSON và các biến môi trường cũ vẫn được hỗ trợ. Sau lần lưu đầu, cấu hình database có hiệu lực; công tắc chung và từng Page được quản lý trên giao diện. Bộ chọn Page chỉ lọc danh sách; máy chủ gửi bằng Page/PSID của hội thoại. Nút kiểm tra token thủ công chỉ xác minh đúng Page. Luồng [đăng nhập Facebook](FACEBOOK-LOGIN.md) mới kiểm tra thêm ứng dụng cấp/quyền/hạn token trước khi lưu Page đã chọn. Chưa kiểm thử kết nối Meta thật.

Ảnh được upload multipart lên Attachment Upload API bằng token của Page, rồi gửi attachment_id. Upload tối đa 10 giây; gửi tối đa 15 giây. Nếu upload thất bại, chưa gọi Send API; nếu đã gọi Send API nhưng kết quả không rõ, yêu cầu đối chiếu như tin văn bản. Tham khảo [collection chính thức của Meta](https://raw.githubusercontent.com/fbsamples/messenger-platform-samples/main/postman/messenger-platform-api.postman_collection.json).

## Quyền và giới hạn

Phân hỗ trợ chỉ chọn người đang hoạt động đã có quyền xem hội thoại. Không đổi CustomerAssignment hoặc người chốt. Chặn là chặn trong Sakura, không chặn Facebook. Gửi xác nhận cần cả quyền hội thoại và quyền xem đúng đơn. Tạo phiếu cần sales.shipments.manage trên khách; đọc/in cần sales.orders.read. Đơn Sapo cũ vẫn chỉ tra cứu, không lập phiếu vận hành.

Thư viện hiện lưu ảnh nhỏ trong PostgreSQL; cần chuyển sang kho tệp nếu số lượng lớn. Không tải ảnh từ URL khách gửi. Chưa đồng bộ lịch sử, avatar, tin gửi từ Business Suite, delivery/read receipts hoặc cập nhật giao diện theo thời gian thực; dùng Làm mới. Chưa có kết nối hãng vận chuyển, mã vận đơn, theo dõi giao hàng hoặc hoàn/đổi trả.

Bản này chưa kiểm thử trực tiếp Fanpage, thao tác trình duyệt/in giấy hoặc Docker/VPS. Chưa có thông tin kết nối thực tế của Sakura; mặc định nhận/gửi ngoài vẫn tắt.
