import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  'text',
  'number',
  'date',
  'boolean',
  'select',
];

// A tenant-defined custom field on the employee record (FR-M1-02, PR-04).
@Entity('custom_field_definitions')
export class CustomFieldDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  // Machine key stored in employees.custom_fields (lower_snake_case).
  @Column({ name: 'field_key' })
  fieldKey: string;

  @Column()
  label: string;

  @Column({ name: 'field_type' })
  fieldType: CustomFieldType;

  // Allowed values for a 'select' field; null for other types.
  @Column({ type: 'jsonb', nullable: true })
  options?: string[];

  @Column({ default: false })
  required: boolean;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
