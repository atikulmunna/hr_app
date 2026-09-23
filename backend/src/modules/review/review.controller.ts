import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { ReviewService } from './review.service';

interface ResolveBody {
  decision: string;
  note?: string;
}

// The attendance review queue (T-1C.8). HR lists flagged marks, sees the
// rolling per-employee risk view, and resolves each case.
@Controller('review-cases')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @RequirePermissions('attendance:review')
  @Get()
  list(@Query('status') status?: string) {
    return this.review.list(status);
  }

  @RequirePermissions('attendance:review')
  @Get('risk')
  risk() {
    return this.review.riskView();
  }

  @RequirePermissions('attendance:review')
  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: ResolveBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.review.resolve(id, body.decision, body.note, user.sub);
  }
}
