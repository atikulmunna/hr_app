import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type DeviceBindingAction = 'enroll' | 'retire' | 'rebind';

// Reason a device change was requested, captured on the re-bind request for
// audit and pattern analysis (FR-DB-09).
export const REBIND_REASON_CODES = [
  'lost',
  'stolen',
  'replaced',
  'upgraded',
  'other',
] as const;
export type RebindReasonCode = (typeof REBIND_REASON_CODES)[number];

// Append-only history of binding actions (FR-DB-06). Never updated or deleted.
@Entity('device_binding_history')
export class DeviceBindingHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'device_id', nullable: true })
  deviceId?: string;

  @Column()
  action: DeviceBindingAction;

  @Column({ name: 'reason_code', nullable: true })
  reasonCode?: string;

  @Column({ name: 'request_id', nullable: true })
  requestId?: string;

  @Column({ name: 'actor_sub', nullable: true })
  actorSub?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
