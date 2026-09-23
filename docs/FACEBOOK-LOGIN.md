# Kết nối Fanpage bằng đăng nhập Facebook

Ngày cập nhật: 21/09/2026. Mở **Hộp thư Messenger → Cấu hình → Kết nối Fanpage** bằng tài khoản có quyền `core.messenger.manage` GLOBAL.

## Cách dùng sau khi thiết lập

1. Bấm **Kết nối bằng Facebook**. Sakura mở trang Facebook; nếu trình duyệt chặn cửa sổ, dùng liên kết Đăng nhập Facebook hiện trong app. Nhập mật khẩu và cấp quyền tại Facebook.
2. Dùng tài khoản Facebook có quyền nhắn tin/quản lý những Fanpage muốn kết nối. Quay lại thẻ Sakura sau khi Facebook hoàn tất.
3. Chọn Page trong danh sách rồi bấm **Kết nối … Fanpage đã chọn** để cho phép nhận và trả lời. Page chưa được cấp quyền nhắn tin không chọn được. Mỗi lần chọn tối đa 50 Page và tổng số Page trong Sakura tối đa 50.
4. Sakura tự kiểm tra token, quyền, đăng ký sự kiện messages, mã hóa và lưu token rồi bật nhận/trả lời cho Page đã chọn. Không cần nhập Page ID/token hoặc bật lại các checkbox. Page đã có sẽ cập nhật kết nối, giữ hội thoại cũ. Không gửi tin cho khách trong quá trình này.
5. Mở Hội thoại để làm việc hoặc dùng **Thử nhận tin** để xác nhận tin mới thật sự đến máy chủ. Chế độ Phát triển của Meta chỉ dùng được với tài khoản có vai trò phù hợp trong app Meta; muốn phục vụ khách ngoài nhóm thử phải hoàn tất quyền/xét duyệt và trạng thái công khai.

Quản trị phải xác minh webhook dùng chung trước khi nút kết nối tự động khả dụng. Nếu một Page không đăng ký được, không thay cấu hình Page nào tại Sakura; Meta có thể đã nhận đăng ký của các Page thành công trước đó, đăng nhập lại và thử lại an toàn. Khi cần bật công tắc chung, Sakura giữ trạng thái nhận/gửi thực tế của những Page không được chọn. API vẫn hỗ trợ luồng lưu thủ công cũ khi không truyền `connectNow: true`.

Quản trị viên chỉ dùng Facebook để cấp quyền kết nối. Nhân viên dùng tài khoản Sakura riêng để nhận việc/trả lời; tên người đã trả lời vẫn hiển thị dưới từng tin. Không cần nhân viên đăng nhập chung Facebook của quản trị viên.

## Thiết lập Meta một lần

Trong **Thiết lập Meta cho quản trị hệ thống (một lần)**, lưu App ID, App Secret và phiên bản Graph API theo ứng dụng đang sử dụng. Thêm mã cấu hình **Facebook Login for Business**, cấu hình dùng **User Access Token**; bật **Cho phép kết nối Fanpage bằng đăng nhập Facebook**. Luồng hiện tại không hỗ trợ System User Access Token.

Luồng yêu cầu `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`. Quyền/xét duyệt/chế độ ứng dụng phải được chuẩn bị trên Meta cho tài khoản và Page thực tế. Nếu tổ chức yêu cầu quyền bổ sung để liệt kê tài sản, quản trị đối chiếu cấu hình Meta trước khi kết nối; app không tự xin thêm quyền ngoài cấu hình đã chọn.

Sakura hiển thị địa chỉ **Valid OAuth Redirect URI** trong phần thông tin quản trị. Địa chỉ được máy chủ tạo từ `WEB_ORIGIN`, không nhận địa chỉ chuyển hướng tùy ý từ người dùng:

| Mục đích | Đường dẫn |
| --- | --- |
| Facebook trả kết quả đăng nhập | `https://TEN-MIEN/api/v1/messenger/oauth/callback` |
| Meta gửi sự kiện tin nhắn | `https://TEN-MIEN/api/v1/messenger/webhook` |

Đăng ký đúng địa chỉ chuyển hướng trên Meta. Khi chuyển máy/tên miền, cập nhật `WEB_ORIGIN` và cấu hình Meta tương ứng. Bản đang chạy qua HTTP tại localhost cho phép chuẩn bị cấu hình nhưng khóa nút bắt đầu đăng nhập thật; cần Sakura HTTPS cùng miền với API để dùng cookie bảo vệ callback.

## Phiên kết nối và khắc phục

- Mỗi phiên có hiệu lực 10 phút, gắn với đúng tài khoản và phiên đăng nhập Sakura đã bắt đầu. Tải lại trang hoặc khởi động lại API cần bắt đầu lại; Page đã lưu vẫn còn trong database.
- Bắt đầu lại trong cùng phiên Sakura thay thế lần kết nối đang chờ trước đó. Không bắt đầu phiên khác trong lúc đang lưu Page.
- Hủy/chưa cấp đủ quyền: không lưu Page; kiểm tra quyền trên Facebook rồi bắt đầu lại. Hủy tại Sakura không tự thu hồi quyền đã cấp trên Facebook.
- Không thấy Page: kiểm tra tài khoản Facebook, các Page đã cho phép và quyền nhắn tin. Kết quả được giới hạn 200 Page; nếu nhiều hơn, đăng nhập lại và thu hẹp các Page chia sẻ với ứng dụng.
- Cấu hình thay đổi trong khi đăng nhập/chọn Page: phiên cũ bị từ chối; đăng nhập lại bằng cấu hình mới. Một Page lỗi làm cả lần lưu thất bại, không lưu một phần.
- Kết nối này không nhập tin nhắn cũ từ Sapo/Facebook và không xác định nhân viên gửi trực tiếp từ Meta Business Suite.

## Bảo vệ dữ liệu và vận hành

Trình duyệt nhận liên kết đăng nhập, trạng thái và danh sách tên/ID Page; không nhận App Secret, User Access Token hoặc Page Access Token từ luồng OAuth. Callback dùng state ngẫu nhiên dùng một lần, cookie HttpOnly/Secure/SameSite=Lax và kiểm tra lại phiên/quyền Sakura. Code đổi token chỉ trên máy chủ; kết quả callback chuyển sang trang thông báo không chứa code/token, với `Referrer-Policy: no-referrer`.

Token ứng viên được mã hóa trong bộ nhớ API, xóa khi hủy/lỗi/lưu xong hoặc hết hạn. Token Page đã chọn được mã hóa bằng `MESSENGER_CONFIG_KEY` trong database; nhật ký lưu quản trị viên và ID Page, không lưu token. Kiểm tra token Page bao gồm ứng dụng cấp, quyền, hạn sử dụng và đúng Page ID. Không bật ghi URL/query của callback hoặc yêu cầu OAuth vào access log.

Phiên tạm dùng bộ nhớ của **một tiến trình API**, phù hợp bản tại máy và cấu hình triển khai một instance hiện tại. Trước khi chạy nhiều instance cần thay bằng kho phiên dùng chung với cơ chế tiêu thụ state nguyên tử. Không cần migration database cho bước này; hai thuộc tính cấu hình mới là tùy chọn trong JSON cấu hình hiện có, mặc định tắt.

## Kiểm chứng

Đã kiểm thử bằng Meta giả lập: phân quyền, Origin, state/cookie, dùng lại callback, phiên khác/thu hồi/hết hạn, hủy, lỗi Meta, đổi cấu hình, chọn Page không hợp lệ, kiểm tra token, lưu nguyên tử/chống lưu trùng, mã hóa và giữ hội thoại cũ. Đã thử giao diện chọn Page, Page bị khóa do thiếu quyền và lưu vào schema riêng. Chưa đăng nhập Meta/Fanpage thật, chưa kiểm chứng cookie/chuyển hướng qua tên miền HTTPS công khai hoặc quyền thực tế trên Meta.

Tham khảo giao thức: [bộ API chính thức của Meta trên Postman](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api) mô tả lấy Page Access Token từ danh sách Page được quản lý. Cơ chế code/state/đổi token tham khảo [OAuth2 client của Facebook SDK lưu trữ](https://github.com/facebookarchive/php-graph-sdk/blob/5.x/src/Facebook/Authentication/OAuth2Client.php). Tài liệu Meta Developers về Login for Business trả 429 trong lần kiểm tra này; cần đối chiếu cấu hình/quyền hiện hành khi kết nối thật.
