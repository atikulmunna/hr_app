import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ChecklistKind } from './checklist-template-item.entity';

export type ChecklistStatus = 'open' | 'complete';

// An employee's onboarding or offboarding in progress (T-3.4b, FR-M1-10).
@Entity('checklists')
export class Checklist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column()
  kind: ChecklistKind;

  @Column({ default: 'open' })
  status: ChecklistStatus;

  // The date the item due offsets count from.
  @Column({ name: 'anchor_date', type: 'date' })
  anchorDate: string;

  @Column({ name: 'opened_by_sub', type: 'text', nullable: true })
  openedBySub?: string | null;

  @CreateDateColumn({ name: 'opened_at' })
  openedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;
}
