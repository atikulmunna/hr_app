import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A stage in the tenant-configurable recruitment pipeline (T-3.1, FR-M5-03). A
// terminal stage ends the funnel; its outcome marks an application hired or
// rejected when a candidate reaches it.
export type StageOutcome = 'hired' | 'rejected';

@Entity('pipeline_stages')
export class PipelineStage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: 'sort_order' })
  sortOrder: number;

  @Column({ name: 'is_terminal', default: false })
  isTerminal: boolean;

  @Column({ type: 'text', nullable: true })
  outcome?: StageOutcome | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
