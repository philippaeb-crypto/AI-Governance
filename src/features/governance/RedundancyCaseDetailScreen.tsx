import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Gavel,
  History,
  MessageSquare,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  buildDecisionAssistantRecommendation,
  canEscalateToBoard,
  computeCaseSlaStatus,
  computeNextBoardMeetingDate,
  getCaseProcessStep,
  hasOwnerDisagreement,
  REDUNDANCY_PROCESS_STEPS,
  toUtcDateKey,
} from '../../domain/redundancyWorkflow';
import {
  BOARD_DECISION_OUTCOME_LABELS,
  BOARD_DECISION_OUTCOME_ORDER,
  BoardDecision,
  BoardDecisionOutcome,
  Initiative,
  LIFECYCLE_LABELS,
  normalizeRedundancyCaseStatus,
  OWNER_ALIGNMENT_STANCE_LABELS,
  OwnerAlignmentStance,
  REDUNDANCY_ACTION_STATUS_LABELS,
  REDUNDANCY_CASE_STATUS_LABELS,
  REDUNDANCY_DECISION_LABELS,
  REDUNDANCY_DECISION_ORDER,
  RedundancyAction,
  RedundancyCase,
  RedundancyCaseStatus,
  RedundancyDecisionType,
  RedundancyEvent,
  SynergyEvidenceStatus,
} from '../../domain/types';
import { BoardDecisionBriefModal } from '../../components/BoardDecisionBriefModal';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import {
  LifecycleStatusBadge,
  OwnerStanceBadge,
  RedundancyCaseStatusBadge,
} from '../../components/StatusBadge';
import { useApp } from '../../services/appContext';

interface RedundancyCaseDetailScreenProps {
  caseId: string;
  returnTab?: 'cases' | 'candidates' | 'board' | 'queue';
}

const UPDATABLE_STATUSES: RedundancyCaseStatus[] = [
  'NEW',
  'IN_REVIEW',
  'ACTION_AGREED',
  'ESCALATED',
];

function eur(n: number): string {
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

export const RedundancyCaseDetailScreen: React.FC<RedundancyCaseDetailScreenProps> = ({
  caseId,
  returnTab = 'cases',
}) => {
  const {
    repository,
    currentUser,
    users,
    departments,
    redundancyDeadlineConfig,
    dataRevision,
    bumpDataRevision,
    navigate,
    notify,
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [redundancyCase, setRedundancyCase] = useState<RedundancyCase | null>(null);
  const [actions, setActions] = useState<RedundancyAction[]>([]);
  const [events, setEvents] = useState<RedundancyEvent[]>([]);
  const [boardDecisions, setBoardDecisions] = useState<BoardDecision[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);

  // Form states
  const [statusInput, setStatusInput] = useState<RedundancyCaseStatus>('NEW');
  const [decisionInput, setDecisionInput] = useState<RedundancyDecisionType | ''>('');
  const [pmRecommendation, setPmRecommendation] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [avoidedHoursInput, setAvoidedHoursInput] = useState('0');
  const [avoidedEurInput, setAvoidedEurInput] = useState('0');
  const [estFinancialEurInput, setEstFinancialEurInput] = useState('0');
  const [confirmedFinancialEurInput, setConfirmedFinancialEurInput] = useState('0');
  const [evidenceStatusInput, setEvidenceStatusInput] =
    useState<SynergyEvidenceStatus>('NONE');
  const [evidenceRefInput, setEvidenceRefInput] = useState('');
  const [savingCase, setSavingCase] = useState(false);

  // Owner Discussion form
  const [noteSide, setNoteSide] = useState<'A' | 'B' | 'AUTO'>('A');
  const [noteStance, setNoteStance] = useState<OwnerAlignmentStance | ''>('AGREED');
  const [noteText, setNoteText] = useState('');
  const [postingNote, setPostingNote] = useState(false);

  // Escalation & Board forms
  const [escalationReason, setEscalationReason] = useState('');
  const [decisionRequested, setDecisionRequested] = useState('');
  const [recommendedOption, setRecommendedOption] = useState<
    RedundancyDecisionType | BoardDecisionOutcome | ''
  >('');
  const [investmentImplications, setInvestmentImplications] = useState('');
  const [scheduledBoardDate, setScheduledBoardDate] = useState('');
  const [escalating, setEscalating] = useState(false);

  const [boardOutcome, setBoardOutcome] = useState<BoardDecisionOutcome>('REUSE');
  const [boardRationale, setBoardRationale] = useState('');
  const [boardImplications, setBoardImplications] = useState('');
  const [boardFollowUpRequired, setBoardFollowUpRequired] = useState(true);
  const [boardFollowUpNotes, setBoardFollowUpNotes] = useState('');
  const [recordingBoard, setRecordingBoard] = useState(false);

  // New Action form
  const [actionTitle, setActionTitle] = useState('');
  const [actionDesc, setActionDesc] = useState('');
  const [actionOwnerId, setActionOwnerId] = useState('');
  const [actionDueDate, setActionDueDate] = useState(() =>
    toUtcDateKey(new Date(Date.now() + 7 * 86400_000))
  );
  const [savingAction, setSavingAction] = useState(false);

  // Close Case form
  const [closingSummary, setClosingSummary] = useState('');
  const [closingCase, setClosingCase] = useState(false);

  // Print Brief Modal
  const [briefOpen, setBriefOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [detail, inits] = await Promise.all([
          repository.getRedundancyCaseDetail(caseId),
          repository.listInitiatives(),
        ]);
        if (!active) return;
        const c = detail.redundancyCase;
        setRedundancyCase(c);
        setActions(detail.actions);
        setEvents(detail.events);
        setBoardDecisions(detail.boardDecisions);
        setInitiatives(inits);

        setStatusInput(normalizeRedundancyCaseStatus(c.status));
        setDecisionInput(c.decisionType ?? '');
        setPmRecommendation(c.portfolioManagerRecommendation);
        setDecisionRationale(c.decisionRationale);
        setAvoidedHoursInput(String(c.estimatedAvoidedEffortHours));
        setAvoidedEurInput(String(c.estimatedAvoidedEffortEur));
        setEstFinancialEurInput(String(c.estimatedFinancialSynergyEur));
        setConfirmedFinancialEurInput(String(c.confirmedFinancialSynergyEur));
        setEvidenceStatusInput(c.synergyEvidenceStatus);
        setEvidenceRefInput(c.confirmedSynergyEvidence);
        setEscalationReason(
          c.escalationReason ?? detail.boardDecisions[0]?.escalationReason ?? ''
        );
        setDecisionRequested(
          c.decisionRequested ?? detail.boardDecisions[0]?.decisionRequested ?? ''
        );
        setRecommendedOption(
          c.recommendedOption ??
            detail.boardDecisions[0]?.recommendedOption ??
            c.decisionType ??
            ''
        );
        setInvestmentImplications(
          detail.boardDecisions[0]?.investmentImplications ?? ''
        );
        setClosingSummary(c.closingOutcomeSummary ?? '');
        setScheduledBoardDate(
          detail.boardDecisions[0]?.scheduledMeetingDate ??
            computeNextBoardMeetingDate(
              new Date(),
              redundancyDeadlineConfig.boardMeetingDayOfMonth,
              redundancyDeadlineConfig.holidays
            )
        );
        setActionOwnerId((prev) => prev || c.initiativeASnapshot.ownerId);
      } catch (err) {
        if (active) {
          notify(
            'error',
            'Unable to load case details',
            err instanceof Error ? err.message : 'Case not found.'
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
    caseId,
    repository,
    dataRevision,
    notify,
    redundancyDeadlineConfig.boardMeetingDayOfMonth,
    redundancyDeadlineConfig.holidays,
  ]);

  const initiativeA = useMemo(
    () => initiatives.find((i) => i.id === redundancyCase?.initiativeAId),
    [initiatives, redundancyCase?.initiativeAId]
  );
  const initiativeB = useMemo(
    () => initiatives.find((i) => i.id === redundancyCase?.initiativeBId),
    [initiatives, redundancyCase?.initiativeBId]
  );

  const sla = useMemo(() => {
    if (!redundancyCase) return null;
    return computeCaseSlaStatus(redundancyCase, actions, redundancyDeadlineConfig);
  }, [redundancyCase, actions, redundancyDeadlineConfig]);

  const assistant = useMemo(() => {
    if (!redundancyCase) return null;
    return buildDecisionAssistantRecommendation(
      redundancyCase,
      initiativeA,
      initiativeB
    );
  }, [redundancyCase, initiativeA, initiativeB]);

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  if (!redundancyCase || !sla || !assistant) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
        <h1 className="text-lg font-bold text-slate-900">Case Not Found</h1>
        <p className="text-xs text-slate-600">
          The requested redundancy &amp; synergy review case could not be found in
          this workspace.
        </p>
        <button
          type="button"
          onClick={() => navigate({ page: 'gov-redundancy', initialTab: returnTab })}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Redundancy &amp; Synergies</span>
        </button>
      </div>
    );
  }

  const isClosed = redundancyCase.status === 'CLOSED';
  const currentStep = getCaseProcessStep(redundancyCase.status, actions.length > 0);
  const ownerDisagreement = hasOwnerDisagreement(redundancyCase);
  const escalationCheck = canEscalateToBoard(redundancyCase);
  const latestPendingBoard = boardDecisions.find((b) => b.status === 'PENDING');

  const handleSaveCaseWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCase(true);
    try {
      await repository.updateRedundancyCase(
        {
          caseId: redundancyCase.id,
          status: isClosed ? undefined : statusInput,
          decisionType: decisionInput === '' ? null : decisionInput,
          portfolioManagerRecommendation: pmRecommendation,
          decisionRationale,
          estimatedAvoidedEffortHours: Number(avoidedHoursInput) || 0,
          estimatedAvoidedEffortEur: Number(avoidedEurInput) || 0,
          estimatedFinancialSynergyEur: Number(estFinancialEurInput) || 0,
          confirmedFinancialSynergyEur: Number(confirmedFinancialEurInput) || 0,
          synergyEvidenceStatus: evidenceStatusInput,
          confirmedSynergyEvidence: evidenceRefInput,
        },
        currentUser
      );
      await bumpDataRevision();
      notify('success', 'Case updated', `${redundancyCase.caseNumber} saved cleanly.`);
    } catch (err) {
      notify(
        'error',
        'Unable to update case',
        err instanceof Error ? err.message : 'Save failed.'
      );
    } finally {
      setSavingCase(false);
    }
  };

  const handlePostDiscussionNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) {
      notify('error', 'Note required', 'Enter an alignment discussion note.');
      return;
    }
    setPostingNote(true);
    try {
      await repository.addRedundancyDiscussionNote(
        {
          caseId: redundancyCase.id,
          applyToSide: noteSide,
          stance: noteStance === '' ? undefined : noteStance,
          note: noteText,
        },
        currentUser
      );
      setNoteText('');
      await bumpDataRevision();
      notify(
        'success',
        'Owner alignment note posted',
        noteStance
          ? `Recorded stance: ${OWNER_ALIGNMENT_STANCE_LABELS[noteStance]}.`
          : 'Discussion thread updated.'
      );
    } catch (err) {
      notify(
        'error',
        'Unable to post discussion note',
        err instanceof Error ? err.message : 'Post failed.'
      );
    } finally {
      setPostingNote(false);
    }
  };

  const handleEscalateToBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    setEscalating(true);
    try {
      const res = await repository.escalateRedundancyCaseToBoard(
        {
          caseId: redundancyCase.id,
          escalationReason:
            escalationReason.trim() ||
            `Escalated by AI Portfolio Manager (${redundancyCase.initiativeASnapshot.ownerName}: ${OWNER_ALIGNMENT_STANCE_LABELS[redundancyCase.ownerAStance]}, ${redundancyCase.initiativeBSnapshot.ownerName}: ${OWNER_ALIGNMENT_STANCE_LABELS[redundancyCase.ownerBStance]}).`,
          decisionRequested: decisionRequested.trim() || undefined,
          recommendedOption:
            recommendedOption === '' ? undefined : recommendedOption,
          investmentImplications,
          scheduledMeetingDate: scheduledBoardDate,
        },
        currentUser
      );
      await bumpDataRevision();
      notify(
        'success',
        'Escalated to AI Governance Board',
        `Scheduled for monthly Board meeting on ${res.boardDecision.scheduledMeetingDate}.`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to escalate case',
        err instanceof Error ? err.message : 'Escalation failed.'
      );
    } finally {
      setEscalating(false);
    }
  };

  const handleRecordBoardDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecordingBoard(true);
    try {
      const res = await repository.recordBoardDecision(
        {
          caseId: redundancyCase.id,
          decisionOutcome: boardOutcome,
          boardRationale,
          investmentImplications:
            boardImplications ||
            `Board direction ${BOARD_DECISION_OUTCOME_LABELS[boardOutcome]} logged without auto-modifying initiative lifecycle stages.`,
          followUpRequired: boardFollowUpRequired,
          followUpNotes: boardFollowUpNotes,
        },
        currentUser
      );
      setBoardRationale('');
      setBoardFollowUpNotes('');
      await bumpDataRevision();
      notify(
        'success',
        'AI Governance Board decision recorded',
        `Mandate: ${BOARD_DECISION_OUTCOME_LABELS[res.boardDecision.decisionOutcome!]}.`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to record Board decision',
        err instanceof Error ? err.message : 'Save failed.'
      );
    } finally {
      setRecordingBoard(false);
    }
  };

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAction(true);
    try {
      await repository.saveRedundancyAction(
        {
          caseId: redundancyCase.id,
          title: actionTitle,
          description: actionDesc,
          ownerId: actionOwnerId || redundancyCase.initiativeASnapshot.ownerId,
          dueDate: actionDueDate,
        },
        currentUser
      );
      setActionTitle('');
      setActionDesc('');
      await bumpDataRevision();
      notify('success', 'Follow-up action assigned', 'Added to implementation plan.');
    } catch (err) {
      notify(
        'error',
        'Unable to add action',
        err instanceof Error ? err.message : 'Save failed.'
      );
    } finally {
      setSavingAction(false);
    }
  };

  const handleCompleteAction = async (act: RedundancyAction) => {
    try {
      await repository.saveRedundancyAction(
        {
          id: act.id,
          caseId: act.caseId,
          title: act.title,
          description: act.description,
          ownerId: act.ownerId,
          dueDate: act.dueDate,
          status: 'COMPLETED',
          completionNotes:
            act.completionNotes || `Completed and verified by ${currentUser.displayName}.`,
        },
        currentUser
      );
      await bumpDataRevision();
      notify('success', 'Action completed', `"${act.title}" marked complete.`);
    } catch (err) {
      notify(
        'error',
        'Unable to complete action',
        err instanceof Error ? err.message : 'Update failed.'
      );
    }
  };

  const handleLogReminder = async (act: RedundancyAction) => {
    try {
      await repository.logRedundancyActionReminder(act.id, currentUser);
      await bumpDataRevision();
      notify(
        'info',
        'Follow-up reminder logged',
        `Audit log updated for "${act.title}" (10 business-day follow-up review: ${act.followUpReviewDueAt}).`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to log reminder',
        err instanceof Error ? err.message : 'Failed.'
      );
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    try {
      await repository.deleteRedundancyAction(actionId, currentUser);
      await bumpDataRevision();
      notify('info', 'Action removed', 'Implementation task deleted.');
    } catch (err) {
      notify(
        'error',
        'Unable to delete action',
        err instanceof Error ? err.message : 'Delete failed.'
      );
    }
  };

  const handleCloseCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setClosingCase(true);
    try {
      await repository.closeRedundancyCase(
        {
          caseId: redundancyCase.id,
          closingOutcomeSummary: closingSummary,
        },
        currentUser
      );
      await bumpDataRevision();
      notify(
        'success',
        'Case closed & documented',
        `${redundancyCase.caseNumber} closed with retained audit history.`
      );
    } catch (err) {
      notify(
        'error',
        'Cannot close case yet',
        err instanceof Error ? err.message : 'Validation failed.'
      );
    } finally {
      setClosingCase(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() =>
              navigate({ page: 'gov-redundancy', initialTab: returnTab })
            }
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004F9F] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Redundancy &amp; Synergies</span>
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {redundancyCase.caseNumber} — Optimization Review Case
            </h1>
            <RedundancyCaseStatusBadge status={redundancyCase.status} />
            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-xs font-semibold text-amber-900 tabular-nums">
              {redundancyCase.heuristicScore}% Heuristic Overlap
            </span>
          </div>
          <p className="text-xs text-slate-600">
            {redundancyCase.capabilityOverlapSummary} · Detected{' '}
            {redundancyCase.detectedAt.slice(0, 10)} · Historical audit history is
            retained permanently.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setBriefOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#004F9F] bg-white px-3.5 py-2 text-xs font-medium text-[#004F9F] hover:bg-[#EBF3FB] whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Print Board Decision Brief</span>
          </button>
        </div>
      </div>

      {/* 3-Stage Portfolio Optimization Process Stepper */}
      <section
        aria-label="3-stage redundancy workflow progress"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {REDUNDANCY_PROCESS_STEPS.map((st) => {
            const completed = st.step < currentStep || isClosed;
            const active = st.step === currentStep && !isClosed;
            return (
              <div
                key={st.step}
                className={`rounded-md border p-2.5 text-xs ${
                  active
                    ? 'border-[#004F9F] bg-[#EBF3FB]/60'
                    : completed
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-semibold">
                  <span
                    className={
                      active
                        ? 'text-[#004F9F]'
                        : completed
                          ? 'text-emerald-800'
                          : 'text-slate-600'
                    }
                  >
                    {st.step}. {st.title}
                  </span>
                  {completed && (
                    <CheckCircle2
                      className="h-3.5 w-3.5 shrink-0 text-emerald-700"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-600">
                  {st.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Business-Day Deadlines & SLA Strip */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <CalendarClock className="h-4 w-4 text-[#004F9F]" aria-hidden="true" />
            <span>
              Business-Day Review Deadlines —{' '}
              <span className="font-normal text-slate-600">
                {redundancyDeadlineConfig.policyDisclaimer}
              </span>
            </span>
          </div>
          {sla.hasAnyOverdue && (
            <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800 tabular-nums">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {sla.isStageOverdue
                  ? `Stage Overdue (+${sla.stageOverdueBusinessDays} bd)`
                  : ''}
                {sla.isStageOverdue && sla.overdueActionsCount > 0 ? ' · ' : ''}
                {sla.overdueActionsCount > 0
                  ? `${sla.overdueActionsCount} Overdue Action(s)`
                  : ''}
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">
              1. Triage Due ({redundancyDeadlineConfig.triageBusinessDays} bd)
            </div>
            <div
              className={`mt-0.5 font-mono font-semibold tabular-nums ${
                sla.isTriageOverdue ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {redundancyCase.triageDueAt}
              {redundancyCase.triagedAt ? ' (Triaged)' : ''}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">
              2. Owner Alignment (+
              {redundancyDeadlineConfig.ownerAlignmentBusinessDays} bd)
            </div>
            <div
              className={`mt-0.5 font-mono font-semibold tabular-nums ${
                sla.isAlignmentOverdue ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {redundancyCase.ownerAlignmentDueAt}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">
              3. Decision Due (+{redundancyDeadlineConfig.decisionBusinessDays} bd)
            </div>
            <div
              className={`mt-0.5 font-mono font-semibold tabular-nums ${
                sla.isDecisionOverdue ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {redundancyCase.decisionDueAt}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">
              Active Stage SLA / Board Target
            </div>
            <div className="mt-0.5 font-mono font-semibold text-[#004F9F] tabular-nums">
              {sla.activeDeadlineDate ?? 'Completed'}
            </div>
          </div>
        </div>
      </section>

      {/* Side-by-Side Initiative Comparison */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Side-by-Side Initiative Comparison
            </h2>
            <p className="text-xs text-slate-600">
              {redundancyCase.similarityExplanation} (Matched:{' '}
              <span className="font-mono">
                {redundancyCase.matchedKeywords.join(', ')}
              </span>
              )
            </p>
          </div>
          <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
            Safe Governance: Never auto-merges, pauses, or mutates initiative stages
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            {
              sideLabel: 'Initiative A',
              snap: redundancyCase.initiativeASnapshot,
              live: initiativeA,
              stance: redundancyCase.ownerAStance,
            },
            {
              sideLabel: 'Initiative B',
              snap: redundancyCase.initiativeBSnapshot,
              live: initiativeB,
              stance: redundancyCase.ownerBStance,
            },
          ].map((item) => {
            const currentStage =
              item.live?.lifecycleStatus ?? item.snap.lifecycleStatusAtDetection;
            const stageAdvanced =
              currentStage !== item.snap.lifecycleStatusAtDetection;
            return (
              <div
                key={item.snap.id}
                className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-500">
                    {item.sideLabel} · {deptName(item.live?.departmentId ?? item.snap.departmentId)}
                  </span>
                  <LifecycleStatusBadge status={currentStage} />
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {item.live?.title ?? item.snap.title}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-slate-700">
                  <span>
                    Owner: <strong>{item.snap.ownerName}</strong>
                  </span>
                  <OwnerStanceBadge stance={item.stance} />
                </div>
                <div className="text-slate-600">
                  Capability:{' '}
                  {item.live?.businessCapability ?? item.snap.businessCapability}{' '}
                  · Platform: {item.live?.aiPlatform ?? item.snap.aiPlatform}
                </div>
                {stageAdvanced && (
                  <div className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-900">
                    Stage at detection:{' '}
                    <strong>
                      {LIFECYCLE_LABELS[item.snap.lifecycleStatusAtDetection]}
                    </strong>{' '}
                    → Current stage:{' '}
                    <strong>{LIFECYCLE_LABELS[currentStage]}</strong> (Case history
                    preserved).
                  </div>
                )}
                {item.live?.businessProblem && (
                  <p className="text-slate-700 leading-relaxed">
                    {item.live.businessProblem}
                  </p>
                )}
                {item.live && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ page: 'detail', initiativeId: item.live!.id })
                    }
                    className="inline-flex items-center gap-1 font-medium text-[#004F9F] hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Inspect Initiative</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Main Two-Column Workflow Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Step 2: Owner Alignment & Discussion */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#004F9F]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                Owner Alignment &amp; Discussion
              </h2>
            </div>
            <span className="text-[11px] text-slate-500">
              {redundancyCase.ownerDiscussionNotes.length} note(s)
            </span>
          </div>

          {ownerDisagreement && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-950 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <span>Owner Alignment Disagreement Detected — Escalation Enabled</span>
              </div>
              <p>
                Owners disagree on consolidation or reuse direction. Prepare the
                Board Brief and escalate to the AI Governance Board for mandate
                resolution.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
            <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="truncate font-medium text-slate-800">
                A: {redundancyCase.initiativeASnapshot.ownerName}
              </span>
              <OwnerStanceBadge stance={redundancyCase.ownerAStance} />
            </div>
            <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="truncate font-medium text-slate-800">
                B: {redundancyCase.initiativeBSnapshot.ownerName}
              </span>
              <OwnerStanceBadge stance={redundancyCase.ownerBStance} />
            </div>
          </div>

          {/* Discussion Thread */}
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {redundancyCase.ownerDiscussionNotes.length === 0 ? (
              <p className="rounded border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                No owner discussion notes logged yet. Record owner alignment
                feedback below.
              </p>
            ) : (
              redundancyCase.ownerDiscussionNotes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">
                      {n.authorName}{' '}
                      <span className="font-normal text-slate-500">
                        ({n.authorRoleLabel})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {n.stance && <OwnerStanceBadge stance={n.stance} />}
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                        {n.createdAt.slice(0, 10)}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{n.note}</p>
                </div>
              ))
            )}
          </div>

          {!isClosed && (
            <form
              onSubmit={handlePostDiscussionNote}
              className="space-y-3 border-t border-slate-200 pt-3 text-xs"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="owner-note-side"
                    className="block text-[11px] font-semibold text-slate-600"
                  >
                    Record Alignment As
                  </label>
                  <select
                    id="owner-note-side"
                    value={noteSide}
                    onChange={(e) =>
                      setNoteSide(e.target.value as 'A' | 'B' | 'AUTO')
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                  >
                    <option value="A">
                      Owner A ({redundancyCase.initiativeASnapshot.ownerName})
                    </option>
                    <option value="B">
                      Owner B ({redundancyCase.initiativeBSnapshot.ownerName})
                    </option>
                    <option value="AUTO">AI Portfolio Manager Note</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="owner-note-stance"
                    className="block text-[11px] font-semibold text-slate-600"
                  >
                    Alignment Stance
                  </label>
                  <select
                    id="owner-note-stance"
                    value={noteStance}
                    onChange={(e) =>
                      setNoteStance(e.target.value as OwnerAlignmentStance | '')
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                  >
                    <option value="">Comment Only (No Stance Change)</option>
                    <option value="AGREED">Agreed</option>
                    <option value="DISAGREED">Disagreed (Conflict)</option>
                    <option value="NEEDS_INFO">Needs More Info</option>
                    <option value="PENDING">Pending Response</option>
                  </select>
                </div>
              </div>
              <div>
                <label
                  htmlFor="owner-note-text"
                  className="block text-[11px] font-semibold text-slate-600"
                >
                  Discussion Note
                </label>
                <textarea
                  id="owner-note-text"
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Document business/technical overlap findings or owner position..."
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={postingNote}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{postingNote ? 'Posting...' : 'Post Alignment Note'}</span>
              </button>
            </form>
          )}
        </section>

        {/* Step 3: Decision Assistant, Case Decision & Separated Synergy Values */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#004F9F]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                Decision Assistant, Classification &amp; Value Tracking
              </h2>
            </div>
            <span className="rounded border border-[#BFD7EE] bg-[#EBF3FB] px-2 py-0.5 text-[11px] font-medium text-[#004F9F]">
              {assistant.confidenceLabel}
            </span>
          </div>

          <div className="rounded-md border border-[#BFD7EE] bg-[#EBF3FB]/50 p-3 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-[#004F9F]">
                Decision Assistant Suggestion:{' '}
                {REDUNDANCY_DECISION_LABELS[assistant.recommendedDecision]}
              </div>
              {!isClosed && (
                <button
                  type="button"
                  onClick={() => {
                    setDecisionInput(assistant.recommendedDecision);
                    if (!decisionRationale.trim()) {
                      setDecisionRationale(assistant.rationale);
                    }
                    if (!pmRecommendation.trim()) {
                      setPmRecommendation(assistant.rationale);
                    }
                  }}
                  className="rounded border border-[#004F9F] bg-white px-2.5 py-1 text-[11px] font-medium text-[#004F9F] hover:bg-[#EBF3FB]"
                >
                  Apply Suggestion
                </button>
              )}
            </div>
            <p className="text-slate-700 leading-relaxed">{assistant.rationale}</p>
          </div>

          <form onSubmit={handleSaveCaseWorkflow} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="case-status-select"
                  className="block font-semibold text-slate-700"
                >
                  Case Status
                </label>
                <select
                  id="case-status-select"
                  disabled={isClosed}
                  value={statusInput}
                  onChange={(e) =>
                    setStatusInput(e.target.value as RedundancyCaseStatus)
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900 disabled:bg-slate-100"
                >
                  {UPDATABLE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {REDUNDANCY_CASE_STATUS_LABELS[st]}
                    </option>
                  ))}
                  {isClosed && <option value="CLOSED">Closed</option>}
                </select>
              </div>
              <div>
                <label
                  htmlFor="case-decision-select"
                  className="block font-semibold text-slate-700"
                >
                  Portfolio Decision Type
                </label>
                <select
                  id="case-decision-select"
                  disabled={isClosed}
                  value={decisionInput}
                  onChange={(e) =>
                    setDecisionInput(e.target.value as RedundancyDecisionType | '')
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900 disabled:bg-slate-100"
                >
                  <option value="">Undecided</option>
                  {REDUNDANCY_DECISION_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {REDUNDANCY_DECISION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="case-pm-rec"
                className="block font-semibold text-slate-700"
              >
                AI Portfolio Manager Recommendation
              </label>
              <textarea
                id="case-pm-rec"
                rows={2}
                disabled={isClosed}
                value={pmRecommendation}
                onChange={(e) => setPmRecommendation(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="case-decision-rationale"
                className="block font-semibold text-slate-700"
              >
                Decision Rationale
              </label>
              <textarea
                id="case-decision-rationale"
                rows={2}
                disabled={isClosed}
                value={decisionRationale}
                onChange={(e) => setDecisionRationale(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 disabled:bg-slate-100"
              />
            </div>

            {/* Strictly Separated Avoided Effort vs Financial Synergy */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2.5">
              <div className="font-semibold text-slate-800">
                Separated Synergy &amp; Avoided Effort Valuation
              </div>
              <p className="text-[11px] text-slate-600">
                Avoided engineering effort is non-cash capacity and never counted as
                realized financial savings. Confirmed financial synergy requires
                documented evidence and is never double-counted into Portfolio Net
                Financial Benefit.
              </p>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="avoided-hours"
                    className="block text-[11px] font-medium text-slate-700"
                  >
                    Est. Avoided Effort (Hours, Non-Cash)
                  </label>
                  <input
                    id="avoided-hours"
                    type="number"
                    min={0}
                    disabled={isClosed}
                    value={avoidedHoursInput}
                    onChange={(e) => setAvoidedHoursInput(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-900 tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="avoided-eur"
                    className="block text-[11px] font-medium text-slate-700"
                  >
                    Est. Avoided Effort Value (€, Non-Cash)
                  </label>
                  <input
                    id="avoided-eur"
                    type="number"
                    min={0}
                    disabled={isClosed}
                    value={avoidedEurInput}
                    onChange={(e) => setAvoidedEurInput(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-900 tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="est-fin-synergy"
                    className="block text-[11px] font-medium text-slate-700"
                  >
                    Est. Financial Synergy (€ License/Cloud)
                  </label>
                  <input
                    id="est-fin-synergy"
                    type="number"
                    min={0}
                    disabled={isClosed}
                    value={estFinancialEurInput}
                    onChange={(e) => setEstFinancialEurInput(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-900 tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="conf-fin-synergy"
                    className="block text-[11px] font-medium text-slate-700"
                  >
                    Confirmed Financial Synergy (€ Evidenced)
                  </label>
                  <input
                    id="conf-fin-synergy"
                    type="number"
                    min={0}
                    disabled={isClosed}
                    value={confirmedFinancialEurInput}
                    onChange={(e) => setConfirmedFinancialEurInput(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="evidence-status"
                    className="block text-[11px] font-medium text-slate-700"
                  >
                    Evidence Status
                  </label>
                  <select
                    id="evidence-status"
                    disabled={isClosed}
                    value={evidenceStatusInput}
                    onChange={(e) =>
                      setEvidenceStatusInput(
                        e.target.value as SynergyEvidenceStatus
                      )
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    <option value="NONE">None</option>
                    <option value="DOCUMENTED">Documented</option>
                    <option value="VERIFIED">Verified</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="evidence-ref"
                    className="block text-[11px] font-medium text-slate-700"
                  >
                    Confirmed Synergy Evidence Reference
                  </label>
                  <input
                    id="evidence-ref"
                    type="text"
                    disabled={isClosed}
                    value={evidenceRefInput}
                    onChange={(e) => setEvidenceRefInput(e.target.value)}
                    placeholder="e.g. Procurement PO / Finance controller signoff..."
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-900"
                  />
                </div>
              </div>
            </div>

            {!isClosed && (
              <button
                type="submit"
                disabled={savingCase}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-4 py-2 font-medium text-white hover:bg-[#003D7A] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{savingCase ? 'Saving...' : 'Save Decision & Valuation'}</span>
              </button>
            )}
          </form>
        </section>
      </div>

      {/* Step 3B: AI Governance Board Escalation & Mandate Recording */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-[#004F9F]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">
              AI Governance Board Escalation &amp; Strategic Mandate
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setBriefOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Open One-Page Board Brief</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Escalate to Board */}
          <form onSubmit={handleEscalateToBoard} className="space-y-3 text-xs">
            <div className="font-semibold text-slate-800">
              {latestPendingBoard
                ? `Pending Board Escalation (Meeting: ${latestPendingBoard.scheduledMeetingDate})`
                : 'Escalate Case to Monthly AI Governance Board'}
            </div>
            <p className="text-[11px] text-slate-600">
              {escalationCheck.reasons[0]}
            </p>
            <div>
              <label
                htmlFor="board-escalation-reason"
                className="block font-medium text-slate-700"
              >
                Escalation Reason
              </label>
              <textarea
                id="board-escalation-reason"
                rows={2}
                disabled={isClosed}
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder="Explain unresolved owner disagreement or Scale/Pause/Retire mandate required..."
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="board-decision-requested"
                className="block font-medium text-slate-700"
              >
                Decision Requested from Board
              </label>
              <input
                id="board-decision-requested"
                type="text"
                disabled={isClosed}
                value={decisionRequested}
                onChange={(e) => setDecisionRequested(e.target.value)}
                placeholder="e.g. Approve consolidation into single shared OCR pipeline or authorize separate build..."
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
              />
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="board-recommended-option"
                  className="block font-medium text-slate-700"
                >
                  Recommended Option
                </label>
                <select
                  id="board-recommended-option"
                  disabled={isClosed}
                  value={recommendedOption}
                  onChange={(e) =>
                    setRecommendedOption(
                      e.target.value as RedundancyDecisionType | BoardDecisionOutcome | ''
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                >
                  <option value="">Select Option</option>
                  {REDUNDANCY_DECISION_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {REDUNDANCY_DECISION_LABELS[d]}
                    </option>
                  ))}
                  {(['SCALE', 'PAUSE', 'RETIRE'] as BoardDecisionOutcome[]).map((o) => (
                    <option key={o} value={o}>
                      {BOARD_DECISION_OUTCOME_LABELS[o]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="board-meeting-date"
                  className="block font-medium text-slate-700"
                >
                  Required Decision Date
                </label>
                <input
                  id="board-meeting-date"
                  type="date"
                  disabled={isClosed}
                  value={scheduledBoardDate}
                  onChange={(e) => setScheduledBoardDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="board-invest-imp"
                  className="block font-medium text-slate-700"
                >
                  Financial / Effort Impact
                </label>
                <input
                  id="board-invest-imp"
                  type="text"
                  disabled={isClosed}
                  value={investmentImplications}
                  onChange={(e) => setInvestmentImplications(e.target.value)}
                  placeholder="Avoided build budget, shared license tier..."
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
                />
              </div>
            </div>
            {!isClosed && (
              <button
                type="submit"
                disabled={escalating || !escalationCheck.allowed}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-3.5 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {escalating
                    ? 'Escalating...'
                    : latestPendingBoard
                      ? 'Update Pending Board Escalation'
                      : 'Escalate to AI Governance Board'}
                </span>
              </button>
            )}
          </form>

          {/* Right: Record Board Decision */}
          <form onSubmit={handleRecordBoardDecision} className="space-y-3 text-xs">
            <div className="font-semibold text-slate-800">
              Record AI Governance Board Decision
            </div>
            <p className="text-[11px] text-slate-600">
              Board mandates set Scale, Pause, Retire, Merge, Reuse, Collaborate, or
              Continue Separately direction without silently changing initiative
              lifecycle status.
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="board-outcome-select"
                  className="block font-medium text-slate-700"
                >
                  Board Decision Outcome
                </label>
                <select
                  id="board-outcome-select"
                  disabled={isClosed}
                  value={boardOutcome}
                  onChange={(e) =>
                    setBoardOutcome(e.target.value as BoardDecisionOutcome)
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
                >
                  {BOARD_DECISION_OUTCOME_ORDER.map((o) => (
                    <option key={o} value={o}>
                      {BOARD_DECISION_OUTCOME_LABELS[o]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 font-medium text-slate-700">
                  <input
                    type="checkbox"
                    disabled={isClosed}
                    checked={boardFollowUpRequired}
                    onChange={(e) => setBoardFollowUpRequired(e.target.checked)}
                  />
                  <span>Follow-up actions required</span>
                </label>
              </div>
            </div>
            <div>
              <label
                htmlFor="board-rationale-input"
                className="block font-medium text-slate-700"
              >
                Board Rationale
              </label>
              <textarea
                id="board-rationale-input"
                rows={2}
                disabled={isClosed}
                value={boardRationale}
                onChange={(e) => setBoardRationale(e.target.value)}
                placeholder="Document Board resolution, mandate owners, and portfolio implications..."
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="board-implications-input"
                className="block font-medium text-slate-700"
              >
                Portfolio &amp; Investment Implications
              </label>
              <input
                id="board-implications-input"
                type="text"
                disabled={isClosed}
                value={boardImplications}
                onChange={(e) => setBoardImplications(e.target.value)}
                placeholder="Redirect duplicate capex, consolidate platform contract..."
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
              />
            </div>
            {!isClosed && (
              <button
                type="submit"
                disabled={recordingBoard}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {recordingBoard
                    ? 'Recording...'
                    : 'Record AI Governance Board Decision'}
                </span>
              </button>
            )}
          </form>
        </div>

        {boardDecisions.length > 0 && (
          <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
            <div className="font-semibold text-slate-800">
              Board Decision Log ({boardDecisions.length})
            </div>
            <div className="space-y-2">
              {boardDecisions.map((bd) => (
                <div
                  key={bd.id}
                  className={`rounded-md border p-3 ${
                    bd.status === 'PENDING'
                      ? 'border-red-200 bg-red-50/50'
                      : 'border-emerald-200 bg-emerald-50/50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {bd.status === 'PENDING'
                        ? `Pending Board Review (Meeting: ${bd.scheduledMeetingDate})`
                        : `Board Mandate: ${BOARD_DECISION_OUTCOME_LABELS[bd.decisionOutcome!]}`}
                    </span>
                    <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                      Escalated {bd.escalatedAt.slice(0, 10)}
                      {bd.decidedAt ? ` · Decided ${bd.decidedAt.slice(0, 10)}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700">
                    {bd.boardRationale || bd.escalationReason}
                  </p>
                  {bd.decisionRequested && (
                    <div className="mt-1 text-[11px] font-medium text-[#004F9F]">
                      Decision Requested: {bd.decisionRequested}
                    </div>
                  )}
                  {bd.recommendedOption && (
                    <div className="mt-0.5 text-[11px] text-slate-700">
                      Recommended Option:{' '}
                      {(
                        {
                          ...REDUNDANCY_DECISION_LABELS,
                          ...BOARD_DECISION_OUTCOME_LABELS,
                        } as Record<string, string>
                      )[bd.recommendedOption] ?? bd.recommendedOption}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-slate-600">
                    Implications: {bd.investmentImplications}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Step 4: Implementation & Follow-up Action Plan */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#004F9F]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">
              Implementation &amp; Follow-up Action Plan ({actions.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            Immediate overdue flag + follow-up review due{' '}
            {redundancyDeadlineConfig.overdueActionFollowUpBusinessDays} business
            days after due date
          </span>
        </div>

        <div className="space-y-2.5">
          {actions.length === 0 ? (
            <p className="rounded border border-dashed border-slate-200 p-3 text-xs text-slate-500">
              No implementation actions assigned yet. Add concrete follow-up tasks
              below.
            </p>
          ) : (
            actions.map((act) => {
              const evalInfo = sla.actionEvaluations.get(act.id);
              const isOverdue = evalInfo?.isOverdue ?? false;
              const isFollowUpDue = evalInfo?.isFollowUpReviewDue ?? false;
              return (
                <div
                  key={act.id}
                  className={`rounded-md border p-3.5 text-xs ${
                    isOverdue
                      ? 'border-red-300 bg-red-50/40'
                      : act.status === 'COMPLETED'
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {act.title}
                        </span>
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {REDUNDANCY_ACTION_STATUS_LABELS[act.status]}
                        </span>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900 tabular-nums">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            <span>
                              Overdue (+{evalInfo?.overdueBusinessDays} bd)
                            </span>
                          </span>
                        )}
                        {isFollowUpDue && (
                          <span className="rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                            10-bd Follow-Up Review Due
                          </span>
                        )}
                      </div>
                      <p className="text-slate-700">{act.description}</p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 tabular-nums">
                        <span>
                          Owner: <strong>{act.ownerName}</strong>
                        </span>
                        <span>Due: {act.dueDate}</span>
                        <span>
                          Follow-Up Review Due: {act.followUpReviewDueAt}
                        </span>
                        {act.lastReminderSentAt && (
                          <span>
                            Last Reminder: {act.lastReminderSentAt.slice(0, 10)}
                          </span>
                        )}
                      </div>
                      {act.completionNotes && (
                        <div className="text-[11px] text-emerald-800">
                          Outcome: {act.completionNotes}
                        </div>
                      )}
                    </div>

                    {!isClosed && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {act.status !== 'COMPLETED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleCompleteAction(act)}
                              className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              <span>Mark Complete</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleLogReminder(act)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                            >
                              <Bell className="h-3 w-3" aria-hidden="true" />
                              <span>Log Reminder</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteAction(act.id)}
                          aria-label={`Delete action ${act.title}`}
                          className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!isClosed && (
          <form
            onSubmit={handleCreateAction}
            className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 text-xs sm:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <label
                htmlFor="new-action-title"
                className="block font-medium text-slate-700"
              >
                Action Title
              </label>
              <input
                id="new-action-title"
                type="text"
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
                placeholder="e.g. Consolidate OCR pipeline endpoint"
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="new-action-owner"
                className="block font-medium text-slate-700"
              >
                Assignee
              </label>
              <select
                id="new-action-owner"
                value={actionOwnerId}
                onChange={(e) => setActionOwnerId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="new-action-due"
                className="block font-medium text-slate-700"
              >
                Due Date
              </label>
              <input
                id="new-action-due"
                type="date"
                value={actionDueDate}
                onChange={(e) => setActionDueDate(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
              />
            </div>
            <div className="sm:col-span-3">
              <label
                htmlFor="new-action-desc"
                className="block font-medium text-slate-700"
              >
                Action Description
              </label>
              <input
                id="new-action-desc"
                type="text"
                value={actionDesc}
                onChange={(e) => setActionDesc(e.target.value)}
                placeholder="Deliverable, shared milestone, or verification requirement..."
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={savingAction}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#004F9F] px-3 py-1.5 font-medium text-white hover:bg-[#003D7A] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{savingAction ? 'Adding...' : 'Add Action'}</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Step 5: Close Case & Audit Event History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">
              Close &amp; Measure Outcome
            </h2>
          </div>

          {isClosed ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 space-y-2">
              <div className="font-bold">
                Case Closed on {redundancyCase.closedAt?.slice(0, 10)} by{' '}
                {redundancyCase.closedBy}
              </div>
              <p className="leading-relaxed">
                {redundancyCase.closingOutcomeSummary}
              </p>
              <div className="flex flex-wrap gap-4 pt-1 font-medium tabular-nums">
                <span>
                  Avoided Effort: {redundancyCase.estimatedAvoidedEffortHours} hrs (
                  {eur(redundancyCase.estimatedAvoidedEffortEur)})
                </span>
                <span>
                  Confirmed Financial Synergy:{' '}
                  {eur(redundancyCase.confirmedFinancialSynergyEur)}
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCloseCase} className="space-y-3 text-xs">
              <p className="text-slate-600">
                Closing a case requires a saved Portfolio Decision, a documented
                outcome summary (at least 5 characters), and verified evidence if
                Confirmed Financial Synergy &gt; €0.
              </p>
              <div>
                <label
                  htmlFor="close-outcome-summary"
                  className="block font-semibold text-slate-700"
                >
                  Documented Closing Outcome Summary
                </label>
                <textarea
                  id="close-outcome-summary"
                  rows={3}
                  value={closingSummary}
                  onChange={(e) => setClosingSummary(e.target.value)}
                  placeholder="Summarize verified reuse/merge implementation outcome and evidence reference..."
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={closingCase}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{closingCase ? 'Closing...' : 'Close Case'}</span>
              </button>
            </form>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                Immutable Case Audit History ({events.length})
              </h2>
            </div>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1 text-xs">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="rounded border border-slate-200 bg-slate-50 px-3 py-2 space-y-0.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {evt.summary}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                    {evt.timestamp.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  {evt.actorName} ({evt.actorRoleLabel})
                </div>
                {evt.details && (
                  <p className="text-[11px] text-slate-700">{evt.details}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <BoardDecisionBriefModal
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        redundancyCase={redundancyCase}
        initiativeA={initiativeA}
        initiativeB={initiativeB}
        departments={departments}
        actions={actions}
        boardDecisions={boardDecisions}
        deadlineConfig={redundancyDeadlineConfig}
      />
    </div>
  );
};
