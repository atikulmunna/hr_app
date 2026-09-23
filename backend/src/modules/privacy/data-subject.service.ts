import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Employee } from '../../entities/employee.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import { EmployeeService } from '../employees/employee.service';

// Categories retained under statutory hold rather than deleted on erasure
// (DR-04). The requester is told these are held for the retention period.
const RETAINED_ON_ERASURE = [
  'attendance_events',
  'absence_records',
  'leave_requests',
  'regularization_requests',
  'consent_records',
  'audit_logs',
];

@Injectable()
export class DataSubjectService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
    private readonly employees: EmployeeService,
  ) {}

  async exportSelf(user: AuthUser) {
    const employee = await this.employees.myProfile(user.sub, user.email);
    return this.assemble(employee.id);
  }

  exportFor(employeeId: string) {
    return this.assemble(employeeId);
  }

  // Assembles a portable bundle of the employee's personal data (FR-M13-04).
  private assemble(employeeId: string) {
    return this.db.withTenant(async (m) => {
      const employee = await m.findOne(Employee, { where: { id: employeeId } });
      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }
      const [
        devices,
        attendanceEvents,
        leaveRequests,
        regularizations,
        absences,
        consents,
        notifications,
      ] = await Promise.all([
        m.query(
          `SELECT device_fingerprint AS "deviceFingerprint", platform, model,
                  status, bound_at AS "boundAt", retired_at AS "retiredAt"
           FROM devices WHERE employee_id = $1 ORDER BY bound_at`,
          [employeeId],
        ),
        m.query(
          `SELECT event_type AS "eventType", server_ts AS "serverTs", origin,
                  lat, lng, band, risk_score AS "riskScore"
           FROM attendance_events WHERE employee_id = $1 ORDER BY server_ts`,
          [employeeId],
        ),
        m.query(
          `SELECT to_char(start_date, 'YYYY-MM-DD') AS "startDate",
                  to_char(end_date, 'YYYY-MM-DD') AS "endDate",
                  working_days::float AS "workingDays", reason
           FROM leave_requests WHERE employee_id = $1 ORDER BY start_date`,
          [employeeId],
        ),
        m.query(
          `SELECT to_char(target_date, 'YYYY-MM-DD') AS "targetDate",
                  correction_type AS "correctionType", reason, origin,
                  created_at AS "createdAt"
           FROM regularization_requests WHERE employee_id = $1 ORDER BY created_at`,
          [employeeId],
        ),
        m.query(
          `SELECT to_char(absence_date, 'YYYY-MM-DD') AS "absenceDate",
                  reversed_at AS "reversedAt"
           FROM absence_records WHERE employee_id = $1 ORDER BY absence_date`,
          [employeeId],
        ),
        m.query(
          `SELECT platform, version, scope, granted_at AS "grantedAt",
                  withdrawn_at AS "withdrawnAt"
           FROM consent_records WHERE employee_id = $1 ORDER BY granted_at`,
          [employeeId],
        ),
        employee.keycloakSub
          ? m.query(
              `SELECT type, title, body, created_at AS "createdAt"
               FROM notifications WHERE recipient_sub = $1 ORDER BY created_at`,
              [employee.keycloakSub],
            )
          : Promise.resolve([]),
      ]);

      return {
        exportedAt: new Date().toISOString(),
        profile: {
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email ?? null,
          phone: employee.phone ?? null,
          jobTitle: employee.jobTitle ?? null,
          employmentType: employee.employmentType,
          status: employee.status,
          hireDate: employee.hireDate ?? null,
          emergencyContactName: employee.emergencyContactName ?? null,
          emergencyContactPhone: employee.emergencyContactPhone ?? null,
          customFields: employee.customFields ?? {},
          erasedAt: employee.erasedAt ?? null,
        },
        devices,
        attendanceEvents,
        leaveRequests,
        regularizations,
        absences,
        consents,
        notifications,
      };
    });
  }

  // Erases the employee's directly identifying data and unlinks the account,
  // retaining transactional and audit records under statutory hold (DR-04).
  async erase(employeeId: string) {
    return this.db.withTenant(async (m) => {
      const employee = await m.findOne(Employee, { where: { id: employeeId } });
      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }
      if (employee.erasedAt) {
        throw new BadRequestException(
          'This employee record has already been erased.',
        );
      }
      await this.anonymize(m, employee);
      await this.audit.record(
        {
          action: 'data.erasure',
          resourceType: 'employee',
          resourceId: employeeId,
          after: { retained: RETAINED_ON_ERASURE },
        },
        m,
      );
      return {
        employeeId,
        erasedAt: new Date().toISOString(),
        erased: [
          'name',
          'email',
          'phone',
          'emergency_contact',
          'custom_fields',
          'account_link',
        ],
        retained: RETAINED_ON_ERASURE,
        note: 'Retained records are held for the statutory retention period and are erased when the hold expires.',
      };
    });
  }

  // Nulls the directly identifying columns in one statement. A raw UPDATE is
  // used deliberately: TypeORM's save treats a property set to undefined as
  // "no change", so it cannot clear a column to NULL.
  private async anonymize(m: EntityManager, employee: Employee): Promise<void> {
    await m.query(
      `UPDATE employees
       SET first_name = 'Erased', last_name = 'Employee', email = NULL,
           phone = NULL, job_title = NULL, emergency_contact_name = NULL,
           emergency_contact_phone = NULL, custom_fields = '{}'::jsonb,
           keycloak_sub = NULL, status = 'terminated', erased_at = now()
       WHERE id = $1`,
      [employee.id],
    );
  }
}
