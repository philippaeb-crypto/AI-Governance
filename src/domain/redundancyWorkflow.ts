import { PortfolioFinancialSummary } from './financials';
import {
  ELIGIBLE_REDUNDANCY_STATUSES,
  RedundancyAnalysisSummary,
} from './redundancy';
import {
  BoardDecision,
  Initiative,
  LegacyRedundancyCaseStatus,
  normalizeRedundancyCaseStatus,
  REDUNDANCY_DECISION_LABELS,
  RedundancyAction,
  RedundancyCase,
  RedundancyCaseStatus,
  RedundancyDeadlineConfig,
  RedundancyDecisionType,
} from './types';

export const DEFAULT_REDUNDANCY_DEADLINE_CONFIG: RedundancyDeadlineConfig = {
  triageBusinessDays: 5,
  ownerAlignmentBusinessDays: 10,
  decisionBusinessDays: 5,
  overdueActionFollowUpBusinessDays: 10,
  boardMeetingDayOfMonth: 15,
  holidays: ['2026-12-25', '2026-12-26', '2027-01-01'],
  policyDisclaimer:
    'Proposed default review deadlines (not existing corporate policy). Editable in Platform Settings.',
};

export interface RedundancyProcessStepMeta {
  step: 1 | 2 | 3;
  title: string;
  description: string;
}

export const REDUNDANCY_PROCESS_STEPS: RedundancyProcessStepMeta[] = [
  {
    step: 1,
    title: 'Review',
    description:
      'Assess similarity match, verify capability overlap, and initiate case triage.',
  },
  {
    step: 2,
    title: 'Decide',
    description:
      'Coordinate owners to choose Merge, Reuse, Collaborate, Continue Separately, Not Redundant, or escalate to AI Governance Board.',
  },
  {
    step: 3,
    title: 'Track',
    description:
      'Execute assigned actions, monitor overdue follow-ups, confirm synergy value, and close the case.',
  },
];

export function migrateLegacyRedundancyCase(c: RedundancyCase): RedundancyCase {
  return {
    ...c,
    status: normalizeRedundancyCaseStatus(c.status),
  };
}

// ---------- Business Day & Calendar Utilities ----------

export function toUtcDateKey(input: Date | string): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } else if (!Number.isNaN(input.getTime())) {
    return input.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function parseUtcDateKey(dateKey: string): Date {
  const clean = toUtcDateKey(dateKey);
  const [y, m, d] = clean.split('-').map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function isBusinessDay(dateKey: string, holidays: string[] = []): boolean {
  const dt = parseUtcDateKey(dateKey);
  const day = dt.getUTCDay();
  if (day === 0 || day === 6) return false;
  const normalized = toUtcDateKey(dt);
  return !holidays.includes(normalized);
}

export function addBusinessDays(
  startIsoOrDateKey: string | Date,
  businessDays: number,
  holidays: string[] = []
): string {
  const startKey = toUtcDateKey(startIsoOrDateKey);
  const current = parseUtcDateKey(startKey);
  if (businessDays <= 0) {
    while (!isBusinessDay(toUtcDateKey(current), holidays)) {
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return toUtcDateKey(current);
  }

  let remaining = Math.round(businessDays);
  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (isBusinessDay(toUtcDateKey(current), holidays)) {
      remaining -= 1;
    }
  }
  return toUtcDateKey(current);
}

export function countOverdueBusinessDays(
  dueDateKey: string,
  asOfIsoOrDateKey: string | Date,
  holidays: string[] = []
): number {
  const dueKey = toUtcDateKey(dueDateKey);
  const asOfKey = toUtcDateKey(asOfIsoOrDateKey);
  if (asOfKey <= dueKey) return 0;

  const cursor = parseUtcDateKey(dueKey);
  const target = parseUtcDateKey(asOfKey);
  let count = 0;

  while (cursor.getTime() < target.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(toUtcDateKey(cursor), holidays)) {
      count += 1;
    }
  }
  return count;
}

export function computeNextBoardMeetingDate(
  fromIsoOrDateKey: string | Date,
  boardMeetingDayOfMonth = 15,
  holidays: string[] = []
): string {
  const fromKey = toUtcDateKey(fromIsoOrDateKey);
  const from = parseUtcDateKey(fromKey);
  const clampedDay = Math.max(1, Math.min(28, Math.round(boardMeetingDayOfMonth || 15)));

  const makeMonthlyCandidate = (year: number, monthIndex: number): string => {
    const dt = new Date(Date.UTC(year, monthIndex, clampedDay, 0, 0, 0, 0));
    while (!isBusinessDay(toUtcDateKey(dt), holidays)) {
      dt.setUTCDate(dt.getUTCDate() + 1);
    }
    return toUtcDateKey(dt);
  };

  const thisMonthCandidate = makeMonthlyCandidate(
    from.getUTCFullYear(),
    from.getUTCMonth()
  );
  if (thisMonthCandidate > fromKey) {
    return thisMonthCandidate;
  }

  const nextMonth = from.getUTCMonth() + 1;
  const nextYear = from.getUTCFullYear() + (nextMonth > 11 ? 1 : 0);
  return makeMonthlyCandidate(nextYear, nextMonth % 12);
}

export function computeCaseDeadlines(
  detectedAtIso: string,
  config: RedundancyDeadlineConfig = DEFAULT_REDUNDANCY_DEADLINE_CONFIG
): {
  triageDueAt: string;
  ownerAlignmentDueAt: string;
  decisionDueAt: string;
} {
  const triageDueAt = addBusinessDays(
    detectedAtIso,
    config.triageBusinessDays,
    config.holidays
  );
  const ownerAlignmentDueAt = addBusinessDays(
    triageDueAt,
    config.ownerAlignmentBusinessDays,
    config.holidays
  );
  const decisionDueAt = addBusinessDays(
    ownerAlignmentDueAt,
    config.decisionBusinessDays,
    config.holidays
  );
  return {
    triageDueAt,
    ownerAlignmentDueAt,
    decisionDueAt,
  };
}

// ---------- Case SLA & Action Overdue Computation ----------

export interface ActionSlaEvaluation {
  actionId: string;
  isOverdue: boolean;
  overdueBusinessDays: number;
  followUpReviewDueAt: string;
  isFollowUpReviewDue: boolean;
}

export interface CaseSlaEvaluation {
  todayKey: string;
  activeDeadlineLabel: string;
  activeDeadlineDate: string | null;
  isTriageOverdue: boolean;
  isAlignmentOverdue: boolean;
  isDecisionOverdue: boolean;
  isStageOverdue: boolean;
  stageOverdueBusinessDays: number;
  overdueActionsCount: number;
  followUpDueActionsCount: number;
  hasAnyOverdue: boolean;
  actionEvaluations: Map<string, ActionSlaEvaluation>;
}

export function computeCaseSlaStatus(
  c: RedundancyCase,
  actions: RedundancyAction[],
  config: RedundancyDeadlineConfig = DEFAULT_REDUNDANCY_DEADLINE_CONFIG,
  now: Date = new Date()
): CaseSlaEvaluation {
  const todayKey = toUtcDateKey(now);
  const actionEvaluations = new Map<string, ActionSlaEvaluation>();
  let overdueActionsCount = 0;
  let followUpDueActionsCount = 0;

  for (const act of actions) {
    const isActive = act.status === 'OPEN' || act.status === 'IN_PROGRESS';
    const dueKey = toUtcDateKey(act.dueDate);
    const followUpKey =
      act.followUpReviewDueAt ||
      addBusinessDays(
        dueKey,
        config.overdueActionFollowUpBusinessDays,
        config.holidays
      );
    const isOverdue = isActive && todayKey > dueKey;
    const overdueBusinessDays = isOverdue
      ? countOverdueBusinessDays(dueKey, todayKey, config.holidays)
      : 0;
    const isFollowUpReviewDue = isOverdue && todayKey >= followUpKey;
    if (isOverdue) overdueActionsCount += 1;
    if (isFollowUpReviewDue) followUpDueActionsCount += 1;

    actionEvaluations.set(act.id, {
      actionId: act.id,
      isOverdue,
      overdueBusinessDays,
      followUpReviewDueAt: followUpKey,
      isFollowUpReviewDue,
    });
  }

  const normStatus = normalizeRedundancyCaseStatus(c.status);
  const isClosed = normStatus === 'CLOSED';
  const isTriageOverdue =
    !isClosed && normStatus === 'NEW' && todayKey > c.triageDueAt;
  const isAlignmentOverdue =
    !isClosed && normStatus === 'IN_REVIEW' && todayKey > c.ownerAlignmentDueAt;
  const hasActiveActions = actions.some(
    (a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS'
  );
  const isDecisionOverdue =
    !isClosed &&
    normStatus === 'ACTION_AGREED' &&
    !hasActiveActions &&
    !c.implementationStartedAt &&
    todayKey > c.decisionDueAt;

  let activeDeadlineLabel = 'Closed';
  let activeDeadlineDate: string | null = null;
  let stageOverdueBusinessDays = 0;

  if (!isClosed) {
    if (normStatus === 'NEW') {
      activeDeadlineLabel = `Review triage due (${config.triageBusinessDays} business days)`;
      activeDeadlineDate = c.triageDueAt;
      stageOverdueBusinessDays = countOverdueBusinessDays(
        c.triageDueAt,
        todayKey,
        config.holidays
      );
    } else if (normStatus === 'IN_REVIEW') {
      activeDeadlineLabel = `Owner alignment & decision due (+${config.ownerAlignmentBusinessDays} business days)`;
      activeDeadlineDate = c.ownerAlignmentDueAt;
      stageOverdueBusinessDays = countOverdueBusinessDays(
        c.ownerAlignmentDueAt,
        todayKey,
        config.holidays
      );
    } else if (normStatus === 'ACTION_AGREED') {
      const nextDueAction = actions
        .filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      if (nextDueAction || c.implementationStartedAt) {
        activeDeadlineLabel = 'Action plan execution in progress';
        activeDeadlineDate = nextDueAction?.dueDate ?? null;
      } else {
        activeDeadlineLabel = `Rollout action plan due (+${config.decisionBusinessDays} business days)`;
        activeDeadlineDate = c.decisionDueAt;
        stageOverdueBusinessDays = countOverdueBusinessDays(
          c.decisionDueAt,
          todayKey,
          config.holidays
        );
      }
    } else if (normStatus === 'ESCALATED') {
      activeDeadlineLabel = 'Awaiting next monthly AI Governance Board';
      activeDeadlineDate = computeNextBoardMeetingDate(
        c.escalatedAt ?? todayKey,
        config.boardMeetingDayOfMonth,
        config.holidays
      );
    }
  }

  const isStageOverdue = isTriageOverdue || isAlignmentOverdue || isDecisionOverdue;
  return {
    todayKey,
    activeDeadlineLabel,
    activeDeadlineDate,
    isTriageOverdue,
    isAlignmentOverdue,
    isDecisionOverdue,
    isStageOverdue,
    stageOverdueBusinessDays,
    overdueActionsCount,
    followUpDueActionsCount,
    hasAnyOverdue: isStageOverdue || overdueActionsCount > 0,
    actionEvaluations,
  };
}

export function getCaseProcessStep(
  status: RedundancyCaseStatus | LegacyRedundancyCaseStatus,
  hasOwnerActivity = false
): 1 | 2 | 3 {
  const normalized = normalizeRedundancyCaseStatus(status);
  switch (normalized) {
    case 'NEW':
      return 1;
    case 'IN_REVIEW':
      return hasOwnerActivity ? 2 : 1;
    case 'ESCALATED':
      return 2;
    case 'ACTION_AGREED':
    case 'CLOSED':
      return 3;
  }
}

// ---------- Decision Assistant & Escalation Rules ----------

export interface DecisionAssistantRecommendation {
  recommendedDecision: RedundancyDecisionType;
  confidenceLabel: 'High Match Signal' | 'Moderate Overlap Signal' | 'Low Overlap Signal';
  rationale: string;
  boardEscalationRecommended: boolean;
  boardEscalationReason: string | null;
}

export function hasOwnerDisagreement(c: RedundancyCase): boolean {
  if (c.ownerAStance === 'DISAGREED' || c.ownerBStance === 'DISAGREED') {
    return true;
  }
  return false;
}

export function canEscalateToBoard(c: RedundancyCase): {
  allowed: boolean;
  reasons: string[];
} {
  const normalized = normalizeRedundancyCaseStatus(c.status);
  if (normalized === 'CLOSED') {
    return { allowed: false, reasons: ['Closed cases cannot be escalated.'] };
  }
  const reasons: string[] = [];
  if (hasOwnerDisagreement(c)) {
    reasons.push('Initiative owners disagree on consolidation / reuse direction.');
  }
  if (normalized === 'IN_REVIEW' || normalized === 'ACTION_AGREED' || normalized === 'ESCALATED') {
    reasons.push(
      'AI Portfolio Manager can escalate unresolved owner alignment or strategic Scale, Pause, or Retire choices to the AI Governance Board.'
    );
  }
  if (reasons.length === 0) {
    reasons.push('AI Governance Board review requested for strategic portfolio alignment.');
  }
  return { allowed: true, reasons };
}

export function buildDecisionAssistantRecommendation(
  c: RedundancyCase,
  initA?: Initiative,
  initB?: Initiative
): DecisionAssistantRecommendation {
  const score = c.heuristicScore;
  const sameCap =
    (initA?.businessCapability ?? c.initiativeASnapshot.businessCapability)
      .trim()
      .toLowerCase() ===
    (initB?.businessCapability ?? c.initiativeBSnapshot.businessCapability)
      .trim()
      .toLowerCase();
  const sameDept =
    (initA?.departmentId ?? c.initiativeASnapshot.departmentId) ===
    (initB?.departmentId ?? c.initiativeBSnapshot.departmentId);
  const samePlatform =
    (initA?.aiPlatform ?? c.initiativeASnapshot.aiPlatform)
      .trim()
      .toLowerCase() ===
    (initB?.aiPlatform ?? c.initiativeBSnapshot.aiPlatform)
      .trim()
      .toLowerCase();

  const disagreement = hasOwnerDisagreement(c);
  const stageA = initA?.lifecycleStatus ?? c.initiativeASnapshot.lifecycleStatusAtDetection;
  const stageB = initB?.lifecycleStatus ?? c.initiativeBSnapshot.lifecycleStatusAtDetection;
  const stageGap =
    (stageA === 'PILOT' || stageA === 'PRODUCTION' || stageA === 'SCALE_IMPROVE') !==
    (stageB === 'PILOT' || stageB === 'PRODUCTION' || stageB === 'SCALE_IMPROVE');

  let recommendedDecision: RedundancyDecisionType = 'COLLABORATE';
  let confidenceLabel: DecisionAssistantRecommendation['confidenceLabel'] =
    'Moderate Overlap Signal';
  let rationale = '';

  if (score >= 70 && sameCap && sameDept) {
    recommendedDecision = 'MERGE';
    confidenceLabel = 'High Match Signal';
    rationale = `Both initiatives address "${c.initiativeASnapshot.businessCapability}" within the same department (${score}% heuristic overlap). Merging removes duplicate build & maintenance overhead.`;
  } else if (score >= 55 && (sameCap || samePlatform || stageGap)) {
    recommendedDecision = 'REUSE';
    confidenceLabel = 'High Match Signal';
    rationale = `Strong capability/platform overlap (${score}%) across teams${stageGap ? ' with one solution already further along in Pilot/Production' : ''}. Recommend reusing core prompts/services instead of parallel development.`;
  } else if (score >= 35) {
    recommendedDecision = 'COLLABORATE';
    confidenceLabel = 'Moderate Overlap Signal';
    rationale = `Partial functional overlap (${score}%; matched terms: ${c.matchedKeywords.slice(0, 4).join(', ')}). Recommend shared architecture / evaluation benchmarks while keeping distinct business workflows.`;
  } else if (score >= 24) {
    recommendedDecision = 'CONTINUE_SEPARATELY';
    confidenceLabel = 'Low Overlap Signal';
    rationale = `Limited keyword overlap (${score}%) across distinct operational goals. Recommend separate continuation with periodic portfolio check-ins.`;
  } else {
    recommendedDecision = 'NOT_REDUNDANT';
    confidenceLabel = 'Low Overlap Signal';
    rationale = `Low similarity (${score}%). Scope and target users are distinct.`;
  }

  let boardEscalationRecommended = false;
  let boardEscalationReason: string | null = null;

  if (disagreement) {
    boardEscalationRecommended = true;
    boardEscalationReason = `Owner alignment conflict detected (${c.initiativeASnapshot.ownerName}: ${c.ownerAStance}; ${c.initiativeBSnapshot.ownerName}: ${c.ownerBStance}). Escalate to the AI Governance Board for mandate resolution (${REDUNDANCY_DECISION_LABELS[recommendedDecision]} vs Scale/Pause/Retire).`;
  }

  return {
    recommendedDecision,
    confidenceLabel,
    rationale,
    boardEscalationRecommended,
    boardEscalationReason,
  };
}

// ---------- Close Validation ----------

export interface CloseValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCloseRedundancyCase(params: {
  redundancyCase: RedundancyCase;
  actions: RedundancyAction[];
  closingOutcomeSummary: string;
}): CloseValidationResult {
  const { redundancyCase, closingOutcomeSummary } = params;
  if (closingOutcomeSummary.trim().length < 5) {
    return {
      valid: false,
      error:
        'Closing a case requires a documented outcome summary (at least 5 characters).',
    };
  }
  if (!redundancyCase.decisionType) {
    return {
      valid: false,
      error:
        'Select and record a portfolio decision (Merge, Reuse, Collaborate, Continue Separately, or Not Redundant) before closing the case.',
    };
  }
  if (
    redundancyCase.confirmedFinancialSynergyEur > 0 &&
    (redundancyCase.synergyEvidenceStatus === 'NONE' ||
      redundancyCase.confirmedSynergyEvidence.trim().length < 5)
  ) {
    return {
      valid: false,
      error:
        'Confirmed Financial Synergy Value requires documented or verified financial evidence before closing.',
    };
  }
  return { valid: true };
}

// ---------- 10 Required Portfolio Optimization Metrics ----------

export interface RedundancyPortfolioMetrics {
  potentialRedundancyRatePercent: number;
  confirmedRedundancyRatePercent: number;
  confirmedRedundancyNumerator: number;
  confirmedRedundancyDenominator: number;
  openReviewCasesCount: number;
  escalatedCasesCount: number;
  actionsOverdueCount: number;
  synergiesIdentifiedCount: number;
  actionsCompletedCount: number;
  realizedReuseRatePercent: number;
  realizedReuseNumerator: number;
  realizedReuseDenominator: number;
  estimatedFinancialSynergyEur: number;
  estimatedAvoidedEffortEur: number;
  estimatedAvoidedEffortHours: number;
  confirmedFinancialSynergyValueEur: number;
}

const CONFIRMED_REDUNDANCY_DECISIONS: ReadonlySet<RedundancyDecisionType> =
  new Set(['MERGE', 'REUSE', 'COLLABORATE']);

export function computeRedundancyPortfolioMetrics(params: {
  initiatives: Initiative[];
  analysis: RedundancyAnalysisSummary;
  cases: RedundancyCase[];
  actions: RedundancyAction[];
  config?: RedundancyDeadlineConfig;
  now?: Date;
}): RedundancyPortfolioMetrics {
  const {
    initiatives,
    analysis,
    cases,
    actions,
    now = new Date(),
  } = params;

  const todayKey = toUtcDateKey(now);
  const caseIds = new Set(cases.map((c) => c.id));
  const scopedActions = actions.filter((a) => caseIds.has(a.caseId));

  // Denominator pool for confirmed redundancy: eligible Idea–Pilot initiatives + any historical initiatives referenced in confirmed cases
  const evaluationPoolIds = new Set(
    initiatives
      .filter((i) => ELIGIBLE_REDUNDANCY_STATUSES.has(i.lifecycleStatus))
      .map((i) => i.id)
  );
  const confirmedInitiativeIds = new Set<string>();

  let openReviewCasesCount = 0;
  let escalatedCasesCount = 0;
  let synergiesIdentifiedCount = 0;
  let realizedReuseNumerator = 0;
  let realizedReuseDenominator = 0;
  let estimatedFinancialSynergyEur = 0;
  let estimatedAvoidedEffortEur = 0;
  let estimatedAvoidedEffortHours = 0;
  let confirmedFinancialSynergyValueEur = 0;

  for (const c of cases) {
    const normStatus = normalizeRedundancyCaseStatus(c.status);
    if (normStatus !== 'CLOSED') openReviewCasesCount += 1;
    if (normStatus === 'ESCALATED') escalatedCasesCount += 1;

    const isConfirmedRedundancy =
      c.decisionType !== null && CONFIRMED_REDUNDANCY_DECISIONS.has(c.decisionType);

    if (isConfirmedRedundancy) {
      confirmedInitiativeIds.add(c.initiativeAId);
      confirmedInitiativeIds.add(c.initiativeBId);
      evaluationPoolIds.add(c.initiativeAId);
      evaluationPoolIds.add(c.initiativeBId);
      synergiesIdentifiedCount += 1;
    } else if (
      c.decisionType !== 'NOT_REDUNDANT' &&
      c.decisionType !== 'CONTINUE_SEPARATELY' &&
      (c.estimatedFinancialSynergyEur > 0 || c.estimatedAvoidedEffortHours > 0)
    ) {
      synergiesIdentifiedCount += 1;
    }

    if (c.decisionType === 'MERGE' || c.decisionType === 'REUSE') {
      realizedReuseDenominator += 1;
      const caseHasAction = scopedActions.some((a) => a.caseId === c.id);
      if (
        normStatus === 'CLOSED' ||
        (normStatus === 'ACTION_AGREED' &&
          (Boolean(c.implementationStartedAt) || caseHasAction))
      ) {
        realizedReuseNumerator += 1;
      }
    }

    if (c.decisionType !== 'NOT_REDUNDANT') {
      estimatedFinancialSynergyEur += Math.max(0, c.estimatedFinancialSynergyEur || 0);
      estimatedAvoidedEffortEur += Math.max(0, c.estimatedAvoidedEffortEur || 0);
      estimatedAvoidedEffortHours += Math.max(0, c.estimatedAvoidedEffortHours || 0);
    }

    const hasEvidence =
      (c.synergyEvidenceStatus === 'VERIFIED' ||
        c.synergyEvidenceStatus === 'DOCUMENTED') &&
      c.confirmedSynergyEvidence.trim().length > 0;

    if (hasEvidence && c.decisionType !== 'NOT_REDUNDANT') {
      confirmedFinancialSynergyValueEur += Math.max(
        0,
        c.confirmedFinancialSynergyEur || 0
      );
    }
  }

  let actionsOverdueCount = 0;
  let actionsCompletedCount = 0;
  for (const a of scopedActions) {
    if (a.status === 'COMPLETED') {
      actionsCompletedCount += 1;
    } else if (
      (a.status === 'OPEN' || a.status === 'IN_PROGRESS') &&
      todayKey > toUtcDateKey(a.dueDate)
    ) {
      actionsOverdueCount += 1;
    }
  }

  const confirmedDenom = evaluationPoolIds.size;
  const confirmedNum = confirmedInitiativeIds.size;
  const confirmedRedundancyRatePercent =
    confirmedDenom > 0 ? Math.round((confirmedNum / confirmedDenom) * 100) : 0;

  const realizedReuseRatePercent =
    realizedReuseDenominator > 0
      ? Math.round((realizedReuseNumerator / realizedReuseDenominator) * 100)
      : 0;

  return {
    potentialRedundancyRatePercent: analysis.potentialRedundancyRatePercent,
    confirmedRedundancyRatePercent,
    confirmedRedundancyNumerator: confirmedNum,
    confirmedRedundancyDenominator: confirmedDenom,
    openReviewCasesCount,
    escalatedCasesCount,
    actionsOverdueCount,
    synergiesIdentifiedCount,
    actionsCompletedCount,
    realizedReuseRatePercent,
    realizedReuseNumerator,
    realizedReuseDenominator,
    estimatedFinancialSynergyEur: Math.round(estimatedFinancialSynergyEur),
    estimatedAvoidedEffortEur: Math.round(estimatedAvoidedEffortEur),
    estimatedAvoidedEffortHours: Math.round(estimatedAvoidedEffortHours),
    confirmedFinancialSynergyValueEur: Math.round(confirmedFinancialSynergyValueEur),
  };
}

/**
 * Verifies the financial governance invariant:
 * Estimated avoided effort & redundancy synergy totals must NEVER double-count
 * into Portfolio Net Financial Benefit (which is strictly Cash Savings + Cost Avoidance - AI Costs).
 */
export function verifyNoSynergyDoubleCounting(
  financialSummary: PortfolioFinancialSummary,
  redundancyMetrics: RedundancyPortfolioMetrics
): {
  netFinancialBenefitEur: number;
  strictExpectedNetBenefitEur: number;
  confirmedSynergyExcludedFromNetBenefit: boolean;
  avoidedEffortExcludedFromConfirmedSynergy: boolean;
} {
  const strictExpectedNetBenefitEur =
    financialSummary.realizedCashSavingsEur +
    financialSummary.realizedCostAvoidanceEur -
    financialSummary.actualAiCostsEur;

  return {
    netFinancialBenefitEur: financialSummary.netFinancialBenefitEur,
    strictExpectedNetBenefitEur,
    confirmedSynergyExcludedFromNetBenefit:
      financialSummary.netFinancialBenefitEur === strictExpectedNetBenefitEur,
    avoidedEffortExcludedFromConfirmedSynergy:
      redundancyMetrics.confirmedFinancialSynergyValueEur >= 0,
  };
}
