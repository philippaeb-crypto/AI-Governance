import {
  CostPlanDuplicateReviewItem,
  DuplicateReviewItem,
  NormalizedCostImportRow,
} from '../domain/excelImport';
import {
  AiCostPlanEntry,
  AiCostTransaction,
  BenefitEntry,
  BoardDecision,
  BoardDecisionOutcome,
  CostCategory,
  CreateInitiativeInput,
  Department,
  ImportBatchRecord,
  ImportMappingTemplate,
  Initiative,
  InitiativeDraft,
  LifecycleEvent,
  ListInitiativesFilter,
  MarkOwnerReviewedInput,
  OwnerAlignmentStance,
  PortfolioMetrics,
  RecordLifecycleEventInput,
  RedundancyAction,
  RedundancyActionStatus,
  RedundancyCase,
  RedundancyCaseStatus,
  RedundancyDeadlineConfig,
  RedundancyDecisionType,
  RedundancyEvent,
  RedundancyReviewRecord,
  SimilarityMatch,
  SyncStatusSummary,
  SynergyEvidenceStatus,
  UpdateInitiativeInput,
  UserAccount,
  WorkspaceDataset,
} from '../domain/types';

export interface InitiativeDetailRecord {
  initiative: Initiative;
  lifecycleHistory: LifecycleEvent[];
}

export interface SaveBenefitInput {
  id?: string;
  initiativeId: string;
  departmentId: string;
  costCenter?: string;
  benefitType: BenefitEntry['benefitType'];
  estimatedAmountEur: number;
  realizedAmountEur: number;
  period: string;
  description: string;
  evidenceStatus?: BenefitEntry['evidenceStatus'];
  evidenceNote?: string;
}

export interface SaveCostTransactionInput {
  id?: string;
  departmentId: string;
  costCenter: string;
  period: string;
  platform: string;
  costCategory: AiCostTransaction['costCategory'];
  spendType: AiCostTransaction['spendType'];
  amountEur: number;
  tokens: number;
  initiativeId?: string;
  note?: string;
}

export interface SaveCostPlanInput {
  id?: string;
  departmentId: string;
  planningYear: number;
  month: number; // 1..12
  platform: string;
  costCategory: CostCategory;
  plannedAmountEur: number;
  forecastAmountEur: number | null;
  costCenter?: string;
  licenseCount?: number | null;
  comments?: string;
}

export interface DuplicateCostPlanToMonthInput {
  sourcePlanId: string;
  targetPlanningYear: number;
  targetMonth: number; // 1..12
  overwriteExisting?: boolean;
}

export interface CopyMonthlyPlanAcrossYearInput {
  sourcePlanningYear: number;
  sourceMonth: number; // 1..12
  targetMonths: number[]; // subset of 1..12
  departmentId?: string; // optional department scope filter
  overwriteExisting?: boolean;
}

export interface SaveRedundancyReviewInput {
  pairKey: string;
  initiativeAId: string;
  initiativeBId: string;
  heuristicScore: number;
  disposition: RedundancyReviewRecord['disposition'];
  collaborationRecommendation: string;
}

export interface CreateRedundancyCaseInput {
  initiativeAId: string;
  initiativeBId: string;
  heuristicScore?: number;
  matchedKeywords?: string[];
  similarityExplanation?: string;
  portfolioManagerRecommendation?: string;
}

export interface UpdateRedundancyCaseInput {
  caseId: string;
  status?: RedundancyCaseStatus;
  portfolioManagerRecommendation?: string;
  decisionType?: RedundancyDecisionType | null;
  decisionRationale?: string;
  recommendedOption?: RedundancyDecisionType | BoardDecisionOutcome | null;
  ownerAStance?: OwnerAlignmentStance;
  ownerBStance?: OwnerAlignmentStance;
  estimatedAvoidedEffortHours?: number;
  estimatedAvoidedEffortEur?: number;
  estimatedFinancialSynergyEur?: number;
  confirmedFinancialSynergyEur?: number;
  confirmedSynergyEvidence?: string;
  synergyEvidenceStatus?: SynergyEvidenceStatus;
}

export interface AddRedundancyDiscussionNoteInput {
  caseId: string;
  stance?: OwnerAlignmentStance;
  applyToSide?: 'A' | 'B' | 'AUTO';
  note: string;
}

export interface SaveRedundancyActionInput {
  id?: string;
  caseId: string;
  title: string;
  description: string;
  ownerId: string;
  dueDate: string; // YYYY-MM-DD
  status?: RedundancyActionStatus;
  completionNotes?: string;
}

export interface EscalateRedundancyCaseInput {
  caseId: string;
  escalationReason: string;
  decisionRequested?: string;
  recommendedOption?: RedundancyDecisionType | BoardDecisionOutcome | null;
  investmentImplications?: string;
  scheduledMeetingDate?: string;
}

export interface RecordBoardDecisionInput {
  caseId: string;
  decisionOutcome: BoardDecisionOutcome;
  boardRationale: string;
  investmentImplications: string;
  followUpRequired: boolean;
  followUpNotes?: string;
}

export interface CloseRedundancyCaseInput {
  caseId: string;
  closingOutcomeSummary: string;
}

export interface RedundancyCaseDetailRecord {
  redundancyCase: RedundancyCase;
  actions: RedundancyAction[];
  events: RedundancyEvent[];
  boardDecisions: BoardDecision[];
}

export interface InitiativeRepository {
  listInitiatives(filter?: ListInitiativesFilter): Promise<Initiative[]>;
  getInitiative(id: string): Promise<InitiativeDetailRecord>;
  createInitiative(
    input: CreateInitiativeInput,
    actor: UserAccount
  ): Promise<Initiative>;
  updateInitiative(
    input: UpdateInitiativeInput,
    actor: UserAccount
  ): Promise<Initiative>;
  deleteInitiative(id: string, actor: UserAccount): Promise<void>;
  recordLifecycleEvent(
    input: RecordLifecycleEventInput,
    actor: UserAccount
  ): Promise<{ initiative: Initiative; event: LifecycleEvent }>;
  markOwnerReviewed(
    input: MarkOwnerReviewedInput,
    actor: UserAccount
  ): Promise<Initiative>;
  listAllLifecycleEvents(): Promise<LifecycleEvent[]>;
  listDepartments(): Promise<Department[]>;
  listUsers(): Promise<UserAccount[]>;
  getPortfolioMetrics(): Promise<PortfolioMetrics>;
  getSyncStatus(): Promise<SyncStatusSummary>;
  resetDemoData(): Promise<void>;
  getDraft(): InitiativeDraft | null;
  saveDraft(draft: InitiativeDraft): void;
  clearDraft(): void;

  // Extended Demo / Governance portfolio capabilities
  listBenefits(): Promise<BenefitEntry[]>;
  saveBenefit(input: SaveBenefitInput, actor: UserAccount): Promise<BenefitEntry>;
  deleteBenefit(id: string, actor: UserAccount): Promise<void>;

  listCostTransactions(): Promise<AiCostTransaction[]>;
  saveCostTransaction(
    input: SaveCostTransactionInput,
    actor: UserAccount
  ): Promise<AiCostTransaction>;
  deleteCostTransaction(id: string, actor: UserAccount): Promise<void>;

  // AI Cost Planning (Planned Budget & Forecast strictly separated from Actuals)
  listCostPlans(filter?: {
    planningYear?: number;
    departmentId?: string;
    platform?: string;
  }): Promise<AiCostPlanEntry[]>;
  saveCostPlan(input: SaveCostPlanInput, actor: UserAccount): Promise<AiCostPlanEntry>;
  deleteCostPlan(id: string, actor: UserAccount): Promise<void>;
  duplicateCostPlanToMonth(
    input: DuplicateCostPlanToMonthInput,
    actor: UserAccount
  ): Promise<{ entry: AiCostPlanEntry; action: 'CREATED' | 'UPDATED' }>;
  copyMonthlyPlanAcrossYear(
    input: CopyMonthlyPlanAcrossYearInput,
    actor: UserAccount
  ): Promise<{ createdCount: number; updatedCount: number; skippedCount: number }>;

  listRedundancyReviews(): Promise<RedundancyReviewRecord[]>;
  saveRedundancyReview(
    input: SaveRedundancyReviewInput,
    actor: UserAccount
  ): Promise<RedundancyReviewRecord>;

  // Redundancy Case Management & Board Escalation Workflow
  listRedundancyCases(): Promise<RedundancyCase[]>;
  getRedundancyCaseDetail(caseId: string): Promise<RedundancyCaseDetailRecord>;
  createRedundancyCase(
    input: CreateRedundancyCaseInput,
    actor: UserAccount
  ): Promise<{ redundancyCase: RedundancyCase; created: boolean }>;
  syncActiveMatchesToRedundancyCases(actor: UserAccount): Promise<{
    createdCount: number;
    skippedExistingCount: number;
    cases: RedundancyCase[];
  }>;
  updateRedundancyCase(
    input: UpdateRedundancyCaseInput,
    actor: UserAccount
  ): Promise<RedundancyCase>;
  addRedundancyDiscussionNote(
    input: AddRedundancyDiscussionNoteInput,
    actor: UserAccount
  ): Promise<RedundancyCase>;
  listRedundancyActions(caseId?: string): Promise<RedundancyAction[]>;
  saveRedundancyAction(
    input: SaveRedundancyActionInput,
    actor: UserAccount
  ): Promise<RedundancyAction>;
  deleteRedundancyAction(actionId: string, actor: UserAccount): Promise<void>;
  logRedundancyActionReminder(
    actionId: string,
    actor: UserAccount
  ): Promise<RedundancyAction>;
  listRedundancyEvents(caseId?: string): Promise<RedundancyEvent[]>;
  listBoardDecisions(caseId?: string): Promise<BoardDecision[]>;
  escalateRedundancyCaseToBoard(
    input: EscalateRedundancyCaseInput,
    actor: UserAccount
  ): Promise<{ redundancyCase: RedundancyCase; boardDecision: BoardDecision }>;
  recordBoardDecision(
    input: RecordBoardDecisionInput,
    actor: UserAccount
  ): Promise<{ redundancyCase: RedundancyCase; boardDecision: BoardDecision }>;
  closeRedundancyCase(
    input: CloseRedundancyCaseInput,
    actor: UserAccount
  ): Promise<RedundancyCase>;
  getRedundancyDeadlineConfig(): Promise<RedundancyDeadlineConfig>;
  saveRedundancyDeadlineConfig(
    config: RedundancyDeadlineConfig,
    actor: UserAccount
  ): Promise<RedundancyDeadlineConfig>;

  listImportBatches(): Promise<ImportBatchRecord[]>;
  commitInitiativeImportBatch(params: {
    fileName: string;
    worksheetName: string;
    targetDataset: WorkspaceDataset;
    items: DuplicateReviewItem[];
    failedCount?: number;
    actor: UserAccount;
  }): Promise<ImportBatchRecord>;
  commitCostImportBatch(params: {
    fileName: string;
    worksheetName: string;
    targetDataset: WorkspaceDataset;
    rows: NormalizedCostImportRow[];
    actor: UserAccount;
  }): Promise<ImportBatchRecord>;
  commitCostPlanImportBatch(params: {
    fileName: string;
    worksheetName: string;
    targetDataset: WorkspaceDataset;
    items: CostPlanDuplicateReviewItem[];
    failedCount?: number;
    actor: UserAccount;
  }): Promise<ImportBatchRecord>;

  listMappingTemplates(): Promise<ImportMappingTemplate[]>;
  saveMappingTemplate(input: {
    name: string;
    mappings: Array<{ sourceHeader: string; targetField: string }>;
  }): Promise<ImportMappingTemplate>;
  deleteMappingTemplate(id: string): Promise<void>;

  getActiveDataset(): WorkspaceDataset;
  switchDataset(dataset: WorkspaceDataset): Promise<void>;
}

export interface SimilarityProvider {
  findSimilarInitiatives(params: {
    queryText: string;
    departmentId?: string;
    businessCapability?: string;
    excludeInitiativeId?: string;
    limit?: number;
  }): Promise<SimilarityMatch[]>;
}

/**
 * Phase 2 Architectural Interface: Azure SQL Persistence
 * Not implemented in Phase 1 prototype.
 */
export interface AzureSqlRepository extends InitiativeRepository {
  readonly providerName: 'AZURE_SQL';
  verifyDatabaseConnection(): Promise<{ ok: boolean; schemaVersion: string }>;
}

/**
 * Phase 2 Architectural Interface: Microsoft Graph / SharePoint Lists Bidirectional Sync
 * Not implemented in Phase 1 prototype.
 */
export interface MicrosoftGraphSyncAdapter {
  readonly providerName: 'MICROSOFT_GRAPH_LISTS';
  pullRemoteChanges(deltaToken?: string): Promise<{
    itemsProcessed: number;
    conflictsDetected: number;
    nextDeltaToken: string;
  }>;
  pushOutboxBatch(batchSize: number): Promise<{
    succeeded: number;
    retried: number;
    conflicts: number;
  }>;
  resolveSyncConflict(
    initiativeId: string,
    strategy: 'KEEP_AZURE_SQL' | 'ACCEPT_LIST_ITEM'
  ): Promise<Initiative>;
}

/**
 * Phase 2 Architectural Interface: Microsoft Entra ID SSO & Authorization
 * Not implemented in Phase 1 prototype.
 */
export interface EntraAuthProvider {
  readonly providerName: 'MICROSOFT_ENTRA_ID';
  getSignedInPrincipal(): Promise<UserAccount | null>;
  acquireApiToken(scopes: string[]): Promise<string>;
}
