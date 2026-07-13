import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// A public holiday, bound to a legal entity or tenant-wide when legalEntityId is
// null (FR-M3-07). Excluded from leave working-day counts and later from the
// absence job (FR-AT-19).
@Entity('holidays')
export class Holiday {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'legal_entity_id', nullable: true })
  legalEntityId?: string;

  @Column({ name: 'holiday_date', type: 'date' })
  holidayDate: string;

  @Column()
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
