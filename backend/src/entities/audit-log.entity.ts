import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Append-only record of a state-changing action (PR-05). Tenant-scoped by RLS.
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'actor_sub', nullable: true })
  actorSub?: string;

  @Column({ name: 'actor_username', nullable: true })
  actorUsername?: string;

  @Column()
  action: string;

  @Column({ name: 'resource_type', nullable: true })
  resourceType?: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId?: string;

  @Column({ type: 'jsonb', nullable: true })
  before?: unknown;

  @Column({ type: 'jsonb', nullable: true })
  after?: unknown;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
