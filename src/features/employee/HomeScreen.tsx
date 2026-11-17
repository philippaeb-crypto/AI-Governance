import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Compass, FileEdit, PlusCircle } from 'lucide-react';
import {
  computePortfolioMetrics,
  isReviewOverdue,
} from '../../domain/calculations';
import { canCreateInitiative } from '../../domain/authorization';
import {
  CATEGORY_LABELS,
  Initiative,
  InitiativeDraft,
  PortfolioMetrics,
  VALUE_CATEGORY_LABELS,
} from '../../domain/types';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { LifecycleStatusBadge, ReviewStatusIndicator } from '../../components/StatusBadge';
import { useApp } from '../../services/appContext';

export const HomeScreen: React.FC = () => {
  const {
    repository,
    currentUser,
    departments,
    users,
    activeDataset,
    switchDataset,
    navigate,
    dataRevision,
    bumpDataRevision,
    notify,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [myInitiatives, setMyInitiatives] = useState<Initiative[]>([]);
  const [recentPortfolio, setRecentPortfolio] = useState<Initiative[]>([]);
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [draft, setDraft] = useState<InitiativeDraft | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const all = await repository.listInitiatives();
        if (!active) return;
        const mine = all.filter((i) => i.ownerId === currentUser.id);
        setMyInitiatives(mine);
        setRecentPortfolio(all.slice(0, 5));
        setMetrics(computePortfolioMetrics(all, departments));
        setDraft(repository.getDraft());
      } catch (err) {
        if (active) {
          notify(
            'error',
            'Unable to load initiatives',
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
  }, [repository, currentUser.id, departments, dataRevision, notify]);

  const myOverdue = myInitiatives.filter(
    (i) => i.lifecycleStatus !== 'RETIRE' && isReviewOverdue(i.nextReviewDue)
  );

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;
  const userName = (id: string) =>
    users.find((u) => u.id === id)?.displayName ?? id;

  const handleQuickMarkReviewed = async (initiative: Initiative) => {
    try {
      await repository.markOwnerReviewed(
        {
          initiativeId: initiative.id,
          expectedVersion: initiative.version,
        },
        currentUser
      );
      await bumpDataRevision();
      notify(
        'success',
        'Monthly review recorded',
        `${initiative.title} review due date extended by 30 days.`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to record review',
        err instanceof Error ? err.message : 'Unexpected error'
      );
    }
  };

  const canCreate = canCreateInitiative(currentUser);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {currentUser.displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {currentUser.jobTitle} · {deptName(currentUser.departmentId)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {draft && canCreate && (
            <button
              type="button"
              onClick={() => navigate({ page: 'intake' })}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <FileEdit className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Resume Saved Draft (Step {draft.step}/6)</span>
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => navigate({ page: 'intake' })}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
            >
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Start Smart Intake</span>
            </button>
          )}
        </div>
      </div>

      {/* Demo Experience & Scope Notice */}
      <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700 sm:flex-row sm:items-center">
        <div>
          <span className="font-semibold text-slate-900">
            Portfolio Visibility Scope & Demo Workspace:
          </span>{' '}
          Registering initiatives provides enterprise visibility, value tracking,
          and synergy discovery (no compliance or risk approval gates). Currently
          viewing{' '}
          <strong>
            {activeDataset === 'SAMPLE_DEMO'
              ? 'Sample Demo Data'
              : 'Imported Portfolio Data'}
          </strong>{' '}
          in local IndexedDB.
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              void switchDataset(
                activeDataset === 'SAMPLE_DEMO'
                  ? 'IMPORTED_PORTFOLIO'
                  : 'SAMPLE_DEMO'
              )
            }
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Switch to{' '}
            {activeDataset === 'SAMPLE_DEMO' ? 'Imported Data' : 'Sample Demo'}
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            My Owned Initiatives
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : myInitiatives.length}
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'my-initiatives' })}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          >
            <span>Manage my initiatives</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            My Overdue Monthly Reviews
          </div>
          <div
            className={`mt-1.5 text-2xl font-bold tabular-nums ${
              myOverdue.length > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {loading ? '—' : myOverdue.length}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {myOverdue.length > 0
              ? 'Action needed on owned items'
              : 'All owned initiatives current'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Total Portfolio Initiatives
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {loading || !metrics ? '—' : metrics.totalInitiatives}
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'explore' })}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          >
            <span>Explore full portfolio</span>
            <Compass className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            Active Solutions (Pilot + Prod)
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {loading || !metrics ? '—' : metrics.activeSolutionsCount}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Across {metrics?.departmentsRepresentedCount ?? 0} departments
          </div>
        </div>
      </div>

      {/* Overdue Reviews Action Section */}
      {myOverdue.length > 0 && (
        <section aria-labelledby="overdue-reviews-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="overdue-reviews-heading"
              className="text-base font-semibold text-slate-900"
            >
              Owned Initiatives Requiring Monthly Review
            </h2>
            <span className="text-xs text-slate-500">
              Manual review tracking (automated reminders planned for Phase 2)
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="divide-y divide-slate-200">
              {myOverdue.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-3 px-4 py-3.5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ page: 'detail', initiativeId: item.id })
                      }
                      className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {item.title}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{CATEGORY_LABELS[item.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{VALUE_CATEGORY_LABELS[item.valueCategory]}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <ReviewStatusIndicator
                      nextReviewDue={item.nextReviewDue}
                      lifecycleStatus={item.lifecycleStatus}
                      overdue={true}
                      dueSoon={false}
                    />
                    <button
                      type="button"
                      onClick={() => handleQuickMarkReviewed(item)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Mark Reviewed</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Portfolio Activity Table */}
      <section aria-labelledby="recent-portfolio-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="recent-portfolio-heading"
            className="text-base font-semibold text-slate-900"
          >
            Recently Updated Portfolio Initiatives
          </h2>
          <button
            type="button"
            onClick={() => navigate({ page: 'explore' })}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            View all initiatives
          </button>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5">Initiative</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Lifecycle</th>
                  <th className="px-4 py-2.5 text-right">Users</th>
                  <th className="px-4 py-2.5 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recentPortfolio.map((item) => (
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
                        className="text-left font-medium text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {item.title}
                      </button>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {CATEGORY_LABELS[item.category]} · {item.aiPlatform}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {deptName(item.departmentId)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {userName(item.ownerId)}
                    </td>
                    <td className="px-4 py-3">
                      <LifecycleStatusBadge status={item.lifecycleStatus} />
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 tabular-nums">
                      {item.usersCount}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(item.updatedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
