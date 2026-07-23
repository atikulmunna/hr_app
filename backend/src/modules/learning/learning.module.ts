import { Module } from '@nestjs/common';
import { CertificationService } from './certification.service';
import { LearningController } from './learning.controller';
import { SkillService } from './skill.service';

// Learning and development (T-3.3). Audit and notification services are global,
// and employees are read directly, so no module imports are needed.
@Module({
  controllers: [LearningController],
  providers: [SkillService, CertificationService],
})
export class LearningModule {}
