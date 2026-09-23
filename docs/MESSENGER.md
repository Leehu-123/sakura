# Messenger — hộp thư và kết nối Fanpage

Bản bổ sung bố cục Sapo, ảnh sản phẩm, chốt đơn trong chat, xác nhận đơn và phiếu giao: xem [Sakura Social](SOCIAL-WORKSPACE-GUIDE.md).

## Đã có

- Hộp thư phân trang, tìm theo tên khách, PSID hoặc nhãn; xem lịch sử tin và làm mới thủ công.
- Nhận tin văn bản/tín hiệu có tệp từ các Fanpage đã cấu hình. Tệp chỉ hiển thị thông báo, chưa tải hoặc mở trong Sakura.
- Hội thoại nhận diện theo Page ID + PSID. Hội thoại chưa gắn khách chỉ người có sales.chat.use GLOBAL xem được.
- Gắn khách qua bước xác nhận của Sale tổng/Admin; không tự nhận diện/gộp khách theo số trong tin.
- Sale vùng chỉ đọc/gửi/sửa nhãn trên hội thoại của khách đang được giao. Bàn giao khách làm đổi quyền ngay.
- Nhãn tối đa 10, mỗi nhãn 30 ký tự; sửa có kiểm tra phiên bản.
- Mẫu trả lời dùng chung: chọn mẫu để chỉnh sửa trong ô soạn, sau đó bấm Gửi. Admin thêm/sửa/tắt/khôi phục mẫu; hiện hiển thị tối đa 100 mẫu.
- Gợi ý số Việt Nam và dòng địa chỉ có nhãn “Địa chỉ:”/“DC:”. Đây là gợi ý theo quy tắc từ trang tin đang xem. Người có quyền xem/chăm sóc khách phải đối chiếu và bấm xác nhận trước khi cập nhật hồ sơ.
- Bộ gửi văn bản có kiểm tra cấu hình, phạm vi khách và cửa sổ trả lời; gửi qua Messenger Send API. Không có trả lời tự động.

Logo vẫn dùng từ @sakura/brand/logo.jpg.

## Cách sử dụng

1. Mở **Hộp thư Messenger**. Khi chưa cấu hình, màn hình thông báo chưa kết nối; vẫn có thể chuẩn bị mẫu trả lời bằng tài khoản Admin.
2. Sale tổng chọn bộ lọc **Chưa gắn khách**, đối chiếu và gắn hồ sơ đúng. Nếu là khách mới, tạo ở mục Khách hàng rồi quay lại.
3. Sale phụ trách mở hội thoại, thêm nhãn, chọn mẫu hoặc soạn nội dung và bấm **Gửi tin nhắn**.
4. Nhấn **Làm mới** để nhận nội dung mới; chưa có thông báo đẩy hoặc đồng bộ giao diện theo thời gian thực.
5. Tin có điện thoại/địa chỉ sẽ hiện gợi ý. Mở gợi ý để so sánh thông tin đang lưu và xác nhận thay đổi.

“Đã gửi tới Meta” thể hiện API đã nhận yêu cầu và trả ID tin; chưa xác nhận khách đã nhận/đọc.

## Cấu hình Fanpage trong app

Admin mở **Hộp thư Messenger → Cấu hình → Kết nối Fanpage** để lưu ứng dụng Meta, thêm/sửa Fanpage, kiểm tra token, đăng ký nhận tin và bật/tắt nhận/gửi. Xem [hướng dẫn từng bước](FANPAGE-CONFIGURATION.md). Cấu hình đã lưu có hiệu lực ngay, các khóa được mã hóa trong database. Đã bổ sung [đăng nhập Facebook để chọn Page](FACEBOOK-LOGIN.md); bản HTTP tại máy chỉ chuẩn bị cấu hình, chưa kết nối Meta thật.

## Cấu hình máy chủ cũ (trước lần lưu đầu trong app)

Mặc định cả nhận và gửi đều tắt. Các biến dưới chỉ được dùng khi chưa có cấu hình trong database. Không gửi token/App Secret qua hội thoại. Khi dùng giao diện quản trị, nhập trực tiếp vào ô khóa; không đưa giá trị bí mật vào mã frontend.

| Biến | Nội dung |
| --- | --- |
| MESSENGER_ENABLED | true để bật nhận webhook sau khi có cấu hình |
| MESSENGER_CONFIG_KEY | Khóa 32 byte dạng 64 ký tự hex để mã hóa cấu hình trong app; giữ riêng khi sao lưu/chuyển máy |
| MESSENGER_SEND_ENABLED | true để cho phép người dùng gửi tin |
| MESSENGER_PAGE_ID | ID số của Fanpage |
| MESSENGER_APP_SECRET | App Secret của ứng dụng Meta |
| MESSENGER_VERIFY_TOKEN | Chuỗi ngẫu nhiên riêng cho xác minh webhook, ít nhất 24 ký tự |
| MESSENGER_PAGE_ACCESS_TOKEN | Page access token, chỉ dùng phía máy chủ |
| MESSENGER_GRAPH_VERSION | Phiên bản Graph API còn hỗ trợ cho ứng dụng, dạng vN.0; không có mặc định |

Quyền pages_messaging và Page access token là điều kiện của Send API. Bộ gửi hiện chỉ áp dụng phản hồi tiêu chuẩn trong 24 giờ từ tin khách gần nhất. Xem [tài liệu API của Meta](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api?entity=request-22794852-2e906fea-77ff-479d-be31-0ae6063596f1).

Triển khai API sau reverse proxy HTTPS. Callback là:

    https://TEN-MIEN-CUA-BAN/api/v1/messenger/webhook

Đăng ký callback và verify token trong ứng dụng Meta, gắn ứng dụng với đúng Page và đăng ký sự kiện messages. Hoàn tất cấu hình/quyền truy cập và xét duyệt cần thiết trong Meta cho môi trường vận hành thực. Nguồn triển khai: [bộ mẫu Messenger chính thức](https://github.com/fbsamples/messenger-platform-samples) và [collection Send API](https://raw.githubusercontent.com/fbsamples/messenger-platform-samples/main/postman/messenger-platform-api.postman_collection.json).

Bật nhận trước, khởi động lại API, kiểm tra handshake và tin đến từ tài khoản kiểm thử được phép. Chỉ bật gửi sau khi xác minh Page/PSID, quyền và cửa sổ trả lời. Hộp thư chỉ báo “đã cấu hình”; điều đó chưa chứng minh Meta đã đăng ký webhook hoặc token còn hợp lệ.

Chưa có Page ID/token/App Secret/HTTPS của Sakura trong lần triển khai này. Không đăng ký webhook hoặc gửi tin thật trong quá trình kiểm thử.

## Xử lý tin nhận và chống lặp

Webhook GET kiểm tra mode + verify token rồi trả challenge dạng text/plain. POST kiểm tra X-Hub-Signature-256 bằng HMAC-SHA256 trên byte body gốc, so sánh thời gian cố định trước khi ghi cơ sở dữ liệu.

Chỉ nhận Page ID đã cấu hình và sự kiện messages có sender/recipient/mid/timestamp hợp lệ. Tối đa 1 MB request, 100 entry/200 sự kiện được duyệt; text tối đa 10.000 ký tự và 20 loại tệp/sự kiện. Text quá dài được cắt tại giới hạn. Sự kiện echo, delivery/read, postback và Page khác hiện được bỏ qua, không làm mở rộng cửa sổ trả lời.

Mã tin nguồn được bảo vệ bằng unique Page ID + mid. Khóa transaction theo Page/PSID giúp xử lý webhook trùng/đồng thời. HTTP 200 chỉ trả sau transaction ghi xong; lỗi cơ sở dữ liệu không được xác nhận thành công. Sự kiện cũ không làm lùi thời điểm tin đến gần nhất.

Không tải URL tệp từ webhook. Chưa có đồng bộ lịch sử trước khi kết nối, avatar/tên từ Meta hoặc tin trả lời gửi trực tiếp bằng Business Suite. Hộp thư hiện hiển thị tin nhận qua webhook và tin gửi từ Sakura.

## Gửi và kết quả chưa rõ

Mỗi lần bấm gửi có requestKey. Máy chủ lưu SENDING và audit trong transaction trước khi gọi Meta. Gửi lại cùng khóa/nội dung trả bản ghi cũ; khác nội dung hoặc người gửi bị từ chối. Kiểm tra phạm vi/cửa sổ được thực hiện trước khi ghi nhận yêu cầu gửi.

Bộ gửi gọi hostname cố định graph.facebook.com, token nằm trong Authorization header, chặn redirect, timeout 15 giây. Không retry tự động:

- SENT: Meta trả ID tin và đúng PSID.
- FAILED: Meta trả lỗi từ chối rõ ràng 4xx.
- UNKNOWN: timeout, lỗi mạng, 5xx hoặc phản hồi không xác định.
- SENDING còn sau 30 giây được hiển thị là chưa rõ, để xử lý cả trường hợp API dừng giữa chừng.

Có SENDING/UNKNOWN thì chặn yêu cầu mới trong hội thoại. Người có core.messenger.manage và quyền hội thoại mở Business Suite, kiểm tra tin rồi bấm **Đối chiếu kết quả** để ghi SENT/FAILED cùng ghi chú. Chỉ xác nhận “chưa gửi” khi đã đối chiếu; không dùng thao tác này như nút thử gửi lại.

Không cam kết exactly-once xuyên qua mạng/Meta. Cơ chế giữ lần gửi không rõ và yêu cầu đối chiếu nhằm tránh phát lại mù. Chưa có delivery/read receipts, hàng đợi gửi nền, gửi file hoặc loại tin ngoài cửa sổ tiêu chuẩn.

## Quyền và vận hành

- sales.chat.use GLOBAL: hộp thư toàn công ty, gồm hội thoại chưa gắn.
- sales.chat.use ASSIGNED: theo phân công khách hiện tại.
- Gắn khách yêu cầu chat GLOBAL và khách nằm trong quyền sales.customers.read.
- Áp dụng gợi ý dùng API cập nhật khách hiện có, yêu cầu sales.customers.manage và phiên bản hồ sơ.
- core.messenger.manage GLOBAL: quản lý mẫu/đối chiếu; mặc định chỉ Admin. Đối chiếu còn kiểm tra quyền hội thoại.
- Bí mật Meta không lưu trong các bảng chat, không trả về status API và không ghi vào audit.
- Nội dung tin nằm trong cơ sở dữ liệu như dữ liệu khách. Audit tự động chỉ ghi ID/thao tác/trạng thái, không sao chép nội dung tin. Ghi chú đối chiếu do người dùng nhập được lưu vào audit.

Bản đầu dùng transaction PostgreSQL trực tiếp, chưa có queue nhận tin; cần kiểm tra tải và thời gian phản hồi trên VPS trước khi tiếp nhận lưu lượng lớn. Chưa có chức năng xóa/lưu trữ hội thoại hoặc chính sách lưu giữ tự động; cần hoàn thiện quy trình dữ liệu và cấu hình Meta trước vận hành thật.

## Kiểm tra

Bộ kiểm thử dùng schema PostgreSQL riêng, payload ký bằng bí mật giả và transport/fetch giả lập. Không gọi Meta trong test. Có kiểm tra chữ ký, lặp/đồng thời, scope và bàn giao, mẫu/nhãn/gợi ý, cửa sổ gửi, khóa yêu cầu, timeout và đối chiếu kết quả. Chưa kiểm thử trực tiếp Fanpage, giao diện bằng trình duyệt hay Docker/VPS.
