import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// An employee's actual proficiency in a skill (T-3.3, FR-M7-03): one cell of the
// skill matrix. Unique per employee and skill; a re-assessment updates in place.
@Entity('employee_skills')
export class EmployeeSkill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'skill_id' })
  skillId: string;

  @Column()
  level: number;

  @Column({ name: 'assessed_on', type: 'date', nullable: true })
  assessedOn?: string | null;

  @Column({ nullable: true })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
