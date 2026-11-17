import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Printer,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  computeProductionAgingDays,
  computeStoredLifecycleTransitions,
  isReviewOverdue,
  LifecycleAnalyticsSummary,
} from '../domain/calculations';
import {
  DepartmentWaterfallRow,
  MonthlyCostTrendPoint,
  PortfolioFinancialOverview,
  PortfolioFinancialSummary,
} from '../domain/financials';
import { RedundancyAnalysisSummary } from '../domain/redundancy';
import {
  computeNextBoardMeetingDate,
  DEFAULT_REDUNDANCY_DEADLINE_CONFIG,
  RedundancyPortfolioMetrics,
} from '../domain/redundancyWorkflow';
import {
  BOARD_DECISION_OUTCOME_LABELS,
  BoardDecision,
  DataSourceMode,
  Department,
  formatRedundancyStatusLabel,
  Initiative,
  LIFECYCLE_LABELS,
  LifecycleEvent,
  LifecycleStatus,
  LIVE_STATUSES,
  normalizeRedundancyCaseStatus,
  PIPELINE_STATUSES,
  PortfolioMetrics,
  REDUNDANCY_DECISION_LABELS,
  REDUNDANCY_DISPOSITION_LABELS,
  RedundancyCase,
  RedundancyDeadlineConfig,
  RedundancyReviewRecord,
  WorkspaceDataset,
} from '../domain/types';
import { AbbottLogoSlot } from './AbbottLogoSlot';
import { CostTrendChart } from './charts/CostTrendChart';
import { DepartmentFinancialComparisonChart } from './charts/DepartmentFinancialComparisonChart';
import { LifecycleDistributionRedesignCharts } from './charts/LifecycleDistributionRedesignCharts';
import { WaterfallChart } from './charts/WaterfallChart';

export interface PresentationDeckProps {
  open: boolean;
  onClose: () => void;
  dataSourceMode: DataSourceMode;
  activeDataset: WorkspaceDataset;
  scopeLabel: string;
  activeFilterSummary: string;
  reportingDateLabel: string;
  departments: Department[];
  initiatives: Initiative[];
  events: LifecycleEvent[];
  portfolioMetrics: PortfolioMetrics;
  lifecycleAnalytics: LifecycleAnalyticsSummary;
  financialSummary: PortfolioFinancialSummary;
  financialOverview: PortfolioFinancialOverview;
  waterfalls: DepartmentWaterfallRow[];
  costTrends: MonthlyCostTrendPoint[];
  redundancySummary: RedundancyAnalysisSummary;
  reviews: RedundancyReviewRecord[];
  redundancyWorkflowMetrics?: RedundancyPortfolioMetrics;
  redundancyCases?: RedundancyCase[];
  boardDecisions?: BoardDecision[];
  redundancyDeadlineConfig?: RedundancyDeadlineConfig;
  avgLeadDays: number | null;
  avgProdAgingDays: number | null;
  avgStageAgingDays: number | null;
}

type SlideId =
  | 'summary'
  | 'lifecycle-dist'
  | 'lifecycle-readiness'
  | 'financial-total'
  | 'financial-dept'
  | 'redundancy'
  | 'board-escalations';

interface SlideMeta {
  id: SlideId;
  number: number;
  title: string;
  shortLabel: string;
  subtitle: string;
}

const BASE_SLIDE_META: SlideMeta[] = [
  {
    id: 'summary',
    number: 1,
    title: 'Executive Summary & KPI Overview',
    shortLabel: '1. Executive Summary',
    subtitle:
      'Active AI portfolio scale, efficiency hours, financial benefits, AI spend & redundancy',
  },
  {
    id: 'lifecycle-dist',
    number: 2,
    title: 'Lifecycle Management Executive Overview',
    shortLabel: '2. Lifecycle Distribution',
    subtitle:
      'Where are most AI initiatives currently located in the lifecycle, overall and by department?',
  },
  {
    id: 'lifecycle-readiness',
    number: 3,
    title: 'Lifecycle Readiness, Department Aging & Timing',
    shortLabel: '3. Readiness & Timing',
    subtitle:
      'Department stage readiness, monthly review compliance, Idea-to-Production lead time, and Production aging',
  },
  {
    id: 'financial-total',
    number: 4,
    title: 'Financial Overview — Total Portfolio Savings & Costs',
    shortLabel: '4. Financial Overview',
    subtitle:
      'Realized Cash Savings & Cost Avoidance minus Incremental AI Costs, Annual Budget, Latest Forecast & YTD Spend',
  },
  {
    id: 'financial-dept',
    number: 5,
    title: 'Savings & Costs by Department',
    shortLabel: '5. Dept Savings & Costs',
    subtitle:
      'Department benefits vs AI costs, Net Benefit, Annual Budget vs Forecast, YTD actuals & 1:1 portfolio reconciliation',
  },
  {
    id: 'redundancy',
    number: 6,
    title: 'Redundancy & Synergy Opportunities',
    shortLabel: '6. Redundancy & Synergy',
    subtitle:
      'Idea-to-Pilot heuristic overlap screening and cross-department reuse triage',
  },
];

const BOARD_ESCALATION_SLIDE_META: SlideMeta = {
  id: 'board-escalations',
  number: 7,
  title: 'Board Escalations & Decisions Required',
  shortLabel: '7. Board Escalations',
  subtitle:
    'Open AI Governance Board escalations, manager recommendations, financial/effort impact, and decision deadlines',
};

function eur(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}€${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

function formatRecommendedChoice(
  opt: string | null | undefined,
  fallbackDecision: string | null | undefined
): string {
  const candidate = opt || fallbackDecision;
  if (!candidate) return 'Pending Manager Recommendation';
  if (candidate in REDUNDANCY_DECISION_LABELS) {
    return REDUNDANCY_DECISION_LABELS[
      candidate as keyof typeof REDUNDANCY_DECISION_LABELS
    ];
  }
  if (candidate in BOARD_DECISION_OUTCOME_LABELS) {
    return BOARD_DECISION_OUTCOME_LABELS[
      candidate as keyof typeof BOARD_DECISION_OUTCOME_LABELS
    ];
  }
  return candidate;
}

export const PresentationSlideContent: React.FC<{
  slideIndex: number;
  totalSlides: number;
  props: Omit<PresentationDeckProps, 'open' | 'onClose'>;
}> = ({ slideIndex, totalSlides, props }) => {
  const slidesMeta =
    totalSlides === 7
      ? [...BASE_SLIDE_META, BOARD_ESCALATION_SLIDE_META]
      : BASE_SLIDE_META;
  const meta = slidesMeta[slideIndex] ?? BASE_SLIDE_META[0];
  const slideId = meta.id;
  const [selectedDeptWaterfallId, setSelectedDeptWaterfallId] = useState<string>('ALL');

  const deptName = (id: string) =>
    props.departments.find((d) => d.id === id)?.name ?? id;

  const filteredIds = new Set(props.initiatives.map((i) => i.id));
  const storedTransitions = computeStoredLifecycleTransitions(
    props.events,
    filteredIds
  );

  const deadlineCfg =
    props.redundancyDeadlineConfig ?? DEFAULT_REDUNDANCY_DEADLINE_CONFIG;

  const escalatedCases = (props.redundancyCases ?? []).filter(
    (c) => normalizeRedundancyCaseStatus(c.status) === 'ESCALATED'
  );

  return (
    <div className="presentation-slide flex h-full w-full flex-col justify-between bg-white p-6 text-slate-900">
      {/* Slide Header */}
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#004F9F] pb-3">
        <div className="flex items-center gap-3.5">
          <AbbottLogoSlot variant="presentation" />
          <div className="border-l border-slate-200 pl-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#004F9F]">
              AAS AI Governance · Slide {meta.number} of {totalSlides}
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              {meta.title}
            </h2>
            <p className="text-[11px] text-slate-500">{meta.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 text-right text-[11px]">
          <div className="flex items-center gap-2">
            {props.dataSourceMode === 'DEMO_LOCAL' && (
              <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                Demo Data ({props.activeDataset === 'SAMPLE_DEMO' ? 'Sample' : 'Imported'})
              </span>
            )}
            <span className="font-mono text-slate-600 tabular-nums">
              Report Date: {props.reportingDateLabel}
            </span>
          </div>
          <div className="max-w-md truncate rounded border border-[#BFD7EE] bg-[#EBF3FB] px-2 py-0.5 text-[10px] font-semibold text-[#004F9F]">
            {props.activeFilterSummary}
          </div>
        </div>
      </header>

      {/* Slide Body */}
      <div className="my-2.5 flex-1 overflow-hidden">
        {slideId === 'summary' && (
          <div className="flex h-full flex-col justify-between gap-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  1. Total AI Initiatives
                </div>
                <div className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums">
                  {props.portfolioMetrics.totalInitiatives}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600 tabular-nums">
                  Pipeline {props.portfolioMetrics.pipelineCount} · Live{' '}
                  {props.portfolioMetrics.liveCount} · Mon{' '}
                  {props.portfolioMetrics.monitoringCount} · Scale{' '}
                  {props.portfolioMetrics.scaleImproveCount} · Ret{' '}
                  {props.portfolioMetrics.retiredCount}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  2. Active Solutions (Pilot + Production)
                </div>
                <div className="mt-0.5 text-2xl font-bold text-[#004F9F] tabular-nums">
                  {props.portfolioMetrics.activeSolutionsCount}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  Across {props.portfolioMetrics.departmentsRepresentedCount} departments
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  3. Active Users
                </div>
                <div className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums">
                  {props.portfolioMetrics.totalRegisteredUsers.toLocaleString('en-US')}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  Registered target &amp; operational users
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  4. Annual Hours Saved
                </div>
                <div className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums">
                  {Math.round(props.financialSummary.annualHoursSaved).toLocaleString('en-US')}{' '}
                  hrs
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  Efficiency initiatives productivity hours
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  5. Estimated Efficiency Value (Non-Cash)
                </div>
                <div className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums">
                  {eur(props.financialSummary.estimatedEfficiencyValueEur)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  Separated from realized cash/avoidance
                </div>
              </div>

              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="text-[11px] font-medium text-emerald-900">
                  6. Realized Financial Benefits
                </div>
                <div className="mt-0.5 text-2xl font-bold text-emerald-700 tabular-nums">
                  {eur(props.financialSummary.realizedFinancialBenefitsEur)}
                </div>
                <div className="mt-0.5 text-[10px] text-emerald-800 tabular-nums">
                  Cash {eur(props.financialSummary.realizedCashSavingsEur)} + Avoidance{' '}
                  {eur(props.financialSummary.realizedCostAvoidanceEur)}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  7. AI Costs (Actual Spend)
                </div>
                <div className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums">
                  {eur(props.financialSummary.actualAiCostsEur)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600 tabular-nums">
                  Planned {eur(props.financialSummary.plannedAiCostsEur)} ·{' '}
                  {(props.financialSummary.totalTokens / 1_000_000).toFixed(1)}M tokens
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  8. Net Financial Benefit
                </div>
                <div
                  className={`mt-0.5 text-2xl font-bold tabular-nums ${
                    props.financialSummary.netFinancialBenefitEur >= 0
                      ? 'text-[#004F9F]'
                      : 'text-red-700'
                  }`}
                >
                  {eur(props.financialSummary.netFinancialBenefitEur)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  Realized Benefits − Incremental AI Costs
                </div>
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <div className="text-[11px] font-medium text-amber-900">
                  9. Potential Redundancy Rate
                </div>
                <div className="mt-0.5 text-2xl font-bold text-amber-800 tabular-nums">
                  {props.redundancySummary.potentialRedundancyRatePercent}%
                </div>
                <div className="mt-0.5 text-[10px] text-amber-900 tabular-nums">
                  {props.redundancySummary.flaggedInitiativesCount} of{' '}
                  {props.redundancySummary.eligibleInitiativesCount} Idea–Pilot items
                </div>
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <strong>Value Governance Principle:</strong> Active Solutions
              counts strictly <strong>Pilot + Production</strong>. Non-cash
              efficiency estimates never double-count into Net Financial Benefit.
            </div>
          </div>
        )}

        {slideId === 'lifecycle-dist' && (
          <div className="flex h-full flex-col justify-between gap-2.5">
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">
                  Total Portfolio Initiatives
                </div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {props.lifecycleAnalytics.totalInitiatives}
                </div>
              </div>
              <div className="rounded border border-[#BFD7EE] bg-[#EBF3FB]/60 px-3 py-2">
                <div className="text-[11px] font-semibold text-[#004F9F]">
                  Largest Lifecycle Stage
                </div>
                <div className="truncate text-lg font-bold text-slate-900">
                  {props.lifecycleAnalytics.largestStageLabel}
                </div>
              </div>
              <div className="rounded border border-[#BFD7EE] bg-[#EBF3FB]/60 px-3 py-2">
                <div className="text-[11px] font-semibold text-[#004F9F]">
                  Percentage in Largest Stage
                </div>
                <div className="text-lg font-bold text-[#004F9F] tabular-nums">
                  {props.lifecycleAnalytics.largestStagePercentage}%{' '}
                  <span className="text-xs font-medium text-slate-600">
                    ({props.lifecycleAnalytics.largestStageCount})
                  </span>
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">
                  Live Portfolio (Pilot + Prod)
                </div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">
                  {props.portfolioMetrics.liveCount}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <LifecycleDistributionRedesignCharts
                analytics={props.lifecycleAnalytics}
                compact
              />
            </div>
          </div>
        )}

        {slideId === 'lifecycle-readiness' && (
          <div className="flex h-full flex-col justify-between gap-3">
            <div className="grid grid-cols-5 gap-2.5 text-xs">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Pipeline (Idea–Dev)
                </div>
                <div className="text-lg font-bold text-[#0066B2] tabular-nums">
                  {props.portfolioMetrics.pipelineCount}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Live (Pilot + Prod)
                </div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">
                  {props.portfolioMetrics.liveCount}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Overdue Monthly Reviews
                </div>
                <div
                  className={`text-lg font-bold tabular-nums ${
                    props.portfolioMetrics.overdueReviewsCount > 0
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {props.portfolioMetrics.overdueReviewsCount}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Avg Dev Lead (Idea→Prod)
                </div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {props.avgLeadDays !== null ? `${props.avgLeadDays} days` : 'N/A'}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Avg Production Aging
                </div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {props.avgProdAgingDays !== null
                    ? `${props.avgProdAgingDays} days`
                    : 'N/A'}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-md border border-slate-200">
              {props.departments.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-xs text-slate-500">
                  No department initiatives in the active filter view.
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Pipeline</th>
                      <th className="px-3 py-2 text-right">Live (Pilot+Prod)</th>
                      <th className="px-3 py-2 text-right">Mon / Scale / Ret</th>
                      <th className="px-3 py-2 text-right">Overdue Reviews</th>
                      <th className="px-3 py-2 text-right">Avg Prod Aging</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {props.departments.slice(0, 6).map((dept) => {
                      const deptItems = props.initiatives.filter(
                        (i) => i.departmentId === dept.id
                      );
                      const pipeline = deptItems.filter((i) =>
                        PIPELINE_STATUSES.has(i.lifecycleStatus)
                      ).length;
                      const live = deptItems.filter((i) =>
                        LIVE_STATUSES.has(i.lifecycleStatus)
                      ).length;
                      const postLive = deptItems.filter(
                        (i) =>
                          i.lifecycleStatus === LifecycleStatus.MONITORING ||
                          i.lifecycleStatus === LifecycleStatus.SCALE_IMPROVE ||
                          i.lifecycleStatus === LifecycleStatus.RETIRE
                      ).length;
                      const overdue = deptItems.filter(
                        (i) =>
                          i.lifecycleStatus !== LifecycleStatus.RETIRE &&
                          isReviewOverdue(i.nextReviewDue)
                      ).length;
                      const prodAgings = deptItems
                        .map((i) => computeProductionAgingDays(i, props.events))
                        .filter((d): d is number => d !== null);
                      const avgDeptProd =
                        prodAgings.length > 0
                          ? `${Math.round(
                              prodAgings.reduce((s, d) => s + d, 0) /
                                prodAgings.length
                            )}d`
                          : '—';

                      return (
                        <tr key={dept.id}>
                          <td className="px-3 py-2 font-semibold text-slate-900">
                            {dept.name}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {deptItems.length}
                          </td>
                          <td className="px-3 py-2 text-right text-[#0066B2] tabular-nums">
                            {pipeline}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700 tabular-nums">
                            {live}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 tabular-nums">
                            {postLive}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold tabular-nums ${
                              overdue > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {overdue}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700 tabular-nums">
                            {avgDeptProd}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
              <span>
                <strong>Stored Stage Transitions:</strong>{' '}
                {storedTransitions.length > 0
                  ? storedTransitions
                      .slice(0, 4)
                      .map(
                        (t) =>
                          `${LIFECYCLE_LABELS[t.fromStatus]} → ${LIFECYCLE_LABELS[t.toStatus]} (${t.count})`
                      )
                      .join(' · ')
                  : 'No stage transitions recorded in current filter.'}
              </span>
              <span className="tabular-nums">
                Avg Stage Aging:{' '}
                {props.avgStageAgingDays !== null
                  ? `${props.avgStageAgingDays}d`
                  : 'N/A'}
              </span>
            </div>
          </div>
        )}

        {slideId === 'financial-total' && (() => {
          const ov = props.financialOverview;
          const trendPoints: MonthlyCostTrendPoint[] =
            ov.monthlyBudgetForecastActual.some(
              (m) => m.plannedEur > 0 || m.actualEur > 0 || (m.forecastEur ?? 0) > 0
            )
              ? ov.monthlyBudgetForecastActual.map((m) => ({
                  period: m.period,
                  plannedEur: m.plannedEur,
                  forecastEur: m.forecastEur,
                  actualEur: m.actualEur,
                  tokens: m.tokens,
                }))
              : props.costTrends;

          return (
            <div className="flex h-full flex-col justify-between gap-2.5">
              {/* Row 1: Realized Value & Net Benefit (5 KPIs) */}
              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] font-medium text-slate-500">
                    Realized Cash Savings ({ov.reportingYear})
                  </div>
                  <div className="text-base font-bold text-emerald-700 tabular-nums">
                    {eur(ov.summary.realizedCashSavingsEur)}
                  </div>
                  <div className="text-[9px] text-slate-500">Realized · Cash</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] font-medium text-slate-500">
                    Realized Cost Avoidance ({ov.reportingYear})
                  </div>
                  <div className="text-base font-bold text-teal-700 tabular-nums">
                    {eur(ov.summary.realizedCostAvoidanceEur)}
                  </div>
                  <div className="text-[9px] text-slate-500">Realized · Avoided</div>
                </div>
                <div className="rounded border border-emerald-200 bg-emerald-50/50 px-2.5 py-2">
                  <div className="text-[10px] font-medium text-emerald-900">
                    Total Realized Benefits
                  </div>
                  <div className="text-base font-bold text-emerald-800 tabular-nums">
                    {eur(ov.summary.realizedFinancialBenefitsEur)}
                  </div>
                  <div className="text-[9px] text-emerald-700">Cash + Cost Avoidance</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[10px] font-medium text-slate-500">
                    Total AI Costs (Actual)
                  </div>
                  <div className="text-base font-bold text-rose-700 tabular-nums">
                    {eur(ov.summary.actualAiCostsEur)}
                  </div>
                  <div className="text-[9px] text-slate-500 tabular-nums">
                    {(ov.summary.totalTokens / 1_000_000).toFixed(1)}M tokens · Actual
                  </div>
                </div>
                <div className="rounded border border-[#BFD7EE] bg-[#EBF3FB]/60 px-2.5 py-2">
                  <div className="text-[10px] font-semibold text-[#004F9F]">
                    Net Financial Benefit
                  </div>
                  <div
                    className={`text-base font-bold tabular-nums ${
                      ov.summary.netFinancialBenefitEur >= 0
                        ? 'text-[#004F9F]'
                        : 'text-red-700'
                    }`}
                  >
                    {eur(ov.summary.netFinancialBenefitEur)}
                  </div>
                  <div className="text-[9px] text-slate-600">Realized − AI Costs</div>
                </div>
              </div>

              {/* Row 2: Planning, Forecast, YTD Spend & Separated Non-Cash Efficiency (4 KPIs) */}
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-medium text-slate-500">
                    Annual AI Budget ({ov.reportingYear} Plan)
                  </div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums">
                    {eur(ov.annualBudgetEur)}
                  </div>
                  <div className="text-[9px] text-slate-500 tabular-nums">
                    {ov.plannedMonthsCount}/12 planned months · {ov.costPlanCount} plan rows
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-1 text-[10px] font-medium text-slate-500">
                    <span>Latest Annual Forecast</span>
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-semibold tabular-nums ${
                        ov.hasMissingForecastData
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {ov.forecastCoveredMonthsCount}/12 mo
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums">
                    {ov.annualForecastEur !== null ? eur(ov.annualForecastEur) : 'Missing'}
                  </div>
                  <div className="text-[9px] text-slate-500 tabular-nums">
                    Forecast Variance:{' '}
                    {ov.forecastVarianceEur !== null ? eur(ov.forecastVarianceEur) : 'N/A'}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10px] font-medium text-slate-500">
                    Actual vs Planned ({ov.periodLabel})
                  </div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums">
                    {eur(ov.ytdActualEur)}{' '}
                    <span className="text-xs font-medium text-slate-500">
                      / {eur(ov.ytdBudgetEur)}
                    </span>
                  </div>
                  <div
                    className={`text-[9px] font-medium tabular-nums ${
                      ov.ytdBudgetVarianceEur >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    YTD Variance: {eur(ov.ytdBudgetVarianceEur)} (
                    {ov.ytdBudgetVarianceEur >= 0 ? 'under budget' : 'over budget'})
                  </div>
                </div>
                <div className="rounded border border-slate-300 border-dashed bg-slate-50 px-2.5 py-1.5">
                  <div className="text-[10px] font-semibold text-slate-700">
                    Estimated Efficiency Value (Non-Cash)
                  </div>
                  <div className="text-sm font-bold text-slate-800 tabular-nums">
                    {eur(ov.summary.estimatedEfficiencyValueEur)}
                  </div>
                  <div className="text-[9px] text-slate-500 tabular-nums">
                    {Math.round(ov.summary.annualHoursSaved).toLocaleString('en-US')} hrs/yr ·
                    Excluded from Net Benefit
                  </div>
                </div>
              </div>

              {/* Row 3: Portfolio Waterfall + Monthly Plan / Forecast / Actual Trend */}
              <div className="grid flex-1 grid-cols-2 gap-3 overflow-hidden">
                <div className="rounded-md border border-slate-200 p-2.5">
                  <div className="mb-1 text-[11px] font-semibold text-slate-800">
                    Total Portfolio Net Benefit Waterfall ({ov.reportingYear})
                  </div>
                  <WaterfallChart
                    rows={props.waterfalls}
                    compact
                    controlledDeptId="ALL"
                  />
                </div>
                <div className="rounded-md border border-slate-200 p-2.5">
                  <div className="mb-1 text-[11px] font-semibold text-slate-800">
                    Monthly AI Spend: Budget Plan vs Forecast vs Actual
                  </div>
                  <CostTrendChart points={trendPoints} compact />
                </div>
              </div>
            </div>
          );
        })()}

        {slideId === 'financial-dept' && (() => {
          const ov = props.financialOverview;
          const deptRows = ov.departmentRows;
          return (
            <div className="flex h-full flex-col justify-between gap-2">
              {/* Top: Department Grouped Bar Chart + Interactive Department Waterfall */}
              <div className="grid grid-cols-12 gap-2.5">
                <div className="col-span-7 rounded-md border border-slate-200 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-800">
                      Department Realized Benefits vs AI Costs vs Net Benefit ({ov.reportingYear})
                    </span>
                  </div>
                  <DepartmentFinancialComparisonChart rows={deptRows} compact />
                </div>
                <div className="col-span-5 rounded-md border border-slate-200 p-2">
                  <div className="mb-1 text-[11px] font-semibold text-slate-800">
                    Department Waterfall Drill-Down
                  </div>
                  <WaterfallChart
                    rows={props.waterfalls}
                    compact
                    showDeptSelectInCompact
                    controlledDeptId={selectedDeptWaterfallId}
                    onDeptChange={setSelectedDeptWaterfallId}
                  />
                </div>
              </div>

              {/* Bottom: Department Financial Performance & 1:1 Reconciliation Table */}
              <div className="flex-1 overflow-hidden rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-2.5 py-1">Department</th>
                      <th className="px-2.5 py-1 text-right">Realized Benefits</th>
                      <th className="px-2.5 py-1 text-right">AI Costs (Actual)</th>
                      <th className="px-2.5 py-1 text-right">Net Benefit</th>
                      <th className="px-2.5 py-1 text-right">Annual Budget</th>
                      <th className="px-2.5 py-1 text-right">YTD Actual / Budget</th>
                      <th className="px-2.5 py-1 text-right">Latest Forecast</th>
                      <th className="px-2.5 py-1 text-right">Forecast Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {deptRows.slice(0, 6).map((r) => (
                      <tr key={r.departmentId}>
                        <td className="px-2.5 py-1 font-semibold text-slate-900">
                          {r.departmentName}
                        </td>
                        <td className="px-2.5 py-1 text-right font-medium text-emerald-700 tabular-nums">
                          {eur(r.realizedFinancialBenefitsEur)}
                        </td>
                        <td className="px-2.5 py-1 text-right text-rose-700 tabular-nums">
                          {eur(r.actualAiCostsEur)}
                        </td>
                        <td
                          className={`px-2.5 py-1 text-right font-bold tabular-nums ${
                            r.netFinancialBenefitEur >= 0
                              ? 'text-[#004F9F]'
                              : 'text-red-700'
                          }`}
                        >
                          {eur(r.netFinancialBenefitEur)}
                        </td>
                        <td className="px-2.5 py-1 text-right text-slate-700 tabular-nums">
                          {eur(r.annualBudgetEur)}
                        </td>
                        <td className="px-2.5 py-1 text-right text-slate-700 tabular-nums">
                          {eur(r.ytdActualEur)} / {eur(r.ytdBudgetEur)}
                        </td>
                        <td className="px-2.5 py-1 text-right text-slate-800 tabular-nums">
                          {r.annualForecastEur !== null
                            ? eur(r.annualForecastEur)
                            : 'Missing'}
                        </td>
                        <td className="px-2.5 py-1 text-right tabular-nums">
                          <span
                            className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              r.hasMissingForecastData
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {r.forecastCoveredMonthsCount}/12 mo
                          </span>
                        </td>
                      </tr>
                    ))}
                    {deptRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-3 text-center text-slate-500">
                          No department financial records available in active filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                      <td className="px-2.5 py-1">
                        Portfolio Total (Reconciled 1:1)
                      </td>
                      <td className="px-2.5 py-1 text-right text-emerald-800 tabular-nums">
                        {eur(ov.summary.realizedFinancialBenefitsEur)}
                      </td>
                      <td className="px-2.5 py-1 text-right text-rose-800 tabular-nums">
                        {eur(ov.summary.actualAiCostsEur)}
                      </td>
                      <td className="px-2.5 py-1 text-right text-[#004F9F] tabular-nums">
                        {eur(ov.summary.netFinancialBenefitEur)}
                      </td>
                      <td className="px-2.5 py-1 text-right tabular-nums">
                        {eur(ov.annualBudgetEur)}
                      </td>
                      <td className="px-2.5 py-1 text-right tabular-nums">
                        {eur(ov.ytdActualEur)} / {eur(ov.ytdBudgetEur)}
                      </td>
                      <td className="px-2.5 py-1 text-right tabular-nums">
                        {ov.annualForecastEur !== null
                          ? eur(ov.annualForecastEur)
                          : 'Missing'}
                      </td>
                      <td className="px-2.5 py-1 text-right tabular-nums">
                        <span
                          className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            ov.hasMissingForecastData
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {ov.forecastCoveredMonthsCount}/12 mo
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })()}

        {slideId === 'redundancy' && (
          <div className="flex h-full flex-col justify-between gap-3">
            <div className="grid grid-cols-5 gap-2.5 text-xs">
              <div className="rounded border border-amber-200 bg-amber-50/50 px-3 py-2">
                <div className="text-[10px] text-amber-900">
                  Potential Redundancy
                </div>
                <div className="text-lg font-bold text-amber-800 tabular-nums">
                  {props.redundancySummary.potentialRedundancyRatePercent}%
                </div>
                <div className="text-[10px] text-amber-900 tabular-nums">
                  {props.redundancySummary.flaggedInitiativesCount} /{' '}
                  {props.redundancySummary.eligibleInitiativesCount} Idea–Pilot
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Confirmed Redundancy
                </div>
                <div className="text-lg font-bold text-[#004F9F] tabular-nums">
                  {props.redundancyWorkflowMetrics?.confirmedRedundancyRatePercent ?? 0}%
                </div>
                <div className="text-[10px] text-slate-600">
                  Merge / Reuse / Collab
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Open / Escalated Cases
                </div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {props.redundancyWorkflowMetrics?.openReviewCasesCount ?? 0} /{' '}
                  <span className="text-red-700">
                    {props.redundancyWorkflowMetrics?.escalatedCasesCount ?? 0}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600">
                  Active cases / Board queue
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] text-slate-500">
                  Actions (Done / Overdue)
                </div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  <span className="text-emerald-700">
                    {props.redundancyWorkflowMetrics?.actionsCompletedCount ?? 0}
                  </span>{' '}
                  /{' '}
                  <span className="text-red-700">
                    {props.redundancyWorkflowMetrics?.actionsOverdueCount ?? 0}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600">
                  Follow-up execution
                </div>
              </div>
              <div className="rounded border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                <div className="text-[10px] text-emerald-900">
                  Confirmed Fin. Synergy
                </div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">
                  {eur(
                    props.redundancyWorkflowMetrics
                      ?.confirmedFinancialSynergyValueEur ?? 0
                  )}
                </div>
                <div className="text-[10px] text-emerald-800">
                  Not double-counted in Net
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-md border border-slate-200">
              {(props.redundancyCases?.length ?? 0) > 0 ? (
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-3 py-2">Case &amp; Overlap</th>
                      <th className="px-3 py-2">Initiatives</th>
                      <th className="px-3 py-2">Workflow Status</th>
                      <th className="px-3 py-2">Decision</th>
                      <th className="px-3 py-2 text-right">Confirmed Synergy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {props.redundancyCases!.slice(0, 5).map((c) => {
                      const hasEv =
                        c.synergyEvidenceStatus !== 'NONE' &&
                        c.confirmedSynergyEvidence.trim().length > 0;
                      return (
                        <tr key={c.id}>
                          <td className="px-3 py-2 font-mono font-semibold text-[#004F9F] tabular-nums">
                            {c.caseNumber} ({c.heuristicScore}%)
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {c.initiativeASnapshot.title} ↔{' '}
                            {c.initiativeBSnapshot.title}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {formatRedundancyStatusLabel(c.status)}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {c.decisionType
                              ? REDUNDANCY_DECISION_LABELS[c.decisionType]
                              : 'Under Alignment'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700 tabular-nums">
                            {hasEv && c.confirmedFinancialSynergyEur > 0
                              ? eur(c.confirmedFinancialSynergyEur)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : props.redundancySummary.candidatePairs.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-xs text-slate-500">
                  No overlapping Idea-to-Pilot redundancy candidates detected in
                  the active filtered portfolio.
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-3 py-2">Candidate Pair</th>
                      <th className="px-3 py-2">Departments &amp; Stages</th>
                      <th className="px-3 py-2 text-right">Demo Score</th>
                      <th className="px-3 py-2">Portfolio Triage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {props.redundancySummary.candidatePairs
                      .slice(0, 5)
                      .map((pair) => {
                        const rev = props.reviews.find(
                          (r) => r.pairKey === pair.pairKey
                        );
                        return (
                          <tr key={pair.pairKey}>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {pair.initiativeA.title} ↔{' '}
                              {pair.initiativeB.title}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {deptName(pair.initiativeA.departmentId)} (
                              {LIFECYCLE_LABELS[pair.initiativeA.lifecycleStatus]})
                              {' / '}
                              {deptName(pair.initiativeB.departmentId)} (
                              {LIFECYCLE_LABELS[pair.initiativeB.lifecycleStatus]})
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-amber-800 tabular-nums">
                              {pair.heuristicScore}%
                            </td>
                            <td className="px-3 py-2">
                              {rev ? (
                                <span className="font-medium text-emerald-700">
                                  {REDUNDANCY_DISPOSITION_LABELS[rev.disposition]}
                                </span>
                              ) : (
                                <span className="text-slate-400">
                                  Pending Review
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {slideId === 'board-escalations' && (
          <div className="flex h-full flex-col justify-between gap-3">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded border border-red-200 bg-red-50/60 px-3 py-2">
                <div className="text-[11px] font-medium text-red-900">
                  Open Escalated Cases
                </div>
                <div className="text-xl font-bold text-red-700 tabular-nums">
                  {escalatedCases.length}
                </div>
                <div className="text-[10px] text-red-800">
                  Awaiting AI Governance Board mandate
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">
                  Potential Fin. Synergy (Escalated)
                </div>
                <div className="text-xl font-bold text-[#004F9F] tabular-nums">
                  {eur(
                    escalatedCases.reduce(
                      (s, c) => s + (c.estimatedFinancialSynergyEur || 0),
                      0
                    )
                  )}
                </div>
                <div className="text-[10px] text-slate-600 tabular-nums">
                  +{' '}
                  {escalatedCases.reduce(
                    (s, c) => s + (c.estimatedAvoidedEffortHours || 0),
                    0
                  )}{' '}
                  hrs non-cash effort
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">
                  Monthly Board Cadence
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  Day {deadlineCfg.boardMeetingDayOfMonth}
                </div>
                <div className="text-[10px] text-slate-600">
                  No initiatives auto-modified before Board ruling
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-md border border-slate-200">
              {escalatedCases.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-xs text-slate-500">
                  <div className="font-semibold text-slate-700">
                    No open Board escalations in the active portfolio
                  </div>
                  <p>
                    All redundancy &amp; synergy cases are either aligned by
                    owners or closed without unresolved Board conflicts.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {escalatedCases.slice(0, 3).map((c) => {
                    const pendingBoard = (props.boardDecisions ?? []).find(
                      (b) => b.caseId === c.id && b.status === 'PENDING'
                    );
                    const requiredDate =
                      pendingBoard?.scheduledMeetingDate ||
                      computeNextBoardMeetingDate(
                        c.escalatedAt ?? new Date(),
                        deadlineCfg.boardMeetingDayOfMonth,
                        deadlineCfg.holidays
                      );
                    const recommendedChoice = formatRecommendedChoice(
                      pendingBoard?.recommendedOption ?? c.recommendedOption,
                      c.decisionType
                    );
                    const decisionReq =
                      pendingBoard?.decisionRequested ||
                      c.decisionRequested ||
                      c.portfolioManagerRecommendation ||
                      'Review overlap and issue Board mandate.';

                    return (
                      <div key={c.id} className="p-3 text-xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-[#004F9F]">
                              {c.caseNumber}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {c.initiativeASnapshot.title} ↔{' '}
                              {c.initiativeBSnapshot.title}
                            </span>
                            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {deptName(c.initiativeASnapshot.departmentId)} /{' '}
                              {deptName(c.initiativeBSnapshot.departmentId)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 tabular-nums">
                            <span className="rounded border border-[#BFD7EE] bg-[#EBF3FB] px-2 py-0.5 text-[10px] font-semibold text-[#004F9F]">
                              Rec: {recommendedChoice}
                            </span>
                            <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-800">
                              Decision Due: {requiredDate}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-[11px]">
                          <div>
                            <span className="font-semibold text-slate-700">
                              Escalation Reason:{' '}
                            </span>
                            <span className="text-slate-600">
                              {pendingBoard?.escalationReason ||
                                c.escalationReason ||
                                c.similarityExplanation}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">
                              Decision Requested:{' '}
                            </span>
                            <span className="text-slate-800">{decisionReq}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">
                              Impact &amp; Manager Note:{' '}
                            </span>
                            <span className="text-slate-600 tabular-nums">
                              {eur(c.estimatedFinancialSynergyEur)} est. fin ·{' '}
                              {c.estimatedAvoidedEffortHours}h avoided —{' '}
                              {c.portfolioManagerRecommendation}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Slide Footer */}
      <footer className="flex items-center justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
        <span>
          AAS AI Governance — Enterprise AI Portfolio &amp; Value Management ·{' '}
          {props.scopeLabel}
        </span>
        <span className="tabular-nums">
          All KPIs computed live from active portfolio · Slide {meta.number} /{' '}
          {totalSlides}
        </span>
      </footer>
    </div>
  );
};

export const ExecutivePresentationDeck: React.FC<PresentationDeckProps> = (
  props
) => {
  const { open, onClose } = props;
  const [slideIndex, setSlideIndex] = useState(0);
  const [includeBoardEscalations, setIncludeBoardEscalations] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeSlides = includeBoardEscalations
    ? [...BASE_SLIDE_META, BOARD_ESCALATION_SLIDE_META]
    : BASE_SLIDE_META;
  const totalSlides = activeSlides.length;

  useEffect(() => {
    if (!open) return;
    setSlideIndex(0);
    setIncludeBoardEscalations(false);
  }, [open]);

  useEffect(() => {
    if (slideIndex >= totalSlides) {
      setSlideIndex(Math.max(0, totalSlides - 1));
    }
  }, [slideIndex, totalSlides]);

  useEffect(() => {
    if (!open) return;
    const maxIdx = totalSlides - 1;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setSlideIndex((i) => Math.min(maxIdx, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setSlideIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSlideIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSlideIndex(maxIdx);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, totalSlides]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Browser fullscreen may be restricted inside sandboxed iframes; overlay remains active.
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Interactive Fullscreen 16:9 Presentation Overlay */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Executive Presentation Mode (${totalSlides}-Slide 16:9 Deck)`}
        className="no-print fixed inset-0 z-[70] flex flex-col bg-slate-950/95 text-white"
      >
        {/* Presenter Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeSlides.map((s, idx) => (
              <button
                key={s.number}
                type="button"
                onClick={() => setSlideIndex(idx)}
                className={`rounded px-2.5 py-1 font-medium transition-colors whitespace-nowrap ${
                  slideIndex === idx
                    ? 'bg-[#004F9F] text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {s.shortLabel}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={includeBoardEscalations}
              onClick={() =>
                setIncludeBoardEscalations((prev) => {
                  const next = !prev;
                  if (!next && slideIndex >= BASE_SLIDE_META.length) {
                    setSlideIndex(BASE_SLIDE_META.length - 1);
                  }
                  return next;
                })
              }
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-medium transition-colors whitespace-nowrap ${
                includeBoardEscalations
                  ? 'border-red-400 bg-red-700 text-white hover:bg-red-800'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Include Board Escalations: {includeBoardEscalations ? 'ON' : 'OFF'}
              </span>
            </button>

            <span className="font-mono text-xs text-slate-300 tabular-nums px-1.5">
              {slideIndex + 1} / {totalSlides}
            </span>
            <button
              type="button"
              disabled={slideIndex === 0}
              onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous slide"
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              disabled={slideIndex === totalSlides - 1}
              onClick={() =>
                setSlideIndex((i) => Math.min(totalSlides - 1, i + 1))
              }
              aria-label="Next slide"
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={
                isFullscreen ? 'Exit browser fullscreen' : 'Enter browser fullscreen'
              }
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-medium text-white hover:bg-slate-700 whitespace-nowrap"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{isFullscreen ? 'Windowed' : 'Fullscreen'}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-medium text-white hover:bg-slate-700 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Print {totalSlides} Slides</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Exit presentation mode"
              className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 font-semibold text-slate-900 hover:bg-slate-100 whitespace-nowrap"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {/* Centered 16:9 Slide Stage */}
        <div className="flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
          <div className="aspect-[16/9] w-full max-w-[1200px] max-h-[calc(100vh-92px)] overflow-hidden rounded-lg border border-slate-700 bg-white shadow-2xl">
            <PresentationSlideContent
              slideIndex={slideIndex}
              totalSlides={totalSlides}
              props={props}
            />
          </div>
        </div>
      </div>

      {/* Print-Only Active Landscape 16:9 Slides */}
      <div className="presentation-print-deck">
        {activeSlides.map((_, idx) => (
          <PresentationSlideContent
            key={idx}
            slideIndex={idx}
            totalSlides={totalSlides}
            props={props}
          />
        ))}
      </div>
    </>
  );
};
