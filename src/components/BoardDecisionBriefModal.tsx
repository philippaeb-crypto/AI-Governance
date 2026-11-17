import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import {
  buildDecisionAssistantRecommendation,
  computeNextBoardMeetingDate,
} from '../domain/redundancyWorkflow';
import {
  BOARD_DECISION_OUTCOME_LABELS,
  BoardDecision,
  Department,
  Initiative,
  LIFECYCLE_LABELS,
  OWNER_ALIGNMENT_STANCE_LABELS,
  REDUNDANCY_DECISION_LABELS,
  RedundancyAction,
  RedundancyCase,
  RedundancyDeadlineConfig,
} from '../domain/types';
import { AbbottLogoSlot } from './AbbottLogoSlot';
import { OwnerStanceBadge, RedundancyCaseStatusBadge } from './StatusBadge';

export interface BoardDecisionBriefModalProps {
  open: boolean;
  onClose: () => void;
  redundancyCase: RedundancyCase;
  initiativeA?: Initiative;
  initiativeB?: Initiative;
  departments: Department[];
  actions: RedundancyAction[];
  boardDecisions: BoardDecision[];
  deadlineConfig: RedundancyDeadlineConfig;
}

function eur(n: number): string {
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

export const BoardDecisionBriefModal: React.FC<BoardDecisionBriefModalProps> = ({
  open,
  onClose,
  redundancyCase,
  initiativeA,
  initiativeB,
  departments,
  actions,
  boardDecisions,
  deadlineConfig,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleAfterPrint = () => {
      document.body.classList.remove('print-board-brief');
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('print-board-brief');
    };
  }, [open, onClose]);

  if (!open) return null;

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const latestBoard = boardDecisions[0] ?? null;
  const scheduledMeeting =
    latestBoard?.scheduledMeetingDate ??
    computeNextBoardMeetingDate(
      redundancyCase.escalatedAt ?? new Date(),
      deadlineConfig.boardMeetingDayOfMonth,
      deadlineConfig.holidays
    );

  const assistant = buildDecisionAssistantRecommendation(
    redundancyCase,
    initiativeA,
    initiativeB
  );

  const handlePrint = () => {
    document.body.classList.add('print-board-brief');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-board-brief');
    }, 500);
  };

  const renderBriefDocument = () => (
    <div className="space-y-4 bg-white p-6 text-slate-900 text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#004F9F] pb-3">
        <div className="flex items-center gap-3">
          <AbbottLogoSlot variant="header" />
          <div className="border-l border-slate-200 pl-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#004F9F]">
              AI Governance Board — Decision Brief
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Case {redundancyCase.caseNumber}: Portfolio Optimization &amp; Escalation Review
            </h2>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-2">
            <RedundancyCaseStatusBadge status={redundancyCase.status} />
            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-900 tabular-nums">
              {redundancyCase.heuristicScore}% Heuristic Overlap
            </span>
          </div>
          <div className="text-[11px] text-slate-600 tabular-nums">
            Scheduled Monthly Board Meeting: <strong>{scheduledMeeting}</strong>
          </div>
        </div>
      </div>

      {/* Executive Escalation Summary */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Escalation Summary &amp; Trigger
          </div>
          <p className="text-slate-800 leading-relaxed">
            {latestBoard?.escalationReason ||
              redundancyCase.escalationReason ||
              redundancyCase.similarityExplanation}
          </p>
          {(latestBoard?.decisionRequested || redundancyCase.decisionRequested) && (
            <div className="pt-1 text-[11px] text-slate-800">
              <strong>Decision Requested:</strong>{' '}
              {latestBoard?.decisionRequested || redundancyCase.decisionRequested}
            </div>
          )}
          {redundancyCase.matchedKeywords.length > 0 && (
            <div className="pt-1 text-[11px] text-slate-600">
              Matched terms:{' '}
              <span className="font-mono">
                {redundancyCase.matchedKeywords.join(', ')}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-md border border-[#BFD7EE] bg-[#EBF3FB]/50 p-3 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#004F9F]">
            AI Portfolio Manager Recommendation
          </div>
          <p className="text-slate-800 leading-relaxed">
            {redundancyCase.portfolioManagerRecommendation || assistant.rationale}
          </p>
          <div className="pt-1 text-[11px] text-slate-700">
            Recommended Option:{' '}
            <strong>
              {(() => {
                const rec =
                  latestBoard?.recommendedOption ??
                  redundancyCase.recommendedOption ??
                  redundancyCase.decisionType ??
                  assistant.recommendedDecision;
                if (rec in REDUNDANCY_DECISION_LABELS) {
                  return REDUNDANCY_DECISION_LABELS[
                    rec as keyof typeof REDUNDANCY_DECISION_LABELS
                  ];
                }
                return BOARD_DECISION_OUTCOME_LABELS[
                  rec as keyof typeof BOARD_DECISION_OUTCOME_LABELS
                ];
              })()}
            </strong>
            {' · '}
            Board Mandate Options: Scale, Pause, Retire, Merge, Reuse, Collaborate, Continue Separately.
          </div>
        </div>
      </div>

      {/* Side-by-Side Initiative Comparison */}
      <div className="rounded-md border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Side-by-Side Initiative Comparison (Initiatives Never Auto-Modified)
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
          {[
            {
              side: 'Initiative A',
              snap: redundancyCase.initiativeASnapshot,
              live: initiativeA,
              stance: redundancyCase.ownerAStance,
            },
            {
              side: 'Initiative B',
              snap: redundancyCase.initiativeBSnapshot,
              live: initiativeB,
              stance: redundancyCase.ownerBStance,
            },
          ].map((item) => (
            <div key={item.snap.id} className="p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-500">
                  {item.side}
                </span>
                <OwnerStanceBadge stance={item.stance} />
              </div>
              <div className="text-sm font-bold text-slate-900">
                {item.live?.title ?? item.snap.title}
              </div>
              <div className="text-slate-600">
                {deptName(item.live?.departmentId ?? item.snap.departmentId)} · Owner:{' '}
                <strong>{item.snap.ownerName}</strong>
              </div>
              <div className="text-slate-600">
                Stage:{' '}
                <strong>
                  {LIFECYCLE_LABELS[
                    item.live?.lifecycleStatus ?? item.snap.lifecycleStatusAtDetection
                  ]}
                </strong>{' '}
                · Platform: {item.live?.aiPlatform ?? item.snap.aiPlatform}
              </div>
              <div className="text-slate-600">
                Capability: {item.live?.businessCapability ?? item.snap.businessCapability}
              </div>
              {item.live?.businessProblem && (
                <p className="text-slate-700 leading-relaxed pt-1">
                  {item.live.businessProblem}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Value Impact & Financial Governance Separation */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-medium text-slate-500">
            Estimated Avoided Effort (Non-Cash)
          </div>
          <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
            {redundancyCase.estimatedAvoidedEffortHours} hrs ·{' '}
            {eur(redundancyCase.estimatedAvoidedEffortEur)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Engineering capacity avoidance — excluded from financial savings
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-medium text-slate-500">
            Estimated Financial Synergy
          </div>
          <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
            {eur(redundancyCase.estimatedFinancialSynergyEur)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Projected license / infrastructure duplication reduction
          </div>
        </div>

        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="text-[11px] font-medium text-emerald-900">
            Confirmed Financial Synergy (Evidenced)
          </div>
          <div className="mt-0.5 text-base font-bold text-emerald-800 tabular-nums">
            {redundancyCase.synergyEvidenceStatus !== 'NONE' &&
            redundancyCase.confirmedSynergyEvidence.trim()
              ? eur(redundancyCase.confirmedFinancialSynergyEur)
              : '€0 (Pending Evidence)'}
          </div>
          <div className="mt-0.5 text-[10px] text-emerald-900">
            Tracked separately; never double-counted in Net Financial Benefit
          </div>
        </div>
      </div>

      {/* Investment Implications & Owner Alignment Notes */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Investment &amp; Portfolio Implications
          </div>
          <p className="text-slate-800 leading-relaxed">
            {latestBoard?.investmentImplications ||
              `Clarifies duplicate investment prior to additional build spend across ${deptName(redundancyCase.initiativeASnapshot.departmentId)} and ${deptName(redundancyCase.initiativeBSnapshot.departmentId)}.`}
          </p>
          <div className="pt-1 text-[11px] text-slate-600 tabular-nums">
            Open/Active Actions: {actions.filter((a) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED').length} · Completed Actions: {actions.filter((a) => a.status === 'COMPLETED').length}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-3 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Owner Alignment &amp; Discussion Summary
          </div>
          <div className="text-[11px] text-slate-700">
            {redundancyCase.initiativeASnapshot.ownerName}:{' '}
            <strong>{OWNER_ALIGNMENT_STANCE_LABELS[redundancyCase.ownerAStance]}</strong>
            {' · '}
            {redundancyCase.initiativeBSnapshot.ownerName}:{' '}
            <strong>{OWNER_ALIGNMENT_STANCE_LABELS[redundancyCase.ownerBStance]}</strong>
          </div>
          {redundancyCase.ownerDiscussionNotes.slice(-2).map((n) => (
            <div key={n.id} className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              <strong>{n.authorName}:</strong> {n.note}
            </div>
          ))}
        </div>
      </div>

      {/* Board Ruling (if recorded) */}
      {latestBoard && latestBoard.status === 'DECIDED' && latestBoard.decisionOutcome && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-950">
              Recorded Board Mandate:{' '}
              {BOARD_DECISION_OUTCOME_LABELS[latestBoard.decisionOutcome]}
            </span>
            <span className="text-[11px] text-emerald-800 tabular-nums">
              Recorded by {latestBoard.decidedBy} on{' '}
              {latestBoard.decidedAt?.slice(0, 10)}
            </span>
          </div>
          <p className="text-emerald-950">{latestBoard.boardRationale}</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Board Decision Brief for ${redundancyCase.caseNumber}`}
      >
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                AI Governance Board Decision Brief — {redundancyCase.caseNumber}
              </h2>
              <p className="text-[11px] text-slate-600">
                One-page executive escalation summary ready for Board review or PDF print.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#003D7A]"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Print Brief</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Board Decision Brief"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto">{renderBriefDocument()}</div>
        </div>
      </div>

      {/* Print-Only Standalone Root */}
      <div className="board-brief-print-root">{renderBriefDocument()}</div>
    </>
  );
};
