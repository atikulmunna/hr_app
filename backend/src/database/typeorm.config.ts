import { DataSourceOptions } from 'typeorm';
import { AbsenceRecord } from '../entities/absence-record.entity';
import { ApprovalRequest } from '../entities/approval-request.entity';
import { ApprovalStep } from '../entities/approval-step.entity';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { CustomFieldDefinition } from '../entities/custom-field-definition.entity';
import { Department } from '../entities/department.entity';
import { Device } from '../entities/device.entity';
import { DeviceBindingHistory } from '../entities/device-binding-history.entity';
import { Employee } from '../entities/employee.entity';
import { EmployeeGeofence } from '../entities/employee-geofence.entity';
import { EmployeeShift } from '../entities/employee-shift.entity';
import { EmploymentHistory } from '../entities/employment-history.entity';
import { Geofence } from '../entities/geofence.entity';
import { Holiday } from '../entities/holiday.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LegalEntity } from '../entities/legal-entity.entity';
import { Shift } from '../entities/shift.entity';
import { Notification } from '../entities/notification.entity';
import { ReviewCase } from '../entities/review-case.entity';
import { Tenant } from '../entities/tenant.entity';

// Single source of TypeORM options.
// runtime = true connects as the non-superuser app role (RLS enforced), used by
// the Nest app. runtime = false connects as the owner/migration role (hris),
// used by the CLI DataSource for migrations and seeding.
export function buildDataSourceOptions(runtime = false): DataSourceOptions {
  const username = runtime
    ? process.env.APP_DB_USER ?? 'hris_app'
    : process.env.DB_USER ?? 'hris';
  const password = runtime
    ? process.env.APP_DB_PASSWORD ?? 'hris_app_pw'
    : process.env.DB_PASSWORD ?? 'hris_dev_pw';
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username,
    password,
    database: process.env.DB_NAME ?? 'hris',
    entities: [
      Tenant,
      LegalEntity,
      AuditLog,
      ApprovalRequest,
      ApprovalStep,
      Notification,
      Department,
      Employee,
      EmployeeGeofence,
      EmploymentHistory,
      Geofence,
      AttendanceEvent,
      CustomFieldDefinition,
      Device,
      DeviceBindingHistory,
      ReviewCase,
      LeaveType,
      Holiday,
      LeaveRequest,
      Shift,
      EmployeeShift,
      AbsenceRecord,
    ],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize: false,
    logging: ['error', 'warn'],
  };
}
