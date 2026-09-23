# Thông tin khách hàng trong hộp thư — 23/09/2026

- Cột khách hàng luôn hiển thị, kể cả hội thoại chưa gắn hồ sơ. Nhận diện tên, số điện thoại và địa chỉ từ tối đa 100 tin nhắn đến gần nhất. Nhân viên kiểm tra và lưu trước khi tạo/gắn hồ sơ; không tự ghi đè khách hàng.
- Gợi ý địa chỉ chạy tại máy chủ từ danh mục 34 tỉnh/thành, 3.321 xã/phường (nguồn công khai https://provinces.open-api.vn/api/v2/?depth=2, tải ngày 23/09/2026). Không gửi nội dung chat ra dịch vụ địa chỉ. Đây là gợi ý chuẩn hóa, không xác minh số nhà hoặc tự chuyển mọi tên địa giới cũ.
- Nút Tạo đơn/F1 cố định: nếu chưa có hồ sơ hoặc thiếu thông tin giao hàng, mở bước kiểm tra/lưu rồi chuyển sang lập đơn.
- Đơn Sakura hiển thị người nhận, hàng hóa/số lượng/tiền, thanh toán, đối tác vận chuyển, mã vận đơn, trạng thái giao hàng, người tạo/chốt và ghi chú. Menu có xác nhận thanh toán, in đơn, gửi hóa đơn bán hàng nội bộ, gửi xác nhận đơn và hủy đơn theo quyền/trạng thái. Có nút in phiếu giao hàng.
- Thông tin vận chuyển được nhập thủ công; chưa kết nối API hãng vận chuyển. Hóa đơn gửi qua Messenger là chứng từ bán hàng nội bộ, không phải hóa đơn GTGT/điện tử.
- Đơn Sapo cũ xem trong lựa chọn nguồn Sapo, giữ chế độ chỉ đọc.
- Thư viện ảnh/video đã gửi có phân trang và xem trước. Chỉ các tin gửi thành công có bản tệp lưu trong Sakura mới mở được; lịch sử chỉ có mô tả tệp không thể tự khôi phục nội dung. Bổ sung tệp MP4 tối đa 10 MB.

## Phân quyền và dữ liệu

- Mọi truy vấn nhận diện/thư viện kiểm tra phạm vi hội thoại. Kết quả trùng số điện thoại chỉ trả khách trong phạm vi được đọc.
- Tạo khách và gắn hội thoại cùng giao dịch, có kiểm tra phiên bản; hồ sơ được giao cho nhân viên tạo. Số điện thoại trùng không tạo hồ sơ thứ hai.
- Vận chuyển yêu cầu quyền quản lý giao hàng và kiểm tra phiên bản đơn. Thanh toán/hủy/gửi tin dùng quyền và nhật ký hiện có.
- Migration chỉ thêm hai trường vận chuyển và các giá trị trạng thái giao hàng; không thay thế dữ liệu công ty.

## Kiểm chứng tại máy phát triển

- Build database/API/worker/web thành công; 40 kiểm thử đơn vị và 55 kiểm thử tích hợp Messenger/Sales đạt.
- Kiểm tra UI bằng dữ liệu mô phỏng: nhận diện, chọn địa chỉ, tạo hồ sơ rồi mở đơn, thẻ đơn/menu/hóa đơn; bố cục 1280 px và 390 px.
- Không gửi tin nhắn tới khách thật, không xác nhận thanh toán/hủy đơn thật trong kiểm thử. Chưa thử gửi MP4 qua Meta thật.

## Triển khai VPS

- Bản `2026-09-23T08-28-17-619Z-e99e9ad4` đang chạy tại https://sakura.ldhuy.name.vn. Sao lưu trước migration hoàn tất; migration `202609230003_order_shipping` thành công.
- HTTPS health trả `ok`; trang chủ dùng đúng JS/CSS mới. Endpoint gợi ý trả 401 khi chưa đăng nhập. Mã phát hành thuộc root, quyền 644.
- Kiểm tra chỉ đọc trên hội thoại mới nhất: quét 7 tin đến, nhận diện 1 số điện thoại, 1 địa chỉ, có 1 gợi ý địa danh; thư viện có 1 tin đa phương tiện đã gửi. Không lưu hồ sơ, tạo đơn hoặc gửi tin thật.
- Tomeco giữ PID 1805366; hash trang chủ và hai cấu hình Nginx dùng chung khớp trước triển khai. Chỉ Sakura API được khởi động lại.
