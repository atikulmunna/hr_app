import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Assigns a shift to an employee (one per employee). T-1C.9.
@Entity('employee_shifts')
export class EmployeeShift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'shift_id' })
  shiftId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
