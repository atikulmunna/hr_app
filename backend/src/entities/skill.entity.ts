import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A competency the tenant tracks (T-3.3, FR-M7-03).
@Entity('skills')
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
