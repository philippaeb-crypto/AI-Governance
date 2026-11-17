import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  buildImportErrorsCsv,
  ColumnMappingSuggestion,
  COST_IMPORT_FIELD_LABELS,
  CostImportField,
  suggestCostColumnMappings,
  validateAndNormalizeCostImportBatch,
} from '../../domain/excelImport';
import {
  calculateCostCenterNetBenefits,
  calculateDepartmentWaterfalls,
  calculatePlatformSpendAndTokens,
  calculatePortfolioFinancialDashboard,
  collectAvailableReportingYears,
} from '../../domain/financials';
import {
  AI_PLATFORMS,
  AiCostPlanEntry,
  AiCostTransaction,
  BENEFIT_TYPE_LABELS,
  BenefitEntry,
  BenefitEvidenceStatus,
  BenefitType,
  COST_CATEGORY_LABELS,
  CostCategory,
  ForecastMissingRule,
  Initiative,
  SpendType,
} from '../../domain/types';
import { CostTrendChart } from '../../components/charts/CostTrendChart';
import { WaterfallChart } from '../../components/charts/WaterfallChart';
import { Modal } from '../../components/Modal';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import {
  downloadSampleCostsWorkbook,
  extractWorksheetRows,
  ParsedWorksheetData,
  parseLocalSpreadsheetFile,
  triggerCsvDownload,
} from '../../services/excelParser';
import { useApp } from '../../services/appContext';
import { CostPlanningWorkspace } from './CostPlanningWorkspace';

function eur(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}€${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export type FinancialWorkspaceTab =
  | 'overview'
  | 'cost-planning'
  | 'cost-plan-import';

export const FinancialManagementScreen: React.FC<{
  initialTab?: FinancialWorkspaceTab;
}> = ({ initialTab = 'overview' }) => {
  const {
    repository,
    currentUser,
    departments,
    activeDataset,
    dataRevision,
    bumpDataRevision,
    notify,
  } = useApp();

  const [activeTab, setActiveTab] = useState<FinancialWorkspaceTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [benefits, setBenefits] = useState<BenefitEntry[]>([]);
  const [costs, setCosts] = useState<AiCostTransaction[]>([]);
  const [costPlans, setCostPlans] = useState<AiCostPlanEntry[]>([]);
  const [reportingYear, setReportingYear] = useState<number>(2026);
  const [forecastMissingRule, setForecastMissingRule] =
    useState<ForecastMissingRule>('FLAG_MISSING');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Manual Benefit Modal
  const [benefitModalOpen, setBenefitModalOpen] = useState(false);
  const [benForm, setBenForm] = useState({
    initiativeId: '',
    departmentId: '',
    costCenter: '',
    benefitType: BenefitType.CASH_SAVINGS,
    estimatedAmountEur: '15000',
    realizedAmountEur: '0',
    period: '2026-11',
    description: '',
    evidenceStatus: 'VERIFIED' as BenefitEvidenceStatus,
  });

  // Manual Cost Modal
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costForm, setCostForm] = useState({
    departmentId: '',
    costCenter: '',
    period: '2026-11',
    platform: AI_PLATFORMS[0] as string,
    costCategory: CostCategory.TOKENS_API,
    spendType: 'ACTUAL' as SpendType,
    amountEur: '1200',
    tokens: '2500000',
    note: '',
  });

  // Cost Excel Import Modal
  const [costImportOpen, setCostImportOpen] = useState(false);
  const [costFileName, setCostFileName] = useState('');
  const [costSheetName, setCostSheetName] = useState('');
  const [costSheetData, setCostSheetData] = useState<ParsedWorksheetData | null>(
    null
  );
  const [costMappings, setCostMappings] = useState<
    ColumnMappingSuggestion<CostImportField>[]
  >([]);

  const loadFinancialData = React.useCallback(async () => {
    const [inits, bens, costList, planList] = await Promise.all([
      repository.listInitiatives(),
      repository.listBenefits(),
      repository.listCostTransactions(),
      repository.listCostPlans(),
    ]);
    setInitiatives(inits);
    setBenefits(bens);
    setCosts(costList);
    setCostPlans(planList);
    const years = collectAvailableReportingYears({
      costPlans: planList,
      costs: costList,
      benefits: bens,
      fallbackYear: 2026,
    });
    if (years.length > 0 && !years.includes(reportingYear)) {
      setReportingYear(years[0]);
    }
  }, [repository, reportingYear]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [inits, bens, costList, planList] = await Promise.all([
          repository.listInitiatives(),
          repository.listBenefits(),
          repository.listCostTransactions(),
          repository.listCostPlans(),
        ]);
        if (!active) return;
        setInitiatives(inits);
        setBenefits(bens);
        setCosts(costList);
        setCostPlans(planList);
        const years = collectAvailableReportingYears({
          costPlans: planList,
          costs: costList,
          benefits: bens,
          fallbackYear: 2026,
        });
        if (years.length > 0 && !years.includes(reportingYear)) {
          setReportingYear(years[0]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [repository, dataRevision]);

  const availableYears = useMemo(
    () =>
      collectAvailableReportingYears({
        costPlans,
        costs,
        benefits,
        fallbackYear: 2026,
      }),
    [costPlans, costs, benefits]
  );

  const financialOverview = useMemo(
    () =>
      calculatePortfolioFinancialDashboard({
        departments,
        initiatives,
        benefits,
        costs,
        costPlans,
        reportingYear,
        forecastMissingRule,
      }),
    [
      departments,
      initiatives,
      benefits,
      costs,
      costPlans,
      reportingYear,
      forecastMissingRule,
    ]
  );

  const summary = financialOverview.summary;

  const yearCostPlans = useMemo(
    () => costPlans.filter((p) => p.planningYear === reportingYear),
    [costPlans, reportingYear]
  );

  const yearBenefits = useMemo(
    () => benefits.filter((b) => b.period.startsWith(`${reportingYear}-`)),
    [benefits, reportingYear]
  );

  const yearCosts = useMemo(
    () => costs.filter((c) => c.period.startsWith(`${reportingYear}-`)),
    [costs, reportingYear]
  );

  const waterfalls = useMemo(
    () =>
      calculateDepartmentWaterfalls({
        departments,
        benefits: yearBenefits,
        costs: yearCosts,
        costPlans: yearCostPlans,
      }),
    [departments, yearBenefits, yearCosts, yearCostPlans]
  );

  const costCenterRows = useMemo(
    () =>
      calculateCostCenterNetBenefits({
        departments,
        benefits: yearBenefits,
        costs: yearCosts,
      }),
    [departments, yearBenefits, yearCosts]
  );

  const monthlyTrends = useMemo(
    () =>
      financialOverview.monthlyBudgetForecastActual.map((pt) => ({
        period: pt.period,
        plannedEur: pt.plannedEur,
        forecastEur: pt.forecastEur,
        actualEur: pt.actualEur,
        tokens: pt.tokens,
      })),
    [financialOverview.monthlyBudgetForecastActual]
  );

  const platformSpend = useMemo(
    () => calculatePlatformSpendAndTokens(yearCosts, yearCostPlans),
    [yearCosts, yearCostPlans]
  );

  const costValidation = useMemo(() => {
    if (!costSheetData) return { validRows: [], invalidRows: [], allRows: [] };
    return validateAndNormalizeCostImportBatch({
      rows: costSheetData.rows,
      mappings: costMappings,
      departments,
    });
  }, [costSheetData, costMappings, departments]);

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;
  const initTitle = (id: string) =>
    initiatives.find((i) => i.id === id)?.title ?? id;

  const handleSaveBenefit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await repository.saveBenefit(
        {
          initiativeId: benForm.initiativeId || initiatives[0]?.id || '',
          departmentId: benForm.departmentId || departments[0]?.id || '',
          costCenter: benForm.costCenter || undefined,
          benefitType: benForm.benefitType,
          estimatedAmountEur: Number(benForm.estimatedAmountEur),
          realizedAmountEur: Number(benForm.realizedAmountEur),
          period: benForm.period,
          description: benForm.description || 'AI Portfolio Manager recorded benefit',
          evidenceStatus: benForm.evidenceStatus,
        },
        currentUser
      );
      setBenefitModalOpen(false);
      await bumpDataRevision();
      notify('success', 'Benefit entry saved');
    } catch (err) {
      notify(
        'error',
        'Unable to save benefit',
        err instanceof Error ? err.message : 'Validation failed'
      );
    }
  };

  const handleSaveCost = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await repository.saveCostTransaction(
        {
          departmentId: costForm.departmentId || departments[0]?.id || '',
          costCenter: costForm.costCenter || 'CC-1040',
          period: costForm.period,
          platform: costForm.platform,
          costCategory: costForm.costCategory,
          spendType: costForm.spendType,
          amountEur: Number(costForm.amountEur),
          tokens: Number(costForm.tokens),
          note: costForm.note,
        },
        currentUser
      );
      setCostModalOpen(false);
      await bumpDataRevision();
      notify('success', 'AI cost transaction recorded');
    } catch (err) {
      notify(
        'error',
        'Unable to save cost',
        err instanceof Error ? err.message : 'Validation failed'
      );
    }
  };

  const handleCostFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const wb = await parseLocalSpreadsheetFile(file);
      const firstSheet = wb.sheetNames[0];
      const data = extractWorksheetRows(wb.workbook, firstSheet);
      setCostFileName(wb.fileName);
      setCostSheetName(firstSheet);
      setCostSheetData(data);
      setCostMappings(suggestCostColumnMappings(data.headers));
    } catch (err) {
      notify(
        'error',
        'Failed to parse cost spreadsheet',
        err instanceof Error ? err.message : 'Invalid file'
      );
    }
  };

  const handleCommitCostImport = async () => {
    if (!costSheetData || costValidation.validRows.length === 0) return;
    try {
      const batch = await repository.commitCostImportBatch({
        fileName: costFileName,
        worksheetName: costSheetName,
        targetDataset: activeDataset,
        rows: costValidation.validRows,
        actor: currentUser,
      });
      setCostImportOpen(false);
      await bumpDataRevision();
      notify(
        'success',
        'AI Cost Import Committed',
        `${batch.createdCount} transactions added, ${batch.skippedCount} duplicate rows skipped.`
      );
    } catch (err) {
      notify(
        'error',
        'Cost import rejected',
        err instanceof Error ? err.message : 'Unable to commit cost batch'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Savings, Costs &amp; AI Cost Planning
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Separates non-cash efficiency equivalents from realized Cash Savings
            and Cost Avoidance without double counting. Manages Annual AI
            Budgets &amp; Forecasts separately from Actual AI Spend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {availableYears.length > 0 && (
            <select
              aria-label="Reporting Year"
              value={reportingYear}
              onChange={(e) => setReportingYear(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800"
            >
              {Array.from(new Set([...availableYears, reportingYear, reportingYear + 1]))
                .sort((a, b) => b - a)
                .map((yr) => (
                  <option key={yr} value={yr}>
                    FY {yr}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => {
              const defDept = departments[0]?.id ?? '';
              setBenForm((f) => ({
                ...f,
                initiativeId: initiatives[0]?.id ?? '',
                departmentId: defDept,
              }));
              setBenefitModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add Benefit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const defDept = departments[0];
              setCostForm((f) => ({
                ...f,
                departmentId: defDept?.id ?? '',
                costCenter: defDept?.costCenter ?? 'CC-1040',
              }));
              setCostModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add Actual Cost</span>
          </button>
          <button
            type="button"
            onClick={() => setCostImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Import Actual Costs</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div
        className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2"
        role="tablist"
        aria-label="Financial Management Sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'overview'
              ? 'bg-[#004F9F] text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Overview &amp; Ledgers</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cost-planning'}
          onClick={() => setActiveTab('cost-planning')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'cost-planning'
              ? 'bg-[#004F9F] text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>AI Cost Planning ({yearCostPlans.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cost-plan-import'}
          onClick={() => setActiveTab('cost-plan-import')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'cost-plan-import'
              ? 'bg-[#004F9F] text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Cost Plan Import (5-Step)</span>
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : activeTab !== 'overview' ? (
        <CostPlanningWorkspace
          departments={departments}
          costPlans={costPlans}
          actualCostCount={costs.length}
          financialOverview={financialOverview}
          reportingYear={reportingYear}
          onReportingYearChange={setReportingYear}
          availableYears={availableYears}
          forecastMissingRule={forecastMissingRule}
          onForecastMissingRuleChange={setForecastMissingRule}
          onRefresh={async () => {
            await bumpDataRevision();
            await loadFinancialData();
          }}
          initialMode={activeTab === 'cost-plan-import' ? 'import' : 'plans'}
          onModeChange={(m) =>
            setActiveTab(m === 'import' ? 'cost-plan-import' : 'cost-planning')
          }
        />
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">
                Annual Hours Saved
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {Math.round(summary.annualHoursSaved).toLocaleString('en-US')} hrs
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Efficiency initiatives only
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">
                Est. Efficiency Value (Non-Cash)
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {eur(summary.estimatedEfficiencyValueEur)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Separated ({summary.efficiencyInitiativesWithRateCount} with
                rate, {summary.efficiencyInitiativesMissingRateCount} missing)
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">
                Realized Financial Benefits ({reportingYear})
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                {eur(summary.realizedFinancialBenefitsEur)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Cash {eur(summary.realizedCashSavingsEur)} + Avoidance{' '}
                {eur(summary.realizedCostAvoidanceEur)}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">
                Actual AI Costs vs Budget ({reportingYear})
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {eur(summary.actualAiCostsEur)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Annual Budget: {eur(financialOverview.annualBudgetEur)} · Forecast:{' '}
                {financialOverview.annualForecastEur !== null
                  ? eur(financialOverview.annualForecastEur)
                  : 'N/A'}{' '}
                ({financialOverview.forecastCoveredMonthsCount}/12 mo)
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">
                Net Financial Benefit ({reportingYear})
              </div>
              <div
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  summary.netFinancialBenefitEur >= 0
                    ? 'text-slate-900'
                    : 'text-red-700'
                }`}
              >
                {eur(summary.netFinancialBenefitEur)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {financialOverview.periodLabel} YTD Actual{' '}
                {eur(financialOverview.ytdActualEur)} vs Plan{' '}
                {eur(financialOverview.ytdBudgetEur)}
              </div>
            </div>
          </div>

          {/* Non-Cash Quality & Strategic Benefits Disclosure */}
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
            <strong>Non-Cash Value Categories (Not Double-Counted):</strong>{' '}
            Quality Improvements (Est. {eur(summary.qualityBenefitsEstimatedEur)}{' '}
            / Realized {eur(summary.qualityBenefitsRealizedEur)}) · Strategic
            Benefits (Est. {eur(summary.strategicBenefitsEstimatedEur)} /
            Realized {eur(summary.strategicBenefitsRealizedEur)}) · Estimated
            Efficiency Value ({eur(summary.estimatedEfficiencyValueEur)}) are
            tracked separately from Net Financial Benefit.
          </div>

          {/* Department Net Financial Waterfall + Monthly Cost Trends */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Department Net Financial Benefit Waterfall ({reportingYear})
              </h2>
              <p className="mt-0.5 mb-4 text-xs text-slate-500">
                Cash Savings + Cost Avoidance − Incremental AI Costs by
                department.
              </p>
              <WaterfallChart rows={waterfalls} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {reportingYear} Monthly AI Spend: Planned, Forecast &amp;
                  Actual
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('cost-planning')}
                  className="text-xs font-medium text-[#004F9F] hover:underline"
                >
                  Open Cost Planning
                </button>
              </div>
              <p className="mt-0.5 mb-4 text-xs text-slate-500">
                Budget &amp; Forecast from Cost Plans ({yearCostPlans.length}{' '}
                rows, {financialOverview.forecastCoveredMonthsCount}/12 mo
                forecast) vs Actual Cost Ledger.
              </p>
              <CostTrendChart points={monthlyTrends} />
            </section>
          </div>

          {/* Cost-Center Attribution Governance Table */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Cost-Center Net Financial Benefit (Strict Attribution Rule)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Net financial benefit is computed at cost-center granularity{' '}
              <strong>only</strong> when realized Cash Savings or Cost Avoidance
              entries are explicitly attributed to that cost center. Unattributed
              cost centers display AI spend only.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Cost Center</th>
                    <th className="py-2 pr-3">Department</th>
                    <th className="py-2 pr-3 text-right">Realized Cash + Avoidance</th>
                    <th className="py-2 pr-3 text-right">Actual AI Costs</th>
                    <th className="py-2 pr-3 text-right">Tokens</th>
                    <th className="py-2 text-right">Cost-Center Net Benefit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {costCenterRows.map((row) => (
                    <tr key={row.costCenter}>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                        {row.costCenter}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">
                        {row.departmentName}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                        {row.hasAttributedBenefits
                          ? eur(row.cashSavingsEur + row.costAvoidanceEur)
                          : 'Not attributed'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-900">
                        {eur(row.actualAiCostsEur)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">
                        {row.totalTokens.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {row.netFinancialBenefitEur !== null ? (
                          <span
                            className={`font-semibold ${
                              row.netFinancialBenefitEur >= 0
                                ? 'text-emerald-700'
                                : 'text-red-700'
                            }`}
                          >
                            {eur(row.netFinancialBenefitEur)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            Cost-only (no attributed benefits)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {costCenterRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No cost centers recorded in active dataset.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Platform Spend & Token Summary + Benefits Ledger */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Platform Spend & Tokens
              </h2>
              <div className="mt-3 divide-y divide-slate-200 text-xs">
                {platformSpend.map((p) => (
                  <div
                    key={p.platform}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {p.platform}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {(p.tokens / 1_000_000).toFixed(2)}M tokens · Planned{' '}
                        {eur(p.plannedEur)}
                      </div>
                    </div>
                    <div className="font-semibold text-slate-900 tabular-nums">
                      {eur(p.actualEur)}
                    </div>
                  </div>
                ))}
                {platformSpend.length === 0 && (
                  <div className="py-4 text-slate-500">No spend recorded.</div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Benefits Ledger (Estimated vs Realized)
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3">Initiative / Dept</th>
                      <th className="py-2 pr-3">Benefit Type</th>
                      <th className="py-2 pr-3">Cost Center</th>
                      <th className="py-2 pr-3 text-right">Estimated</th>
                      <th className="py-2 pr-3 text-right">Realized</th>
                      <th className="py-2 text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {benefits.map((b) => (
                      <tr key={b.id}>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-900">
                            {initTitle(b.initiativeId)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {deptName(b.departmentId)} · {b.period}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {BENEFIT_TYPE_LABELS[b.benefitType]}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">
                          {b.costCenter || 'Dept-only'}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                          {eur(b.estimatedAmountEur)}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums text-slate-900">
                          <div>{eur(b.realizedAmountEur)}</div>
                          {b.realizedAmountEur > 0 && (
                            <div className="text-[10px] font-medium text-slate-500">
                              {b.evidenceStatus ?? 'UNVERIFIED'}
                            </div>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            aria-label={`Delete benefit ${b.id}`}
                            onClick={async () => {
                              await repository.deleteBenefit(b.id, currentUser);
                              await bumpDataRevision();
                              notify('info', 'Benefit entry removed');
                            }}
                            className="rounded p-1 text-slate-400 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {benefits.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-5 text-center text-slate-500">
                          No benefit entries recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Monthly AI Cost Transactions Ledger */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Monthly AI Cost Ledger ({costs.length} transactions)
              </h2>
              <button
                type="button"
                onClick={downloadSampleCostsWorkbook}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download Sample Costs Excel (.xlsx)</span>
              </button>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3">Department / CC</th>
                    <th className="py-2 pr-3">Platform / Category</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3 text-right">Tokens</th>
                    <th className="py-2 pr-3 text-right">Amount (EUR)</th>
                    <th className="py-2 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {costs.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-mono tabular-nums text-slate-700">
                        {c.period}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-900">
                          {deptName(c.departmentId)}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {c.costCenter}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="text-slate-900">{c.platform}</div>
                        <div className="text-[11px] text-slate-500">
                          {COST_CATEGORY_LABELS[c.costCategory]}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-700">
                        {c.spendType}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                        {c.tokens.toLocaleString('en-US')}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums text-slate-900">
                        {eur(c.amountEur)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          aria-label={`Delete cost ${c.id}`}
                          onClick={async () => {
                            await repository.deleteCostTransaction(
                              c.id,
                              currentUser
                            );
                            await bumpDataRevision();
                            notify('info', 'Cost entry removed');
                          }}
                          className="rounded p-1 text-slate-400 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Add Benefit Modal */}
      <Modal
        open={benefitModalOpen}
        onClose={() => setBenefitModalOpen(false)}
        title="Record Financial or Non-Cash Benefit"
        description="Separate Estimated vs Realized EUR amounts. Attribute a Cost Center only when directly verifiable."
      >
        <form onSubmit={handleSaveBenefit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700">Initiative</label>
            <select
              value={benForm.initiativeId}
              onChange={(e) => {
                const chosen = initiatives.find((i) => i.id === e.target.value);
                setBenForm({
                  ...benForm,
                  initiativeId: e.target.value,
                  departmentId: chosen?.departmentId ?? benForm.departmentId,
                });
              }}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
            >
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700">
                Benefit Type
              </label>
              <select
                value={benForm.benefitType}
                onChange={(e) =>
                  setBenForm({
                    ...benForm,
                    benefitType: e.target.value as BenefitType,
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {Object.values(BenefitType).map((bt) => (
                  <option key={bt} value={bt}>
                    {BENEFIT_TYPE_LABELS[bt]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Cost Center (Optional)
              </label>
              <input
                type="text"
                value={benForm.costCenter}
                onChange={(e) =>
                  setBenForm({ ...benForm, costCenter: e.target.value })
                }
                placeholder="e.g. CC-1040 or leave blank"
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700">
                Estimated (EUR)
              </label>
              <input
                type="number"
                min={0}
                value={benForm.estimatedAmountEur}
                onChange={(e) =>
                  setBenForm({ ...benForm, estimatedAmountEur: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Realized (EUR)
              </label>
              <input
                type="number"
                min={0}
                value={benForm.realizedAmountEur}
                onChange={(e) =>
                  setBenForm({ ...benForm, realizedAmountEur: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Period
              </label>
              <input
                type="text"
                value={benForm.period}
                onChange={(e) =>
                  setBenForm({ ...benForm, period: e.target.value })
                }
                placeholder="YYYY-MM"
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700">
              Evidence Verification Status
            </label>
            <select
              value={benForm.evidenceStatus}
              onChange={(e) =>
                setBenForm({
                  ...benForm,
                  evidenceStatus: e.target.value as BenefitEvidenceStatus,
                })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="VERIFIED">VERIFIED (Controlling Signed Off)</option>
              <option value="DOCUMENTED">DOCUMENTED (Supporting Docs Attached)</option>
              <option value="PENDING">PENDING (Requires Review)</option>
              <option value="NONE">NONE (Not Yet Substantiated)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700">
              Description
            </label>
            <input
              type="text"
              value={benForm.description}
              onChange={(e) =>
                setBenForm({ ...benForm, description: e.target.value })
              }
              placeholder="Basis of benefit measurement..."
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBenefitModalOpen(false)}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-slate-900 px-3.5 py-1.5 font-medium text-white"
            >
              Save Benefit
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Cost Entry Modal */}
      <Modal
        open={costModalOpen}
        onClose={() => setCostModalOpen(false)}
        title="Add Monthly AI Cost Entry"
      >
        <form onSubmit={handleSaveCost} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700">
                Department
              </label>
              <select
                value={costForm.departmentId}
                onChange={(e) => {
                  const d = departments.find((x) => x.id === e.target.value);
                  setCostForm({
                    ...costForm,
                    departmentId: e.target.value,
                    costCenter: d?.costCenter ?? costForm.costCenter,
                  });
                }}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Cost Center
              </label>
              <input
                type="text"
                value={costForm.costCenter}
                onChange={(e) =>
                  setCostForm({ ...costForm, costCenter: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700">
                Platform
              </label>
              <select
                value={costForm.platform}
                onChange={(e) =>
                  setCostForm({ ...costForm, platform: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {AI_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Cost Category
              </label>
              <select
                value={costForm.costCategory}
                onChange={(e) =>
                  setCostForm({
                    ...costForm,
                    costCategory: e.target.value as CostCategory,
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {Object.values(CostCategory).map((cc) => (
                  <option key={cc} value={cc}>
                    {COST_CATEGORY_LABELS[cc]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block font-semibold text-slate-700">
                Spend Type
              </label>
              <select
                value={costForm.spendType}
                onChange={(e) =>
                  setCostForm({
                    ...costForm,
                    spendType: e.target.value as SpendType,
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5"
              >
                <option value="ACTUAL">ACTUAL</option>
                <option value="PLANNED">PLANNED</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Period
              </label>
              <input
                type="text"
                value={costForm.period}
                onChange={(e) =>
                  setCostForm({ ...costForm, period: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Amount (EUR)
              </label>
              <input
                type="number"
                min={0}
                value={costForm.amountEur}
                onChange={(e) =>
                  setCostForm({ ...costForm, amountEur: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700">
                Tokens
              </label>
              <input
                type="number"
                min={0}
                value={costForm.tokens}
                onChange={(e) =>
                  setCostForm({ ...costForm, tokens: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 tabular-nums"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCostModalOpen(false)}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-slate-900 px-3.5 py-1.5 font-medium text-white"
            >
              Save Cost
            </button>
          </div>
        </form>
      </Modal>

      {/* AI Cost Excel/CSV Import Modal */}
      <Modal
        open={costImportOpen}
        onClose={() => setCostImportOpen(false)}
        title="Import Monthly AI Costs (Excel / CSV)"
        description="Local SheetJS parsing with column mapping, row validation, and duplicate skip protection."
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" />
              <span>Choose .xlsx or .csv</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleCostFileSelect}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={downloadSampleCostsWorkbook}
              className="font-medium text-blue-700 hover:underline"
            >
              Download Sample Cost Workbook
            </button>
          </div>

          {costSheetData && (
            <>
              <div className="rounded border border-slate-200 bg-slate-50 p-2.5">
                <strong>{costFileName}</strong> ({costSheetName}) ·{' '}
                {costValidation.validRows.length} valid /{' '}
                {costValidation.invalidRows.length} invalid rows
              </div>

              <div className="max-h-40 overflow-y-auto rounded border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5">Header</th>
                      <th className="px-2 py-1.5">Target Cost Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {costMappings.map((m) => (
                      <tr key={m.sourceHeader}>
                        <td className="px-2 py-1 font-medium">
                          {m.sourceHeader}
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={m.targetField}
                            onChange={(e) =>
                              setCostMappings((prev) =>
                                prev.map((x) =>
                                  x.sourceHeader === m.sourceHeader
                                    ? {
                                        ...x,
                                        targetField: e.target
                                          .value as CostImportField,
                                      }
                                    : x
                                )
                              )
                            }
                            className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5"
                          >
                            {(
                              Object.keys(
                                COST_IMPORT_FIELD_LABELS
                              ) as CostImportField[]
                            ).map((f) => (
                              <option key={f} value={f}>
                                {COST_IMPORT_FIELD_LABELS[f]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {costValidation.invalidRows.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    triggerCsvDownload(
                      'aas_cost_import_errors.csv',
                      buildImportErrorsCsv(
                        costValidation.invalidRows.map((r) => ({
                          rowIndex: r.rowIndex,
                          identifier: r.costCenter || `Row ${r.rowIndex}`,
                          errors: r.errors,
                        }))
                      )
                    )
                  }
                  className="text-red-700 underline"
                >
                  Download {costValidation.invalidRows.length} Error Row(s) CSV
                </button>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCostImportOpen(false)}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!costSheetData || costValidation.validRows.length === 0}
              onClick={handleCommitCostImport}
              className="rounded bg-slate-900 px-3.5 py-1.5 font-medium text-white disabled:opacity-50"
            >
              Commit {costValidation.validRows.length} Cost Row(s)
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
