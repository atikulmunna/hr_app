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

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  legalEntityId: string | null;
  limitAmount: number | null;
  active: boolean;
}

export interface CreateExpenseCategoryBody {
  code: string;
  name: string;
  legalEntityId?: string | null;
  limitAmount?: number | null;
}

export interface ExpenseClaimLine {
  id: string;
  categoryCode: string;
  categoryName: string;
  expenseDate: string;
  description: string;
  amount: number;
  hasReceipt: boolean;
  receiptFilename: string | null;
}

export type ExpenseSettlementMethod = 'payroll' | 'disbursement';

export interface ExpenseClaim {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  title: string;
  currencyCode: string;
  status: string;
  total: number;
  settlementMethod: string | null;
  settledAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  lines: ExpenseClaimLine[];
}

export interface HeadcountAnalytics {
  total: number;
  byEntity: { legalEntityId: string; name: string; headcount: number }[];
  byDepartment: { name: string; headcount: number }[];
  trend: { month: string; headcount: number }[];
}

export interface AttritionAnalytics {
  months: number;
  rate: number;
  leavers: number;
  joiners: number;
  headcount: number;
  series: { month: string; joiners: number; leavers: number }[];
}

export interface AbsenceAnalytics {
  months: number;
  totalAbsence: number;
  totalLeave: number;
  series: { month: string; absenceDays: number; leaveDays: number }[];
}

export interface OvertimeAnalytics {
  months: number;
  totalHours: number;
  byEntity: {
    legalEntityId: string;
    name: string;
    currencyCode: string;
    hours: number;
    amount: number;
  }[];
  series: { month: string; hours: number }[];
}

export interface CostToCompanyEntity {
  legalEntityId: string;
  name: string;
  currencyCode: string;
  gross: number;
  employer: number;
  adjustments: number;
  net: number;
  ctc: number;
  series: { month: string; ctc: number }[];
}

export interface CostToCompanyAnalytics {
  months: number;
  entities: CostToCompanyEntity[];
}

export interface FlagRateByTeam {
  months: number;
  marks: number;
  flagged: number;
  red: number;
  rate: number;
  byTeam: {
    team: string;
    marks: number;
    flagged: number;
    red: number;
    rate: number;
  }[];
}

export interface RepeatSignalEmployee {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  marks: number;
  flagged: number;
  red: number;
  lastFlagged: string | null;
}

export interface RepeatSignals {
  months: number;
  employees: RepeatSignalEmployee[];
}

export interface DeviceRebinds {
  months: number;
  total: number;
  series: { month: string; rebinds: number }[];
  byEmployee: {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    rebinds: number;
    lastRebind: string | null;
  }[];
}

export interface Regularizations {
  months: number;
  total: number;
  series: { month: string; regularizations: number }[];
  byEmployee: {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    regularizations: number;
    lastRequest: string | null;
  }[];
}

export type ReportFilterType =
  | 'entity'
  | 'department'
  | 'select'
  | 'dateFrom'
  | 'dateTo';

export interface ReportFilterDef {
  key: string;
  label: string;
  type: ReportFilterType;
  options: string[] | null;
}

export interface ReportDataset {
  key: string;
  label: string;
  columns: { key: string; label: string }[];
  dimensions: { key: string; label: string }[];
  filters: ReportFilterDef[];
}

export interface ReportSpec {
  dataset: string;
  filters?: Record<string, string>;
  groupBy?: string;
}

export interface ReportResult {
  dataset: string;
  label: string;
  grouped: boolean;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

export type ReportExportFormat = 'csv' | 'pdf' | 'xlsx';

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
  // 'annual' rules (income tax) are annualized before the calculation.
  basis: 'monthly' | 'annual';
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
  basis: 'monthly' | 'annual';
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

// --- Recruitment / ATS (T-3.1).
export type StageOutcome = 'hired' | 'rejected';
export interface PipelineStage {
  id: string;
  name: string;
  sortOrder: number;
  isTerminal: boolean;
  outcome: StageOutcome | null;
}

export type RequisitionStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'filled';
export interface Requisition {
  id: string;
  legalEntityId: string;
  legalEntityName: string;
  departmentId: string | null;
  departmentName: string | null;
  title: string;
  headcount: number;
  employmentType: string;
  description: string | null;
  status: RequisitionStatus;
  openApplications: number;
  hires: number;
  createdAt: string;
}
export interface CreateRequisitionInput {
  legalEntityId: string;
  departmentId?: string | null;
  title: string;
  headcount?: number;
  employmentType?: string;
  description?: string;
}

export type ApplicationSource =
  | 'referral'
  | 'job_board'
  | 'agency'
  | 'campus'
  | 'direct'
  | 'other';
export type ApplicationStatus = 'active' | 'hired' | 'rejected' | 'withdrawn';
export type Recommendation = 'strong_yes' | 'yes' | 'no' | 'strong_no';
export interface Scorecard {
  id: string;
  reviewerSub: string;
  reviewerName: string | null;
  rating: number;
  recommendation: Recommendation;
  comments: string | null;
  createdAt: string;
}
export interface InterviewView {
  id: string;
  scheduledAt: string;
  mode: string;
  interviewerName: string | null;
  scorecards: Scorecard[];
}
export interface Application {
  id: string;
  requisitionId: string;
  requisitionTitle: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string | null;
  source: ApplicationSource;
  referralEmployeeId: string | null;
  referralName: string | null;
  stageId: string;
  stageName: string;
  status: ApplicationStatus;
  hasOffer: boolean;
  offerStatus: string | null;
  createdAt: string;
  interviews?: InterviewView[];
}

export type OfferStatus = 'sent' | 'signed' | 'declined' | 'rescinded';
export interface Offer {
  id: string;
  applicationId: string;
  candidateName: string;
  requisitionTitle: string;
  salaryAmount: number;
  currencyCode: string;
  startDate: string;
  letterBody: string;
  documentHash: string;
  status: OfferStatus;
  signerName: string | null;
  signedAt: string | null;
  signerIp: string | null;
  employeeId: string | null;
  createdAt: string;
}

// --- Performance management (T-3.2).
export interface RatingPoint {
  value: number;
  label: string;
}
export interface RatingScale {
  id: string;
  name: string;
  points: RatingPoint[];
}
export type CycleType = 'annual' | 'quarterly' | 'probation';
export type CycleStatus = 'draft' | 'active' | 'calibration' | 'closed';
export interface ReviewCycle {
  id: string;
  name: string;
  cycleType: CycleType;
  periodStart: string;
  periodEnd: string;
  ratingScaleId: string;
  status: CycleStatus;
  appraisals: number;
  createdAt: string;
}
export interface CreateCycleInput {
  name: string;
  cycleType: CycleType;
  periodStart: string;
  periodEnd: string;
}

export type GoalStatus = 'active' | 'achieved' | 'missed' | 'cancelled';
export interface Goal {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleId: string | null;
  parentGoalId: string | null;
  parentTitle: string | null;
  title: string;
  description: string | null;
  weight: number | null;
  progress: number;
  status: GoalStatus;
  createdAt: string;
}

export type OutcomeType = 'none' | 'promotion' | 'increment' | 'pip';
export interface AppraisalOutcome {
  outcomeType: OutcomeType;
  incrementAmount: number | null;
  incrementEffectiveDate: string | null;
  newJobTitle: string | null;
  developmentAreas: string | null;
  compensationApplied: boolean;
  appliedAt: string | null;
}
export type AppraisalStatus =
  | 'pending'
  | 'self_review'
  | 'manager_review'
  | 'calibrated'
  | 'closed';
export interface Appraisal {
  id: string;
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  selfRating: number | null;
  selfComments: string | null;
  managerRating: number | null;
  managerComments: string | null;
  finalRating: number | null;
  status: AppraisalStatus;
  outcome: AppraisalOutcome | null;
}
export interface CalibrationView {
  cycle: ReviewCycle;
  scale: RatingPoint[];
  rows: {
    appraisalId: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    status: string;
    selfRating: number | null;
    managerRating: number | null;
    finalRating: number | null;
    outcomeType: string | null;
  }[];
  distribution: { value: number; label: string; count: number }[];
}
export interface OutcomeInput {
  outcomeType: OutcomeType;
  incrementAmount?: number | null;
  incrementEffectiveDate?: string | null;
  newJobTitle?: string | null;
  developmentAreas?: string | null;
}

// --- Learning and development (T-3.3).
export interface ProficiencyLevel {
  value: number;
  label: string;
}
export interface Skill {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
}
export interface RoleSkill {
  id: string;
  role: string;
  skillId: string;
  skillName: string;
  category: string | null;
  requiredLevel: number;
}
export interface EmployeeSkillRow {
  id: string;
  employeeId: string;
  skillId: string;
  skillName: string;
  category: string | null;
  level: number;
  assessedOn: string | null;
  note: string | null;
}
export interface MatrixColumn {
  skillId: string;
  name: string;
  category: string | null;
  requiredLevel: number | null;
}
export interface MatrixCell {
  skillId: string;
  level: number | null;
  meetsRequirement: boolean;
}
export interface SkillMatrix {
  role: string;
  levels: ProficiencyLevel[];
  columns: MatrixColumn[];
  rows: {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    cells: MatrixCell[];
  }[];
}
export type CertificationStatus = 'valid' | 'expiring' | 'expired';
export interface Certification {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  name: string;
  issuer: string | null;
  credentialId: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  status: CertificationStatus;
  daysToExpiry: number | null;
  reminded: boolean;
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
  analyticsHeadcount: (token: string) =>
    request<HeadcountAnalytics>(token, '/analytics/headcount'),
  analyticsAttrition: (token: string, months = 12) =>
    request<AttritionAnalytics>(token, `/analytics/attrition?months=${months}`),
  analyticsAbsence: (token: string, months = 12) =>
    request<AbsenceAnalytics>(token, `/analytics/absence?months=${months}`),
  analyticsOvertime: (token: string, months = 12) =>
    request<OvertimeAnalytics>(token, `/analytics/overtime?months=${months}`),
  analyticsCostToCompany: (token: string, months = 12) =>
    request<CostToCompanyAnalytics>(
      token,
      `/analytics/cost-to-company?months=${months}`,
    ),
  analyticsFlagRateByTeam: (token: string, months = 12) =>
    request<FlagRateByTeam>(
      token,
      `/analytics/flag-rate-by-team?months=${months}`,
    ),
  analyticsRepeatSignals: (token: string, months = 12) =>
    request<RepeatSignals>(token, `/analytics/repeat-signals?months=${months}`),
  analyticsDeviceRebinds: (token: string, months = 12) =>
    request<DeviceRebinds>(token, `/analytics/device-rebinds?months=${months}`),
  analyticsRegularizations: (token: string, months = 12) =>
    request<Regularizations>(
      token,
      `/analytics/regularizations?months=${months}`,
    ),
  reportDatasets: (token: string) =>
    request<ReportDataset[]>(token, '/reports/datasets'),
  runReport: (token: string, spec: ReportSpec) =>
    request<ReportResult>(token, '/reports/run', {
      method: 'POST',
      body: JSON.stringify(spec),
    }),
  exportReport: async (
    token: string,
    spec: ReportSpec,
    format: ReportExportFormat,
  ) => {
    const res = await fetch(`${config.apiBase}/reports/export?format=${format}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spec),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await errorMessage(res));
    }
    return res.blob();
  },
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
      throw new ApiError(res.status, await errorMessage(res));
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

  // --- Recruitment / ATS (T-3.1).
  recruitmentStages: (token: string) =>
    request<PipelineStage[]>(token, '/recruitment/stages'),
  requisitions: (token: string) =>
    request<Requisition[]>(token, '/recruitment/requisitions'),
  requisition: (token: string, id: string) =>
    request<Requisition>(token, `/recruitment/requisitions/${id}`),
  createRequisition: (token: string, body: CreateRequisitionInput) =>
    request<Requisition>(token, '/recruitment/requisitions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitRequisition: (token: string, id: string) =>
    request<Requisition>(token, `/recruitment/requisitions/${id}/submit`, {
      method: 'POST',
    }),
  closeRequisition: (token: string, id: string) =>
    request<Requisition>(token, `/recruitment/requisitions/${id}/close`, {
      method: 'POST',
    }),
  applications: (token: string, requisitionId: string) =>
    request<Application[]>(
      token,
      `/recruitment/applications?requisitionId=${requisitionId}`,
    ),
  application: (token: string, id: string) =>
    request<Application>(token, `/recruitment/applications/${id}`),
  createApplication: (
    token: string,
    body: {
      requisitionId: string;
      candidateName: string;
      candidateEmail: string;
      candidatePhone?: string;
      source: ApplicationSource;
      referralEmployeeId?: string | null;
    },
  ) =>
    request<Application>(token, '/recruitment/applications', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  moveApplication: (token: string, id: string, stageId: string) =>
    request<Application>(token, `/recruitment/applications/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ stageId }),
    }),
  rejectApplication: (token: string, id: string) =>
    request<Application>(token, `/recruitment/applications/${id}/reject`, {
      method: 'POST',
    }),
  scheduleInterview: (
    token: string,
    id: string,
    body: {
      scheduledAt: string;
      mode: string;
      interviewerName?: string;
    },
  ) =>
    request<Application>(token, `/recruitment/applications/${id}/interviews`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  addScorecard: (
    token: string,
    interviewId: string,
    body: { rating: number; recommendation: Recommendation; comments?: string },
  ) =>
    request<Application>(
      token,
      `/recruitment/interviews/${interviewId}/scorecards`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  offer: (token: string, applicationId: string) =>
    request<Offer | null>(
      token,
      `/recruitment/applications/${applicationId}/offer`,
    ),
  createOffer: (
    token: string,
    applicationId: string,
    body: { salaryAmount: number; currencyCode?: string; startDate: string },
  ) =>
    request<Offer>(
      token,
      `/recruitment/applications/${applicationId}/offer`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  signOffer: (token: string, id: string, signerName: string) =>
    request<Offer>(token, `/recruitment/offers/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify({ signerName }),
    }),
  declineOffer: (token: string, id: string) =>
    request<Offer>(token, `/recruitment/offers/${id}/decline`, {
      method: 'POST',
    }),
  convertOffer: (token: string, id: string) =>
    request<{ employeeId: string }>(
      token,
      `/recruitment/offers/${id}/convert`,
      { method: 'POST' },
    ),

  // --- Performance management (T-3.2).
  reviewCycles: (token: string) =>
    request<ReviewCycle[]>(token, '/performance/cycles'),
  createCycle: (token: string, body: CreateCycleInput) =>
    request<ReviewCycle>(token, '/performance/cycles', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  activateCycle: (token: string, id: string) =>
    request<ReviewCycle>(token, `/performance/cycles/${id}/activate`, {
      method: 'POST',
    }),
  moveCycleToCalibration: (token: string, id: string) =>
    request<ReviewCycle>(token, `/performance/cycles/${id}/calibration`, {
      method: 'POST',
    }),
  closeCycle: (token: string, id: string) =>
    request<ReviewCycle>(token, `/performance/cycles/${id}/close`, {
      method: 'POST',
    }),
  calibrationBoard: (token: string, id: string) =>
    request<CalibrationView>(token, `/performance/cycles/${id}/calibration`),
  cycleAppraisals: (token: string, cycleId: string) =>
    request<Appraisal[]>(token, `/performance/appraisals?cycleId=${cycleId}`),
  appraisal: (token: string, id: string) =>
    request<Appraisal>(token, `/performance/appraisals/${id}`),
  calibrateAppraisal: (token: string, id: string, finalRating: number) =>
    request<Appraisal>(token, `/performance/appraisals/${id}/calibrate`, {
      method: 'POST',
      body: JSON.stringify({ finalRating }),
    }),
  setOutcome: (token: string, id: string, body: OutcomeInput) =>
    request<Appraisal>(token, `/performance/appraisals/${id}/outcome`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  applyOutcome: (token: string, id: string) =>
    request<Appraisal>(token, `/performance/appraisals/${id}/outcome/apply`, {
      method: 'POST',
    }),
  employeeGoals: (token: string, employeeId: string) =>
    request<Goal[]>(token, `/performance/goals?employeeId=${employeeId}`),
  createGoal: (
    token: string,
    body: {
      employeeId: string;
      cycleId?: string | null;
      parentGoalId?: string | null;
      title: string;
      description?: string;
      weight?: number | null;
    },
  ) =>
    request<Goal>(token, '/performance/goals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateGoal: (
    token: string,
    id: string,
    body: { progress?: number; status?: GoalStatus },
  ) =>
    request<Goal>(token, `/performance/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // --- Learning and development (T-3.3).
  proficiencyLevels: (token: string) =>
    request<ProficiencyLevel[]>(token, '/learning/levels'),
  learningRoles: (token: string) =>
    request<string[]>(token, '/learning/roles'),
  skills: (token: string) => request<Skill[]>(token, '/learning/skills'),
  createSkill: (
    token: string,
    body: { name: string; category?: string; description?: string },
  ) =>
    request<Skill>(token, '/learning/skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  roleSkills: (token: string, role: string) =>
    request<RoleSkill[]>(
      token,
      `/learning/role-skills?role=${encodeURIComponent(role)}`,
    ),
  setRoleSkill: (
    token: string,
    body: { role: string; skillId: string; requiredLevel: number },
  ) =>
    request<RoleSkill[]>(token, '/learning/role-skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeRoleSkill: (token: string, id: string) =>
    request<unknown>(token, `/learning/role-skills/${id}`, { method: 'DELETE' }),
  employeeSkills: (token: string, employeeId: string) =>
    request<EmployeeSkillRow[]>(
      token,
      `/learning/employee-skills?employeeId=${employeeId}`,
    ),
  setEmployeeSkill: (
    token: string,
    body: {
      employeeId: string;
      skillId: string;
      level: number;
      assessedOn?: string | null;
      note?: string | null;
    },
  ) =>
    request<EmployeeSkillRow[]>(token, '/learning/employee-skills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeEmployeeSkill: (token: string, id: string) =>
    request<unknown>(token, `/learning/employee-skills/${id}`, {
      method: 'DELETE',
    }),
  skillMatrix: (token: string, role: string) =>
    request<SkillMatrix>(
      token,
      `/learning/matrix?role=${encodeURIComponent(role)}`,
    ),
  certifications: (token: string, employeeId?: string) =>
    request<Certification[]>(
      token,
      `/learning/certifications${employeeId ? `?employeeId=${employeeId}` : ''}`,
    ),
  createCertification: (
    token: string,
    body: {
      employeeId: string;
      name: string;
      issuer?: string;
      credentialId?: string;
      issuedOn?: string | null;
      expiresOn?: string | null;
    },
  ) =>
    request<Certification>(token, '/learning/certifications', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeCertification: (token: string, id: string) =>
    request<unknown>(token, `/learning/certifications/${id}`, {
      method: 'DELETE',
    }),
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
