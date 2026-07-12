import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type DeviceStatus = 'active' | 'retired';

// A device bound to an employee (M-DB, FR-DB-01). Exactly one active device per
// employee is enforced by a partial unique index; switching devices retires the
// old binding through the approval-gated re-bind flow.
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  // A stable client-generated identifier persisted in the app's secure storage.
  @Column({ name: 'device_fingerprint' })
  deviceFingerprint: string;

  @Column({ nullable: true })
  platform?: string;

  @Column({ nullable: true })
  model?: string;

  @Column({ default: 'active' })
  status: DeviceStatus;

  @Column({ name: 'bound_at', type: 'timestamptz', default: () => 'now()' })
  boundAt: Date;

  @Column({ name: 'retired_at', type: 'timestamptz', nullable: true })
  retiredAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
