import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A shift definition: the expected working window plus an unpaid break and a
// grace period for late detection (FR-M2-01, FR-M2-08). Times are wall-clock.
@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id', nullable: true })
  legalEntityId?: string;

  @Column()
  name: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'break_minutes', default: 0 })
  breakMinutes: number;

  @Column({ name: 'grace_minutes', default: 0 })
  graceMinutes: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
