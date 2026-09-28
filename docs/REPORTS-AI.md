# So sánh tháng và chuẩn bị AI

- Báo cáo và Dashboard có biểu đồ 3/6/12 tháng, kết thúc tại ngày “Đến ngày”. Ngày “Từ ngày” vẫn áp dụng cho các chỉ tiêu kỳ hiện có. Biểu đồ có khoảng thời gian riêng hiển thị rõ, cùng nguồn đơn và quyền GLOBAL/ASSIGNED.
- Ba nhóm: doanh số/đã thu; đơn hợp lệ/hủy; phí thu khách/phí thực trả đã biết. Tháng thiếu đơn hiển thị 0, không có nghĩa dữ liệu lịch sử đã đầy đủ. Tháng cuối chưa đủ ngày không tính tăng trưởng so tháng trước; mẫu số 0 hiển thị dấu gạch.
- CSV gồm cả so sánh tháng. Các định nghĩa doanh số, thu tiền và phí vận chuyển giữ như báo cáo hiện có; không phải lợi nhuận.
- Cài đặt → AI báo cáo cho quản trị viên có `core.ai.manage`: lưu nhà cung cấp dự kiến OpenAI/Gemini và lựa chọn tham khảo web. Có kiểm soát phiên bản, ghi nhật ký; không lưu khóa, không gọi dịch vụ AI, không gửi dữ liệu công ty ra ngoài.
- Người dùng chưa có tài khoản API nên bản này chỉ chuẩn bị cấu hình. Nút phân tích ghi rõ chưa kích hoạt. Chưa có endpoint phân tích và chưa có kết quả AI thật.
- Kích hoạt sau cần xác nhận nhà cung cấp/nơi nhận, tập dữ liệu tổng hợp được phép gửi, tài khoản API và ngân sách. Kế hoạch dữ liệu: số tổng hợp kỳ/tháng trong phạm vi người dùng; loại tên nhân viên/khách, điện thoại, địa chỉ, chat, đơn chi tiết. Nghiên cứu web tách riêng, chỉ truy vấn chủ đề công khai; dẫn nguồn và không khẳng định tương quan là nguyên nhân.
- Thiết kế tích hợp OpenAI tham khảo https://developers.openai.com/api/docs/guides/tools-web-search ; chưa được triển khai hoặc kiểm thử với API thật.
