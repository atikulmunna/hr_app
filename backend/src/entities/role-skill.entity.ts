import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// The proficiency a role (employee job title) requires in a skill (T-3.3,
// FR-M7-03). role_skills define the columns of the per-role skill matrix.
@Entity('role_skills')
export class RoleSkill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  role: string;

  @Column({ name: 'skill_id' })
  skillId: string;

  @Column({ name: 'required_level' })
  requiredLevel: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
