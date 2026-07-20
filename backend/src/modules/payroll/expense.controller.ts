import { Response } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  CreateExpenseCategoryInput,
  ExpenseCategoryService,
  UpdateExpenseCategoryInput,
} from './expense-category.service';
import { AddLineInput, ExpenseClaimService } from './expense-claim.service';
import { ExpenseSettlementMethod } from '../../entities/expense-claim.entity';

// Expense claims (T-2.6, FR-M8-01 to FR-M8-03). Employees build and submit their
// own claims (self-service, like leave); HR manages the category catalog and
// settles approved claims (payroll permissions, since settlement runs through
// payroll).
@Controller()
export class ExpenseController {
  constructor(
    private readonly categories: ExpenseCategoryService,
    private readonly claims: ExpenseClaimService,
  ) {}

  // --- Employee self-service.

  // The categories an employee can pick when itemising a claim.
  @Get('me/expenses/categories')
  myCategories() {
    return this.categories.list(true);
  }

  @Get('me/expenses')
  myClaims(@CurrentUser() user: AuthUser) {
    return this.claims.mine(user);
  }

  @Post('me/expenses')
  createClaim(@CurrentUser() user: AuthUser, @Body() body: { title?: string }) {
    return this.claims.create(user, body?.title);
  }

  @Post('me/expenses/:id/lines')
  addLine(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AddLineInput,
  ) {
    return this.claims.addLine(user, id, body);
  }

  @Delete('me/expenses/:id/lines/:lineId')
  removeLine(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.claims.removeLine(user, id, lineId);
  }

  @Post('me/expenses/:id/submit')
  submitClaim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.claims.submit(user, id);
  }

  @Post('me/expenses/:id/cancel')
  cancelClaim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.claims.cancel(user, id);
  }

  @Get('me/expenses/:id/lines/:lineId/receipt')
  async myReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Res() res: Response,
  ) {
    const file = await this.claims.receipt(id, lineId, user);
    this.streamReceipt(res, file);
  }

  // --- HR category catalog.

  @RequirePermissions('payroll:read')
  @Get('expenses/categories')
  listCategories(@Query('activeOnly') activeOnly?: string) {
    return this.categories.list(activeOnly === 'true');
  }

  @RequirePermissions('payroll:manage')
  @Post('expenses/categories')
  createCategory(@Body() body: CreateExpenseCategoryInput) {
    return this.categories.create(body);
  }

  @RequirePermissions('payroll:manage')
  @Patch('expenses/categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() body: UpdateExpenseCategoryInput,
  ) {
    return this.categories.update(id, body);
  }

  @RequirePermissions('payroll:manage')
  @Delete('expenses/categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  // --- HR claim review and settlement.

  @RequirePermissions('payroll:read')
  @Get('expenses/claims')
  listClaims(@Query('legalEntityId') legalEntityId?: string) {
    return this.claims.listAll(legalEntityId);
  }

  @RequirePermissions('payroll:read')
  @Get('expenses/claims/:id')
  getClaim(@Param('id') id: string) {
    return this.claims.get(id);
  }

  @RequirePermissions('payroll:manage')
  @Post('expenses/claims/:id/settle')
  settleClaim(
    @Param('id') id: string,
    @Body() body: { method?: ExpenseSettlementMethod },
    @CurrentUser() user: AuthUser,
  ) {
    return this.claims.settle(id, body?.method as ExpenseSettlementMethod, user);
  }

  @RequirePermissions('payroll:read')
  @Get('expenses/claims/:id/lines/:lineId/receipt')
  async claimReceipt(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Res() res: Response,
  ) {
    const file = await this.claims.receipt(id, lineId);
    this.streamReceipt(res, file);
  }

  private streamReceipt(
    res: Response,
    file: { filename: string; mime: string; bytes: Buffer },
  ) {
    res.setHeader('Content-Type', file.mime);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.filename.replace(/"/g, '')}"`,
    );
    res.end(file.bytes);
  }
}
