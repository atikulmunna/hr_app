import { config } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApprovalRequest {
  id: string;
  requestType: string;
  resourceType?: string;
  resourceId?: string;
  requesterSub?: string;
  status: string;
  currentStep: number;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export type Decision = 'approve' | 'reject';

async function request<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${config.apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const raw = body?.message;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : (raw ?? res.statusText);
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  pendingApprovals: (token: string) =>
    request<ApprovalRequest[]>(token, '/approvals/pending'),
  decide: (token: string, id: string, decision: Decision, comment?: string) =>
    request<unknown>(token, `/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    }),
};
