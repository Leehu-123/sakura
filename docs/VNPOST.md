# VNPost trong Sakura

Tích hợp khách hàng MyVNPost theo tài liệu chính thức https://my-uat.vnpost.vn/static/, đối chiếu ngày 28/09/2026:
- Production https://connect-my.vnpost.vn, POST `/GetAccessToken` với username/password/customerCode (mã CMS); GET `/getOrder?type=1&code=...`, header `token`.
- Không tạo, hủy vận đơn hoặc thu tiền. Mật khẩu chỉ truyền để lấy token; chỉ token mã hóa AES-GCM được lưu, dùng khóa cấu hình hiện hữu với context `shipping:vnpost`. Không đổi MESSENGER_CONFIG_KEY.
- Admin: Cài đặt → Vận chuyển, nhập tài khoản MyVNPost, mật khẩu và mã CMS. Không gửi mật khẩu/token qua chat. Tài khoản bị từ chối cần VNPost xác nhận quyền API/mã hợp đồng.
- Đơn Sakura đã chốt: Cập nhật vận chuyển → VNPost → mã vận đơn đã có. Bấm Đồng bộ VNPost. Chỉ chấp nhận kết quả đúng mã vận đơn và mã khách hàng gửi.
- Khi bật kết nối: API chạy tối đa một lượt mỗi phút, 5 đơn tuần tự/lượt, mỗi đơn cách khoảng 15 phút. Đơn cuối vòng đời tiếp tục 30 ngày từ lần cập nhật của hãng, có nút kiểm tra thủ công sau đó. Không cần mở webhook hay chỉnh Nginx. Chưa nhận sự kiện thời gian thực. Nhiều đơn có thể mất hơn 15 phút.
- Chỉ lưu các lần quan sát tại Sakura, tối đa 50 lần gần nhất khi xem lịch sử; không khẳng định lấy đủ lịch trình quá khứ. Trạng thái gốc luôn hiện riêng; trạng thái chưa có ánh xạ (đang hoàn/giao một phần/COD/phí) không tự đánh dấu giao đủ. Đồng bộ không đổi trạng thái bán hàng, paidAmount hoặc phí thu khách.
- Dữ liệu cũ hơn bị từ chối. Mã vận đơn thay đổi xóa snapshot hiện tại, giữ lịch sử. Nếu đã có phí thực trả, cần xử lý đối soát/xóa khoản ghi nhận cũ trước khi đổi mã để tránh gán nhầm.

## Các khoản phí

- `shippingFee`: phí thu khách, có trong tổng giá trị đơn. Không phải cước của hãng.
- `carrierEstimatedFee`: `totalFee` từ VNPost — tài liệu mô tả là **tổng cước tạm tính có VAT**. Không coi paymentStatus/COD là bằng chứng phí đã trả.
- `shippingCost`: tổng thực trả do nhân viên có quyền vận chuyển nhập theo bảng kê đã đối soát (gồm phụ phí/hoàn nếu có); null = chưa rõ, 0 = xác nhận miễn phí. Có ghi chú và lịch sử người nhập, cập nhật theo phiên bản đơn. API không ghi đè.
- Báo cáo và CSV tách ba khoản, số đơn còn thiếu, chênh lệch chỉ trên đơn có đủ số liệu (phí thu đơn hủy = 0). Tính theo ngày tạo/đặt đơn, không phải sổ dòng tiền. Phí thực trả của đơn hủy/hoàn vẫn được cộng. Đơn nhập Sapo chưa có actual cost không tự suy từ phí thu khách.

## Kiểm tra vận hành

Test tự động dùng gateway giả lập + PostgreSQL schema riêng, không gửi lệnh tạo/hủy vận đơn thật. Chỉ xác nhận kết nối thực tế sau khi admin nhập tài khoản và mã CMS, thử một mã vận đơn thuộc tài khoản và đối chiếu trạng thái/cước trên MyVNPost. Phiên bản này chưa có API bảng kê thanh toán; ghi phí thực trả theo đối soát thủ công.
