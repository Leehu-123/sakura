# Kết quả nhập dữ liệu Sapo — 09/09/2026

**Cập nhật tiếp theo:** ảnh đã được tải vào kho Sakura và đơn cũ đã xuất hiện trong màn hình **Đơn hàng** với bộ lọc nguồn Sapo. Xem [phương án lưu trữ và kết quả bổ sung](STORAGE-PLAN-2026-09-09.md). Nội dung bên dưới ghi nhận kết quả lần nhập ban đầu.

Đã nhập ba file Excel trong `C:\Users\x1gen7\Desktop\Sakura` vào cơ sở dữ liệu Sakura đang chạy trên máy này. File gốc được giữ nguyên; dấu kiểm tra SHA-256 đã được đối chiếu trước khi nhập. Chưa chuyển dữ liệu lên VPS.

| Dữ liệu | Đã nhập |
| --- | ---: |
| Khách hàng | 4.063 |
| Sản phẩm | 26 |
| Biến thể sản phẩm | 431 |
| Đơn lịch sử Sapo | 11.732 |
| Dòng hàng trong đơn | 31.662 |
| Đơn liên kết được với hồ sơ khách | 6.110 |
| Đơn chưa đủ dữ liệu để liên kết khách | 5.622 |

Nguồn: `customers_export.xlsx`, `products_export_4551adb9-fe0a-4bbf-b826-639d35ffa744.xlsx` và `order_export_a2adbc3320d040ed9d0fa3a71a593072.xlsx`.

Tổng giá trị trường tổng tiền của các đơn là **2.619.538.000 đồng**. Con số này bao gồm mọi trạng thái, kể cả đơn hủy, nên không dùng làm doanh thu. Ngày đơn trong nguồn từ 14/01/2026 đến 08/09/2026, được đọc theo giờ Việt Nam.

## Xem dữ liệu trong Sakura

Mở http://localhost:5173 và đăng nhập tài khoản quản trị:

1. **Khách hàng**: xem hồ sơ, số điện thoại, địa chỉ và thông tin gốc. File không có nhân viên được phân công nên khách chưa được tự gán cho Sale; quản trị viên có thể bàn giao sau.
2. **Sản phẩm**: xem sản phẩm, biến thể, SKU và giá bán.
3. **Đơn cũ Sapo**: tìm theo mã đơn hoặc tên khách nguồn, lọc đã liên kết/chưa liên kết và mở chi tiết từng đơn. Đơn đã liên kết cũng xuất hiện trong hồ sơ khách tương ứng.
4. Mở **Thông tin gốc từ file Sapo** trong chi tiết để tra cứu các cột gốc; với sản phẩm/đơn nhiều dòng, chọn dòng cần xem.

## Dữ liệu nguồn cần bổ sung

- 405 khách thiếu số điện thoại: giữ trống, cần bổ sung trước khi tạo đơn vận hành.
- 2 khách thiếu tên: hiển thị `Khách Sapo #<mã nguồn>` để nhận diện, giữ nguyên dữ liệu gốc.
- 85 biến thể thiếu đơn vị: giữ trống.
- 3.773 dòng đơn có số lượng bằng 0: giữ đúng nguồn để tra cứu lịch sử.
- File đơn không có mã khách Sapo. Chỉ liên kết bằng số điện thoại chuẩn hóa khớp duy nhất; 5.622 đơn còn lại giữ tên khách nguồn và chưa liên kết hồ sơ. Không ghép theo tên.
- File đơn không có địa chỉ giao, người nhận, thông tin thanh toán, chi phí giao hàng, giảm giá, thành tiền từng dòng hoặc người chốt. Các trường này được để trống/không rõ. Nhân viên tạo đơn được lưu riêng, không coi là người chốt.
- Mô tả HTML sản phẩm, email, ghi chú và các cột phụ được giữ trong phần thông tin gốc. Mô tả sản phẩm chưa được chuyển sang trường mô tả vận hành. Các URL ảnh, gồm 122 dòng chỉ chứa ảnh bổ sung, được giữ nguyên trong thông tin gốc. Ở bước cập nhật tiếp theo, ảnh đã được tải vào danh mục và thư viện chat; xem báo cáo lưu trữ ở đầu tài liệu.

Đơn lịch sử chỉ phục vụ tra cứu. Lần nhập này không phát sinh đơn vận hành, tin nhắn cho khách, phiếu giao hàng hoặc phân công nhân viên. Sale chỉ xem được dữ liệu theo phạm vi khách được giao; đơn chưa liên kết cần quyền xem toàn công ty.

## Kết quả kiểm thử

- Database, API, worker và giao diện biên dịch thành công.
- 20 kiểm thử đơn vị và 88 kiểm thử tích hợp đạt, gồm kiểm tra toàn bộ ba file thật trong schema kiểm thử riêng.
- Đối chiếu sau nhập trên cơ sở dữ liệu sử dụng: 16.252 bản ghi khách/sản phẩm/biến thể/đơn khớp mọi trường được ánh xạ, thông tin gốc và liên kết khách; toàn bộ 31.662 dòng đơn khớp.
- Đọc độc lập dữ liệu nguồn của 11.732 đơn trong kiểm thử để đối chiếu ngày, nhân viên tạo, trạng thái, tổng tiền, số lượng và các dòng hàng.
- Xem trước nhập lại cùng dữ liệu: tạo mới **0**, bỏ qua **16.252**; không nhân đôi dữ liệu. Nội dung thay đổi trên cùng mã nguồn bị từ chối để tránh ghi đè.
- Kiểm tra quyền API: đơn chưa liên kết không bị lộ cho Sale có phạm vi khách được giao.
- Bản chạy hiện tại: API, giao diện và API qua giao diện trả HTTP 200; truy cập đơn cũ khi chưa đăng nhập trả HTTP 401 đúng yêu cầu.
- Đã kiểm tra trình duyệt mở được màn hình đăng nhập. Chưa kiểm thử thao tác giao diện sau đăng nhập vì chưa có phiên đăng nhập của người dùng.

Kết quả đối chiếu, nhật ký nhập và bản chụp dữ liệu trước nhập được lưu trong thư mục `.local/sapo-20260909` trên máy, ngoài mã nguồn được chia sẻ. Đây là bản chụp dữ liệu JSON, không phải bản sao lưu phục hồi đầy đủ của PostgreSQL.

## Quy trình kỹ thuật đã sử dụng

Ba file Excel thật dùng bộ chuyển đổi riêng theo cấu trúc xuất hiện tại, không đi qua màn hình tải CSV giới hạn 200 dòng. Dữ liệu Excel được đọc thành các hàng JSON, chuẩn hóa bởi `scripts/sapo-native.cjs`, xem trước rồi nhập bằng `scripts/import-sapo-native.cjs` với chữ ký nội dung đã đối chiếu. CLI chỉ chấp nhận cơ sở dữ liệu cục bộ và kiểm tra quyền nhập của quản trị viên.

Mỗi lô tối đa 100 bản ghi được ghi cùng mã nguồn, lịch sử nhập và audit trong một transaction. Nếu dừng giữa chừng, các lô đã hoàn tất vẫn còn; chạy lại cùng nguồn bỏ qua bản ghi đã nhập. Không sửa các bản ghi đã liên kết có nội dung nguồn khác. `scripts/verify-sapo-native.cjs` là kiểm chứng dành riêng cho lần nhập đầu này, có kiểm tra chưa phát sinh hoạt động bán hàng/chat.

Migration `202609090001_sapo_native_export` đã áp dụng vào cơ sở dữ liệu cục bộ. Bộ nhập CSV vẫn giữ các yêu cầu dữ liệu chặt chẽ của quy trình CSV; chưa có màn hình tải trực tiếp ba loại XLSX này.
