import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  Gavel,
  Layers,
  PlusCircle,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { orderDepartmentsOperationsFirst } from '../../domain/operationsReporting';
import {
  computeRedundancyAnalysis,
  RedundancyCandidatePair,
} from '../../domain/redundancy';
import {
  computeCaseSlaStatus,
  computeRedundancyPortfolioMetrics,
  DEFAULT_REDUNDANCY_DEADLINE_CONFIG,
  REDUNDANCY_PROCESS_STEPS,
} from '../../domain/redundancyWorkflow';
import {
  BOARD_DECISION_OUTCOME_LABELS,
  BoardDecision,
  Initiative,
  LIFECYCLE_LABELS,
  REDUNDANCY_CASE_STATUS_LABELS,
  REDUNDANCY_CASE_STATUS_ORDER,
  REDUNDANCY_DECISION_LABELS,
  REDUNDANCY_DECISION_ORDER,
  REDUNDANCY_DISPOSITION_LABELS,
  RedundancyAction,
  RedundancyCase,
  RedundancyCaseStatus,
  RedundancyDecisionType,
  RedundancyDisposition,
  RedundancyReviewRecord,
  UserRole,
} from '../../domain/types';
import { BoardDecisionBriefModal } from '../../components/BoardDecisionBriefModal';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { Modal } from '../../components/Modal';
import {
  LifecycleStatusBadge,
  OwnerStanceBadge,
  RedundancyCaseStatusBadge,
} from '../../components/StatusBadge';
import { useApp } from '../../services/appContext';

export type RedundancyScreenTab = 'cases' | 'candidates' | 'board' | 'queue';

interface RedundancySynergyScreenProps {
  initialTab?: RedundancyScreenTab;
}

function eur(n: number): string {
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

export const RedundancySynergyScreen: React.FC<RedundancySynergyScreenProps> = ({
  initialTab = 'cases',
}) => {
  const {
    repository,
    currentUser,
    departments,
    operationsConfig,
    redundancyDeadlineConfig,
    dataRevision,
    bumpDataRevision,
    navigate,
    notify,
  } = useApp();

  const [activeTab, setActiveTab] = useState<RedundancyScreenTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [reviews, setReviews] = useState<RedundancyReviewRecord[]>([]);
  const [cases, setCases] = useState<RedundancyCase[]>([]);
  const [actions, setActions] = useState<RedundancyAction[]>([]);
  const [boardDecisions, setBoardDecisions] = useState<BoardDecision[]>([]);
  const [syncingCases, setSyncingCases] = useState(false);

  // Filters on Cases tab
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<RedundancyCaseStatus | ''>('');
  const [filterDecision, setFilterDecision] = useState<RedundancyDecisionType | ''>('');
  const [filterDeptId, setFilterDeptId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [escalatedOnly, setEscalatedOnly] = useState(false);

  // Quick legacy triage modal
  const [editingPair, setEditingPair] =
    useState<RedundancyCandidatePair | null>(null);
  const [disposition, setDisposition] = useState<RedundancyDisposition>(
    RedundancyDisposition.REUSE_OPPORTUNITY
  );
  const [recommendation, setRecommendation] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  // Board Decision Brief modal state
  const [briefCaseId, setBriefCaseId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [inits, revs, caseList, actionList, boardList] = await Promise.all([
          repository.listInitiatives(),
          repository.listRedundancyReviews(),
          repository.listRedundancyCases(),
          repository.listRedundancyActions(),
          repository.listBoardDecisions(),
        ]);
        if (!active) return;
        setInitiatives(inits);
        setReviews(revs);
        setCases(caseList);
        setActions(actionList);
        setBoardDecisions(boardList);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [repository, dataRevision]);

  const orderedDepartments = useMemo(
    () => orderDepartmentsOperationsFirst(departments, operationsConfig),
    [departments, operationsConfig]
  );

  const analysis = useMemo(
    () => computeRedundancyAnalysis(initiatives),
    [initiatives]
  );

  const metrics = useMemo(
    () =>
      computeRedundancyPortfolioMetrics({
        initiatives,
        analysis,
        cases,
        actions,
        config: redundancyDeadlineConfig,
      }),
    [initiatives, analysis, cases, actions, redundancyDeadlineConfig]
  );

  const caseByPairKey = useMemo(() => {
    const map = new Map<string, RedundancyCase>();
    for (const c of cases) map.set(c.pairKey, c);
    return map;
  }, [cases]);

  const reviewByPairKey = useMemo(() => {
    const map = new Map<string, RedundancyReviewRecord>();
    for (const r of reviews) map.set(r.pairKey, r);
    return map;
  }, [reviews]);

  const actionsByCaseId = useMemo(() => {
    const map = new Map<string, RedundancyAction[]>();
    for (const act of actions) {
      const list = map.get(act.caseId) ?? [];
      list.push(act);
      map.set(act.caseId, list);
    }
    return map;
  }, [actions]);

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const filteredCases = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return cases.filter((c) => {
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterDecision && c.decisionType !== filterDecision) return false;
      if (
        filterDeptId &&
        c.initiativeASnapshot.departmentId !== filterDeptId &&
        c.initiativeBSnapshot.departmentId !== filterDeptId
      ) {
        return false;
      }
      if (escalatedOnly && c.status !== 'ESCALATED') return false;
      if (overdueOnly) {
        const sla = computeCaseSlaStatus(
          c,
          actionsByCaseId.get(c.id) ?? [],
          redundancyDeadlineConfig
        );
        if (!sla.hasAnyOverdue) return false;
      }
      if (q) {
        const haystack = [
          c.caseNumber,
          c.initiativeASnapshot.title,
          c.initiativeBSnapshot.title,
          c.initiativeASnapshot.ownerName,
          c.initiativeBSnapshot.ownerName,
          c.capabilityOverlapSummary,
          ...c.matchedKeywords,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    cases,
    filterStatus,
    filterDecision,
    filterDeptId,
    escalatedOnly,
    overdueOnly,
    searchTerm,
    actionsByCaseId,
    redundancyDeadlineConfig,
  ]);

  const handleSyncActiveMatches = async () => {
    if (currentUser.role !== UserRole.GOVERNANCE) {
      notify(
        'error',
        'AI Portfolio Manager role required',
        'Switch to Demo AI Portfolio Manager to create workflow cases.'
      );
      return;
    }
    setSyncingCases(true);
    try {
      const res = await repository.syncActiveMatchesToRedundancyCases(currentUser);
      await bumpDataRevision();
      setActiveTab('cases');
      notify(
        'success',
        res.createdCount > 0
          ? `Created ${res.createdCount} new review case(s)`
          : 'All active matches already have cases',
        res.skippedExistingCount > 0
          ? `Skipped ${res.skippedExistingCount} pair(s) that already have open or historical cases (no duplicates).`
          : undefined
      );
    } catch (err) {
      notify(
        'error',
        'Unable to create cases',
        err instanceof Error ? err.message : 'Sync failed.'
      );
    } finally {
      setSyncingCases(false);
    }
  };

  const handleCreateSingleCase = async (pair: RedundancyCandidatePair) => {
    try {
      const res = await repository.createRedundancyCase(
        {
          initiativeAId: pair.initiativeA.id,
          initiativeBId: pair.initiativeB.id,
          heuristicScore: pair.heuristicScore,
          matchedKeywords: pair.matchedKeywords,
          similarityExplanation: pair.rationale,
        },
        currentUser
      );
      await bumpDataRevision();
      notify(
        res.created ? 'success' : 'info',
        res.created
          ? `Created Case ${res.redundancyCase.caseNumber}`
          : `Opened Existing Case ${res.redundancyCase.caseNumber}`,
        res.created
          ? 'Ready for 3-stage review, decision, and tracking.'
          : 'Duplicate match prevented — opening existing case.'
      );
      navigate({
        page: 'gov-redundancy-case',
        caseId: res.redundancyCase.id,
        returnTab: 'candidates',
      });
    } catch (err) {
      notify(
        'error',
        'Unable to create case',
        err instanceof Error ? err.message : 'Create failed.'
      );
    }
  };

  const openTriageModal = (pair: RedundancyCandidatePair) => {
    const existing = reviewByPairKey.get(pair.pairKey);
    setEditingPair(pair);
    setDisposition(
      existing?.disposition ?? RedundancyDisposition.REUSE_OPPORTUNITY
    );
    setRecommendation(
      existing?.collaborationRecommendation ??
        `Schedule joint capability review between ${deptName(pair.initiativeA.departmentId)} and ${deptName(pair.initiativeB.departmentId)}.`
    );
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPair) return;
    setSavingReview(true);
    try {
      await repository.saveRedundancyReview(
        {
          pairKey: editingPair.pairKey,
          initiativeAId: editingPair.initiativeA.id,
          initiativeBId: editingPair.initiativeB.id,
          heuristicScore: editingPair.heuristicScore,
          disposition,
          collaborationRecommendation: recommendation,
        },
        currentUser
      );
      setEditingPair(null);
      await bumpDataRevision();
      notify(
        'success',
        'Governance disposition saved',
        `Recorded ${REDUNDANCY_DISPOSITION_LABELS[disposition]}.`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to save review',
        err instanceof Error ? err.message : 'Save failed'
      );
    } finally {
      setSavingReview(false);
    }
  };

  const briefCase = useMemo(
    () => cases.find((c) => c.id === briefCaseId) ?? null,
    [cases, briefCaseId]
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Redundancy &amp; Synergies — Portfolio Optimization Workflow
          </h1>
          <p className="text-sm text-slate-600">
            Streamlined 3-stage portfolio optimization workflow managed by the{' '}
            <strong>AI Portfolio Manager</strong> with{' '}
            <strong>Initiative Owner</strong> alignment and optional{' '}
            <strong>AI Governance Board</strong> escalation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={syncingCases}
            onClick={() => void handleSyncActiveMatches()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#003D7A] disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncingCases ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              {syncingCases
                ? 'Creating Cases...'
                : 'Create Cases from Active Matches'}
            </span>
          </button>
        </div>
      </div>

      {/* 3-Stage Process Strip & Proposed Deadline Notice */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {REDUNDANCY_PROCESS_STEPS.map((st) => (
            <div
              key={st.step}
              className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
            >
              <div className="font-semibold text-[#004F9F]">
                {st.step}. {st.title}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600 line-clamp-2">
                {st.description}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-amber-800" aria-hidden="true" />
            <span>
              <strong>
                {redundancyDeadlineConfig.policyDisclaimer ||
                  DEFAULT_REDUNDANCY_DEADLINE_CONFIG.policyDisclaimer}
              </strong>{' '}
              Triage: {redundancyDeadlineConfig.triageBusinessDays} bd · Alignment:{' '}
              {redundancyDeadlineConfig.ownerAlignmentBusinessDays} bd · Decision:{' '}
              {redundancyDeadlineConfig.decisionBusinessDays} bd · Overdue Action
              Follow-Up: {redundancyDeadlineConfig.overdueActionFollowUpBusinessDays} bd ·
              Monthly Board: Day {redundancyDeadlineConfig.boardMeetingDayOfMonth}.
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'gov-settings' })}
            className="font-semibold text-[#004F9F] hover:underline whitespace-nowrap"
          >
            Edit Deadlines &amp; Holidays
          </button>
        </div>
      </div>

      {/* All 10 Required Portfolio Optimization Metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            1. Potential Redundancy Rate
          </div>
          <div className="mt-1 text-xl font-bold text-amber-700 tabular-nums">
            {metrics.potentialRedundancyRatePercent}%
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {analysis.flaggedInitiativesCount} / {analysis.eligibleInitiativesCount}{' '}
            Idea–Pilot flagged
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            2. Confirmed Redundancy Rate
          </div>
          <div className="mt-1 text-xl font-bold text-[#004F9F] tabular-nums">
            {metrics.confirmedRedundancyRatePercent}%
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {metrics.confirmedRedundancyNumerator} /{' '}
            {metrics.confirmedRedundancyDenominator} Merge/Reuse/Collab
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            3. Open Review Cases
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
            {metrics.openReviewCasesCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {cases.length} total cases (incl. closed)
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            4. Escalated Cases
          </div>
          <div
            className={`mt-1 text-xl font-bold tabular-nums ${
              metrics.escalatedCasesCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {metrics.escalatedCasesCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Awaiting AI Governance Board
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            5. Actions Overdue
          </div>
          <div
            className={`mt-1 text-xl font-bold tabular-nums ${
              metrics.actionsOverdueCount > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {metrics.actionsOverdueCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Immediate flag; +10 bd follow-up
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            6. Synergies Identified
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
            {metrics.synergiesIdentifiedCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Confirmed reuse / merge / collab
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            7. Actions Completed
          </div>
          <div className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
            {metrics.actionsCompletedCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Verified implementation steps
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            8. Realized Reuse Rate
          </div>
          <div className="mt-1 text-xl font-bold text-[#004F9F] tabular-nums">
            {metrics.realizedReuseRatePercent}%
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {metrics.realizedReuseNumerator} / {metrics.realizedReuseDenominator}{' '}
            Merge &amp; Reuse realized
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            9. Estimated Synergy Value
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
            {eur(metrics.estimatedFinancialSynergyEur)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            + {metrics.estimatedAvoidedEffortHours}h ({eur(metrics.estimatedAvoidedEffortEur)} Non-Cash)
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5">
          <div className="text-[11px] font-medium text-emerald-900">
            10. Confirmed Financial Synergy Value
          </div>
          <div className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
            {eur(metrics.confirmedFinancialSynergyValueEur)}
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-900">
            Evidenced only · No Net Benefit double-count
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Redundancy & Synergies views"
        className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cases'}
          onClick={() => setActiveTab('cases')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'cases'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Review Cases ({cases.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'candidates'}
          onClick={() => setActiveTab('candidates')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'candidates'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Candidate Matches ({analysis.candidatePairs.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'board'}
          onClick={() => setActiveTab('board')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'board'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
          <span>AI Governance Board ({boardDecisions.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'queue'}
          onClick={() => setActiveTab('queue')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'queue'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Disposition Log ({reviews.length})</span>
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : activeTab === 'cases' ? (
        <section className="space-y-4">
          {/* Case Filters */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div>
                <label
                  htmlFor="cases-search"
                  className="block text-[11px] font-semibold text-slate-500"
                >
                  Search Cases, Initiatives, Owners
                </label>
                <div className="relative mt-1">
                  <Search
                    className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="cases-search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="RC-2026, owner, capability..."
                    className="w-full rounded border border-slate-300 py-1.5 pr-2.5 pl-8 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="cases-status-filter"
                  className="block text-[11px] font-semibold text-slate-500"
                >
                  Case Status
                </label>
                <select
                  id="cases-status-filter"
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(e.target.value as RedundancyCaseStatus | '')
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                >
                  <option value="">All Case Statuses</option>
                  {REDUNDANCY_CASE_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {REDUNDANCY_CASE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cases-decision-filter"
                  className="block text-[11px] font-semibold text-slate-500"
                >
                  Decision Type
                </label>
                <select
                  id="cases-decision-filter"
                  value={filterDecision}
                  onChange={(e) =>
                    setFilterDecision(
                      e.target.value as RedundancyDecisionType | ''
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                >
                  <option value="">All Decisions</option>
                  {REDUNDANCY_DECISION_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {REDUNDANCY_DECISION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cases-dept-filter"
                  className="block text-[11px] font-semibold text-slate-500"
                >
                  Department
                </label>
                <select
                  id="cases-dept-filter"
                  value={filterDeptId}
                  onChange={(e) => setFilterDeptId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                >
                  <option value="">All Departments</option>
                  {orderedDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => setOverdueOnly(e.target.checked)}
                />
                <span>Overdue SLA / Actions Only</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={escalatedOnly}
                  onChange={(e) => setEscalatedOnly(e.target.checked)}
                />
                <span>Escalated to Board Only</span>
              </label>
            </div>
          </div>

          {/* Cases Table */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
            {filteredCases.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No redundancy review cases match the selected filters. Click{' '}
                <strong>Create Cases from Active Matches</strong> above or clear
                filters.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2.5">Case &amp; Initiative Pair</th>
                    <th className="px-3 py-2.5">Status &amp; SLA</th>
                    <th className="px-3 py-2.5">Owner Alignment</th>
                    <th className="px-3 py-2.5">Decision &amp; Synergy</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCases.map((c) => {
                    const caseActions = actionsByCaseId.get(c.id) ?? [];
                    const sla = computeCaseSlaStatus(
                      c,
                      caseActions,
                      redundancyDeadlineConfig
                    );
                    const hasConfirmedEvidence =
                      c.synergyEvidenceStatus !== 'NONE' &&
                      c.confirmedSynergyEvidence.trim().length > 0;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-[#004F9F] tabular-nums">
                              {c.caseNumber}
                            </span>
                            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900 tabular-nums">
                              {c.heuristicScore}%
                            </span>
                          </div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {c.initiativeASnapshot.title}
                          </div>
                          <div className="text-slate-700">
                            ↔ {c.initiativeBSnapshot.title}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {deptName(c.initiativeASnapshot.departmentId)} /{' '}
                            {deptName(c.initiativeBSnapshot.departmentId)}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-top space-y-1.5">
                          <RedundancyCaseStatusBadge status={c.status} />
                          <div className="text-[11px] text-slate-600 tabular-nums">
                            {sla.activeDeadlineDate
                              ? `Target: ${sla.activeDeadlineDate}`
                              : c.status === 'CLOSED'
                                ? `Closed: ${c.closedAt?.slice(0, 10) ?? ''}`
                                : 'Active'}
                          </div>
                          {sla.hasAnyOverdue && (
                            <div className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 tabular-nums">
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              <span>
                                {sla.overdueActionsCount > 0
                                  ? `${sla.overdueActionsCount} action(s) overdue`
                                  : `Stage overdue (+${sla.stageOverdueBusinessDays} bd)`}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3 align-top space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-slate-700">
                              {c.initiativeASnapshot.ownerName}
                            </span>
                            <OwnerStanceBadge stance={c.ownerAStance} />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-slate-700">
                              {c.initiativeBSnapshot.ownerName}
                            </span>
                            <OwnerStanceBadge stance={c.ownerBStance} />
                          </div>
                        </td>

                        <td className="px-3 py-3 align-top space-y-1 tabular-nums">
                          <div className="font-semibold text-slate-900">
                            {c.decisionType
                              ? REDUNDANCY_DECISION_LABELS[c.decisionType]
                              : 'Pending Decision'}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Est. Fin: {eur(c.estimatedFinancialSynergyEur)} ·{' '}
                            {c.estimatedAvoidedEffortHours}h avoided
                          </div>
                          {hasConfirmedEvidence && c.confirmedFinancialSynergyEur > 0 && (
                            <div className="text-[11px] font-semibold text-emerald-700">
                              Confirmed: {eur(c.confirmedFinancialSynergyEur)}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                page: 'gov-redundancy-case',
                                caseId: c.id,
                                returnTab: 'cases',
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md bg-[#004F9F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#003D7A] whitespace-nowrap"
                          >
                            <span>Open Case</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : activeTab === 'candidates' ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            <strong>Heuristic Demo Score (Not AI Semantic Certainty):</strong>{' '}
            {analysis.disclaimer} Active similarity matching scans Idea through Pilot;
            existing review cases remain preserved even if initiatives graduate to
            Production or Retire.
          </div>

          {analysis.candidatePairs.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-600">
              No candidate redundancy or synergy overlaps detected across Idea,
              Assessment, Development, or Pilot initiatives in this scope.
            </div>
          ) : (
            analysis.candidatePairs.map((pair) => {
              const existingCase = caseByPairKey.get(pair.pairKey);
              const existingReview = reviewByPairKey.get(pair.pairKey);
              return (
                <article
                  key={pair.pairKey}
                  className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900">
                        <span className="font-mono text-amber-800 tabular-nums">
                          Heuristic Demo Score: {pair.heuristicScore}%
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {pair.sameDepartment
                            ? 'Same Department'
                            : 'Cross-Department Synergy Candidate'}
                        </span>
                        {existingCase && (
                          <>
                            <span aria-hidden="true">·</span>
                            <RedundancyCaseStatusBadge status={existingCase.status} />
                            <span className="font-mono text-[11px] text-[#004F9F]">
                              {existingCase.caseNumber}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{pair.rationale}</p>
                      <div className="text-[11px] text-slate-500">
                        Matched keywords:{' '}
                        <span className="font-mono">
                          {pair.matchedKeywords.join(', ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {existingCase ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              page: 'gov-redundancy-case',
                              caseId: existingCase.id,
                              returnTab: 'candidates',
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#003D7A] whitespace-nowrap"
                        >
                          <span>Open Case ({existingCase.caseNumber})</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleCreateSingleCase(pair)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#003D7A] whitespace-nowrap"
                        >
                          <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Create Case</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openTriageModal(pair)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {existingReview ? 'Edit Disposition' : 'Quick Triage'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {[pair.initiativeA, pair.initiativeB].map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-slate-900">
                            {item.title}
                          </div>
                          <LifecycleStatusBadge status={item.lifecycleStatus} />
                        </div>
                        <div className="mt-1 text-slate-600">
                          {deptName(item.departmentId)} · {item.businessCapability} ·{' '}
                          {item.aiPlatform}
                        </div>
                        <p className="mt-2 text-slate-700 line-clamp-2">
                          {item.businessProblem}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ page: 'detail', initiativeId: item.id })
                          }
                          className="mt-2 inline-flex items-center gap-1 font-medium text-[#004F9F] hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Inspect Initiative</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })
          )}
        </section>
      ) : activeTab === 'board' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                AI Governance Board Escalations &amp; Strategic Mandates
              </h2>
              <p className="text-xs text-slate-600">
                Scheduled monthly Governance Board reviews (Day{' '}
                {redundancyDeadlineConfig.boardMeetingDayOfMonth} each month) for
                unresolved owner disagreements or Scale, Pause, and Retire
                decisions.
              </p>
            </div>
          </div>

          {boardDecisions.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No cases are currently escalated to the AI Governance Board.
            </p>
          ) : (
            <div className="space-y-3">
              {boardDecisions.map((bd) => {
                const parent = cases.find((c) => c.id === bd.caseId);
                return (
                  <div
                    key={bd.id}
                    className={`rounded-md border p-4 text-xs space-y-2 ${
                      bd.status === 'PENDING'
                        ? 'border-red-200 bg-red-50/40'
                        : 'border-emerald-200 bg-emerald-50/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-[#004F9F]">
                            {parent?.caseNumber ?? bd.caseId}
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                              bd.status === 'PENDING'
                                ? 'border-red-300 bg-red-100 text-red-900'
                                : 'border-emerald-300 bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {bd.status === 'PENDING'
                              ? `Pending Monthly Board (${bd.scheduledMeetingDate})`
                              : `Mandate: ${BOARD_DECISION_OUTCOME_LABELS[bd.decisionOutcome!]}`}
                          </span>
                        </div>
                        {parent && (
                          <div className="font-semibold text-slate-900">
                            {parent.initiativeASnapshot.title} ↔{' '}
                            {parent.initiativeBSnapshot.title}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {parent && (
                          <button
                            type="button"
                            onClick={() => setBriefCaseId(parent.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Print Board Brief</span>
                          </button>
                        )}
                        {parent && (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                page: 'gov-redundancy-case',
                                caseId: parent.id,
                                returnTab: 'board',
                              })
                            }
                            className="inline-flex items-center gap-1 rounded bg-[#004F9F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#003D7A] whitespace-nowrap"
                          >
                            <span>Open Case</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-slate-700 leading-relaxed">
                      <strong>Reason / Rationale:</strong>{' '}
                      {bd.boardRationale || bd.escalationReason}
                    </p>
                    <div className="text-[11px] text-slate-600">
                      <strong>Investment Implications:</strong>{' '}
                      {bd.investmentImplications}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Governance Review Queue &amp; Disposition Log
          </h2>
          {reviews.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">
              No quick triage dispositions logged yet. Use Review Cases for full
              3-stage portfolio optimization workflows.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Candidate Pair</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Disposition</th>
                    <th className="py-2 pr-3">Collaboration Recommendation</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reviews.map((rev) => {
                    const a = initiatives.find((i) => i.id === rev.initiativeAId);
                    const b = initiatives.find((i) => i.id === rev.initiativeBId);
                    const matchedPair = analysis.candidatePairs.find(
                      (p) => p.pairKey === rev.pairKey
                    );
                    const linkedCase = caseByPairKey.get(rev.pairKey);
                    return (
                      <tr key={rev.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-slate-900">
                            {a?.title ?? rev.initiativeAId}
                          </div>
                          <div className="text-slate-600">
                            ↔ {b?.title ?? rev.initiativeBId}
                          </div>
                          {a && b && (
                            <div className="text-[11px] text-slate-500">
                              {LIFECYCLE_LABELS[a.lifecycleStatus]} /{' '}
                              {LIFECYCLE_LABELS[b.lifecycleStatus]}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700">
                          {rev.heuristicScore}%
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">
                          {REDUNDANCY_DISPOSITION_LABELS[rev.disposition]}
                        </td>
                        <td className="max-w-md py-2.5 pr-3 text-slate-700">
                          {rev.collaborationRecommendation}
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          {linkedCase && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate({
                                  page: 'gov-redundancy-case',
                                  caseId: linkedCase.id,
                                  returnTab: 'queue',
                                })
                              }
                              className="rounded border border-[#004F9F] px-2.5 py-1 font-medium text-[#004F9F] hover:bg-[#EBF3FB]"
                            >
                              {linkedCase.caseNumber}
                            </button>
                          )}
                          {matchedPair && (
                            <button
                              type="button"
                              onClick={() => openTriageModal(matchedPair)}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Quick Triage Modal */}
      <Modal
        open={editingPair !== null}
        onClose={() => setEditingPair(null)}
        title="Governance Redundancy & Synergy Disposition"
        description={
          editingPair
            ? `Classify overlap between "${editingPair.initiativeA.title}" and "${editingPair.initiativeB.title}" (Heuristic Demo Score: ${editingPair.heuristicScore}%).`
            : undefined
        }
      >
        <form onSubmit={handleSaveReview} className="space-y-4 text-xs">
          <div>
            <label
              htmlFor="redundancy-disposition"
              className="block font-semibold text-slate-700"
            >
              Disposition
            </label>
            <select
              id="redundancy-disposition"
              value={disposition}
              onChange={(e) =>
                setDisposition(e.target.value as RedundancyDisposition)
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >
              {Object.values(RedundancyDisposition).map((d) => (
                <option key={d} value={d}>
                  {REDUNDANCY_DISPOSITION_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="redundancy-recommendation"
              className="block font-semibold text-slate-700"
            >
              Collaboration / Reuse Recommendation
            </label>
            <textarea
              id="redundancy-recommendation"
              rows={3}
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              placeholder="Document shared platform reuse, consolidation, or differentiation rationale..."
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingPair(null)}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingReview}
              className="rounded bg-slate-900 px-4 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {savingReview ? 'Saving...' : 'Save Disposition'}
            </button>
          </div>
        </form>
      </Modal>

      {briefCase && (
        <BoardDecisionBriefModal
          open={briefCase !== null}
          onClose={() => setBriefCaseId(null)}
          redundancyCase={briefCase}
          initiativeA={initiatives.find((i) => i.id === briefCase.initiativeAId)}
          initiativeB={initiatives.find((i) => i.id === briefCase.initiativeBId)}
          departments={departments}
          actions={actionsByCaseId.get(briefCase.id) ?? []}
          boardDecisions={boardDecisions.filter(
            (b) => b.caseId === briefCase.id
          )}
          deadlineConfig={redundancyDeadlineConfig}
        />
      )}
    </div>
  );
};
