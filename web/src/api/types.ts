// The shapes the API accepts and returns. Kept apart from the calls so a
// page can import what it renders without reading how it is fetched.

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
  'entity' | 'department' | 'select' | 'dateFrom' | 'dateTo';

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
  'draft' | 'pending' | 'approved' | 'rejected' | 'closed' | 'filled';
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
  'referral' | 'job_board' | 'agency' | 'campus' | 'direct' | 'other';
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
  'pending' | 'self_review' | 'manager_review' | 'calibrated' | 'closed';
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

// --- Documents and compliance (T-3.4).
export type DocumentVisibility = 'hr_only' | 'employee' | 'all';
export type DocumentStatus = 'valid' | 'expiring' | 'expired';
export interface DocumentSummary {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  name: string;
  category: string;
  docType: string | null;
  visibility: DocumentVisibility;
  requiresAcknowledgement: boolean;
  currentVersion: number;
  expiresOn: string | null;
  status: DocumentStatus;
  daysToExpiry: number | null;
  versionCount: number;
  acknowledgedCount: number;
}
export interface DocumentVersionRow {
  id: string;
  version: number;
  sha256: string;
  note: string | null;
  uploadedBySub: string | null;
  createdAt: string;
}
export interface DocumentAckRow {
  id: string;
  version: number;
  signerSub: string;
  signerName: string;
  sha256: string;
  signerIp: string | null;
  signedAt: string;
}
export interface DocumentDetail {
  document: DocumentSummary;
  versions: DocumentVersionRow[];
  acknowledgements: DocumentAckRow[];
}
export interface MyDocument {
  id: string;
  name: string;
  category: string;
  docType: string | null;
  visibility: DocumentVisibility;
  requiresAcknowledgement: boolean;
  currentVersion: number;
  expiresOn: string | null;
  currentSha256: string | null;
  acknowledged: boolean;
  signedAt: string | null;
}

// Lifecycle (T-3.4b): the org chart and on/offboarding checklists.
export interface OrgNode {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle: string | null;
  departmentName: string | null;
  legalEntityName: string;
  managerId: string | null;
  span: number;
  reports: OrgNode[];
}

export type ChecklistKind = 'onboarding' | 'offboarding';

export interface ChecklistTemplateItem {
  id: string;
  kind: ChecklistKind;
  title: string;
  assigneeRole: string;
  dueOffsetDays: number;
  sortOrder: number;
}

export interface TemplateItemInput {
  title: string;
  assigneeRole: string;
  dueOffsetDays: number;
}

export interface ChecklistSummary {
  id: string;
  kind: ChecklistKind;
  status: 'open' | 'complete';
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  anchorDate: string;
  openedAt: string;
  completedAt: string | null;
  total: number;
  done: number;
  overdue: number;
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  title: string;
  assigneeRole: string;
  dueOn: string | null;
  sortOrder: number;
  status: 'pending' | 'done';
  note: string | null;
  completedBySub: string | null;
  completedAt: string | null;
}

export interface ChecklistView extends ChecklistSummary {
  items: ChecklistItem[];
}

export interface TaskView {
  id: string;
  checklistId: string;
  kind: ChecklistKind;
  title: string;
  assigneeRole: string;
  dueOn: string | null;
  employeeId: string;
  employeeName: string;
}

// One page of a collection. The server caps how much it will return at once,
// so the total is what tells a caller whether more remains.
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Me {
  sub?: string;
  username?: string;
  email?: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
  realm: string;
}
