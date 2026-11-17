import {
  canCreateInitiative,
  canEditInitiative,
  canMarkOwnerReviewed,
  canTransitionLifecycle,
} from '../domain/authorization';
import {
  computeNextReviewDue,
  computePortfolioMetrics,
  isReviewOverdue,
} from '../domain/calculations';
import {
  concurrencyConflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from '../domain/errors';
import {
  buildCostPlanCompositeKey,
  CostPlanDuplicateReviewItem,
  DuplicateReviewItem,
  NormalizedCostImportRow,
} from '../domain/excelImport';
import { formatYearMonth } from '../domain/financials';
import { DEFAULT_OPERATIONS_CONFIG } from '../domain/operationsReporting';
import { validateLifecycleTransition } from '../domain/lifecycle';
import {
  buildCanonicalPairKey,
  computeHeuristicPairSimilarity,
  computeRedundancyAnalysis,
} from '../domain/redundancy';
import {
  addBusinessDays,
  computeCaseDeadlines,
  computeNextBoardMeetingDate,
  DEFAULT_REDUNDANCY_DEADLINE_CONFIG,
  migrateLegacyRedundancyCase,
  toUtcDateKey,
  validateCloseRedundancyCase,
} from '../domain/redundancyWorkflow';
import {
  AiCostPlanEntry,
  AiCostTransaction,
  BenefitEntry,
  BoardDecision,
  CreateInitiativeInput,
  Department,
  formatRedundancyStatusLabel,
  ImportBatchRecord,
  ImportMappingTemplate,
  Initiative,
  InitiativeDraft,
  LifecycleEvent,
  ListInitiativesFilter,
  MarkOwnerReviewedInput,
  normalizeRedundancyCaseStatus,
  OperationsReportingConfig,
  PortfolioMetrics,
  RecordLifecycleEventInput,
  RedundancyAction,
  RedundancyCase,
  RedundancyDeadlineConfig,
  RedundancyEvent,
  RedundancyReviewRecord,
  SyncState,
  SyncStatusSummary,
  UpdateInitiativeInput,
  UserAccount,
  UserRole,
  WorkspaceDataset,
} from '../domain/types';
import { validateCreateInitiativeInput } from '../domain/validation';
import {
  createEmptyDatasetBucket,
  DatasetBucket,
  IDB_DATABASE_NAME,
  IndexedDbWorkspacePersistence,
  MemoryWorkspacePersistence,
  PersistedWorkspaceState,
  WorkspacePersistenceAdapter,
} from './indexedDbStore';
import {
  AddRedundancyDiscussionNoteInput,
  CloseRedundancyCaseInput,
  CopyMonthlyPlanAcrossYearInput,
  CreateRedundancyCaseInput,
  DuplicateCostPlanToMonthInput,
  EscalateRedundancyCaseInput,
  InitiativeDetailRecord,
  InitiativeRepository,
  RecordBoardDecisionInput,
  RedundancyCaseDetailRecord,
  SaveBenefitInput,
  SaveCostPlanInput,
  SaveCostTransactionInput,
  SaveRedundancyActionInput,
  SaveRedundancyReviewInput,
  UpdateRedundancyCaseInput,
} from './interfaces';
import {
  SEED_BENEFITS,
  SEED_BOARD_DECISIONS,
  SEED_COST_PLANS,
  SEED_COST_TRANSACTIONS,
  SEED_DEPARTMENTS,
  SEED_INITIATIVES,
  SEED_LIFECYCLE_EVENTS,
  SEED_REDUNDANCY_ACTIONS,
  SEED_REDUNDANCY_CASES,
  SEED_REDUNDANCY_EVENTS,
  SEED_REDUNDANCY_REVIEWS,
  SEED_USERS,
} from './seedData';

export const DEMO_DRAFT_KEY = 'aas_ai_governance_draft_v1';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createSeedDatasetBucket(): DatasetBucket {
  return {
    initiatives: clone(SEED_INITIATIVES),
    lifecycleEvents: clone(SEED_LIFECYCLE_EVENTS),
    benefits: clone(SEED_BENEFITS),
    costTransactions: clone(SEED_COST_TRANSACTIONS),
    costPlans: clone(SEED_COST_PLANS),
    redundancyReviews: clone(SEED_REDUNDANCY_REVIEWS),
    redundancyCases: clone(SEED_REDUNDANCY_CASES),
    redundancyActions: clone(SEED_REDUNDANCY_ACTIONS),
    redundancyEvents: clone(SEED_REDUNDANCY_EVENTS),
    boardDecisions: clone(SEED_BOARD_DECISIONS),
    importBatches: [],
    customDepartments: [],
    customUsers: [],
    lastUpdatedAt: '2026-11-14T14:00:00.000Z',
  };
}

export function createInitialWorkspaceState(): PersistedWorkspaceState {
  return {
    version: 4,
    activeDataset: 'SAMPLE_DEMO',
    datasets: {
      SAMPLE_DEMO: createSeedDatasetBucket(),
      IMPORTED_PORTFOLIO: createEmptyDatasetBucket(),
    },
    mappingTemplates: [],
    operationsConfig: clone(DEFAULT_OPERATIONS_CONFIG),
    redundancyDeadlineConfig: clone(DEFAULT_REDUNDANCY_DEADLINE_CONFIG),
  };
}

export class DemoRepository implements InitiativeRepository {
  private readonly persistence: WorkspacePersistenceAdapter;
  private readonly nowProvider: () => Date;
  private state: PersistedWorkspaceState;
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;

  constructor(options?: {
    persistence?: WorkspacePersistenceAdapter;
    nowProvider?: () => Date;
    autoHydrate?: boolean;
  }) {
    const isBrowser =
      typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
    this.persistence =
      options?.persistence ??
      (isBrowser
        ? new IndexedDbWorkspacePersistence()
        : new MemoryWorkspacePersistence());
    this.nowProvider = options?.nowProvider ?? (() => new Date());
    this.state = createInitialWorkspaceState();
    if (options?.autoHydrate !== false && isBrowser) {
      void this.hydrate();
    }
  }

  private normalizeLoadedBucket(
    bucket: DatasetBucket,
    datasetKey: WorkspaceDataset
  ): DatasetBucket {
    return {
      ...bucket,
      costPlans: Array.isArray(bucket.costPlans)
        ? bucket.costPlans
        : datasetKey === 'SAMPLE_DEMO'
          ? clone(SEED_COST_PLANS)
          : [],
      redundancyCases: Array.isArray(bucket.redundancyCases)
        ? bucket.redundancyCases.map((c) => migrateLegacyRedundancyCase(c))
        : [],
      redundancyActions: Array.isArray(bucket.redundancyActions)
        ? bucket.redundancyActions
        : [],
      redundancyEvents: Array.isArray(bucket.redundancyEvents)
        ? bucket.redundancyEvents
        : [],
      boardDecisions: Array.isArray(bucket.boardDecisions)
        ? bucket.boardDecisions
        : [],
    };
  }

  public async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (!this.hydratePromise) {
      this.hydratePromise = (async () => {
        const loaded = await this.persistence.load();
        if (
          loaded &&
          loaded.datasets &&
          loaded.datasets.SAMPLE_DEMO &&
          loaded.datasets.IMPORTED_PORTFOLIO
        ) {
          this.state = {
            ...loaded,
            datasets: {
              SAMPLE_DEMO: this.normalizeLoadedBucket(
                loaded.datasets.SAMPLE_DEMO,
                'SAMPLE_DEMO'
              ),
              IMPORTED_PORTFOLIO: this.normalizeLoadedBucket(
                loaded.datasets.IMPORTED_PORTFOLIO,
                'IMPORTED_PORTFOLIO'
              ),
            },
            redundancyDeadlineConfig:
              loaded.redundancyDeadlineConfig ??
              clone(DEFAULT_REDUNDANCY_DEADLINE_CONFIG),
          };
        } else {
          this.state = createInitialWorkspaceState();
          await this.persistence.save(this.state);
        }
        this.hydrated = true;
      })();
    }
    await this.hydratePromise;
  }

  private async ensureReady(): Promise<void> {
    if (!this.hydrated) {
      await this.hydrate();
    }
  }

  private activeBucket(): DatasetBucket {
    return this.state.datasets[this.state.activeDataset];
  }

  private async persist(): Promise<void> {
    await this.persistence.save(this.state);
  }

  public getActiveDataset(): WorkspaceDataset {
    return this.state.activeDataset;
  }

  public async switchDataset(dataset: WorkspaceDataset): Promise<void> {
    await this.ensureReady();
    this.state.activeDataset = dataset;
    await this.persist();
  }

  public async listInitiatives(
    filter?: ListInitiativesFilter
  ): Promise<Initiative[]> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const now = this.nowProvider();
    let results = clone(bucket.initiatives);

    if (filter) {
      if (filter.departmentId) {
        results = results.filter((i) => i.departmentId === filter.departmentId);
      }
      if (filter.lifecycleStatus) {
        results = results.filter(
          (i) => i.lifecycleStatus === filter.lifecycleStatus
        );
      }
      if (filter.category) {
        results = results.filter((i) => i.category === filter.category);
      }
      if (filter.valueCategory) {
        results = results.filter((i) => i.valueCategory === filter.valueCategory);
      }
      if (filter.ownerId) {
        results = results.filter((i) => i.ownerId === filter.ownerId);
      }
      if (filter.aiPlatform) {
        results = results.filter((i) => i.aiPlatform === filter.aiPlatform);
      }
      if (filter.needsCompletionOnly) {
        results = results.filter((i) => Boolean(i.needsDataCompletion));
      }
      if (filter.overdueOnly) {
        results = results.filter((i) => isReviewOverdue(i.nextReviewDue, now));
      }
      if (filter.search && filter.search.trim().length > 0) {
        const q = filter.search.trim().toLowerCase();
        results = results.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q) ||
            i.businessProblem.toLowerCase().includes(q) ||
            i.businessCapability.toLowerCase().includes(q) ||
            i.aiPlatform.toLowerCase().includes(q)
        );
      }
    }

    results.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return results;
  }

  public async getInitiative(id: string): Promise<InitiativeDetailRecord> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const found = bucket.initiatives.find((i) => i.id === id);
    if (!found) {
      throw notFoundError('Initiative', id);
    }
    const history = bucket.lifecycleEvents
      .filter((e) => e.initiativeId === id)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    return {
      initiative: clone(found),
      lifecycleHistory: clone(history),
    };
  }

  public async createInitiative(
    input: CreateInitiativeInput,
    actor: UserAccount
  ): Promise<Initiative> {
    await this.ensureReady();
    if (!canCreateInitiative(actor)) {
      throw forbiddenError(
        `Role ${actor.role} cannot create initiatives.`
      );
    }

    const fieldErrors = validateCreateInitiativeInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      throw validationError(
        'Please correct the highlighted fields before saving.',
        fieldErrors
      );
    }

    const bucket = this.activeBucket();
    const now = this.nowProvider();
    const nowIso = now.toISOString();
    const id = generateUuid();

    const hasSavingsInputs =
      Number(input.usersCount) > 0 ||
      Number(input.minutesSavedPerOccurrence) > 0 ||
      Number(input.processFrequencyPerWeek) > 0 ||
      (input.hourlyRate !== undefined && input.hourlyRate !== null) ||
      Boolean(input.qualityEvidenceOrKpi?.trim()) ||
      Boolean(input.strategicSuccessIndicator?.trim());

    const initiative: Initiative = {
      id,
      title: input.title.trim(),
      businessProblem: input.businessProblem.trim(),
      description: input.description.trim(),
      businessCapability: input.businessCapability.trim(),
      departmentId: input.departmentId,
      ownerId: input.ownerId,
      aiPlatform: input.aiPlatform.trim(),
      solutionType: input.solutionType.trim(),
      aiType: input.aiType.trim(),
      category: input.category,
      lifecycleStatus: input.lifecycleStatus,
      valueCategory: input.valueCategory,
      usersCount: Number(input.usersCount),
      minutesSavedPerOccurrence: Number(input.minutesSavedPerOccurrence),
      processFrequencyPerWeek: Number(input.processFrequencyPerWeek),
      hourlyRate:
        input.hourlyRate !== undefined && input.hourlyRate !== null
          ? Number(input.hourlyRate)
          : undefined,
      qualityEvidenceOrKpi: input.qualityEvidenceOrKpi?.trim() || undefined,
      strategicSuccessIndicator: input.strategicSuccessIndicator?.trim() || undefined,
      ideaDate: input.ideaDate,
      goLiveDate: input.goLiveDate?.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastOwnerReviewAt: nowIso,
      lastSavingsUpdatedAt: hasSavingsInputs ? nowIso : null,
      nextReviewDue: computeNextReviewDue(now),
      version: 1,
      provenance: 'USER_CREATED',
      syncLinkage: {
        sourceSystem: 'LOCAL_DEMO',
      },
    };

    const initialEvent: LifecycleEvent = {
      id: generateUuid(),
      initiativeId: id,
      fromStatus: null,
      toStatus: initiative.lifecycleStatus,
      actorId: actor.id,
      actorName: actor.displayName,
      timestamp: nowIso,
      note: 'Initial portfolio registration via Smart Intake.',
      isGovernedException: false,
    };

    bucket.initiatives.unshift(initiative);
    bucket.lifecycleEvents.push(initialEvent);
    bucket.lastUpdatedAt = nowIso;
    await this.persist();

    return clone(initiative);
  }

  public async updateInitiative(
    input: UpdateInitiativeInput,
    actor: UserAccount
  ): Promise<Initiative> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const index = bucket.initiatives.findIndex((i) => i.id === input.id);
    if (index === -1) {
      throw notFoundError('Initiative', input.id);
    }

    const existing = bucket.initiatives[index];
    if (!canEditInitiative(actor, existing)) {
      throw forbiddenError(
        'Demo Employees can only edit initiatives they own. Switch to the Demo AI Portfolio Manager role to edit other initiatives.'
      );
    }

    if (existing.version !== input.expectedVersion) {
      throw concurrencyConflictError(
        `This initiative was modified elsewhere (expected version ${input.expectedVersion}, found ${existing.version}). Reload and try again.`,
        existing.version
      );
    }

    const merged: CreateInitiativeInput = {
      title: input.patch.title ?? existing.title,
      businessProblem: input.patch.businessProblem ?? existing.businessProblem,
      description: input.patch.description ?? existing.description,
      businessCapability:
        input.patch.businessCapability ?? existing.businessCapability,
      departmentId: input.patch.departmentId ?? existing.departmentId,
      ownerId: input.patch.ownerId ?? existing.ownerId,
      aiPlatform: input.patch.aiPlatform ?? existing.aiPlatform,
      solutionType: input.patch.solutionType ?? existing.solutionType,
      aiType: input.patch.aiType ?? existing.aiType,
      category: input.patch.category ?? existing.category,
      lifecycleStatus: input.patch.lifecycleStatus ?? existing.lifecycleStatus,
      valueCategory: input.patch.valueCategory ?? existing.valueCategory,
      usersCount: input.patch.usersCount ?? existing.usersCount,
      minutesSavedPerOccurrence:
        input.patch.minutesSavedPerOccurrence ??
        existing.minutesSavedPerOccurrence,
      processFrequencyPerWeek:
        input.patch.processFrequencyPerWeek ?? existing.processFrequencyPerWeek,
      hourlyRate:
        'hourlyRate' in input.patch ? input.patch.hourlyRate : existing.hourlyRate,
      qualityEvidenceOrKpi:
        'qualityEvidenceOrKpi' in input.patch
          ? input.patch.qualityEvidenceOrKpi
          : existing.qualityEvidenceOrKpi,
      strategicSuccessIndicator:
        'strategicSuccessIndicator' in input.patch
          ? input.patch.strategicSuccessIndicator
          : existing.strategicSuccessIndicator,
      ideaDate: input.patch.ideaDate ?? existing.ideaDate,
      goLiveDate:
        'goLiveDate' in input.patch ? input.patch.goLiveDate : existing.goLiveDate,
    };

    const fieldErrors = validateCreateInitiativeInput(merged);
    if (Object.keys(fieldErrors).length > 0) {
      throw validationError(
        'Validation failed while updating initiative.',
        fieldErrors
      );
    }

    const now = this.nowProvider();
    const nowIso = now.toISOString();

    // Only update lastSavingsUpdatedAt if savings-relevant fields actually changed;
    // unrelated updates (title, description, owner, etc.) must NOT advance savings or review dates.
    const nextQualityKpi = merged.qualityEvidenceOrKpi?.trim() || undefined;
    const nextStrategicInd = merged.strategicSuccessIndicator?.trim() || undefined;
    const savingsFieldsChanged =
      merged.valueCategory !== existing.valueCategory ||
      Number(merged.usersCount) !== existing.usersCount ||
      Number(merged.minutesSavedPerOccurrence) !==
        existing.minutesSavedPerOccurrence ||
      Number(merged.processFrequencyPerWeek) !== existing.processFrequencyPerWeek ||
      (merged.hourlyRate ?? undefined) !== (existing.hourlyRate ?? undefined) ||
      nextQualityKpi !== (existing.qualityEvidenceOrKpi?.trim() || undefined) ||
      nextStrategicInd !==
        (existing.strategicSuccessIndicator?.trim() || undefined);

    const markReviewed = input.patch.markSavingsReviewed === true;

    const updated: Initiative = {
      ...existing,
      ...merged,
      title: merged.title.trim(),
      businessProblem: merged.businessProblem.trim(),
      description: merged.description.trim(),
      businessCapability: merged.businessCapability.trim(),
      aiPlatform: merged.aiPlatform.trim(),
      solutionType: merged.solutionType.trim(),
      aiType: merged.aiType.trim(),
      qualityEvidenceOrKpi: nextQualityKpi,
      strategicSuccessIndicator: nextStrategicInd,
      goLiveDate: merged.goLiveDate?.trim() || undefined,
      updatedAt: nowIso,
      lastSavingsUpdatedAt: savingsFieldsChanged
        ? nowIso
        : existing.lastSavingsUpdatedAt ?? null,
      lastOwnerReviewAt: markReviewed ? nowIso : existing.lastOwnerReviewAt,
      nextReviewDue: markReviewed
        ? computeNextReviewDue(now)
        : existing.nextReviewDue,
      version: existing.version + 1,
    };

    bucket.initiatives[index] = updated;
    bucket.lastUpdatedAt = nowIso;
    await this.persist();

    return clone(updated);
  }

  public async deleteInitiative(id: string, actor: UserAccount): Promise<void> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const existing = bucket.initiatives.find((i) => i.id === id);
    if (!existing) {
      throw notFoundError('Initiative', id);
    }
    if (!canEditInitiative(actor, existing)) {
      throw forbiddenError(
        'Demo Employees can only delete initiatives they own. AI Portfolio Manager role is required to remove other records.'
      );
    }

    const nowIso = this.nowProvider().toISOString();
    bucket.initiatives = bucket.initiatives.filter((i) => i.id !== id);
    bucket.lifecycleEvents = bucket.lifecycleEvents.filter(
      (e) => e.initiativeId !== id
    );
    bucket.benefits = bucket.benefits.filter((b) => b.initiativeId !== id);
    bucket.redundancyReviews = bucket.redundancyReviews.filter(
      (r) => r.initiativeAId !== id && r.initiativeBId !== id
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
  }

  public async recordLifecycleEvent(
    input: RecordLifecycleEventInput,
    actor: UserAccount
  ): Promise<{ initiative: Initiative; event: LifecycleEvent }> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const index = bucket.initiatives.findIndex((i) => i.id === input.initiativeId);
    if (index === -1) {
      throw notFoundError('Initiative', input.initiativeId);
    }

    const existing = bucket.initiatives[index];
    if (!canTransitionLifecycle(actor, existing)) {
      throw forbiddenError(
        'You do not have permission to change the lifecycle status of this initiative.'
      );
    }

    if (existing.version !== input.expectedVersion) {
      throw concurrencyConflictError(
        `Lifecycle transition conflict: expected version ${input.expectedVersion}, found ${existing.version}.`,
        existing.version
      );
    }

    const check = validateLifecycleTransition({
      fromStatus: existing.lifecycleStatus,
      toStatus: input.toStatus,
      note: input.note,
    });

    if (!check.valid) {
      throw validationError(check.error ?? 'Invalid lifecycle transition.', {
        note: check.error ?? 'Invalid lifecycle transition.',
      });
    }

    const nowIso = this.nowProvider().toISOString();
    const event: LifecycleEvent = {
      id: generateUuid(),
      initiativeId: existing.id,
      fromStatus: existing.lifecycleStatus,
      toStatus: input.toStatus,
      actorId: actor.id,
      actorName: actor.displayName,
      timestamp: nowIso,
      note: input.note.trim(),
      isGovernedException: check.isGovernedException,
    };

    const isEnteringLive =
      !existing.goLiveDate &&
      (input.toStatus === 'PILOT' ||
        input.toStatus === 'PRODUCTION' ||
        input.toStatus === 'MONITORING' ||
        input.toStatus === 'SCALE_IMPROVE');

    const updated: Initiative = {
      ...existing,
      lifecycleStatus: input.toStatus,
      goLiveDate: isEnteringLive ? nowIso.slice(0, 10) : existing.goLiveDate,
      updatedAt: nowIso,
      version: existing.version + 1,
    };

    bucket.initiatives[index] = updated;
    bucket.lifecycleEvents.push(event);
    bucket.lastUpdatedAt = nowIso;
    await this.persist();

    return {
      initiative: clone(updated),
      event: clone(event),
    };
  }

  public async markOwnerReviewed(
    input: MarkOwnerReviewedInput,
    actor: UserAccount
  ): Promise<Initiative> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const index = bucket.initiatives.findIndex((i) => i.id === input.initiativeId);
    if (index === -1) {
      throw notFoundError('Initiative', input.initiativeId);
    }

    const existing = bucket.initiatives[index];
    if (!canMarkOwnerReviewed(actor, existing)) {
      throw forbiddenError(
        'Only the accountable owner or AI Governance can mark an initiative as reviewed.'
      );
    }

    if (existing.version !== input.expectedVersion) {
      throw concurrencyConflictError(
        `Review update conflict: expected version ${input.expectedVersion}, found ${existing.version}.`,
        existing.version
      );
    }

    const now = this.nowProvider();
    const nowIso = now.toISOString();
    const nextDue = computeNextReviewDue(now);

    const updated: Initiative = {
      ...existing,
      lastOwnerReviewAt: nowIso,
      nextReviewDue: nextDue,
      updatedAt: nowIso,
      version: existing.version + 1,
    };

    bucket.initiatives[index] = updated;
    bucket.lastUpdatedAt = nowIso;
    await this.persist();

    return clone(updated);
  }

  public async listAllLifecycleEvents(): Promise<LifecycleEvent[]> {
    await this.ensureReady();
    return clone(this.activeBucket().lifecycleEvents);
  }

  public async listDepartments(): Promise<Department[]> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const map = new Map<string, Department>();
    for (const d of SEED_DEPARTMENTS) map.set(d.id, d);
    for (const d of bucket.customDepartments) map.set(d.id, d);
    return clone(Array.from(map.values()));
  }

  public async listUsers(): Promise<UserAccount[]> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const map = new Map<string, UserAccount>();
    for (const u of SEED_USERS) map.set(u.id, u);
    for (const u of bucket.customUsers) map.set(u.id, u);
    return clone(Array.from(map.values()));
  }

  public async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    const [initiatives, departments] = await Promise.all([
      this.listInitiatives(),
      this.listDepartments(),
    ]);
    return computePortfolioMetrics(initiatives, departments, this.nowProvider());
  }

  public async getSyncStatus(): Promise<SyncStatusSummary> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    return {
      mode: 'LOCAL_INDEXEDDB_DEMO',
      activeDataset: this.state.activeDataset,
      syncState: SyncState.LOCAL_DEMO_ONLY,
      storageKey: `${IDB_DATABASE_NAME} (${this.state.activeDataset})`,
      lastUpdatedAt: bucket.lastUpdatedAt,
      pendingOutboxCount: 0,
      targetProductionStack: [
        'Microsoft SharePoint Lists (Target System of Record)',
        'Microsoft Graph v1.0 (Optional Read-Only Diagnostics)',
        'Microsoft Entra ID (MSAL Authentication)',
      ],
      disclaimer:
        'Demo Mode active with local IndexedDB persistence. Changes stay in this browser only and are not synced to Microsoft SharePoint Lists, Entra ID, or external AI services.',
    };
  }

  public async resetDemoData(): Promise<void> {
    this.state = createInitialWorkspaceState();
    this.hydrated = true;
    await this.persistence.save(this.state);
    this.clearDraft();
  }

  public getDraft(): InitiativeDraft | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(DEMO_DRAFT_KEY);
      return raw ? (JSON.parse(raw) as InitiativeDraft) : null;
    } catch {
      return null;
    }
  }

  public saveDraft(draft: InitiativeDraft): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(DEMO_DRAFT_KEY, JSON.stringify(draft));
  }

  public clearDraft(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(DEMO_DRAFT_KEY);
  }

  // ---------- Benefits Management ----------

  public async listBenefits(): Promise<BenefitEntry[]> {
    await this.ensureReady();
    return clone(this.activeBucket().benefits).sort((a, b) =>
      b.period.localeCompare(a.period)
    );
  }

  public async saveBenefit(
    input: SaveBenefitInput,
    actor: UserAccount
  ): Promise<BenefitEntry> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to manage financial benefit entries.'
      );
    }
    if (
      !input.initiativeId ||
      !input.departmentId ||
      !input.period ||
      input.estimatedAmountEur < 0 ||
      input.realizedAmountEur < 0
    ) {
      throw validationError('Benefit entry requires valid initiative, department, period, and non-negative EUR amounts.');
    }

    const bucket = this.activeBucket();
    const nowIso = this.nowProvider().toISOString();

    if (input.id) {
      const idx = bucket.benefits.findIndex((b) => b.id === input.id);
      if (idx === -1) throw notFoundError('BenefitEntry', input.id);
      const updated: BenefitEntry = {
        ...bucket.benefits[idx],
        ...input,
        costCenter: input.costCenter?.trim() || undefined,
        description: input.description.trim(),
        evidenceStatus: input.evidenceStatus ?? bucket.benefits[idx].evidenceStatus,
        evidenceNote: input.evidenceNote?.trim() || bucket.benefits[idx].evidenceNote,
      };
      bucket.benefits[idx] = updated;
      bucket.lastUpdatedAt = nowIso;
      await this.persist();
      return clone(updated);
    }

    const created: BenefitEntry = {
      id: `ben-${generateUuid().slice(0, 8)}`,
      initiativeId: input.initiativeId,
      departmentId: input.departmentId,
      costCenter: input.costCenter?.trim() || undefined,
      benefitType: input.benefitType,
      estimatedAmountEur: Number(input.estimatedAmountEur),
      realizedAmountEur: Number(input.realizedAmountEur),
      period: input.period,
      description: input.description.trim(),
      evidenceStatus: input.evidenceStatus ?? 'DOCUMENTED',
      evidenceNote: input.evidenceNote?.trim() || undefined,
      provenance: 'USER_CREATED',
      createdAt: nowIso,
    };
    bucket.benefits.unshift(created);
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(created);
  }

  public async deleteBenefit(id: string, actor: UserAccount): Promise<void> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError('AI Portfolio Manager role is required to delete benefit entries.');
    }
    const bucket = this.activeBucket();
    bucket.benefits = bucket.benefits.filter((b) => b.id !== id);
    bucket.lastUpdatedAt = this.nowProvider().toISOString();
    await this.persist();
  }

  // ---------- AI Cost Transactions ----------

  public async listCostTransactions(): Promise<AiCostTransaction[]> {
    await this.ensureReady();
    return clone(this.activeBucket().costTransactions).sort((a, b) =>
      b.period.localeCompare(a.period)
    );
  }

  public async saveCostTransaction(
    input: SaveCostTransactionInput,
    actor: UserAccount
  ): Promise<AiCostTransaction> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to record AI cost transactions.'
      );
    }
    if (
      !input.departmentId ||
      !input.costCenter.trim() ||
      !input.period.trim() ||
      input.amountEur < 0 ||
      input.tokens < 0
    ) {
      throw validationError(
        'Cost transaction requires department, cost center, period, and non-negative EUR/tokens.'
      );
    }

    const bucket = this.activeBucket();
    const nowIso = this.nowProvider().toISOString();

    if (input.id) {
      const idx = bucket.costTransactions.findIndex((c) => c.id === input.id);
      if (idx === -1) throw notFoundError('AiCostTransaction', input.id);
      const updated: AiCostTransaction = {
        ...bucket.costTransactions[idx],
        ...input,
        costCenter: input.costCenter.trim(),
        platform: input.platform.trim(),
        note: input.note?.trim() || undefined,
      };
      bucket.costTransactions[idx] = updated;
      bucket.lastUpdatedAt = nowIso;
      await this.persist();
      return clone(updated);
    }

    const created: AiCostTransaction = {
      id: `cost-${generateUuid().slice(0, 8)}`,
      departmentId: input.departmentId,
      costCenter: input.costCenter.trim(),
      period: input.period.trim(),
      platform: input.platform.trim(),
      costCategory: input.costCategory,
      spendType: input.spendType,
      amountEur: Number(input.amountEur),
      tokens: Math.round(Number(input.tokens)),
      initiativeId: input.initiativeId?.trim() || undefined,
      note: input.note?.trim() || undefined,
      provenance: 'USER_CREATED',
      createdAt: nowIso,
    };

    bucket.costTransactions.unshift(created);
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(created);
  }

  public async deleteCostTransaction(
    id: string,
    actor: UserAccount
  ): Promise<void> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError('AI Portfolio Manager role is required to delete AI cost entries.');
    }
    const bucket = this.activeBucket();
    bucket.costTransactions = bucket.costTransactions.filter((c) => c.id !== id);
    bucket.lastUpdatedAt = this.nowProvider().toISOString();
    await this.persist();
  }

  // ---------- AI Cost Planning (Budgets & Forecasts) ----------

  public async listCostPlans(filter?: {
    planningYear?: number;
    departmentId?: string;
    platform?: string;
  }): Promise<AiCostPlanEntry[]> {
    await this.ensureReady();
    let list = clone(this.activeBucket().costPlans ?? []);
    if (filter?.planningYear) {
      list = list.filter((p) => p.planningYear === filter.planningYear);
    }
    if (filter?.departmentId) {
      list = list.filter((p) => p.departmentId === filter.departmentId);
    }
    if (filter?.platform) {
      list = list.filter((p) => p.platform === filter.platform);
    }
    return list.sort((a, b) => {
      if (b.planningYear !== a.planningYear) return b.planningYear - a.planningYear;
      if (a.month !== b.month) return a.month - b.month;
      return a.departmentId.localeCompare(b.departmentId);
    });
  }

  public async saveCostPlan(
    input: SaveCostPlanInput,
    actor: UserAccount
  ): Promise<AiCostPlanEntry> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to create or edit AI cost plans.'
      );
    }
    const year = Math.round(Number(input.planningYear));
    const month = Math.round(Number(input.month));
    const planned = Number(input.plannedAmountEur);
    const forecast =
      input.forecastAmountEur === null || input.forecastAmountEur === undefined
        ? null
        : Number(input.forecastAmountEur);
    const licenseCount =
      input.licenseCount === null || input.licenseCount === undefined
        ? null
        : Math.round(Number(input.licenseCount));

    if (
      !input.departmentId ||
      !input.platform.trim() ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isFinite(planned) ||
      planned < 0 ||
      (forecast !== null && (!Number.isFinite(forecast) || forecast < 0)) ||
      (licenseCount !== null && (!Number.isFinite(licenseCount) || licenseCount < 0))
    ) {
      throw validationError(
        'Cost plan requires department, platform, valid year (2000–2100), month (1–12), and non-negative Planned/Forecast EUR amounts.'
      );
    }

    const bucket = this.activeBucket();
    if (!bucket.costPlans) bucket.costPlans = [];
    const nowIso = this.nowProvider().toISOString();
    const period = formatYearMonth(year, month);

    if (input.id) {
      const idx = bucket.costPlans.findIndex((p) => p.id === input.id);
      if (idx === -1) throw notFoundError('AiCostPlanEntry', input.id);
      const prev = bucket.costPlans[idx];
      const updated: AiCostPlanEntry = {
        ...prev,
        departmentId: input.departmentId,
        planningYear: year,
        month,
        period,
        platform: input.platform.trim(),
        costCategory: input.costCategory,
        plannedAmountEur: planned,
        forecastAmountEur: forecast,
        costCenter: input.costCenter?.trim() || undefined,
        licenseCount,
        comments: input.comments?.trim() || undefined,
        updatedAt: nowIso,
      };
      bucket.costPlans[idx] = updated;
      bucket.lastUpdatedAt = nowIso;
      await this.persist();
      return clone(updated);
    }

    const created: AiCostPlanEntry = {
      id: `cplan-${generateUuid().slice(0, 8)}`,
      departmentId: input.departmentId,
      planningYear: year,
      month,
      period,
      platform: input.platform.trim(),
      costCategory: input.costCategory,
      plannedAmountEur: planned,
      forecastAmountEur: forecast,
      costCenter: input.costCenter?.trim() || undefined,
      licenseCount,
      comments: input.comments?.trim() || undefined,
      provenance: 'MANUAL',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    bucket.costPlans.unshift(created);
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(created);
  }

  public async deleteCostPlan(id: string, actor: UserAccount): Promise<void> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to delete AI cost plan entries.'
      );
    }
    const bucket = this.activeBucket();
    bucket.costPlans = (bucket.costPlans ?? []).filter((p) => p.id !== id);
    bucket.lastUpdatedAt = this.nowProvider().toISOString();
    await this.persist();
  }

  public async duplicateCostPlanToMonth(
    input: DuplicateCostPlanToMonthInput,
    actor: UserAccount
  ): Promise<{ entry: AiCostPlanEntry; action: 'CREATED' | 'UPDATED' }> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to duplicate cost plan entries.'
      );
    }
    const bucket = this.activeBucket();
    const plans = bucket.costPlans ?? [];
    const source = plans.find((p) => p.id === input.sourcePlanId);
    if (!source) throw notFoundError('AiCostPlanEntry', input.sourcePlanId);

    const targetYear = Math.round(Number(input.targetPlanningYear));
    const targetMonth = Math.round(Number(input.targetMonth));
    if (
      !Number.isInteger(targetYear) ||
      targetYear < 2000 ||
      targetYear > 2100 ||
      !Number.isInteger(targetMonth) ||
      targetMonth < 1 ||
      targetMonth > 12
    ) {
      throw validationError('Target planning year and month (1–12) are invalid.');
    }

    const targetKey = buildCostPlanCompositeKey({
      departmentId: source.departmentId,
      planningYear: targetYear,
      month: targetMonth,
      platform: source.platform,
      costCategory: source.costCategory,
      costCenter: source.costCenter,
    });
    const nowIso = this.nowProvider().toISOString();
    const existingIdx = plans.findIndex(
      (p) =>
        buildCostPlanCompositeKey({
          departmentId: p.departmentId,
          planningYear: p.planningYear,
          month: p.month,
          platform: p.platform,
          costCategory: p.costCategory,
          costCenter: p.costCenter,
        }) === targetKey
    );

    if (existingIdx >= 0 && input.overwriteExisting) {
      const updated: AiCostPlanEntry = {
        ...plans[existingIdx],
        plannedAmountEur: source.plannedAmountEur,
        forecastAmountEur: source.forecastAmountEur,
        licenseCount: source.licenseCount ?? null,
        comments: source.comments,
        updatedAt: nowIso,
      };
      plans[existingIdx] = updated;
      bucket.costPlans = plans;
      bucket.lastUpdatedAt = nowIso;
      await this.persist();
      return { entry: clone(updated), action: 'UPDATED' };
    }

    const created: AiCostPlanEntry = {
      ...clone(source),
      id: `cplan-${generateUuid().slice(0, 8)}`,
      planningYear: targetYear,
      month: targetMonth,
      period: formatYearMonth(targetYear, targetMonth),
      provenance: 'MANUAL',
      importBatchId: undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    plans.unshift(created);
    bucket.costPlans = plans;
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return { entry: clone(created), action: 'CREATED' };
  }

  public async copyMonthlyPlanAcrossYear(
    input: CopyMonthlyPlanAcrossYearInput,
    actor: UserAccount
  ): Promise<{ createdCount: number; updatedCount: number; skippedCount: number }> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to copy monthly cost plans across the year.'
      );
    }
    const bucket = this.activeBucket();
    if (!bucket.costPlans) bucket.costPlans = [];
    const plans = bucket.costPlans;

    const sourceEntries = plans.filter(
      (p) =>
        p.planningYear === input.sourcePlanningYear &&
        p.month === input.sourceMonth &&
        (!input.departmentId || p.departmentId === input.departmentId)
    );
    if (sourceEntries.length === 0) {
      throw validationError(
        `No cost plan entries found for ${formatYearMonth(input.sourcePlanningYear, input.sourceMonth)} in the selected scope.`
      );
    }

    const validTargets = Array.from(
      new Set(
        input.targetMonths
          .map((m) => Math.round(Number(m)))
          .filter((m) => m >= 1 && m <= 12 && m !== input.sourceMonth)
      )
    ).sort((a, b) => a - b);

    if (validTargets.length === 0) {
      throw validationError('Select at least one target month different from the source month.');
    }

    const nowIso = this.nowProvider().toISOString();
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const targetMonth of validTargets) {
      for (const src of sourceEntries) {
        const key = buildCostPlanCompositeKey({
          departmentId: src.departmentId,
          planningYear: input.sourcePlanningYear,
          month: targetMonth,
          platform: src.platform,
          costCategory: src.costCategory,
          costCenter: src.costCenter,
        });
        const existingIdx = plans.findIndex(
          (p) =>
            buildCostPlanCompositeKey({
              departmentId: p.departmentId,
              planningYear: p.planningYear,
              month: p.month,
              platform: p.platform,
              costCategory: p.costCategory,
              costCenter: p.costCenter,
            }) === key
        );

        if (existingIdx >= 0) {
          if (input.overwriteExisting) {
            plans[existingIdx] = {
              ...plans[existingIdx],
              plannedAmountEur: src.plannedAmountEur,
              forecastAmountEur: src.forecastAmountEur,
              licenseCount: src.licenseCount ?? null,
              comments: src.comments,
              updatedAt: nowIso,
            };
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
          continue;
        }

        plans.unshift({
          ...clone(src),
          id: `cplan-${generateUuid().slice(0, 8)}`,
          month: targetMonth,
          period: formatYearMonth(input.sourcePlanningYear, targetMonth),
          provenance: 'MANUAL',
          importBatchId: undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        createdCount += 1;
      }
    }

    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return { createdCount, updatedCount, skippedCount };
  }

  // ---------- Redundancy Governance Review Queue ----------

  public async listRedundancyReviews(): Promise<RedundancyReviewRecord[]> {
    await this.ensureReady();
    return clone(this.activeBucket().redundancyReviews);
  }

  public async saveRedundancyReview(
    input: SaveRedundancyReviewInput,
    actor: UserAccount
  ): Promise<RedundancyReviewRecord> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to triage redundancy & synergy candidates.'
      );
    }

    const bucket = this.activeBucket();
    const nowIso = this.nowProvider().toISOString();
    const existingIdx = bucket.redundancyReviews.findIndex(
      (r) => r.pairKey === input.pairKey
    );

    const record: RedundancyReviewRecord = {
      id:
        existingIdx >= 0
          ? bucket.redundancyReviews[existingIdx].id
          : `rev-${generateUuid().slice(0, 8)}`,
      pairKey: input.pairKey,
      initiativeAId: input.initiativeAId,
      initiativeBId: input.initiativeBId,
      heuristicScore: input.heuristicScore,
      disposition: input.disposition,
      collaborationRecommendation: input.collaborationRecommendation.trim(),
      reviewerId: actor.id,
      reviewerName: actor.displayName,
      reviewedAt: nowIso,
    };

    if (existingIdx >= 0) {
      bucket.redundancyReviews[existingIdx] = record;
    } else {
      bucket.redundancyReviews.unshift(record);
    }

    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(record);
  }

  // ---------- Transactional Excel / CSV Batch Staging & Commit ----------

  public async listImportBatches(): Promise<ImportBatchRecord[]> {
    await this.ensureReady();
    return clone(this.activeBucket().importBatches).sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt)
    );
  }

  public async commitInitiativeImportBatch(params: {
    fileName: string;
    worksheetName: string;
    targetDataset: WorkspaceDataset;
    items: DuplicateReviewItem[];
    failedCount?: number;
    actor: UserAccount;
  }): Promise<ImportBatchRecord> {
    await this.ensureReady();
    if (params.actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to commit portfolio Excel/CSV imports.'
      );
    }

    // Validate all non-skipped staged items before mutating target bucket (transactional staging)
    const stagedItems = params.items.filter((i) => i.decision !== 'SKIP');
    for (const item of stagedItems) {
      if (!item.row.isValid) {
        throw validationError(
          `Batch rejected before commit: row ${item.row.rowIndex} ("${item.row.title || 'Unnamed'}") has validation errors.`
        );
      }
    }

    const targetBucket = this.state.datasets[params.targetDataset];
    // Clone target bucket for atomic staging
    const stagedBucket = clone(targetBucket);
    const now = this.nowProvider();
    const nowIso = now.toISOString();
    const batchId = `batch-${generateUuid().slice(0, 8)}`;

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const existingDepts = new Map<string, Department>();
    for (const d of SEED_DEPARTMENTS) existingDepts.set(d.id, d);
    for (const d of stagedBucket.customDepartments) existingDepts.set(d.id, d);

    const existingUsers = new Map<string, UserAccount>();
    for (const u of SEED_USERS) existingUsers.set(u.id, u);
    for (const u of stagedBucket.customUsers) existingUsers.set(u.id, u);

    for (const item of params.items) {
      if (item.decision === 'SKIP') {
        skippedCount += 1;
        continue;
      }

      const row = item.row;

      // Ensure department exists in catalog if new
      if (row.departmentId && !existingDepts.has(row.departmentId)) {
        const newDept: Department = {
          id: row.departmentId,
          name: row.departmentName,
          code: row.departmentName.slice(0, 4).toUpperCase(),
          costCenter: 'IMPORTED',
        };
        stagedBucket.customDepartments.push(newDept);
        existingDepts.set(newDept.id, newDept);
      }

      // Ensure imported owner exists in directory if new
      if (row.ownerId && !existingUsers.has(row.ownerId)) {
        const newUser: UserAccount = {
          id: row.ownerId,
          displayName: row.ownerDisplayName || row.ownerId,
          email: row.ownerDisplayName.includes('@') ? row.ownerDisplayName : '',
          role: UserRole.EMPLOYEE,
          departmentId: row.departmentId,
          jobTitle: 'Imported Portfolio Owner',
        };
        stagedBucket.customUsers.push(newUser);
        existingUsers.set(newUser.id, newUser);
      }

      if (item.decision === 'UPDATE_EXISTING' && item.matchedInitiative) {
        const idx = stagedBucket.initiatives.findIndex(
          (i) => i.id === item.matchedInitiative!.id
        );
        if (idx !== -1) {
          const prev = stagedBucket.initiatives[idx];
          const statusChanged = prev.lifecycleStatus !== row.lifecycleStatus;
          stagedBucket.initiatives[idx] = {
            ...prev,
            title: row.title,
            businessProblem: row.businessProblem,
            description: row.description,
            businessCapability: row.businessCapability,
            departmentId: row.departmentId,
            ownerId: row.ownerId,
            aiPlatform: row.aiPlatform,
            aiType: row.aiType,
            solutionType: row.solutionType,
            category: row.category,
            lifecycleStatus: row.lifecycleStatus,
            valueCategory: row.valueCategory,
            usersCount: row.usersCount,
            minutesSavedPerOccurrence: row.minutesSavedPerOccurrence,
            processFrequencyPerWeek: row.processFrequencyPerWeek,
            hourlyRate: row.hourlyRate,
            ideaDate: row.ideaDate,
            goLiveDate: row.goLiveDate,
            updatedAt: row.updatedAt ?? nowIso,
            version: prev.version + 1,
            provenance: 'IMPORTED_EXCEL',
            importBatchId: batchId,
            needsDataCompletion: row.needsDataCompletion,
            missingDataFields: row.missingDataFields,
            sourceImportedAt: nowIso,
            sourceFileName: params.fileName,
            syncLinkage: {
              ...prev.syncLinkage,
              itemId: row.sharepointId ?? prev.syncLinkage.itemId,
            },
          };

          if (statusChanged) {
            stagedBucket.lifecycleEvents.push({
              id: generateUuid(),
              initiativeId: prev.id,
              fromStatus: prev.lifecycleStatus,
              toStatus: row.lifecycleStatus,
              actorId: params.actor.id,
              actorName: params.actor.displayName,
              timestamp: nowIso,
              note: `Updated via Excel import (${params.fileName}).`,
              isGovernedException: false,
            });
          }

          updatedCount += 1;
          continue;
        }
      }

      // IMPORT_NEW
      const newId =
        row.sharepointId &&
        !stagedBucket.initiatives.some((i) => i.id === row.sharepointId)
          ? `imp-${row.sharepointId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
          : `imp-${generateUuid().slice(0, 8)}`;

      const created: Initiative = {
        id: newId,
        title: row.title,
        businessProblem: row.businessProblem,
        description: row.description,
        businessCapability: row.businessCapability,
        departmentId: row.departmentId,
        ownerId: row.ownerId,
        aiPlatform: row.aiPlatform,
        solutionType: row.solutionType,
        aiType: row.aiType,
        category: row.category,
        lifecycleStatus: row.lifecycleStatus,
        valueCategory: row.valueCategory,
        usersCount: row.usersCount,
        minutesSavedPerOccurrence: row.minutesSavedPerOccurrence,
        processFrequencyPerWeek: row.processFrequencyPerWeek,
        hourlyRate: row.hourlyRate,
        ideaDate: row.ideaDate,
        goLiveDate: row.goLiveDate,
        createdAt: row.createdAt ?? nowIso,
        updatedAt: row.updatedAt ?? nowIso,
        lastOwnerReviewAt: nowIso,
        nextReviewDue: computeNextReviewDue(now),
        version: 1,
        provenance: 'IMPORTED_EXCEL',
        importBatchId: batchId,
        needsDataCompletion: row.needsDataCompletion,
        missingDataFields: row.missingDataFields,
        sourceImportedAt: nowIso,
        sourceFileName: params.fileName,
        syncLinkage: {
          sourceSystem: 'LOCAL_DEMO',
          itemId: row.sharepointId,
        },
      };

      stagedBucket.initiatives.unshift(created);
      stagedBucket.lifecycleEvents.push({
        id: generateUuid(),
        initiativeId: created.id,
        fromStatus: null,
        toStatus: created.lifecycleStatus,
        actorId: params.actor.id,
        actorName: params.actor.displayName,
        timestamp: row.createdAt ?? nowIso,
        note: `Imported from ${params.fileName} (${params.worksheetName}).`,
        isGovernedException: false,
      });
      createdCount += 1;
    }

    const batchRecord: ImportBatchRecord = {
      id: batchId,
      kind: 'INITIATIVES',
      fileName: params.fileName,
      worksheetName: params.worksheetName,
      targetDataset: params.targetDataset,
      createdCount,
      updatedCount,
      skippedCount,
      errorCount: params.failedCount ?? 0,
      importedAt: nowIso,
      actorName: params.actor.displayName,
    };

    stagedBucket.importBatches.unshift(batchRecord);
    stagedBucket.lastUpdatedAt = nowIso;

    // Atomic swap & switch to targetDataset cleanly
    this.state.datasets[params.targetDataset] = stagedBucket;
    this.state.activeDataset = params.targetDataset;
    await this.persist();

    return clone(batchRecord);
  }

  public async commitCostImportBatch(params: {
    fileName: string;
    worksheetName: string;
    targetDataset: WorkspaceDataset;
    rows: NormalizedCostImportRow[];
    actor: UserAccount;
  }): Promise<ImportBatchRecord> {
    await this.ensureReady();
    if (params.actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to import AI cost spreadsheets.'
      );
    }

    const invalid = params.rows.filter((r) => !r.isValid);
    if (invalid.length > 0) {
      throw validationError(
        `Cost import rejected before commit: ${invalid.length} row(s) contain validation errors.`
      );
    }

    const stagedBucket = clone(this.state.datasets[params.targetDataset]);
    const nowIso = this.nowProvider().toISOString();
    const batchId = `cost-batch-${generateUuid().slice(0, 8)}`;

    const existingDepts = new Map<string, Department>();
    for (const d of SEED_DEPARTMENTS) existingDepts.set(d.id, d);
    for (const d of stagedBucket.customDepartments) existingDepts.set(d.id, d);

    let createdCount = 0;
    let skippedCount = 0;

    for (const row of params.rows) {
      if (row.departmentId && !existingDepts.has(row.departmentId)) {
        const newDept: Department = {
          id: row.departmentId,
          name: row.departmentName,
          code: row.departmentName.slice(0, 4).toUpperCase(),
          costCenter: row.costCenter,
        };
        stagedBucket.customDepartments.push(newDept);
        existingDepts.set(newDept.id, newDept);
      }

      // Idempotent duplicate protection for identical cost rows (dept + cc + period + platform + category + spendType + amount)
      const duplicate = stagedBucket.costTransactions.some(
        (c) =>
          c.departmentId === row.departmentId &&
          c.costCenter.toLowerCase() === row.costCenter.toLowerCase() &&
          c.period === row.period &&
          c.platform.toLowerCase() === row.platform.toLowerCase() &&
          c.costCategory === row.costCategory &&
          c.spendType === row.spendType &&
          c.amountEur === row.amountEur &&
          c.tokens === row.tokens
      );

      if (duplicate) {
        skippedCount += 1;
        continue;
      }

      stagedBucket.costTransactions.unshift({
        id: `cost-${generateUuid().slice(0, 8)}`,
        departmentId: row.departmentId,
        costCenter: row.costCenter,
        period: row.period,
        platform: row.platform,
        costCategory: row.costCategory,
        spendType: row.spendType,
        amountEur: row.amountEur,
        tokens: row.tokens,
        initiativeId: row.initiativeId,
        note: row.note,
        provenance: 'IMPORTED_EXCEL',
        importBatchId: batchId,
        createdAt: nowIso,
      });
      createdCount += 1;
    }

    const batchRecord: ImportBatchRecord = {
      id: batchId,
      kind: 'AI_COSTS',
      fileName: params.fileName,
      worksheetName: params.worksheetName,
      targetDataset: params.targetDataset,
      createdCount,
      updatedCount: 0,
      skippedCount,
      errorCount: 0,
      importedAt: nowIso,
      actorName: params.actor.displayName,
    };

    stagedBucket.importBatches.unshift(batchRecord);
    stagedBucket.lastUpdatedAt = nowIso;
    this.state.datasets[params.targetDataset] = stagedBucket;
    this.state.activeDataset = params.targetDataset;
    await this.persist();

    return clone(batchRecord);
  }

  public async commitCostPlanImportBatch(params: {
    fileName: string;
    worksheetName: string;
    targetDataset: WorkspaceDataset;
    items: CostPlanDuplicateReviewItem[];
    failedCount?: number;
    actor: UserAccount;
  }): Promise<ImportBatchRecord> {
    await this.ensureReady();
    if (params.actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to commit AI Cost Planning spreadsheets.'
      );
    }

    const activeItems = params.items.filter((i) => i.decision !== 'SKIP');
    for (const item of activeItems) {
      if (!item.row.isValid) {
        throw validationError(
          `Cost Plan batch rejected: row ${item.row.rowIndex} contains validation errors.`
        );
      }
    }

    const stagedBucket = clone(this.state.datasets[params.targetDataset]);
    if (!stagedBucket.costPlans) stagedBucket.costPlans = [];

    const nowIso = this.nowProvider().toISOString();
    const batchId = `cplan-batch-${generateUuid().slice(0, 8)}`;

    const existingDepts = new Map<string, Department>();
    for (const d of SEED_DEPARTMENTS) existingDepts.set(d.id, d);
    for (const d of stagedBucket.customDepartments) existingDepts.set(d.id, d);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of params.items) {
      if (item.decision === 'SKIP') {
        skippedCount += 1;
        continue;
      }

      const row = item.row;
      if (row.departmentId && !existingDepts.has(row.departmentId)) {
        const newDept: Department = {
          id: row.departmentId,
          name: row.departmentName,
          code: row.departmentName.slice(0, 4).toUpperCase(),
          costCenter: row.costCenter || 'IMPORTED',
        };
        stagedBucket.customDepartments.push(newDept);
        existingDepts.set(newDept.id, newDept);
      }

      if (item.decision === 'UPDATE_EXISTING' && item.matchedPlan) {
        const idx = stagedBucket.costPlans.findIndex(
          (p) => p.id === item.matchedPlan!.id
        );
        if (idx !== -1) {
          const prev = stagedBucket.costPlans[idx];
          stagedBucket.costPlans[idx] = {
            ...prev,
            departmentId: row.departmentId,
            planningYear: row.planningYear,
            month: row.month,
            period: row.period || formatYearMonth(row.planningYear, row.month),
            platform: row.platform,
            costCategory: row.costCategory,
            plannedAmountEur: row.plannedAmountEur,
            forecastAmountEur: row.forecastAmountEur,
            costCenter: row.costCenter ?? prev.costCenter,
            licenseCount:
              row.licenseCount !== undefined ? row.licenseCount : prev.licenseCount,
            comments: row.comments ?? prev.comments,
            provenance: 'IMPORTED_EXCEL',
            importBatchId: batchId,
            updatedAt: nowIso,
          };
          updatedCount += 1;
          continue;
        }
      }

      // CREATE_NEW (never touches costTransactions actuals!)
      stagedBucket.costPlans.unshift({
        id: `cplan-${generateUuid().slice(0, 8)}`,
        departmentId: row.departmentId,
        planningYear: row.planningYear,
        month: row.month,
        period: row.period || formatYearMonth(row.planningYear, row.month),
        platform: row.platform,
        costCategory: row.costCategory,
        plannedAmountEur: row.plannedAmountEur,
        forecastAmountEur: row.forecastAmountEur,
        costCenter: row.costCenter,
        licenseCount: row.licenseCount ?? null,
        comments: row.comments,
        provenance: 'IMPORTED_EXCEL',
        importBatchId: batchId,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      createdCount += 1;
    }

    const batchRecord: ImportBatchRecord = {
      id: batchId,
      kind: 'COST_PLANS',
      fileName: params.fileName,
      worksheetName: params.worksheetName,
      targetDataset: params.targetDataset,
      createdCount,
      updatedCount,
      skippedCount,
      errorCount: params.failedCount ?? 0,
      importedAt: nowIso,
      actorName: params.actor.displayName,
    };

    stagedBucket.importBatches.unshift(batchRecord);
    stagedBucket.lastUpdatedAt = nowIso;
    this.state.datasets[params.targetDataset] = stagedBucket;
    this.state.activeDataset = params.targetDataset;
    await this.persist();

    return clone(batchRecord);
  }

  // ---------- Saved Excel Column Mapping Templates ----------

  public async listMappingTemplates(): Promise<ImportMappingTemplate[]> {
    await this.ensureReady();
    return clone(this.state.mappingTemplates ?? []).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  public async saveMappingTemplate(input: {
    name: string;
    mappings: Array<{ sourceHeader: string; targetField: string }>;
  }): Promise<ImportMappingTemplate> {
    await this.ensureReady();
    const cleanName = input.name.trim();
    if (!cleanName) {
      throw validationError('Mapping template name cannot be empty.');
    }
    const nowIso = this.nowProvider().toISOString();
    const existingList = this.state.mappingTemplates ?? [];
    const existingIdx = existingList.findIndex(
      (t) => t.name.toLowerCase() === cleanName.toLowerCase()
    );

    const record: ImportMappingTemplate = {
      id:
        existingIdx >= 0
          ? existingList[existingIdx].id
          : `tpl-${generateUuid().slice(0, 8)}`,
      name: cleanName,
      createdAt: existingIdx >= 0 ? existingList[existingIdx].createdAt : nowIso,
      updatedAt: nowIso,
      mappings: clone(input.mappings),
    };

    if (existingIdx >= 0) {
      existingList[existingIdx] = record;
    } else {
      existingList.unshift(record);
    }

    this.state.mappingTemplates = existingList;
    await this.persist();
    return clone(record);
  }

  public async deleteMappingTemplate(id: string): Promise<void> {
    await this.ensureReady();
    this.state.mappingTemplates = (this.state.mappingTemplates ?? []).filter(
      (t) => t.id !== id
    );
    await this.persist();
  }

  // ---------- Operations Reporting Scope & Alias Configuration ----------

  public async getOperationsConfig(): Promise<OperationsReportingConfig> {
    await this.ensureReady();
    return clone(this.state.operationsConfig ?? DEFAULT_OPERATIONS_CONFIG);
  }

  public async saveOperationsConfig(
    config: OperationsReportingConfig
  ): Promise<OperationsReportingConfig> {
    await this.ensureReady();
    this.state.operationsConfig = clone(config);
    await this.persist();
    return clone(config);
  }

  // ---------- Redundancy Case Management, Action Plan, Events & Board Escalations ----------

  private getDeadlineConfigSync(): RedundancyDeadlineConfig {
    return (
      this.state.redundancyDeadlineConfig ?? DEFAULT_REDUNDANCY_DEADLINE_CONFIG
    );
  }

  public async getRedundancyDeadlineConfig(): Promise<RedundancyDeadlineConfig> {
    await this.ensureReady();
    return clone(this.getDeadlineConfigSync());
  }

  public async saveRedundancyDeadlineConfig(
    config: RedundancyDeadlineConfig,
    actor: UserAccount
  ): Promise<RedundancyDeadlineConfig> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to update redundancy deadline configuration.'
      );
    }
    if (
      config.triageBusinessDays < 1 ||
      config.ownerAlignmentBusinessDays < 1 ||
      config.decisionBusinessDays < 1 ||
      config.overdueActionFollowUpBusinessDays < 1 ||
      config.boardMeetingDayOfMonth < 1 ||
      config.boardMeetingDayOfMonth > 28
    ) {
      throw validationError(
        'Business day deadlines must be >= 1 and monthly Board meeting day must be between 1 and 28.'
      );
    }
    const cleanHolidays = Array.from(
      new Set(
        config.holidays
          .map((h) => h.trim())
          .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h))
      )
    ).sort();

    const nextConfig: RedundancyDeadlineConfig = {
      triageBusinessDays: Math.round(config.triageBusinessDays),
      ownerAlignmentBusinessDays: Math.round(config.ownerAlignmentBusinessDays),
      decisionBusinessDays: Math.round(config.decisionBusinessDays),
      overdueActionFollowUpBusinessDays: Math.round(
        config.overdueActionFollowUpBusinessDays
      ),
      boardMeetingDayOfMonth: Math.round(config.boardMeetingDayOfMonth),
      holidays: cleanHolidays,
      policyDisclaimer:
        config.policyDisclaimer.trim() ||
        DEFAULT_REDUNDANCY_DEADLINE_CONFIG.policyDisclaimer,
    };

    this.state.redundancyDeadlineConfig = nextConfig;
    await this.persist();
    return clone(nextConfig);
  }

  private resolveUserName(ownerId: string, bucket: DatasetBucket): string {
    const allUsers = [...SEED_USERS, ...bucket.customUsers];
    return allUsers.find((u) => u.id === ownerId)?.displayName ?? ownerId;
  }

  private buildNextCaseNumber(bucket: DatasetBucket, now: Date): string {
    const year = now.getUTCFullYear();
    const maxSeq = bucket.redundancyCases.reduce((max, c) => {
      const m = /^RC-\d{4}-(\d+)$/.exec(c.caseNumber);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    return `RC-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
  }

  private pushRedundancyEvent(
    bucket: DatasetBucket,
    event: Omit<RedundancyEvent, 'id' | 'timestamp'>,
    timestamp: string
  ): void {
    bucket.redundancyEvents.unshift({
      id: `re-${generateUuid().slice(0, 8)}`,
      timestamp,
      ...event,
    });
  }

  public async listRedundancyCases(): Promise<RedundancyCase[]> {
    await this.ensureReady();
    return clone(this.activeBucket().redundancyCases).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  public async getRedundancyCaseDetail(
    caseId: string
  ): Promise<RedundancyCaseDetailRecord> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const found = bucket.redundancyCases.find((c) => c.id === caseId);
    if (!found) {
      throw notFoundError('RedundancyCase', caseId);
    }
    const actions = bucket.redundancyActions
      .filter((a) => a.caseId === caseId)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const events = bucket.redundancyEvents
      .filter((e) => e.caseId === caseId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const boardDecisions = bucket.boardDecisions
      .filter((b) => b.caseId === caseId)
      .sort((a, b) => b.escalatedAt.localeCompare(a.escalatedAt));

    return {
      redundancyCase: clone(found),
      actions: clone(actions),
      events: clone(events),
      boardDecisions: clone(boardDecisions),
    };
  }

  public async createRedundancyCase(
    input: CreateRedundancyCaseInput,
    actor: UserAccount
  ): Promise<{ redundancyCase: RedundancyCase; created: boolean }> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to create redundancy review cases.'
      );
    }
    if (input.initiativeAId === input.initiativeBId) {
      throw validationError('Cannot create a redundancy case for the same initiative.');
    }

    const bucket = this.activeBucket();
    const canonicalIds =
      input.initiativeAId < input.initiativeBId
        ? [input.initiativeAId, input.initiativeBId]
        : [input.initiativeBId, input.initiativeAId];
    const pairKey = buildCanonicalPairKey(canonicalIds[0], canonicalIds[1]);

    // Strict duplicate prevention across the same canonical initiative pair
    const existing = bucket.redundancyCases.find((c) => c.pairKey === pairKey);
    if (existing) {
      return { redundancyCase: clone(existing), created: false };
    }

    const initA = bucket.initiatives.find((i) => i.id === canonicalIds[0]);
    const initB = bucket.initiatives.find((i) => i.id === canonicalIds[1]);
    if (!initA) throw notFoundError('Initiative', canonicalIds[0]);
    if (!initB) throw notFoundError('Initiative', canonicalIds[1]);

    const sim = computeHeuristicPairSimilarity(initA, initB);
    const now = this.nowProvider();
    const nowIso = now.toISOString();
    const deadlines = computeCaseDeadlines(nowIso, this.getDeadlineConfigSync());
    const caseId = `rc-${generateUuid().slice(0, 8)}`;
    const caseNumber = this.buildNextCaseNumber(bucket, now);

    const createdCase: RedundancyCase = {
      id: caseId,
      caseNumber,
      pairKey,
      initiativeAId: initA.id,
      initiativeBId: initB.id,
      initiativeASnapshot: {
        id: initA.id,
        title: initA.title,
        departmentId: initA.departmentId,
        ownerId: initA.ownerId,
        ownerName: this.resolveUserName(initA.ownerId, bucket),
        businessCapability: initA.businessCapability,
        aiPlatform: initA.aiPlatform,
        lifecycleStatusAtDetection: initA.lifecycleStatus,
      },
      initiativeBSnapshot: {
        id: initB.id,
        title: initB.title,
        departmentId: initB.departmentId,
        ownerId: initB.ownerId,
        ownerName: this.resolveUserName(initB.ownerId, bucket),
        businessCapability: initB.businessCapability,
        aiPlatform: initB.aiPlatform,
        lifecycleStatusAtDetection: initB.lifecycleStatus,
      },
      heuristicScore: input.heuristicScore ?? sim.score,
      matchedKeywords: input.matchedKeywords ?? sim.matchedKeywords,
      capabilityOverlapSummary: sim.sameCapability
        ? `Shared Capability: ${initA.businessCapability}`
        : `${initA.businessCapability} ↔ ${initB.businessCapability}`,
      similarityExplanation:
        input.similarityExplanation?.trim() ||
        `Detected ${input.heuristicScore ?? sim.score}% heuristic overlap (${sim.matchedKeywords.slice(0, 5).join(', ')}).`,
      status: 'NEW',
      detectedAt: nowIso,
      triagedAt: null,
      triageDueAt: deadlines.triageDueAt,
      ownerAlignmentDueAt: deadlines.ownerAlignmentDueAt,
      decisionDueAt: deadlines.decisionDueAt,
      ownerAStance: 'PENDING',
      ownerBStance: 'PENDING',
      ownerDiscussionNotes: [],
      portfolioManagerRecommendation:
        input.portfolioManagerRecommendation?.trim() || '',
      decisionType: null,
      decisionRationale: '',
      estimatedAvoidedEffortHours: 0,
      estimatedAvoidedEffortEur: 0,
      estimatedFinancialSynergyEur: 0,
      confirmedFinancialSynergyEur: 0,
      confirmedSynergyEvidence: '',
      synergyEvidenceStatus: 'NONE',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    bucket.redundancyCases.unshift(createdCase);
    this.pushRedundancyEvent(
      bucket,
      {
        caseId,
        eventType: 'CASE_CREATED',
        fromStatus: null,
        toStatus: 'NEW',
        actorId: actor.id,
        actorName: actor.displayName,
        actorRoleLabel: 'AI Portfolio Manager',
        summary: `Case ${caseNumber} created from ${createdCase.heuristicScore}% overlap match.`,
      },
      nowIso
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return { redundancyCase: clone(createdCase), created: true };
  }

  public async syncActiveMatchesToRedundancyCases(actor: UserAccount): Promise<{
    createdCount: number;
    skippedExistingCount: number;
    cases: RedundancyCase[];
  }> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to create cases from active matches.'
      );
    }
    const bucket = this.activeBucket();
    const analysis = computeRedundancyAnalysis(bucket.initiatives);

    let createdCount = 0;
    let skippedExistingCount = 0;

    for (const pair of analysis.candidatePairs) {
      const exists = bucket.redundancyCases.some((c) => c.pairKey === pair.pairKey);
      if (exists) {
        skippedExistingCount += 1;
        continue;
      }
      await this.createRedundancyCase(
        {
          initiativeAId: pair.initiativeA.id,
          initiativeBId: pair.initiativeB.id,
          heuristicScore: pair.heuristicScore,
          matchedKeywords: pair.matchedKeywords,
          similarityExplanation: pair.rationale,
        },
        actor
      );
      createdCount += 1;
    }

    return {
      createdCount,
      skippedExistingCount,
      cases: await this.listRedundancyCases(),
    };
  }

  public async updateRedundancyCase(
    input: UpdateRedundancyCaseInput,
    actor: UserAccount
  ): Promise<RedundancyCase> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to update redundancy case status, decisions, or synergy values.'
      );
    }

    const bucket = this.activeBucket();
    const idx = bucket.redundancyCases.findIndex((c) => c.id === input.caseId);
    if (idx === -1) throw notFoundError('RedundancyCase', input.caseId);

    const prev = bucket.redundancyCases[idx];
    const nowIso = this.nowProvider().toISOString();

    if (input.status === 'CLOSED') {
      throw validationError(
        'Use Close Case with a documented outcome summary to close a redundancy case.'
      );
    }

    const nextStatus = input.status
      ? normalizeRedundancyCaseStatus(input.status)
      : normalizeRedundancyCaseStatus(prev.status);
    const nextDecision =
      'decisionType' in input ? input.decisionType ?? null : prev.decisionType;
    const nextRecommendedOption =
      'recommendedOption' in input
        ? input.recommendedOption ?? null
        : prev.recommendedOption;

    const updated: RedundancyCase = {
      ...prev,
      status: nextStatus,
      triagedAt:
        !prev.triagedAt && nextStatus !== 'NEW' ? nowIso : prev.triagedAt,
      implementationStartedAt: prev.implementationStartedAt,
      portfolioManagerRecommendation:
        input.portfolioManagerRecommendation !== undefined
          ? input.portfolioManagerRecommendation.trim()
          : prev.portfolioManagerRecommendation,
      decisionType: nextDecision,
      decisionRationale:
        input.decisionRationale !== undefined
          ? input.decisionRationale.trim()
          : prev.decisionRationale,
      recommendedOption: nextRecommendedOption,
      ownerAStance: input.ownerAStance ?? prev.ownerAStance,
      ownerBStance: input.ownerBStance ?? prev.ownerBStance,
      estimatedAvoidedEffortHours:
        input.estimatedAvoidedEffortHours !== undefined
          ? Math.max(0, Number(input.estimatedAvoidedEffortHours))
          : prev.estimatedAvoidedEffortHours,
      estimatedAvoidedEffortEur:
        input.estimatedAvoidedEffortEur !== undefined
          ? Math.max(0, Number(input.estimatedAvoidedEffortEur))
          : prev.estimatedAvoidedEffortEur,
      estimatedFinancialSynergyEur:
        input.estimatedFinancialSynergyEur !== undefined
          ? Math.max(0, Number(input.estimatedFinancialSynergyEur))
          : prev.estimatedFinancialSynergyEur,
      confirmedFinancialSynergyEur:
        input.confirmedFinancialSynergyEur !== undefined
          ? Math.max(0, Number(input.confirmedFinancialSynergyEur))
          : prev.confirmedFinancialSynergyEur,
      confirmedSynergyEvidence:
        input.confirmedSynergyEvidence !== undefined
          ? input.confirmedSynergyEvidence.trim()
          : prev.confirmedSynergyEvidence,
      synergyEvidenceStatus:
        input.synergyEvidenceStatus ?? prev.synergyEvidenceStatus,
      updatedAt: nowIso,
    };

    bucket.redundancyCases[idx] = updated;

    if (prev.status !== nextStatus) {
      this.pushRedundancyEvent(
        bucket,
        {
          caseId: updated.id,
          eventType: nextStatus === 'IN_REVIEW' ? 'TRIAGED' : 'STATUS_CHANGED',
          fromStatus: prev.status,
          toStatus: nextStatus,
          actorId: actor.id,
          actorName: actor.displayName,
          actorRoleLabel: 'AI Portfolio Manager',
          summary: `Status updated from ${formatRedundancyStatusLabel(prev.status)} to ${formatRedundancyStatusLabel(nextStatus)}.`,
        },
        nowIso
      );
    }

    if (input.decisionType !== undefined && input.decisionType !== prev.decisionType) {
      this.pushRedundancyEvent(
        bucket,
        {
          caseId: updated.id,
          eventType: 'DECISION_RECORDED',
          fromStatus: prev.status,
          toStatus: updated.status,
          actorId: actor.id,
          actorName: actor.displayName,
          actorRoleLabel: 'AI Portfolio Manager',
          summary: updated.decisionType
            ? `Portfolio decision set to ${updated.decisionType}.`
            : 'Portfolio decision cleared.',
          details: updated.decisionRationale || undefined,
        },
        nowIso
      );
    }

    if (
      input.confirmedFinancialSynergyEur !== undefined ||
      input.estimatedFinancialSynergyEur !== undefined ||
      input.estimatedAvoidedEffortHours !== undefined
    ) {
      this.pushRedundancyEvent(
        bucket,
        {
          caseId: updated.id,
          eventType: 'SYNERGY_UPDATED',
          fromStatus: updated.status,
          toStatus: updated.status,
          actorId: actor.id,
          actorName: actor.displayName,
          actorRoleLabel: 'AI Portfolio Manager',
          summary: `Synergy & avoided effort updated (Confirmed financial: €${updated.confirmedFinancialSynergyEur.toLocaleString('en-US')}; Avoided effort: ${updated.estimatedAvoidedEffortHours}h).`,
        },
        nowIso
      );
    }

    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(updated);
  }

  public async addRedundancyDiscussionNote(
    input: AddRedundancyDiscussionNoteInput,
    actor: UserAccount
  ): Promise<RedundancyCase> {
    await this.ensureReady();
    if (!input.note.trim()) {
      throw validationError('Discussion note cannot be empty.');
    }
    const bucket = this.activeBucket();
    const idx = bucket.redundancyCases.findIndex((c) => c.id === input.caseId);
    if (idx === -1) throw notFoundError('RedundancyCase', input.caseId);

    const prev = bucket.redundancyCases[idx];
    const isOwnerA = prev.initiativeASnapshot.ownerId === actor.id;
    const isOwnerB = prev.initiativeBSnapshot.ownerId === actor.id;
    const isGov = actor.role === UserRole.GOVERNANCE;
    if (!isGov && !isOwnerA && !isOwnerB) {
      throw forbiddenError(
        'Only involved Initiative Owners or the AI Portfolio Manager can post alignment notes on this case.'
      );
    }

    const nowIso = this.nowProvider().toISOString();
    let ownerAStance = prev.ownerAStance;
    let ownerBStance = prev.ownerBStance;
    let roleLabel = 'AI Portfolio Manager';

    if (input.applyToSide === 'A' && isGov) {
      if (input.stance) ownerAStance = input.stance;
      roleLabel = `Simulated Owner A (${prev.initiativeASnapshot.ownerName})`;
    } else if (input.applyToSide === 'B' && isGov) {
      if (input.stance) ownerBStance = input.stance;
      roleLabel = `Simulated Owner B (${prev.initiativeBSnapshot.ownerName})`;
    } else if (isOwnerA) {
      if (input.stance) ownerAStance = input.stance;
      roleLabel = 'Initiative A Owner';
    } else if (isOwnerB) {
      if (input.stance) ownerBStance = input.stance;
      roleLabel = 'Initiative B Owner';
    } else if (input.stance) {
      ownerAStance = input.stance;
    }

    const nextStatus =
      prev.status === 'NEW' ? 'IN_REVIEW' : prev.status;

    const noteObj = {
      id: `note-${generateUuid().slice(0, 8)}`,
      authorId: actor.id,
      authorName: actor.displayName,
      authorRoleLabel: roleLabel,
      stance: input.stance,
      note: input.note.trim(),
      createdAt: nowIso,
    };

    const updated: RedundancyCase = {
      ...prev,
      status: nextStatus,
      triagedAt: prev.triagedAt ?? nowIso,
      ownerAStance,
      ownerBStance,
      ownerDiscussionNotes: [...prev.ownerDiscussionNotes, noteObj],
      updatedAt: nowIso,
    };

    bucket.redundancyCases[idx] = updated;
    this.pushRedundancyEvent(
      bucket,
      {
        caseId: updated.id,
        eventType: 'OWNER_NOTE_ADDED',
        fromStatus: prev.status,
        toStatus: nextStatus,
        actorId: actor.id,
        actorName: actor.displayName,
        actorRoleLabel: roleLabel,
        summary: input.stance
          ? `Alignment stance recorded (${input.stance}) by ${actor.displayName}.`
          : `Discussion note added by ${actor.displayName}.`,
        details: noteObj.note,
      },
      nowIso
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(updated);
  }

  public async listRedundancyActions(caseId?: string): Promise<RedundancyAction[]> {
    await this.ensureReady();
    const list = this.activeBucket().redundancyActions;
    const filtered = caseId ? list.filter((a) => a.caseId === caseId) : list;
    return clone(filtered).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  public async saveRedundancyAction(
    input: SaveRedundancyActionInput,
    actor: UserAccount
  ): Promise<RedundancyAction> {
    await this.ensureReady();
    const bucket = this.activeBucket();
    const parentCaseIdx = bucket.redundancyCases.findIndex(
      (c) => c.id === input.caseId
    );
    if (parentCaseIdx === -1) {
      throw notFoundError('RedundancyCase', input.caseId);
    }
    const parentCase = bucket.redundancyCases[parentCaseIdx];
    const isInvolvedOwner =
      actor.id === parentCase.initiativeASnapshot.ownerId ||
      actor.id === parentCase.initiativeBSnapshot.ownerId ||
      actor.id === input.ownerId;

    if (actor.role !== UserRole.GOVERNANCE && !isInvolvedOwner) {
      throw forbiddenError(
        'AI Portfolio Manager or assigned Initiative Owner role is required to manage redundancy actions.'
      );
    }
    if (!input.title.trim() || !input.dueDate.trim()) {
      throw validationError('Action title and due date are required.');
    }

    const nowIso = this.nowProvider().toISOString();
    const config = this.getDeadlineConfigSync();
    const dueKey = toUtcDateKey(input.dueDate);
    const followUpReviewDueAt = addBusinessDays(
      dueKey,
      config.overdueActionFollowUpBusinessDays,
      config.holidays
    );
    const ownerName = this.resolveUserName(input.ownerId, bucket);

    if (input.id) {
      const idx = bucket.redundancyActions.findIndex((a) => a.id === input.id);
      if (idx === -1) throw notFoundError('RedundancyAction', input.id);
      const prev = bucket.redundancyActions[idx];
      const nextStatus = input.status ?? prev.status;
      const completedNow = nextStatus === 'COMPLETED' && prev.status !== 'COMPLETED';

      const updated: RedundancyAction = {
        ...prev,
        title: input.title.trim(),
        description: input.description.trim(),
        ownerId: input.ownerId,
        ownerName,
        dueDate: dueKey,
        followUpReviewDueAt,
        status: nextStatus,
        completedAt:
          nextStatus === 'COMPLETED'
            ? prev.completedAt ?? nowIso
            : null,
        completionNotes:
          input.completionNotes !== undefined
            ? input.completionNotes.trim()
            : prev.completionNotes,
        updatedAt: nowIso,
      };
      bucket.redundancyActions[idx] = updated;
      this.pushRedundancyEvent(
        bucket,
        {
          caseId: updated.caseId,
          eventType: completedNow ? 'ACTION_COMPLETED' : 'ACTION_UPDATED',
          fromStatus: parentCase.status,
          toStatus: parentCase.status,
          actorId: actor.id,
          actorName: actor.displayName,
          actorRoleLabel:
            actor.role === UserRole.GOVERNANCE
              ? 'AI Portfolio Manager'
              : 'Initiative Owner',
          summary: completedNow
            ? `Completed action: ${updated.title}.`
            : `Updated action: ${updated.title}.`,
          details: updated.completionNotes,
        },
        nowIso
      );
      bucket.lastUpdatedAt = nowIso;
      await this.persist();
      return clone(updated);
    }

    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to assign new redundancy actions.'
      );
    }

    const created: RedundancyAction = {
      id: `act-${generateUuid().slice(0, 8)}`,
      caseId: input.caseId,
      title: input.title.trim(),
      description: input.description.trim(),
      ownerId: input.ownerId,
      ownerName,
      dueDate: dueKey,
      followUpReviewDueAt,
      status: input.status ?? 'OPEN',
      completedAt: input.status === 'COMPLETED' ? nowIso : null,
      completionNotes: input.completionNotes?.trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    bucket.redundancyActions.push(created);

    // Record rollout action start timestamp once tasks are scheduled on an Action Agreed case
    if (parentCase.status === 'ACTION_AGREED') {
      bucket.redundancyCases[parentCaseIdx] = {
        ...parentCase,
        status: 'ACTION_AGREED',
        implementationStartedAt: parentCase.implementationStartedAt ?? nowIso,
        updatedAt: nowIso,
      };
    }

    this.pushRedundancyEvent(
      bucket,
      {
        caseId: created.caseId,
        eventType: 'ACTION_CREATED',
        fromStatus: parentCase.status,
        toStatus: bucket.redundancyCases[parentCaseIdx].status,
        actorId: actor.id,
        actorName: actor.displayName,
        actorRoleLabel: 'AI Portfolio Manager',
        summary: `Assigned action "${created.title}" to ${ownerName} (due ${created.dueDate}).`,
      },
      nowIso
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(created);
  }

  public async deleteRedundancyAction(
    actionId: string,
    actor: UserAccount
  ): Promise<void> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to remove redundancy actions.'
      );
    }
    const bucket = this.activeBucket();
    bucket.redundancyActions = bucket.redundancyActions.filter(
      (a) => a.id !== actionId
    );
    bucket.lastUpdatedAt = this.nowProvider().toISOString();
    await this.persist();
  }

  public async logRedundancyActionReminder(
    actionId: string,
    actor: UserAccount
  ): Promise<RedundancyAction> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to log follow-up reminders.'
      );
    }
    const bucket = this.activeBucket();
    const idx = bucket.redundancyActions.findIndex((a) => a.id === actionId);
    if (idx === -1) throw notFoundError('RedundancyAction', actionId);
    const prev = bucket.redundancyActions[idx];
    const nowIso = this.nowProvider().toISOString();
    const updated: RedundancyAction = {
      ...prev,
      lastReminderSentAt: nowIso,
      updatedAt: nowIso,
    };
    bucket.redundancyActions[idx] = updated;
    const parentCase = bucket.redundancyCases.find((c) => c.id === prev.caseId);
    this.pushRedundancyEvent(
      bucket,
      {
        caseId: prev.caseId,
        eventType: 'ACTION_REMINDER_LOGGED',
        fromStatus: parentCase?.status ?? null,
        toStatus: parentCase?.status ?? null,
        actorId: actor.id,
        actorName: actor.displayName,
        actorRoleLabel: 'AI Portfolio Manager',
        summary: `Follow-up reminder logged for "${prev.title}" (assigned to ${prev.ownerName}, follow-up review due ${prev.followUpReviewDueAt}).`,
      },
      nowIso
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(updated);
  }

  public async listRedundancyEvents(caseId?: string): Promise<RedundancyEvent[]> {
    await this.ensureReady();
    const list = this.activeBucket().redundancyEvents;
    const filtered = caseId ? list.filter((e) => e.caseId === caseId) : list;
    return clone(filtered).sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
  }

  public async listBoardDecisions(caseId?: string): Promise<BoardDecision[]> {
    await this.ensureReady();
    const list = this.activeBucket().boardDecisions;
    const filtered = caseId ? list.filter((b) => b.caseId === caseId) : list;
    return clone(filtered).sort((a, b) =>
      b.escalatedAt.localeCompare(a.escalatedAt)
    );
  }

  public async escalateRedundancyCaseToBoard(
    input: EscalateRedundancyCaseInput,
    actor: UserAccount
  ): Promise<{ redundancyCase: RedundancyCase; boardDecision: BoardDecision }> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to escalate redundancy cases to the AI Governance Board.'
      );
    }
    if (input.escalationReason.trim().length < 5) {
      throw validationError(
        'Provide a clear escalation reason before submitting to the AI Governance Board.'
      );
    }
    const bucket = this.activeBucket();
    const idx = bucket.redundancyCases.findIndex((c) => c.id === input.caseId);
    if (idx === -1) throw notFoundError('RedundancyCase', input.caseId);
    const prev = bucket.redundancyCases[idx];
    if (prev.status === 'CLOSED') {
      throw validationError('Cannot escalate a closed redundancy case.');
    }

    const nowIso = this.nowProvider().toISOString();
    const config = this.getDeadlineConfigSync();
    const scheduledMeetingDate =
      input.scheduledMeetingDate?.trim() ||
      computeNextBoardMeetingDate(
        nowIso,
        config.boardMeetingDayOfMonth,
        config.holidays
      );

    const decisionRequested =
      input.decisionRequested?.trim() ||
      prev.decisionRequested ||
      'AI Governance Board alignment mandate requested (Scale, Pause, Retire, Merge, Reuse, Collaborate, or Continue Separately).';
    const recommendedOption =
      'recommendedOption' in input
        ? input.recommendedOption ?? null
        : prev.recommendedOption ?? prev.decisionType ?? null;

    const updatedCase: RedundancyCase = {
      ...prev,
      status: 'ESCALATED',
      triagedAt: prev.triagedAt ?? nowIso,
      escalationReason: input.escalationReason.trim(),
      decisionRequested,
      recommendedOption,
      escalatedAt: nowIso,
      escalatedBy: actor.displayName,
      updatedAt: nowIso,
    };
    bucket.redundancyCases[idx] = updatedCase;

    // Avoid duplicate pending BoardDecision for same case
    const existingPendingIdx = bucket.boardDecisions.findIndex(
      (b) => b.caseId === prev.id && b.status === 'PENDING'
    );
    let boardDecision: BoardDecision;
    if (existingPendingIdx >= 0) {
      boardDecision = {
        ...bucket.boardDecisions[existingPendingIdx],
        escalationReason: input.escalationReason.trim(),
        decisionRequested,
        recommendedOption,
        scheduledMeetingDate,
        investmentImplications:
          input.investmentImplications?.trim() ||
          bucket.boardDecisions[existingPendingIdx].investmentImplications,
      };
      bucket.boardDecisions[existingPendingIdx] = boardDecision;
    } else {
      boardDecision = {
        id: `bd-${generateUuid().slice(0, 8)}`,
        caseId: prev.id,
        status: 'PENDING',
        escalationReason: input.escalationReason.trim(),
        decisionRequested,
        recommendedOption,
        escalatedAt: nowIso,
        escalatedBy: actor.displayName,
        scheduledMeetingDate,
        decidedAt: null,
        decisionOutcome: null,
        boardRationale: '',
        investmentImplications:
          input.investmentImplications?.trim() ||
          `Estimated financial synergy €${prev.estimatedFinancialSynergyEur.toLocaleString('en-US')} and ${prev.estimatedAvoidedEffortHours}h avoided engineering effort.`,
        followUpRequired: true,
      };
      bucket.boardDecisions.unshift(boardDecision);
    }

    this.pushRedundancyEvent(
      bucket,
      {
        caseId: prev.id,
        eventType: 'ESCALATED_TO_BOARD',
        fromStatus: prev.status,
        toStatus: 'ESCALATED',
        actorId: actor.id,
        actorName: actor.displayName,
        actorRoleLabel: 'AI Portfolio Manager',
        summary: `Escalated to AI Governance Board (next meeting ${scheduledMeetingDate}).`,
        details: input.escalationReason.trim(),
      },
      nowIso
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return {
      redundancyCase: clone(updatedCase),
      boardDecision: clone(boardDecision),
    };
  }

  public async recordBoardDecision(
    input: RecordBoardDecisionInput,
    actor: UserAccount
  ): Promise<{ redundancyCase: RedundancyCase; boardDecision: BoardDecision }> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to record AI Governance Board decisions.'
      );
    }
    if (input.boardRationale.trim().length < 5) {
      throw validationError('Board rationale is required.');
    }

    const bucket = this.activeBucket();
    const caseIdx = bucket.redundancyCases.findIndex((c) => c.id === input.caseId);
    if (caseIdx === -1) throw notFoundError('RedundancyCase', input.caseId);
    const prevCase = bucket.redundancyCases[caseIdx];
    const nowIso = this.nowProvider().toISOString();

    const bdIdx = bucket.boardDecisions.findIndex(
      (b) => b.caseId === input.caseId && b.status === 'PENDING'
    );
    const config = this.getDeadlineConfigSync();

    let savedBoard: BoardDecision;
    if (bdIdx >= 0) {
      savedBoard = {
        ...bucket.boardDecisions[bdIdx],
        status: 'DECIDED',
        decidedAt: nowIso,
        decidedBy: actor.displayName,
        decisionOutcome: input.decisionOutcome,
        boardRationale: input.boardRationale.trim(),
        investmentImplications: input.investmentImplications.trim(),
        followUpRequired: input.followUpRequired,
        followUpNotes: input.followUpNotes?.trim(),
      };
      bucket.boardDecisions[bdIdx] = savedBoard;
    } else {
      savedBoard = {
        id: `bd-${generateUuid().slice(0, 8)}`,
        caseId: input.caseId,
        status: 'DECIDED',
        escalationReason:
          prevCase.escalationReason || 'Direct AI Governance Board review',
        escalatedAt: prevCase.escalatedAt || nowIso,
        escalatedBy: prevCase.escalatedBy || actor.displayName,
        scheduledMeetingDate: computeNextBoardMeetingDate(
          nowIso,
          config.boardMeetingDayOfMonth,
          config.holidays
        ),
        decidedAt: nowIso,
        decidedBy: actor.displayName,
        decisionOutcome: input.decisionOutcome,
        boardRationale: input.boardRationale.trim(),
        investmentImplications: input.investmentImplications.trim(),
        followUpRequired: input.followUpRequired,
        followUpNotes: input.followUpNotes?.trim(),
      };
      bucket.boardDecisions.unshift(savedBoard);
    }

    // Map Board outcome onto case decisionType cleanly while NEVER mutating initiative lifecycleStatus automatically
    let mappedDecisionType = prevCase.decisionType;
    if (
      input.decisionOutcome === 'MERGE' ||
      input.decisionOutcome === 'REUSE' ||
      input.decisionOutcome === 'COLLABORATE' ||
      input.decisionOutcome === 'CONTINUE_SEPARATELY'
    ) {
      mappedDecisionType = input.decisionOutcome;
    } else if (input.decisionOutcome === 'PAUSE' || input.decisionOutcome === 'RETIRE') {
      mappedDecisionType = mappedDecisionType ?? 'MERGE';
    } else if (input.decisionOutcome === 'SCALE') {
      mappedDecisionType = mappedDecisionType ?? 'COLLABORATE';
    }

    const nextStatus = 'ACTION_AGREED';
    const updatedCase: RedundancyCase = {
      ...prevCase,
      status: nextStatus,
      decisionType: mappedDecisionType,
      decisionRationale: `Board Mandate (${input.decisionOutcome}): ${input.boardRationale.trim()}`,
      implementationStartedAt: input.followUpRequired
        ? prevCase.implementationStartedAt ?? nowIso
        : prevCase.implementationStartedAt,
      updatedAt: nowIso,
    };
    bucket.redundancyCases[caseIdx] = updatedCase;

    this.pushRedundancyEvent(
      bucket,
      {
        caseId: prevCase.id,
        eventType: 'BOARD_DECISION_RECORDED',
        fromStatus: prevCase.status,
        toStatus: nextStatus,
        actorId: actor.id,
        actorName: actor.displayName,
        actorRoleLabel: 'AI Governance Board (Recorded by Portfolio Manager)',
        summary: `AI Governance Board decided: ${input.decisionOutcome}.`,
        details: input.boardRationale.trim(),
      },
      nowIso
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return {
      redundancyCase: clone(updatedCase),
      boardDecision: clone(savedBoard),
    };
  }

  public async closeRedundancyCase(
    input: CloseRedundancyCaseInput,
    actor: UserAccount
  ): Promise<RedundancyCase> {
    await this.ensureReady();
    if (actor.role !== UserRole.GOVERNANCE) {
      throw forbiddenError(
        'AI Portfolio Manager role is required to close redundancy cases.'
      );
    }
    const bucket = this.activeBucket();
    const idx = bucket.redundancyCases.findIndex((c) => c.id === input.caseId);
    if (idx === -1) throw notFoundError('RedundancyCase', input.caseId);
    const prev = bucket.redundancyCases[idx];
    const actions = bucket.redundancyActions.filter((a) => a.caseId === prev.id);

    const check = validateCloseRedundancyCase({
      redundancyCase: prev,
      actions,
      closingOutcomeSummary: input.closingOutcomeSummary,
    });
    if (!check.valid) {
      throw validationError(
        check.error ?? 'Closing a case requires a documented outcome.'
      );
    }

    const nowIso = this.nowProvider().toISOString();
    const closed: RedundancyCase = {
      ...prev,
      status: 'CLOSED',
      closedAt: nowIso,
      closedBy: actor.displayName,
      closingOutcomeSummary: input.closingOutcomeSummary.trim(),
      updatedAt: nowIso,
    };
    bucket.redundancyCases[idx] = closed;

    this.pushRedundancyEvent(
      bucket,
      {
        caseId: closed.id,
        eventType: 'CASE_CLOSED',
        fromStatus: prev.status,
        toStatus: 'CLOSED',
        actorId: actor.id,
        actorName: actor.displayName,
        actorRoleLabel: 'AI Portfolio Manager',
        summary: `Case ${closed.caseNumber} closed with outcome: ${closed.decisionType}.`,
        details: closed.closingOutcomeSummary,
      },
      nowIso
    );
    bucket.lastUpdatedAt = nowIso;
    await this.persist();
    return clone(closed);
  }
}


