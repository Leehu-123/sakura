# Đặc tả bổ sung hộp thư Sakura theo hai ảnh Sapo

Ngày phân tích: 08/09/2026.
Đầu vào: hai ảnh màn hình Sapo do người dùng cung cấp và danh sách yêu cầu đi kèm.
Trạng thái: đã triển khai bản cục bộ 08/09/2026. Xem [hướng dẫn và giới hạn bản hiện tại](SOCIAL-WORKSPACE-GUIDE.md). Các phần hiện trạng/đối chiếu bên dưới ghi lại thời điểm phân tích trước triển khai; không phải danh sách tính năng đang thiếu của bản mới.

## 1. Nhận xét từ ảnh

Ảnh thể hiện một không gian bán hàng gồm menu ngang, thanh lọc dọc, danh sách hội thoại, vùng chat và thông tin khách/đơn bên phải. Bộ chọn Fanpage nằm phía trên; vùng soạn có thao tác chọn ảnh; nội dung chat có thẻ xác nhận đơn. Vùng đơn bên phải có sản phẩm, tổng tiền, tiền còn phải trả, vận chuyển và các thao tác đơn.

Ảnh thứ hai còn có menu: xác nhận thanh toán, in đơn, gửi hóa đơn và hủy đơn. Đây là các mục nhìn thấy trong ảnh; ảnh không đủ để xác định API, quyền hay tác động phía sau từng mục. Không suy ra rằng thẻ xác nhận trong Sapo sẽ hiển thị giống hệt trên Messenger của khách.

Danh sách tính năng do người dùng nêu là yêu cầu thiết kế. Các nội dung tên khách, số điện thoại, nhãn, địa chỉ và đơn trong ảnh chỉ là dữ liệu minh họa, không nhập vào Sakura.

## 2. Bố cục đích

Menu ngang: Hội thoại | Đơn hàng | Cấu hình. Góc phải: bộ chọn Fanpage, gồm “Tất cả Fanpage” để tra cứu.

Bên dưới, từ trái sang phải:
1. Thanh lọc dọc có biểu tượng và tên/tooltip.
2. Danh sách hội thoại có tìm kiếm, ảnh đại diện khi có nguồn hợp lệ, tên khách, đoạn tin gần nhất, thời gian, nhãn và trạng thái chưa đọc.
3. Vùng chat: thanh công cụ ở trên; lịch sử tin; nhãn nhanh; thanh soạn với thư viện ảnh, mẫu trả lời và nút gửi.
4. Thanh thông tin khách và đơn: điện thoại, địa chỉ, người chăm sóc, ghi chú, danh sách đơn và thao tác tạo đơn/phiếu giao.

Trên màn hình nhỏ, thông tin khách mở thành ngăn riêng; vẫn giữ rõ hội thoại đang chọn và nút tạo đơn. Thư viện ảnh, tạo đơn và xác nhận đơn mở trong hộp thoại để không mất vị trí đang tư vấn.

Giữ logo Sakura hiện có và ngôn ngữ tiếng Việt; dùng cách tổ chức công việc tương tự ảnh, không sao chép nguyên thương hiệu Sapo.

## 3. Đối chiếu chức năng hiện tại và phần bổ sung

| Yêu cầu | Hiện trạng Sakura | Phần cần bổ sung |
| --- | --- | --- |
| Lấy ảnh từ thư viện | Chưa có thư viện sản phẩm; chat chỉ lưu loại tệp đến | Kho ảnh gắn sản phẩm/biến thể, bộ chọn ảnh, xem trước và gửi ảnh |
| Chọn Fanpage | Cấu hình một Page bằng biến môi trường | Danh sách kết nối nhiều Page, chọn/lọc Page, thông tin trạng thái kết nối |
| Form xác nhận đơn đã chốt | Có dữ liệu đơn; chỉ gửi văn bản tự soạn | Tạo bản xác nhận từ đơn thật, xem trước, gửi có lưu liên kết và nội dung |
| Tạo đơn trong chat | Form tạo đơn nằm ở luồng khách hàng | Mở form ngay từ chat, điền khách/địa chỉ, lưu và chốt có kiểm soát |
| Hội thoại / Đơn hàng / Cấu hình | Các phần đang nằm riêng trong điều hướng ứng dụng | Không gian bán hàng có ba mục này và giữ ngữ cảnh Fanpage |
| Thanh lọc dọc | Có tìm kiếm và lọc chưa gắn khách | Bộ lọc chưa đọc, chưa trả lời, người hỗ trợ, nhãn, có đơn và đã chặn |
| Phân chia hỗ trợ | Chỉ có phân công người chăm sóc khách | Phân công hỗ trợ hội thoại riêng, không tự đổi chủ khách |
| Chặn khách | Chưa có | Chặn/bỏ chặn trong Sakura, lý do và nhật ký; tách khỏi chặn trên Facebook |
| Lọc tương tác | Chưa có bộ lọc loại tin | Lọc tin khách, tin nhân viên, tệp và xác nhận đơn; chỉ hiện loại đã hỗ trợ |
| Đánh dấu chưa đọc | Chưa lưu trạng thái đọc | Trạng thái theo nhân viên, thao tác đánh dấu và bộ đếm |
| Thông tin khách bên phải | Chat chỉ hiện tên hồ sơ được gắn | Xem/sửa có quyền số điện thoại, địa chỉ, ghi chú và người phụ trách |
| Đơn đã chốt → phiếu giao | Có đơn nháp/chốt, chưa có phiếu giao/carrier | Thẻ đơn trong thanh phải, tạo phiếu giao nội bộ; kết nối hãng vận chuyển ở bước riêng |

## 4. Quy tắc từng nhóm

### Thư viện ảnh

- Ảnh thuộc kho dùng chung của Sakura, có tên, mã sản phẩm/biến thể và trạng thái sử dụng.
- Tìm theo tên, SKU hoặc nhóm; chọn ảnh → xem trước → bấm gửi.
- Chọn ảnh không tự gửi. Đổi Fanpage/hội thoại phải giữ đúng đích gửi; không chuyển ảnh đã chọn sang người nhận mới một cách im lặng.
- Quyền xem kho ảnh tách khỏi quyền thêm/xóa ảnh. Máy chủ kiểm tra định dạng, dung lượng và quyền truy cập.
- Lưu loại nội dung, nguồn ảnh và kết quả gửi vào lịch sử. Ảnh đã dùng trong xác nhận đơn phải giữ bản gắn với lần gửi.
- Cần bổ sung bộ gửi ảnh và kiểm thử với Meta; giao diện chọn được ảnh chưa đồng nghĩa Messenger đã nhận được ảnh.

### Chọn Fanpage

- Hiện tên, ảnh Page khi có và trạng thái: chưa cấu hình / đã cấu hình / lỗi kết nối đã được xác minh.
- “Tất cả Fanpage” chỉ là phạm vi xem; gửi tin luôn dùng Page của hội thoại đó.
- Một người trên hai Page được nhận diện bằng hai cặp Page ID + PSID; không tự gộp theo PSID hoặc số điện thoại.
- Bí mật kết nối được giữ phía máy chủ, không trả về trình duyệt. Quyền quản lý kết nối không mặc nhiên cấp toàn bộ dữ liệu khách.
- Chọn Page, tìm kiếm và bộ lọc phải kết hợp với quyền hiện tại trước phân trang và tính bộ đếm.
- Cấu hình một Page hiện tại cần tiếp tục hoạt động khi nâng cấp để không gián đoạn bản đã có.

### Tạo đơn và gửi xác nhận

“Đã chốt với khách trong cuộc trò chuyện” là quyết định của nhân viên sau trao đổi. Không tự suy ra từ tin “OK”, nhãn “Đã chốt” hoặc việc gửi một thẻ xác nhận.

Luồng chính:
Khách đồng ý → Tạo đơn tại thanh bên phải → kiểm tra hàng/giá/người nhận → Lưu và chốt → Xem bản xác nhận → Gửi cho khách → Tạo phiếu giao khi chuẩn bị giao.

- Mở form từ hồ sơ khách đã gắn; nếu chưa gắn thì yêu cầu chọn/tạo khách trước.
- Dùng sản phẩm, biến thể, giá, giảm giá, phí giao và địa chỉ của hệ thống. Không lấy số tiền từ văn bản hội thoại làm số tiền đơn.
- Tái sử dụng kiểm tra giá, phạm vi, phiên bản và khóa chống trùng của đơn hiện tại.
- Thao tác “Lưu và chốt” cần bảo đảm kết quả rõ ràng; không báo đã chốt nếu mới lưu được đơn nháp.
- Người chốt lấy từ tài khoản thực hiện và được giữ nguyên khi bàn giao khách.
- Có thể chọn đơn có sẵn của đúng khách thay vì tạo đơn mới; chặn liên kết sang đơn khách khác.

Bản xác nhận gồm logo/tên Sakura, mã đơn, sản phẩm/biến thể, ảnh nếu có, số lượng, đơn giá, tiền hàng, giảm giá, phí giao, tổng tiền, đã trả/còn phải trả, người nhận, điện thoại, địa chỉ và ghi chú giao.

Bản xác nhận phải được sinh từ đơn đã lưu, có xem trước và nút gửi riêng. Lưu nội dung tại thời điểm gửi để thay đổi sản phẩm/địa chỉ sau này không sửa lịch sử tin. Nếu đơn đổi/hủy trước khi gửi thì yêu cầu xem lại. Không tự gửi lại sau lỗi không rõ kết quả.

“Đã gửi xác nhận” không đồng nghĩa khách đã xác nhận nhận hàng, đã thanh toán hoặc đã giao hàng. Cách hiển thị thẻ ở phía khách cần kiểm thử với định dạng Meta hỗ trợ; không cam kết giống thẻ trong ảnh chỉ từ quan sát giao diện Sapo.

### Phân chia người hỗ trợ

- Người hỗ trợ hội thoại khác người chăm sóc khách và người chốt đơn.
- Phân chia hỗ trợ chỉ giao việc trong hộp thư; không tự đổi CustomerAssignment hoặc cấp thêm quyền khách/đơn.
- Chỉ chọn nhân viên đang hoạt động và đã có quyền truy cập hội thoại đó.
- Hội thoại chưa gắn khách do nhóm có quyền chat toàn công ty xử lý. Muốn Sale vùng nhận thì gắn và bàn giao khách đúng quy trình trước.
- Ghi người phân công, người nhận và thời gian; bộ lọc “Tôi hỗ trợ” phải kiểm tra cả phân công lẫn quyền thực tế.

### Chặn khách

Mặc định thiết kế là **Chặn trong Sakura**, có lý do và nút bỏ chặn:
- Chuyển vào bộ lọc đã chặn, ngừng nhắc xử lý thông thường và chặn thao tác gửi mới trong Sakura.
- Giữ lịch sử và vẫn tiếp nhận tin đến đã xác thực để phục vụ đối chiếu.
- Chặn theo Page + hội thoại, không tự chặn mọi Page hoặc mọi hồ sơ trùng số.
- Không thông báo “đã chặn trên Facebook” nếu chỉ thay đổi cờ nội bộ.

Nếu cần chặn trực tiếp trên Facebook, đó là thao tác tích hợp riêng: phải kiểm chứng API/quyền của Meta và hiển thị rõ kết quả bên ngoài. Không suy ra khả năng này từ biểu tượng trong ảnh.

### Lọc và chưa đọc

Thanh lọc dọc ưu tiên:
- Tất cả.
- Chưa đọc.
- Chưa trả lời.
- Tôi hỗ trợ.
- Chưa phân công hỗ trợ.
- Chưa gắn khách.
- Có đơn / đơn đã chốt.
- Đã chặn.

Lọc nhãn, Fanpage, thời gian và loại tương tác bổ sung ở vùng tìm kiếm/thanh công cụ. Chưa triển khai bình luận, cuộc gọi hoặc livestream thì không thể hiện chúng như bộ lọc có dữ liệu thật.

Trạng thái đọc theo từng nhân viên. Mở hội thoại ghi nhận đã đọc đến tin thực sự tải; tin đến đồng thời hoặc sau đó vẫn phải hiện chưa đọc. “Đánh dấu chưa đọc” không đổi trạng thái đã đọc trên Messenger của khách.

“Chưa trả lời” dựa trên tin khách và tin gửi thành công; tin đang gửi, thất bại hoặc chưa rõ kết quả không được tính là đã phản hồi.

### Thanh thông tin khách và phiếu giao

- Điện thoại, địa chỉ: xem từ hồ sơ; sửa qua form có kiểm tra quyền và phiên bản.
- Gợi ý trích từ tin vẫn cần xác nhận như hiện tại.
- Hiện người chăm sóc, ghi chú và đơn của khách trong phạm vi được cấp.
- Thẻ đơn có mã/trạng thái, sản phẩm, tổng tiền, đã trả/còn phải trả, người chốt và thông tin giao.
- Nút Tạo đơn luôn gắn đúng khách đang chat. Đơn nhiều trang cần phân trang, không chỉ tải vài đơn rồi coi là toàn bộ.

Phiếu giao nội bộ được tạo từ đơn đã chốt đủ thông tin, lưu người nhận, hàng, tiền cần thu, người lập và ghi chú. Kiểm tra đơn chưa hủy, chưa có phiếu giao đang hiệu lực và phiên bản chưa thay đổi. Bấm lặp không tạo thêm phiếu. Đơn Sapo lịch sử tiếp tục chỉ tra cứu.

In phiếu không tự đổi đơn sang đã giao. Tạo phiếu nội bộ không tự tạo mã vận đơn VNPost/GHN/GHTK. Chỉ hiển thị mã hãng sau khi có phản hồi thành công từ kết nối thực.

Các thao tác ở ảnh thứ hai nên bổ sung theo quyền: xem/ghi nhận thanh toán, in đơn, gửi lại thông tin đơn và hủy đơn có lý do. Không mặc định gọi bản xác nhận nội bộ là hóa đơn thuế.

## 5. Phần cần thay đổi trong hệ thống

- Giao diện: tách vùng menu bán hàng, thanh lọc, danh sách chat, nội dung chat, thông tin khách/đơn; dùng lại form khách và form đơn.
- Kết nối: thay mô hình cấu hình một Page bằng danh sách Page có tham chiếu bí mật phía máy chủ.
- Hội thoại: bổ sung phân công hỗ trợ, trạng thái chặn và bản ghi đọc theo nhân viên.
- Tin nhắn: bổ sung nội dung ảnh/thẻ xác nhận, liên kết đơn và nội dung chụp tại lúc gửi; giữ cơ chế chống trùng/UNKNOWN.
- Danh mục: bổ sung thư viện ảnh sản phẩm/biến thể.
- Đơn: thêm liên kết nguồn hội thoại, thao tác lưu/chốt có kiểm soát và sinh bản xác nhận.
- Giao hàng: bổ sung phiếu giao nội bộ; carrier adapter là phần kết nối tiếp theo.
- Quyền/nhật ký: áp dụng cho cả truy vấn, bộ đếm, lưu, gửi, in, chặn và phân công. Ẩn nút trên giao diện không thay cho kiểm tra API.

## 6. Thứ tự triển khai đề xuất

1. Bố cục ba mục, thanh lọc dọc, thanh thông tin bên phải; nối form khách/đơn hiện có vào chat.
2. Đọc/chưa đọc, người hỗ trợ, chặn nội bộ và lọc tương tác.
3. Liên kết đơn với hội thoại, lưu/chốt và bản xác nhận đơn có xem trước.
4. Thư viện ảnh, gửi ảnh, danh sách Fanpage và định tuyến gửi đúng Page.
5. Phiếu giao nội bộ, in phiếu; sau đó kết nối hãng vận chuyển và đối soát.

Mỗi đợt phải có hành vi thực và trạng thái rõ, không chỉ thêm nút trang trí. Phần gửi ra Meta và vận chuyển thật chỉ hoàn tất sau cấu hình và kiểm chứng với dịch vụ tương ứng.

## 7. Tiêu chí nghiệm thu

- Chọn Fanpage/bộ lọc không lộ khách hoặc bộ đếm ngoài quyền.
- Hai Page có cùng PSID vẫn có hội thoại tách biệt.
- Phân công hỗ trợ không tự đổi người chăm sóc hoặc người chốt.
- Tin đến đồng thời không bị đánh dấu đã đọc nhầm.
- Chặn trong Sakura ngăn gửi bằng cả giao diện và API; bỏ chặn có nhật ký.
- Chọn ảnh/mẫu hoặc xem trước xác nhận không tự phát tin ra ngoài.
- Đơn được tạo đúng khách, giá và địa chỉ; nhấn lặp không nhân đôi; người chốt đúng tài khoản.
- Không gửi xác nhận của đơn khách khác, đơn đã hủy hoặc phiên bản cũ.
- Gửi không rõ kết quả giữ cơ chế đối chiếu; không tự phát lại.
- Phiếu giao chỉ tạo khi đơn hợp lệ, không tạo lặp và không gán mã vận đơn giả.
- Đơn Sapo lịch sử không bị chuyển thành tác vụ giao hàng.
- Các chức năng Core, CRM, nhập Sapo và logo Sakura tiếp tục hoạt động.
