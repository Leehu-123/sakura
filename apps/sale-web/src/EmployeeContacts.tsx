import { useState } from 'react';
import { Modal, Form } from './sales/shared';
import { api } from './api';
export type EmployeeContact = {
  id: string;
  fullName: string;
  jobTitle: string;
  workEmail: string;
  phone: string;
  version: number;
};
export function EmployeeContactFields({ employee }: { employee?: EmployeeContact }) {
  return (
    <>
      <label>
        Chức vụ
        <input name="jobTitle" maxLength={150} defaultValue={employee?.jobTitle || ''} />
      </label>
      <label>
        Email công việc
        <input
          name="workEmail"
          type="email"
          maxLength={254}
          defaultValue={employee?.workEmail || ''}
        />
      </label>
      <label>
        Số điện thoại
        <input name="phone" type="tel" maxLength={30} defaultValue={employee?.phone || ''} />
      </label>
    </>
  );
}
export function EmployeeContacts({
  employee,
  canManage,
  saved,
}: {
  employee: EmployeeContact;
  canManage: boolean;
  saved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <strong>{employee.fullName}</strong>
      {employee.jobTitle && <small className="block muted">{employee.jobTitle}</small>}
      {employee.workEmail && <small className="block">{employee.workEmail}</small>}
      {employee.phone && <small className="block">{employee.phone}</small>}
      {canManage && (
        <button className="text-button" onClick={() => setOpen(true)}>
          Sửa thông tin liên hệ
        </button>
      )}
      {open && (
        <Modal title={'Nhân sự: ' + employee.fullName} close={() => setOpen(false)}>
          <Form
            done={() => {
              setOpen(false);
              saved();
            }}
            submit={(f) =>
              api('/core/catalogs/employees/' + employee.id, 'PATCH', {
                version: employee.version,
                jobTitle: f.get('jobTitle'),
                workEmail: f.get('workEmail'),
                phone: f.get('phone'),
              })
            }
          >
            <EmployeeContactFields employee={employee} />
          </Form>
        </Modal>
      )}
    </>
  );
}
