# Trợ lý soạn tin Messenger — giai đoạn 1

Phạm vi đã được người dùng xác nhận: **chỉ phần nội bộ, chưa kết nối AI**. Nhân viên chủ động tạo bản nháp từ mẫu/bảng giá, duyệt/sửa và gửi qua luồng Messenger hiện có. Không tự động gửi, tạo đơn, thay giá hay tìm kiếm web. Không có API key, SDK hay HTTP request tới dịch vụ AI trong phiên bản này.

## Phương án tương lai — chưa được phép triển khai kết nối

- Nhà cung cấp đề xuất: OpenAI, POST HTTPS `https://api.openai.com/v1/responses`, model `gpt-4.1-mini`, `store:false`, không công cụ web.
- Dữ liệu: tối đa 20 tin nhắn văn bản gần nhất của đúng hội thoại (tối đa 12.000 ký tự), vai trò khách/cửa hàng; hướng dẫn, chính sách được quản trị viết cho đúng Fanpage; tối đa 6 biến thể sản phẩm nhân viên chọn từ danh mục Page cho phép (tên, SKU, đơn vị, giá).
- Không gửi Page token, API key trong nội dung, PSID, ID khách, hồ sơ khách, đơn hàng, ảnh/tệp hay lịch sử ngoài hội thoại. Ẩn mẫu số điện thoại và email có thể nhận diện; văn bản tự do vẫn có thể chứa tên/địa chỉ hoặc thông tin cá nhân khác, không cam kết ẩn hoàn toàn.
- Khóa API chỉ nhập trong cấu hình quản trị, mã hóa ở máy chủ, không trả về trình duyệt hoặc ghi log. Cần tài khoản API và hạn mức của nhà cung cấp trước khi dùng thật.
- Chỉ gọi API khi quản trị đã bật/đồng ý chia sẻ ngữ cảnh cho Fanpage và nhân viên bấm tạo bản nháp. Không dùng dữ liệu khách thật trong kiểm thử triển khai. Cần xác nhận phương án trước khi thêm phần kết nối ra ngoài.

## Kiểm soát

- Mỗi Page có hướng dẫn và danh mục sản phẩm riêng; mặc định tắt.
- Dữ liệu hội thoại và danh mục được lọc lại ở máy chủ theo quyền. Không tin ID hay giá từ trình duyệt.
- Trước/sau tạo bản nháp và trước gửi: kiểm tra quyền, phiên bản hội thoại, cấu hình và sản phẩm. Bản nháp quá hạn hoặc đã dùng không thể dùng lại để gửi mới.
- Người gửi vẫn là nhân viên duyệt. Gắn dấu “Trợ lý nội bộ soạn” và lưu bản nháp gốc để đối chiếu với nội dung đã gửi.
- Không đoán tồn kho, ưu đãi, phí giao hay ngày giao. Cần nhân viên kiểm tra giá và nội dung trước khi gửi.

## Sử dụng bản nội bộ

1. Hộp thư Messenger → Cấu hình → Trợ lý soạn tin → Cấu hình trợ lý trên Page. Bật nội bộ, lưu hướng dẫn cho nhân viên, lời mở đầu báo giá, chính sách và danh mục được phép. Cần quyền quản trị Messenger; chọn danh mục cần quyền xem sản phẩm.
2. Mở hội thoại → Trợ lý soạn tin. Xem tối đa 20 tin văn bản đã nhận/gửi; không phân tích ảnh/tệp. Chọn hỏi thêm, báo giá (tối đa 6 SKU), chính sách hoặc mẫu trả lời đang bật.
3. Tạo bản nháp; máy chủ lấy giá hiện tại, nhân viên sửa bản nháp rồi đưa vào ô nhập. Nút này không gửi tin. Nhân viên bấm gửi/Enter qua cơ chế Messenger hiện có.
4. Bản nháp có hiệu lực 10 phút, thuộc đúng nhân viên/hội thoại, dùng cho một tin. Tin mới, thay đổi sản phẩm/mẫu/cấu hình hoặc phạm vi sẽ chặn gửi bản cũ. Tạo lại nếu hết hạn hoặc lần gửi thất bại. Không tự retry kết quả chưa rõ.
5. Dưới tin hiển thị “Trợ lý nội bộ soạn · Duyệt gửi: …”. Nội dung gốc trong ChatAiDraft, nội dung cuối cùng và người gửi ở ChatMessage; nhật ký chỉ ghi thao tác, không chép hội thoại.

Bản này không tự hiểu nhu cầu, không nhận diện hàng qua ảnh, không tính ưu đãi/giá sỉ hoặc tạo đơn. Các phần này cần giai đoạn tiếp theo được cho phép riêng. Giá trong bản nháp là giá đơn vị của SKU, chưa xác nhận tồn kho và phí giao hàng.
