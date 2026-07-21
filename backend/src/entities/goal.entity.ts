import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A goal or OKR (T-3.2, FR-M6-01). parentGoalId cascades a report's goal to a
// manager's; progress tracks 0..100.
export type GoalStatus = 'active' | 'achieved' | 'missed' | 'cancelled';

@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'cycle_id', type: 'uuid', nullable: true })
  cycleId?: string | null;

  @Column({ name: 'parent_goal_id', type: 'uuid', nullable: true })
  parentGoalId?: string | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  weight?: string | null;

  @Column({ default: 0 })
  progress: number;

  @Column({ default: 'active' })
  status: GoalStatus;

  @Column({ name: 'created_by_sub', type: 'text', nullable: true })
  createdBySub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
