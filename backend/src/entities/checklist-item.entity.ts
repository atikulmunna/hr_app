import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ChecklistItemStatus = 'pending' | 'done';

// One task on a checklist, owed by a role (T-3.4b, FR-M1-10).
@Entity('checklist_items')
export class ChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'checklist_id' })
  checklistId: string;

  @Column()
  title: string;

  @Column({ name: 'assignee_role' })
  assigneeRole: string;

  @Column({ name: 'due_on', type: 'date', nullable: true })
  dueOn?: string | null;

  @Column({ name: 'sort_order' })
  sortOrder: number;

  @Column({ default: 'pending' })
  status: ChecklistItemStatus;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ name: 'completed_by_sub', type: 'text', nullable: true })
  completedBySub?: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
