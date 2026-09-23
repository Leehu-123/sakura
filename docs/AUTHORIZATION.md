# Phân quyền và dữ liệu

## Vai trò mặc định

| Vai trò       | Core                          | Sale                                            | Phạm vi Sale         |
| ------------- | ----------------------------- | ----------------------------------------------- | -------------------- |
| Quản trị viên | Toàn bộ                       | Toàn bộ                                         | Toàn công ty         |
| Sale tổng     | Chỉ tự quản lý phiên/mật khẩu | Khách, đơn, chat, vận chuyển, báo cáo, bàn giao | Toàn công ty         |
| Sale vùng     | Chỉ tự quản lý phiên/mật khẩu | Khách, đơn, chat, vận chuyển, báo cáo           | Khách đang được giao |

Phạm vi Sale tổng toàn công ty là mặc định khởi tạo; có thể dùng vai trò tùy chỉnh để thu hẹp. Đã có API khách, chăm sóc, bàn giao và đơn. Chat, vận chuyển và báo cáo vẫn là permission dự phòng; chưa có tích hợp tương ứng. Cả ba vai trò được đọc bảng giá GLOBAL; Admin/Sale tổng được quản lý sản phẩm. Quyền bảng giá không cấp quyền khách/đơn.

## Cơ chế

- User có nhiều UserRoleAssignment. Mỗi RolePermission chứa permission + scope; quyền hiệu lực là hợp của các vai trò.
- GLOBAL là toàn phạm vi của permission đó; không cấp permission khác. ASSIGNED là khách đang được giao. SELF dự phòng trong enum; chưa có permission nào cho phép cấp SELF ở seed.
- Mỗi permission khai báo allowedScopes; API từ chối scope không phù hợp.
- Mỗi request bảo vệ phải khai báo policy. Không có policy thì từ chối. Chỉ login/refresh/logout/health được public có chủ đích.
- API đọc trạng thái tài khoản, session và quyền từ database ở mỗi request; đổi role hoặc khóa tài khoản có hiệu lực ngay.
- Quyền xem khu vực/danh mục không cấp quyền xem khách. Không suy ra quyền từ regionId.
- Quyền core.roles.manage là quyền quản trị bảo mật: có thể thay đổi các quyền khác qua vai trò. Chỉ giao cho người được tin cậy quản trị nền tảng.
- core.users.manage không đủ để gán vai trò: thao tác roleIds còn cần core.roles.manage. Người không có quyền quản trị vai trò không được sửa/khóa/đặt lại mật khẩu của tài khoản có permission/scope rộng hơn mình.
- Ba vai trò mặc định được bảo vệ khỏi sửa qua API. Ít nhất một user ACTIVE phải giữ role admin; kiểm tra trong transaction Serializable để ngăn hai thao tác đồng thời khóa hết Admin.
- Danh mục nhân viên tách khỏi user: nhân viên chưa có tài khoản vẫn có thể được lưu.

## Quy tắc áp dụng cho module Sale

1. CustomerAssignment phải có userId và thời gian hiệu lực. Quyền xem/chăm sóc đi theo phân công hiện tại.
2. Tất cả endpoint danh sách, chi tiết, tìm kiếm, xuất file, thống kê và mutation đều lọc scope trong truy vấn database. Không tải toàn bộ dữ liệu rồi lọc trên frontend.
3. Đơn hàng của Sale vùng lọc qua khách đang được giao, không qua người chốt hoặc khu vực.
4. Bàn giao khách đóng phân công cũ và mở phân công mới trong cùng transaction có audit.
5. Order.closedByUserId là người chốt lịch sử. Không đổi khi bàn giao khách. Người chốt là chiều báo cáo, không phải điều kiện cấp quyền truy cập.
6. Kiểm tra quyền lại khi worker thực thi công việc có dữ liệu nhạy cảm; job không phải đường đi vòng quanh RBAC.

Các truy vấn khách/đơn hiện áp dụng customerPredicate/orderPredicate trước phân trang, đọc chi tiết và mutation. Từng operation dùng đúng permission của nó; quyền xem khách GLOBAL không mở rộng quyền quản lý đơn ASSIGNED. Integration test trên PostgreSQL kiểm chứng bàn giao, chống truy cập trực tiếp bằng ID và hai lần bàn giao đồng thời. Index duy nhất có điều kiện bảo đảm mỗi khách chỉ có một phân công chưa kết thúc. Các tính năng xuất/báo cáo/worker nghiệp vụ chưa có, phải áp dụng cùng chính sách khi thêm.

## Phiên và mật khẩu

Scrypt với salt ngẫu nhiên; mật khẩu 12–128 ký tự. Access token JWT HS256 15 phút, có issuer/audience và session ID. Refresh token 48 byte ngẫu nhiên, lưu hash SHA-256 ở database; cookie HttpOnly + SameSite Strict + Secure ở production. Session hết hạn tuyệt đối sau 7 ngày, refresh không kéo dài phiên.

Refresh token chỉ dùng một lần. Phát lại hoặc hai lần refresh đồng thời cùng token sẽ thu hồi cả session. Frontend gộp các yêu cầu refresh trong một tab; hai tab refresh đồng thời có thể yêu cầu đăng nhập lại. Đây là hành vi nghiêm ngặt hiện tại cần cân nhắc khi mở rộng.

Password reset và đổi mật khẩu thu hồi toàn bộ session. Refresh/logout/login yêu cầu Origin trùng WEB_ORIGIN. Swagger login thử trực tiếp trên cổng API khác origin cần gửi đúng Origin qua client HTTP, hoặc mở Swagger qua cùng origin giao diện (/api/docs). Không lưu access token trong localStorage.

Giới hạn hiện tại: throttling lưu trong bộ nhớ mỗi API process. Ban đầu chạy một API replica; trước khi scale cần đưa limiter sang Redis. Các lớp reverse proxy phải được cấu hình trust theo đúng topology; không tin header client tự gửi.

## Nhập và tra cứu Sapo

Quyền core.imports.manage chỉ có GLOBAL, mặc định chỉ Admin. Quyền này cho phép xem/xác nhận mọi lần nhập trong công ty, không cấp cho Sale tổng/Sale vùng qua seed. Bản xem trước chứa dữ liệu nguồn và được bảo vệ cùng quyền nhập.

GET sales/historical-orders dùng sales.orders.read GLOBAL/ASSIGNED và lọc qua khách đang được giao trước phân trang và khi truy cập ID. Người chốt gốc và khu vực không cấp quyền. Đơn lịch sử không có API chỉnh sửa; ID đơn lịch sử không phải ID đơn vận hành.

## Messenger

sales.chat.use GLOBAL xem cả hội thoại chưa gắn khách. ASSIGNED chỉ xem/gửi/sửa nhãn theo khách đang được giao, áp dụng tại truy vấn danh sách/chi tiết và từng thao tác. Gắn khách chỉ chat GLOBAL, đồng thời khách phải thuộc sales.customers.read của người thao tác. Không tự liên kết theo số trích từ tin.

core.messenger.manage GLOBAL mặc định chỉ Admin: quản lý mẫu và đối chiếu tin chưa rõ kết quả; đối chiếu vẫn kiểm tra quyền hội thoại. Gợi ý chưa được lưu cho tới khi người có quyền chăm sóc xác nhận qua API khách có kiểm tra phiên bản.
