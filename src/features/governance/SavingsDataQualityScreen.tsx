import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  Pencil,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  buildSavingsDataQualityCsv,
  computeSavingsDataQualityReport,
} from '../../domain/savingsDataQuality';
import {
  BenefitEntry,
  BenefitEvidenceStatus,
  BenefitType,
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleStatus,
  SavingsDataQualityItem,
  SavingsQualityIssueType,
  SavingsQualityPriority,
  VALUE_CATEGORY_LABELS,
  ValueCategory,
} from '../../domain/types';
import { AbbottLogoSlot } from '../../components/AbbottLogoSlot';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { Modal } from '../../components/Modal';
import { LifecycleStatusBadge } from '../../components/StatusBadge';
import { triggerCsvDownload } from '../../services/excelParser';
import { useApp } from '../../services/appContext';

const PRIORITY_BADGE_CLASSES: Record<SavingsQualityPriority, string> = {
  HIGH: 'border-red-300 bg-red-50 text-red-800',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-900',
  LOW: 'border-slate-300 bg-slate-100 text-slate-700',
};

const ISSUE_FILTER_OPTIONS: Array<{
  id: 'ALL' | 'ACTION_REQUIRED' | 'UP_TO_DATE' | SavingsQualityIssueType;
  label: string;
}> = [
  { id: 'ALL', label: 'All Initiatives' },
  { id: 'ACTION_REQUIRED', label: 'Action Required Only' },
  { id: 'MISSING_SAVINGS_DATA', label: 'Missing Savings Data' },
  { id: 'OVERDUE_SAVINGS_REVIEW', label: 'Overdue Monthly Review' },
  { id: 'INCOMPLETE_SAVINGS_INPUTS', label: 'Incomplete Inputs' },
  { id: 'MISSING_QUALITY_EVIDENCE', label: 'Missing Quality KPI' },
  { id: 'MISSING_STRATEGIC_INDICATOR', label: 'Missing Strategic Indicator' },
  { id: 'UNVERIFIED_REALIZED_BENEFIT', label: 'Unverified Realized Benefit' },
  { id: 'UP_TO_DATE', label: 'Up-to-Date Only' },
];

function eur(n: number): string {
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

function formatDateCell(iso: string | null): string {
  if (!iso) return 'Not recorded';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const SavingsDataQualityScreen: React.FC = () => {
  const {
    repository,
    currentUser,
    departments,
    users,
    dataRevision,
    bumpDataRevision,
    navigate,
    notify,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [benefits, setBenefits] = useState<BenefitEntry[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterOwnerId, setFilterOwnerId] = useState('');
  const [filterStage, setFilterStage] = useState<LifecycleStatus | ''>('');
  const [filterIssue, setFilterIssue] = useState<
    'ALL' | 'ACTION_REQUIRED' | 'UP_TO_DATE' | SavingsQualityIssueType
  >('ALL');
  const [filterPriority, setFilterPriority] = useState<
    'ALL' | SavingsQualityPriority
  >('ALL');

  // Edit Savings Modal state
  const [editingItem, setEditingItem] = useState<SavingsDataQualityItem | null>(
    null
  );
  const [editForm, setEditForm] = useState({
    valueCategory: ValueCategory.EFFICIENCY,
    usersCount: '0',
    minutesSavedPerOccurrence: '0',
    processFrequencyPerWeek: '0',
    hourlyRate: '',
    qualityEvidenceOrKpi: '',
    strategicSuccessIndicator: '',
    markReviewed: true,
    verifyLinkedRealizedBenefits: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [allInits, allBens] = await Promise.all([
          repository.listInitiatives(),
          repository.listBenefits(),
        ]);
        if (!active) return;
        setInitiatives(allInits);
        setBenefits(allBens);
      } catch (err) {
        if (active) {
          notify(
            'error',
            'Unable to load Savings Data Quality',
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

  const scopedData = useMemo(
    () => ({
      initiatives,
      benefits,
      scopedDepartments: departments,
    }),
    [initiatives, benefits, departments]
  );

  const report = useMemo(
    () =>
      computeSavingsDataQualityReport({
        initiatives: scopedData.initiatives,
        benefits: scopedData.benefits,
        departments: scopedData.scopedDepartments,
        users,
      }),
    [scopedData, users]
  );

  const distinctOwners = useMemo(() => {
    const ids = new Set(
      scopedData.initiatives.map((i) => i.ownerId).filter(Boolean)
    );
    return Array.from(ids)
      .map((id) => ({
        id,
        name: users.find((u) => u.id === id)?.displayName ?? id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedData.initiatives, users]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return report.items.filter((item) => {
      if (filterDeptId && item.departmentId !== filterDeptId) return false;
      if (filterOwnerId && item.ownerId !== filterOwnerId) return false;
      if (filterStage && item.lifecycleStatus !== filterStage) return false;
      if (filterPriority !== 'ALL' && item.priority !== filterPriority) {
        return false;
      }
      if (filterIssue === 'ACTION_REQUIRED' && item.isUpToDate) return false;
      if (filterIssue === 'UP_TO_DATE' && !item.isUpToDate) return false;
      if (
        filterIssue !== 'ALL' &&
        filterIssue !== 'ACTION_REQUIRED' &&
        filterIssue !== 'UP_TO_DATE' &&
        !item.issueTypes.includes(filterIssue)
      ) {
        return false;
      }
      if (q) {
        const hay = `${item.initiativeTitle} ${item.departmentName} ${item.ownerName} ${item.issueSummary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    report.items,
    filterDeptId,
    filterOwnerId,
    filterStage,
    filterPriority,
    filterIssue,
    search,
  ]);

  const hasFilters = Boolean(
    search ||
      filterDeptId ||
      filterOwnerId ||
      filterStage ||
      filterIssue !== 'ALL' ||
      filterPriority !== 'ALL'
  );

  const clearFilters = () => {
    setSearch('');
    setFilterDeptId('');
    setFilterOwnerId('');
    setFilterStage('');
    setFilterIssue('ALL');
    setFilterPriority('ALL');
  };

  const openEditModal = (item: SavingsDataQualityItem) => {
    const source = initiatives.find((i) => i.id === item.initiativeId);
    if (!source) return;
    setEditingItem(item);
    setEditForm({
      valueCategory: source.valueCategory,
      usersCount: String(source.usersCount),
      minutesSavedPerOccurrence: String(source.minutesSavedPerOccurrence),
      processFrequencyPerWeek: String(source.processFrequencyPerWeek),
      hourlyRate:
        source.hourlyRate !== undefined ? String(source.hourlyRate) : '',
      qualityEvidenceOrKpi: source.qualityEvidenceOrKpi ?? '',
      strategicSuccessIndicator: source.strategicSuccessIndicator ?? '',
      markReviewed: true,
      verifyLinkedRealizedBenefits: item.issueTypes.includes(
        'UNVERIFIED_REALIZED_BENEFIT'
      ),
    });
  };

  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const source = initiatives.find((i) => i.id === editingItem.initiativeId);
    if (!source) return;

    const usersNum = Number(editForm.usersCount);
    const minsNum = Number(editForm.minutesSavedPerOccurrence);
    const freqNum = Number(editForm.processFrequencyPerWeek);
    const rateNum =
      editForm.hourlyRate.trim() === ''
        ? undefined
        : Number(editForm.hourlyRate);

    if (
      !Number.isFinite(usersNum) ||
      usersNum < 0 ||
      !Number.isFinite(minsNum) ||
      minsNum < 0 ||
      !Number.isFinite(freqNum) ||
      freqNum < 0 ||
      (rateNum !== undefined && (!Number.isFinite(rateNum) || rateNum < 0))
    ) {
      notify(
        'error',
        'Invalid numeric savings input',
        'Users, minutes, frequency, and hourly rate must be non-negative numbers.'
      );
      return;
    }

    setSavingEdit(true);
    try {
      await repository.updateInitiative(
        {
          id: source.id,
          expectedVersion: source.version,
          patch: {
            valueCategory: editForm.valueCategory,
            usersCount: usersNum,
            minutesSavedPerOccurrence: minsNum,
            processFrequencyPerWeek: freqNum,
            hourlyRate: rateNum,
            qualityEvidenceOrKpi: editForm.qualityEvidenceOrKpi.trim() || undefined,
            strategicSuccessIndicator:
              editForm.strategicSuccessIndicator.trim() || undefined,
            markSavingsReviewed: editForm.markReviewed,
          },
        },
        currentUser
      );

      if (editForm.verifyLinkedRealizedBenefits) {
        const unverified = benefits.filter(
          (b) =>
            b.initiativeId === source.id &&
            (b.benefitType === BenefitType.CASH_SAVINGS ||
              b.benefitType === BenefitType.COST_AVOIDANCE) &&
            b.realizedAmountEur > 0 &&
            b.evidenceStatus !== 'VERIFIED' &&
            b.evidenceStatus !== 'DOCUMENTED'
        );
        for (const ben of unverified) {
          await repository.deleteBenefit(ben.id, currentUser);
          await repository.saveBenefit(
            {
              initiativeId: ben.initiativeId,
              departmentId: ben.departmentId,
              costCenter: ben.costCenter,
              benefitType: ben.benefitType,
              estimatedAmountEur: ben.estimatedAmountEur,
              realizedAmountEur: ben.realizedAmountEur,
              period: /^\d{4}-\d{2}$/.test(ben.period) ? ben.period : '2026-11',
              description: ben.description,
              evidenceStatus: 'VERIFIED' as BenefitEvidenceStatus,
              evidenceNote:
                ben.evidenceNote ||
                `Verified by ${currentUser.displayName} in Savings Data Quality review`,
            },
            currentUser
          );
        }
      }

      setEditingItem(null);
      await bumpDataRevision();
      notify(
        'success',
        'Savings data updated',
        `Saved savings inputs${editForm.markReviewed ? ' and logged monthly savings review' : ''} for ${source.title}.`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to update savings inputs',
        err instanceof Error ? err.message : 'Save failed.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleMarkReviewed = async (item: SavingsDataQualityItem) => {
    const source = initiatives.find((i) => i.id === item.initiativeId);
    if (!source) return;
    try {
      await repository.markOwnerReviewed(
        {
          initiativeId: source.id,
          expectedVersion: source.version,
          reviewNote: 'Monthly savings data quality review confirmed.',
        },
        currentUser
      );
      await bumpDataRevision();
      notify(
        'success',
        'Savings review confirmed',
        `Logged monthly savings review for ${source.title}.`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to log savings review',
        err instanceof Error ? err.message : 'Unexpected error'
      );
    }
  };

  const handleExportCsv = () => {
    const csv = buildSavingsDataQualityCsv(filteredItems);
    triggerCsvDownload('aas_savings_data_quality_action_list.csv', csv);
    notify(
      'success',
      'CSV Exported',
      `Exported ${filteredItems.length} initiative rows from Savings Data Quality.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Abbott Branding & Export */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <AbbottLogoSlot variant="header" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Savings Data Quality &amp; Review Compliance
            </h1>
          </div>
          <p className="text-sm text-slate-600">
            Identify missing savings inputs, overdue monthly savings reviews, and
            unverified financial benefits across the active portfolio without
            fabricating missing metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredItems.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV Action List</span>
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          {/* 4 Required KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() =>
                setFilterIssue(
                  filterIssue === 'MISSING_SAVINGS_DATA'
                    ? 'ALL'
                    : 'MISSING_SAVINGS_DATA'
                )
              }
              className={`rounded-lg border p-4 text-left transition-colors ${
                filterIssue === 'MISSING_SAVINGS_DATA'
                  ? 'border-red-500 bg-red-50/70 ring-1 ring-red-400'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Missing Savings Data</span>
                <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden="true" />
              </div>
              <div className="mt-1 text-2xl font-bold text-red-700 tabular-nums">
                {report.missingSavingsDataCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Core category inputs or evidence absent
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setFilterIssue(
                  filterIssue === 'OVERDUE_SAVINGS_REVIEW'
                    ? 'ALL'
                    : 'OVERDUE_SAVINGS_REVIEW'
                )
              }
              className={`rounded-lg border p-4 text-left transition-colors ${
                filterIssue === 'OVERDUE_SAVINGS_REVIEW'
                  ? 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-400'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Overdue Savings Reviews</span>
                <AlertTriangle
                  className="h-4 w-4 text-amber-600"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
                {report.overdueReviewsCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Monthly review cadence &gt; 30d or unlogged
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setFilterIssue(
                  filterIssue === 'INCOMPLETE_SAVINGS_INPUTS'
                    ? 'ALL'
                    : 'INCOMPLETE_SAVINGS_INPUTS'
                )
              }
              className={`rounded-lg border p-4 text-left transition-colors ${
                filterIssue === 'INCOMPLETE_SAVINGS_INPUTS'
                  ? 'border-[#004F9F] bg-[#EBF3FB]/60 ring-1 ring-[#004F9F]'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Incomplete Savings Inputs</span>
                <ClipboardCheck
                  className="h-4 w-4 text-[#004F9F]"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1 text-2xl font-bold text-[#004F9F] tabular-nums">
                {report.incompleteInputsCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Missing hourly rate, KPI, indicator, or benefit proof
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setFilterIssue(
                  filterIssue === 'UP_TO_DATE' ? 'ALL' : 'UP_TO_DATE'
                )
              }
              className={`rounded-lg border p-4 text-left transition-colors ${
                filterIssue === 'UP_TO_DATE'
                  ? 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-400'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Up-to-Date Initiatives</span>
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                {report.upToDateCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {report.dataCompletenessPercent}% of {report.totalInitiatives}{' '}
                scoped initiatives compliant
              </div>
            </button>
          </div>

          {/* Completeness & Departmental Breakdown */}
          <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Savings Data Completeness by Department
                </h2>
                <p className="text-xs text-slate-500">
                  General metadata edits never reset savings update or monthly
                  owner review dates.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs tabular-nums">
                <span className="text-slate-600">
                  Overall Data Completeness:
                </span>
                <span className="rounded border border-[#BFD7EE] bg-[#EBF3FB] px-2.5 py-1 font-mono font-bold text-[#004F9F]">
                  {report.dataCompletenessPercent}% ({report.upToDateCount}/
                  {report.totalInitiatives})
                </span>
              </div>
            </div>

            {report.byDepartment.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {report.byDepartment.map((dept) => (
                  <button
                    key={dept.departmentId}
                    type="button"
                    onClick={() =>
                      setFilterDeptId(
                        filterDeptId === dept.departmentId
                          ? ''
                          : dept.departmentId
                      )
                    }
                    className={`rounded-md border p-3 text-left transition-colors ${
                      filterDeptId === dept.departmentId
                        ? 'border-[#004F9F] bg-[#EBF3FB]/60 ring-1 ring-[#004F9F]'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-slate-900">
                        {dept.departmentName}
                      </span>
                      <span className="font-mono font-bold text-[#004F9F] tabular-nums">
                        {dept.completenessPercent}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${
                          dept.completenessPercent >= 80
                            ? 'bg-emerald-600'
                            : dept.completenessPercent >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-600'
                        }`}
                        style={{ width: `${dept.completenessPercent}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-600 tabular-nums">
                      <span>
                        {dept.upToDateCount}/{dept.totalInitiatives} compliant
                      </span>
                      <span>
                        {dept.actionRequiredCount} action
                        {dept.actionRequiredCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Search savings quality initiatives"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search initiative or owner..."
                className="w-full rounded border border-slate-300 bg-slate-50 py-1.5 pr-2.5 pl-8 text-xs text-slate-900 focus:border-[#004F9F] focus:bg-white focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter by department"
              value={filterDeptId}
              onChange={(e) => setFilterDeptId(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">All Scoped Departments</option>
              {scopedData.scopedDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by owner"
              value={filterOwnerId}
              onChange={(e) => setFilterOwnerId(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">All Owners</option>
              {distinctOwners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by lifecycle stage"
              value={filterStage}
              onChange={(e) =>
                setFilterStage(e.target.value as LifecycleStatus | '')
              }
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">All 8 Lifecycle Stages</option>
              {LIFECYCLE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {LIFECYCLE_LABELS[s]}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by data quality issue"
              value={filterIssue}
              onChange={(e) =>
                setFilterIssue(
                  e.target.value as
                    | 'ALL'
                    | 'ACTION_REQUIRED'
                    | 'UP_TO_DATE'
                    | SavingsQualityIssueType
                )
              }
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              {ISSUE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <select
                aria-label="Filter by priority"
                value={filterPriority}
                onChange={(e) =>
                  setFilterPriority(
                    e.target.value as 'ALL' | SavingsQualityPriority
                  )
                }
                className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
              >
                <option value="ALL">All Priorities</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </select>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#004F9F] hover:bg-slate-50 whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* 12-Column Action Table */}
          {filteredItems.length === 0 ? (
            <EmptyState
              title="No initiatives match current Savings Data Quality filters"
              description="Reset filters or switch reporting scope to inspect other departments."
              actionLabel="Reset Filters"
              onAction={clearFilters}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 leading-tight">
                    <th className="w-[15%] min-w-[130px] px-1.5 py-2">Initiative</th>
                    <th className="px-1.5 py-2">Department</th>
                    <th className="px-1.5 py-2">Owner</th>
                    <th className="px-1.5 py-2">Lifecycle Stage</th>
                    <th className="max-w-[82px] px-1.5 py-2">Value Category</th>
                    <th className="max-w-[88px] px-1.5 py-2 text-right">Estimated Savings</th>
                    <th className="max-w-[72px] px-1.5 py-2 text-right">Realized Savings</th>
                    <th className="max-w-[80px] px-1.5 py-2">Last Savings Update</th>
                    <th className="max-w-[80px] px-1.5 py-2">Last Review Date</th>
                    <th className="w-[14%] min-w-[120px] px-1.5 py-2">Data Quality Issue</th>
                    <th className="px-1.5 py-2">Priority</th>
                    <th className="w-[14%] min-w-[126px] px-1.5 py-2">Recommended Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.initiativeId}
                      className="align-top transition-colors hover:bg-slate-50"
                    >
                      <td className="min-w-[130px] max-w-[170px] px-1.5 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              page: 'detail',
                              initiativeId: item.initiativeId,
                            })
                          }
                          className="inline-flex items-start gap-1 text-left font-semibold text-slate-900 hover:text-[#004F9F] hover:underline leading-snug"
                        >
                          <span>{item.initiativeTitle}</span>
                          <ExternalLink
                            className="mt-0.5 h-3 w-3 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                        </button>
                      </td>
                      <td className="px-1.5 py-2.5 text-slate-700 leading-snug">
                        {item.departmentName}
                      </td>
                      <td className="max-w-[82px] px-1.5 py-2.5 text-slate-700 leading-snug">
                        {item.ownerName}
                      </td>
                      <td className="px-1.5 py-2.5 whitespace-nowrap">
                        <LifecycleStatusBadge status={item.lifecycleStatus} />
                      </td>
                      <td className="max-w-[82px] px-1.5 py-2.5 text-slate-700 leading-snug">
                        {VALUE_CATEGORY_LABELS[item.valueCategory]}
                      </td>
                      <td className="max-w-[96px] px-1.5 py-2.5 text-right font-mono text-[10px] text-slate-800 tabular-nums leading-snug">
                        {item.estimatedSavingsDisplay}
                      </td>
                      <td className="px-1.5 py-2.5 text-right font-mono text-[10px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {item.realizedSavingsEur > 0
                          ? eur(item.realizedSavingsEur)
                          : '€0'}
                      </td>
                      <td className="px-1.5 py-2.5 font-mono text-[10px] text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateCell(item.lastSavingsUpdatedAt)}
                      </td>
                      <td className="px-1.5 py-2.5 whitespace-nowrap">
                        <div className="font-mono text-[10px] text-slate-700 tabular-nums">
                          {item.lastReviewDate
                            ? formatDateCell(item.lastReviewDate)
                            : 'Never reviewed'}
                        </div>
                        {item.isOverdueReview && (
                          <div className="text-[10px] font-semibold text-amber-800 tabular-nums">
                            {item.overdueDays}d overdue
                          </div>
                        )}
                      </td>
                      <td className="min-w-[120px] max-w-[160px] px-1.5 py-2.5 text-[10px] leading-snug">
                        {item.isUpToDate ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>Up to date</span>
                          </span>
                        ) : (
                          <span className="text-slate-800">
                            {item.issueSummary}
                          </span>
                        )}
                      </td>
                      <td className="px-1.5 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded border px-1 py-0.5 text-[9px] font-bold tracking-wide ${
                            PRIORITY_BADGE_CLASSES[item.priority]
                          }`}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td className="min-w-[126px] px-1.5 py-2.5">
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-700 leading-snug">
                            {item.recommendedAction}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="inline-flex items-center gap-1 rounded border border-[#BFD7EE] bg-[#EBF3FB] px-1.5 py-0.5 text-[10px] font-medium text-[#004F9F] hover:bg-[#DCEAF9] whitespace-nowrap"
                            >
                              <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                              <span>Edit Savings</span>
                            </button>
                            {item.lifecycleStatus !== LifecycleStatus.RETIRE && (
                              <button
                                type="button"
                                onClick={() => void handleMarkReviewed(item)}
                                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                              >
                                <CheckCircle2
                                  className="h-2.5 w-2.5 text-emerald-600"
                                  aria-hidden="true"
                                />
                                <span>Mark Reviewed</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Inline Edit Savings Inputs Modal */}
      <Modal
        open={editingItem !== null}
        onClose={() => !savingEdit && setEditingItem(null)}
        title={`Edit Savings Inputs: ${editingItem?.initiativeTitle ?? ''}`}
        description={
          editingItem
            ? `${editingItem.departmentName} · ${LIFECYCLE_LABELS[editingItem.lifecycleStatus]} · Updates persist to IndexedDB and refresh lastSavingsUpdatedAt.`
            : ''
        }
      >
        {editingItem && (
          <form onSubmit={handleSaveEditModal} className="space-y-3 text-xs">
            <div>
              <label
                htmlFor="sdq-value-category"
                className="block font-semibold text-slate-700"
              >
                Value Category
              </label>
              <select
                id="sdq-value-category"
                value={editForm.valueCategory}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    valueCategory: e.target.value as ValueCategory,
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
              >
                {Object.values(ValueCategory).map((vc) => (
                  <option key={vc} value={vc}>
                    {VALUE_CATEGORY_LABELS[vc]}
                  </option>
                ))}
              </select>
            </div>

            {editForm.valueCategory === ValueCategory.EFFICIENCY && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label
                    htmlFor="sdq-users"
                    className="block font-semibold text-slate-700"
                  >
                    Users
                  </label>
                  <input
                    id="sdq-users"
                    type="number"
                    min={0}
                    value={editForm.usersCount}
                    onChange={(e) =>
                      setEditForm({ ...editForm, usersCount: e.target.value })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sdq-minutes"
                    className="block font-semibold text-slate-700"
                  >
                    Min / Occ
                  </label>
                  <input
                    id="sdq-minutes"
                    type="number"
                    min={0}
                    step="any"
                    value={editForm.minutesSavedPerOccurrence}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        minutesSavedPerOccurrence: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sdq-freq"
                    className="block font-semibold text-slate-700"
                  >
                    Freq / Wk
                  </label>
                  <input
                    id="sdq-freq"
                    type="number"
                    min={0}
                    step="any"
                    value={editForm.processFrequencyPerWeek}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        processFrequencyPerWeek: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sdq-rate"
                    className="block font-semibold text-slate-700"
                  >
                    Hourly Rate (€)
                  </label>
                  <input
                    id="sdq-rate"
                    type="number"
                    min={0}
                    step="any"
                    value={editForm.hourlyRate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, hourlyRate: e.target.value })
                    }
                    placeholder="e.g. 85"
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
                  />
                </div>
              </div>
            )}

            {editForm.valueCategory === ValueCategory.QUALITY && (
              <div>
                <label
                  htmlFor="sdq-quality-kpi"
                  className="block font-semibold text-slate-700"
                >
                  Quality KPI / Error-Reduction Evidence *
                </label>
                <textarea
                  id="sdq-quality-kpi"
                  rows={2}
                  value={editForm.qualityEvidenceOrKpi}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      qualityEvidenceOrKpi: e.target.value,
                    })
                  }
                  placeholder="e.g. Reduced inspection defect escape rate from 3.4% to 0.9%"
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
                />
              </div>
            )}

            {editForm.valueCategory === ValueCategory.STRATEGIC && (
              <div>
                <label
                  htmlFor="sdq-strategic-ind"
                  className="block font-semibold text-slate-700"
                >
                  Strategic Outcome / Success Indicator *
                </label>
                <textarea
                  id="sdq-strategic-ind"
                  rows={2}
                  value={editForm.strategicSuccessIndicator}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      strategicSuccessIndicator: e.target.value,
                    })
                  }
                  placeholder="e.g. 100% regional regulatory dossier coverage before audit deadline"
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
                />
              </div>
            )}

            {editingItem.issueTypes.includes('UNVERIFIED_REALIZED_BENEFIT') && (
              <label className="flex cursor-pointer items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-amber-950">
                <input
                  type="checkbox"
                  checked={editForm.verifyLinkedRealizedBenefits}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      verifyLinkedRealizedBenefits: e.target.checked,
                    })
                  }
                  className="mt-0.5"
                />
                <span>
                  <strong>Verify Linked Realized Financial Benefits</strong> — Mark
                  unverified realized Cash Savings / Cost Avoidance entries as{' '}
                  <code>VERIFIED</code> with valid period attribution.
                </span>
              </label>
            )}

            {editingItem.lifecycleStatus !== LifecycleStatus.RETIRE && (
              <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2.5 text-slate-800">
                <input
                  type="checkbox"
                  checked={editForm.markReviewed}
                  onChange={(e) =>
                    setEditForm({ ...editForm, markReviewed: e.target.checked })
                  }
                />
                <span>
                  Also confirm monthly savings review complete (updates{' '}
                  <code>lastOwnerReviewAt</code> and extends due date +30 days)
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditingItem(null)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded bg-[#004F9F] px-4 py-1.5 font-medium text-white hover:bg-[#003D7A] disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save Savings Inputs'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
