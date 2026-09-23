# Đồng bộ trạng thái webhook ngày 22/09/2026

Người dùng chuyển sang Dakifa 2 (App ID 1321485743137999), đã lưu cấu hình và xác minh trên Meta nhưng nút kết nối vẫn bị khóa. Kiểm tra VPS: version 39, Facebook Login bật và đủ cấu hình, webhookVerifiedAt null. Lượt challenge thành công cuối trong access log là 16:29:44 giờ Việt Nam, trước lần thay cấu hình ứng dụng; không có challenge mới dù người dùng báo đã xác minh lại.

Đọc Graph API /{app-id}/subscriptions bằng thông tin ứng dụng hiện tại thành công: object page, active true, callback chính xác https://sakura.ldhuy.name.vn/api/v1/messenger/webhook, fields có messages.

Đã đối chiếu lại trực tiếp Meta và đồng bộ riêng webhookVerifiedAt trong transaction có advisory lock và kiểm tra version/App ID/URL, giữ nguyên cấu hình khác. Audit messenger.webhook.remote_verified ghi phương thức META_APP_SUBSCRIPTIONS. Đây là xác nhận đăng ký đang hoạt động từ Meta, không phải một challenge mới hay kiểm thử nhận tin. Không gọi POST đăng ký, không thay webhook bên Meta, không gửi tin.

Sau đồng bộ: OAuth info ready=true, automaticReady=true, setupMessage=null; chưa nhận tin thực tế (receivedCount=0). Token Page thử trước đó còn thiếu pages_read_engagement và pages_manage_metadata cho Page 745831148604981; cần cấp quyền/kết nối lại. Webhook Meta hiện trỏ trực tiếp Sakura, chưa có cơ chế chuyển tiếp cho app khác.
