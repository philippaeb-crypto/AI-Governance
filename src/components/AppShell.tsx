import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Database,
  FileSpreadsheet,
  GitBranch,
  Home,
  Info,
  Layers,
  Menu,
  PlugZap,
  PlusCircle,
  RotateCcw,
  Scale,
  Settings,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { canAccessGovernanceWorkspace, canCreateInitiative } from '../domain/authorization';
import { UserRole } from '../domain/types';
import { AppRoute, useApp } from '../services/appContext';
import { AbbottLogoSlot } from './AbbottLogoSlot';
import { Modal } from './Modal';

interface NavItem {
  label: string;
  page: AppRoute['page'];
  route: AppRoute;
  Icon: React.ComponentType<{ className?: string }>;
}

const EMPLOYEE_NAV: NavItem[] = [
  { label: 'Home', page: 'home', route: { page: 'home' }, Icon: Home },
  {
    label: 'Register AI Initiative',
    page: 'intake',
    route: { page: 'intake' },
    Icon: PlusCircle,
  },
  {
    label: 'My Initiatives',
    page: 'my-initiatives',
    route: { page: 'my-initiatives' },
    Icon: Briefcase,
  },
  {
    label: 'Explore Portfolio',
    page: 'explore',
    route: { page: 'explore' },
    Icon: Compass,
  },
];

const GOVERNANCE_NAV: NavItem[] = [
  {
    label: 'Executive Overview',
    page: 'gov-overview',
    route: { page: 'gov-overview' },
    Icon: BarChart3,
  },
  {
    label: 'Lifecycle Management',
    page: 'gov-lifecycle',
    route: { page: 'gov-lifecycle' },
    Icon: GitBranch,
  },
  {
    label: 'Savings & Costs',
    page: 'gov-savings',
    route: { page: 'gov-savings' },
    Icon: Scale,
  },
  {
    label: 'Savings Data Quality',
    page: 'gov-savings-quality',
    route: { page: 'gov-savings-quality' },
    Icon: ClipboardCheck,
  },
  {
    label: 'Redundancy & Synergies',
    page: 'gov-redundancy',
    route: { page: 'gov-redundancy' },
    Icon: Layers,
  },
  {
    label: 'Governance Review Queue',
    page: 'gov-similarity',
    route: { page: 'gov-similarity' },
    Icon: Sparkles,
  },
  {
    label: 'Smart Excel Import',
    page: 'gov-imports',
    route: { page: 'gov-imports' },
    Icon: FileSpreadsheet,
  },
  {
    label: 'SharePoint & Entra',
    page: 'gov-diagnostics',
    route: { page: 'gov-diagnostics' },
    Icon: PlugZap,
  },
  {
    label: 'Settings & Demo Reset',
    page: 'gov-settings',
    route: { page: 'gov-settings' },
    Icon: Settings,
  },
];

function getBreadcrumbTitle(route: AppRoute): string {
  switch (route.page) {
    case 'home':
      return 'Employee Workspace / Home';
    case 'intake':
      return 'Employee Workspace / Register AI Initiative';
    case 'my-initiatives':
      return 'Employee Workspace / My Initiatives';
    case 'explore':
      return 'Employee Workspace / Explore Portfolio';
    case 'detail':
      return 'Portfolio / Initiative Detail';
    case 'gov-overview':
      return 'AI Portfolio Management / Executive Overview';
    case 'gov-lifecycle':
      return 'AI Portfolio Management / Lifecycle Management';
    case 'gov-savings':
      return 'AI Portfolio Management / Financial Management & AI Costs';
    case 'gov-savings-quality':
      return 'AI Portfolio Management / Savings Data Quality';
    case 'gov-redundancy':
      return 'AI Portfolio Management / Redundancy & Synergies';
    case 'gov-redundancy-case':
      return 'AI Portfolio Management / Redundancy & Synergy Case Detail';
    case 'gov-similarity':
      return 'AI Portfolio Management / Portfolio Review Queue';
    case 'gov-imports':
      return 'AI Portfolio Management / Smart Excel & CSV Import';
    case 'gov-diagnostics':
      return 'AI Portfolio Management / SharePoint & Entra (Optional)';
    case 'gov-settings':
      return 'AI Portfolio Management / Settings & Demo Data';
  }
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    currentUser,
    users,
    switchUser,
    dataSourceMode,
    activeDataset,
    switchDataset,
    resetAllDemoData,
    route,
    navigate,
    toasts,
    dismissToast,
    presentationMode,
    setPresentationMode,
  } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const isGovernance = canAccessGovernanceWorkspace(currentUser);
  const canCreate =
    canCreateInitiative(currentUser) &&
    dataSourceMode !== 'SHAREPOINT_READ_ONLY';

  const handleNavClick = (next: AppRoute) => {
    navigate(next);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-white">
      <div>
        {/* Brand Block */}
        <div className="border-b border-slate-200 px-5 py-4 space-y-2">
          <AbbottLogoSlot variant="sidebar" />
          <div>
            <div className="text-base font-bold tracking-tight text-[#004F9F]">
              AAS AI Governance
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Enterprise Portfolio & Value Hub
            </div>
          </div>
        </div>

        {/* Employee Workspace Links */}
        <nav aria-label="Primary navigation" className="space-y-6 px-3 py-4">
          <div>
            <div className="px-2.5 pb-1.5 text-xs font-semibold text-slate-500">
              Employee Workspace
            </div>
            <ul className="space-y-0.5">
              {EMPLOYEE_NAV.map((item) => {
                const active = route.page === item.page;
                const disabled = item.page === 'intake' && !canCreate;
                return (
                  <li key={item.page}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleNavClick(item.route)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#004F9F] text-white'
                          : disabled
                            ? 'cursor-not-allowed text-slate-400'
                            : 'text-slate-700 hover:bg-[#EBF3FB]/70 hover:text-[#004F9F]'
                      }`}
                    >
                      <item.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* AI Portfolio Management Links */}
          <div>
            <div className="px-2.5 pb-1.5">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                AI Portfolio Management
              </span>
            </div>

            {isGovernance ? (
              <ul className="space-y-0.5">
                {GOVERNANCE_NAV.map((item) => {
                  const active =
                    route.page === item.page ||
                    (item.page === 'gov-redundancy' &&
                      route.page === 'gov-redundancy-case');
                  return (
                    <li key={item.page}>
                      <button
                        type="button"
                        onClick={() => handleNavClick(item.route)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#004F9F] text-white'
                            : 'text-slate-700 hover:bg-[#EBF3FB]/70 hover:text-[#004F9F]'
                        }`}
                      >
                        <item.Icon
                          className="h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mx-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  Switch to the <strong>Demo AI Portfolio Manager</strong>{' '}
                  profile in the header to access Executive Overview, Lifecycle
                  Analytics, Savings Data Quality, Excel Imports, and Redundancy Review.
                </p>
                <div className="mt-2 flex flex-col items-start gap-1">
                  <button
                    type="button"
                    onClick={() => handleNavClick({ page: 'gov-settings' })}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    Demo Dataset & Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavClick({ page: 'gov-diagnostics' })}
                    className="font-medium text-slate-600 hover:underline"
                  >
                    Optional SharePoint Diagnostics
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Data Source & Dataset Switcher */}
      <div className="space-y-3 border-t border-slate-200 p-4">
        {dataSourceMode === 'DEMO_LOCAL' && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="font-semibold text-slate-800">
              Active Demo Dataset
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Isolated local IndexedDB workspaces. Synthetic demo records never
              mix with imported real files.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => void switchDataset('SAMPLE_DEMO')}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  activeDataset === 'SAMPLE_DEMO'
                    ? 'bg-[#004F9F] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sample Demo
              </button>
              <button
                type="button"
                onClick={() => void switchDataset('IMPORTED_PORTFOLIO')}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  activeDataset === 'IMPORTED_PORTFOLIO'
                    ? 'bg-[#004F9F] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Imported Data
              </button>
            </div>
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Reset Demo Data</span>
            </button>
          </div>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {dataSourceMode === 'SHAREPOINT_READ_ONLY'
                ? 'SharePoint Lists (Read-Only)'
                : 'Demo Mode · IndexedDB'}
            </span>
          </div>
          <p className="mt-1 leading-relaxed text-slate-600">
            {dataSourceMode === 'SHAREPOINT_READ_ONLY'
              ? 'Reading via Microsoft Graph. Writes disabled until verified.'
              : 'Local persistent demo storage. No Entra, Azure SQL, or live AI calls.'}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div id="app-shell-root" className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (Hidden in presentationMode or print) */}
      {!presentationMode && (
        <aside className="no-print hidden w-[256px] shrink-0 border-r border-slate-200 bg-white lg:block">
          <div className="sticky top-0 h-screen overflow-y-auto">
            {renderSidebarContent()}
          </div>
        </aside>
      )}

      {/* Mobile Drawer */}
      {mobileMenuOpen && !presentationMode && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] overflow-y-auto border-r border-slate-200 bg-white">
            <div className="flex items-center justify-end border-b border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {presentationMode ? (
          <div className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2.5 text-xs">
            <div className="flex items-center gap-3 font-medium text-slate-700">
              <span className="font-bold text-slate-900">AAS AI Governance</span>
              <span>·</span>
              <span>Executive Presentation Mode</span>
              <span>·</span>
              <span>
                Dataset:{' '}
                {activeDataset === 'SAMPLE_DEMO'
                  ? 'Sample Demo Data'
                  : 'Imported Portfolio Data'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPresentationMode(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              Exit Presentation Mode
            </button>
          </div>
        ) : (
          <header className="no-print z-30 border-b border-slate-200 bg-white md:sticky md:top-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open navigation menu"
                  className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
                >
                  <Menu className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="truncate text-xs font-medium text-slate-700 sm:text-sm">
                  {getBreadcrumbTitle(route)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Visible Demo Mode + Active Dataset Indicator */}
                {dataSourceMode === 'DEMO_LOCAL' && (
                  <span className="hidden items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 xl:inline-flex whitespace-nowrap">
                    <span>Demo Mode (IndexedDB)</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {activeDataset === 'SAMPLE_DEMO'
                        ? 'Sample Demo'
                        : 'Imported Data'}
                    </span>
                  </span>
                )}

                {/* Demo Role / User Switcher with explicit Not-Auth warning */}
                <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <UserCheck
                    className="h-4 w-4 shrink-0 text-slate-600"
                    aria-hidden="true"
                  />
                  <label htmlFor="demo-role-switcher" className="sr-only">
                    Demo role and user switcher (not authentication)
                  </label>
                  <select
                    id="demo-role-switcher"
                    value={currentUser.id}
                    onChange={(e) => switchUser(e.target.value)}
                    className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
                  >
                    {users.map((u) => {
                      const roleLabel =
                        u.role === UserRole.GOVERNANCE
                          ? 'Demo AI Portfolio Manager'
                          : u.role === UserRole.EMPLOYEE
                            ? 'Demo Employee'
                            : 'Admin (Reserved)';
                      return (
                        <option key={u.id} value={u.id}>
                          {u.displayName} — {roleLabel}
                        </option>
                      );
                    })}
                  </select>
                  <span
                    title="Simulated demo role switcher only — not production authentication"
                    className="hidden text-[11px] font-medium text-amber-700 sm:inline whitespace-nowrap"
                  >
                    Simulated Role
                  </span>
                </div>

                {canCreate && (
                  <button
                    type="button"
                    onClick={() => navigate({ page: 'intake' })}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#003D7A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004F9F] whitespace-nowrap shrink-0"
                  >
                    <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Register AI Initiative</span>
                  </button>
                )}
              </div>
            </div>

            {dataSourceMode === 'SHAREPOINT_READ_ONLY' && (
              <div className="border-t border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-950 sm:px-6">
                <strong>SharePoint Read-Only Mode:</strong> Reading SharePoint
                Lists via Microsoft Graph. Writes remain disabled until column
                mappings and permissions are verified.
              </div>
            )}

            {currentUser.role === UserRole.ADMIN && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
                <strong>Admin Role Selected:</strong> Reserved for future
                configuration. Switch to Demo Employee or Demo AI Portfolio Manager
                to test portfolio workflows.
              </div>
            )}
          </header>
        )}

        {/* Viewport Content */}
        <main
          className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 ${
            presentationMode ? 'max-w-[1440px]' : 'max-w-[1280px]'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Toast Region */}
      {toasts.length > 0 && !presentationMode && (
        <div
          aria-live="polite"
          className="no-print fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start justify-between gap-3 rounded-md border bg-white p-3.5 shadow-md ${
                t.tone === 'error'
                  ? 'border-red-300'
                  : t.tone === 'success'
                    ? 'border-emerald-300'
                    : 'border-slate-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {t.tone === 'error' ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                ) : t.tone === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                )}
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {t.title}
                  </div>
                  {t.detail && (
                    <div className="mt-0.5 text-xs text-slate-600">
                      {t.detail}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Reset Demo Data to Seed Baseline?"
        description="This restores the IndexedDB Sample Demo portfolio, financials, AI costs, and redundancy reviews to initial baseline and clears the Imported Data workspace."
      >
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setResetModalOpen(false)}
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              await resetAllDemoData();
              setResetModalOpen(false);
            }}
            className="rounded-md bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800"
          >
            Confirm Reset
          </button>
        </div>
      </Modal>
    </div>
  );
};
