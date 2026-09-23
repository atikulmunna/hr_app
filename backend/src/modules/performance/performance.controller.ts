import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AppraisalService, OutcomeInput } from './appraisal.service';
import { CreateCycleInput, CycleService } from './cycle.service';
import { CreateGoalInput, GoalService } from './goal.service';
import { GoalStatus } from '../../entities/goal.entity';
import { RatingPoint } from '../../entities/rating-scale.entity';

// Performance management (T-3.2, FR-M6-01, 02, 05, 06). Employees see and update
// their own goals and appraisals under /me (self-service, no permission).
// Managers enter reviews for their reports with performance:read; HR runs cycles,
// calibration, and outcomes with performance:manage.
@Controller()
export class PerformanceController {
  constructor(
    private readonly cycles: CycleService,
    private readonly goals: GoalService,
    private readonly appraisals: AppraisalService,
  ) {}

  // --- Employee self-service.

  @Get('me/goals')
  myGoals(@CurrentUser() user: AuthUser) {
    return this.goals.mine(user);
  }

  @Post('me/goals/:id/progress')
  updateMyGoal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { progress?: number; status?: GoalStatus },
  ) {
    return this.goals.updateMine(user, id, body);
  }

  @Get('me/appraisals')
  myAppraisals(@CurrentUser() user: AuthUser) {
    return this.appraisals.mine(user);
  }

  @Post('me/appraisals/:id/self-review')
  selfReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { rating?: number; comments?: string },
  ) {
    return this.appraisals.selfReview(
      user,
      id,
      body?.rating as number,
      body?.comments,
    );
  }

  // --- Rating scales.

  @RequirePermissions('performance:read')
  @Get('performance/rating-scales')
  listScales() {
    return this.cycles.listScales();
  }

  @RequirePermissions('performance:manage')
  @Post('performance/rating-scales')
  createScale(@Body() body: { name?: string; points?: RatingPoint[] }) {
    return this.cycles.createScale(body?.name ?? '', body?.points ?? []);
  }

  // --- Cycles.

  @RequirePermissions('performance:read')
  @Get('performance/cycles')
  listCycles() {
    return this.cycles.list();
  }

  @RequirePermissions('performance:read')
  @Get('performance/cycles/:id')
  getCycle(@Param('id') id: string) {
    return this.cycles.get(id);
  }

  @RequirePermissions('performance:manage')
  @Post('performance/cycles')
  createCycle(@CurrentUser() user: AuthUser, @Body() body: CreateCycleInput) {
    return this.cycles.create(user, body);
  }

  @RequirePermissions('performance:manage')
  @Post('performance/cycles/:id/activate')
  activateCycle(@Param('id') id: string) {
    return this.cycles.activate(id);
  }

  @RequirePermissions('performance:manage')
  @Post('performance/cycles/:id/calibration')
  calibrateCycle(@Param('id') id: string) {
    return this.cycles.moveToCalibration(id);
  }

  @RequirePermissions('performance:manage')
  @Post('performance/cycles/:id/close')
  closeCycle(@Param('id') id: string) {
    return this.cycles.close(id);
  }

  @RequirePermissions('performance:read')
  @Get('performance/cycles/:id/calibration')
  calibrationBoard(@Param('id') id: string) {
    return this.cycles.calibration(id);
  }

  // --- Goals (HR / manager).

  @RequirePermissions('performance:read')
  @Get('performance/goals')
  listGoals(@Query('employeeId') employeeId: string) {
    return this.goals.listForEmployee(employeeId);
  }

  @RequirePermissions('performance:manage')
  @Post('performance/goals')
  createGoal(@CurrentUser() user: AuthUser, @Body() body: CreateGoalInput) {
    return this.goals.create(user, body);
  }

  @RequirePermissions('performance:manage')
  @Patch('performance/goals/:id')
  updateGoal(
    @Param('id') id: string,
    @Body() body: { progress?: number; status?: GoalStatus },
  ) {
    return this.goals.update(id, body);
  }

  // --- Appraisals.

  @RequirePermissions('performance:read')
  @Get('performance/appraisals')
  listAppraisals(@Query('cycleId') cycleId: string) {
    return this.appraisals.listForCycle(cycleId);
  }

  @RequirePermissions('performance:read')
  @Get('performance/appraisals/:id')
  getAppraisal(@Param('id') id: string) {
    return this.appraisals.get(id);
  }

  // A manager reviews their report; the service checks the manager relationship
  // (or performance:manage for HR), so performance:read is the right gate.
  @RequirePermissions('performance:read')
  @Post('performance/appraisals/:id/manager-review')
  managerReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { rating?: number; comments?: string },
  ) {
    return this.appraisals.managerReview(
      user,
      id,
      body?.rating as number,
      body?.comments,
    );
  }

  @RequirePermissions('performance:manage')
  @Post('performance/appraisals/:id/calibrate')
  calibrateAppraisal(
    @Param('id') id: string,
    @Body() body: { finalRating?: number },
  ) {
    return this.appraisals.calibrate(id, body?.finalRating as number);
  }

  @RequirePermissions('performance:manage')
  @Post('performance/appraisals/:id/outcome')
  setOutcome(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: OutcomeInput,
  ) {
    return this.appraisals.setOutcome(user, id, body);
  }

  @RequirePermissions('performance:manage')
  @Post('performance/appraisals/:id/outcome/apply')
  applyOutcome(@Param('id') id: string) {
    return this.appraisals.applyOutcome(id);
  }
}
