import {
  ACTIVE_SOLUTION_STATUSES,
  DataQualityFlag,
  Department,
  DepartmentPortfolioBreakdown,
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleEvent,
  LifecycleStatus,
  LIVE_STATUSES,
  PIPELINE_STATUSES,
  PortfolioMetrics,
  ValueCategory,
} from './types';

export interface EfficiencyCalculationResult {
  isApplicable: boolean;
  annualHours: number;
  estimatedEfficiencyValue: number | null;
}

/**
 * Exact efficiency formula required by specification:
 * annualHours = users * minutesSaved * frequencyPerWeek * 52 / 60
 * estimatedEfficiencyValue = annualHours * hourlyRate (if rate exists)
 * Only applicable when valueCategory === ValueCategory.EFFICIENCY.
 * Never labeled as cash savings.
 */
export function calculateAnnualHours(
  usersCount: number,
  minutesSavedPerOccurrence: number,
  processFrequencyPerWeek: number
): number {
  if (
    !Number.isFinite(usersCount) ||
    !Number.isFinite(minutesSavedPerOccurrence) ||
    !Number.isFinite(processFrequencyPerWeek) ||
    usersCount < 0 ||
    minutesSavedPerOccurrence < 0 ||
    processFrequencyPerWeek < 0
  ) {
    return 0;
  }
  return (usersCount * minutesSavedPerOccurrence * processFrequencyPerWeek * 52) / 60;
}

export function calculateEfficiencyMetrics(
  valueCategory: ValueCategory,
  usersCount: number,
  minutesSavedPerOccurrence: number,
  processFrequencyPerWeek: number,
  hourlyRate?: number
): EfficiencyCalculationResult {
  if (valueCategory !== ValueCategory.EFFICIENCY) {
    return {
      isApplicable: false,
      annualHours: 0,
      estimatedEfficiencyValue: null,
    };
  }

  const annualHours = calculateAnnualHours(
    usersCount,
    minutesSavedPerOccurrence,
    processFrequencyPerWeek
  );

  const hasValidRate =
    typeof hourlyRate === 'number' && Number.isFinite(hourlyRate) && hourlyRate >= 0;

  return {
    isApplicable: true,
    annualHours,
    estimatedEfficiencyValue: hasValidRate ? annualHours * hourlyRate : null,
  };
}

export function isReviewOverdue(
  nextReviewDue: string,
  now: Date = new Date()
): boolean {
  const dueMs = Date.parse(nextReviewDue);
  if (Number.isNaN(dueMs)) {
    return false;
  }
  return dueMs < now.getTime();
}

export function isReviewDueSoon(
  nextReviewDue: string,
  now: Date = new Date(),
  withinDays = 7
): boolean {
  const dueMs = Date.parse(nextReviewDue);
  if (Number.isNaN(dueMs)) {
    return false;
  }
  const nowMs = now.getTime();
  const thresholdMs = nowMs + withinDays * 24 * 60 * 60 * 1000;
  return dueMs >= nowMs && dueMs <= thresholdMs;
}

export function computeNextReviewDue(fromDate: Date = new Date()): string {
  const next = new Date(fromDate.getTime());
  next.setUTCDate(next.getUTCDate() + 30);
  return next.toISOString();
}

export function computeDataQualityFlags(
  initiative: Initiative,
  now: Date = new Date()
): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];

  if (
    initiative.lifecycleStatus !== LifecycleStatus.RETIRE &&
    isReviewOverdue(initiative.nextReviewDue, now)
  ) {
    flags.push({
      code: 'OVERDUE_REVIEW',
      label: 'Monthly owner review overdue',
      severity: 'warning',
    });
  }

  if (
    (initiative.lifecycleStatus === LifecycleStatus.PILOT ||
      initiative.lifecycleStatus === LifecycleStatus.PRODUCTION ||
      initiative.lifecycleStatus === LifecycleStatus.MONITORING ||
      initiative.lifecycleStatus === LifecycleStatus.SCALE_IMPROVE) &&
    (!initiative.goLiveDate || initiative.goLiveDate.trim() === '')
  ) {
    flags.push({
      code: 'MISSING_GO_LIVE_DATE',
      label: 'Missing go-live date for live stage',
      severity: 'warning',
    });
  }

  if (
    initiative.valueCategory === ValueCategory.EFFICIENCY &&
    (initiative.hourlyRate === undefined || initiative.hourlyRate === null)
  ) {
    flags.push({
      code: 'MISSING_HOURLY_RATE',
      label: 'Optional hourly rate not set',
      severity: 'info',
    });
  }

  if (initiative.usersCount === 0) {
    flags.push({
      code: 'ZERO_USERS',
      label: 'Target user count is 0',
      severity: 'info',
    });
  }

  return flags;
}

export function computePortfolioMetrics(
  initiatives: Initiative[],
  departments: Department[],
  now: Date = new Date()
): PortfolioMetrics {
  const totalInitiatives = initiatives.length;
  let activeSolutionsCount = 0;
  let pipelineCount = 0;
  let liveCount = 0;
  let monitoringCount = 0;
  let scaleImproveCount = 0;
  let retiredCount = 0;
  let needsCompletionCount = 0;
  let totalRegisteredUsers = 0;
  let overdueReviewsCount = 0;
  let dataQualityIssuesCount = 0;

  const statusCounts = new Map<LifecycleStatus, number>();
  for (const status of LIFECYCLE_ORDER) {
    statusCounts.set(status, 0);
  }

  const deptMap = new Map<string, DepartmentPortfolioBreakdown>();
  for (const dept of departments) {
    deptMap.set(dept.id, {
      departmentId: dept.id,
      departmentName: dept.name,
      departmentCode: dept.code,
      totalCount: 0,
      activeSolutionsCount: 0,
      totalUsers: 0,
      overdueReviewsCount: 0,
    });
  }

  const representedDeptIds = new Set<string>();

  for (const item of initiatives) {
    representedDeptIds.add(item.departmentId);
    totalRegisteredUsers += item.usersCount;

    statusCounts.set(
      item.lifecycleStatus,
      (statusCounts.get(item.lifecycleStatus) ?? 0) + 1
    );

    if (ACTIVE_SOLUTION_STATUSES.has(item.lifecycleStatus)) {
      activeSolutionsCount += 1;
    }
    if (PIPELINE_STATUSES.has(item.lifecycleStatus)) {
      pipelineCount += 1;
    }
    if (LIVE_STATUSES.has(item.lifecycleStatus)) {
      liveCount += 1;
    }
    if (item.lifecycleStatus === LifecycleStatus.MONITORING) {
      monitoringCount += 1;
    }
    if (item.lifecycleStatus === LifecycleStatus.SCALE_IMPROVE) {
      scaleImproveCount += 1;
    }
    if (item.lifecycleStatus === LifecycleStatus.RETIRE) {
      retiredCount += 1;
    }
    if (item.needsDataCompletion || (item.missingDataFields?.length ?? 0) > 0) {
      needsCompletionCount += 1;
    }

    const overdue =
      item.lifecycleStatus !== LifecycleStatus.RETIRE &&
      isReviewOverdue(item.nextReviewDue, now);
    if (overdue) {
      overdueReviewsCount += 1;
    }

    const flags = computeDataQualityFlags(item, now);
    if (flags.some((f) => f.severity === 'warning')) {
      dataQualityIssuesCount += 1;
    }

    let deptRow = deptMap.get(item.departmentId);
    if (!deptRow) {
      deptRow = {
        departmentId: item.departmentId,
        departmentName: item.departmentId,
        departmentCode: item.departmentId.slice(0, 4).toUpperCase(),
        totalCount: 0,
        activeSolutionsCount: 0,
        totalUsers: 0,
        overdueReviewsCount: 0,
      };
      deptMap.set(item.departmentId, deptRow);
    }
    deptRow.totalCount += 1;
    if (ACTIVE_SOLUTION_STATUSES.has(item.lifecycleStatus)) {
      deptRow.activeSolutionsCount += 1;
    }
    deptRow.totalUsers += item.usersCount;
    if (overdue) {
      deptRow.overdueReviewsCount += 1;
    }
  }

  const lifecycleDistribution = LIFECYCLE_ORDER.map((status) => {
    const count = statusCounts.get(status) ?? 0;
    return {
      status,
      label: LIFECYCLE_LABELS[status],
      count,
      percentage: totalInitiatives > 0 ? Math.round((count / totalInitiatives) * 100) : 0,
    };
  });

  const departmentBreakdown = Array.from(deptMap.values()).filter(
    (d) => d.totalCount > 0
  );

  return {
    totalInitiatives,
    activeSolutionsCount,
    pipelineCount,
    liveCount,
    monitoringCount,
    scaleImproveCount,
    retiredCount,
    needsCompletionCount,
    departmentsRepresentedCount: representedDeptIds.size,
    totalRegisteredUsers,
    overdueReviewsCount,
    dataQualityIssuesCount,
    lifecycleDistribution,
    departmentBreakdown,
  };
}

export function computeInitiativeCompleteness(initiative: Initiative): {
  scorePercent: number;
  presentFields: number;
  totalFields: number;
  missingFields: string[];
} {
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: 'Title', ok: initiative.title.trim().length > 0 },
    {
      label: 'Business Problem',
      ok: initiative.businessProblem.trim().length > 0,
    },
    { label: 'Description', ok: initiative.description.trim().length > 0 },
    {
      label: 'Business Capability',
      ok: initiative.businessCapability.trim().length > 0,
    },
    { label: 'Department', ok: initiative.departmentId.trim().length > 0 },
    { label: 'Accountable Owner', ok: initiative.ownerId.trim().length > 0 },
    { label: 'AI Platform', ok: initiative.aiPlatform.trim().length > 0 },
    { label: 'Users Count', ok: initiative.usersCount > 0 },
    {
      label: 'Minutes Saved / Occurrence',
      ok: initiative.minutesSavedPerOccurrence >= 0,
    },
    {
      label: 'Process Frequency / Week',
      ok: initiative.processFrequencyPerWeek >= 0,
    },
    {
      label: 'Hourly Rate (Efficiency)',
      ok:
        initiative.valueCategory !== ValueCategory.EFFICIENCY ||
        (typeof initiative.hourlyRate === 'number' &&
          initiative.hourlyRate >= 0),
    },
    {
      label: 'Go-Live Date (Live Stages)',
      ok:
        !LIVE_STATUSES.has(initiative.lifecycleStatus) ||
        Boolean(initiative.goLiveDate && initiative.goLiveDate.trim()),
    },
  ];

  const missingFields = checks.filter((c) => !c.ok).map((c) => c.label);
  const presentFields = checks.length - missingFields.length;
  return {
    scorePercent: Math.round((presentFields / checks.length) * 100),
    presentFields,
    totalFields: checks.length,
    missingFields,
  };
}

function diffDays(startMs: number, endMs: number): number | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
}

/**
 * Computes actual days in current lifecycle stage based strictly on stored timestamps
 * (latest matching lifecycle event timestamp, falling back to createdAt).
 */
export function computeStageAgingDays(
  initiative: Initiative,
  events: Array<{ initiativeId: string; toStatus: LifecycleStatus; timestamp: string }>,
  now: Date = new Date()
): number | null {
  const itemEvents = events
    .filter((e) => e.initiativeId === initiative.id)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const latestInStage = itemEvents.find(
    (e) => e.toStatus === initiative.lifecycleStatus
  );
  const enteredIso = latestInStage?.timestamp ?? initiative.createdAt;
  const enteredMs = Date.parse(enteredIso);
  if (Number.isNaN(enteredMs)) return null;
  return diffDays(enteredMs, now.getTime());
}

function resolveFirstProductionMs(
  initiative: Initiative,
  events: Array<{ initiativeId: string; toStatus: LifecycleStatus; timestamp: string }>
): number | null {
  const itemEvents = events
    .filter((e) => e.initiativeId === initiative.id)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const firstProdEvent = itemEvents.find(
    (e) => e.toStatus === LifecycleStatus.PRODUCTION
  );
  if (firstProdEvent) {
    const ms = Date.parse(firstProdEvent.timestamp);
    return Number.isNaN(ms) ? null : ms;
  }

  // Only treat goLiveDate as Production date when initiative reached Production or post-Production branches
  const reachedProdOrPost =
    initiative.lifecycleStatus === LifecycleStatus.PRODUCTION ||
    initiative.lifecycleStatus === LifecycleStatus.MONITORING ||
    initiative.lifecycleStatus === LifecycleStatus.SCALE_IMPROVE ||
    initiative.lifecycleStatus === LifecycleStatus.RETIRE;

  if (reachedProdOrPost && initiative.goLiveDate) {
    const ms = Date.parse(initiative.goLiveDate);
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

/**
 * Computes development lead time (first Idea date -> first Production date)
 * strictly from stored timestamps (`ideaDate` / earliest IDEA event -> first PRODUCTION event or goLiveDate).
 * Returns null if the initiative has not yet reached Production or lacks valid stored dates.
 */
export function computeDevelopmentLeadTimeDays(
  initiative: Initiative,
  events: Array<{ initiativeId: string; toStatus: LifecycleStatus; timestamp: string }>
): number | null {
  const itemEvents = events
    .filter((e) => e.initiativeId === initiative.id)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const firstIdeaEvent = itemEvents.find(
    (e) => e.toStatus === LifecycleStatus.IDEA
  );
  const startMs =
    (initiative.ideaDate ? Date.parse(initiative.ideaDate) : NaN) ||
    (firstIdeaEvent ? Date.parse(firstIdeaEvent.timestamp) : NaN) ||
    (itemEvents[0] ? Date.parse(itemEvents[0].timestamp) : NaN);

  if (Number.isNaN(startMs)) return null;

  const prodMs = resolveFirstProductionMs(initiative, events);
  if (prodMs === null) {
    return null;
  }

  return diffDays(startMs, prodMs);
}

/**
 * Computes Production Aging (first Production date -> reporting date)
 * strictly for initiatives that have reached Production with stored dates/events.
 */
export function computeProductionAgingDays(
  initiative: Initiative,
  events: Array<{ initiativeId: string; toStatus: LifecycleStatus; timestamp: string }>,
  now: Date = new Date()
): number | null {
  const prodMs = resolveFirstProductionMs(initiative, events);
  if (prodMs === null) return null;
  return diffDays(prodMs, now.getTime());
}

export interface StageDurationEntry {
  status: LifecycleStatus;
  label: string;
  days: number;
  isCurrent: boolean;
}

/**
 * Computes actual time spent in each lifecycle stage from chronological stored LifecycleEvent timestamps.
 * Never fabricates missing intermediate stages.
 */
export function computeStageTimeBreakdown(
  initiative: Initiative,
  events: Array<{ initiativeId: string; toStatus: LifecycleStatus; timestamp: string }>,
  now: Date = new Date()
): StageDurationEntry[] {
  const itemEvents = events
    .filter((e) => e.initiativeId === initiative.id)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  if (itemEvents.length === 0) {
    const startMs = Date.parse(initiative.createdAt);
    const days = Number.isNaN(startMs) ? 0 : (diffDays(startMs, now.getTime()) ?? 0);
    return [
      {
        status: initiative.lifecycleStatus,
        label: LIFECYCLE_LABELS[initiative.lifecycleStatus],
        days,
        isCurrent: true,
      },
    ];
  }

  const byStage = new Map<LifecycleStatus, number>();
  for (let i = 0; i < itemEvents.length; i += 1) {
    const curr = itemEvents[i];
    const next = itemEvents[i + 1];
    const startMs = Date.parse(curr.timestamp);
    const endMs = next ? Date.parse(next.timestamp) : now.getTime();
    const d = diffDays(startMs, endMs) ?? 0;
    byStage.set(curr.toStatus, (byStage.get(curr.toStatus) ?? 0) + d);
  }

  return Array.from(byStage.entries()).map(([status, days]) => ({
    status,
    label: LIFECYCLE_LABELS[status],
    days,
    isCurrent: status === initiative.lifecycleStatus,
  }));
}

export interface StoredTransitionFlow {
  fromStatus: LifecycleStatus;
  toStatus: LifecycleStatus;
  count: number;
}

/**
 * Aggregates real lifecycle stage transitions (`fromStatus -> toStatus`) strictly from stored LifecycleEvent history.
 * Never fabricates transitions from current status snapshots.
 */
export function computeStoredLifecycleTransitions(
  events: LifecycleEvent[],
  filteredInitiativeIds?: ReadonlySet<string>
): StoredTransitionFlow[] {
  const counts = new Map<string, StoredTransitionFlow>();

  for (const evt of events) {
    if (!evt.fromStatus || evt.fromStatus === evt.toStatus) continue;
    if (filteredInitiativeIds && !filteredInitiativeIds.has(evt.initiativeId)) {
      continue;
    }
    const key = `${evt.fromStatus}::${evt.toStatus}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        fromStatus: evt.fromStatus,
        toStatus: evt.toStatus,
        count: 1,
      });
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export interface LifecycleDistributionStageSummary {
  status: LifecycleStatus;
  label: string;
  orderIndex: number;
  count: number;
  percentage: number; // 0-100 rounded to 1 decimal place
  percentageRounded: number; // integer percentage
  isLargest: boolean;
}

export interface DepartmentLifecycleStageSegment {
  status: LifecycleStatus;
  label: string;
  count: number;
  percentage: number; // within department (0-100, 1 decimal)
}

export interface DepartmentLifecycleStackedRow {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  totalCount: number;
  segments: DepartmentLifecycleStageSegment[];
}

export interface LifecycleAnalyticsSummary {
  totalInitiatives: number;
  overallDistribution: LifecycleDistributionStageSummary[];
  largestStages: LifecycleStatus[];
  largestStageLabel: string;
  largestStageCount: number;
  largestStagePercentage: number;
  departmentRows: DepartmentLifecycleStackedRow[];
}

/**
 * Computes exact ordered 8-stage Lifecycle Distribution and Department Lifecycle
 * 100% stacked breakdown strictly from persisted initiatives.
 * Preserves the exact order supplied in `departments` (e.g., Operations-first).
 */
export function computeLifecycleAnalytics(
  initiatives: Initiative[],
  departments: Department[]
): LifecycleAnalyticsSummary {
  const totalInitiatives = initiatives.length;
  const overallCounts = new Map<LifecycleStatus, number>();
  for (const status of LIFECYCLE_ORDER) {
    overallCounts.set(status, 0);
  }

  const deptStageCounts = new Map<string, Map<LifecycleStatus, number>>();
  for (const dept of departments) {
    const map = new Map<LifecycleStatus, number>();
    for (const s of LIFECYCLE_ORDER) map.set(s, 0);
    deptStageCounts.set(dept.id, map);
  }

  for (const item of initiatives) {
    overallCounts.set(
      item.lifecycleStatus,
      (overallCounts.get(item.lifecycleStatus) ?? 0) + 1
    );

    let dMap = deptStageCounts.get(item.departmentId);
    if (!dMap) {
      dMap = new Map<LifecycleStatus, number>();
      for (const s of LIFECYCLE_ORDER) dMap.set(s, 0);
      deptStageCounts.set(item.departmentId, dMap);
    }
    dMap.set(item.lifecycleStatus, (dMap.get(item.lifecycleStatus) ?? 0) + 1);
  }

  const maxCount = Math.max(0, ...Array.from(overallCounts.values()));
  const largestStages: LifecycleStatus[] =
    maxCount > 0
      ? LIFECYCLE_ORDER.filter((s) => (overallCounts.get(s) ?? 0) === maxCount)
      : [];

  const overallDistribution: LifecycleDistributionStageSummary[] = LIFECYCLE_ORDER.map(
    (status, idx) => {
      const count = overallCounts.get(status) ?? 0;
      const pctExact =
        totalInitiatives > 0
          ? Math.round((count / totalInitiatives) * 1000) / 10
          : 0;
      return {
        status,
        label: LIFECYCLE_LABELS[status],
        orderIndex: idx,
        count,
        percentage: pctExact,
        percentageRounded:
          totalInitiatives > 0 ? Math.round((count / totalInitiatives) * 100) : 0,
        isLargest: maxCount > 0 && count === maxCount,
      };
    }
  );

  const largestStageLabel =
    largestStages.length === 0
      ? 'No Initiatives'
      : largestStages.map((s) => LIFECYCLE_LABELS[s]).join(' / ');
  const largestStagePercentage =
    totalInitiatives > 0 && maxCount > 0
      ? Math.round((maxCount / totalInitiatives) * 1000) / 10
      : 0;

  // Build department rows preserving caller's department ordering, plus any uncatalogued departments
  const deptLookup = new Map(departments.map((d) => [d.id, d]));
  const orderedDeptIds = [
    ...departments.map((d) => d.id),
    ...Array.from(deptStageCounts.keys()).filter((id) => !deptLookup.has(id)),
  ];

  const departmentRows: DepartmentLifecycleStackedRow[] = orderedDeptIds.map(
    (deptId) => {
      const dept = deptLookup.get(deptId);
      const stageMap = deptStageCounts.get(deptId) ?? new Map<LifecycleStatus, number>();
      const totalCount = LIFECYCLE_ORDER.reduce(
        (sum, s) => sum + (stageMap.get(s) ?? 0),
        0
      );
      const segments: DepartmentLifecycleStageSegment[] = LIFECYCLE_ORDER.map(
        (status) => {
          const count = stageMap.get(status) ?? 0;
          const pct =
            totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0;
          return {
            status,
            label: LIFECYCLE_LABELS[status],
            count,
            percentage: pct,
          };
        }
      );

      return {
        departmentId: deptId,
        departmentName: dept?.name ?? deptId,
        departmentCode: dept?.code ?? deptId.slice(0, 4).toUpperCase(),
        totalCount,
        segments,
      };
    }
  );

  return {
    totalInitiatives,
    overallDistribution,
    largestStages,
    largestStageLabel,
    largestStageCount: maxCount,
    largestStagePercentage,
    departmentRows,
  };
}


