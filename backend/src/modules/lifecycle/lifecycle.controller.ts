import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { assertKind, ChecklistService } from './checklist.service';
import { OrgChartService } from './org-chart.service';

interface OpenChecklistBody {
  employeeId?: string;
  kind?: string;
  anchorDate?: string;
}

// Employee lifecycle (T-3.4b): the org chart (FR-M1-06) and on/offboarding
// checklists (FR-M1-10). HR administers templates and checklists; anyone may
// read and complete the tasks their own roles owe via /me/tasks.
@Controller()
export class LifecycleController {
  constructor(
    private readonly orgChart: OrgChartService,
    private readonly checklists: ChecklistService,
  ) {}

  @RequirePermissions('org:read')
  @Get('org/chart')
  chart() {
    return this.orgChart.chart();
  }

  // --- Templates.

  @RequirePermissions('org:read')
  @Get('lifecycle/templates')
  templates() {
    return this.checklists.templates();
  }

  @RequirePermissions('org:manage')
  @Put('lifecycle/templates/:kind')
  replaceTemplate(
    @Param('kind') kind: string,
    @Body() body: { items?: unknown },
  ) {
    return this.checklists.replaceTemplate(assertKind(kind), body?.items);
  }

  // --- Checklists.

  @RequirePermissions('employee:read')
  @Get('lifecycle/checklists')
  list(@Query('status') status?: string) {
    return this.checklists.list(status);
  }

  @RequirePermissions('employee:read')
  @Get('lifecycle/checklists/:id')
  get(@Param('id') id: string) {
    return this.checklists.get(id);
  }

  @RequirePermissions('employee:manage')
  @Post('lifecycle/checklists')
  open(@Body() body: OpenChecklistBody, @CurrentUser() user: AuthUser) {
    return this.checklists.openManually(body, user);
  }

  // --- Tasks, scoped to the caller's roles.

  @Get('me/tasks')
  myTasks(@CurrentUser() user: AuthUser) {
    return this.checklists.myTasks(user);
  }

  @Post('me/tasks/:itemId/complete')
  complete(
    @Param('itemId') itemId: string,
    @Body() body: { note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.checklists.completeItem(user, itemId, body?.note);
  }
}
