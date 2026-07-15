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
  departmentId?: string;
  employmentType: string;
  status: string;
  remoteAllowed: boolean;
  erasedAt?: string | null;
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

export interface LegalEntity {
  id: string;
  name: string;
  countryCode: string;
}

export interface Department {
  id: string;
  name: string;
  legalEntityId: string;
}

export interface CreateEmployeeBody {
  legalEntityId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  employmentType?: string;
  departmentId?: string;
}

export interface UpdateEmployeeBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
  employmentType?: string;
  departmentId?: string;
  status?: string;
  remoteAllowed?: boolean;
}

export interface CreateGeofenceBody {
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  legalEntityId?: string;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  legalEntityId?: string | null;
  annualQuota: number;
  carryForwardCap: number;
  noticeDays: number;
  paid: boolean;
  encashable: boolean;
  active: boolean;
}

export interface CreateLeaveTypeBody {
  code: string;
  name: string;
  legalEntityId?: string;
  annualQuota: number;
  carryForwardCap: number;
  noticeDays: number;
  paid: boolean;
  encashable: boolean;
}

export interface Holiday {
  id: string;
  holidayDate: string;
  name: string;
  legalEntityId?: string | null;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  active: boolean;
  legalEntityId?: string | null;
}

export interface CreateShiftBody {
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  legalEntityId?: string;
}

export interface DaySummary {
  day: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  workedHours: number | null;
  overtimeHours: number;
}

export interface AttendanceSummary {
  shift: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    expectedHours: number;
  } | null;
  days: DaySummary[];
  totals: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    leaveDays: number;
    workedHours: number;
    overtimeHours: number;
  };
}

export interface AbsenceRecord {
  id: string;
  absenceDate: string;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
}

export interface LeaveRequestRow {
  id: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason?: string | null;
  typeName: string;
  typeCode: string;
  status: string | null;
}

export interface CreateHolidayBody {
  holidayDate: string;
  name: string;
  legalEntityId?: string;
}

export type CorrectionType = 'missing_check_in' | 'missing_check_out' | 'both';

export interface RegularizationRow {
  id: string;
  targetDate: string;
  correctionType: CorrectionType;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
  origin: string;
  appliedAt: string | null;
  createdAt: string;
  status: string;
}

export interface AdminRegularizationBody {
  targetDate: string;
  correctionType: CorrectionType;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  reason: string;
}

export interface TeamMember {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  shiftName: string | null;
  todayStatus: string;
}

export interface TeamAttendanceRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  shiftName: string | null;
  totals: AttendanceSummary['totals'];
}

export interface TeamLeaveRow {
  id: string;
  employeeId: string;
  name: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  typeCode: string;
  typeName: string;
  status: string;
}

export interface ErasureResult {
  employeeId: string;
  erasedAt: string;
  erased: string[];
  retained: string[];
  note: string;
}

export interface ConsentStatement {
  id: string;
  platform: string;
  version: number;
  body: string;
  signals: string[];
  active: boolean;
  createdAt: string;
}

export interface PublishConsentBody {
  platform: string;
  body: string;
  signals: string[];
}

export interface AttendanceConfig {
  weights: Record<string, number>;
  yellowThreshold: number;
  redThreshold: number;
  scoreCeiling: number;
  accuracyLimitM: number;
  criticalSignals: string[];
  cooccurrenceThreshold: number;
  hardBlockSignals: string[];
  offlineWindowHours: number;
  markingStart: string | null;
  markingEnd: string | null;
}

export interface ReviewCase {
  id: string;
  status: string;
  reason: string;
  signals: string[];
  createdAt: string;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  eventId: string;
  eventType: string;
  serverTs: string;
  band: string;
  riskScore: number;
  lat?: number | null;
  lng?: number | null;
  remote: boolean;
  geofencePass?: boolean | null;
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

export interface RiskRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  openCases: number;
  totalCases: number;
  recentRedMarks: number;
  lastFlaggedAt: string;
}

export type ReviewDecision = 'accept' | 'reject' | 'adjust';

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
  team: (token: string) => request<TeamMember[]>(token, '/me/team'),
  teamAttendance: (token: string, from: string, to: string) =>
    request<TeamAttendanceRow[]>(
      token,
      `/me/team/attendance?from=${from}&to=${to}`,
    ),
  teamLeave: (token: string, from: string, to: string) =>
    request<TeamLeaveRow[]>(token, `/me/team/leave?from=${from}&to=${to}`),
  consentStatements: (token: string) =>
    request<ConsentStatement[]>(token, '/consent/statements'),
  publishConsentStatement: (token: string, body: PublishConsentBody) =>
    request<ConsentStatement>(token, '/consent/statements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  attendanceConfig: (token: string) =>
    request<AttendanceConfig>(token, '/attendance/config'),
  updateAttendanceConfig: (
    token: string,
    patch: Partial<AttendanceConfig>,
  ) =>
    request<AttendanceConfig>(token, '/attendance/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  employees: (token: string) => request<Employee[]>(token, '/employees'),
  createEmployee: (token: string, body: CreateEmployeeBody) =>
    request<Employee>(token, '/employees', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateEmployee: (token: string, id: string, patch: UpdateEmployeeBody) =>
    request<Employee>(token, `/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  entities: (token: string) => request<LegalEntity[]>(token, '/entities'),
  departments: (token: string) => request<Department[]>(token, '/departments'),
  leaveTypes: (token: string) => request<LeaveType[]>(token, '/leave-types'),
  createLeaveType: (token: string, body: CreateLeaveTypeBody) =>
    request<LeaveType>(token, '/leave-types', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateLeaveType: (
    token: string,
    id: string,
    patch: Partial<CreateLeaveTypeBody> & { active?: boolean },
  ) =>
    request<LeaveType>(token, `/leave-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  holidays: (token: string) => request<Holiday[]>(token, '/holidays'),
  createHoliday: (token: string, body: CreateHolidayBody) =>
    request<Holiday>(token, '/holidays', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteHoliday: (token: string, id: string) =>
    request<unknown>(token, `/holidays/${id}`, { method: 'DELETE' }),
  employeeDevices: (token: string, id: string) =>
    request<Device[]>(token, `/employees/${id}/devices`),
  employeeDeviceHistory: (token: string, id: string) =>
    request<DeviceHistoryEntry[]>(token, `/employees/${id}/device-history`),
  employeeGeofences: (token: string, id: string) =>
    request<Geofence[]>(token, `/employees/${id}/geofences`),
  employeeLeaveRequests: (token: string, id: string) =>
    request<LeaveRequestRow[]>(token, `/employees/${id}/leave/requests`),
  employeeShift: (token: string, id: string) =>
    request<Shift | null>(token, `/employees/${id}/shift`),
  assignShift: (token: string, id: string, shiftId: string) =>
    request<unknown>(token, `/employees/${id}/shift`, {
      method: 'POST',
      body: JSON.stringify({ shiftId }),
    }),
  unassignShift: (token: string, id: string) =>
    request<unknown>(token, `/employees/${id}/shift`, { method: 'DELETE' }),
  employeeSummary: (token: string, id: string, from: string, to: string) =>
    request<AttendanceSummary>(
      token,
      `/employees/${id}/attendance-summary?from=${from}&to=${to}`,
    ),
  employeeAbsences: (token: string, id: string) =>
    request<AbsenceRecord[]>(token, `/employees/${id}/absences`),
  dataExport: (token: string, id: string) =>
    request<Record<string, unknown>>(token, `/employees/${id}/data-export`),
  eraseEmployee: (token: string, id: string) =>
    request<ErasureResult>(token, `/employees/${id}/erasure`, {
      method: 'POST',
    }),
  reverseAbsence: (token: string, id: string, reason?: string) =>
    request<unknown>(token, `/attendance/absences/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  employeeRegularizations: (token: string, id: string) =>
    request<RegularizationRow[]>(
      token,
      `/employees/${id}/attendance/regularizations`,
    ),
  adminRegularization: (token: string, id: string, body: AdminRegularizationBody) =>
    request<RegularizationRow>(
      token,
      `/employees/${id}/attendance/regularizations`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  shifts: (token: string) => request<Shift[]>(token, '/shifts'),
  createShift: (token: string, body: CreateShiftBody) =>
    request<Shift>(token, '/shifts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateShift: (
    token: string,
    id: string,
    patch: Partial<CreateShiftBody> & { active?: boolean },
  ) =>
    request<Shift>(token, `/shifts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  geofences: (token: string) => request<Geofence[]>(token, '/geofences'),
  createGeofence: (token: string, body: CreateGeofenceBody) =>
    request<Geofence>(token, '/geofences', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setGeofenceActive: (token: string, id: string, active: boolean) =>
    request<Geofence>(token, `/geofences/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
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
