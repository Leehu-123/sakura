import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import { Form, State, useResource } from './shared';
type Preferences = {
  version: number;
  provider: string;
  allowWeb: boolean;
  enabled: false;
  status: string;
};
export function ReportAiSettings() {
  const [revision, setRevision] = useState(0),
    [saved, setSaved] = useState(false);
  const r = useResource<Preferences>('/sales/report-ai/config', revision);
  return (
    <section className="panel report-ai-settings">
      <div className="panel-head">
        <h2>
          <Sparkles size={20} /> AI báo cáo
        </h2>
        <span className="badge">Chờ thiết lập API</span>
      </div>
      <p>
        Chuẩn bị lựa chọn dịch vụ và cách phân tích. Hiện chưa kết nối dịch vụ AI và chưa gửi dữ
        liệu ra ngoài Sakura.
      </p>
      <State loading={r.loading} error={r.error} />
      {saved && (
        <p role="status" className="note">
          Đã lưu lựa chọn. AI vẫn chưa được kích hoạt.
        </p>
      )}
      {r.data && (
        <Form
          key={revision}
          label="Lưu lựa chọn AI"
          done={() => {
            setSaved(true);
            setRevision((v) => v + 1);
          }}
          submit={async (f) => {
            await api('/sales/report-ai/config', 'PATCH', {
              version: r.data!.version,
              provider: String(f.get('provider')),
              allowWeb: f.get('allowWeb') === 'on',
            });
          }}
        >
          <label>
            Dịch vụ dự kiến
            <select name="provider" defaultValue={r.data.provider}>
              <option value="OPENAI">OpenAI</option>
              <option value="GEMINI">Google Gemini</option>
            </select>
          </label>
          <label className="ai-checkbox">
            <input type="checkbox" name="allowWeb" defaultChecked={r.data.allowWeb} />
            Tham khảo thông tin thị trường trực tuyến khi phân tích
          </label>
          <p className="muted">
            Đây là lựa chọn cho lần thiết lập sau; chưa chạy tìm kiếm trực tuyến.
          </p>
        </Form>
      )}
      <h3>Dự kiến AI sẽ phân tích</h3>
      <ul>
        <li>Xu hướng doanh số, đơn hàng và thu tiền qua các tháng.</li>
        <li>Chi phí vận chuyển, phần chưa đối soát và điểm cần chú ý.</li>
        <li>
          Gợi ý hành động; thông tin thị trường có nguồn tham khảo, tách riêng với số liệu công ty.
        </li>
      </ul>
      <h3>Dữ liệu dự kiến sử dụng</h3>
      <p>
        Số tổng hợp theo tháng, kỳ báo cáo, nguồn đơn và các chỉ tiêu đang được phép xem. Không cần
        gửi tên khách, số điện thoại, địa chỉ, nội dung chat hay thông tin từng đơn.
      </p>
      <p className="note">
        Để kích hoạt sau này: cần tài khoản API, khóa API và xác nhận dịch vụ được nhận các số liệu
        tổng hợp nêu trên. Chi phí API do nhà cung cấp tính riêng. Chức năng nhập khóa và chạy phân
        tích chưa mở trong phiên bản này.
      </p>
    </section>
  );
}
export function ReportAiPanel({ openSettings }: { openSettings?: () => void }) {
  return (
    <section className="panel report-ai-panel">
      <div>
        <span className="eyebrow">TRỢ LÝ PHÂN TÍCH</span>
        <h2>
          <Sparkles size={20} /> Phân tích kết quả bằng AI
        </h2>
        <p>
          Nhận xét xu hướng các tháng, điểm cần chú ý và gợi ý hành động, có thể tham khảo thêm
          thông tin thị trường.
        </p>
        <p className="muted">
          Chưa kích hoạt: cần thiết lập tài khoản API. Biểu đồ và báo cáo vẫn sử dụng bình thường.
        </p>
      </div>
      <div>
        <button className="primary" disabled>
          Phân tích bằng AI · Chưa kích hoạt
        </button>
        {openSettings && (
          <button className="secondary" onClick={openSettings}>
            Thiết lập AI
          </button>
        )}
      </div>
    </section>
  );
}
