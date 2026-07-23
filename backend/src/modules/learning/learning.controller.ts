import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CertificationService,
  CreateCertificationInput,
} from './certification.service';
import { CreateSkillInput, SkillService } from './skill.service';

// Learning and development (T-3.3, FR-M7-03, FR-M7-04). HR maintains the skill
// catalog, per-role requirements, employee proficiencies, and certifications
// with learning:manage; managers read the matrix and certifications with
// learning:read.
@Controller('learning')
export class LearningController {
  constructor(
    private readonly skills: SkillService,
    private readonly certifications: CertificationService,
  ) {}

  // --- Reference data.

  @RequirePermissions('learning:read')
  @Get('levels')
  levels() {
    return this.skills.levels();
  }

  @RequirePermissions('learning:read')
  @Get('roles')
  roles() {
    return this.skills.roles();
  }

  // --- Skill catalog.

  @RequirePermissions('learning:read')
  @Get('skills')
  listSkills() {
    return this.skills.listSkills();
  }

  @RequirePermissions('learning:manage')
  @Post('skills')
  createSkill(@CurrentUser() user: AuthUser, @Body() body: CreateSkillInput) {
    return this.skills.createSkill(user, body);
  }

  // --- Per-role requirements.

  @RequirePermissions('learning:read')
  @Get('role-skills')
  listRoleSkills(@Query('role') role: string) {
    return this.skills.listRoleSkills(role);
  }

  @RequirePermissions('learning:manage')
  @Post('role-skills')
  setRoleSkill(
    @Body() body: { role?: string; skillId?: string; requiredLevel?: number },
  ) {
    return this.skills.setRoleSkill(
      body?.role ?? '',
      body?.skillId ?? '',
      body?.requiredLevel as number,
    );
  }

  @RequirePermissions('learning:manage')
  @Delete('role-skills/:id')
  removeRoleSkill(@Param('id') id: string) {
    return this.skills.removeRoleSkill(id);
  }

  // --- Employee proficiencies.

  @RequirePermissions('learning:read')
  @Get('employee-skills')
  listEmployeeSkills(@Query('employeeId') employeeId: string) {
    return this.skills.listEmployeeSkills(employeeId);
  }

  @RequirePermissions('learning:manage')
  @Post('employee-skills')
  setEmployeeSkill(
    @Body()
    body: {
      employeeId?: string;
      skillId?: string;
      level?: number;
      assessedOn?: string | null;
      note?: string | null;
    },
  ) {
    return this.skills.setEmployeeSkill(body);
  }

  @RequirePermissions('learning:manage')
  @Delete('employee-skills/:id')
  removeEmployeeSkill(@Param('id') id: string) {
    return this.skills.removeEmployeeSkill(id);
  }

  // --- The per-role skill matrix.

  @RequirePermissions('learning:read')
  @Get('matrix')
  matrix(@Query('role') role: string) {
    return this.skills.matrix(role);
  }

  // --- Certifications.

  @RequirePermissions('learning:read')
  @Get('certifications')
  listCertifications(@Query('employeeId') employeeId?: string) {
    return this.certifications.list(employeeId || undefined);
  }

  @RequirePermissions('learning:manage')
  @Post('certifications')
  createCertification(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateCertificationInput,
  ) {
    return this.certifications.create(user, body);
  }

  @RequirePermissions('learning:manage')
  @Delete('certifications/:id')
  removeCertification(@Param('id') id: string) {
    return this.certifications.remove(id);
  }
}
