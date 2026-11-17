import {
  AiCostPlanEntry,
  AiCostTransaction,
  BenefitEntry,
  BoardDecision,
  Department,
  ImportBatchRecord,
  ImportMappingTemplate,
  Initiative,
  LifecycleEvent,
  OperationsReportingConfig,
  RedundancyAction,
  RedundancyCase,
  RedundancyDeadlineConfig,
  RedundancyEvent,
  RedundancyReviewRecord,
  UserAccount,
  WorkspaceDataset,
} from '../domain/types';

export interface DatasetBucket {
  initiatives: Initiative[];
  lifecycleEvents: LifecycleEvent[];
  benefits: BenefitEntry[];
  costTransactions: AiCostTransaction[];
  costPlans?: AiCostPlanEntry[];
  redundancyReviews: RedundancyReviewRecord[];
  redundancyCases: RedundancyCase[];
  redundancyActions: RedundancyAction[];
  redundancyEvents: RedundancyEvent[];
  boardDecisions: BoardDecision[];
  importBatches: ImportBatchRecord[];
  customDepartments: Department[];
  customUsers: UserAccount[];
  lastUpdatedAt: string | null;
}

export interface PersistedWorkspaceState {
  version: number;
  activeDataset: WorkspaceDataset;
  datasets: Record<WorkspaceDataset, DatasetBucket>;
  mappingTemplates?: ImportMappingTemplate[];
  operationsConfig?: OperationsReportingConfig;
  redundancyDeadlineConfig?: RedundancyDeadlineConfig;
}

export const IDB_DATABASE_NAME = 'aas_ai_governance_idb_v1';
export const IDB_STORE_NAME = 'workspace';
export const IDB_STATE_KEY = 'workspace_state_v4';

export interface WorkspacePersistenceAdapter {
  load(): Promise<PersistedWorkspaceState | null>;
  save(state: PersistedWorkspaceState): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryWorkspacePersistence implements WorkspacePersistenceAdapter {
  private state: PersistedWorkspaceState | null = null;

  async load(): Promise<PersistedWorkspaceState | null> {
    return this.state ? (JSON.parse(JSON.stringify(this.state)) as PersistedWorkspaceState) : null;
  }

  async save(state: PersistedWorkspaceState): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state)) as PersistedWorkspaceState;
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}

export class IndexedDbWorkspacePersistence implements WorkspacePersistenceAdapter {
  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = window.indexedDB.open(IDB_DATABASE_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    });
  }

  async load(): Promise<PersistedWorkspaceState | null> {
    try {
      const db = await this.openDb();
      return await new Promise<PersistedWorkspaceState | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(IDB_STORE_NAME);
        const getReq = store.get(IDB_STATE_KEY);
        getReq.onsuccess = () => {
          db.close();
          resolve((getReq.result as PersistedWorkspaceState | undefined) ?? null);
        };
        getReq.onerror = () => {
          db.close();
          reject(getReq.error ?? new Error('IndexedDB read failed'));
        };
      });
    } catch {
      return null;
    }
  }

  async save(state: PersistedWorkspaceState): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_STORE_NAME);
        store.put(state, IDB_STATE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB write failed'));
        };
      });
    } catch {
      // Non-fatal in headless/private environments where IndexedDB is restricted
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_STORE_NAME);
        store.delete(IDB_STATE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB clear failed'));
        };
      });
    } catch {
      // ignore
    }
  }
}

export function createEmptyDatasetBucket(): DatasetBucket {
  return {
    initiatives: [],
    lifecycleEvents: [],
    benefits: [],
    costTransactions: [],
    costPlans: [],
    redundancyReviews: [],
    redundancyCases: [],
    redundancyActions: [],
    redundancyEvents: [],
    boardDecisions: [],
    importBatches: [],
    customDepartments: [],
    customUsers: [],
    lastUpdatedAt: null,
  };
}
