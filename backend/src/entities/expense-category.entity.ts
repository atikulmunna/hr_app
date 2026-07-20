import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// An expense policy category (T-2.6, FR-M8-02). legal_entity_id NULL applies
// tenant-wide; set scopes it to one entity. limitAmount NULL means no cap; a
// set cap is the most a single line in this category may claim.
@Entity('expense_categories')
export class ExpenseCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id', type: 'uuid', nullable: true })
  legalEntityId?: string | null;

  @Column()
  code: string;

  @Column()
  name: string;

  // The pg driver returns numeric as a string; null means no cap.
  @Column({ name: 'limit_amount', type: 'numeric', precision: 14, scale: 2, nullable: true })
  limitAmount?: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
