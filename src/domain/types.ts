export enum UserRole {
  EMPLOYEE = 'EMPLOYEE',
  GOVERNANCE = 'GOVERNANCE',
  ADMIN = 'ADMIN',
}

export enum RegistrableCategory {
  AI_AGENT = 'AI_AGENT',
  AI_SOLUTION = 'AI_SOLUTION',
  AI_ENHANCED_APP = 'AI_ENHANCED_APP',
  AI_AUTOMATION = 'AI_AUTOMATION',
  AI_DEVELOPED_SOLUTION = 'AI_DEVELOPED_SOLUTION',
}

export enum ExcludedUse {
  PERSONAL = 'PERSONAL',
  LEARNING = 'LEARNING',
  ONE_TIME = 'ONE_TIME',
}

export enum ScopeDecision {
  REGISTER = 'REGISTER',
  NOT_REQUIRED = 'NOT_REQUIRED',
  NEEDS_CLARIFICATION = 'NEEDS_CLARIFICATION',
}

export enum LifecycleStatus {
  IDEA = 'IDEA',
  ASSESSMENT = 'ASSESSMENT',
  DEVELOPMENT = 'DEVELOPMENT',
  PILOT = 'PILOT',
  PRODUCTION = 'PRODUCTION',
  MONITORING = 'MONITORING',
  RETIRE = 'RETIRE',
  SCALE_IMPROVE = 'SCALE_IMPROVE',
}

export enum ValueCategory {
  EFFICIENCY = 'EFFICIENCY',
  QUALITY = 'QUALITY',
  STRATEGIC = 'STRATEGIC',
}

export enum SyncState {
  LOCAL_DEMO_ONLY = 'LOCAL_DEMO_ONLY',
  PENDING_OUTBOX = 'PENDING_OUTBOX',
  SYNCED = 'SYNCED',
  CONFLICT = 'CONFLICT',
}

export const CATEGORY_LABELS: Record<RegistrableCategory, string> = {
  [RegistrableCategory.AI_AGENT]: 'AI Agent',
  [RegistrableCategory.AI_SOLUTION]: 'AI Solution',
  [RegistrableCategory.AI_ENHANCED_APP]: 'AI-Enhanced Application',
  [RegistrableCategory.AI_AUTOMATION]: 'AI Automation',
  [RegistrableCategory.AI_DEVELOPED_SOLUTION]: 'AI-Developed Solution',
};

export const EXCLUDED_USE_LABELS: Record<ExcludedUse, string> = {
  [ExcludedUse.PERSONAL]: 'Personal Productivity Use',
  [ExcludedUse.LEARNING]: 'Learning & Experimentation',
  [ExcludedUse.ONE_TIME]: 'One-Time / Ad-Hoc Task',
};

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  [LifecycleStatus.IDEA]: 'Idea',
  [LifecycleStatus.ASSESSMENT]: 'Assessment',
  [LifecycleStatus.DEVELOPMENT]: 'Development',
  [LifecycleStatus.PILOT]: 'Pilot',
  [LifecycleStatus.PRODUCTION]: 'Production',
  [LifecycleStatus.MONITORING]: 'Monitoring',
  [LifecycleStatus.RETIRE]: 'Retire',
  [LifecycleStatus.SCALE_IMPROVE]: 'Scale / Improve',
};

export const ROLE_DISPLAY_LABELS: Record<UserRole, string> = {
  [UserRole.EMPLOYEE]: 'Employee',
  [UserRole.GOVERNANCE]: 'AI Portfolio Manager',
  [UserRole.ADMIN]: 'Administrator (Reserved)',
};

export function normalizeRoleDisplayLabel(rawRoleLabel: string): string {
  const trimmed = rawRoleLabel.trim();
  if (/^demo\s+governance\s+manager$/i.test(trimmed)) {
    return 'Demo AI Portfolio Manager';
  }
  if (/^governance\s+manager$/i.test(trimmed) || /^governance$/i.test(trimmed)) {
    return 'AI Portfolio Manager';
  }
  return trimmed;
}

export const LIFECYCLE_ORDER: LifecycleStatus[] = [
  LifecycleStatus.IDEA,
  LifecycleStatus.ASSESSMENT,
  LifecycleStatus.DEVELOPMENT,
  LifecycleStatus.PILOT,
  LifecycleStatus.PRODUCTION,
  LifecycleStatus.MONITORING,
  LifecycleStatus.SCALE_IMPROVE,
  LifecycleStatus.RETIRE,
];

export const PIPELINE_STATUSES: ReadonlySet<LifecycleStatus> = new Set([
  LifecycleStatus.IDEA,
  LifecycleStatus.ASSESSMENT,
  LifecycleStatus.DEVELOPMENT,
]);

/**
 * Live Portfolio strictly comprises Pilot + Production (also used for Active Solutions KPI).
 * Monitoring, Scale / Improve, and Retire are tracked and displayed separately.
 */
export const LIVE_STATUSES: ReadonlySet<LifecycleStatus> = new Set([
  LifecycleStatus.PILOT,
  LifecycleStatus.PRODUCTION,
]);

export const ACTIVE_SOLUTION_STATUSES: ReadonlySet<LifecycleStatus> = LIVE_STATUSES;

export const POST_PRODUCTION_BRANCH_STATUSES: ReadonlySet<LifecycleStatus> =
  new Set([LifecycleStatus.MONITORING, LifecycleStatus.SCALE_IMPROVE]);

export const VALUE_CATEGORY_LABELS: Record<ValueCategory, string> = {
  [ValueCategory.EFFICIENCY]: 'Efficiency Savings',
  [ValueCategory.QUALITY]: 'Quality Improvements',
  [ValueCategory.STRATEGIC]: 'Strategic Benefits',
};

export const VALUE_CATEGORY_DESCRIPTIONS: Record<ValueCategory, string> = {
  [ValueCategory.EFFICIENCY]:
    'Measurable time reduction across repeatable operational workflows. Calculates non-cash productivity hours and optional equivalent value.',
  [ValueCategory.QUALITY]:
    'Error reduction, consistency, auditability, or accuracy gains. Usage metrics are captured for portfolio sizing.',
  [ValueCategory.STRATEGIC]:
    'New capabilities, revenue enablement, customer experience, or competitive differentiation. Usage metrics are captured for portfolio sizing.',
};

export const AI_PLATFORMS = [
  'Microsoft Copilot Studio',
  'Azure OpenAI Service',
  'Microsoft 365 Copilot',
  'Power Automate AI Builder',
  'Azure AI Document Intelligence',
  'Custom Python / Azure ML',
  'Vendor SaaS Embedded AI',
  'Other',
] as const;

export const SOLUTION_TYPES = [
  'Low-Code / Power Platform',
  'Custom Developed Application',
  'Enterprise Copilot Extension',
  'SaaS / Vendor Embedded Module',
  'Automated Workflow / RPA + AI',
] as const;

export const AI_TYPES = [
  'Generative AI / LLM',
  'Agentic / Multi-Step Workflow',
  'Document Intelligence / OCR',
  'Conversational Assistant',
  'Predictive Analytics / ML',
] as const;

export interface Department {
  id: string;
  name: string;
  code: string;
  costCenter: string;
}

export interface UserAccount {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  departmentId: string;
  jobTitle: string;
}

export interface ExternalSyncLinkage {
  sourceSystem?: 'MICROSOFT_LISTS' | 'AZURE_SQL' | 'LOCAL_DEMO';
  siteId?: string;
  listId?: string;
  itemId?: string;
  sourceETag?: string;
  lastSyncedAt?: string;
}

export interface LifecycleEvent {
  id: string;
  initiativeId: string;
  fromStatus: LifecycleStatus | null;
  toStatus: LifecycleStatus;
  actorId: string;
  actorName: string;
  timestamp: string;
  note: string;
  isGovernedException: boolean;
}

export interface Initiative {
  id: string;
  title: string;
  businessProblem: string;
  description: string;
  businessCapability: string;
  departmentId: string;
  ownerId: string;
  aiPlatform: string;
  solutionType: string;
  aiType: string;
  category: RegistrableCategory;
  lifecycleStatus: LifecycleStatus;
  valueCategory: ValueCategory;
  usersCount: number;
  minutesSavedPerOccurrence: number;
  processFrequencyPerWeek: number;
  hourlyRate?: number;
  ideaDate: string;
  goLiveDate?: string;
  createdAt: string;
  updatedAt: string;
  lastOwnerReviewAt: string | null;
  lastSavingsUpdatedAt?: string | null;
  nextReviewDue: string;
  qualityEvidenceOrKpi?: string;
  strategicSuccessIndicator?: string;
  version: number;
  syncLinkage: ExternalSyncLinkage;
  provenance?: DataProvenance;
  importBatchId?: string;
  needsDataCompletion?: boolean;
  missingDataFields?: string[];
  sourceImportedAt?: string;
  sourceFileName?: string;
}

export interface InitiativeDraft {
  step: number;
  ideaText: string;
  departmentId: string;
  clarificationAnswers: ScopeClarificationAnswers;
  title: string;
  businessProblem: string;
  description: string;
  businessCapability: string;
  ownerId: string;
  aiPlatform: string;
  solutionType: string;
  aiType: string;
  category: RegistrableCategory | '';
  lifecycleStatus: LifecycleStatus;
  valueCategory: ValueCategory;
  usersCount: string;
  minutesSavedPerOccurrence: string;
  processFrequencyPerWeek: string;
  hourlyRate: string;
  ideaDate: string;
  goLiveDate: string;
  savedAt: string;
}

export interface ScopeClarificationAnswers {
  isSharedOrOperational?: 'yes' | 'no' | '';
  isRepeatableProcess?: 'yes' | 'no' | '';
  intendedForm?:
    | 'autonomous_agent'
    | 'workflow_automation'
    | 'embedded_app'
    | 'custom_developed'
    | 'standalone_solution'
    | 'personal_or_adhoc'
    | '';
}

export interface ClarificationQuestion {
  id: keyof ScopeClarificationAnswers;
  prompt: string;
  options: Array<{ value: string; label: string }>;
}

export interface ScopeEvaluationInput {
  ideaText: string;
  departmentId?: string;
  clarifications?: ScopeClarificationAnswers;
}

export interface ScopeEvaluationResult {
  decision: ScopeDecision;
  suggestedCategory?: RegistrableCategory;
  excludedUse?: ExcludedUse;
  reasons: string[];
  clarificationQuestions: ClarificationQuestion[];
  governanceNote: string;
}

export interface SimilarityMatch {
  initiative: Initiative;
  score: number;
  matchedTerms: string[];
  sameDepartment: boolean;
  sameCapability: boolean;
  isDemoOnly: true;
  disclaimer: string;
}

export interface DataQualityFlag {
  code: 'OVERDUE_REVIEW' | 'MISSING_GO_LIVE_DATE' | 'MISSING_HOURLY_RATE' | 'ZERO_USERS';
  label: string;
  severity: 'warning' | 'info';
}

export interface ListInitiativesFilter {
  search?: string;
  departmentId?: string;
  lifecycleStatus?: LifecycleStatus | '';
  category?: RegistrableCategory | '';
  valueCategory?: ValueCategory | '';
  ownerId?: string;
  aiPlatform?: string;
  needsCompletionOnly?: boolean;
  overdueOnly?: boolean;
}

export interface CreateInitiativeInput {
  title: string;
  businessProblem: string;
  description: string;
  businessCapability: string;
  departmentId: string;
  ownerId: string;
  aiPlatform: string;
  solutionType: string;
  aiType: string;
  category: RegistrableCategory;
  lifecycleStatus: LifecycleStatus;
  valueCategory: ValueCategory;
  usersCount: number;
  minutesSavedPerOccurrence: number;
  processFrequencyPerWeek: number;
  hourlyRate?: number;
  qualityEvidenceOrKpi?: string;
  strategicSuccessIndicator?: string;
  ideaDate: string;
  goLiveDate?: string;
}

export interface UpdateInitiativeInput {
  id: string;
  expectedVersion: number;
  patch: Partial<CreateInitiativeInput> & {
    markSavingsReviewed?: boolean;
  };
}

export interface RecordLifecycleEventInput {
  initiativeId: string;
  expectedVersion: number;
  toStatus: LifecycleStatus;
  note: string;
}

export interface MarkOwnerReviewedInput {
  initiativeId: string;
  expectedVersion: number;
  reviewNote?: string;
}

export interface LifecycleDistributionItem {
  status: LifecycleStatus;
  label: string;
  count: number;
  percentage: number;
}

export interface DepartmentPortfolioBreakdown {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  totalCount: number;
  activeSolutionsCount: number;
  totalUsers: number;
  overdueReviewsCount: number;
}

export interface PortfolioMetrics {
  totalInitiatives: number;
  activeSolutionsCount: number;
  pipelineCount: number;
  liveCount: number;
  monitoringCount: number;
  scaleImproveCount: number;
  retiredCount: number;
  needsCompletionCount: number;
  departmentsRepresentedCount: number;
  totalRegisteredUsers: number;
  overdueReviewsCount: number;
  dataQualityIssuesCount: number;
  lifecycleDistribution: LifecycleDistributionItem[];
  departmentBreakdown: DepartmentPortfolioBreakdown[];
}

export type DataProvenance = 'SEED_DEMO' | 'IMPORTED_EXCEL' | 'USER_CREATED';

export type WorkspaceDataset = 'SAMPLE_DEMO' | 'IMPORTED_PORTFOLIO';

export type DataSourceMode = 'DEMO_LOCAL' | 'SHAREPOINT_READ_ONLY';

export enum BenefitType {
  CASH_SAVINGS = 'CASH_SAVINGS',
  COST_AVOIDANCE = 'COST_AVOIDANCE',
  QUALITY_IMPROVEMENT = 'QUALITY_IMPROVEMENT',
  STRATEGIC_BENEFIT = 'STRATEGIC_BENEFIT',
}

export const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  [BenefitType.CASH_SAVINGS]: 'Cash Savings',
  [BenefitType.COST_AVOIDANCE]: 'Cost Avoidance',
  [BenefitType.QUALITY_IMPROVEMENT]: 'Quality Improvements',
  [BenefitType.STRATEGIC_BENEFIT]: 'Strategic Benefits',
};

export type BenefitEvidenceStatus = 'VERIFIED' | 'DOCUMENTED' | 'PENDING' | 'NONE';

export interface BenefitEntry {
  id: string;
  initiativeId: string;
  departmentId: string;
  costCenter?: string;
  benefitType: BenefitType;
  estimatedAmountEur: number;
  realizedAmountEur: number;
  period: string; // YYYY-MM
  description: string;
  evidenceStatus?: BenefitEvidenceStatus;
  evidenceNote?: string;
  provenance: DataProvenance;
  createdAt: string;
}

export enum CostCategory {
  LICENSING = 'LICENSING',
  TOKENS_API = 'TOKENS_API',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  IMPLEMENTATION = 'IMPLEMENTATION',
  SUPPORT = 'SUPPORT',
}

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  [CostCategory.LICENSING]: 'Platform Licensing',
  [CostCategory.TOKENS_API]: 'LLM Tokens / API Consumption',
  [CostCategory.INFRASTRUCTURE]: 'Cloud Infrastructure',
  [CostCategory.IMPLEMENTATION]: 'Implementation & Integration',
  [CostCategory.SUPPORT]: 'Operations & Support',
};

export type SpendType = 'PLANNED' | 'ACTUAL';

export interface AiCostTransaction {
  id: string;
  departmentId: string;
  costCenter: string;
  period: string; // YYYY-MM
  platform: string;
  costCategory: CostCategory;
  spendType: SpendType;
  amountEur: number;
  tokens: number;
  initiativeId?: string;
  note?: string;
  provenance: DataProvenance;
  importBatchId?: string;
  createdAt: string;
}

export type CostPlanProvenance = 'SEED_DEMO' | 'MANUAL' | 'IMPORTED_EXCEL';

export type ForecastMissingRule = 'FLAG_MISSING' | 'FALLBACK_TO_PLANNED';

export type CostPlanDuplicateAction = 'SKIP' | 'UPDATE_EXISTING' | 'CREATE_NEW';

export interface AiCostPlanEntry {
  id: string;
  departmentId: string;
  planningYear: number;
  month: number; // 1..12
  period: string; // YYYY-MM
  platform: string;
  costCategory: CostCategory;
  plannedAmountEur: number;
  forecastAmountEur: number | null; // null explicitly preserves missing forecast data
  costCenter?: string;
  licenseCount?: number | null;
  comments?: string;
  provenance: CostPlanProvenance;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export enum RedundancyDisposition {
  CONFIRMED_REDUNDANCY = 'CONFIRMED_REDUNDANCY',
  REUSE_OPPORTUNITY = 'REUSE_OPPORTUNITY',
  NOT_REDUNDANT = 'NOT_REDUNDANT',
  NEEDS_INVESTIGATION = 'NEEDS_INVESTIGATION',
}

export const REDUNDANCY_DISPOSITION_LABELS: Record<
  RedundancyDisposition,
  string
> = {
  [RedundancyDisposition.CONFIRMED_REDUNDANCY]: 'Confirmed Redundancy',
  [RedundancyDisposition.REUSE_OPPORTUNITY]: 'Reuse Opportunity',
  [RedundancyDisposition.NOT_REDUNDANT]: 'Not Redundant',
  [RedundancyDisposition.NEEDS_INVESTIGATION]: 'Needs Investigation',
};

export interface RedundancyReviewRecord {
  id: string;
  pairKey: string;
  initiativeAId: string;
  initiativeBId: string;
  heuristicScore: number;
  disposition: RedundancyDisposition;
  collaborationRecommendation: string;
  reviewerId: string;
  reviewerName: string;
  reviewedAt: string;
}

export interface ImportBatchRecord {
  id: string;
  kind: 'INITIATIVES' | 'AI_COSTS' | 'COST_PLANS';
  fileName: string;
  worksheetName: string;
  targetDataset: WorkspaceDataset;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  importedAt: string;
  actorName: string;
}

export interface ImportMappingTemplate {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  mappings: Array<{
    sourceHeader: string;
    targetField: string;
  }>;
}

export interface CompletenessReport {
  scorePercent: number;
  presentFields: number;
  totalFields: number;
  missingFields: string[];
}

export interface SyncStatusSummary {
  mode: 'LOCAL_DEMO_STORAGE' | 'LOCAL_INDEXEDDB_DEMO' | 'SHAREPOINT_READ_ONLY';
  activeDataset?: WorkspaceDataset;
  readOnly?: boolean;
  syncState: SyncState;
  storageKey: string;
  lastUpdatedAt: string | null;
  pendingOutboxCount: number;
  targetProductionStack: string[];
  disclaimer: string;
}

export type ReportingScope = 'OPERATIONS' | 'ALL';

export interface DepartmentAliasRule {
  id: string;
  alias: string;
  targetDepartmentId: string;
}

export interface OperationsReportingConfig {
  operationsDepartmentIds: string[];
  aliasRules: DepartmentAliasRule[];
}

export type SavingsQualityPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type SavingsQualityIssueType =
  | 'MISSING_SAVINGS_DATA'
  | 'OVERDUE_SAVINGS_REVIEW'
  | 'INCOMPLETE_SAVINGS_INPUTS'
  | 'MISSING_QUALITY_EVIDENCE'
  | 'MISSING_STRATEGIC_INDICATOR'
  | 'UNVERIFIED_REALIZED_BENEFIT';

export interface SavingsDataQualityItem {
  initiativeId: string;
  initiativeTitle: string;
  departmentId: string;
  departmentName: string;
  ownerId: string;
  ownerName: string;
  lifecycleStatus: LifecycleStatus;
  valueCategory: ValueCategory;
  estimatedSavingsDisplay: string;
  estimatedAnnualHours: number;
  estimatedEfficiencyValueEur: number | null;
  estimatedBenefitEntriesEur: number;
  realizedSavingsEur: number;
  lastSavingsUpdatedAt: string | null;
  lastReviewDate: string | null;
  nextReviewDue: string;
  overdueDays: number;
  issueTypes: SavingsQualityIssueType[];
  issueSummary: string;
  priority: SavingsQualityPriority;
  recommendedAction: string;
  isUpToDate: boolean;
  isMissingSavingsData: boolean;
  isOverdueReview: boolean;
  isIncompleteInputs: boolean;
}

export interface SavingsDataQualityDepartmentBreakdown {
  departmentId: string;
  departmentName: string;
  totalInitiatives: number;
  upToDateCount: number;
  actionRequiredCount: number;
  overdueCount: number;
  completenessPercent: number;
}

export interface SavingsDataQualityReport {
  totalInitiatives: number;
  missingSavingsDataCount: number;
  overdueReviewsCount: number;
  incompleteInputsCount: number;
  upToDateCount: number;
  itemsRequiringActionCount: number;
  dataCompletenessPercent: number;
  byDepartment: SavingsDataQualityDepartmentBreakdown[];
  items: SavingsDataQualityItem[];
}

// ---------- Redundancy & Synergies Portfolio Optimization Workflow ----------

export type RedundancyCaseStatus =
  | 'NEW'
  | 'IN_REVIEW'
  | 'ACTION_AGREED'
  | 'ESCALATED'
  | 'CLOSED';

export type LegacyRedundancyCaseStatus =
  | 'UNDER_REVIEW'
  | 'OWNER_DISCUSSION'
  | 'IMPLEMENTATION';

export const REDUNDANCY_CASE_STATUS_ORDER: RedundancyCaseStatus[] = [
  'NEW',
  'IN_REVIEW',
  'ACTION_AGREED',
  'ESCALATED',
  'CLOSED',
];

export const REDUNDANCY_CASE_STATUS_LABELS: Record<RedundancyCaseStatus, string> = {
  NEW: 'New',
  IN_REVIEW: 'In Review',
  ACTION_AGREED: 'Action Agreed',
  ESCALATED: 'Escalated',
  CLOSED: 'Closed',
};

const LEGACY_STATUS_LABELS: Record<LegacyRedundancyCaseStatus, string> = {
  UNDER_REVIEW: 'In Review',
  OWNER_DISCUSSION: 'In Review',
  IMPLEMENTATION: 'Action Agreed',
};

export function normalizeRedundancyCaseStatus(
  raw?: string | null
): RedundancyCaseStatus {
  switch (raw) {
    case 'NEW':
      return 'NEW';
    case 'IN_REVIEW':
    case 'UNDER_REVIEW':
    case 'OWNER_DISCUSSION':
      return 'IN_REVIEW';
    case 'ACTION_AGREED':
    case 'IMPLEMENTATION':
      return 'ACTION_AGREED';
    case 'ESCALATED':
      return 'ESCALATED';
    case 'CLOSED':
      return 'CLOSED';
    default:
      return 'IN_REVIEW';
  }
}

export function formatRedundancyStatusLabel(raw?: string | null): string {
  if (!raw) return '—';
  if (raw in REDUNDANCY_CASE_STATUS_LABELS) {
    return REDUNDANCY_CASE_STATUS_LABELS[raw as RedundancyCaseStatus];
  }
  if (raw in LEGACY_STATUS_LABELS) {
    return LEGACY_STATUS_LABELS[raw as LegacyRedundancyCaseStatus];
  }
  return raw;
}

export type RedundancyDecisionType =
  | 'MERGE'
  | 'REUSE'
  | 'COLLABORATE'
  | 'CONTINUE_SEPARATELY'
  | 'NOT_REDUNDANT';

export const REDUNDANCY_DECISION_ORDER: RedundancyDecisionType[] = [
  'MERGE',
  'REUSE',
  'COLLABORATE',
  'CONTINUE_SEPARATELY',
  'NOT_REDUNDANT',
];

export const REDUNDANCY_DECISION_LABELS: Record<RedundancyDecisionType, string> = {
  MERGE: 'Merge',
  REUSE: 'Reuse',
  COLLABORATE: 'Collaborate',
  CONTINUE_SEPARATELY: 'Continue Separately',
  NOT_REDUNDANT: 'Not Redundant',
};

export type BoardDecisionOutcome =
  | 'SCALE'
  | 'PAUSE'
  | 'RETIRE'
  | 'MERGE'
  | 'REUSE'
  | 'COLLABORATE'
  | 'CONTINUE_SEPARATELY';

export const BOARD_DECISION_OUTCOME_ORDER: BoardDecisionOutcome[] = [
  'SCALE',
  'PAUSE',
  'RETIRE',
  'MERGE',
  'REUSE',
  'COLLABORATE',
  'CONTINUE_SEPARATELY',
];

export const BOARD_DECISION_OUTCOME_LABELS: Record<BoardDecisionOutcome, string> = {
  SCALE: 'Scale',
  PAUSE: 'Pause',
  RETIRE: 'Retire',
  MERGE: 'Merge',
  REUSE: 'Reuse',
  COLLABORATE: 'Collaborate',
  CONTINUE_SEPARATELY: 'Continue Separately',
};

export type OwnerAlignmentStance =
  | 'PENDING'
  | 'AGREED'
  | 'DISAGREED'
  | 'NEEDS_INFO';

export const OWNER_ALIGNMENT_STANCE_LABELS: Record<OwnerAlignmentStance, string> = {
  PENDING: 'Pending Response',
  AGREED: 'Agreed',
  DISAGREED: 'Disagreed',
  NEEDS_INFO: 'Needs More Info',
};

export type RedundancyActionStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export const REDUNDANCY_ACTION_STATUS_LABELS: Record<RedundancyActionStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export type SynergyEvidenceStatus = 'NONE' | 'DOCUMENTED' | 'VERIFIED';

export interface RedundancyDeadlineConfig {
  triageBusinessDays: number;
  ownerAlignmentBusinessDays: number;
  decisionBusinessDays: number;
  overdueActionFollowUpBusinessDays: number;
  boardMeetingDayOfMonth: number;
  holidays: string[]; // YYYY-MM-DD
  policyDisclaimer: string;
}

export interface RedundancyInitiativeSnapshot {
  id: string;
  title: string;
  departmentId: string;
  ownerId: string;
  ownerName: string;
  businessCapability: string;
  aiPlatform: string;
  lifecycleStatusAtDetection: LifecycleStatus;
}

export interface OwnerDiscussionNote {
  id: string;
  authorId: string;
  authorName: string;
  authorRoleLabel: string;
  stance?: OwnerAlignmentStance;
  note: string;
  createdAt: string;
}

export interface RedundancyCase {
  id: string;
  caseNumber: string;
  pairKey: string;
  initiativeAId: string;
  initiativeBId: string;
  initiativeASnapshot: RedundancyInitiativeSnapshot;
  initiativeBSnapshot: RedundancyInitiativeSnapshot;
  heuristicScore: number;
  matchedKeywords: string[];
  capabilityOverlapSummary: string;
  similarityExplanation: string;
  status: RedundancyCaseStatus;
  detectedAt: string;
  triagedAt: string | null;
  triageDueAt: string; // YYYY-MM-DD
  ownerAlignmentDueAt: string; // YYYY-MM-DD
  decisionDueAt: string; // YYYY-MM-DD
  ownerAStance: OwnerAlignmentStance;
  ownerBStance: OwnerAlignmentStance;
  ownerDiscussionNotes: OwnerDiscussionNote[];
  portfolioManagerRecommendation: string;
  decisionType: RedundancyDecisionType | null;
  decisionRationale: string;
  escalationReason?: string;
  decisionRequested?: string;
  recommendedOption?: RedundancyDecisionType | BoardDecisionOutcome | null;
  escalatedAt?: string | null;
  escalatedBy?: string;
  implementationStartedAt?: string | null;
  closedAt?: string | null;
  closedBy?: string;
  closingOutcomeSummary?: string;
  estimatedAvoidedEffortHours: number;
  estimatedAvoidedEffortEur: number;
  estimatedFinancialSynergyEur: number;
  confirmedFinancialSynergyEur: number;
  confirmedSynergyEvidence: string;
  synergyEvidenceStatus: SynergyEvidenceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RedundancyAction {
  id: string;
  caseId: string;
  title: string;
  description: string;
  ownerId: string;
  ownerName: string;
  dueDate: string; // YYYY-MM-DD
  followUpReviewDueAt: string; // YYYY-MM-DD (10 business days after dueDate)
  status: RedundancyActionStatus;
  completedAt: string | null;
  completionNotes?: string;
  lastReminderSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RedundancyEventType =
  | 'CASE_CREATED'
  | 'TRIAGED'
  | 'STATUS_CHANGED'
  | 'OWNER_NOTE_ADDED'
  | 'DECISION_RECORDED'
  | 'ACTION_CREATED'
  | 'ACTION_UPDATED'
  | 'ACTION_COMPLETED'
  | 'ACTION_REMINDER_LOGGED'
  | 'ESCALATED_TO_BOARD'
  | 'BOARD_DECISION_RECORDED'
  | 'SYNERGY_UPDATED'
  | 'CASE_CLOSED';

export interface RedundancyEvent {
  id: string;
  caseId: string;
  eventType: RedundancyEventType;
  fromStatus: RedundancyCaseStatus | LegacyRedundancyCaseStatus | null;
  toStatus: RedundancyCaseStatus | LegacyRedundancyCaseStatus | null;
  actorId: string;
  actorName: string;
  actorRoleLabel: string;
  summary: string;
  details?: string;
  timestamp: string;
}

export interface BoardDecision {
  id: string;
  caseId: string;
  status: 'PENDING' | 'DECIDED';
  escalationReason: string;
  decisionRequested?: string;
  recommendedOption?: RedundancyDecisionType | BoardDecisionOutcome | null;
  escalatedAt: string;
  escalatedBy: string;
  scheduledMeetingDate: string; // YYYY-MM-DD
  decidedAt: string | null;
  decidedBy?: string;
  decisionOutcome: BoardDecisionOutcome | null;
  boardRationale: string;
  investmentImplications: string;
  followUpRequired: boolean;
  followUpNotes?: string;
}



