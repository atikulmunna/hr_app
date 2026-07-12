import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// An in-app notification targeted at a specific user or at anyone with a role.
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'recipient_sub', nullable: true })
  recipientSub?: string;

  @Column({ name: 'recipient_role', nullable: true })
  recipientRole?: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  body?: string;

  @Column({ type: 'jsonb', nullable: true })
  data?: unknown;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
