import { request } from './client';
import {
  AppNotification,
  ApprovalRequest,
  Decision,
  Page,
  ReviewCase,
  ReviewDecision,
  RiskRow,
} from './types';

// Approvals, notifications and review cases.
export const workflow = {
  pendingApprovals: (token: string) =>
    request<ApprovalRequest[]>(token, '/approvals/pending'),
  decide: (token: string, id: string, decision: Decision, comment?: string) =>
    request<unknown>(token, `/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    }),
  notifications: (token: string, limit = 50, offset = 0) =>
    request<Page<AppNotification>>(
      token,
      `/notifications?limit=${limit}&offset=${offset}`,
    ),
  markNotificationRead: (token: string, id: string) =>
    request<unknown>(token, `/notifications/${id}/read`, { method: 'POST' }),
  reviewCases: (token: string, status = 'open') =>
    request<ReviewCase[]>(token, `/review-cases?status=${status}`),
  reviewRisk: (token: string) =>
    request<RiskRow[]>(token, '/review-cases/risk'),
  resolveReviewCase: (
    token: string,
    id: string,
    decision: ReviewDecision,
    note?: string,
  ) =>
    request<unknown>(token, `/review-cases/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    }),
};
