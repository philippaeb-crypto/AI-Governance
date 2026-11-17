import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_SHAREPOINT_COLUMN_MAPPINGS,
  SharePointColumnMappings,
  SharePointDomainField,
} from '../../domain/sharepointMapping';
import { SharePointDiagnosticReport } from '../../repositories/sharePointInitiativeRepository';
import { useApp } from '../../services/appContext';
import {
  getDefaultRedirectUri,
  isEntraConfigured,
  isSharePointRegistryConfigured,
  SharePointConnectionConfig,
} from '../../services/sharepointConfig';

const COLUMN_FIELD_LABELS: Record<SharePointDomainField, string> = {
  initiativeId: 'Stable Initiative ID',
  title: 'Title (Required)',
  businessProblem: 'Business Problem (Required)',
  description: 'Solution Description (Required)',
  businessCapability: 'Business Capability (Required)',
  department: 'Business Area / Department (Required)',
  owner: 'Accountable Owner (Required)',
  ownerEmail: 'Accountable Owner Email',
  aiPlatform: 'AI Platform',
  solutionType: 'Solution Type',
  aiType: 'AI Type',
  category: 'Registry Category (Required)',
  lifecycleStatus: 'Lifecycle Status (Required)',
  valueCategory: 'Value Category (Required)',
  usersCount: 'Users Count (Required)',
  minutesSavedPerOccurrence: 'Minutes Saved / Occurrence (Required)',
  processFrequencyPerWeek: 'Process Frequency / Week (Required)',
  hourlyRate: 'Hourly Rate (Optional)',
  ideaDate: 'Idea Date (Required)',
  goLiveDate: 'Go-Live Date',
  createdAt: 'Created Timestamp',
  updatedAt: 'Modified Timestamp',
  lastOwnerReviewAt: 'Last Owner Review Timestamp',
  nextReviewDue: 'Next Review Due Timestamp',
  version: 'Row Version',
};

export const ConnectionDiagnosticsScreen: React.FC = () => {
  const {
    dataSourceMode,
    switchDataSourceMode,
    spConfig,
    updateSpConfig,
    resetSpConfig,
    msalAuthState,
    signInMicrosoft,
    signOutMicrosoft,
    sharePointRepository,
    notify,
  } = useApp();

  const [draftConfig, setDraftConfig] =
    useState<SharePointConnectionConfig>(spConfig);
  const [scopesText, setScopesText] = useState(() =>
    spConfig.scopes.join(' ')
  );
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [runningDiag, setRunningDiag] = useState(false);
  const [report, setReport] = useState<SharePointDiagnosticReport | null>(null);

  useEffect(() => {
    setDraftConfig(spConfig);
    setScopesText(spConfig.scopes.join(' '));
  }, [spConfig]);

  const entraReady = isEntraConfigured(draftConfig);
  const registryReady = isSharePointRegistryConfigured(draftConfig);
  const canActivateSharePoint =
    entraReady && registryReady && msalAuthState.status === 'SIGNED_IN';

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const parsedScopes = scopesText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await updateSpConfig({
        ...draftConfig,
        scopes:
          parsedScopes.length > 0
            ? parsedScopes
            : ['User.Read', 'Sites.Read.All'],
      });
      notify(
        'success',
        'SharePoint & Entra configuration saved',
        'Non-secret identifiers stored locally for this browser session.'
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetConfig = async () => {
    await resetSpConfig();
    setReport(null);
    notify(
      'info',
      'Connection configuration reset',
      'Restored defaults from VITE_* environment variables.'
    );
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      // Save unsaved config before attempting sign-in
      const parsedScopes = scopesText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await updateSpConfig({
        ...draftConfig,
        scopes:
          parsedScopes.length > 0
            ? parsedScopes
            : ['User.Read', 'Sites.Read.All'],
      });
      await signInMicrosoft();
      notify(
        'success',
        'Microsoft Entra ID sign-in complete',
        'Token acquired in memory only; raw tokens are never displayed or logged.'
      );
    } catch (err) {
      notify(
        'error',
        'Microsoft sign-in failed',
        err instanceof Error ? err.message : 'Unable to authenticate with Entra ID.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutMicrosoft();
      setReport(null);
      if (dataSourceMode === 'SHAREPOINT_READ_ONLY') {
        await switchDataSourceMode('DEMO_LOCAL');
      }
      notify('info', 'Signed out of Microsoft Entra ID');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const res = await sharePointRepository.runDiagnostics();
      setReport(res);
      notify(
        res.registryListCheck.accessible ? 'success' : 'info',
        'Diagnostics completed',
        res.registryListCheck.accessible
          ? `Read ${res.registryListCheck.mappedItemsCount} mapped items across ${res.registryListCheck.pagesFetched} page(s).`
          : 'Inspect checklist below for configuration or access findings.'
      );
    } catch (err) {
      notify(
        'error',
        'Diagnostics encountered an error',
        err instanceof Error ? err.message : 'Unable to complete SharePoint check.'
      );
    } finally {
      setRunningDiag(false);
    }
  };

  const updateColumnMapping = (
    field: SharePointDomainField,
    internalName: string
  ) => {
    setDraftConfig((prev) => ({
      ...prev,
      columnMappings: {
        ...prev.columnMappings,
        [field]: internalName,
      },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            SharePoint & Microsoft Entra Diagnostics
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure Microsoft Entra ID authentication (MSAL) and read-only
            Microsoft Graph access to SharePoint Lists.
          </p>
        </div>
        <button
          type="button"
          disabled={runningDiag}
          onClick={handleRunDiagnostics}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${runningDiag ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>
            {runningDiag ? 'Running Diagnostics...' : 'Run Connection Diagnostics'}
          </span>
        </button>
      </div>

      {/* Honesty & Write-Safety Guardrail Banner */}
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
        <div className="flex items-start gap-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-semibold">
              Read-Only Integration Guard & Tenant Verification Notice
            </div>
            <p className="leading-relaxed">
              Live Microsoft Entra ID sign-in and SharePoint List reads require
              valid tenant credentials and have not been tested against a
              customer tenant until you run diagnostics below. All SharePoint
              create, update, and lifecycle write operations remain{' '}
              <strong>disabled</strong> until actual column mappings and
              server-side or SharePoint list-level permissions (employees read
              all, edit only their own) are verified. Access tokens are never
              displayed or logged.
            </p>
          </div>
        </div>
      </section>

      {/* Active Data Source Switcher */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database className="h-4 w-4 text-slate-700" aria-hidden="true" />
              <span>Active Repository Data Source</span>
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Preserve Demo Mode for single-browser testing, or switch to
              SharePoint Lists (Read-Only) once Entra sign-in and List IDs are
              configured.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void switchDataSourceMode('DEMO_LOCAL')}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                dataSourceMode === 'DEMO_LOCAL'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Demo Mode (Local Storage)
            </button>
            <button
              type="button"
              disabled={!canActivateSharePoint && dataSourceMode !== 'SHAREPOINT_READ_ONLY'}
              onClick={() => void switchDataSourceMode('SHAREPOINT_READ_ONLY')}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                dataSourceMode === 'SHAREPOINT_READ_ONLY'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : canActivateSharePoint
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              }`}
            >
              SharePoint Lists (Read-Only)
            </button>
          </div>
        </div>
      </section>

      {/* Step 1: Microsoft Entra ID Authentication Status & Controls */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-slate-700" aria-hidden="true" />
              <span>Microsoft Entra ID Authentication (MSAL SPA)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Popup-based OAuth 2.0 Authorization Code + PKCE flow. No client
              secrets or access tokens are stored in source code or diagnostics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {msalAuthState.status === 'SIGNED_IN' ? (
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy || !entraReady}
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {authBusy ? 'Signing In...' : 'Sign In with Microsoft'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Safe Auth Status Summary — NEVER renders access tokens */}
        <dl className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">Auth Status</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">
              {msalAuthState.status}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Signed-In Account</dt>
            <dd className="mt-0.5 font-mono text-slate-800">
              {msalAuthState.account?.username ?? 'Not signed in'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Granted Graph Scopes</dt>
            <dd className="mt-0.5 font-mono text-slate-800">
              {msalAuthState.grantedScopes.length > 0
                ? msalAuthState.grantedScopes.join(', ')
                : 'None acquired yet'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Token Expiry (Metadata Only)</dt>
            <dd className="mt-0.5 font-mono text-slate-800 tabular-nums">
              {msalAuthState.tokenExpiresOn
                ? new Date(msalAuthState.tokenExpiresOn).toLocaleString('en-US')
                : '—'}
            </dd>
          </div>
        </dl>

        {msalAuthState.lastError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <strong>Authentication Error:</strong> {msalAuthState.lastError}
          </div>
        )}
      </section>

      {/* Configuration Form: Entra ID + SharePoint List IDs + Column Mappings */}
      <form
        onSubmit={handleSaveConfig}
        className="rounded-lg border border-slate-200 bg-white p-5 space-y-5"
      >
        <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Entra ID & SharePoint List Identifiers
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Populate via <code className="font-mono">VITE_*</code> environment
              variables or enter non-secret tenant/list IDs below for browser
              testing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetConfig}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset to Env Defaults</span>
            </button>
            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{savingConfig ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="sp-tenant-id"
              className="block text-xs font-medium text-slate-700"
            >
              Microsoft Entra Tenant ID (GUID or domain)
            </label>
            <input
              id="sp-tenant-id"
              type="text"
              value={draftConfig.tenantId}
              onChange={(e) =>
                setDraftConfig((p) => ({ ...p, tenantId: e.target.value }))
              }
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="sp-client-id"
              className="block text-xs font-medium text-slate-700"
            >
              Entra SPA Application (Client) ID
            </label>
            <input
              id="sp-client-id"
              type="text"
              value={draftConfig.clientId}
              onChange={(e) =>
                setDraftConfig((p) => ({ ...p, clientId: e.target.value }))
              }
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="sp-redirect-uri"
              className="block text-xs font-medium text-slate-700"
            >
              SPA Redirect URI
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="sp-redirect-uri"
                type="text"
                value={draftConfig.redirectUri}
                onChange={(e) =>
                  setDraftConfig((p) => ({ ...p, redirectUri: e.target.value }))
                }
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  setDraftConfig((p) => ({
                    ...p,
                    redirectUri: getDefaultRedirectUri(),
                  }))
                }
                className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                Use Current Origin
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="sp-scopes"
              className="block text-xs font-medium text-slate-700"
            >
              Microsoft Graph Delegated Scopes (Read-Only)
            </label>
            <input
              id="sp-scopes"
              type="text"
              value={scopesText}
              onChange={(e) => setScopesText(e.target.value)}
              placeholder="User.Read Sites.Read.All"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="sp-site-id"
              className="block text-xs font-medium text-slate-700"
            >
              SharePoint Site ID (Graph Site ID)
            </label>
            <input
              id="sp-site-id"
              type="text"
              value={draftConfig.siteId}
              onChange={(e) =>
                setDraftConfig((p) => ({ ...p, siteId: e.target.value }))
              }
              placeholder="contoso.sharepoint.com,<site-guid>,<web-guid>"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="sp-registry-list-id"
              className="block text-xs font-medium text-slate-700"
            >
              Primary AI Registry List ID (GUID)
            </label>
            <input
              id="sp-registry-list-id"
              type="text"
              value={draftConfig.registryListId}
              onChange={(e) =>
                setDraftConfig((p) => ({
                  ...p,
                  registryListId: e.target.value,
                }))
              }
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Step 5: Separate SharePoint Lists keyed by stable InitiativeId */}
        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-xs font-semibold text-slate-800">
            Separate SharePoint Lists (Linked by Stable InitiativeId)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Keep lifecycle history, usage tracking, and future financial ledgers
            in dedicated SharePoint lists rather than overloading the primary
            registry list.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="sp-lifecycle-list-id"
                className="block text-xs font-medium text-slate-700"
              >
                Lifecycle History List ID (Optional)
              </label>
              <input
                id="sp-lifecycle-list-id"
                type="text"
                value={draftConfig.lifecycleListId}
                onChange={(e) =>
                  setDraftConfig((p) => ({
                    ...p,
                    lifecycleListId: e.target.value,
                  }))
                }
                placeholder="List GUID for AI_Lifecycle_History"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="sp-usage-list-id"
                className="block text-xs font-medium text-slate-700"
              >
                Usage Tracking List ID (Optional)
              </label>
              <input
                id="sp-usage-list-id"
                type="text"
                value={draftConfig.usageListId}
                onChange={(e) =>
                  setDraftConfig((p) => ({
                    ...p,
                    usageListId: e.target.value,
                  }))
                }
                placeholder="List GUID for AI_Usage_Tracking"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="sp-financial-list-id"
                className="block text-xs font-medium text-slate-700"
              >
                Financial Benefits/Costs List ID (Future)
              </label>
              <input
                id="sp-financial-list-id"
                type="text"
                value={draftConfig.financialListId}
                onChange={(e) =>
                  setDraftConfig((p) => ({
                    ...p,
                    financialListId: e.target.value,
                  }))
                }
                placeholder="List GUID for AI_Financial_Ledger"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Configurable Internal Column Mappings */}
        <div className="border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setShowColumnEditor((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-slate-950"
          >
            {showColumnEditor ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              Configure SharePoint Internal Column Names (AI Registry List)
            </span>
          </button>

          {showColumnEditor && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  Map each domain attribute to the exact SharePoint internal
                  column name (e.g. <code className="font-mono">field_1</code>{' '}
                  or <code className="font-mono">BusinessProblem</code>).
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((p) => ({
                      ...p,
                      columnMappings: { ...DEFAULT_SHAREPOINT_COLUMN_MAPPINGS },
                    }))
                  }
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Restore Default Internal Names
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  Object.keys(
                    DEFAULT_SHAREPOINT_COLUMN_MAPPINGS
                  ) as SharePointDomainField[]
                ).map((field) => (
                  <div key={field}>
                    <label
                      htmlFor={`col-map-${field}`}
                      className="block text-[11px] font-medium text-slate-600"
                    >
                      {COLUMN_FIELD_LABELS[field]}
                    </label>
                    <input
                      id={`col-map-${field}`}
                      type="text"
                      value={draftConfig.columnMappings[field]}
                      onChange={(e) =>
                        updateColumnMapping(field, e.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Diagnostic Report Results */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Diagnostic Results & Discovered Columns
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {report
                ? `Last checked at ${new Date(report.checkedAt).toLocaleString('en-US')}`
                : 'Click "Run Connection Diagnostics" to verify Entra sign-in, Graph site/list accessibility, pagination, and SharePoint internal column names.'}
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">
            Writes: DISABLED (Read-Only)
          </span>
        </div>

        {!report ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-600">
            No live diagnostic run recorded in this session yet. Configure
            Microsoft Entra ID & SharePoint IDs above, sign in, and click{' '}
            <strong>Run Connection Diagnostics</strong>.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Checklist Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <DiagnosticCheckCard
                title="1. Entra ID Auth"
                ok={report.authStatus.signedIn}
                configured={report.authStatus.configured}
                detail={
                  report.authStatus.signedIn
                    ? `Signed in as ${report.authStatus.accountUsername}`
                    : report.authStatus.error || 'Not signed in'
                }
              />
              <DiagnosticCheckCard
                title="2. SharePoint Site"
                ok={report.siteCheck.accessible}
                configured={report.siteCheck.configured}
                detail={
                  report.siteCheck.accessible
                    ? `${report.siteCheck.site?.displayName ?? 'Site OK'}`
                    : report.siteCheck.error || 'Site not checked'
                }
              />
              <DiagnosticCheckCard
                title="3. AI Registry List"
                ok={report.registryListCheck.accessible}
                configured={report.registryListCheck.configured}
                detail={
                  report.registryListCheck.accessible
                    ? `${report.registryListCheck.list?.displayName} · ${report.registryListCheck.mappedItemsCount}/${report.registryListCheck.rawItemsCount} items (${report.registryListCheck.pagesFetched} page${report.registryListCheck.pagesFetched === 1 ? '' : 's'})`
                    : report.registryListCheck.error || 'List not checked'
                }
              />
            </div>

            {/* Separate Secondary Lists Status */}
            <div>
              <h3 className="text-xs font-semibold text-slate-800">
                Separate SharePoint Lists Accessibility
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                {report.secondaryLists.map((sec) => (
                  <div
                    key={sec.listKey}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                      <span>{sec.label}</span>
                      {!sec.configured ? (
                        <span className="text-slate-500">Not configured</span>
                      ) : sec.accessible ? (
                        <span className="text-emerald-700">Accessible</span>
                      ) : (
                        <span className="text-red-700">Error</span>
                      )}
                    </div>
                    <div className="mt-1 text-slate-600">
                      {!sec.configured
                        ? 'Optional list ID not yet entered.'
                        : sec.accessible
                          ? `${sec.displayName} · ${sec.itemCount ?? 0} item(s), ${sec.columnCount ?? 0} column(s)`
                          : sec.error || 'Unable to access list.'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mapping Errors & Warnings */}
            {report.mappingIssues.length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />
                  <span>
                    Column & Row Mapping Findings ({report.mappingIssues.length})
                  </span>
                </h3>
                <div className="max-h-60 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-200 text-xs">
                  {report.mappingIssues.map((issue, idx) => (
                    <div
                      key={`${issue.domainField ?? 'row'}-${idx}`}
                      className={`flex items-start gap-2 px-3 py-2 ${
                        issue.severity === 'error'
                          ? 'bg-red-50 text-red-900'
                          : 'bg-amber-50/70 text-amber-950'
                      }`}
                    >
                      {issue.severity === 'error' ? (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      )}
                      <div>
                        <span className="font-mono font-semibold uppercase">
                          {issue.severity}
                        </span>
                        {issue.columnName && (
                          <span className="ml-1.5 font-mono text-slate-700">
                            [{issue.columnName}]
                          </span>
                        )}
                        <span className="ml-1.5">{issue.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Column Mapping Validation Table */}
            {report.columnDiagnostics.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  Domain Field to SharePoint Internal Column Mapping
                </h3>
                <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Domain Field</th>
                        <th className="px-3 py-2 font-semibold">
                          Configured Internal Name
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          Discovered Display Name
                        </th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {report.columnDiagnostics.map((row) => (
                        <tr key={row.domainField}>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {row.domainField}
                            {row.required && (
                              <span className="ml-1 text-red-600">*</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700">
                            {row.expectedInternalName || '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {row.discoveredColumn?.displayName ?? '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {row.discoveredColumn?.columnType ?? '—'}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {row.status === 'MATCHED' ? (
                              <span className="text-emerald-700">Matched</span>
                            ) : row.status === 'MISSING_REQUIRED' ? (
                              <span className="text-red-700">
                                Missing Required
                              </span>
                            ) : (
                              <span className="text-amber-700">
                                Missing Optional
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Discovered List Columns Table */}
            {report.discoveredColumns.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  All Discovered SharePoint List Columns (
                  {report.discoveredColumns.length})
                </h3>
                <div className="mt-2 max-h-72 overflow-auto rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">
                          Internal Name
                        </th>
                        <th className="px-3 py-2 font-semibold">Display Name</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {report.discoveredColumns.map((col) => (
                        <tr key={`${col.id}-${col.name}`}>
                          <td className="px-3 py-2 font-mono text-slate-900">
                            {col.name}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {col.displayName}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {col.columnType}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {[
                              col.required ? 'Required' : null,
                              col.indexed ? 'Indexed' : null,
                              col.readOnly ? 'Read-Only' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Standard'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

const DiagnosticCheckCard: React.FC<{
  title: string;
  ok: boolean;
  configured: boolean;
  detail: string;
}> = ({ title, ok, configured, detail }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs">
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-slate-900">{title}</span>
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
      ) : configured ? (
        <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
      )}
    </div>
    <p className="mt-1.5 leading-relaxed text-slate-600">{detail}</p>
  </div>
);
