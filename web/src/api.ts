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

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  employmentType: string;
  status: string;
  remoteAllowed: boolean;
}

export interface Device {
  id: string;
  deviceFingerprint: string;
  platform?: string;
  model?: string;
  status: string;
  boundAt: string;
  retiredAt?: string | null;
}

export interface DeviceHistoryEntry {
  id: string;
  action: string;
  reasonCode?: string | null;
  createdAt: string;
}

export interface Geofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  active: boolean;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

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
  notifications: (token: string) =>
    request<AppNotification[]>(token, '/notifications'),
  markNotificationRead: (token: string, id: string) =>
    request<unknown>(token, `/notifications/${id}/read`, { method: 'POST' }),
  employees: (token: string) => request<Employee[]>(token, '/employees'),
  employeeDevices: (token: string, id: string) =>
    request<Device[]>(token, `/employees/${id}/devices`),
  employeeDeviceHistory: (token: string, id: string) =>
    request<DeviceHistoryEntry[]>(token, `/employees/${id}/device-history`),
  employeeGeofences: (token: string, id: string) =>
    request<Geofence[]>(token, `/employees/${id}/geofences`),
  geofences: (token: string) => request<Geofence[]>(token, '/geofences'),
  assignGeofence: (token: string, id: string, geofenceId: string) =>
    request<unknown>(token, `/employees/${id}/geofences`, {
      method: 'POST',
      body: JSON.stringify({ geofenceId }),
    }),
  unassignGeofence: (token: string, id: string, geofenceId: string) =>
    request<unknown>(token, `/employees/${id}/geofences/${geofenceId}`, {
      method: 'DELETE',
    }),
};
