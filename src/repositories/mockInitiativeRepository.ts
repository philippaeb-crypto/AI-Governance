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
import { validateLifecycleTransition } from '../domain/lifecycle';
import { DEFAULT_REDUNDANCY_DEADLINE_CONFIG } from '../domain/redundancyWorkflow';
import {
  AiCostPlanEntry,
  AiCostTransaction,
  BenefitEntry,
  BoardDecision,
  CreateInitiativeInput,
  Department,
  ImportBatchRecord,
  ImportMappingTemplate,
  Initiative,
  InitiativeDraft,
  LifecycleEvent,
  ListInitiativesFilter,
  MarkOwnerReviewedInput,
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
} from '../domain/types';
import { validateCreateInitiativeInput } from '../domain/validation';
import {
  InitiativeDetailRecord,
  InitiativeRepository,
  RedundancyCaseDetailRecord,
} from './interfaces';
import {
  SEED_DEPARTMENTS,
  SEED_INITIATIVES,
  SEED_LIFECYCLE_EVENTS,
  SEED_USERS,
} from './seedData';

export const DEMO_STORAGE_KEY = 'aas_ai_governance_demo_v1';
export const DEMO_DRAFT_KEY = 'aas_ai_governance_draft_v1';

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorageBackend implements StorageBackend {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function getDefaultStorageBackend(): StorageBackend {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return new MemoryStorageBackend();
}

interface PersistedDemoStore {
  initiatives: Initiative[];
  lifecycleEvents: LifecycleEvent[];
  lastUpdatedAt: string;
}

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

export class MockInitiativeRepository implements InitiativeRepository {
  private readonly storage: StorageBackend;
  private readonly nowProvider: () => Date;

  constructor(options?: {
    storage?: StorageBackend;
    nowProvider?: () => Date;
  }) {
    this.storage = options?.storage ?? getDefaultStorageBackend();
    this.nowProvider = options?.nowProvider ?? (() => new Date());
    this.ensureInitialized();
  }

  private createSeedSnapshot(): PersistedDemoStore {
    return {
      initiatives: clone(SEED_INITIATIVES),
      lifecycleEvents: clone(SEED_LIFECYCLE_EVENTS),
      lastUpdatedAt: '2026-11-10T11:45:00.000Z',
    };
  }

  private ensureInitialized(): PersistedDemoStore {
    const raw = this.storage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const seed = this.createSeedSnapshot();
      this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    try {
      const parsed = JSON.parse(raw) as PersistedDemoStore;
      if (
        Array.isArray(parsed.initiatives) &&
        Array.isArray(parsed.lifecycleEvents)
      ) {
        return parsed;
      }
    } catch {
      // Fallback to clean seed if local demo JSON was corrupted
    }
    const seed = this.createSeedSnapshot();
    this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  private writeStore(store: PersistedDemoStore): void {
    this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
  }

  async listInitiatives(filter?: ListInitiativesFilter): Promise<Initiative[]> {
    const store = this.ensureInitialized();
    const now = this.nowProvider();
    let results = clone(store.initiatives);

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

    results.sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    );
    return results;
  }

  async getInitiative(id: string): Promise<InitiativeDetailRecord> {
    const store = this.ensureInitialized();
    const found = store.initiatives.find((i) => i.id === id);
    if (!found) {
      throw notFoundError('Initiative', id);
    }
    const history = store.lifecycleEvents
      .filter((e) => e.initiativeId === id)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    return {
      initiative: clone(found),
      lifecycleHistory: clone(history),
    };
  }

  async createInitiative(
    input: CreateInitiativeInput,
    actor: UserAccount
  ): Promise<Initiative> {
    if (!canCreateInitiative(actor)) {
      throw forbiddenError(
        `Role ${actor.role} cannot create initiatives in Phase 1.`
      );
    }

    const fieldErrors = validateCreateInitiativeInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      throw validationError(
        'Please correct the highlighted fields before saving.',
        fieldErrors
      );
    }

    const store = this.ensureInitialized();
    const now = this.nowProvider();
    const nowIso = now.toISOString();
    const id = generateUuid();

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
      ideaDate: input.ideaDate,
      goLiveDate: input.goLiveDate?.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastOwnerReviewAt: nowIso,
      nextReviewDue: computeNextReviewDue(now),
      version: 1,
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

    store.initiatives.unshift(initiative);
    store.lifecycleEvents.push(initialEvent);
    store.lastUpdatedAt = nowIso;
    this.writeStore(store);

    return clone(initiative);
  }

  async updateInitiative(
    input: UpdateInitiativeInput,
    actor: UserAccount
  ): Promise<Initiative> {
    const store = this.ensureInitialized();
    const index = store.initiatives.findIndex((i) => i.id === input.id);
    if (index === -1) {
      throw notFoundError('Initiative', input.id);
    }

    const existing = store.initiatives[index];
    if (!canEditInitiative(actor, existing)) {
      throw forbiddenError(
        'Employees can only edit initiatives they own. AI Portfolio Manager role is required to edit other initiatives.'
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

    const nowIso = this.nowProvider().toISOString();
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
      goLiveDate: merged.goLiveDate?.trim() || undefined,
      updatedAt: nowIso,
      version: existing.version + 1,
    };

    store.initiatives[index] = updated;
    store.lastUpdatedAt = nowIso;
    this.writeStore(store);

    return clone(updated);
  }

  async recordLifecycleEvent(
    input: RecordLifecycleEventInput,
    actor: UserAccount
  ): Promise<{ initiative: Initiative; event: LifecycleEvent }> {
    const store = this.ensureInitialized();
    const index = store.initiatives.findIndex((i) => i.id === input.initiativeId);
    if (index === -1) {
      throw notFoundError('Initiative', input.initiativeId);
    }

    const existing = store.initiatives[index];
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

    const updated: Initiative = {
      ...existing,
      lifecycleStatus: input.toStatus,
      updatedAt: nowIso,
      version: existing.version + 1,
    };

    store.initiatives[index] = updated;
    store.lifecycleEvents.push(event);
    store.lastUpdatedAt = nowIso;
    this.writeStore(store);

    return {
      initiative: clone(updated),
      event: clone(event),
    };
  }

  async markOwnerReviewed(
    input: MarkOwnerReviewedInput,
    actor: UserAccount
  ): Promise<Initiative> {
    const store = this.ensureInitialized();
    const index = store.initiatives.findIndex((i) => i.id === input.initiativeId);
    if (index === -1) {
      throw notFoundError('Initiative', input.initiativeId);
    }

    const existing = store.initiatives[index];
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

    store.initiatives[index] = updated;
    store.lastUpdatedAt = nowIso;
    this.writeStore(store);

    return clone(updated);
  }

  async deleteInitiative(id: string, actor: UserAccount): Promise<void> {
    const store = this.ensureInitialized();
    const existing = store.initiatives.find((i) => i.id === id);
    if (!existing) {
      throw notFoundError('Initiative', id);
    }
    if (!canEditInitiative(actor, existing)) {
      throw forbiddenError(
        'Employees can only delete initiatives they own. AI Portfolio Manager role is required to delete other initiatives.'
      );
    }
    store.initiatives = store.initiatives.filter((i) => i.id !== id);
    store.lifecycleEvents = store.lifecycleEvents.filter(
      (e) => e.initiativeId !== id
    );
    store.lastUpdatedAt = this.nowProvider().toISOString();
    this.writeStore(store);
  }

  async listAllLifecycleEvents(): Promise<LifecycleEvent[]> {
    const store = this.ensureInitialized();
    return clone(store.lifecycleEvents);
  }

  async listDepartments(): Promise<Department[]> {
    return clone(SEED_DEPARTMENTS);
  }

  async listUsers(): Promise<UserAccount[]> {
    return clone(SEED_USERS);
  }

  async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    const store = this.ensureInitialized();
    return computePortfolioMetrics(
      store.initiatives,
      SEED_DEPARTMENTS,
      this.nowProvider()
    );
  }

  async getSyncStatus(): Promise<SyncStatusSummary> {
    const store = this.ensureInitialized();
    return {
      mode: 'LOCAL_DEMO_STORAGE',
      syncState: SyncState.LOCAL_DEMO_ONLY,
      storageKey: DEMO_STORAGE_KEY,
      lastUpdatedAt: store.lastUpdatedAt,
      pendingOutboxCount: 0,
      targetProductionStack: [
        'Azure SQL Database (System of Record)',
        'Microsoft Graph / SharePoint Lists (Bidirectional Sync Adapter)',
        'Microsoft Entra ID (SSO & Role Enforcement)',
      ],
      disclaimer:
        'Local single-browser demo storage active. Changes persist in this browser only and are not synced to Microsoft 365 or Azure SQL.',
    };
  }

  async resetDemoData(): Promise<void> {
    const seed = this.createSeedSnapshot();
    this.writeStore(seed);
    this.storage.removeItem(DEMO_DRAFT_KEY);
  }

  getDraft(): InitiativeDraft | null {
    const raw = this.storage.getItem(DEMO_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as InitiativeDraft;
    } catch {
      return null;
    }
  }

  saveDraft(draft: InitiativeDraft): void {
    this.storage.setItem(DEMO_DRAFT_KEY, JSON.stringify(draft));
  }

  clearDraft(): void {
    this.storage.removeItem(DEMO_DRAFT_KEY);
  }

  async listBenefits(): Promise<BenefitEntry[]> {
    return [];
  }
  async saveBenefit(): Promise<BenefitEntry> {
    throw forbiddenError('Use DemoRepository for benefit persistence.');
  }
  async deleteBenefit(): Promise<void> {
    throw forbiddenError('Use DemoRepository for benefit persistence.');
  }
  async listCostTransactions(): Promise<AiCostTransaction[]> {
    return [];
  }
  async saveCostTransaction(): Promise<AiCostTransaction> {
    throw forbiddenError('Use DemoRepository for cost persistence.');
  }
  async deleteCostTransaction(): Promise<void> {
    throw forbiddenError('Use DemoRepository for cost persistence.');
  }
  async listCostPlans(): Promise<AiCostPlanEntry[]> {
    return [];
  }
  async saveCostPlan(): Promise<AiCostPlanEntry> {
    throw forbiddenError('Use DemoRepository for cost plan persistence.');
  }
  async deleteCostPlan(): Promise<void> {
    throw forbiddenError('Use DemoRepository for cost plan persistence.');
  }
  async duplicateCostPlanToMonth(): Promise<{
    entry: AiCostPlanEntry;
    action: 'CREATED' | 'UPDATED';
  }> {
    throw forbiddenError('Use DemoRepository for cost plan persistence.');
  }
  async copyMonthlyPlanAcrossYear(): Promise<{
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
  }> {
    throw forbiddenError('Use DemoRepository for cost plan persistence.');
  }
  async listRedundancyReviews(): Promise<RedundancyReviewRecord[]> {
    return [];
  }
  async saveRedundancyReview(): Promise<RedundancyReviewRecord> {
    throw forbiddenError('Use DemoRepository for redundancy reviews.');
  }
  async listRedundancyCases(): Promise<RedundancyCase[]> {
    return [];
  }
  async getRedundancyCaseDetail(caseId: string): Promise<RedundancyCaseDetailRecord> {
    throw notFoundError('RedundancyCase', caseId);
  }
  async createRedundancyCase(): Promise<{ redundancyCase: RedundancyCase; created: boolean }> {
    throw forbiddenError('Use DemoRepository for redundancy cases.');
  }
  async syncActiveMatchesToRedundancyCases(): Promise<{
    createdCount: number;
    skippedExistingCount: number;
    cases: RedundancyCase[];
  }> {
    throw forbiddenError('Use DemoRepository for redundancy cases.');
  }
  async updateRedundancyCase(): Promise<RedundancyCase> {
    throw forbiddenError('Use DemoRepository for redundancy cases.');
  }
  async addRedundancyDiscussionNote(): Promise<RedundancyCase> {
    throw forbiddenError('Use DemoRepository for redundancy cases.');
  }
  async listRedundancyActions(): Promise<RedundancyAction[]> {
    return [];
  }
  async saveRedundancyAction(): Promise<RedundancyAction> {
    throw forbiddenError('Use DemoRepository for redundancy actions.');
  }
  async deleteRedundancyAction(): Promise<void> {
    throw forbiddenError('Use DemoRepository for redundancy actions.');
  }
  async logRedundancyActionReminder(): Promise<RedundancyAction> {
    throw forbiddenError('Use DemoRepository for redundancy actions.');
  }
  async listRedundancyEvents(): Promise<RedundancyEvent[]> {
    return [];
  }
  async listBoardDecisions(): Promise<BoardDecision[]> {
    return [];
  }
  async escalateRedundancyCaseToBoard(): Promise<{
    redundancyCase: RedundancyCase;
    boardDecision: BoardDecision;
  }> {
    throw forbiddenError('Use DemoRepository for Board escalations.');
  }
  async recordBoardDecision(): Promise<{
    redundancyCase: RedundancyCase;
    boardDecision: BoardDecision;
  }> {
    throw forbiddenError('Use DemoRepository for Board decisions.');
  }
  async closeRedundancyCase(): Promise<RedundancyCase> {
    throw forbiddenError('Use DemoRepository for closing redundancy cases.');
  }
  async getRedundancyDeadlineConfig(): Promise<RedundancyDeadlineConfig> {
    return { ...DEFAULT_REDUNDANCY_DEADLINE_CONFIG };
  }
  async saveRedundancyDeadlineConfig(): Promise<RedundancyDeadlineConfig> {
    throw forbiddenError('Use DemoRepository for redundancy deadline configuration.');
  }
  async listImportBatches(): Promise<ImportBatchRecord[]> {
    return [];
  }
  async commitInitiativeImportBatch(): Promise<ImportBatchRecord> {
    throw forbiddenError('Use DemoRepository for Excel imports.');
  }
  async commitCostImportBatch(): Promise<ImportBatchRecord> {
    throw forbiddenError('Use DemoRepository for Excel cost imports.');
  }
  async commitCostPlanImportBatch(): Promise<ImportBatchRecord> {
    throw forbiddenError('Use DemoRepository for Excel cost plan imports.');
  }
  async listMappingTemplates(): Promise<ImportMappingTemplate[]> {
    return [];
  }
  async saveMappingTemplate(): Promise<ImportMappingTemplate> {
    throw forbiddenError('Use DemoRepository for Excel mapping templates.');
  }
  async deleteMappingTemplate(): Promise<void> {
    throw forbiddenError('Use DemoRepository for Excel mapping templates.');
  }
  getActiveDataset() {
    return 'SAMPLE_DEMO' as const;
  }
  async switchDataset(): Promise<void> {
    // no-op for legacy MockInitiativeRepository
  }
}
