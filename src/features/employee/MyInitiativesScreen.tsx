import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  Eye,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
} from 'lucide-react';
import { canEditInitiative } from '../../domain/authorization';
import {
  computeInitiativeCompleteness,
  isReviewDueSoon,
  isReviewOverdue,
} from '../../domain/calculations';
import {
  CATEGORY_LABELS,
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleStatus,
  VALUE_CATEGORY_LABELS,
} from '../../domain/types';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { Modal } from '../../components/Modal';
import {
  LifecycleStatusBadge,
  ReviewStatusIndicator,
} from '../../components/StatusBadge';
import { useApp } from '../../services/appContext';

type SortField = 'updatedAt' | 'title' | 'lifecycleStatus' | 'nextReviewDue';

export const MyInitiativesScreen: React.FC = () => {
  const {
    repository,
    currentUser,
    departments,
    navigate,
    dataRevision,
    bumpDataRevision,
    notify,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LifecycleStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Initiative | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const owned = await repository.listInitiatives({
          ownerId: currentUser.id,
        });
        if (active) setInitiatives(owned);
      } catch (err) {
        if (active) {
          setInitiatives([]);
          notify(
            'error',
            'Unable to load my initiatives',
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
  }, [repository, currentUser.id, dataRevision, notify]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = initiatives.filter((item) => {
      if (statusFilter && item.lifecycleStatus !== statusFilter) return false;
      if (
        overdueOnly &&
        (item.lifecycleStatus === LifecycleStatus.RETIRE ||
          !isReviewOverdue(item.nextReviewDue))
      ) {
        return false;
      }
      if (q) {
        const match =
          item.title.toLowerCase().includes(q) ||
          item.businessCapability.toLowerCase().includes(q) ||
          item.aiPlatform.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === 'lifecycleStatus') {
        cmp = a.lifecycleStatus.localeCompare(b.lifecycleStatus);
      } else if (sortField === 'nextReviewDue') {
        cmp = Date.parse(a.nextReviewDue) - Date.parse(b.nextReviewDue);
      } else {
        cmp = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
      }
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [initiatives, search, statusFilter, overdueOnly, sortField, sortAsc]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'title' || field === 'nextReviewDue');
    }
  };

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

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
      notify(
        'success',
        'Review recorded',
        `Updated next monthly review due date for "${item.title}".`
      );
    } catch (err) {
      notify(
        'error',
        'Failed to mark reviewed',
        err instanceof Error ? err.message : 'Unexpected error'
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await repository.deleteInitiative(deleteTarget.id, currentUser);
      await bumpDataRevision();
      notify(
        'success',
        'Initiative deleted',
        `"${deleteTarget.title}" was deleted from the active workspace dataset.`
      );
      setDeleteTarget(null);
    } catch (err) {
      notify(
        'error',
        'Failed to delete initiative',
        err instanceof Error ? err.message : 'Unexpected error'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            My Initiatives
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            AI initiatives owned by {currentUser.displayName}. You can edit
            details, update usage figures, and log monthly owner reviews.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ page: 'intake' })}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Register AI Initiative</span>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <label htmlFor="my-search" className="sr-only">
            Search my initiatives
          </label>
          <input
            id="my-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, capability, or platform..."
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="my-status-filter" className="sr-only">
            Filter by lifecycle status
          </label>
          <select
            id="my-status-filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as LifecycleStatus | '')
            }
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-slate-400 focus:outline-none"
          >
            <option value="">All Lifecycle Stages</option>
            {LIFECYCLE_ORDER.map((st) => (
              <option key={st} value={st}>
                {LIFECYCLE_LABELS[st]}
              </option>
            ))}
          </select>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-slate-300 text-slate-900"
            />
            <span>Overdue Reviews Only</span>
          </label>
        </div>
      </div>

      {/* Table or Empty State */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : initiatives.length === 0 ? (
        <EmptyState
          title="No owned AI initiatives yet"
          description="You are not listed as the accountable owner of any registered initiatives under this profile. Start the Smart Intake to register an AI initiative."
          actionLabel="Register AI Initiative"
          onAction={() => navigate({ page: 'intake' })}
        />
      ) : filteredAndSorted.length === 0 ? (
        <EmptyState
          title="No initiatives match your filters"
          description="Try clearing the search query, lifecycle filter, or overdue-only toggle."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearch('');
            setStatusFilter('');
            setOverdueOnly(false);
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('title')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Initiative</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('lifecycleStatus')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Lifecycle</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="px-4 py-2.5">Value & Usage</th>
                <th className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('updatedAt')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Updated</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort('nextReviewDue')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Review Due</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAndSorted.map((item) => {
                const overdue = isReviewOverdue(item.nextReviewDue);
                const dueSoon = isReviewDueSoon(item.nextReviewDue);
                const editable = canEditInitiative(currentUser, item);
                const completeness = computeInitiativeCompleteness(item);
                const provLabel =
                  item.provenance === 'IMPORTED_EXCEL'
                    ? 'Imported Excel'
                    : item.provenance === 'USER_CREATED'
                      ? 'User Created'
                      : 'Seed Demo';
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
                        className="text-left font-medium text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {item.title}
                      </button>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {deptName(item.departmentId)} · {CATEGORY_LABELS[item.category]} · {provLabel} ·{' '}
                        <span className="tabular-nums">
                          {completeness.scorePercent}% complete
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <LifecycleStatusBadge status={item.lifecycleStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 tabular-nums">
                      <div className="font-medium text-slate-800">
                        {VALUE_CATEGORY_LABELS[item.valueCategory]}
                      </div>
                      <div className="text-slate-500">
                        {item.usersCount} users · {item.processFrequencyPerWeek}/wk
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {new Date(item.updatedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
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
                          onClick={() =>
                            navigate({ page: 'detail', initiativeId: item.id })
                          }
                          aria-label={`View ${item.title}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>View</span>
                        </button>
                        {editable && (
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
                        )}
                        {editable &&
                          item.lifecycleStatus !== LifecycleStatus.RETIRE && (
                            <button
                              type="button"
                              onClick={() => handleMarkReviewed(item)}
                              aria-label={`Mark ${item.title} reviewed`}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <CheckCircle2
                                className="h-3.5 w-3.5 text-emerald-600"
                                aria-hidden="true"
                              />
                              <span>Review</span>
                            </button>
                          )}
                        {editable && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            aria-label={`Delete ${item.title}`}
                            className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Initiative?"
        description="This permanently removes the selected initiative and its lifecycle history from the active IndexedDB demo dataset."
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
              <strong>{deleteTarget.title}</strong> ({deleteTarget.id})
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{deleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
