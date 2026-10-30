import { Form, State, useResource } from './sales/shared';
import { api } from './api';
import { useState } from 'react';
export function CompanyProfile({ canManage }: { canManage: boolean }) {
  const [revision, setRevision] = useState(0),
    [saved, setSaved] = useState(false);
  const result = useResource<{ name: string; address: string; version: number }>(
    '/core/company-profile',
    revision,
  );
  return (
    <section className="panel">
      <h3>Thông tin bên bán trên phiếu giao</h3>
      <State loading={result.loading} error={result.error} />
      {result.data &&
        (canManage ? (
          <Form
            key={result.data.version}
            done={() => {
              setSaved(true);
              setRevision((v) => v + 1);
            }}
            submit={(f) =>
              api('/core/company-profile', 'PATCH', {
                version: result.data!.version,
                name: f.get('name'),
                address: f.get('address'),
              })
            }
          >
            <label>
              Tên công ty
              <input name="name" required maxLength={150} defaultValue={result.data.name} />
            </label>
            <label>
              Địa chỉ trụ sở
              <textarea name="address" maxLength={1000} defaultValue={result.data.address} />
            </label>
            <small>
              Thông tin được lưu theo phiên bản phiếu mới; không ghi đè các phiếu đã lập.
            </small>
          </Form>
        ) : (
          <p>
            {result.data.name} · {result.data.address || 'Chưa có địa chỉ trụ sở'}
          </p>
        ))}
      {saved && <p role="status">Đã lưu thông tin công ty.</p>}
    </section>
  );
}
