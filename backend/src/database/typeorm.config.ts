import { DataSourceOptions } from 'typeorm';
import { AbsenceRecord } from '../entities/absence-record.entity';
import { ApprovalRequest } from '../entities/approval-request.entity';
import { AttendanceConfig } from '../entities/attendance-config.entity';
import { ConsentRecord } from '../entities/consent-record.entity';
import { ConsentStatement } from '../entities/consent-statement.entity';
import { EmployeePayComponent } from '../entities/employee-pay-component.entity';
import { PayComponent } from '../entities/pay-component.entity';
import { OvertimeRequest } from '../entities/overtime-request.entity';
import { PayrollRun } from '../entities/payroll-run.entity';
import { PayrollRunEmployee } from '../entities/payroll-run-employee.entity';
import { PayrollRunLine } from '../entities/payroll-run-line.entity';
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
import { ProfileChangeRequest } from '../entities/profile-change-request.entity';
import { RegularizationRequest } from '../entities/regularization-request.entity';
import { RosterEntry } from '../entities/roster-entry.entity';
import { Shift } from '../entities/shift.entity';
import { ShiftSwapRequest } from '../entities/shift-swap-request.entity';
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
      RosterEntry,
      ShiftSwapRequest,
      AbsenceRecord,
      RegularizationRequest,
      ProfileChangeRequest,
      AttendanceConfig,
      ConsentStatement,
      ConsentRecord,
      PayComponent,
      EmployeePayComponent,
      PayrollRun,
      PayrollRunEmployee,
      PayrollRunLine,
      OvertimeRequest,
    ],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize: false,
    logging: ['error', 'warn'],
  };
}
