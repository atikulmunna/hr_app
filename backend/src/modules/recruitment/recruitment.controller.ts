import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  ApplicationService,
  CreateApplicationInput,
  ScheduleInterviewInput,
  ScorecardInput,
} from './application.service';
import { CreateOfferInput, OfferService } from './offer.service';
import {
  CreateRequisitionInput,
  RequisitionService,
} from './requisition.service';
import { CreateStageInput, StageService } from './stage.service';

// Recruitment / ATS (T-3.1, FR-M5-01 to FR-M5-07). Viewing needs
// recruitment:read (interviewers submit scorecards with it too); everything that
// changes the pipeline needs recruitment:manage. Requisition approval flows
// through the shared workflow, decided in the Approvals tab, so it needs no
// extra permission here.
@Controller('recruitment')
export class RecruitmentController {
  constructor(
    private readonly stages: StageService,
    private readonly requisitions: RequisitionService,
    private readonly applications: ApplicationService,
    private readonly offers: OfferService,
  ) {}

  // --- Pipeline stage configuration.

  @RequirePermissions('recruitment:read')
  @Get('stages')
  listStages() {
    return this.stages.list();
  }

  @RequirePermissions('recruitment:manage')
  @Post('stages')
  createStage(@Body() body: CreateStageInput) {
    return this.stages.create(body);
  }

  @RequirePermissions('recruitment:manage')
  @Patch('stages/:id')
  updateStage(@Param('id') id: string, @Body() body: CreateStageInput) {
    return this.stages.update(id, body);
  }

  @RequirePermissions('recruitment:manage')
  @Delete('stages/:id')
  removeStage(@Param('id') id: string) {
    return this.stages.remove(id);
  }

  // --- Requisitions.

  @RequirePermissions('recruitment:read')
  @Get('requisitions')
  listRequisitions() {
    return this.requisitions.list();
  }

  @RequirePermissions('recruitment:read')
  @Get('requisitions/:id')
  getRequisition(@Param('id') id: string) {
    return this.requisitions.get(id);
  }

  @RequirePermissions('recruitment:manage')
  @Post('requisitions')
  createRequisition(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateRequisitionInput,
  ) {
    return this.requisitions.create(user, body);
  }

  @RequirePermissions('recruitment:manage')
  @Post('requisitions/:id/submit')
  submitRequisition(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requisitions.submit(user, id);
  }

  @RequirePermissions('recruitment:manage')
  @Post('requisitions/:id/close')
  closeRequisition(@Param('id') id: string) {
    return this.requisitions.close(id);
  }

  // --- Applications and interviews.

  @RequirePermissions('recruitment:read')
  @Get('applications')
  listApplications(@Query('requisitionId') requisitionId: string) {
    return this.applications.listByRequisition(requisitionId);
  }

  @RequirePermissions('recruitment:read')
  @Get('applications/:id')
  getApplication(@Param('id') id: string) {
    return this.applications.get(id);
  }

  @RequirePermissions('recruitment:manage')
  @Post('applications')
  createApplication(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateApplicationInput,
  ) {
    return this.applications.create(user, body);
  }

  @RequirePermissions('recruitment:manage')
  @Post('applications/:id/move')
  moveApplication(@Param('id') id: string, @Body() body: { stageId?: string }) {
    return this.applications.move(id, body?.stageId ?? '');
  }

  @RequirePermissions('recruitment:manage')
  @Post('applications/:id/reject')
  rejectApplication(@Param('id') id: string) {
    return this.applications.reject(id);
  }

  @RequirePermissions('recruitment:manage')
  @Post('applications/:id/interviews')
  scheduleInterview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ScheduleInterviewInput,
  ) {
    return this.applications.scheduleInterview(user, id, body);
  }

  // An interviewer submits their scorecard: recruitment:read is enough, so
  // hiring managers can score without full pipeline management rights.
  @RequirePermissions('recruitment:read')
  @Post('interviews/:id/scorecards')
  addScorecard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ScorecardInput,
  ) {
    return this.applications.addScorecard(user, id, body);
  }

  // --- Offers.

  @RequirePermissions('recruitment:read')
  @Get('applications/:id/offer')
  getOffer(@Param('id') id: string) {
    return this.offers.getByApplication(id);
  }

  @RequirePermissions('recruitment:manage')
  @Post('applications/:id/offer')
  createOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateOfferInput,
  ) {
    return this.offers.create(user, id, body);
  }

  @RequirePermissions('recruitment:manage')
  @Post('offers/:id/sign')
  signOffer(
    @Param('id') id: string,
    @Body() body: { signerName?: string },
    @Ip() ip: string,
  ) {
    return this.offers.sign(id, body?.signerName ?? '', ip);
  }

  @RequirePermissions('recruitment:manage')
  @Post('offers/:id/decline')
  declineOffer(@Param('id') id: string) {
    return this.offers.decline(id);
  }

  @RequirePermissions('recruitment:manage')
  @Post('offers/:id/convert')
  convertOffer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offers.convert(user, id);
  }
}
