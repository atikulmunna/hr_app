import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EmploymentType =
  | 'permanent'
  | 'contract'
  | 'probation'
  | 'intern'
  | 'consultant';

export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';

/// The canonical employee profile, shared by all modules (PR-01).
@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id' })
  legalEntityId: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId?: string;

  @Column({ name: 'manager_id', nullable: true })
  managerId?: string;

  // Link to the Keycloak identity; set lazily on first self-service login.
  @Column({ name: 'keycloak_sub', nullable: true })
  keycloakSub?: string;

  @Column({ name: 'employee_code' })
  employeeCode: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'job_title', nullable: true })
  jobTitle?: string;

  @Column({ name: 'employment_type', default: 'permanent' })
  employmentType: EmploymentType;

  @Column({ default: 'active' })
  status: EmployeeStatus;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate?: string;

  @Column({ name: 'emergency_contact_name', nullable: true })
  emergencyContactName?: string;

  @Column({ name: 'emergency_contact_phone', nullable: true })
  emergencyContactPhone?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
