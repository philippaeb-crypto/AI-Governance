import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ClipboardCheck,
  Info,
  Presentation,
  Printer,
} from 'lucide-react';
import {
  computeDevelopmentLeadTimeDays,
  computeLifecycleAnalytics,
  computePortfolioMetrics,
  computeProductionAgingDays,
  computeStageAgingDays,
} from '../../domain/calculations';
import {
  calculateDepartmentWaterfalls,
  calculatePlatformSpendAndTokens,
  calculatePortfolioFinancialDashboard,
  collectAvailableReportingYears,
} from '../../domain/financials';
import { computeRedundancyAnalysis } from '../../domain/redundancy';
import { computeRedundancyPortfolioMetrics } from '../../domain/redundancyWorkflow';
import { computeSavingsDataQualityReport } from '../../domain/savingsDataQuality';
import {
  AiCostPlanEntry,
  AiCostTransaction,
  BenefitEntry,
  BoardDecision,
  ForecastMissingRule,
  formatRedundancyStatusLabel,
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleEvent,
  LifecycleStatus,
  REDUNDANCY_DISPOSITION_LABELS,
  RedundancyAction,
  RedundancyCase,
  RedundancyReviewRecord,
} from '../../domain/types';
import { AbbottLogoSlot } from '../../components/AbbottLogoSlot';
import { CostTrendChart } from '../../components/charts/CostTrendChart';
import { LifecycleDistributionRedesignCharts } from '../../components/charts/LifecycleDistributionRedesignCharts';
import { WaterfallChart } from '../../components/charts/WaterfallChart';
import { ExecutivePresentationDeck } from '../../components/ExecutivePresentationDeck';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { useApp } from '../../services/appContext';

function eur(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}€${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export const ExecutiveOverviewScreen: React.FC = () => {
  const {
    repository,
    departments,
    users,
    redundancyDeadlineConfig,
    dataSourceMode,
    activeDataset,
    dataRevision,
    navigate,
    notify,
    presentationMode,
    setPresentationMode,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [benefits, setBenefits] = useState<BenefitEntry[]>([]);
  const [costs, setCosts] = useState<AiCostTransaction[]>([]);
  const [costPlans, setCostPlans] = useState<AiCostPlanEntry[]>([]);
  const [reviews, setReviews] = useState<RedundancyReviewRecord[]>([]);
  const [redundancyCases, setRedundancyCases] = useState<RedundancyCase[]>([]);
  const [redundancyActions, setRedundancyActions] = useState<RedundancyAction[]>([]);
  const [boardDecisions, setBoardDecisions] = useState<BoardDecision[]>([]);
  const [showActiveTooltip, setShowActiveTooltip] = useState(false);

  // Synced 4-Filter Dashboard Strip + Reporting Year / Missing Forecast Rule
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterLifecycle, setFilterLifecycle] = useState<LifecycleStatus | ''>('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [reportingYear, setReportingYear] = useState<number>(2026);
  const [forecastMissingRule, setForecastMissingRule] =
    useState<ForecastMissingRule>('FLAG_MISSING');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [
          inits,
          evts,
          bens,
          costList,
          planList,
          revs,
          rCases,
          rActions,
          bDecisions,
        ] = await Promise.all([
          repository.listInitiatives(),
          repository.listAllLifecycleEvents(),
          repository.listBenefits(),
          repository.listCostTransactions(),
          repository.listCostPlans(),
          repository.listRedundancyReviews(),
          repository.listRedundancyCases(),
          repository.listRedundancyActions(),
          repository.listBoardDecisions(),
        ]);
        if (!active) return;
        setInitiatives(inits);
        setEvents(evts);
        setBenefits(bens);
        setCosts(costList);
        setCostPlans(planList);
        setReviews(revs);
        setRedundancyCases(rCases);
        setRedundancyActions(rActions);
        setBoardDecisions(bDecisions);
        const years = collectAvailableReportingYears({
          costPlans: planList,
          costs: costList,
          benefits: bens,
          fallbackYear: 2026,
        });
        if (years.length > 0 && !years.includes(reportingYear)) {
          setReportingYear(years[0]);
        }
      } catch (err) {
        if (active) {
          notify(
            'error',
            'Unable to load executive overview',
            err instanceof Error ? err.message : 'Repository read failed.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [repository, dataRevision, notify]);

  const scopedPortfolio = useMemo(
    () => ({
      initiatives,
      benefits,
      costs,
      costPlans,
      scopedDepartments: departments,
    }),
    [initiatives, benefits, costs, costPlans, departments]
  );

  const scopeLabel = useMemo(() => {
    if (departments.length === 0) return 'Enterprise AI Portfolio';
    return `Active Portfolio (${departments.map((d) => d.name).join(', ')})`;
  }, [departments]);

  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    for (const c of scopedPortfolio.costs) if (c.period) set.add(c.period);
    for (const b of scopedPortfolio.benefits) if (b.period) set.add(b.period);
    return Array.from(set).sort().reverse();
  }, [scopedPortfolio.costs, scopedPortfolio.benefits]);

  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const i of scopedPortfolio.initiatives) {
      if (i.aiPlatform.trim()) set.add(i.aiPlatform.trim());
    }
    for (const c of scopedPortfolio.costs) {
      if (c.platform.trim()) set.add(c.platform.trim());
    }
    return Array.from(set).sort();
  }, [scopedPortfolio.initiatives, scopedPortfolio.costs]);

  const filteredInitiatives = useMemo(() => {
    return scopedPortfolio.initiatives.filter((i) => {
      if (filterDepartmentId && i.departmentId !== filterDepartmentId) return false;
      if (filterLifecycle && i.lifecycleStatus !== filterLifecycle) return false;
      if (filterPlatform && i.aiPlatform !== filterPlatform) return false;
      return true;
    });
  }, [
    scopedPortfolio.initiatives,
    filterDepartmentId,
    filterLifecycle,
    filterPlatform,
  ]);

  const filteredInitiativeIds = useMemo(
    () => new Set(filteredInitiatives.map((i) => i.id)),
    [filteredInitiatives]
  );

  const filteredBenefits = useMemo(() => {
    return scopedPortfolio.benefits.filter((b) => {
      if (filterDepartmentId && b.departmentId !== filterDepartmentId) return false;
      if (filterPeriod && b.period !== filterPeriod) return false;
      if (
        (filterLifecycle || filterPlatform) &&
        !filteredInitiativeIds.has(b.initiativeId)
      ) {
        return false;
      }
      return true;
    });
  }, [
    scopedPortfolio.benefits,
    filterDepartmentId,
    filterPeriod,
    filterLifecycle,
    filterPlatform,
    filteredInitiativeIds,
  ]);

  const filteredCosts = useMemo(() => {
    return scopedPortfolio.costs.filter((c) => {
      if (filterDepartmentId && c.departmentId !== filterDepartmentId) return false;
      if (filterPeriod && c.period !== filterPeriod) return false;
      if (filterPlatform && c.platform !== filterPlatform) return false;
      if (
        filterLifecycle &&
        c.initiativeId &&
        !filteredInitiativeIds.has(c.initiativeId)
      ) {
        return false;
      }
      return true;
    });
  }, [
    scopedPortfolio.costs,
    filterDepartmentId,
    filterPeriod,
    filterPlatform,
    filterLifecycle,
    filteredInitiativeIds,
  ]);

  const availableYears = useMemo(
    () =>
      collectAvailableReportingYears({
        costPlans: scopedPortfolio.costPlans,
        costs: scopedPortfolio.costs,
        benefits: scopedPortfolio.benefits,
        fallbackYear: 2026,
      }),
    [scopedPortfolio.costPlans, scopedPortfolio.costs, scopedPortfolio.benefits]
  );

  const filteredCostPlans = useMemo(() => {
    return scopedPortfolio.costPlans.filter((p) => {
      if (filterDepartmentId && p.departmentId !== filterDepartmentId) return false;
      if (filterPlatform && p.platform !== filterPlatform) return false;
      return true;
    });
  }, [scopedPortfolio.costPlans, filterDepartmentId, filterPlatform]);

  const activeDepartments = useMemo(
    () =>
      filterDepartmentId
        ? scopedPortfolio.scopedDepartments.filter(
            (d) => d.id === filterDepartmentId
          )
        : scopedPortfolio.scopedDepartments,
    [scopedPortfolio.scopedDepartments, filterDepartmentId]
  );

  const portfolioMetrics = useMemo(
    () => computePortfolioMetrics(filteredInitiatives, activeDepartments),
    [filteredInitiatives, activeDepartments]
  );

  const lifecycleAnalytics = useMemo(
    () => computeLifecycleAnalytics(filteredInitiatives, activeDepartments),
    [filteredInitiatives, activeDepartments]
  );

  const financialOverview = useMemo(
    () =>
      calculatePortfolioFinancialDashboard({
        departments: activeDepartments,
        initiatives: filteredInitiatives,
        benefits: filteredBenefits,
        costs: filteredCosts,
        costPlans: filteredCostPlans,
        reportingYear,
        filterPeriod,
        forecastMissingRule,
      }),
    [
      activeDepartments,
      filteredInitiatives,
      filteredBenefits,
      filteredCosts,
      filteredCostPlans,
      reportingYear,
      filterPeriod,
      forecastMissingRule,
    ]
  );

  const financialSummary = financialOverview.summary;

  const yearPrefix = `${reportingYear}-`;
  const waterfalls = useMemo(
    () =>
      calculateDepartmentWaterfalls({
        departments: activeDepartments,
        benefits: filteredBenefits.filter((b) => b.period.startsWith(yearPrefix)),
        costs: filteredCosts.filter((c) => c.period.startsWith(yearPrefix)),
        costPlans: filteredCostPlans.filter(
          (p) => p.planningYear === reportingYear
        ),
      }),
    [
      activeDepartments,
      filteredBenefits,
      filteredCosts,
      filteredCostPlans,
      reportingYear,
      yearPrefix,
    ]
  );

  const costTrends = useMemo(
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

  const platformTokens = useMemo(
    () =>
      calculatePlatformSpendAndTokens(
        filteredCosts.filter((c) => c.period.startsWith(yearPrefix)),
        filteredCostPlans.filter((p) => p.planningYear === reportingYear)
      ),
    [filteredCosts, filteredCostPlans, reportingYear, yearPrefix]
  );

  const redundancySummary = useMemo(
    () => computeRedundancyAnalysis(filteredInitiatives),
    [filteredInitiatives]
  );

  const scopedRedundancyCases = useMemo(() => {
    const activeDeptIds = new Set(activeDepartments.map((d) => d.id));
    return redundancyCases.filter(
      (c) =>
        activeDeptIds.has(c.initiativeASnapshot.departmentId) ||
        activeDeptIds.has(c.initiativeBSnapshot.departmentId)
    );
  }, [redundancyCases, activeDepartments]);

  const redundancyWorkflowMetrics = useMemo(
    () =>
      computeRedundancyPortfolioMetrics({
        initiatives: filteredInitiatives,
        analysis: redundancySummary,
        cases: scopedRedundancyCases,
        actions: redundancyActions,
      }),
    [filteredInitiatives, redundancySummary, scopedRedundancyCases, redundancyActions]
  );

  const qualityReport = useMemo(
    () =>
      computeSavingsDataQualityReport({
        initiatives: filteredInitiatives,
        benefits: filteredBenefits,
        departments: activeDepartments,
        users,
      }),
    [filteredInitiatives, filteredBenefits, activeDepartments, users]
  );

  const highPriorityQualityCount = useMemo(
    () => qualityReport.items.filter((i) => !i.isUpToDate && i.priority === 'HIGH').length,
    [qualityReport.items]
  );

  const lifecycleTimings = useMemo(() => {
    const leadTimes = filteredInitiatives.map((i) => ({
      initiative: i,
      leadDays: computeDevelopmentLeadTimeDays(i, events),
      prodAgingDays: computeProductionAgingDays(i, events),
      agingDays: computeStageAgingDays(i, events),
    }));
    const validLead = leadTimes
      .map((x) => x.leadDays)
      .filter((d): d is number => d !== null);
    const avgLeadDays =
      validLead.length > 0
        ? Math.round(validLead.reduce((s, d) => s + d, 0) / validLead.length)
        : null;

    const validProdAging = leadTimes
      .map((x) => x.prodAgingDays)
      .filter((d): d is number => d !== null);
    const avgProdAgingDays =
      validProdAging.length > 0
        ? Math.round(
            validProdAging.reduce((s, d) => s + d, 0) / validProdAging.length
          )
        : null;

    const validAging = leadTimes
      .map((x) => x.agingDays)
      .filter((d): d is number => d !== null);
    const avgAgingDays =
      validAging.length > 0
        ? Math.round(validAging.reduce((s, d) => s + d, 0) / validAging.length)
        : null;
    return {
      avgLeadDays,
      avgProdAgingDays,
      avgAgingDays,
      rows: leadTimes.slice(0, 6),
    };
  }, [filteredInitiatives, events]);

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filterDepartmentId) parts.push(deptName(filterDepartmentId));
    if (filterLifecycle) parts.push(LIFECYCLE_LABELS[filterLifecycle]);
    if (filterPeriod) parts.push(`Period ${filterPeriod}`);
    if (filterPlatform) parts.push(filterPlatform);
    return parts.length > 0 ? `${scopeLabel} · ${parts.join(' · ')}` : scopeLabel;
  }, [
    scopeLabel,
    filterDepartmentId,
    filterLifecycle,
    filterPeriod,
    filterPlatform,
    departments,
  ]);

  const reportingDateLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  return (
    <div className="space-y-6">
      {/* 16:9 Presentation Mode & Landscape Print Deck */}
      <ExecutivePresentationDeck
        open={presentationMode}
        onClose={() => setPresentationMode(false)}
        dataSourceMode={dataSourceMode}
        activeDataset={activeDataset}
        scopeLabel={scopeLabel}
        activeFilterSummary={activeFilterSummary}
        reportingDateLabel={reportingDateLabel}
        departments={activeDepartments}
        initiatives={filteredInitiatives}
        events={events}
        portfolioMetrics={portfolioMetrics}
        lifecycleAnalytics={lifecycleAnalytics}
        financialSummary={financialSummary}
        financialOverview={financialOverview}
        waterfalls={waterfalls}
        costTrends={costTrends}
        redundancySummary={redundancySummary}
        reviews={reviews}
        redundancyWorkflowMetrics={redundancyWorkflowMetrics}
        redundancyCases={scopedRedundancyCases}
        boardDecisions={boardDecisions}
        redundancyDeadlineConfig={redundancyDeadlineConfig}
        avgLeadDays={lifecycleTimings.avgLeadDays}
        avgProdAgingDays={lifecycleTimings.avgProdAgingDays}
        avgStageAgingDays={lifecycleTimings.avgAgingDays}
      />

      {/* Standard View Wrapper (hidden in print when Presentation Deck is open) */}
      <div className={presentationMode ? 'no-print space-y-6' : 'space-y-6'}>
        {/* Print-Only Header (Standard View Print) */}
        {!presentationMode && (
          <div className="print-only border-b-2 border-[#004F9F] pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AbbottLogoSlot variant="header" />
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    AAS AI Governance — Executive Portfolio Report
                  </div>
                  <div className="text-xs text-slate-600">
                    Dataset:{' '}
                    {activeDataset === 'SAMPLE_DEMO'
                      ? 'Sample Demo Data'
                      : 'Imported Portfolio Data'}{' '}
                    · {activeFilterSummary} · Generated {reportingDateLabel}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <AbbottLogoSlot variant="header" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Executive AI Portfolio Dashboard
              </h1>
            </div>
            <p className="text-sm text-slate-600">
              Single-source-of-truth executive telemetry calculated live from{' '}
              {activeDataset === 'SAMPLE_DEMO'
                ? 'Sample Demo Data'
                : 'Imported Portfolio Data'}
              .
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
            {availableYears.length > 0 && (
              <select
                aria-label="Executive Reporting Year"
                value={reportingYear}
                onChange={(e) => {
                  const yr = Number(e.target.value);
                  setReportingYear(yr);
                  if (filterPeriod && !filterPeriod.startsWith(`${yr}-`)) {
                    setFilterPeriod('');
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    FY {yr}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() =>
                navigate({ page: 'gov-savings', initialTab: 'cost-planning' })
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <span>AI Cost Planning</span>
            </button>
            <button
              type="button"
              onClick={() => setPresentationMode(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#003E7E] whitespace-nowrap"
            >
              <Presentation className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Present Slides</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Print / Export PDF</span>
            </button>
          </div>
        </div>

        {/* Interactive 4-Filter Strip */}
        <div className="no-print grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="exec-filter-dept"
              className="block text-[11px] font-semibold text-slate-500"
            >
              Department Filter (Operations Priority First)
            </label>
            <select
              id="exec-filter-dept"
              value={filterDepartmentId}
              onChange={(e) => setFilterDepartmentId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">All Departments</option>
              {scopedPortfolio.scopedDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="exec-filter-lifecycle"
              className="block text-[11px] font-semibold text-slate-500"
            >
              Lifecycle Stage Filter
            </label>
            <select
              id="exec-filter-lifecycle"
              value={filterLifecycle}
              onChange={(e) =>
                setFilterLifecycle(e.target.value as LifecycleStatus | '')
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">All 8 Lifecycle Stages</option>
              {LIFECYCLE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {LIFECYCLE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="exec-filter-period"
              className="block text-[11px] font-semibold text-slate-500"
            >
              Reporting Period (Financials & Spend)
            </label>
            <select
              id="exec-filter-period"
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">All Reporting Periods</option>
              {availablePeriods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="exec-filter-platform"
              className="block text-[11px] font-semibold text-slate-500"
            >
              AI Platform Filter
            </label>
            <select
              id="exec-filter-platform"
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">All AI Platforms</option>
              {availablePlatforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* All 9 Required Executive KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              1. Total AI Initiatives
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {portfolioMetrics.totalInitiatives}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              Pipeline {portfolioMetrics.pipelineCount} · Live{' '}
              {portfolioMetrics.liveCount} · Mon{' '}
              {portfolioMetrics.monitoringCount} · Scale{' '}
              {portfolioMetrics.scaleImproveCount} · Ret{' '}
              {portfolioMetrics.retiredCount}
            </div>
          </div>

          <div className="relative rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
              <span>2. Active Solutions (Pilot + Production)</span>
              <button
                type="button"
                aria-label="Active Solutions definition"
                title="Active Solutions strictly counts Pilot + Production initiatives. Monitoring, Scale / Improve, and Retire are tracked separately."
                onClick={() => setShowActiveTooltip((v) => !v)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-[#004F9F]"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1 text-2xl font-bold text-[#004F9F] tabular-nums">
              {portfolioMetrics.activeSolutionsCount}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Across {portfolioMetrics.departmentsRepresentedCount} departments
            </div>
            {showActiveTooltip && (
              <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] text-slate-700">
                Defined strictly as <strong>Pilot + Production</strong>.
                Monitoring, Scale / Improve, and Retire are separated.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              3. Active Users
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {portfolioMetrics.totalRegisteredUsers.toLocaleString('en-US')}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Target & active users across filtered solutions
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              4. Annual Hours Saved
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {Math.round(financialSummary.annualHoursSaved).toLocaleString(
                'en-US'
              )}{' '}
              hrs
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Efficiency initiatives formula (users × min × freq × 52 / 60)
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              5. Estimated Efficiency Value (Non-Cash)
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {eur(financialSummary.estimatedEfficiencyValueEur)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Separated from realized cash/avoidance (no double-counting)
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              6. Realized Financial Benefits
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
              {eur(financialSummary.realizedFinancialBenefitsEur)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Cash {eur(financialSummary.realizedCashSavingsEur)} + Avoidance{' '}
              {eur(financialSummary.realizedCostAvoidanceEur)}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              7. AI Costs (Actual Spend · FY {reportingYear})
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {eur(financialSummary.actualAiCostsEur)}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              Budget: {eur(financialOverview.annualBudgetEur)} · Forecast:{' '}
              {financialOverview.annualForecastEur !== null
                ? eur(financialOverview.annualForecastEur)
                : 'N/A'}{' '}
              ({financialOverview.forecastCoveredMonthsCount}/12 mo)
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              8. Net Financial Benefit
            </div>
            <div
              className={`mt-1 text-2xl font-bold tabular-nums ${
                financialSummary.netFinancialBenefitEur >= 0
                  ? 'text-[#004F9F]'
                  : 'text-red-700'
              }`}
            >
              {eur(financialSummary.netFinancialBenefitEur)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Realized Cash + Avoidance − Incremental AI Costs
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              9. Potential Redundancy Rate
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
              {redundancySummary.potentialRedundancyRatePercent}%
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              {redundancySummary.flaggedInitiativesCount} of{' '}
              {redundancySummary.eligibleInitiativesCount} Idea–Pilot
              initiatives flagged
            </div>
          </div>
        </div>

        {/* Executive Savings Data Quality Indicator Card */}
        <section className="rounded-lg border border-[#BFD7EE] bg-white p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ClipboardCheck
                  className="h-4 w-4 text-[#004F9F]"
                  aria-hidden="true"
                />
                <span>Savings Data Quality & Review Compliance</span>
              </div>
              <p className="text-xs text-slate-600">
                Governance completeness across value inputs, verified realized
                benefits, and 30-day monthly savings reviews.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ page: 'gov-savings-quality' })}
              className="no-print inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#003D7A] whitespace-nowrap shrink-0"
            >
              <span>Open Savings Data Quality</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">
                Initiatives Requiring Savings Updates
              </div>
              <div className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                {qualityReport.itemsRequiringActionCount}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600 tabular-nums">
                {highPriorityQualityCount} high-priority action
                {highPriorityQualityCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">
                Overdue Monthly Reviews
              </div>
              <div className="mt-0.5 text-xl font-bold text-amber-700 tabular-nums">
                {qualityReport.overdueReviewsCount}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                Tracks savings review dates independently of metadata edits
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">
                Savings Data Completeness Rate
              </div>
              <div className="mt-0.5 text-xl font-bold text-[#004F9F] tabular-nums">
                {qualityReport.dataCompletenessPercent}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600 tabular-nums">
                {qualityReport.upToDateCount} of {qualityReport.totalInitiatives}{' '}
                initiatives up to date
              </div>
            </div>
          </div>
        </section>

        {/* Primary Lifecycle Distribution Overview */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Lifecycle Distribution Overview (Largest Stage:{' '}
                <span className="text-[#004F9F]">
                  {lifecycleAnalytics.largestStageLabel} ·{' '}
                  {lifecycleAnalytics.largestStagePercentage}%
                </span>
                )
              </h2>
              <p className="text-xs text-slate-500">
                Overall 8-stage distribution and department 100% stacked breakdown
                for active scope.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ page: 'gov-lifecycle' })}
              className="no-print inline-flex items-center gap-1 text-xs font-medium text-[#004F9F] hover:underline"
            >
              <span>Open Lifecycle Management</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <LifecycleDistributionRedesignCharts analytics={lifecycleAnalytics} />
        </section>

        {/* Department Waterfall + Monthly Spend Trends */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Department Net Financial Benefit Waterfall
              </h2>
              <button
                type="button"
                onClick={() => navigate({ page: 'gov-savings' })}
                className="no-print text-xs font-medium text-[#004F9F] hover:underline"
              >
                Savings & Costs
              </button>
            </div>
            <p className="mt-0.5 mb-3 text-xs text-slate-500">
              Cash Savings + Cost Avoidance − Incremental AI Costs.
            </p>
            <WaterfallChart rows={waterfalls} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Monthly AI Cost Trends (Planned vs Actual)
            </h2>
            <p className="mt-0.5 mb-3 text-xs text-slate-500">
              Monthly spend progression across filtered reporting periods.
            </p>
            <CostTrendChart points={costTrends} />
          </section>
        </div>

        {/* Stage Aging / Lead Time + Tokens by Platform + Synergy Opportunities */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Lead Time & Production Aging
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Strictly computed from stored Idea, Production Go-Live, and
              Lifecycle event timestamps.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <div className="text-slate-500">Stage Aging</div>
                <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                  {lifecycleTimings.avgAgingDays !== null
                    ? `${lifecycleTimings.avgAgingDays}d`
                    : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Dev Lead Time</div>
                <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                  {lifecycleTimings.avgLeadDays !== null
                    ? `${lifecycleTimings.avgLeadDays}d`
                    : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Prod Aging</div>
                <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                  {lifecycleTimings.avgProdAgingDays !== null
                    ? `${lifecycleTimings.avgProdAgingDays}d`
                    : 'N/A'}
                </div>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-200 text-xs">
              {lifecycleTimings.rows.map((r) => (
                <li
                  key={r.initiative.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className="truncate font-medium text-slate-800">
                    {r.initiative.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-600 tabular-nums">
                    {r.agingDays ?? '—'}d age ·{' '}
                    {r.leadDays !== null ? `${r.leadDays}d lead` : 'Pipeline'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Token Consumption & Platform Spend
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Actual spend and LLM tokens per AI platform.
            </p>
            <div className="mt-3 divide-y divide-slate-200 text-xs">
              {platformTokens.map((p) => (
                <div
                  key={p.platform}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <div className="font-medium text-slate-900">{p.platform}</div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {p.tokens.toLocaleString('en-US')} tokens
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-semibold text-slate-900">
                      {eur(p.actualEur)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Plan {eur(p.plannedEur)}
                    </div>
                  </div>
                </div>
              ))}
              {platformTokens.length === 0 && (
                <div className="py-4 text-slate-500">
                  No platform cost records in filtered view.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Synergy &amp; Redundancy Optimization
              </h2>
              <button
                type="button"
                onClick={() => navigate({ page: 'gov-redundancy' })}
                className="no-print text-xs font-medium text-[#004F9F] hover:underline"
              >
                Open Cases
              </button>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {redundancyWorkflowMetrics.openReviewCasesCount} open ·{' '}
              {redundancyWorkflowMetrics.escalatedCasesCount} escalated · Confirmed
              synergy {eur(redundancyWorkflowMetrics.confirmedFinancialSynergyValueEur)}{' '}
              (excluded from Net Benefit).
            </p>
            <div className="mt-3 divide-y divide-slate-200 text-xs">
              {scopedRedundancyCases.slice(0, 3).map((c) => (
                <div key={c.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ page: 'gov-redundancy-case', caseId: c.id })
                      }
                      className="font-mono font-semibold text-[#004F9F] hover:underline"
                    >
                      {c.caseNumber}
                    </button>
                    <span className="text-[11px] font-medium text-slate-700">
                      {formatRedundancyStatusLabel(c.status)}
                    </span>
                  </div>
                  <div className="font-medium text-slate-900">
                    {c.initiativeASnapshot.title} ↔ {c.initiativeBSnapshot.title}
                  </div>
                </div>
              ))}
              {scopedRedundancyCases.length === 0 &&
                redundancySummary.candidatePairs.slice(0, 3).map((pair) => {
                  const rev = reviews.find((r) => r.pairKey === pair.pairKey);
                  return (
                    <div key={pair.pairKey} className="py-2.5 space-y-1">
                      <div className="font-medium text-slate-900">
                        {pair.initiativeA.title} ↔ {pair.initiativeB.title}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {deptName(pair.initiativeA.departmentId)} /{' '}
                          {deptName(pair.initiativeB.departmentId)}
                        </span>
                        <span className="font-mono font-semibold text-amber-800">
                          {pair.heuristicScore}% demo score
                        </span>
                      </div>
                      {rev && (
                        <div className="text-[11px] font-medium text-emerald-700">
                          Triaged: {REDUNDANCY_DISPOSITION_LABELS[rev.disposition]}
                        </div>
                      )}
                    </div>
                  );
                })}
              {scopedRedundancyCases.length === 0 &&
                redundancySummary.candidatePairs.length === 0 && (
                  <div className="py-4 text-slate-500">
                    No overlapping Idea–Pilot candidates detected.
                  </div>
                )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
