import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// What can appear on a payslip (T-2.1, FR-M4-01). 'basic' is the anchor of a
// structure; allowances and bonuses add to gross; a deduction subtracts from it.
export type PayComponentType = 'basic' | 'allowance' | 'bonus' | 'deduction';

// A tenant's catalog entry. legal_entity_id null means it applies tenant-wide.
@Entity('pay_components')
export class PayComponent {
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

  @Column({ name: 'component_type' })
  componentType: PayComponentType;

  @Column()
  taxable: boolean;

  @Column()
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
