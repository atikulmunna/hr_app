import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { WorkflowService } from './workflow.service';

interface DecideBody {
  decision: 'approve' | 'reject';
  comment?: string;
}

// The approver's queue and decision endpoints. Requests are only ever raised by
// feature modules calling WorkflowService, which is what fixes the approver
// roles for each request type; there is deliberately no generic create route.
@Controller('approvals')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.workflow.listPendingForRoles(user.roles, user.sub);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workflow.getRequest(id, { sub: user.sub, roles: user.roles });
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
