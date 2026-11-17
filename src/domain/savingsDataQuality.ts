import {
  calculateEfficiencyMetrics,
  isReviewOverdue,
} from './calculations';
import {
  BenefitEntry,
  BenefitType,
  Department,
  Initiative,
  LIFECYCLE_LABELS,
  LifecycleStatus,
  SavingsDataQualityDepartmentBreakdown,
  SavingsDataQualityItem,
  SavingsDataQualityReport,
  SavingsQualityIssueType,
  SavingsQualityPriority,
  UserAccount,
  ValueCategory,
  VALUE_CATEGORY_LABELS,
} from './types';

export const SAVINGS_RELEVANT_FIELDS: ReadonlyArray<keyof Initiative> = [
  'valueCategory',
  'usersCount',
  'minutesSavedPerOccurrence',
  'processFrequencyPerWeek',
  'hourlyRate',
  'qualityEvidenceOrKpi',
  'strategicSuccessIndicator',
];

const LATE_VALUE_STAGES = new Set<LifecycleStatus>([
  LifecycleStatus.PRODUCTION,
  LifecycleStatus.MONITORING,
  LifecycleStatus.SCALE_IMPROVE,
]);

const MID_BUILD_STAGES = new Set<LifecycleStatus>([
  LifecycleStatus.DEVELOPMENT,
  LifecycleStatus.PILOT,
]);

function computeOverdueDays(
  initiative: Initiative,
  now: Date
): number {
  if (initiative.lifecycleStatus === LifecycleStatus.RETIRE) return 0;

  const dueMs = Date.parse(initiative.nextReviewDue);
  const lastReviewMs = initiative.lastOwnerReviewAt
    ? Date.parse(initiative.lastOwnerReviewAt)
    : NaN;
  const nowMs = now.getTime();

  // Monthly review cadence: overdue if never reviewed, nextReviewDue passed, or >31 days since lastOwnerReviewAt
  if (!initiative.lastOwnerReviewAt || Number.isNaN(lastReviewMs)) {
    const createdMs = Date.parse(initiative.createdAt);
    if (!Number.isNaN(createdMs) && nowMs > createdMs) {
      return Math.max(1, Math.round((nowMs - createdMs) / 86_400_000));
    }
    return 1;
  }

  const daysSinceReview = Math.floor((nowMs - lastReviewMs) / 86_400_000);
  if (isReviewOverdue(initiative.nextReviewDue, now) && !Number.isNaN(dueMs)) {
    return Math.max(1, Math.round((nowMs - dueMs) / 86_400_000));
  }
  if (daysSinceReview > 31) {
    return daysSinceReview - 30;
  }
  return 0;
}

function formatSavingsEstimate(
  initiative: Initiative,
  estimatedBenefitEntriesEur: number
): {
  display: string;
  annualHours: number;
  efficiencyEur: number | null;
} {
  if (initiative.valueCategory === ValueCategory.EFFICIENCY) {
    const metrics = calculateEfficiencyMetrics(
      initiative.valueCategory,
      initiative.usersCount,
      initiative.minutesSavedPerOccurrence,
      initiative.processFrequencyPerWeek,
      initiative.hourlyRate
    );
    const hrs = Math.round(metrics.annualHours);
    if (metrics.estimatedEfficiencyValue !== null && hrs > 0) {
      return {
        display: `${hrs.toLocaleString('en-US')} hrs (~€${Math.round(
          metrics.estimatedEfficiencyValue
        ).toLocaleString('en-US')})`,
        annualHours: metrics.annualHours,
        efficiencyEur: metrics.estimatedEfficiencyValue,
      };
    }
    if (hrs > 0) {
      return {
        display: `${hrs.toLocaleString('en-US')} hrs (rate missing)`,
        annualHours: metrics.annualHours,
        efficiencyEur: null,
      };
    }
    return {
      display: 'Not provided',
      annualHours: 0,
      efficiencyEur: null,
    };
  }

  if (estimatedBenefitEntriesEur > 0) {
    return {
      display: `Est. €${Math.round(estimatedBenefitEntriesEur).toLocaleString('en-US')}`,
      annualHours: 0,
      efficiencyEur: null,
    };
  }

  return {
    display:
      initiative.valueCategory === ValueCategory.QUALITY
        ? initiative.qualityEvidenceOrKpi?.trim()
          ? 'KPI documented (non-cash)'
          : 'Quality KPI missing'
        : initiative.strategicSuccessIndicator?.trim()
          ? 'Indicator documented'
          : 'Indicator missing',
    annualHours: 0,
    efficiencyEur: null,
  };
}

export function evaluateInitiativeSavingsQuality(
  initiative: Initiative,
  linkedBenefits: BenefitEntry[],
  departmentName: string,
  ownerName: string,
  now: Date = new Date()
): SavingsDataQualityItem {
  const issueTypes: SavingsQualityIssueType[] = [];
  const issueDetails: string[] = [];
  const actions: string[] = [];

  const isRetired = initiative.lifecycleStatus === LifecycleStatus.RETIRE;
  const isLateStage = LATE_VALUE_STAGES.has(initiative.lifecycleStatus);
  const isMidStage = MID_BUILD_STAGES.has(initiative.lifecycleStatus);

  const overdueDays = computeOverdueDays(initiative, now);
  const isOverdueReview = !isRetired && overdueDays > 0;

  let isMissingSavingsData = false;
  let isIncompleteInputs = false;

  // 1. Category-specific completeness rules (without fabricating missing inputs)
  if (initiative.valueCategory === ValueCategory.EFFICIENCY) {
    const hasUsers =
      Number.isFinite(initiative.usersCount) && initiative.usersCount > 0;
    const hasMins =
      Number.isFinite(initiative.minutesSavedPerOccurrence) &&
      initiative.minutesSavedPerOccurrence > 0;
    const hasFreq =
      Number.isFinite(initiative.processFrequencyPerWeek) &&
      initiative.processFrequencyPerWeek > 0;
    const hasRate =
      typeof initiative.hourlyRate === 'number' &&
      Number.isFinite(initiative.hourlyRate) &&
      initiative.hourlyRate > 0;

    if (!hasUsers && !hasMins && !hasFreq) {
      isMissingSavingsData = true;
      issueTypes.push('MISSING_SAVINGS_DATA');
      issueDetails.push('Missing Efficiency time-saving inputs (users, minutes, frequency)');
      actions.push('Enter users, minutes saved & weekly frequency');
    } else if (!hasUsers || !hasMins || !hasFreq || !hasRate) {
      isIncompleteInputs = true;
      issueTypes.push('INCOMPLETE_SAVINGS_INPUTS');
      const missingParts: string[] = [];
      if (!hasUsers) missingParts.push('users > 0');
      if (!hasMins) missingParts.push('minutes saved > 0');
      if (!hasFreq) missingParts.push('weekly frequency > 0');
      if (!hasRate) missingParts.push('hourly rate');
      issueDetails.push(`Incomplete Efficiency inputs: missing ${missingParts.join(', ')}`);
      actions.push(`Complete ${missingParts.join(' & ')}`);
    }
  } else if (initiative.valueCategory === ValueCategory.QUALITY) {
    const hasKpi = Boolean(
      initiative.qualityEvidenceOrKpi &&
        initiative.qualityEvidenceOrKpi.trim().length > 0
    );
    const hasBenefitContext =
      initiative.description.trim().length > 0 &&
      initiative.businessProblem.trim().length > 0;

    if (!hasKpi && !hasBenefitContext) {
      isMissingSavingsData = true;
      issueTypes.push('MISSING_SAVINGS_DATA', 'MISSING_QUALITY_EVIDENCE');
      issueDetails.push('Missing quality KPI & benefit description');
      actions.push('Add quality metric/KPI & benefit evidence');
    } else if (!hasKpi) {
      isIncompleteInputs = true;
      issueTypes.push('MISSING_QUALITY_EVIDENCE');
      issueDetails.push('Missing Quality KPI / error-reduction evidence');
      actions.push('Document measurable quality KPI');
    }
  } else if (initiative.valueCategory === ValueCategory.STRATEGIC) {
    const hasIndicator = Boolean(
      initiative.strategicSuccessIndicator &&
        initiative.strategicSuccessIndicator.trim().length > 0
    );
    const hasOutcomeContext =
      initiative.description.trim().length > 0 &&
      initiative.businessCapability.trim().length > 0;

    if (!hasIndicator && !hasOutcomeContext) {
      isMissingSavingsData = true;
      issueTypes.push('MISSING_SAVINGS_DATA', 'MISSING_STRATEGIC_INDICATOR');
      issueDetails.push('Missing strategic outcome & success indicator');
      actions.push('Document strategic outcome & success indicator');
    } else if (!hasIndicator) {
      isIncompleteInputs = true;
      issueTypes.push('MISSING_STRATEGIC_INDICATOR');
      issueDetails.push('Missing measurable strategic success indicator');
      actions.push('Add strategic success indicator');
    }
  }

  // 2. Realized Financial Benefits verification rule
  const realizedFinancialEntries = linkedBenefits.filter(
    (b) =>
      (b.benefitType === BenefitType.CASH_SAVINGS ||
        b.benefitType === BenefitType.COST_AVOIDANCE) &&
      b.realizedAmountEur > 0
  );
  const realizedSavingsEur = realizedFinancialEntries.reduce(
    (sum, b) => sum + b.realizedAmountEur,
    0
  );
  const estimatedBenefitEntriesEur = linkedBenefits.reduce(
    (sum, b) => sum + (b.estimatedAmountEur ?? 0),
    0
  );

  const hasUnverifiedRealizedBenefit = realizedFinancialEntries.some((b) => {
    const validPeriod = /^\d{4}-\d{2}$/.test(b.period.trim());
    const verifiedEvidence =
      b.evidenceStatus === 'VERIFIED' || b.evidenceStatus === 'DOCUMENTED';
    return !validPeriod || !verifiedEvidence;
  });

  if (hasUnverifiedRealizedBenefit) {
    isIncompleteInputs = true;
    issueTypes.push('UNVERIFIED_REALIZED_BENEFIT');
    issueDetails.push('Realized financial benefit lacks verified/documented evidence');
    actions.push('Verify period & financial benefit evidence');
  }

  // 3. Monthly Review Cadence rule (strictly separate from general updatedAt)
  if (isOverdueReview) {
    issueTypes.push('OVERDUE_SAVINGS_REVIEW');
    if (!initiative.lastOwnerReviewAt) {
      issueDetails.push('No monthly savings review logged yet');
    } else {
      issueDetails.push(`Monthly savings review overdue (${overdueDays}d)`);
    }
    actions.push('Confirm & log monthly savings review');
  }

  const isUpToDate =
    !isMissingSavingsData &&
    !isIncompleteInputs &&
    !isOverdueReview &&
    !hasUnverifiedRealizedBenefit;

  // 4. Priority Calculation
  let priority: SavingsQualityPriority = 'LOW';
  if (!isUpToDate) {
    if (isRetired) {
      priority = hasUnverifiedRealizedBenefit ? 'MEDIUM' : 'LOW';
    } else if (
      (isLateStage && (isMissingSavingsData || isIncompleteInputs || overdueDays >= 1)) ||
      hasUnverifiedRealizedBenefit ||
      overdueDays >= 30 ||
      (!initiative.lastOwnerReviewAt && (isLateStage || initiative.lifecycleStatus === LifecycleStatus.PILOT))
    ) {
      priority = 'HIGH';
    } else if (
      isMidStage ||
      isMissingSavingsData ||
      isOverdueReview
    ) {
      priority = 'MEDIUM';
    } else {
      priority = 'LOW';
    }
  }

  const estimate = formatSavingsEstimate(initiative, estimatedBenefitEntriesEur);

  return {
    initiativeId: initiative.id,
    initiativeTitle: initiative.title,
    departmentId: initiative.departmentId,
    departmentName,
    ownerId: initiative.ownerId,
    ownerName,
    lifecycleStatus: initiative.lifecycleStatus,
    valueCategory: initiative.valueCategory,
    estimatedSavingsDisplay: estimate.display,
    estimatedAnnualHours: estimate.annualHours,
    estimatedEfficiencyValueEur: estimate.efficiencyEur,
    estimatedBenefitEntriesEur,
    realizedSavingsEur,
    lastSavingsUpdatedAt: initiative.lastSavingsUpdatedAt ?? null,
    lastReviewDate: initiative.lastOwnerReviewAt,
    nextReviewDue: initiative.nextReviewDue,
    overdueDays,
    issueTypes,
    issueSummary: isUpToDate
      ? 'Up to date'
      : isRetired && !hasUnverifiedRealizedBenefit
        ? 'Archived (Retire stage)'
        : issueDetails.join('; '),
    priority,
    recommendedAction: isUpToDate
      ? 'No action required'
      : isRetired && !hasUnverifiedRealizedBenefit
        ? 'Archived — verify only if financial claims active'
        : actions[0] ?? 'Review savings inputs',
    isUpToDate,
    isMissingSavingsData,
    isOverdueReview,
    isIncompleteInputs,
  };
}

const PRIORITY_RANK: Record<SavingsQualityPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

export function computeSavingsDataQualityReport(params: {
  initiatives: Initiative[];
  benefits: BenefitEntry[];
  departments: Department[];
  users: UserAccount[];
  now?: Date;
}): SavingsDataQualityReport {
  const { initiatives, benefits, departments, users, now = new Date() } = params;
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const userMap = new Map(users.map((u) => [u.id, u.displayName]));

  const benefitsByInit = new Map<string, BenefitEntry[]>();
  for (const b of benefits) {
    const list = benefitsByInit.get(b.initiativeId) ?? [];
    list.push(b);
    benefitsByInit.set(b.initiativeId, list);
  }

  const items: SavingsDataQualityItem[] = initiatives.map((init) =>
    evaluateInitiativeSavingsQuality(
      init,
      benefitsByInit.get(init.id) ?? [],
      deptMap.get(init.departmentId) ?? init.departmentId,
      init.ownerId ? userMap.get(init.ownerId) ?? init.ownerId : 'Unassigned',
      now
    )
  );

  items.sort((a, b) => {
    if (a.isUpToDate !== b.isUpToDate) return a.isUpToDate ? 1 : -1;
    const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pDiff !== 0) return pDiff;
    if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
    return a.initiativeTitle.localeCompare(b.initiativeTitle);
  });

  const missingSavingsDataCount = items.filter((i) => i.isMissingSavingsData).length;
  const overdueReviewsCount = items.filter((i) => i.isOverdueReview).length;
  const incompleteInputsCount = items.filter(
    (i) => !i.isMissingSavingsData && i.isIncompleteInputs
  ).length;
  const upToDateCount = items.filter((i) => i.isUpToDate).length;
  const itemsRequiringActionCount = items.length - upToDateCount;

  const dataCompletenessPercent =
    items.length > 0 ? Math.round((upToDateCount / items.length) * 100) : 100;

  // Department breakdown preserving supplied department order
  const deptBuckets = new Map<string, SavingsDataQualityDepartmentBreakdown>();
  for (const d of departments) {
    deptBuckets.set(d.id, {
      departmentId: d.id,
      departmentName: d.name,
      totalInitiatives: 0,
      upToDateCount: 0,
      actionRequiredCount: 0,
      overdueCount: 0,
      completenessPercent: 100,
    });
  }

  for (const item of items) {
    let row = deptBuckets.get(item.departmentId);
    if (!row) {
      row = {
        departmentId: item.departmentId,
        departmentName: item.departmentName,
        totalInitiatives: 0,
        upToDateCount: 0,
        actionRequiredCount: 0,
        overdueCount: 0,
        completenessPercent: 100,
      };
      deptBuckets.set(item.departmentId, row);
    }
    row.totalInitiatives += 1;
    if (item.isUpToDate) row.upToDateCount += 1;
    else row.actionRequiredCount += 1;
    if (item.isOverdueReview) row.overdueCount += 1;
  }

  const byDepartment = Array.from(deptBuckets.values())
    .filter((d) => d.totalInitiatives > 0)
    .map((d) => ({
      ...d,
      completenessPercent:
        d.totalInitiatives > 0
          ? Math.round((d.upToDateCount / d.totalInitiatives) * 100)
          : 100,
    }));

  return {
    totalInitiatives: items.length,
    missingSavingsDataCount,
    overdueReviewsCount,
    incompleteInputsCount,
    upToDateCount,
    itemsRequiringActionCount,
    dataCompletenessPercent,
    byDepartment,
    items,
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildSavingsDataQualityCsv(
  items: SavingsDataQualityItem[]
): string {
  const headers = [
    'Initiative',
    'Department',
    'Owner',
    'Lifecycle Stage',
    'Value Category',
    'Estimated Savings',
    'Realized Savings (EUR)',
    'Last Savings Update',
    'Last Review Date',
    'Data Quality Issue',
    'Priority',
    'Recommended Action',
  ];

  const lines = items.map((item) =>
    [
      item.initiativeTitle,
      item.departmentName,
      item.ownerName,
      LIFECYCLE_LABELS[item.lifecycleStatus],
      VALUE_CATEGORY_LABELS[item.valueCategory],
      item.estimatedSavingsDisplay,
      String(Math.round(item.realizedSavingsEur)),
      item.lastSavingsUpdatedAt ? item.lastSavingsUpdatedAt.slice(0, 10) : 'Not recorded',
      item.lastReviewDate ? item.lastReviewDate.slice(0, 10) : 'Never reviewed',
      item.issueSummary,
      item.priority,
      item.recommendedAction,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.join(','), ...lines].join('\n');
}
