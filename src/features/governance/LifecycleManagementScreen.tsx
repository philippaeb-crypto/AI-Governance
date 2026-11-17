import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  GitBranch,
  GitCommitHorizontal,
  Pencil,
} from 'lucide-react';
import {
  computeDataQualityFlags,
  computeDevelopmentLeadTimeDays,
  computeLifecycleAnalytics,
  computeProductionAgingDays,
  computeStageAgingDays,
  computeStageTimeBreakdown,
  computeStoredLifecycleTransitions,
  isReviewDueSoon,
  isReviewOverdue,
} from '../../domain/calculations';
import {
  isGovernedExceptionTransition,
  validateLifecycleTransition,
} from '../../domain/lifecycle';
import {
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleEvent,
  LifecycleStatus,
  LIVE_STATUSES,
  PIPELINE_STATUSES,
} from '../../domain/types';
import { AbbottLogoSlot } from '../../components/AbbottLogoSlot';
import { LifecycleDistributionRedesignCharts } from '../../components/charts/LifecycleDistributionRedesignCharts';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { Modal } from '../../components/Modal';
import {
  LifecycleStatusBadge,
  ReviewStatusIndicator,
} from '../../components/StatusBadge';
import { useApp } from '../../services/appContext';

type PortfolioFilterMode =
  | 'all'
  | 'pipeline'
  | 'live'
  | 'monitoring'
  | 'scale'
  | 'retire'
  | 'overdue'
  | 'quality_issues';

type LifecycleTab = 'overview' | 'transitions';

export const LifecycleManagementScreen: React.FC = () => {
  const {
    repository,
    currentUser,
    departments,
    users,
    navigate,
    dataRevision,
    bumpDataRevision,
    notify,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [activeTab, setActiveTab] = useState<LifecycleTab>('overview');
  const [mode, setMode] = useState<PortfolioFilterMode>('all');
  const [selectedStage, setSelectedStage] = useState<LifecycleStatus | ''>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');

  // Lifecycle Transition Modal
  const [selectedInitiative, setSelectedInitiative] =
    useState<Initiative | null>(null);
  const [targetStatus, setTargetStatus] = useState<LifecycleStatus>(
    LifecycleStatus.ASSESSMENT
  );
  const [note, setNote] = useState('');
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Lifecycle Timeline Modal
  const [timelineInitiative, setTimelineInitiative] =
    useState<Initiative | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [all, allEvts] = await Promise.all([
          repository.listInitiatives(),
          repository.listAllLifecycleEvents(),
        ]);
        if (!active) return;
        setInitiatives(all);
        setEvents(allEvts);
      } catch (err) {
        if (active) {
          setInitiatives([]);
          notify(
            'error',
            'Unable to load lifecycle portfolio',
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
      scopedDepartments: departments,
    }),
    [initiatives, departments]
  );

  const analytics = useMemo(
    () =>
      computeLifecycleAnalytics(
        scopedPortfolio.initiatives,
        scopedPortfolio.scopedDepartments
      ),
    [scopedPortfolio]
  );

  const summary = useMemo(() => {
    const scopedInits = scopedPortfolio.initiatives;
    const pipeline = scopedInits.filter((i) =>
      PIPELINE_STATUSES.has(i.lifecycleStatus)
    ).length;
    const live = scopedInits.filter((i) =>
      LIVE_STATUSES.has(i.lifecycleStatus)
    ).length;
    const monitoring = scopedInits.filter(
      (i) => i.lifecycleStatus === LifecycleStatus.MONITORING
    ).length;
    const scale = scopedInits.filter(
      (i) => i.lifecycleStatus === LifecycleStatus.SCALE_IMPROVE
    ).length;
    const retire = scopedInits.filter(
      (i) => i.lifecycleStatus === LifecycleStatus.RETIRE
    ).length;
    const overdueCount = scopedInits.filter(
      (i) =>
        i.lifecycleStatus !== LifecycleStatus.RETIRE &&
        isReviewOverdue(i.nextReviewDue)
    ).length;

    const leadTimes = scopedInits
      .map((i) => computeDevelopmentLeadTimeDays(i, events))
      .filter((d): d is number => d !== null);
    const avgLeadDays =
      leadTimes.length > 0
        ? Math.round(leadTimes.reduce((s, d) => s + d, 0) / leadTimes.length)
        : null;

    const prodAgings = scopedInits
      .map((i) => computeProductionAgingDays(i, events))
      .filter((d): d is number => d !== null);
    const avgProdAgingDays =
      prodAgings.length > 0
        ? Math.round(prodAgings.reduce((s, d) => s + d, 0) / prodAgings.length)
        : null;

    return {
      pipeline,
      live,
      monitoring,
      scale,
      retire,
      overdueCount,
      avgLeadDays,
      leadSampleCount: leadTimes.length,
      avgProdAgingDays,
      prodSampleCount: prodAgings.length,
    };
  }, [scopedPortfolio.initiatives, events]);

  const filtered = useMemo(() => {
    return scopedPortfolio.initiatives.filter((item) => {
      if (selectedDepartmentId && item.departmentId !== selectedDepartmentId) {
        return false;
      }
      if (selectedStage && item.lifecycleStatus !== selectedStage) {
        return false;
      }
      if (mode === 'pipeline') return PIPELINE_STATUSES.has(item.lifecycleStatus);
      if (mode === 'live') return LIVE_STATUSES.has(item.lifecycleStatus);
      if (mode === 'monitoring') {
        return item.lifecycleStatus === LifecycleStatus.MONITORING;
      }
      if (mode === 'scale') {
        return item.lifecycleStatus === LifecycleStatus.SCALE_IMPROVE;
      }
      if (mode === 'retire') {
        return item.lifecycleStatus === LifecycleStatus.RETIRE;
      }
      if (mode === 'overdue') {
        return (
          item.lifecycleStatus !== LifecycleStatus.RETIRE &&
          isReviewOverdue(item.nextReviewDue)
        );
      }
      if (mode === 'quality_issues') {
        return computeDataQualityFlags(item).some(
          (f) => f.severity === 'warning'
        );
      }
      return true;
    });
  }, [
    scopedPortfolio.initiatives,
    selectedDepartmentId,
    selectedStage,
    mode,
  ]);

  const hasDrilldown = Boolean(
    selectedDepartmentId || selectedStage || mode !== 'all'
  );

  const clearAllFilters = () => {
    setSelectedDepartmentId('');
    setSelectedStage('');
    setMode('all');
  };

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;
  const userName = (id: string) =>
    users.find((u) => u.id === id)?.displayName ?? id;

  const openTransitionModal = (item: Initiative) => {
    const defaultNext =
      LIFECYCLE_ORDER.find((s) => s !== item.lifecycleStatus) ??
      LifecycleStatus.ASSESSMENT;
    setSelectedInitiative(item);
    setTargetStatus(defaultNext);
    setNote('');
    setTransitionError(null);
  };

  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInitiative) return;

    const check = validateLifecycleTransition({
      fromStatus: selectedInitiative.lifecycleStatus,
      toStatus: targetStatus,
      note,
    });
    if (!check.valid) {
      setTransitionError(check.error ?? 'Invalid transition.');
      return;
    }

    try {
      await repository.recordLifecycleEvent(
        {
          initiativeId: selectedInitiative.id,
          expectedVersion: selectedInitiative.version,
          toStatus: targetStatus,
          note,
        },
        currentUser
      );
      setSelectedInitiative(null);
      await bumpDataRevision();
      notify(
        'success',
        'Lifecycle updated',
        `${selectedInitiative.title} moved to ${LIFECYCLE_LABELS[targetStatus]}.`
      );
    } catch (err) {
      setTransitionError(
        err instanceof Error ? err.message : 'Unable to record transition'
      );
    }
  };

  const handleMarkReviewed = async (item: Initiative) => {
    try {
      await repository.markOwnerReviewed(
        {
          initiativeId: item.id,
          expectedVersion: item.version,
        },
        currentUser
      );
      await bumpDataRevision();
      notify('success', 'Review logged', `Recorded review for ${item.title}.`);
    } catch (err) {
      notify(
        'error',
        'Review update failed',
        err instanceof Error ? err.message : 'Unexpected error'
      );
    }
  };

  const isException =
    selectedInitiative !== null &&
    isGovernedExceptionTransition(
      selectedInitiative.lifecycleStatus,
      targetStatus
    );

  const timelineEvents = useMemo(() => {
    if (!timelineInitiative) return [];
    return events
      .filter((e) => e.initiativeId === timelineInitiative.id)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }, [timelineInitiative, events]);

  const timelineBreakdown = useMemo(() => {
    if (!timelineInitiative) return [];
    return computeStageTimeBreakdown(timelineInitiative, events);
  }, [timelineInitiative, events]);

  return (
    <div className="space-y-5">
      {/* Header with Abbott Branding & Department Filter */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <AbbottLogoSlot variant="header" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Lifecycle Management &amp; Distribution
            </h1>
          </div>
          <p className="text-sm text-slate-600">
            Where are AI initiatives currently located across the 8 lifecycle
            stages, overall and by department? Click any chart bar or segment to
            filter the initiatives below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label="Filter lifecycle by department"
            value={selectedDepartmentId}
            onChange={(e) => setSelectedDepartmentId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          >
            <option value="">All Departments</option>
            {scopedPortfolio.scopedDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Primary View Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Lifecycle view mode"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-white text-[#004F9F] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lifecycle Distribution Overview</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'transitions'}
            onClick={() => setActiveTab('transitions')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'transitions'
                ? 'bg-white text-[#004F9F] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lifecycle Analytics & Transition History</span>
          </button>
        </div>

        {hasDrilldown && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="rounded-md border border-[#BFD7EE] bg-[#EBF3FB] px-3 py-1.5 text-xs font-semibold text-[#004F9F] hover:bg-[#DCEAF9] whitespace-nowrap"
          >
            Clear Filters & Return to Overview
          </button>
        )}
      </div>

      {/* KPI Cards — Strictly Computed from Persisted Data */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Total Initiatives
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {analytics.totalInitiatives}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {scopedPortfolio.scopedDepartments.length} departments represented
          </div>
        </div>

        <div className="rounded-lg border border-[#BFD7EE] bg-[#EBF3FB]/50 p-4">
          <div className="text-xs font-semibold text-[#004F9F]">
            Largest Lifecycle Stage
          </div>
          <div className="mt-1 truncate text-xl font-bold text-slate-900">
            {analytics.largestStageLabel}
          </div>
          <div className="mt-1 text-[11px] text-[#004F9F] tabular-nums">
            {analytics.largestStageCount} initiative
            {analytics.largestStageCount === 1 ? '' : 's'} ({analytics.largestStagePercentage}%)
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Pipeline (Idea–Development)
          </div>
          <div className="mt-1 text-2xl font-bold text-[#0066B2] tabular-nums">
            {summary.pipeline}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            Early &amp; build funnel stages
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Live Portfolio (Pilot + Prod)
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
            {summary.live}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
            Mon {summary.monitoring} · Scale {summary.scale} · Ret {summary.retire}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Monthly Review Overdue
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              summary.overdueCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {summary.overdueCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Non-retired initiatives overdue
          </div>
        </div>
      </div>

      {/* Primary vs Secondary Analytics Area */}
      {activeTab === 'overview' ? (
        <LifecycleDistributionRedesignCharts
          analytics={analytics}
          activeStage={selectedStage}
          activeDepartmentId={selectedDepartmentId}
          onSelectStage={(stage) => {
            setSelectedStage(stage);
            if (stage) setMode('all');
          }}
          onSelectDepartment={(deptId) => setSelectedDepartmentId(deptId)}
          onSelectDepartmentStage={(deptId, stage) => {
            if (
              selectedDepartmentId === deptId &&
              selectedStage === stage
            ) {
              setSelectedDepartmentId('');
              setSelectedStage('');
            } else {
              setSelectedDepartmentId(deptId);
              setSelectedStage(stage);
              setMode('all');
            }
          }}
          onClearDrilldown={clearAllFilters}
        />
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Stored Lifecycle Timing &amp; Transition History
              </h2>
              <p className="text-xs text-slate-500">
                Computed strictly from recorded stage transition events and stored Idea / Go-Live dates without fabricating movements.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 tabular-nums">
              <span>
                Avg Dev Lead Time (Idea → Prod):{' '}
                <strong className="text-slate-900">
                  {summary.avgLeadDays !== null
                    ? `${summary.avgLeadDays}d (${summary.leadSampleCount})`
                    : 'N/A'}
                </strong>
              </span>
              <span>
                Avg Production Aging:{' '}
                <strong className="text-slate-900">
                  {summary.avgProdAgingDays !== null
                    ? `${summary.avgProdAgingDays}d (${summary.prodSampleCount})`
                    : 'N/A'}
                </strong>
              </span>
            </div>
          </div>

          {(() => {
            const filteredIds = new Set(filtered.map((i) => i.id));
            const transitions = computeStoredLifecycleTransitions(
              events,
              filteredIds
            );
            const totalTransitions = transitions.reduce((s, t) => s + t.count, 0);
            if (transitions.length === 0) {
              return (
                <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  No historical stage transitions recorded for the current filter.
                </div>
              );
            }
            return (
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-3 py-2">From Stage</th>
                      <th className="px-3 py-2">To Stage</th>
                      <th className="px-3 py-2 text-right">Transitions</th>
                      <th className="px-3 py-2 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {transitions.map((t) => (
                      <tr key={`${t.fromStatus}-${t.toStatus}`}>
                        <td className="px-3 py-2 font-medium text-slate-700">
                          {LIFECYCLE_LABELS[t.fromStatus]}
                        </td>
                        <td className="px-3 py-2 font-semibold text-[#004F9F]">
                          {LIFECYCLE_LABELS[t.toStatus]}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {t.count}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                          {totalTransitions > 0
                            ? `${Math.round((t.count / totalTransitions) * 100)}%`
                            : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>
      )}

      {/* Cohort Filter Tabs & Table Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1">
          {(
            [
              {
                id: 'all',
                label: `All (${scopedPortfolio.initiatives.length})`,
              },
              { id: 'pipeline', label: `Pipeline (${summary.pipeline})` },
              { id: 'live', label: `Live Portfolio (${summary.live})` },
              { id: 'monitoring', label: `Monitoring (${summary.monitoring})` },
              { id: 'scale', label: `Scale / Improve (${summary.scale})` },
              { id: 'retire', label: `Retire (${summary.retire})` },
              { id: 'overdue', label: `Overdue Reviews (${summary.overdueCount})` },
              { id: 'quality_issues', label: 'Data Quality Warnings' },
            ] as Array<{ id: PortfolioFilterMode; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                if (tab.id !== 'all') setSelectedStage('');
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === tab.id && !selectedStage
                  ? 'bg-white text-[#004F9F] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs font-medium text-slate-600 tabular-nums">
          Showing <strong>{filtered.length}</strong> of{' '}
          {scopedPortfolio.initiatives.length} initiatives
          {selectedStage ? ` · Stage: ${LIFECYCLE_LABELS[selectedStage]}` : ''}
          {selectedDepartmentId
            ? ` · Dept: ${deptName(selectedDepartmentId)}`
            : ''}
        </span>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No initiatives match current lifecycle filters"
          description="Clear your stage or department selection to view all initiatives."
          actionLabel="Clear Filters & Return to Overview"
          onAction={clearAllFilters}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-2.5">Initiative</th>
                <th className="px-4 py-2.5">Department & Owner</th>
                <th className="px-4 py-2.5">Stage</th>
                <th className="px-4 py-2.5 text-right">Stage Aging</th>
                <th className="px-4 py-2.5 text-right">Dev Lead (Idea→Prod)</th>
                <th className="px-4 py-2.5 text-right">Prod Aging</th>
                <th className="px-4 py-2.5">Review Schedule</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((item) => {
                const overdue = isReviewOverdue(item.nextReviewDue);
                const dueSoon = isReviewDueSoon(item.nextReviewDue);
                const agingDays = computeStageAgingDays(item, events);
                const leadDays = computeDevelopmentLeadTimeDays(item, events);
                const prodDays = computeProductionAgingDays(item, events);
                return (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ page: 'detail', initiativeId: item.id })
                        }
                        className="text-left font-medium text-slate-900 hover:text-[#004F9F] hover:underline"
                      >
                        {item.title}
                      </button>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {item.businessCapability || 'Capability not set'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <div>{deptName(item.departmentId)}</div>
                      <div className="text-slate-500">
                        {item.ownerId ? userName(item.ownerId) : 'Unassigned'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <LifecycleStatusBadge status={item.lifecycleStatus} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {agingDays !== null ? `${agingDays}d` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {leadDays !== null ? `${leadDays}d` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {prodDays !== null ? `${prodDays}d` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ReviewStatusIndicator
                        nextReviewDue={item.nextReviewDue}
                        lifecycleStatus={item.lifecycleStatus}
                        overdue={overdue}
                        dueSoon={dueSoon}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setTimelineInitiative(item)}
                          aria-label={`Timeline for ${item.title}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Timeline</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openTransitionModal(item)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <GitCommitHorizontal
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>Transition</span>
                        </button>
                        {item.lifecycleStatus !== LifecycleStatus.RETIRE && (
                          <button
                            type="button"
                            onClick={() => handleMarkReviewed(item)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <CheckCircle2
                              className="h-3.5 w-3.5 text-emerald-600"
                              aria-hidden="true"
                            />
                            <span>Review</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              page: 'detail',
                              initiativeId: item.id,
                              startInEditMode: true,
                            })
                          }
                          aria-label={`Edit ${item.title}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lifecycle Transition Modal */}
      <Modal
        open={selectedInitiative !== null}
        onClose={() => setSelectedInitiative(null)}
        title={`Transition: ${selectedInitiative?.title ?? ''}`}
        description={
          selectedInitiative
            ? `Current stage: ${LIFECYCLE_LABELS[selectedInitiative.lifecycleStatus]}`
            : ''
        }
      >
        {selectedInitiative && (
          <form onSubmit={handleTransitionSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="gov-target-status"
                className="block text-xs font-semibold text-slate-700"
              >
                Target Lifecycle Status
              </label>
              <select
                id="gov-target-status"
                value={targetStatus}
                onChange={(e) => {
                  setTargetStatus(e.target.value as LifecycleStatus);
                  setTransitionError(null);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#004F9F] focus:outline-none"
              >
                {LIFECYCLE_ORDER.map((s) => (
                  <option
                    key={s}
                    value={s}
                    disabled={s === selectedInitiative.lifecycleStatus}
                  >
                    {LIFECYCLE_LABELS[s]}
                    {s === selectedInitiative.lifecycleStatus
                      ? ' (Current)'
                      : ''}
                  </option>
                ))}
              </select>
            </div>

            {isException && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <strong>Governed Exception:</strong> This transition skips
                  standard stage progression. An audit reason is required.
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="gov-transition-note"
                className="block text-xs font-semibold text-slate-700"
              >
                {isException ? 'Exception Reason *' : 'Transition Note *'}
              </label>
              <textarea
                id="gov-transition-note"
                rows={3}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setTransitionError(null);
                }}
                placeholder="Document portfolio rationale for the immutable lifecycle log..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#004F9F] focus:outline-none"
              />
              {transitionError && (
                <p className="mt-1 text-xs text-red-600">{transitionError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedInitiative(null)}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E]"
              >
                Record Transition
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Initiative Lifecycle Timeline & Stage Duration Modal */}
      <Modal
        open={timelineInitiative !== null}
        onClose={() => setTimelineInitiative(null)}
        title={`Lifecycle Timeline: ${timelineInitiative?.title ?? ''}`}
        description={
          timelineInitiative
            ? `${deptName(timelineInitiative.departmentId)} · Current stage: ${LIFECYCLE_LABELS[timelineInitiative.lifecycleStatus]}`
            : ''
        }
      >
        {timelineInitiative && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
              <div>
                <div className="text-slate-500">Idea Date</div>
                <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">
                  {timelineInitiative.ideaDate || '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Go-Live Date</div>
                <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">
                  {timelineInitiative.goLiveDate || 'Not set'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Dev Lead (Idea→Prod)</div>
                <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">
                  {computeDevelopmentLeadTimeDays(timelineInitiative, events) !==
                  null
                    ? `${computeDevelopmentLeadTimeDays(timelineInitiative, events)} days`
                    : 'Not in Production'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Production Aging</div>
                <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">
                  {computeProductionAgingDays(timelineInitiative, events) !==
                  null
                    ? `${computeProductionAgingDays(timelineInitiative, events)} days`
                    : 'N/A'}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                Time Spent in Each Stage (From Stored Events)
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {timelineBreakdown.map((entry) => (
                  <div
                    key={entry.status}
                    className={`rounded border px-2.5 py-1.5 tabular-nums ${
                      entry.isCurrent
                        ? 'border-[#004F9F] bg-blue-50 text-[#004F9F]'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span className="font-semibold">{entry.label}:</span>{' '}
                    <span>{entry.days}d</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-800">
                Recorded Lifecycle Events ({timelineEvents.length})
              </h3>
              {timelineEvents.length === 0 ? (
                <p className="mt-1.5 text-slate-500">
                  No lifecycle transition events recorded yet. Initial created
                  timestamp: {timelineInitiative.createdAt}.
                </p>
              ) : (
                <ol className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
                  {timelineEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded border border-slate-200 bg-white p-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {ev.fromStatus
                            ? `${LIFECYCLE_LABELS[ev.fromStatus]} → ${LIFECYCLE_LABELS[ev.toStatus]}`
                            : `Initialized at ${LIFECYCLE_LABELS[ev.toStatus]}`}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {new Date(ev.timestamp).toLocaleDateString('en-US')} ·{' '}
                          {ev.actorName}
                        </span>
                      </div>
                      {ev.note && (
                        <p className="mt-1 text-slate-600">{ev.note}</p>
                      )}
                      {ev.isGovernedException && (
                        <span className="mt-1 inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          Governed Exception
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
