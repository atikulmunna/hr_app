import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// One progressive slab of a 'bracket' rule (T-2.3). Only the part of the base
// that falls inside the slab is taxed at its rate. upperBound null is the top
// slab, which is open-ended.
@Entity('statutory_brackets')
export class StatutoryBracket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'rule_id' })
  ruleId: string;

  @Column({ name: 'lower_bound', type: 'numeric', precision: 14, scale: 2 })
  lowerBound: string;

  @Column({
    name: 'upper_bound',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  upperBound?: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 3 })
  rate: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
