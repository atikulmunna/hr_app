import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Assigns a named geofence to an employee (FR-AT-28). An employee's effective
// set is their assigned fences, or their group's fences when none are assigned.
@Entity('employee_geofences')
export class EmployeeGeofence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'geofence_id' })
  geofenceId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
