/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppShell } from './components/AppShell';
import { canAccessGovernanceWorkspace } from './domain/authorization';
import { ExplorePortfolioScreen } from './features/employee/ExplorePortfolioScreen';
import { HomeScreen } from './features/employee/HomeScreen';
import { MyInitiativesScreen } from './features/employee/MyInitiativesScreen';
import { SmartIntakeWizard } from './features/employee/SmartIntakeWizard';
import { ConnectionDiagnosticsScreen } from './features/governance/ConnectionDiagnosticsScreen';
import { ExecutiveOverviewScreen } from './features/governance/ExecutiveOverviewScreen';
import { FinancialManagementScreen } from './features/governance/FinancialManagementScreen';
import { LifecycleManagementScreen } from './features/governance/LifecycleManagementScreen';
import { RedundancyCaseDetailScreen } from './features/governance/RedundancyCaseDetailScreen';
import { RedundancySynergyScreen } from './features/governance/RedundancySynergyScreen';
import { SavingsDataQualityScreen } from './features/governance/SavingsDataQualityScreen';
import { SettingsScreen } from './features/governance/SettingsScreen';
import { SmartExcelImportScreen } from './features/governance/SmartExcelImportScreen';
import { InitiativeDetailScreen } from './features/shared/InitiativeDetailScreen';
import { AppProvider, useApp } from './services/appContext';

const ActiveScreen: React.FC = () => {
  const { route, currentUser, navigate } = useApp();
  const isGovernance = canAccessGovernanceWorkspace(currentUser);

  switch (route.page) {
    case 'home':
      return <HomeScreen />;
    case 'intake':
      return <SmartIntakeWizard />;
    case 'my-initiatives':
      return <MyInitiativesScreen />;
    case 'explore':
      return <ExplorePortfolioScreen />;
    case 'detail':
      return (
        <InitiativeDetailScreen
          initiativeId={route.initiativeId}
          startInEditMode={route.startInEditMode}
        />
      );
    case 'gov-overview':
      return isGovernance ? (
        <ExecutiveOverviewScreen />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-lifecycle':
      return isGovernance ? (
        <LifecycleManagementScreen />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-savings':
      return isGovernance ? (
        <FinancialManagementScreen initialTab={route.initialTab} />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-savings-quality':
      return isGovernance ? (
        <SavingsDataQualityScreen />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-redundancy':
      return isGovernance ? (
        <RedundancySynergyScreen initialTab={route.initialTab ?? 'cases'} />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-redundancy-case':
      return isGovernance ? (
        <RedundancyCaseDetailScreen
          caseId={route.caseId}
          returnTab={route.returnTab}
        />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-similarity':
      return isGovernance ? (
        <RedundancySynergyScreen initialTab="queue" />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-imports':
      return isGovernance ? (
        <SmartExcelImportScreen />
      ) : (
        <GovernanceRestrictedFallback onBack={() => navigate({ page: 'home' })} />
      );
    case 'gov-diagnostics':
      return <ConnectionDiagnosticsScreen />;
    case 'gov-settings':
      return <SettingsScreen />;
  }
};

const GovernanceRestrictedFallback: React.FC<{ onBack: () => void }> = ({
  onBack,
}) => (
  <div className="rounded-lg border border-slate-200 bg-white p-6">
    <h1 className="text-lg font-semibold text-slate-900">
      Demo AI Portfolio Manager Role Required
    </h1>
    <p className="mt-1 text-sm text-slate-600">
      AI Portfolio Management screens are restricted to users with the AI Portfolio
      Manager role. Use the Simulated Role Switcher in the top header to switch to
      Elena Vance — Demo AI Portfolio Manager.
    </p>
    <button
      type="button"
      onClick={onBack}
      className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
    >
      Return to Home
    </button>
  </div>
);

export default function App() {
  return (
    <AppProvider>
      <AppShell>
        <ActiveScreen />
      </AppShell>
    </AppProvider>
  );
}
