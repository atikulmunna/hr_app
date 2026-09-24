import { ApiError, request, responseMessage } from './client';
import { config } from '../config';
import {
  CompensationSummary,
  CreatePayrollRunBody,
  ExpenseClaim,
  ExpenseSettlementMethod,
  PayrollRunDetail,
} from './types';

// Expense settlement, runs, payslips and compensation.
export const payrollRuns = {
  expenseClaims: (token: string) =>
    request<ExpenseClaim[]>(token, '/expenses/claims'),
  settleExpenseClaim: (
    token: string,
    id: string,
    method: ExpenseSettlementMethod,
  ) =>
    request<ExpenseClaim>(token, `/expenses/claims/${id}/settle`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    }),
  // The receipt bytes need the bearer token, so fetch and hand back a blob.
  expenseReceipt: async (token: string, claimId: string, lineId: string) => {
    const res = await fetch(
      `${config.apiBase}/expenses/claims/${claimId}/lines/${lineId}/receipt`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      throw new ApiError(res.status, await responseMessage(res));
    }
    return res.blob();
  },
  payrollRun: (token: string, id: string) =>
    request<PayrollRunDetail>(token, `/payroll/runs/${id}`),
  createPayrollRun: (token: string, body: CreatePayrollRunBody) =>
    request<PayrollRunDetail>(token, '/payroll/runs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recomputePayrollRun: (token: string, id: string) =>
    request<PayrollRunDetail>(token, `/payroll/runs/${id}/recompute`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  deletePayrollRun: (token: string, id: string) =>
    request<unknown>(token, `/payroll/runs/${id}`, { method: 'DELETE' }),
  lockPayrollRun: (token: string, id: string) =>
    request<PayrollRunDetail>(token, `/payroll/runs/${id}/lock`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  // Both downloads need the bearer token, so they fetch and hand back a blob
  // rather than pointing an anchor at the URL.
  payslipPdf: async (token: string, runId: string, employeeId: string) => {
    const res = await fetch(
      `${config.apiBase}/payroll/runs/${runId}/payslips/${employeeId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      throw new ApiError(res.status, await responseMessage(res));
    }
    return res.blob();
  },
  bankFileCsv: async (token: string, runId: string): Promise<string> => {
    const res = await fetch(
      `${config.apiBase}/payroll/runs/${runId}/bank-file`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      throw new ApiError(res.status, await responseMessage(res));
    }
    return res.text();
  },
  setCompensation: (
    token: string,
    id: string,
    body: { payComponentId: string; amount: number; effectiveFrom?: string },
  ) =>
    request<CompensationSummary>(token, `/employees/${id}/compensation`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeCompensation: (token: string, id: string, payComponentId: string) =>
    request<CompensationSummary>(
      token,
      `/employees/${id}/compensation/${payComponentId}`,
      { method: 'DELETE' },
    ),

  // --- Recruitment / ATS (T-3.1).
};
