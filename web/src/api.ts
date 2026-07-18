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
  currencyCode: string;
  // How payroll prorates an incomplete month of work in this jurisdiction.
  prorationBasis: 'calendar_days' | 'working_days';
  // The overtime rate is base / divisor x multiplier.
  overtimeMultiplier: string;
  overtimeBase: 'basic' | 'gross';
  overtimeDivisor: 'expected_hours' | 'fixed_hours';
  overtimeFixedHours?: string | null;
}

export interface PayRulesBody {
  prorationBasis?: 'calendar_days' | 'working_days';
  overtimeMultiplier?: number;
  overtimeBase?: 'basic' | 'gross';
  overtimeDivisor?: 'expected_hours' | 'fixed_hours';
  overtimeFixedHours?: number | null;
}

export type OvertimeSource = 'derived' | 'declared';

export interface OvertimeRow {
  id: string;
  workDate: string;
  hours: number;
  source: OvertimeSource;
  reason: string;
  status: string;
  createdAt: string;
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

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; employeeCode: string | null; message: string }[];
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

export interface RosterEntry {
  id: string;
  workDate: string;
  shiftId: string;
  source: string;
  note?: string | null;
  shiftName: string;
  startTime: string;
  endTime: string;
}

export type PayComponentType = 'basic' | 'allowance' | 'bonus' | 'deduction';

export interface PayComponent {
  id: string;
  legalEntityId?: string | null;
  code: string;
  name: string;
  componentType: PayComponentType;
  taxable: boolean;
  active: boolean;
}

export interface CreatePayComponentBody {
  code: string;
  name: string;
  componentType: PayComponentType;
  legalEntityId?: string;
  taxable?: boolean;
}

export interface CompensationLine {
  id: string;
  payComponentId: string;
  code: string;
  name: string;
  componentType: PayComponentType;
  taxable: boolean;
  amount: number;
  effectiveFrom: string;
}

// One dated revision, including ones not yet in force.
export interface CompensationRevision {
  id: string;
  payComponentId: string;
  code: string;
  name: string;
  componentType: PayComponentType;
  amount: number;
  effectiveFrom: string;
}

// An employee's pay structure, denominated in their legal entity currency and
// resolved as of a date (the amounts in force on it).
export interface CompensationSummary {
  employeeId: string;
  currencyCode: string;
  asOf: string;
  lines: CompensationLine[];
  gross: number;
  deductions: number;
  net: number;
}

export type PayrollRunType = 'monthly' | 'off_cycle';

export type PayrollRunStatus = 'draft' | 'locked' | 'approved';

export interface PayrollRun {
  id: string;
  legalEntityId: string;
  periodStart: string;
  periodEnd: string;
  cutoffDate: string;
  runType: PayrollRunType;
  currencyCode: string;
  prorationBasis: 'calendar_days' | 'working_days';
  status: PayrollRunStatus;
  lockedAt?: string | null;
  approvedAt?: string | null;
  approvalRequestId?: string | null;
  createdAt: string;
}

// A preview finding. 'blocking' refuses the lock; 'warning' is worth a look.
export interface RunIssue {
  severity: 'blocking' | 'warning';
  employeeCode?: string;
  message: string;
}

// A run in the list, carrying the issues that decide whether it can lock.
export interface PayrollRunListItem extends PayrollRun {
  issues: RunIssue[];
}

export interface PayrollRunLineView {
  code: string;
  name: string;
  componentType: PayComponentType;
  // 'statutory' lines are computed from the entity's rules, not the catalog.
  source: 'component' | 'statutory';
  baseAmount: number;
  prorationFactor: number;
  amount: number;
}

// One off-cycle adjustment settled into a run (T-2.5), signed.
export interface RunAdjustmentLine {
  reason: string;
  amount: number;
  sourceRunId: string | null;
}

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  reason: string;
  amount: number;
  currencyCode: string;
  status: string;
  sourceRunId: string | null;
  settledRunId: string | null;
  createdAt: string;
}

export interface CreateAdjustmentBody {
  employeeId: string;
  amount: number;
  reason: string;
  sourceRunId?: string;
}

export type StatutoryCalculation = 'percentage' | 'bracket';

export interface StatutoryBracketView {
  lowerBound: number;
  upperBound: number | null;
  rate: number;
}

export interface StatutoryRule {
  id: string;
  legalEntityId: string;
  code: string;
  name: string;
  calculation: StatutoryCalculation;
  base: 'basic' | 'gross';
  employeeRate: string;
  employerRate: string;
  wageCeiling?: string | null;
  effectiveFrom: string;
  active: boolean;
  brackets: StatutoryBracketView[];
}

export interface CreateStatutoryRuleBody {
  legalEntityId: string;
  code: string;
  name: string;
  calculation: StatutoryCalculation;
  base: 'basic' | 'gross';
  employeeRate?: number;
  employerRate?: number;
  wageCeiling?: number | null;
  effectiveFrom: string;
  brackets?: { lowerBound: number; upperBound: number | null; rate: number }[];
}

export interface PayrollRunEmployeeView {
  employeeId: string;
  employeeCode: string;
  name: string;
  currencyCode: string;
  payableDays: number;
  periodDays: number;
  prorationFactor: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  workedHours: number;
  overtimeHours: number;
  overtimeAmount: number;
  gross: number;
  deductions: number;
  // Signed total of off-cycle adjustments settled into this run (T-2.5).
  adjustments: number;
  net: number;
  // Employer-side statutory cost. Never reduces net.
  employerContributions: number;
  lines: PayrollRunLineView[];
  adjustmentLines: RunAdjustmentLine[];
}

export interface PayrollRunDetail extends PayrollRun {
  employees: PayrollRunEmployeeView[];
  issues: RunIssue[];
  totals: {
    employees: number;
    gross: number;
    deductions: number;
    adjustments: number;
    net: number;
    employerContributions: number;
  };
}

export interface CreatePayrollRunBody {
  legalEntityId: string;
  periodStart: string;
  periodEnd: string;
  cutoffDate?: string;
  runType?: PayrollRunType;
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
  enrichmentStatus: string;
  enrichmentSignals: string[];
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
  exportEmployeesCsv: async (token: string): Promise<string> => {
    const res = await fetch(`${config.apiBase}/employees/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText);
    }
    return res.text();
  },
  importEmployeesCsv: (token: string, csv: string) =>
    request<ImportResult>(token, '/employees/import', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    }),
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
  employeeRoster: (token: string, id: string, from: string, to: string) =>
    request<RosterEntry[]>(
      token,
      `/employees/${id}/roster?from=${from}&to=${to}`,
    ),
  assignRoster: (
    token: string,
    id: string,
    body: { workDate: string; shiftId: string; note?: string },
  ) =>
    request<RosterEntry>(token, `/employees/${id}/roster`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  assignRosterRange: (
    token: string,
    id: string,
    body: { from: string; to: string; shiftId: string; note?: string },
  ) =>
    request<{ assigned: number }>(token, `/employees/${id}/roster/range`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeRoster: (token: string, id: string) =>
    request<unknown>(token, `/roster/${id}`, { method: 'DELETE' }),
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
    body: { workDate: string; hours: number; source: OvertimeSource; reason: string },
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
      throw new ApiError(res.status, await errorMessage(res));
    }
    return res.blob();
  },
  bankFileCsv: async (token: string, runId: string): Promise<string> => {
    const res = await fetch(`${config.apiBase}/payroll/runs/${runId}/bank-file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(res.status, await errorMessage(res));
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
};

// Pulls the server's message out of a failed non-JSON response where possible,
// so a download failure reads as a reason rather than a status code.
async function errorMessage(res: globalThis.Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
