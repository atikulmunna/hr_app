import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ChecklistKind = 'onboarding' | 'offboarding';

// One line of a tenant's on/offboarding template (T-3.4b, FR-M1-10). Opening a
// checklist copies these into checklist_items.
@Entity('checklist_template_items')
export class ChecklistTemplateItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  kind: ChecklistKind;

  @Column()
  title: string;

  // The realm role that owes the task: employee, manager, or hr_admin.
  @Column({ name: 'assignee_role' })
  assigneeRole: string;

  // Days after the checklist's anchor date (hire date or termination date)
  // by which the task is due. Negative means before it.
  @Column({ name: 'due_offset_days', default: 0 })
  dueOffsetDays: number;

  @Column({ name: 'sort_order' })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
