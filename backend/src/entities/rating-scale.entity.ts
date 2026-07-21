import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A configurable rating scale (T-3.2, FR-M6-05): the ordered points a rating is
// chosen from. A default 5-point scale is seeded lazily.
export interface RatingPoint {
  value: number;
  label: string;
}

@Entity('rating_scales')
export class RatingScale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  points: RatingPoint[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
