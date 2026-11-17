import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, Search } from 'lucide-react';
import { computePortfolioMetrics } from '../../domain/calculations';
import {
  CATEGORY_LABELS,
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleStatus,
  RegistrableCategory,
  VALUE_CATEGORY_LABELS,
  ValueCategory,
} from '../../domain/types';
import { PortfolioDistributionCharts } from '../../components/charts/PortfolioDistributionCharts';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { LifecycleStatusBadge } from '../../components/StatusBadge';
import { useApp } from '../../services/appContext';

export const ExplorePortfolioScreen: React.FC = () => {
  const { repository, departments, users, navigate, dataRevision, notify } =
    useApp();

  const [loading, setLoading] = useState(true);
  const [allInitiatives, setAllInitiatives] = useState<Initiative[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState<LifecycleStatus | ''>('');
  const [category, setCategory] = useState<RegistrableCategory | ''>('');
  const [valueCategory, setValueCategory] = useState<ValueCategory | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [aiPlatform, setAiPlatform] = useState('');
  const [needsCompletionOnly, setNeedsCompletionOnly] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [unfiltered, filtered] = await Promise.all([
          repository.listInitiatives(),
          repository.listInitiatives({
            search,
            departmentId: departmentId || undefined,
            lifecycleStatus,
            category,
            valueCategory,
            ownerId: ownerId || undefined,
            aiPlatform: aiPlatform || undefined,
            needsCompletionOnly,
          }),
        ]);
        if (active) {
          setAllInitiatives(unfiltered);
          setInitiatives(filtered);
        }
      } catch (err) {
        if (active) {
          setInitiatives([]);
          notify(
            'error',
            'Unable to load portfolio',
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
  }, [
    repository,
    search,
    departmentId,
    lifecycleStatus,
    category,
    valueCategory,
    ownerId,
    aiPlatform,
    needsCompletionOnly,
    dataRevision,
    notify,
  ]);

  const overviewMetrics = useMemo(
    () => computePortfolioMetrics(allInitiatives, departments),
    [allInitiatives, departments]
  );

  const distinctPlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const i of allInitiatives) {
      if (i.aiPlatform.trim()) set.add(i.aiPlatform.trim());
    }
    return Array.from(set).sort();
  }, [allInitiatives]);

  const distinctOwners = useMemo(() => {
    const ids = new Set(allInitiatives.map((i) => i.ownerId).filter(Boolean));
    return Array.from(ids)
      .map((id) => ({
        id,
        name: users.find((u) => u.id === id)?.displayName ?? id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allInitiatives, users]);

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;
  const userName = (id: string) =>
    users.find((u) => u.id === id)?.displayName ?? id;

  const hasActiveFilters = Boolean(
    search ||
      departmentId ||
      lifecycleStatus ||
      category ||
      valueCategory ||
      ownerId ||
      aiPlatform ||
      needsCompletionOnly
  );

  const clearFilters = () => {
    setSearch('');
    setDepartmentId('');
    setLifecycleStatus('');
    setCategory('');
    setValueCategory('');
    setOwnerId('');
    setAiPlatform('');
    setNeedsCompletionOnly(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Portfolio Overview & Registry Explorer
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Enterprise-wide visibility across Pipeline, Live Portfolio (Pilot +
            Production), Monitoring, Scale / Improve, and Retire stages. Click any
            chart bar to filter the inventory below.
          </p>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#004F9F] hover:bg-slate-50 whitespace-nowrap"
          >
            Reset Active Filters
          </button>
        )}
      </div>

      {/* Portfolio KPI Summary Strip — Strictly Separated Cohorts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="truncate text-[11px] font-medium text-slate-500">
            Total Initiatives
          </div>
          <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
            {overviewMetrics.totalInitiatives}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="truncate text-[11px] font-medium text-slate-500">
            Pipeline (Idea–Dev)
          </div>
          <div className="mt-0.5 text-lg font-bold text-[#0066B2] tabular-nums">
            {overviewMetrics.pipelineCount}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="truncate text-[11px] font-medium text-slate-500">
            Live (Pilot + Prod)
          </div>
          <div className="mt-0.5 text-lg font-bold text-emerald-700 tabular-nums">
            {overviewMetrics.liveCount}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="truncate text-[11px] font-medium text-slate-500">
            Monitoring
          </div>
          <div className="mt-0.5 text-lg font-bold text-teal-700 tabular-nums">
            {overviewMetrics.monitoringCount}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="truncate text-[11px] font-medium text-slate-500">
            Scale / Improve
          </div>
          <div className="mt-0.5 text-lg font-bold text-indigo-700 tabular-nums">
            {overviewMetrics.scaleImproveCount}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="truncate text-[11px] font-medium text-slate-500">
            Retire
          </div>
          <div className="mt-0.5 text-lg font-bold text-slate-600 tabular-nums">
            {overviewMetrics.retiredCount}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="truncate text-[11px] font-medium text-slate-500">
            Active Users
          </div>
          <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
            {overviewMetrics.totalRegisteredUsers.toLocaleString('en-US')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNeedsCompletionOnly((v) => !v)}
          className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
            needsCompletionOnly
              ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-400'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="truncate text-[11px] font-medium text-amber-800">
            Needs Completion
          </div>
          <div className="mt-0.5 text-lg font-bold text-amber-900 tabular-nums">
            {overviewMetrics.needsCompletionCount}
          </div>
        </button>
      </div>

      {/* Interactive Portfolio Charts */}
      <PortfolioDistributionCharts
        metrics={overviewMetrics}
        activeDepartmentId={departmentId}
        activeStatus={lifecycleStatus}
        onSelectDepartment={(dept) => setDepartmentId(dept)}
        onSelectStatus={(status) => setLifecycleStatus(status)}
      />

      {/* Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3.5 md:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <label htmlFor="explore-search" className="sr-only">
            Search portfolio initiatives
          </label>
          <input
            id="explore-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, capability, or platform..."
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#004F9F] focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="explore-dept" className="sr-only">
            Filter by department
          </label>
          <select
            id="explore-dept"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-[#004F9F] focus:outline-none"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="explore-owner" className="sr-only">
            Filter by owner
          </label>
          <select
            id="explore-owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-[#004F9F] focus:outline-none"
          >
            <option value="">All Owners</option>
            {distinctOwners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="explore-status" className="sr-only">
            Filter by lifecycle status
          </label>
          <select
            id="explore-status"
            value={lifecycleStatus}
            onChange={(e) =>
              setLifecycleStatus(e.target.value as LifecycleStatus | '')
            }
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-[#004F9F] focus:outline-none"
          >
            <option value="">All Lifecycle Stages</option>
            {LIFECYCLE_ORDER.map((s) => (
              <option key={s} value={s}>
                {LIFECYCLE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="explore-platform" className="sr-only">
            Filter by AI platform
          </label>
          <select
            id="explore-platform"
            value={aiPlatform}
            onChange={(e) => setAiPlatform(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-[#004F9F] focus:outline-none"
          >
            <option value="">All AI Platforms</option>
            {distinctPlatforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Secondary Row: Category + Value Category Segmented Filter + Incomplete Flag */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-600 tabular-nums">
            Showing {initiatives.length} of {allInitiatives.length} initiative
            {allInitiatives.length === 1 ? '' : 's'}
          </span>

          <select
            aria-label="Filter by AI category"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as RegistrableCategory | '')
            }
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
          >
            <option value="">All AI Categories</option>
            {Object.values(RegistrableCategory).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={needsCompletionOnly}
              onChange={(e) => setNeedsCompletionOnly(e.target.checked)}
            />
            <span>Needs Data Completion only</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setValueCategory('')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              valueCategory === ''
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Value Types
          </button>
          {Object.values(ValueCategory).map((vc) => (
            <button
              key={vc}
              type="button"
              onClick={() => setValueCategory(vc)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                valueCategory === vc
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {VALUE_CATEGORY_LABELS[vc]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : initiatives.length === 0 ? (
        <EmptyState
          title="No matching initiatives found"
          description="No portfolio records match the active search and filter criteria."
          actionLabel="Reset Filters"
          onAction={clearFilters}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-2.5">Initiative & Capability</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Accountable Owner</th>
                <th className="px-4 py-2.5">Category & Value</th>
                <th className="px-4 py-2.5">Lifecycle & Data Status</th>
                <th className="px-4 py-2.5 text-right">Users</th>
                <th className="px-4 py-2.5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {initiatives.map((item) => (
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
                      {item.businessCapability || 'Capability not specified'} ·{' '}
                      {item.aiPlatform}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {deptName(item.departmentId)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {item.ownerId ? userName(item.ownerId) : 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    <div className="font-medium text-slate-800">
                      {CATEGORY_LABELS[item.category]}
                    </div>
                    <div className="text-slate-500">
                      {VALUE_CATEGORY_LABELS[item.valueCategory]}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <LifecycleStatusBadge status={item.lifecycleStatus} />
                      {item.needsDataCompletion && (
                        <span
                          title={
                            item.missingDataFields?.length
                              ? `Missing: ${item.missingDataFields.join(', ')}`
                              : 'Needs Data Completion'
                          }
                          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          <span>Needs Data Completion</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 tabular-nums">
                    {item.usersCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ page: 'detail', initiativeId: item.id })
                      }
                      aria-label={`View details for ${item.title}`}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Details</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
