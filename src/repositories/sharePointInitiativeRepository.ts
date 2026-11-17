import { computePortfolioMetrics, isReviewOverdue } from '../domain/calculations';
import {
  forbiddenError,
  notFoundError,
  validationError,
} from '../domain/errors';
import {
  buildSharePointFieldsPayload,
  ColumnDiagnosticRow,
  ColumnMappingIssue,
  diagnoseSharePointColumns,
  DiscoveredSharePointColumn,
  mapSharePointItemToInitiative,
  mapSharePointItemToLifecycleEvent,
  mapSharePointItemToUsageSnapshot,
  redactSensitiveTokens,
  UsageTrackingSnapshot,
} from '../domain/sharepointMapping';
import {
  DEFAULT_REDUNDANCY_DEADLINE_CONFIG,
} from '../domain/redundancyWorkflow';
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
  LifecycleStatus,
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
  UserRole,
  WorkspaceDataset,
} from '../domain/types';
import { validateCreateInitiativeInput } from '../domain/validation';
import {
  InitiativeDetailRecord,
  InitiativeRepository,
  RedundancyCaseDetailRecord,
  SaveBenefitInput,
  SaveCostTransactionInput,
  SaveRedundancyReviewInput,
} from './interfaces';
import { SEED_DEPARTMENTS, SEED_USERS } from './seedData';
import {
  GraphSharePointClient,
  SharePointListMetadata,
  SharePointSiteMetadata,
} from '../services/graphSharePointClient';
import { MsalAuthState } from '../services/msalAuthService';
import {
  isEntraConfigured,
  isSharePointRegistryConfigured,
  SharePointConnectionConfig,
} from '../services/sharepointConfig';

export interface SecondaryListDiagnostic {
  listKey: 'lifecycle' | 'usage' | 'financial';
  label: string;
  configured: boolean;
  listId: string;
  accessible: boolean;
  displayName?: string;
  itemCount?: number;
  columnCount?: number;
  error?: string;
}

export interface SharePointDiagnosticReport {
  checkedAt: string;
  readOnlyMode: true;
  writesDisabledReason: string;
  authStatus: {
    configured: boolean;
    signedIn: boolean;
    accountUsername: string | null;
    tenantId: string | null;
    grantedScopes: string[];
    tokenExpiresOn: string | null;
    error: string | null;
  };
  siteCheck: {
    configured: boolean;
    accessible: boolean;
    site?: SharePointSiteMetadata;
    error?: string;
  };
  registryListCheck: {
    configured: boolean;
    accessible: boolean;
    list?: SharePointListMetadata;
    pagesFetched: number;
    rawItemsCount: number;
    mappedItemsCount: number;
    truncatedByMaxPages: boolean;
    error?: string;
  };
  discoveredColumns: DiscoveredSharePointColumn[];
  columnDiagnostics: ColumnDiagnosticRow[];
  unmappedListColumns: DiscoveredSharePointColumn[];
  mappingIssues: ColumnMappingIssue[];
  secondaryLists: SecondaryListDiagnostic[];
}

const DRAFT_STORAGE_KEY = 'aas_ai_governance_sp_draft_v1';

export class SharePointInitiativeRepository implements InitiativeRepository {
  // Step 4 Safety Guard: Writes stay disabled until column mapping and server/list permissions are verified.
  public readonly writesEnabled = false as const;

  private config: SharePointConnectionConfig;
  private readonly getClient: () => GraphSharePointClient;
  private readonly getAuthState: () => MsalAuthState;
  private readonly nowProvider: () => Date;

  private cachedInitiatives: Initiative[] | null = null;
  private cachedUsageSnapshots: Map<string, UsageTrackingSnapshot[]> | null =
    null;
  private cachedAtIso: string | null = null;

  constructor(options: {
    config: SharePointConnectionConfig;
    getClient: () => GraphSharePointClient;
    getAuthState: () => MsalAuthState;
    nowProvider?: () => Date;
  }) {
    this.config = options.config;
    this.getClient = options.getClient;
    this.getAuthState = options.getAuthState;
    this.nowProvider = options.nowProvider ?? (() => new Date());
  }

  public updateConfig(nextConfig: SharePointConnectionConfig): void {
    this.config = nextConfig;
    this.invalidateCache();
  }

  public invalidateCache(): void {
    this.cachedInitiatives = null;
    this.cachedUsageSnapshots = null;
    this.cachedAtIso = null;
  }

  private async ensureRegistryLoaded(
    forceRefresh = false
  ): Promise<{ initiatives: Initiative[]; issues: ColumnMappingIssue[] }> {
    if (!isSharePointRegistryConfigured(this.config)) {
      throw validationError(
        'SharePoint Site ID and AI Registry List ID must be configured in Connection Diagnostics before reading SharePoint data.'
      );
    }

    if (this.cachedInitiatives && !forceRefresh) {
      return { initiatives: this.cachedInitiatives, issues: [] };
    }

    const client = this.getClient();
    const paginated = await client.fetchAllListItems(
      this.config.siteId,
      this.config.registryListId
    );

    const nowIso = this.nowProvider().toISOString();
    const mapped: Initiative[] = [];
    const allIssues: ColumnMappingIssue[] = [];

    for (const rawItem of paginated.items) {
      const res = mapSharePointItemToInitiative(rawItem, {
        siteId: this.config.siteId,
        listId: this.config.registryListId,
        columnMappings: this.config.columnMappings,
        departments: SEED_DEPARTMENTS,
        users: SEED_USERS,
        nowIso,
      });
      allIssues.push(...res.issues);
      if (res.initiative) {
        mapped.push(res.initiative);
      }
    }

    // Optional separate Usage Tracking list join by stable initiativeId
    const usageMap = new Map<string, UsageTrackingSnapshot[]>();
    if (this.config.usageListId) {
      try {
        const usageItems = await client.fetchAllListItems(
          this.config.siteId,
          this.config.usageListId
        );
        for (const rawUsage of usageItems.items) {
          const snap = mapSharePointItemToUsageSnapshot(
            rawUsage,
            this.config.usageColumnMappings
          );
          if (snap) {
            const arr = usageMap.get(snap.initiativeId) ?? [];
            arr.push(snap);
            usageMap.set(snap.initiativeId, arr);
          }
        }
      } catch {
        // Usage list enrichment is non-fatal for primary registry reads; surfaced in diagnostics.
      }
    }

    this.cachedInitiatives = mapped;
    this.cachedUsageSnapshots = usageMap;
    this.cachedAtIso = nowIso;

    return { initiatives: mapped, issues: allIssues };
  }

  public async listInitiatives(
    filter?: ListInitiativesFilter
  ): Promise<Initiative[]> {
    const { initiatives } = await this.ensureRegistryLoaded();
    let result = [...initiatives];

    if (filter) {
      const searchLower = filter.search?.trim().toLowerCase();
      if (searchLower) {
        result = result.filter(
          (item) =>
            item.title.toLowerCase().includes(searchLower) ||
            item.businessProblem.toLowerCase().includes(searchLower) ||
            item.description.toLowerCase().includes(searchLower) ||
            item.businessCapability.toLowerCase().includes(searchLower) ||
            item.aiPlatform.toLowerCase().includes(searchLower)
        );
      }
      if (filter.departmentId) {
        result = result.filter((i) => i.departmentId === filter.departmentId);
      }
      if (filter.lifecycleStatus) {
        result = result.filter(
          (i) => i.lifecycleStatus === filter.lifecycleStatus
        );
      }
      if (filter.category) {
        result = result.filter((i) => i.category === filter.category);
      }
      if (filter.valueCategory) {
        result = result.filter((i) => i.valueCategory === filter.valueCategory);
      }
      if (filter.ownerId) {
        result = result.filter((i) => i.ownerId === filter.ownerId);
      }
      if (filter.aiPlatform) {
        result = result.filter((i) => i.aiPlatform === filter.aiPlatform);
      }
      if (filter.needsCompletionOnly) {
        result = result.filter((i) => Boolean(i.needsDataCompletion));
      }
      if (filter.overdueOnly) {
        const now = this.nowProvider();
        result = result.filter(
          (i) =>
            i.lifecycleStatus !== LifecycleStatus.RETIRE &&
            isReviewOverdue(i.nextReviewDue, now)
        );
      }
    }

    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async getInitiative(id: string): Promise<InitiativeDetailRecord> {
    const { initiatives } = await this.ensureRegistryLoaded();
    const initiative = initiatives.find((i) => i.id === id);
    if (!initiative) {
      throw notFoundError('SharePoint Initiative', id);
    }

    let lifecycleHistory: LifecycleEvent[] = [];
    if (this.config.lifecycleListId) {
      try {
        const client = this.getClient();
        const rawHistory = await client.fetchAllListItems(
          this.config.siteId,
          this.config.lifecycleListId
        );
        lifecycleHistory = rawHistory.items
          .map((item) =>
            mapSharePointItemToLifecycleEvent(
              item,
              this.config.lifecycleColumnMappings
            )
          )
          .filter(
            (evt): evt is LifecycleEvent =>
              evt !== null && evt.initiativeId === initiative.id
          )
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      } catch {
        // Non-fatal fallback; lifecycle list diagnostics show exact error
        lifecycleHistory = [];
      }
    }

    return {
      initiative,
      lifecycleHistory,
    };
  }

  public getUsageSnapshotsForInitiative(
    initiativeId: string
  ): UsageTrackingSnapshot[] {
    return this.cachedUsageSnapshots?.get(initiativeId) ?? [];
  }

  /**
   * Step 4: Write methods are intentionally prepared with validation & field payload mapping
   * but remain disabled until column mapping and server-side / SharePoint list-level
   * permissions are verified against the live tenant.
   */
  private assertWritesEnabled(actionLabel: string): never {
    throw forbiddenError(
      `SharePoint writes are disabled (${actionLabel}): verify column mappings and server-side or SharePoint list-level permissions before enabling writes.`
    );
  }

  public async createInitiative(
    input: CreateInitiativeInput,
    _actor: UserAccount
  ): Promise<Initiative> {
    const errors = validateCreateInitiativeInput(input);
    if (Object.keys(errors).length > 0) {
      throw validationError('Initiative input failed validation.', errors);
    }
    // Prepared payload ready for future Graph POST /sites/{siteId}/lists/{listId}/items
    buildSharePointFieldsPayload(input, this.config.columnMappings);
    this.assertWritesEnabled('createInitiative');
  }

  public async updateInitiative(
    input: UpdateInitiativeInput,
    _actor: UserAccount
  ): Promise<Initiative> {
    // Prepared payload ready for future Graph PATCH .../fields with If-Match ETag
    buildSharePointFieldsPayload(input.patch, this.config.columnMappings);
    this.assertWritesEnabled('updateInitiative');
  }

  public async recordLifecycleEvent(
    _input: RecordLifecycleEventInput,
    _actor: UserAccount
  ): Promise<{ initiative: Initiative; event: LifecycleEvent }> {
    this.assertWritesEnabled('recordLifecycleEvent');
  }

  public async markOwnerReviewed(
    _input: MarkOwnerReviewedInput,
    _actor: UserAccount
  ): Promise<Initiative> {
    this.assertWritesEnabled('markOwnerReviewed');
  }

  public async listDepartments(): Promise<Department[]> {
    const map = new Map<string, Department>();
    for (const dept of SEED_DEPARTMENTS) {
      map.set(dept.id, dept);
    }
    if (this.cachedInitiatives) {
      for (const init of this.cachedInitiatives) {
        if (!map.has(init.departmentId) && init.departmentId.startsWith('sp-dept:')) {
          const label = init.departmentId.replace(/^sp-dept:/, '') || 'Unassigned';
          map.set(init.departmentId, {
            id: init.departmentId,
            name: label,
            code: label.slice(0, 4).toUpperCase(),
            costCenter: 'SP-MAPPED',
          });
        }
      }
    }
    return Array.from(map.values());
  }

  public async listUsers(): Promise<UserAccount[]> {
    const map = new Map<string, UserAccount>();
    for (const user of SEED_USERS) {
      map.set(user.id, user);
    }
    if (this.cachedInitiatives) {
      for (const init of this.cachedInitiatives) {
        if (!map.has(init.ownerId)) {
          map.set(init.ownerId, {
            id: init.ownerId,
            displayName: init.ownerId,
            email: init.ownerId.includes('@') ? init.ownerId : '',
            role: UserRole.EMPLOYEE,
            departmentId: init.departmentId,
            jobTitle: 'SharePoint Listed Owner',
          });
        }
      }
    }
    return Array.from(map.values());
  }

  public async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    const [initiatives, departments] = await Promise.all([
      this.listInitiatives(),
      this.listDepartments(),
    ]);
    return computePortfolioMetrics(initiatives, departments, this.nowProvider());
  }

  public async getSyncStatus(): Promise<SyncStatusSummary> {
    return {
      mode: 'SHAREPOINT_READ_ONLY',
      readOnly: true,
      syncState: SyncState.SYNCED,
      storageKey: this.config.registryListId || 'unconfigured-list',
      lastUpdatedAt: this.cachedAtIso,
      pendingOutboxCount: 0,
      targetProductionStack: [
        'Microsoft Entra ID (MSAL SPA)',
        'Microsoft Graph v1.0',
        'SharePoint Lists (AI Registry + Lifecycle + Usage + Financial)',
      ],
      disclaimer:
        'Connected to SharePoint Lists in Read-Only mode. Writes remain disabled until column mappings and server-side/list-level permissions are verified.',
    };
  }

  public async resetDemoData(): Promise<void> {
    this.invalidateCache();
  }

  public getDraft(): InitiativeDraft | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as InitiativeDraft) : null;
    } catch {
      return null;
    }
  }

  public saveDraft(draft: InitiativeDraft): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }

  public clearDraft(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  }

  public async deleteInitiative(_id: string, _actor: UserAccount): Promise<void> {
    this.assertWritesEnabled('deleteInitiative');
  }

  public async listAllLifecycleEvents(): Promise<LifecycleEvent[]> {
    if (!this.config.lifecycleListId) return [];
    try {
      const client = this.getClient();
      const rawHistory = await client.fetchAllListItems(
        this.config.siteId,
        this.config.lifecycleListId
      );
      return rawHistory.items
        .map((item) =>
          mapSharePointItemToLifecycleEvent(
            item,
            this.config.lifecycleColumnMappings
          )
        )
        .filter((evt): evt is LifecycleEvent => evt !== null);
    } catch {
      return [];
    }
  }

  public async listBenefits(): Promise<BenefitEntry[]> {
    return [];
  }

  public async saveBenefit(
    _input: SaveBenefitInput,
    _actor: UserAccount
  ): Promise<BenefitEntry> {
    this.assertWritesEnabled('saveBenefit');
  }

  public async deleteBenefit(_id: string, _actor: UserAccount): Promise<void> {
    this.assertWritesEnabled('deleteBenefit');
  }

  public async listCostTransactions(): Promise<AiCostTransaction[]> {
    return [];
  }

  public async saveCostTransaction(
    _input: SaveCostTransactionInput,
    _actor: UserAccount
  ): Promise<AiCostTransaction> {
    this.assertWritesEnabled('saveCostTransaction');
  }

  public async deleteCostTransaction(
    _id: string,
    _actor: UserAccount
  ): Promise<void> {
    this.assertWritesEnabled('deleteCostTransaction');
  }

  public async listCostPlans(): Promise<AiCostPlanEntry[]> {
    return [];
  }

  public async saveCostPlan(): Promise<AiCostPlanEntry> {
    this.assertWritesEnabled('saveCostPlan');
  }

  public async deleteCostPlan(): Promise<void> {
    this.assertWritesEnabled('deleteCostPlan');
  }

  public async duplicateCostPlanToMonth(): Promise<{
    entry: AiCostPlanEntry;
    action: 'CREATED' | 'UPDATED';
  }> {
    this.assertWritesEnabled('duplicateCostPlanToMonth');
  }

  public async copyMonthlyPlanAcrossYear(): Promise<{
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
  }> {
    this.assertWritesEnabled('copyMonthlyPlanAcrossYear');
  }

  public async listRedundancyReviews(): Promise<RedundancyReviewRecord[]> {
    return [];
  }

  public async saveRedundancyReview(
    _input: SaveRedundancyReviewInput,
    _actor: UserAccount
  ): Promise<RedundancyReviewRecord> {
    this.assertWritesEnabled('saveRedundancyReview');
  }

  public async listRedundancyCases(): Promise<RedundancyCase[]> {
    return [];
  }

  public async getRedundancyCaseDetail(
    caseId: string
  ): Promise<RedundancyCaseDetailRecord> {
    throw notFoundError('RedundancyCase', caseId);
  }

  public async createRedundancyCase(): Promise<{
    redundancyCase: RedundancyCase;
    created: boolean;
  }> {
    this.assertWritesEnabled('createRedundancyCase');
  }

  public async syncActiveMatchesToRedundancyCases(): Promise<{
    createdCount: number;
    skippedExistingCount: number;
    cases: RedundancyCase[];
  }> {
    this.assertWritesEnabled('syncActiveMatchesToRedundancyCases');
  }

  public async updateRedundancyCase(): Promise<RedundancyCase> {
    this.assertWritesEnabled('updateRedundancyCase');
  }

  public async addRedundancyDiscussionNote(): Promise<RedundancyCase> {
    this.assertWritesEnabled('addRedundancyDiscussionNote');
  }

  public async listRedundancyActions(): Promise<RedundancyAction[]> {
    return [];
  }

  public async saveRedundancyAction(): Promise<RedundancyAction> {
    this.assertWritesEnabled('saveRedundancyAction');
  }

  public async deleteRedundancyAction(): Promise<void> {
    this.assertWritesEnabled('deleteRedundancyAction');
  }

  public async logRedundancyActionReminder(): Promise<RedundancyAction> {
    this.assertWritesEnabled('logRedundancyActionReminder');
  }

  public async listRedundancyEvents(): Promise<RedundancyEvent[]> {
    return [];
  }

  public async listBoardDecisions(): Promise<BoardDecision[]> {
    return [];
  }

  public async escalateRedundancyCaseToBoard(): Promise<{
    redundancyCase: RedundancyCase;
    boardDecision: BoardDecision;
  }> {
    this.assertWritesEnabled('escalateRedundancyCaseToBoard');
  }

  public async recordBoardDecision(): Promise<{
    redundancyCase: RedundancyCase;
    boardDecision: BoardDecision;
  }> {
    this.assertWritesEnabled('recordBoardDecision');
  }

  public async closeRedundancyCase(): Promise<RedundancyCase> {
    this.assertWritesEnabled('closeRedundancyCase');
  }

  public async getRedundancyDeadlineConfig(): Promise<RedundancyDeadlineConfig> {
    return { ...DEFAULT_REDUNDANCY_DEADLINE_CONFIG };
  }

  public async saveRedundancyDeadlineConfig(): Promise<RedundancyDeadlineConfig> {
    this.assertWritesEnabled('saveRedundancyDeadlineConfig');
  }

  public async listImportBatches(): Promise<ImportBatchRecord[]> {
    return [];
  }

  public async commitInitiativeImportBatch(): Promise<ImportBatchRecord> {
    this.assertWritesEnabled('commitInitiativeImportBatch');
  }

  public async commitCostImportBatch(): Promise<ImportBatchRecord> {
    this.assertWritesEnabled('commitCostImportBatch');
  }

  public async commitCostPlanImportBatch(): Promise<ImportBatchRecord> {
    this.assertWritesEnabled('commitCostPlanImportBatch');
  }

  public async listMappingTemplates(): Promise<ImportMappingTemplate[]> {
    return [];
  }

  public async saveMappingTemplate(): Promise<ImportMappingTemplate> {
    this.assertWritesEnabled('saveMappingTemplate');
  }

  public async deleteMappingTemplate(): Promise<void> {
    this.assertWritesEnabled('deleteMappingTemplate');
  }

  public getActiveDataset(): WorkspaceDataset {
    return 'IMPORTED_PORTFOLIO';
  }

  public async switchDataset(): Promise<void> {
    // SharePoint Read-Only mode always reflects the connected tenant list
  }

  public async runDiagnostics(): Promise<SharePointDiagnosticReport> {
    const authState = this.getAuthState();
    const checkedAt = this.nowProvider().toISOString();

    const report: SharePointDiagnosticReport = {
      checkedAt,
      readOnlyMode: true,
      writesDisabledReason:
        'SharePoint create/update/lifecycle writes are intentionally disabled until column mappings and server-side or SharePoint list-level permissions are verified.',
      authStatus: {
        configured: isEntraConfigured(this.config),
        signedIn: authState.status === 'SIGNED_IN' && Boolean(authState.account),
        accountUsername: authState.account?.username ?? null,
        tenantId: authState.account?.tenantId ?? (this.config.tenantId || null),
        grantedScopes: authState.grantedScopes,
        tokenExpiresOn: authState.tokenExpiresOn,
        error: authState.lastError ? redactSensitiveTokens(authState.lastError) : null,
      },
      siteCheck: {
        configured: Boolean(this.config.siteId),
        accessible: false,
      },
      registryListCheck: {
        configured: isSharePointRegistryConfigured(this.config),
        accessible: false,
        pagesFetched: 0,
        rawItemsCount: 0,
        mappedItemsCount: 0,
        truncatedByMaxPages: false,
      },
      discoveredColumns: [],
      columnDiagnostics: [],
      unmappedListColumns: [],
      mappingIssues: [],
      secondaryLists: [
        {
          listKey: 'lifecycle',
          label: 'Lifecycle History List',
          configured: Boolean(this.config.lifecycleListId),
          listId: this.config.lifecycleListId,
          accessible: false,
        },
        {
          listKey: 'usage',
          label: 'Usage Tracking List',
          configured: Boolean(this.config.usageListId),
          listId: this.config.usageListId,
          accessible: false,
        },
        {
          listKey: 'financial',
          label: 'Future Financial Data List',
          configured: Boolean(this.config.financialListId),
          listId: this.config.financialListId,
          accessible: false,
        },
      ],
    };

    if (!report.authStatus.configured || !report.authStatus.signedIn) {
      return report;
    }

    const client = this.getClient();

    // 1. Check SharePoint Site accessibility
    if (this.config.siteId) {
      try {
        const site = await client.fetchSiteMetadata(this.config.siteId);
        report.siteCheck = {
          configured: true,
          accessible: true,
          site,
        };
      } catch (err) {
        report.siteCheck = {
          configured: true,
          accessible: false,
          error: redactSensitiveTokens(
            err instanceof Error ? err.message : 'Unable to access SharePoint site.'
          ),
        };
        return report;
      }
    }

    // 2. Check Primary AI Registry List metadata, columns & paginated read
    if (isSharePointRegistryConfigured(this.config)) {
      try {
        const listMeta = await client.fetchListWithColumns(
          this.config.siteId,
          this.config.registryListId
        );
        report.discoveredColumns = listMeta.columns;

        const colDiag = diagnoseSharePointColumns(
          listMeta.columns,
          this.config.columnMappings
        );
        report.columnDiagnostics = colDiag.rows;
        report.unmappedListColumns = colDiag.unmappedListColumns;
        report.mappingIssues.push(...colDiag.issues);

        const paginated = await client.fetchAllListItems(
          this.config.siteId,
          this.config.registryListId
        );

        let mappedCount = 0;
        const mappedItems: Initiative[] = [];
        const nowIso = this.nowProvider().toISOString();

        for (const rawItem of paginated.items) {
          const mapped = mapSharePointItemToInitiative(rawItem, {
            siteId: this.config.siteId,
            listId: this.config.registryListId,
            columnMappings: this.config.columnMappings,
            departments: SEED_DEPARTMENTS,
            users: SEED_USERS,
            nowIso,
          });
          report.mappingIssues.push(...mapped.issues);
          if (mapped.initiative) {
            mappedCount += 1;
            mappedItems.push(mapped.initiative);
          }
        }

        this.cachedInitiatives = mappedItems;
        this.cachedAtIso = nowIso;

        report.registryListCheck = {
          configured: true,
          accessible: true,
          list: listMeta,
          pagesFetched: paginated.pagesFetched,
          rawItemsCount: paginated.items.length,
          mappedItemsCount: mappedCount,
          truncatedByMaxPages: paginated.truncatedByMaxPages,
        };
      } catch (err) {
        report.registryListCheck = {
          ...report.registryListCheck,
          accessible: false,
          error: redactSensitiveTokens(
            err instanceof Error ? err.message : 'Unable to read AI Registry list.'
          ),
        };
      }
    }

    // 3. Check Separate Secondary SharePoint Lists (Step 5)
    for (const sec of report.secondaryLists) {
      if (!sec.configured || !this.config.siteId) continue;
      try {
        const meta = await client.fetchListWithColumns(
          this.config.siteId,
          sec.listId
        );
        const items = await client.fetchAllListItems(
          this.config.siteId,
          sec.listId,
          { pageSize: 50, maxPages: 5 }
        );
        sec.accessible = true;
        sec.displayName = meta.displayName;
        sec.columnCount = meta.columns.length;
        sec.itemCount = items.items.length;
      } catch (err) {
        sec.accessible = false;
        sec.error = redactSensitiveTokens(
          err instanceof Error ? err.message : `Unable to access ${sec.label}.`
        );
      }
    }

    return report;
  }
}
