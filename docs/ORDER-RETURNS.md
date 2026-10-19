# Hàng hoàn và báo cáo

Trong chi tiết đơn hàng, người có quyền quản lý đơn có thể chọn **Đánh dấu hàng hoàn** với đơn đã chốt hoặc hoàn tất. Lý do hoàn hàng bắt buộc có ít nhất 3 ký tự. Đây là hoàn toàn bộ đơn; đơn nháp, đơn hủy và đơn đã hoàn không thể chuyển sang trạng thái này.

Thao tác lưu lịch sử, nhật ký và tăng phiên bản đơn để chống ghi đè đồng thời. Phiếu giao nội bộ cũ bị vô hiệu hóa. Người chốt, tổng đơn và số tiền đã thu được giữ nguyên; thao tác không hoàn tiền, không điều chỉnh tồn kho và không gửi thông báo cho khách. Trạng thái vận chuyển của hãng độc lập với trạng thái bán hàng: nhận trạng thái vận chuyển hoàn không tự đổi đơn sang Hàng hoàn.

Báo cáo hiển thị **Số đơn hoàn** và **Tỷ lệ hoàn hàng** ở tổng kỳ, theo nguồn, người chốt, so sánh tháng và bản xuất CSV. Công thức là `đơn hoàn / (đơn hợp lệ + đơn hoàn) × 100`, làm tròn 2 chữ số thập phân, bằng 0% khi mẫu số bằng 0. Đơn hợp lệ là đơn đã chốt/hoàn tất. Đơn nháp, hủy và trạng thái chưa xác định không thuộc mẫu số.

Các chỉ số tuân theo bộ lọc nguồn và phạm vi khách hàng. Kỳ báo cáo dựa trên ngày tạo đơn Sakura/ngày đặt đơn Sapo theo giờ Việt Nam, không phải ngày nhận hàng hoàn. Trạng thái hiện tại được dùng nên đánh dấu hoàn có thể làm thay đổi báo cáo kỳ tạo đơn trước đó.

Đơn hoàn không cộng vào doanh số, tiền đã thu/còn phải thu của đơn hợp lệ và khách mua hàng. Phí vận chuyển thực trả vẫn được cộng; khi tính chênh lệch thu − chi, phí thu khách của đơn hoàn được tính bằng 0 tương tự đơn hủy. Đây không phải báo cáo kế toán hoàn tiền.

Đơn Sapo có trạng thái gốc “Hàng hoàn”, “Hoàn hàng”, “Đã hoàn hàng”, “Trả hàng”, “Đã trả hàng” hoặc `returned` được phân loại là hoàn; không thay đổi dữ liệu nguồn. Đơn chỉ có trạng thái vận chuyển hoàn vẫn cần đối chiếu trạng thái bán hàng.
