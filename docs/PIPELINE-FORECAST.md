# Pipeline: tỷ lệ chốt, hàng dự kiến xuất và Kanban

- Bấm Dự báo trên thẻ hoặc dòng khách trong chế độ Bảng để nhập giá trị bán trước tỷ lệ, tỷ lệ chốt 0–100%, loại hàng, số lượng và đơn vị. Giá trị bán là tổng do nhân viên nhập, không tự suy ra từ giá sản phẩm.
- Doanh số dự kiến = tổng (giá trị bán × tỷ lệ chốt / 100). Đã chốt đơn luôn tính 100%, Tạm dừng luôn tính 0%. Các giai đoạn khác dùng tỷ lệ đánh giá riêng của từng khách. Tỷ lệ chưa nhập được báo rõ và chưa cộng vào dự báo; không gán tỷ lệ tùy ý cho dữ liệu cũ.
- Dự kiến xuất = tổng (số lượng × tỷ lệ chốt / 100). Tổng tách theo đơn vị, chi tiết gộp theo tên loại hàng và đơn vị. Hiển thị cả số lượng nếu chốt toàn bộ; không tạo phiếu xuất, trừ kho hoặc đơn bán hàng.
- Sản phẩm quan tâm cũ được giữ lại; nếu chưa có số lượng thì không tự quy đổi mỗi khách thành một sản phẩm.
- Tổng lấy toàn bộ khách trong phạm vi quyền xem, kể cả ngoài 30 thẻ đầu mỗi cột. Chưa có ngày dự kiến chốt nên đây là dự báo toàn pipeline, không gắn nhãn dự kiến tháng này.
- Kéo thẻ qua cột hoặc dùng danh sách Giai đoạn trên từng thẻ/dòng (hỗ trợ bàn phím, điện thoại). Bấm Xem khách còn lại để vào bảng có tìm kiếm, lọc và phân trang.
- API PATCH /sales/customers/:id/pipeline chỉ cập nhật trường được gửi, kiểm tra quyền quản lý và phạm vi khách, kiểm tra phiên bản trong giao dịch, ghi nhật ký trước/sau. Chuyển giai đoạn không tạo đơn và không làm mất tỷ lệ tự nhập; khi chuyển khỏi Đã chốt/Tạm dừng, tỷ lệ đó được dùng lại.
- Migration chỉ thêm closingProbability nullable, expectedItems JSON và ràng buộc 0–100; không thay đổi hồ sơ hoặc dự kiến bán hiện có.

Kiểm thử: tính chính xác tiền/số lượng với số thập phân, 0/100% và tỷ lệ chưa có; tổng gồm khách ngoài 30 thẻ; quyền phạm vi; cập nhật phiên bản cũ; dữ liệu âm/vượt giới hạn; chuyển giai đoạn và lưu nhật ký. Kiểm thử không sửa khách thật.
