import { request } from './client';
import {
  CompensationRevision,
  CompensationSummary,
  CreateAdjustmentBody,
  CreateExpenseCategoryBody,
  CreatePayComponentBody,
  CreateStatutoryRuleBody,
  ExpenseCategory,
  LegalEntity,
  OvertimeRow,
  OvertimeSource,
  PayComponent,
  PayRulesBody,
  PayrollAdjustment,
  PayrollRunListItem,
  StatutoryRule,
} from './types';

// Pay structure, runs, statutory rules and expenses.
export const payroll = {
  payComponents: (token: string) =>
    request<PayComponent[]>(token, '/pay-components'),
  createPayComponent: (token: string, body: CreatePayComponentBody) =>
    request<PayComponent>(token, '/pay-components', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePayComponent: (
    token: string,
    id: string,
    patch: { name?: string; taxable?: boolean; active?: boolean },
  ) =>
    request<PayComponent>(token, `/pay-components/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  employeeCompensation: (token: string, id: string, asOf?: string) =>
    request<CompensationSummary>(
      token,
      `/employees/${id}/compensation${asOf ? `?asOf=${asOf}` : ''}`,
    ),
  compensationRevisions: (token: string, id: string) =>
    request<CompensationRevision[]>(
      token,
      `/employees/${id}/compensation/revisions`,
    ),
  updatePayRules: (token: string, id: string, body: PayRulesBody) =>
    request<LegalEntity>(token, `/entities/${id}/pay-rules`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  employeeOvertime: (token: string, id: string) =>
    request<OvertimeRow[]>(token, `/employees/${id}/attendance/overtime`),
  createOvertime: (
    token: string,
    id: string,
    body: {
      workDate: string;
      hours: number;
      source: OvertimeSource;
      reason: string;
    },
  ) =>
    request<unknown>(token, `/employees/${id}/attendance/overtime`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  statutoryRules: (token: string) =>
    request<StatutoryRule[]>(token, '/statutory-rules'),
  createStatutoryRule: (token: string, body: CreateStatutoryRuleBody) =>
    request<StatutoryRule>(token, '/statutory-rules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setStatutoryRuleActive: (token: string, id: string, active: boolean) =>
    request<StatutoryRule>(token, `/statutory-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  deleteStatutoryRule: (token: string, id: string) =>
    request<unknown>(token, `/statutory-rules/${id}`, { method: 'DELETE' }),
  payrollRuns: (token: string) =>
    request<PayrollRunListItem[]>(token, '/payroll/runs'),
  payrollAdjustments: (token: string) =>
    request<PayrollAdjustment[]>(token, '/payroll/adjustments'),
  createPayrollAdjustment: (token: string, body: CreateAdjustmentBody) =>
    request<PayrollAdjustment>(token, '/payroll/adjustments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelPayrollAdjustment: (token: string, id: string) =>
    request<unknown>(token, `/payroll/adjustments/${id}`, { method: 'DELETE' }),
  expenseCategories: (token: string) =>
    request<ExpenseCategory[]>(token, '/expenses/categories'),
  createExpenseCategory: (token: string, body: CreateExpenseCategoryBody) =>
    request<ExpenseCategory>(token, '/expenses/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateExpenseCategory: (
    token: string,
    id: string,
    body: { name?: string; limitAmount?: number | null; active?: boolean },
  ) =>
    request<ExpenseCategory>(token, `/expenses/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteExpenseCategory: (token: string, id: string) =>
    request<unknown>(token, `/expenses/categories/${id}`, { method: 'DELETE' }),
};
