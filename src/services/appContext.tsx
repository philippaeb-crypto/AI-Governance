import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_OPERATIONS_CONFIG,
  orderDepartmentsOperationsFirst,
} from '../domain/operationsReporting';
import { DEFAULT_REDUNDANCY_DEADLINE_CONFIG } from '../domain/redundancyWorkflow';
import {
  DataSourceMode,
  Department,
  OperationsReportingConfig,
  RedundancyDeadlineConfig,
  SyncStatusSummary,
  UserAccount,
  WorkspaceDataset,
} from '../domain/types';
import { DemoRepository } from '../repositories/demoRepository';
import { InitiativeRepository } from '../repositories/interfaces';
import { SharePointInitiativeRepository } from '../repositories/sharePointInitiativeRepository';
import { MockAiProvider } from './aiProvider';
import { GraphSharePointClient } from './graphSharePointClient';
import { MsalAuthService, MsalAuthState } from './msalAuthService';
import {
  isEntraConfigured,
  isSharePointRegistryConfigured,
  loadSharePointConfig,
  resetSharePointConfig,
  saveSharePointConfig,
  SharePointConnectionConfig,
} from './sharepointConfig';

export type AppRoute =
  | { page: 'home' }
  | { page: 'intake' }
  | { page: 'my-initiatives' }
  | { page: 'explore' }
  | { page: 'detail'; initiativeId: string; startInEditMode?: boolean }
  | { page: 'gov-overview' }
  | { page: 'gov-lifecycle' }
  | { page: 'gov-savings'; initialTab?: 'overview' | 'cost-planning' | 'cost-plan-import' }
  | { page: 'gov-savings-quality' }
  | { page: 'gov-redundancy'; initialTab?: 'cases' | 'candidates' | 'board' | 'queue' }
  | { page: 'gov-redundancy-case'; caseId: string; returnTab?: 'cases' | 'candidates' | 'board' | 'queue' }
  | { page: 'gov-similarity' }
  | { page: 'gov-imports' }
  | { page: 'gov-diagnostics' }
  | { page: 'gov-settings' };

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

interface AppContextValue {
  repository: InitiativeRepository;
  demoRepository: DemoRepository;
  sharePointRepository: SharePointInitiativeRepository;
  aiProvider: MockAiProvider;
  dataSourceMode: DataSourceMode;
  activeDataset: WorkspaceDataset;
  switchDataset: (dataset: WorkspaceDataset) => Promise<void>;
  switchDataSourceMode: (mode: DataSourceMode) => Promise<void>;
  spConfig: SharePointConnectionConfig;
  updateSpConfig: (next: SharePointConnectionConfig) => Promise<void>;
  resetSpConfig: () => Promise<void>;
  msalAuthState: MsalAuthState;
  signInMicrosoft: () => Promise<void>;
  signOutMicrosoft: () => Promise<void>;
  currentUser: UserAccount;
  users: UserAccount[];
  departments: Department[];
  orderedDepartments: Department[];
  operationsConfig: OperationsReportingConfig;
  updateOperationsConfig: (next: OperationsReportingConfig) => Promise<void>;
  redundancyDeadlineConfig: RedundancyDeadlineConfig;
  updateRedundancyDeadlineConfig: (next: RedundancyDeadlineConfig) => Promise<void>;
  syncStatus: SyncStatusSummary | null;
  route: AppRoute;
  navigate: (next: AppRoute) => void;
  switchUser: (userId: string) => void;
  dataRevision: number;
  bumpDataRevision: () => Promise<void>;
  resetAllDemoData: () => Promise<void>;
  notify: (tone: ToastMessage['tone'], title: string, detail?: string) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  presentationMode: boolean;
  setPresentationMode: (enabled: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const USER_STORAGE_KEY = 'aas_ai_governance_demo_user_v1';
const DATA_SOURCE_STORAGE_KEY = 'aas_ai_governance_data_source_v1';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [spConfig, setSpConfig] = useState<SharePointConnectionConfig>(() =>
    loadSharePointConfig()
  );

  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(DATA_SOURCE_STORAGE_KEY);
      if (saved === 'SHAREPOINT_READ_ONLY') {
        return 'SHAREPOINT_READ_ONLY';
      }
    }
    return 'DEMO_LOCAL';
  });

  const demoRepository = useMemo(() => new DemoRepository(), []);
  const msalService = useMemo(() => new MsalAuthService(spConfig), []);
  const [msalAuthState, setMsalAuthState] = useState<MsalAuthState>(() =>
    msalService.getState()
  );

  useEffect(() => {
    const unsub = msalService.subscribe((next) => {
      setMsalAuthState(next);
    });
    void msalService.initialize();
    return unsub;
  }, [msalService]);

  const graphClient = useMemo(
    () =>
      new GraphSharePointClient({
        getAccessToken: (scopes) => msalService.acquireApiToken(scopes),
        scopes: spConfig.scopes,
      }),
    [msalService, spConfig.scopes]
  );

  const sharePointRepository = useMemo(
    () =>
      new SharePointInitiativeRepository({
        config: spConfig,
        getClient: () => graphClient,
        getAuthState: () => msalService.getState(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    sharePointRepository.updateConfig(spConfig);
  }, [sharePointRepository, spConfig]);

  const repository: InitiativeRepository =
    dataSourceMode === 'SHAREPOINT_READ_ONLY'
      ? sharePointRepository
      : demoRepository;

  const aiProvider = useMemo(() => new MockAiProvider(repository), [repository]);

  const [users, setUsers] = useState<UserAccount[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [operationsConfig, setOperationsConfig] =
    useState<OperationsReportingConfig>(DEFAULT_OPERATIONS_CONFIG);
  const [redundancyDeadlineConfig, setRedundancyDeadlineConfig] =
    useState<RedundancyDeadlineConfig>(DEFAULT_REDUNDANCY_DEADLINE_CONFIG);
  const [activeDataset, setActiveDataset] = useState<WorkspaceDataset>('SAMPLE_DEMO');
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem(USER_STORAGE_KEY) || 'user-sarah';
    }
    return 'user-sarah';
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatusSummary | null>(null);
  const [route, setRoute] = useState<AppRoute>({ page: 'home' });
  const [dataRevision, setDataRevision] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [presentationMode, setPresentationMode] = useState(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (tone: ToastMessage['tone'], title: string, detail?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, tone, title, detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const loadMetadata = useCallback(async () => {
    await demoRepository.hydrate();
    const [u, d, sync, opsCfg, redCfg] = await Promise.all([
      repository.listUsers(),
      repository.listDepartments(),
      repository.getSyncStatus(),
      demoRepository.getOperationsConfig(),
      demoRepository.getRedundancyDeadlineConfig(),
    ]);
    setUsers(u);
    setDepartments(d);
    setSyncStatus(sync);
    setOperationsConfig(opsCfg);
    setRedundancyDeadlineConfig(redCfg);
    setActiveDataset(repository.getActiveDataset());
  }, [repository, demoRepository]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata, dataRevision]);

  const currentUser = useMemo<UserAccount>(() => {
    const found = users.find((u) => u.id === currentUserId);
    if (found) return found;
    if (users.length > 0) return users[0];
    return {
      id: 'user-sarah',
      displayName: 'Sarah Chen',
      email: 'sarah.chen@aas-enterprise.example',
      role: 'EMPLOYEE' as UserAccount['role'],
      departmentId: 'dept-proc',
      jobTitle: 'Operations Controlling Lead',
    };
  }, [users, currentUserId]);

  const navigate = useCallback((next: AppRoute) => {
    setRoute(next);
    if (next.page !== 'gov-overview') {
      setPresentationMode(false);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  const switchUser = useCallback(
    (userId: string) => {
      setCurrentUserId(userId);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(USER_STORAGE_KEY, userId);
      }
      const nextUser = users.find((u) => u.id === userId);
      if (
        nextUser &&
        nextUser.role !== 'GOVERNANCE' &&
        route.page.startsWith('gov-') &&
        route.page !== 'gov-settings' &&
        route.page !== 'gov-diagnostics'
      ) {
        setRoute({ page: 'home' });
      }
      if (nextUser) {
        notify(
          'info',
          `Demo profile switched to ${nextUser.displayName}`,
          `Simulated Role: ${nextUser.role === 'GOVERNANCE' ? 'Demo AI Portfolio Manager' : nextUser.role === 'EMPLOYEE' ? 'Demo Employee' : 'Admin (Reserved)'} — demo switcher only, not authentication.`
        );
      }
    },
    [users, route.page, notify]
  );

  const bumpDataRevision = useCallback(async () => {
    setDataRevision((r) => r + 1);
    const [u, d, sync, opsCfg, redCfg] = await Promise.all([
      repository.listUsers(),
      repository.listDepartments(),
      repository.getSyncStatus(),
      demoRepository.getOperationsConfig(),
      demoRepository.getRedundancyDeadlineConfig(),
    ]);
    setUsers(u);
    setDepartments(d);
    setSyncStatus(sync);
    setOperationsConfig(opsCfg);
    setRedundancyDeadlineConfig(redCfg);
    setActiveDataset(repository.getActiveDataset());
  }, [repository, demoRepository]);

  const updateOperationsConfig = useCallback(
    async (next: OperationsReportingConfig) => {
      const saved = await demoRepository.saveOperationsConfig(next);
      setOperationsConfig(saved);
      await bumpDataRevision();
    },
    [demoRepository, bumpDataRevision]
  );

  const updateRedundancyDeadlineConfig = useCallback(
    async (next: RedundancyDeadlineConfig) => {
      const saved = await demoRepository.saveRedundancyDeadlineConfig(
        next,
        currentUser
      );
      setRedundancyDeadlineConfig(saved);
      await bumpDataRevision();
    },
    [demoRepository, currentUser, bumpDataRevision]
  );

  const orderedDepartments = useMemo(
    () => orderDepartmentsOperationsFirst(departments, operationsConfig),
    [departments, operationsConfig]
  );

  const switchDataset = useCallback(
    async (dataset: WorkspaceDataset) => {
      await demoRepository.switchDataset(dataset);
      setActiveDataset(dataset);
      await bumpDataRevision();
      notify(
        'info',
        dataset === 'SAMPLE_DEMO'
          ? 'Switched to Sample Demo Data'
          : 'Switched to Imported Portfolio Data',
        dataset === 'SAMPLE_DEMO'
          ? 'Showing preloaded 4-department Operations enterprise demo portfolio, financials, and synergy pairs.'
          : 'Isolated clean portfolio workspace populated exclusively by your Excel/CSV imports and created initiatives.'
      );
    },
    [demoRepository, bumpDataRevision, notify]
  );

  const resetAllDemoData = useCallback(async () => {
    await demoRepository.resetDemoData();
    setActiveDataset('SAMPLE_DEMO');
    await bumpDataRevision();
    notify(
      'success',
      'Demo data restored',
      'IndexedDB demo portfolio, financials, costs, redundancy reviews, and imported workspace have been reset to baseline.'
    );
  }, [demoRepository, bumpDataRevision, notify]);

  const updateSpConfig = useCallback(
    async (next: SharePointConnectionConfig) => {
      const saved = saveSharePointConfig(next);
      setSpConfig(saved);
      await msalService.updateConfig(saved);
      sharePointRepository.updateConfig(saved);
      await bumpDataRevision();
    },
    [msalService, sharePointRepository, bumpDataRevision]
  );

  const handleResetSpConfig = useCallback(async () => {
    const reset = resetSharePointConfig();
    setSpConfig(reset);
    await msalService.updateConfig(reset);
    sharePointRepository.updateConfig(reset);
    await bumpDataRevision();
  }, [msalService, sharePointRepository, bumpDataRevision]);

  const signInMicrosoft = useCallback(async () => {
    await msalService.signIn();
    await bumpDataRevision();
  }, [msalService, bumpDataRevision]);

  const signOutMicrosoft = useCallback(async () => {
    await msalService.signOut();
    sharePointRepository.invalidateCache();
    await bumpDataRevision();
  }, [msalService, sharePointRepository, bumpDataRevision]);

  const switchDataSourceMode = useCallback(
    async (nextMode: DataSourceMode) => {
      if (nextMode === 'SHAREPOINT_READ_ONLY') {
        if (!isEntraConfigured(spConfig) || !isSharePointRegistryConfigured(spConfig)) {
          notify(
            'error',
            'SharePoint connection not configured',
            'Provide Entra Tenant/Client ID and SharePoint Site/Registry List ID in Connection Diagnostics first. Demo Mode stays active without silent fallback.'
          );
          return;
        }
        if (msalService.getState().status !== 'SIGNED_IN') {
          notify(
            'error',
            'Microsoft sign-in required',
            'Sign in with Microsoft Entra ID on the Diagnostics screen before activating SharePoint Read-Only mode.'
          );
          return;
        }
      }

      setDataSourceMode(nextMode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DATA_SOURCE_STORAGE_KEY, nextMode);
      }
      sharePointRepository.invalidateCache();
      setDataRevision((r) => r + 1);
      notify(
        'info',
        nextMode === 'SHAREPOINT_READ_ONLY'
          ? 'Switched to SharePoint Lists (Read-Only)'
          : 'Switched to Demo Mode (IndexedDB)',
        nextMode === 'SHAREPOINT_READ_ONLY'
          ? 'Reading live SharePoint Lists via Microsoft Graph. Writes remain disabled.'
          : 'Using local IndexedDB demo persistence.'
      );
    },
    [spConfig, msalService, sharePointRepository, notify]
  );

  const value: AppContextValue = {
    repository,
    demoRepository,
    sharePointRepository,
    aiProvider,
    dataSourceMode,
    activeDataset,
    switchDataset,
    switchDataSourceMode,
    spConfig,
    updateSpConfig,
    resetSpConfig: handleResetSpConfig,
    msalAuthState,
    signInMicrosoft,
    signOutMicrosoft,
    currentUser,
    users,
    departments: orderedDepartments,
    orderedDepartments,
    operationsConfig,
    updateOperationsConfig,
    redundancyDeadlineConfig,
    updateRedundancyDeadlineConfig,
    syncStatus,
    route,
    navigate,
    switchUser,
    dataRevision,
    bumpDataRevision,
    resetAllDemoData,
    notify,
    toasts,
    dismissToast,
    presentationMode,
    setPresentationMode,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
