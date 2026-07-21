import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { PipelineStage } from '../../entities/pipeline-stage.entity';

// The default funnel seeded for a tenant that has no stages yet. Two terminal
// stages carry the outcomes an application ends on.
const DEFAULT_STAGES: {
  name: string;
  isTerminal: boolean;
  outcome: 'hired' | 'rejected' | null;
}[] = [
  { name: 'Applied', isTerminal: false, outcome: null },
  { name: 'Screening', isTerminal: false, outcome: null },
  { name: 'Interview', isTerminal: false, outcome: null },
  { name: 'Offer', isTerminal: false, outcome: null },
  { name: 'Hired', isTerminal: true, outcome: 'hired' },
  { name: 'Rejected', isTerminal: true, outcome: 'rejected' },
];

export interface CreateStageInput {
  name?: string;
  isTerminal?: boolean;
  outcome?: 'hired' | 'rejected' | null;
}

// The configurable recruitment pipeline (T-3.1, FR-M5-03). Stages are ordered by
// sortOrder; a candidate advances through them. The default funnel is seeded
// lazily on first read so a tenant starts with a usable pipeline.
@Injectable()
export class StageService {
  constructor(private readonly db: TenantDbService) {}

  list(): Promise<PipelineStage[]> {
    return this.db.withTenant(async (m) => {
      await this.ensureDefaults(m);
      return m.find(PipelineStage, { order: { sortOrder: 'ASC' } });
    });
  }

  async create(input: CreateStageInput): Promise<PipelineStage> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('A stage needs a name.');
    }
    const outcome = input.outcome ?? null;
    const isTerminal = input.isTerminal ?? outcome != null;
    if (outcome != null && !isTerminal) {
      throw new BadRequestException('Only a terminal stage can carry an outcome.');
    }
    return this.db.withTenant(async (m) => {
      await this.ensureDefaults(m);
      const duplicate = await m.findOne(PipelineStage, { where: { name } });
      if (duplicate) {
        throw new BadRequestException(`A stage named "${name}" already exists.`);
      }
      const [{ max }] = (await m.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS max FROM pipeline_stages`,
      )) as [{ max: number }];
      return m.save(
        m.create(PipelineStage, {
          tenantId: this.db.tenantId,
          name,
          sortOrder: Number(max) + 1,
          isTerminal,
          outcome,
        }),
      );
    });
  }

  async update(id: string, input: CreateStageInput): Promise<PipelineStage> {
    return this.db.withTenant(async (m) => {
      const stage = await m.findOne(PipelineStage, { where: { id } });
      if (!stage) {
        throw new NotFoundException('Stage not found.');
      }
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) {
          throw new BadRequestException('A stage needs a name.');
        }
        const duplicate = await m.findOne(PipelineStage, { where: { name } });
        if (duplicate && duplicate.id !== id) {
          throw new BadRequestException(`A stage named "${name}" already exists.`);
        }
        stage.name = name;
      }
      if (input.isTerminal !== undefined) {
        stage.isTerminal = input.isTerminal;
      }
      if (input.outcome !== undefined) {
        stage.outcome = input.outcome;
      }
      if (stage.outcome != null && !stage.isTerminal) {
        throw new BadRequestException('Only a terminal stage can carry an outcome.');
      }
      return m.save(stage);
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.withTenant(async (m) => {
      const inUse = await m.query(
        `SELECT 1 FROM applications WHERE stage_id = $1 LIMIT 1`,
        [id],
      );
      if (inUse.length > 0) {
        throw new BadRequestException(
          'This stage has applications in it, so it cannot be removed.',
        );
      }
      const result = await m.delete(PipelineStage, { id });
      if (!result.affected) {
        throw new NotFoundException('Stage not found.');
      }
    });
  }

  // The stage a new application starts at: the first non-terminal stage.
  async firstStage(m: EntityManager): Promise<PipelineStage> {
    await this.ensureDefaults(m);
    const stages = await m.find(PipelineStage, { order: { sortOrder: 'ASC' } });
    const first = stages.find((s) => !s.isTerminal) ?? stages[0];
    if (!first) {
      throw new BadRequestException('The pipeline has no stages.');
    }
    return first;
  }

  private async ensureDefaults(m: EntityManager): Promise<void> {
    const [{ n }] = (await m.query(
      `SELECT count(*)::int AS n FROM pipeline_stages`,
    )) as [{ n: number }];
    if (n > 0) {
      return;
    }
    let order = 1;
    for (const stage of DEFAULT_STAGES) {
      await m.save(
        m.create(PipelineStage, {
          tenantId: this.db.tenantId,
          name: stage.name,
          sortOrder: order,
          isTerminal: stage.isTerminal,
          outcome: stage.outcome,
        }),
      );
      order += 1;
    }
  }
}
