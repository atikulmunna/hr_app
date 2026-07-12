import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import {
  CreateApprovalInput,
  WorkflowService,
} from './workflow.service';

interface DecideBody {
  decision: 'approve' | 'reject';
  comment?: string;
}

// Generic approval endpoints. Feature modules normally call WorkflowService
// directly; these support manager review queues and testing.
@Controller('approvals')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post()
  create(@Body() body: CreateApprovalInput) {
    return this.workflow.createRequest(body);
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.workflow.listPendingForRoles(user.roles);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workflow.getRequest(id);
  }

  @Post(':id/decide')
  decide(
    @Param('id') id: string,
    @Body() body: DecideBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workflow.decide(
      id,
      body.decision,
      { sub: user.sub, roles: user.roles },
      body.comment,
    );
  }
}
