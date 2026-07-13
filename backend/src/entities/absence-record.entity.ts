import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A day the absence job marked an employee absent (T-1C.10). Reversible when a
// correction is approved; a reversed record is retained for the audit trail.
@Entity('absence_records')
export class AbsenceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'shift_id', nullable: true })
  shiftId?: string;

  @Column({ name: 'absence_date', type: 'date' })
  absenceDate: string;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt?: Date;

  @Column({ name: 'reversed_by', nullable: true })
  reversedBy?: string;

  @Column({ name: 'reversal_reason', nullable: true })
  reversalReason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
