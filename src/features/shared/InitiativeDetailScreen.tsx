import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  GitCommitHorizontal,
  Lock,
  Pencil,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  canEditInitiative,
  canMarkOwnerReviewed,
  canTransitionLifecycle,
} from '../../domain/authorization';
import {
  calculateEfficiencyMetrics,
  computeDataQualityFlags,
  computeDevelopmentLeadTimeDays,
  computeInitiativeCompleteness,
  computeProductionAgingDays,
  isReviewDueSoon,
  isReviewOverdue,
} from '../../domain/calculations';
import { AppRepositoryError } from '../../domain/errors';
import {
  isGovernedExceptionTransition,
  validateLifecycleTransition,
} from '../../domain/lifecycle';
import {
  AI_PLATFORMS,
  AI_TYPES,
  CATEGORY_LABELS,
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleEvent,
  LifecycleStatus,
  RegistrableCategory,
  SOLUTION_TYPES,
  VALUE_CATEGORY_DESCRIPTIONS,
  VALUE_CATEGORY_LABELS,
  ValueCategory,
} from '../../domain/types';
import { validateCreateInitiativeInput } from '../../domain/validation';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { Modal } from '../../components/Modal';
import {
  LifecycleStatusBadge,
  ReviewStatusIndicator,
} from '../../components/StatusBadge';
import { useApp } from '../../services/appContext';

interface InitiativeDetailScreenProps {
  initiativeId: string;
  startInEditMode?: boolean;
}

export const InitiativeDetailScreen: React.FC<InitiativeDetailScreenProps> = ({
  initiativeId,
  startInEditMode = false,
}) => {
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initiative, setInitiative] = useState<Initiative | null>(null);
  const [history, setHistory] = useState<LifecycleEvent[]>([]);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Lifecycle transition modal state
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<LifecycleStatus>(
    LifecycleStatus.ASSESSMENT
  );
  const [transitionNote, setTransitionNote] = useState('');
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const record = await repository.getInitiative(initiativeId);
      setInitiative(record.initiative);
      setHistory(record.lifecycleHistory);
      setFormState({
        title: record.initiative.title,
        businessProblem: record.initiative.businessProblem,
        description: record.initiative.description,
        businessCapability: record.initiative.businessCapability,
        departmentId: record.initiative.departmentId,
        ownerId: record.initiative.ownerId,
        aiPlatform: record.initiative.aiPlatform,
        solutionType: record.initiative.solutionType,
        aiType: record.initiative.aiType,
        category: record.initiative.category,
        valueCategory: record.initiative.valueCategory,
        usersCount: String(record.initiative.usersCount),
        minutesSavedPerOccurrence: String(
          record.initiative.minutesSavedPerOccurrence
        ),
        processFrequencyPerWeek: String(
          record.initiative.processFrequencyPerWeek
        ),
        hourlyRate:
          record.initiative.hourlyRate !== undefined
            ? String(record.initiative.hourlyRate)
            : '',
        qualityEvidenceOrKpi: record.initiative.qualityEvidenceOrKpi ?? '',
        strategicSuccessIndicator:
          record.initiative.strategicSuccessIndicator ?? '',
        ideaDate: record.initiative.ideaDate,
        goLiveDate: record.initiative.goLiveDate ?? '',
      });

      if (
        startInEditMode &&
        canEditInitiative(currentUser, record.initiative)
      ) {
        setEditing(true);
      } else {
        setEditing(false);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load initiative.'
      );
    } finally {
      setLoading(false);
    }
  }, [repository, initiativeId, startInEditMode, currentUser]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail, dataRevision]);

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;
  const userName = (id: string) =>
    users.find((u) => u.id === id)?.displayName ?? id;

  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  if (loadError || !initiative) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-6">
        <h2 className="text-base font-semibold text-red-800">
          Initiative could not be loaded
        </h2>
        <p className="mt-1 text-sm text-slate-600">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate({ page: 'explore' })}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Portfolio</span>
        </button>
      </div>
    );
  }

  const canEdit = canEditInitiative(currentUser, initiative);
  const canReview = canMarkOwnerReviewed(currentUser, initiative);
  const canChangeLifecycle = canTransitionLifecycle(currentUser, initiative);

  const effMetrics = calculateEfficiencyMetrics(
    initiative.valueCategory,
    initiative.usersCount,
    initiative.minutesSavedPerOccurrence,
    initiative.processFrequencyPerWeek,
    initiative.hourlyRate
  );

  const overdue = isReviewOverdue(initiative.nextReviewDue);
  const dueSoon = isReviewDueSoon(initiative.nextReviewDue);
  const qualityFlags = computeDataQualityFlags(initiative);
  const completeness = computeInitiativeCompleteness(initiative);
  const provenanceLabel =
    initiative.provenance === 'IMPORTED_EXCEL'
      ? 'Imported Excel'
      : initiative.provenance === 'USER_CREATED'
        ? 'User Created'
        : 'Seed Demo';

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: formState.title,
      businessProblem: formState.businessProblem,
      description: formState.description,
      businessCapability: formState.businessCapability,
      departmentId: formState.departmentId,
      ownerId: formState.ownerId,
      aiPlatform: formState.aiPlatform,
      solutionType: formState.solutionType,
      aiType: formState.aiType,
      category: formState.category as RegistrableCategory,
      lifecycleStatus: initiative.lifecycleStatus,
      valueCategory: formState.valueCategory as ValueCategory,
      usersCount: formState.usersCount,
      minutesSavedPerOccurrence: formState.minutesSavedPerOccurrence,
      processFrequencyPerWeek: formState.processFrequencyPerWeek,
      hourlyRate: formState.hourlyRate === '' ? undefined : formState.hourlyRate,
      ideaDate: formState.ideaDate,
      goLiveDate: formState.goLiveDate || undefined,
    };

    const errors = validateCreateInitiativeInput(payload);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      await repository.updateInitiative(
        {
          id: initiative.id,
          expectedVersion: initiative.version,
          patch: {
            ...payload,
            usersCount: Number(formState.usersCount),
            minutesSavedPerOccurrence: Number(
              formState.minutesSavedPerOccurrence
            ),
            processFrequencyPerWeek: Number(formState.processFrequencyPerWeek),
            hourlyRate:
              formState.hourlyRate === ''
                ? undefined
                : Number(formState.hourlyRate),
            qualityEvidenceOrKpi:
              formState.qualityEvidenceOrKpi.trim() || undefined,
            strategicSuccessIndicator:
              formState.strategicSuccessIndicator.trim() || undefined,
          },
        },
        currentUser
      );
      setEditing(false);
      await bumpDataRevision();
      notify('success', 'Initiative updated', 'Changes saved to local demo store.');
    } catch (err) {
      if (err instanceof AppRepositoryError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
      notify(
        'error',
        'Could not save changes',
        err instanceof Error ? err.message : 'Unexpected error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReviewed = async () => {
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
        'Monthly owner review recorded',
        'Next review due date has been extended by 30 days.'
      );
    } catch (err) {
      notify(
        'error',
        'Review update failed',
        err instanceof Error ? err.message : 'Unexpected error'
      );
    }
  };

  const openTransitionModal = () => {
    const nextDefault =
      LIFECYCLE_ORDER.find((s) => s !== initiative.lifecycleStatus) ??
      LifecycleStatus.ASSESSMENT;
    setTargetStatus(nextDefault);
    setTransitionNote('');
    setTransitionError(null);
    setTransitionOpen(true);
  };

  const handleRecordTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateLifecycleTransition({
      fromStatus: initiative.lifecycleStatus,
      toStatus: targetStatus,
      note: transitionNote,
    });

    if (!check.valid) {
      setTransitionError(check.error ?? 'Invalid lifecycle transition.');
      return;
    }

    try {
      await repository.recordLifecycleEvent(
        {
          initiativeId: initiative.id,
          expectedVersion: initiative.version,
          toStatus: targetStatus,
          note: transitionNote,
        },
        currentUser
      );
      setTransitionOpen(false);
      await bumpDataRevision();
      notify(
        'success',
        `Lifecycle updated to ${LIFECYCLE_LABELS[targetStatus]}`,
        check.isGovernedException
          ? 'Recorded as a governed exception in immutable history.'
          : 'Lifecycle transition recorded in immutable history.'
      );
    } catch (err) {
      setTransitionError(
        err instanceof Error ? err.message : 'Unable to transition lifecycle.'
      );
    }
  };

  const isExceptionPreview = isGovernedExceptionTransition(
    initiative.lifecycleStatus,
    targetStatus
  );

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await repository.deleteInitiative(initiative.id, currentUser);
      setDeleteOpen(false);
      await bumpDataRevision();
      notify(
        'success',
        'Initiative deleted',
        `"${initiative.title}" and its local history were removed from IndexedDB.`
      );
      navigate({ page: 'my-initiatives' });
    } catch (err) {
      notify(
        'error',
        'Could not delete initiative',
        err instanceof Error ? err.message : 'Delete operation failed.'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate({ page: 'explore' })}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Explore Portfolio</span>
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {initiative.title}
            </h1>
            <LifecycleStatusBadge status={initiative.lifecycleStatus} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">{initiative.id}</span>
            <span aria-hidden="true">·</span>
            <span>{deptName(initiative.departmentId)}</span>
            <span aria-hidden="true">·</span>
            <span>Owner: {userName(initiative.ownerId)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Version {initiative.version}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canReview && initiative.lifecycleStatus !== LifecycleStatus.RETIRE && (
            <button
              type="button"
              onClick={handleMarkReviewed}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <CheckCircle2
                className="h-3.5 w-3.5 text-emerald-600"
                aria-hidden="true"
              />
              <span>Mark Reviewed</span>
            </button>
          )}

          {canChangeLifecycle && !editing && (
            <button
              type="button"
              onClick={openTransitionModal}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Change Lifecycle</span>
            </button>
          )}

          {canEdit ? (
            !editing && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit Initiative</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Read-Only (Owned by {userName(initiative.ownerId)})</span>
            </span>
          )}
        </div>
      </div>

      {/* Ownership Guard Explanation for non-owners */}
      {!canEdit && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          Employees can view all enterprise initiatives across departments, but
          may only edit initiatives they own. Switch to the owner (
          <strong>{userName(initiative.ownerId)}</strong>) or an{' '}
          <strong>AI Portfolio Manager</strong> role in the Demo Switcher to edit this
          record.
        </div>
      )}

      {/* Needs Data Completion Alert (Separated from Lifecycle Status) */}
      {initiative.needsDataCompletion && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold text-amber-950">
            Needs Data Completion (Imported Incomplete Record)
          </div>
          <p className="mt-1 text-xs text-amber-900">
            This initiative was imported without fabricating missing metadata.
            {initiative.missingDataFields?.length
              ? ` Unpopulated fields: ${initiative.missingDataFields.join(', ')}.`
              : ''}
          </p>
        </div>
      )}

      {/* Data Quality Alerts if any */}
      {qualityFlags.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold text-amber-900">
            Portfolio Data Quality Indicators
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-800">
            {qualityFlags.map((flag) => (
              <li key={flag.code}>{flag.label}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Edit Form OR Read-Only Overview */}
      {editing ? (
        <form
          onSubmit={handleSaveEdit}
          className="space-y-6 rounded-lg border border-slate-200 bg-white p-6"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              Edit Initiative Details & Usage
            </h2>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setFieldErrors({});
                void loadDetail();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cancel</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label
                htmlFor="edit-title"
                className="block text-xs font-semibold text-slate-700"
              >
                Initiative Title *
              </label>
              <input
                id="edit-title"
                type="text"
                value={formState.title ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, title: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.title && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-dept"
                className="block text-xs font-semibold text-slate-700"
              >
                Business Area / Department *
              </label>
              <select
                id="edit-dept"
                value={formState.departmentId ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, departmentId: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-owner"
                className="block text-xs font-semibold text-slate-700"
              >
                Accountable Owner *
              </label>
              <select
                id="edit-owner"
                value={formState.ownerId ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, ownerId: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {users
                  .filter((u) => u.role !== 'ADMIN')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.role})
                    </option>
                  ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="edit-problem"
                className="block text-xs font-semibold text-slate-700"
              >
                Business Problem *
              </label>
              <textarea
                id="edit-problem"
                rows={2}
                value={formState.businessProblem ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, businessProblem: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.businessProblem && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.businessProblem}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="edit-description"
                className="block text-xs font-semibold text-slate-700"
              >
                Solution Description *
              </label>
              <textarea
                id="edit-description"
                rows={3}
                value={formState.description ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.description && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.description}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-capability"
                className="block text-xs font-semibold text-slate-700"
              >
                Business Capability *
              </label>
              <input
                id="edit-capability"
                type="text"
                value={formState.businessCapability ?? ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    businessCapability: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.businessCapability && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.businessCapability}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-category"
                className="block text-xs font-semibold text-slate-700"
              >
                Registrable Category *
              </label>
              <select
                id="edit-category"
                value={formState.category ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, category: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {Object.values(RegistrableCategory).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-platform"
                className="block text-xs font-semibold text-slate-700"
              >
                AI Platform *
              </label>
              <select
                id="edit-platform"
                value={formState.aiPlatform ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, aiPlatform: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {AI_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-solution-type"
                className="block text-xs font-semibold text-slate-700"
              >
                Solution Type *
              </label>
              <select
                id="edit-solution-type"
                value={formState.solutionType ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, solutionType: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {SOLUTION_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-ai-type"
                className="block text-xs font-semibold text-slate-700"
              >
                AI Type *
              </label>
              <select
                id="edit-ai-type"
                value={formState.aiType ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, aiType: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {AI_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-value-cat"
                className="block text-xs font-semibold text-slate-700"
              >
                Primary Value Category (Single Choice) *
              </label>
              <select
                id="edit-value-cat"
                value={formState.valueCategory ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, valueCategory: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                {Object.values(ValueCategory).map((vc) => (
                  <option key={vc} value={vc}>
                    {VALUE_CATEGORY_LABELS[vc]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-users"
                className="block text-xs font-semibold text-slate-700"
              >
                Users Count (count) *
              </label>
              <input
                id="edit-users"
                type="number"
                min={0}
                step={1}
                value={formState.usersCount ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, usersCount: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.usersCount && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.usersCount}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-minutes"
                className="block text-xs font-semibold text-slate-700"
              >
                Minutes Saved per Occurrence (min) *
              </label>
              <input
                id="edit-minutes"
                type="number"
                min={0}
                step="any"
                value={formState.minutesSavedPerOccurrence ?? ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    minutesSavedPerOccurrence: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.minutesSavedPerOccurrence && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.minutesSavedPerOccurrence}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-freq"
                className="block text-xs font-semibold text-slate-700"
              >
                Process Frequency (occurrences per week) *
              </label>
              <input
                id="edit-freq"
                type="number"
                min={0}
                step="any"
                value={formState.processFrequencyPerWeek ?? ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    processFrequencyPerWeek: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.processFrequencyPerWeek && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.processFrequencyPerWeek}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-rate"
                className="block text-xs font-semibold text-slate-700"
              >
                Optional Hourly Rate ($/hr — Efficiency only)
              </label>
              <input
                id="edit-rate"
                type="number"
                min={0}
                step="any"
                value={formState.hourlyRate ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, hourlyRate: e.target.value })
                }
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.hourlyRate && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.hourlyRate}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-quality-kpi"
                className="block text-xs font-semibold text-slate-700"
              >
                Quality Evidence / KPI (Quality category)
              </label>
              <input
                id="edit-quality-kpi"
                type="text"
                value={formState.qualityEvidenceOrKpi ?? ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    qualityEvidenceOrKpi: e.target.value,
                  })
                }
                placeholder="e.g. Defect rate reduction from 3.4% to 0.9%"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="edit-strategic-ind"
                className="block text-xs font-semibold text-slate-700"
              >
                Strategic Success Indicator (Strategic category)
              </label>
              <input
                id="edit-strategic-ind"
                type="text"
                value={formState.strategicSuccessIndicator ?? ''}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    strategicSuccessIndicator: e.target.value,
                  })
                }
                placeholder="e.g. 100% regional regulatory dossier coverage"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="edit-idea-date"
                className="block text-xs font-semibold text-slate-700"
              >
                Idea Date *
              </label>
              <input
                id="edit-idea-date"
                type="date"
                value={formState.ideaDate ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, ideaDate: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
              {fieldErrors.ideaDate && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.ideaDate}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-golive-date"
                className="block text-xs font-semibold text-slate-700"
              >
                Go-Live Date (optional)
              </label>
              <input
                id="edit-golive-date"
                type="date"
                value={formState.goLiveDate ?? ''}
                onChange={(e) =>
                  setFormState({ ...formState, goLiveDate: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setFieldErrors({});
              }}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Columns: Profile & Usage */}
          <div className="space-y-6 lg:col-span-2">
            {/* Business & Technical Summary */}
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Initiative Overview
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    Business Problem
                  </dt>
                  <dd className="mt-1 leading-relaxed text-slate-800">
                    {initiative.businessProblem}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">
                    Solution Description
                  </dt>
                  <dd className="mt-1 leading-relaxed text-slate-800">
                    {initiative.description}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Business Capability
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-slate-900">
                    {initiative.businessCapability}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Registrable Category
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-slate-900">
                    {CATEGORY_LABELS[initiative.category]}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    AI Platform
                  </div>
                  <div className="mt-0.5 text-sm text-slate-800">
                    {initiative.aiPlatform}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Solution Type / AI Type
                  </div>
                  <div className="mt-0.5 text-sm text-slate-800">
                    {initiative.solutionType} · {initiative.aiType}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Idea Date
                  </div>
                  <div className="mt-0.5 text-sm text-slate-800 tabular-nums">
                    {initiative.ideaDate}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Go-Live Date
                  </div>
                  <div className="mt-0.5 text-sm text-slate-800 tabular-nums">
                    {initiative.goLiveDate || 'Not yet set'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Dev Lead Time (Idea → Production)
                  </div>
                  <div className="mt-0.5 text-sm text-slate-800 tabular-nums">
                    {computeDevelopmentLeadTimeDays(initiative, history) !== null
                      ? `${computeDevelopmentLeadTimeDays(initiative, history)} days`
                      : 'Not yet in Production'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Production Aging
                  </div>
                  <div className="mt-0.5 text-sm text-slate-800 tabular-nums">
                    {computeProductionAgingDays(initiative, history) !== null
                      ? `${computeProductionAgingDays(initiative, history)} days`
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </section>

            {/* Usage & Value Metrics */}
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Usage & Value Classification
                </h2>
                <span className="text-xs font-semibold text-slate-800">
                  {VALUE_CATEGORY_LABELS[initiative.valueCategory]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {VALUE_CATEGORY_DESCRIPTIONS[initiative.valueCategory]}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-500">Users Count</div>
                  <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
                    {initiative.usersCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    Saved / Occurrence
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
                    {initiative.minutesSavedPerOccurrence} min
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    Frequency / Week
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
                    {initiative.processFrequencyPerWeek} occ/wk
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Hourly Rate</div>
                  <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
                    {initiative.hourlyRate !== undefined
                      ? `$${initiative.hourlyRate}/hr`
                      : 'Not set'}
                  </div>
                </div>
              </div>

              {effMetrics.isApplicable ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-slate-600">
                        Calculated Annual Productivity Hours
                      </div>
                      <div className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                        {effMetrics.annualHours.toLocaleString('en-US', {
                          maximumFractionDigits: 1,
                        })}{' '}
                        hrs / yr
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-600">
                        Estimated Efficiency Value (Non-Cash Productivity
                        Equivalent)
                      </div>
                      <div className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                        {effMetrics.estimatedEfficiencyValue !== null
                          ? `$${effMetrics.estimatedEfficiencyValue.toLocaleString(
                              'en-US',
                              { maximumFractionDigits: 0 }
                            )}`
                          : 'Hourly rate not provided'}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Formula: (users × minutes saved × occurrences/week × 52) /
                    60. Non-cash productivity equivalent only; does not represent
                    validated budget or cash savings.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <p>
                    Efficiency hours and monetary equivalent formulas are only
                    applied to <strong>Efficiency Savings</strong> initiatives.
                    Usage inputs above are captured for portfolio sizing.
                  </p>
                  {initiative.valueCategory === ValueCategory.QUALITY && (
                    <div>
                      <strong className="text-slate-800">Quality KPI / Evidence:</strong>{' '}
                      {initiative.qualityEvidenceOrKpi?.trim() || (
                        <span className="text-amber-800">Not documented yet</span>
                      )}
                    </div>
                  )}
                  {initiative.valueCategory === ValueCategory.STRATEGIC && (
                    <div>
                      <strong className="text-slate-800">Strategic Success Indicator:</strong>{' '}
                      {initiative.strategicSuccessIndicator?.trim() || (
                        <span className="text-amber-800">Not documented yet</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Immutable Lifecycle History */}
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Immutable Lifecycle History
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {history.length} event{history.length === 1 ? '' : 's'}
                </span>
              </div>

              <ol className="mt-4 divide-y divide-slate-200">
                {history.map((evt) => (
                  <li key={evt.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900">
                        <span>
                          {evt.fromStatus
                            ? `${LIFECYCLE_LABELS[evt.fromStatus]} → ${LIFECYCLE_LABELS[evt.toStatus]}`
                            : `Registered as ${LIFECYCLE_LABELS[evt.toStatus]}`}
                        </span>
                        {evt.isGovernedException && (
                          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                            Governed Exception
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {new Date(evt.timestamp).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{evt.note}</p>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Actor: {evt.actorName}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* Right Column: Monthly Review & Sync Readiness */}
          <div className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Monthly Owner Review
              </h2>
              <dl className="mt-3 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Status</dt>
                  <dd>
                    <ReviewStatusIndicator
                      nextReviewDue={initiative.nextReviewDue}
                      lifecycleStatus={initiative.lifecycleStatus}
                      overdue={overdue}
                      dueSoon={dueSoon}
                    />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Last Owner Review</dt>
                  <dd className="font-medium text-slate-800 tabular-nums">
                    {initiative.lastOwnerReviewAt
                      ? new Date(
                          initiative.lastOwnerReviewAt
                        ).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Never'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Last Savings Update</dt>
                  <dd className="font-medium text-slate-800 tabular-nums">
                    {initiative.lastSavingsUpdatedAt
                      ? new Date(
                          initiative.lastSavingsUpdatedAt
                        ).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Not recorded'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Last Metadata Update</dt>
                  <dd className="font-medium text-slate-800 tabular-nums">
                    {new Date(initiative.updatedAt).toLocaleDateString(
                      'en-US',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                Automated Teams and email monthly review reminders are planned
                for Phase 2. In Phase 1, owners record reviews manually here.
              </p>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Data Provenance & Completeness
              </h2>
              <dl className="mt-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Provenance</dt>
                  <dd className="font-semibold text-slate-900">
                    {provenanceLabel}
                  </dd>
                </div>
                {initiative.importBatchId && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">Import Batch</dt>
                    <dd className="font-mono text-slate-700">
                      {initiative.importBatchId}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Completeness Score</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {completeness.scorePercent}% ({completeness.presentFields}/
                    {completeness.totalFields} fields)
                  </dd>
                </div>
              </dl>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    completeness.scorePercent === 100
                      ? 'bg-emerald-600'
                      : completeness.scorePercent >= 80
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${completeness.scorePercent}%` }}
                />
              </div>
              {completeness.missingFields.length > 0 ? (
                <div className="mt-3 border-t border-slate-200 pt-2.5">
                  <div className="text-[11px] font-semibold text-amber-800">
                    Missing / Unspecified Fields
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-700">
                    {completeness.missingFields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 border-t border-slate-200 pt-2.5 text-[11px] text-emerald-700">
                  All required and applicable optional fields are populated.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Sync-Ready External Linkage
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Schema placeholders for Phase 2 Azure SQL and Microsoft Graph /
                Lists bidirectional sync.
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Source System</dt>
                  <dd className="font-mono text-slate-800">
                    {initiative.syncLinkage.sourceSystem ?? 'LOCAL_DEMO'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">SharePoint Site ID</dt>
                  <dd className="font-mono text-slate-700">
                    {initiative.syncLinkage.siteId ?? 'Unlinked'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">List / Item ID</dt>
                  <dd className="font-mono text-slate-700">
                    {initiative.syncLinkage.listId &&
                    initiative.syncLinkage.itemId
                      ? `${initiative.syncLinkage.listId} / #${initiative.syncLinkage.itemId}`
                      : 'Unlinked'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Source ETag</dt>
                  <dd className="font-mono text-slate-700">
                    {initiative.syncLinkage.sourceETag ?? 'None'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      )}

      {/* Lifecycle Transition Modal */}
      <Modal
        open={transitionOpen}
        onClose={() => setTransitionOpen(false)}
        title="Change Lifecycle Status"
        description={`Current status: ${LIFECYCLE_LABELS[initiative.lifecycleStatus]}. Non-linear transitions are permitted with a governed exception reason.`}
      >
        <form onSubmit={handleRecordTransition} className="space-y-4">
          <div>
            <label
              htmlFor="target-lifecycle-status"
              className="block text-xs font-semibold text-slate-700"
            >
              Target Lifecycle Status
            </label>
            <select
              id="target-lifecycle-status"
              value={targetStatus}
              onChange={(e) => {
                setTargetStatus(e.target.value as LifecycleStatus);
                setTransitionError(null);
              }}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            >
              {LIFECYCLE_ORDER.map((s) => (
                <option
                  key={s}
                  value={s}
                  disabled={s === initiative.lifecycleStatus}
                >
                  {LIFECYCLE_LABELS[s]}
                  {s === initiative.lifecycleStatus ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {isExceptionPreview && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <strong>Governed Exception Path:</strong> Moving directly from{' '}
                {LIFECYCLE_LABELS[initiative.lifecycleStatus]} to{' '}
                {LIFECYCLE_LABELS[targetStatus]} skips standard progression.
                Provide a clear justification reason below.
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="lifecycle-transition-note"
              className="block text-xs font-semibold text-slate-700"
            >
              {isExceptionPreview
                ? 'Governed Exception Reason *'
                : 'Transition Note *'}
            </label>
            <textarea
              id="lifecycle-transition-note"
              rows={3}
              value={transitionNote}
              onChange={(e) => {
                setTransitionNote(e.target.value);
                setTransitionError(null);
              }}
              placeholder="Explain why this initiative is moving to the selected stage..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            />
            {transitionError && (
              <p className="mt-1 text-xs text-red-600">{transitionError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setTransitionOpen(false)}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Record Transition
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Initiative Confirmation Modal */}
      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete Initiative from Local Demo Workspace?"
        description="This permanently removes the initiative and its lifecycle history from the active IndexedDB dataset. Use Reset Demo Data to restore seeded sample initiatives."
      >
        <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
            <strong>{initiative.title}</strong> ({initiative.id}) ·{' '}
            {deptName(initiative.departmentId)}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
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
              <span>{deleting ? 'Deleting...' : 'Delete Initiative'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
