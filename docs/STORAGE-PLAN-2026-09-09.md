# Sakura — tốc độ phát sinh dữ liệu và phương án lưu trữ

Ngày phân tích: 09/09/2026. Nguồn là ba file Sapo đã nhập, đo trực tiếp PostgreSQL và ảnh đã tải về. Dung lượng trong báo cáo dùng MB/GB thập phân; KiB = 1.024 byte, MiB = 1.048.576 byte.

**Đề xuất:** giữ PostgreSQL cho khách, đơn, phân quyền và thông tin ảnh; lưu tệp ảnh ở kho riêng. Khởi đầu dự trù 100 GB SSD cho app/database và ngân sách dung lượng 100 GB cho kho ảnh có thể mở rộng. Với kịch bản lượng đơn tăng 50% mỗi năm, sau 5 năm dự trù khoảng 60 GB cho dữ liệu có dự phòng và 420–500 GB cho ảnh/tệp, chưa tính bản sao lưu độc lập. Đây là kịch bản thiết kế, không phải tốc độ tăng trưởng kinh doanh đã chứng minh.

**Cập nhật triển khai:** đã có bản sao PostgreSQL kèm ảnh và đã thử phục hồi thành công, cùng màn hình Lưu trữ & sao lưu. Xem [hướng dẫn](BACKUP-AND-STORAGE.md). Lịch tự động, kho ngoài máy và WAL/PITR vẫn chưa được bật.

## 1. Phạm vi và khoảng trống dữ liệu

- Công ty hoạt động từ tháng 6/2025 theo thông tin bạn cung cấp.
- Hồ sơ khách có ngày tạo từ tháng 3/2025 đến 08/09/2026. Có 7 hồ sơ trước tháng 6/2025; ngày tạo hồ sơ có thể là dữ liệu chuẩn bị/chuyển hệ thống và không chứng minh ngày có khách mới.
- File đơn thực tế bắt đầu **14/01/2026 lúc 08:11**, kết thúc **08/09/2026 lúc 17:28**. Mốc 16/01/2026 trong báo cáo trước đã được sửa sau khi đối chiếu toàn bộ cột ngày gốc.
- Thiếu đơn từ 06/2025 đến 13/01/2026 trong file hiện tại. Không thể tính tăng trưởng cùng kỳ năm trước hoặc CAGR từ khi thành lập. Cần xuất bổ sung khoảng thời gian này để phân tích trọn vòng đời công ty.
- Tháng 1 và tháng 9/2026 chỉ có một phần tháng. Bảy tháng 2–8 có ngày đầu/cuối tháng trong file, được dùng làm các tháng đầy đủ trong tập xuất; điều đó không tự chứng minh Sapo đã xuất mọi đơn của công ty.
- Tổng đơn bên dưới tính mọi trạng thái vì đơn hủy vẫn cần lưu. Tổng tiền nguồn 2.619.538.000 đồng không đồng nghĩa doanh thu hoặc tiền thực thu.

## 2. Tốc độ phát sinh thực tế

| Tháng | Đơn | Dòng hàng | Đơn hoàn thành | Hồ sơ khách tạo trong nguồn |
| --- | ---: | ---: | ---: | ---: |
| 01/2026, đơn từ ngày 14 | 857 | 3.675 | 775 | 459 |
| 02/2026 | 821 | 3.403 | 700 | 347 |
| 03/2026 | 1.642 | 4.346 | 1.368 | 259 |
| 04/2026 | 1.473 | 3.655 | 1.207 | 168 |
| 05/2026 | 1.856 | 4.860 | 1.573 | 311 |
| 06/2026 | 2.030 | 4.252 | 1.823 | 356 |
| 07/2026 | 1.512 | 3.826 | 1.393 | 423 |
| 08/2026 | 1.248 | 2.921 | 1.105 | 219 |
| 09/2026, đến ngày 8 | 293 | 724 | 144 | 186 |
| **Tổng đơn/dòng** | **11.732** | **31.662** | **10.088** | — |

Trung bình tháng 2–8: **1.512 đơn/tháng**. Trung bình ba tháng 6–8: **1.597 đơn/tháng**, tương đương **19.160 đơn/năm nếu nhịp này giữ nguyên**. Mỗi đơn có trung bình **2,70 dòng hàng**.

Tháng 7 giảm **25,5%** so với tháng 6; tháng 8 giảm **17,5%** so với tháng 7, thấp hơn tháng 6 **38,5%**. Đây là thay đổi lượng đơn trong tập dữ liệu, không đủ cơ sở kết luận công ty suy giảm hoặc tăng trưởng đều. Mùa vụ, phạm vi xuất và thay đổi cách ghi đơn chưa được xác nhận.

Hồ sơ khách tạo trong ba tháng gần nhất trung bình **333 hồ sơ/tháng**. Không sử dụng chỉ số này như số khách mua lần đầu: khách có thể được tạo/gộp/nhập hàng loạt. Năm 2025 có 1.335 hồ sơ; năm 2026 đến ngày xuất có 2.728 hồ sơ. Không so sánh hai tổng này như hai năm đầy đủ.

Chọn mức thiết kế ban đầu **2.500 đơn/tháng = 30.000 đơn/năm**: cao hơn trung bình gần đây khoảng 57%, cao hơn tháng nhiều đơn nhất khoảng 23%. Nếu cần chịu ngày cao điểm, phải đo thêm đồng thời người dùng và lưu lượng hội thoại; số đơn/tháng không xác định được tải CPU/RAM.

## 3. Dung lượng đã đo

| Thành phần | Dung lượng |
| --- | ---: |
| Tổng các bảng ứng dụng, gồm chỉ mục và dữ liệu TOAST | 42,61 MB |
| Toàn database PostgreSQL, gồm phần hệ thống | 53,76 MB |
| Riêng bảng đơn Sapo, gồm chỉ mục/TOAST | 25,69 MB |
| 453 tệp ảnh gốc khác nội dung | 252,33 MB |
| Trung bình một tệp ảnh gốc | 557 KB |
| Tệp ảnh lớn nhất | 2,04 MB |

Một đơn lịch sử hiện chiếm khoảng **2,19 KB trong bảng lịch sử** nhờ dữ liệu được nén; đây không phải chi phí của một đơn vận hành đầy đủ. Đơn tương lai có dòng hàng riêng, nhật ký thay đổi, giao hàng, ghi chú, tin nhắn và chỉ mục nên dùng mức dự phòng cao hơn.

Dung lượng database không bao gồm thư mục WAL, file log, môi trường phát triển, bản sao lưu hoặc ảnh trên đĩa. Phép đo dùng `pg_total_relation_size` cho bảng và `pg_database_size` cho database theo [tài liệu PostgreSQL](https://www.postgresql.org/docs/17/functions-admin.html).

## 4. Dự phóng 1, 3 và 5 năm

Giả định công khai để tính dung lượng:

- Năm đầu phát sinh 30.000 đơn; các năm sau giữ nguyên, tăng 50%/năm hoặc gấp đôi/năm. Mức tăng áp dụng từ năm thứ hai. Không ngoại suy các mức này từ số liệu kinh doanh hiện có.
- Mỗi đơn mới dự trù 32 KiB cho dữ liệu nghiệp vụ và phần phân bổ khách/dòng hàng/chỉ mục/nhật ký, cộng 20 tin nhắn × 2 KiB = tổng **72 KiB/đơn** trong database.
- Mỗi đơn dự trù **một ảnh/tệp mới riêng biệt 0,5 MiB**. Gửi lại ảnh sản phẩm có sẵn không tạo thêm tệp; tin trao đổi chưa thành đơn có thể làm lượng tệp lớn hơn giả định này.
- Kho ảnh sản phẩm hiện tại tăng 50% dung lượng/năm, là giả định vì file sản phẩm không có lịch sử tăng ảnh theo tháng.
- App hiện chưa tự tải mọi ảnh khách gửi vào; phần dung lượng hội thoại là dự trù khi bổ sung chức năng đó. Không bao gồm video. Nếu có 5 ảnh riêng/đơn, phần tệp theo đơn tăng gấp 5; video cần dự toán riêng.

Công thức số đơn mới tích lũy: `30.000 × Σ(1 + g)^k`, với `k = 0…n−1`. Cộng 11.732 đơn đã có để ra tổng. Dung lượng = phần hiện tại + số đơn mới × chi phí giả định; ảnh danh mục tính tăng trưởng riêng.

| Kịch bản | Sau | Tổng đơn lưu | Database, chưa dự phòng | Ảnh/tệp, chưa dự phòng |
| --- | ---: | ---: | ---: | ---: |
| Mọi kịch bản, năm đầu | 1 năm | 41.732 | 2,25 GB | 16,11 GB |
| Giữ nguyên nhịp thiết kế | 3 năm | 101.732 | 6,68 GB | 48,04 GB |
| Giữ nguyên nhịp thiết kế | 5 năm | 161.732 | 11,10 GB | 80,56 GB |
| Tăng 50%/năm | 3 năm | 154.232 | 10,55 GB | 75,56 GB |
| Tăng 50%/năm | 5 năm | 407.357 | 29,21 GB | 209,34 GB |
| Gấp đôi mỗi năm | 3 năm | 221.732 | 15,53 GB | 110,95 GB |
| Gấp đôi mỗi năm | 5 năm | 941.732 | 68,61 GB | 489,50 GB |

Cộng **100% dự phòng dung lượng** cho tăng kích thước bản ghi, trao đổi ngoài đơn và sai số giả định; phần dự phòng này không phải bản sao lưu. Kịch bản 50%/năm sau 5 năm cần khoảng **58,42 GB database và 418,68 GB ảnh/tệp**. Kịch bản gấp đôi cần khoảng **137,22 GB database và 979,01 GB ảnh/tệp**. Nếu số tin/tệp thực tế vượt giả định, phải tính lại, không mặc định hệ số dự phòng luôn đủ.

## 5. Phương án triển khai theo giai đoạn

**Hiện tại trên máy:** đã triển khai kho ảnh riêng tại `.local/media`, tên tệp theo SHA-256, gộp tệp giống nội dung; database chỉ giữ liên kết/loại/kích thước/nguồn. Ảnh được đọc qua API có phân quyền và chỉ tải khi sắp xuất hiện trong vùng nhìn. Ảnh cũ lưu trong database vẫn đọc được để tương thích. Đơn Sapo và Sakura tra cứu chung qua truy vấn có phân trang, không tải tất cả đơn về trình duyệt.

**Khi đưa lên VPS:** mức khởi đầu đề xuất 2 vCPU, 4 GB RAM và 100 GB SSD cho app/database, cần xác nhận bằng kiểm thử tải với số nhân viên thực tế. Kho ảnh có ngân sách ban đầu 100 GB và tăng theo mức dùng. Nếu chạy một máy, volume ảnh riêng là bước khởi đầu; khi chạy nhiều API hoặc cần độ bền độc lập với VPS, chuyển sang kho đối tượng tương thích S3. Thiết kế khóa tệp hiện tại cho phép sao chép ảnh theo khóa và đối chiếu hash, nhưng adapter S3 chưa được triển khai.

Docker đã có volume `media_data`, đường dẫn `/data/media` và quyền ghi cho tài khoản app. Khi chuyển máy phải chuyển **database và kho ảnh cùng nhau**; khôi phục database đơn lẻ sẽ thiếu ảnh. Cấu hình Docker chưa được chạy kiểm thử trên máy này.

**Mốc mở rộng:** giữ SSD trống ít nhất 30%; xem xét nâng khi vượt 60% hoặc dự báo sẽ đầy trong 90 ngày. Theo dõi dung lượng database, WAL, ảnh, tệp mới/ngày, số tin/ngày và thời gian truy vấn. Sau 30 ngày dùng hội thoại thực tế, thay giả định 20 tin/đơn và 0,5 MiB/đơn bằng số đo. Từ 3–6 tháng kiểm tra lại kịch bản tăng trưởng; bổ sung chỉ mục/phân vùng theo kết quả truy vấn, không chỉ theo tuổi công ty.

## 6. Sao lưu và phục hồi

- Đề xuất mục tiêu khi vận hành: mất dữ liệu tối đa 15 phút (RPO), phục hồi trong 4 giờ (RTO); đây là mục tiêu cần kiểm chứng bằng diễn tập, chưa phải cam kết đang đạt.
- PostgreSQL: một bản sao nền và lưu WAL liên tục để phục hồi theo thời điểm. Chuỗi WAL phải đầy đủ từ thời điểm bản sao nền; theo dõi lỗi lưu WAL để tránh đầy đĩa. Xem [PITR của PostgreSQL](https://www.postgresql.org/docs/17/continuous-archiving.html).
- Giữ cửa sổ phục hồi gần nhất 14–30 ngày, bản hằng tuần 8 tuần, bản hằng tháng 12 tháng là phương án đề xuất. Chính sách thời gian giữ hồ sơ nghiệp vụ cần công ty chốt riêng; chưa tự xóa đơn/khách/ảnh.
- Kho ảnh cần bản sao ở nơi độc lập với VPS. Nếu dùng S3, bật quản lý phiên bản và đặt vòng đời cho phiên bản cũ để kiểm soát chi phí; phiên bản cũ vẫn chiếm dung lượng cho tới khi được xử lý theo quy tắc. Xem [S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html) và [Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html).
- Đo dung lượng sao lưu nén và WAL thực tế trước khi mua mức lưu cố định; bảng dự phóng ở trên chưa cộng bản sao lưu. Dành một bản sao ảnh đầy đủ ở nơi khác và dự trù riêng nhiều bản database cùng WAL theo thời gian giữ.
- Hằng tháng phục hồi thử vào môi trường riêng, kiểm tra số đơn, quyền truy cập và hash ảnh. Sao lưu JSON đã tạo trước lần nhập không thay thế quy trình PostgreSQL đầy đủ này.

Các lịch sao lưu, cảnh báo và tài khoản kho đám mây ở phần này là phương án vận hành, **chưa được kích hoạt** trong lần cập nhật.

100 GB SSD là cấu hình khởi đầu, không cam kết giữ nguyên 5 năm. Khi tiến gần mức 60 GB dữ liệu cộng hệ điều hành/log, dự trù nâng SSD lên khoảng 200 GB để duy trì khoảng trống vận hành. Kho ảnh mở rộng độc lập.

## 7. Thay đổi sản phẩm và kiểm chứng

- **Sản phẩm:** 553 URL được tải thành 453 tệp khác nội dung, 977 liên kết ảnh; đủ 26 sản phẩm có ảnh, 424/431 biến thể có ảnh riêng trong nguồn. 7 biến thể còn lại không có ảnh riêng; không tự gán ảnh màu khác.
- **Đơn hàng:** mặc định tra cứu cả đơn Sakura và 11.732 đơn Sapo; lọc nguồn, trạng thái, liên kết khách, tìm mã/tên và phân trang. Đơn Sapo mở chi tiết nguồn, không kích hoạt lại thu tiền/chốt/giao hàng. Đây là lý do dữ liệu vẫn giữ cấu trúc lịch sử ở bên trong dù đã đưa vào cùng màn hình.
- 453 tệp đã được kiểm tra hash, dung lượng và giải mã định dạng ảnh: không lỗi. Không chỉnh sửa hoặc nén lại ảnh gốc.
- Kiểm thử API có kiểm tra ảnh đúng sản phẩm/biến thể, không tải lại khi nhập lại, quyền ảnh, quyền đơn chung trước/sau bàn giao, phân trang và giữ trạng thái gốc. Không gửi tin cho khách hoặc tạo giao hàng thật.
- 20 kiểm thử đơn vị đạt; lượt đầy đủ đầu tiên đạt 90 kiểm thử tích hợp. Sau một lượt lặp lỗi khởi tạo do môi trường chạy chậm, kiểm tra riêng trên bản cuối đạt 8 kiểm thử Sapo/ảnh/đơn chung và 17 kiểm thử Core. Xem [nhật ký kiểm chứng](VALIDATION.md).
- Kiểm thử giao diện bằng trình duyệt chưa hoàn tất: thao tác mở môi trường kiểm thử riêng bị timeout. Không coi kiểm thử API hoặc biên dịch là kiểm thử trực quan.

Số liệu và công thức có thể tái tính bằng `scripts/storage-metrics.cjs`; kết quả hiện tại lưu cục bộ tại `.local/sapo-20260909/storage-metrics.json`. Script chỉ đọc dữ liệu, không xuất tên/điện thoại khách ra báo cáo dung lượng.
