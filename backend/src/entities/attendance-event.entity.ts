import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AttendanceEventType =
  | 'check_in'
  | 'check_out'
  | 'break_start'
  | 'break_end';

export type AttendanceOrigin = 'live' | 'regularized' | 'admin' | 'offline';
export type RiskBand = 'clean' | 'yellow' | 'red';

@Entity('attendance_events')
export class AttendanceEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'event_type' })
  eventType: AttendanceEventType;

  @Column({ name: 'server_ts', type: 'timestamptz' })
  serverTs: Date;

  @Column({ default: 'live' })
  origin: AttendanceOrigin;

  @Column({ type: 'double precision', nullable: true })
  lat?: number;

  @Column({ type: 'double precision', nullable: true })
  lng?: number;

  @Column({ name: 'accuracy_m', type: 'double precision', nullable: true })
  accuracyM?: number;

  @Column({ name: 'is_mock', nullable: true })
  isMock?: boolean;

  @Column({ nullable: true })
  provider?: string;

  @Column({ name: 'wifi_bssid', nullable: true })
  wifiBssid?: string;

  @Column({ nullable: true })
  ip?: string;

  @Column({ name: 'vpn_active', nullable: true })
  vpnActive?: boolean;

  @Column({ nullable: true })
  rooted?: boolean;

  @Column({ nullable: true })
  emulator?: boolean;

  @Column({ name: 'hooking_framework', nullable: true })
  hookingFramework?: boolean;

  @Column({ name: 'adb_enabled', nullable: true })
  adbEnabled?: boolean;

  @Column({ name: 'dev_options_enabled', nullable: true })
  devOptionsEnabled?: boolean;

  @Column({ name: 'app_signature_valid', nullable: true })
  appSignatureValid?: boolean;

  @Column({ name: 'device_id', nullable: true })
  deviceId?: string;

  @Column({ name: 'matched_geofence_id', nullable: true })
  matchedGeofenceId?: string;

  @Column({ name: 'geofence_pass', nullable: true })
  geofencePass?: boolean;

  // True when recorded outside all fences under the remote-allowed policy.
  @Column({ default: false })
  remote: boolean;

  @Column({ name: 'risk_score', default: 0 })
  riskScore: number;

  @Column({ default: 'clean' })
  band: RiskBand;

  // Async enrichment (T-1C.5): pending until the background pass adds signals
  // computed after the response (impossible travel, IP-geo) and re-bands.
  @Column({ name: 'enrichment_status', default: 'pending' })
  enrichmentStatus: 'pending' | 'done';

  @Column({ name: 'enrichment_signals', type: 'text', array: true, default: {} })
  enrichmentSignals: string[];

  @Column({ name: 'app_version', nullable: true })
  appVersion?: string;

  // Offline capture (T-1C.7): the device-generated idempotency key and the time
  // the server received the synced event. server_ts keeps the capture time.
  @Column({ name: 'client_id', nullable: true })
  clientId?: string;

  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
