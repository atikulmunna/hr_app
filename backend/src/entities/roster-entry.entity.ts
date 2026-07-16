import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A per-date shift assignment that overrides the standing employee_shifts
// assignment for one day (T-1E.3, FR-M2-02). One entry per employee per day.
@Entity('roster_entries')
export class RosterEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'shift_id' })
  shiftId: string;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  // 'manual' when set by HR or a manager; 'swap' when produced by an approved
  // shift swap.
  @Column({ default: 'manual' })
  source: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
