import { calculateEfficiencyMetrics } from './calculations';
import {
  AiCostPlanEntry,
  AiCostTransaction,
  BenefitEntry,
  BenefitType,
  Department,
  ForecastMissingRule,
  Initiative,
  ValueCategory,
} from './types';

export interface PortfolioFinancialSummary {
  annualHoursSaved: number;
  estimatedEfficiencyValueEur: number;
  efficiencyInitiativesWithRateCount: number;
  efficiencyInitiativesMissingRateCount: number;
  estimatedCashAndAvoidanceEur: number;
  realizedCashSavingsEur: number;
  realizedCostAvoidanceEur: number;
  realizedFinancialBenefitsEur: number; // Strictly Cash Savings + Cost Avoidance (no double counting)
  qualityBenefitsEstimatedEur: number;
  qualityBenefitsRealizedEur: number;
  strategicBenefitsEstimatedEur: number;
  strategicBenefitsRealizedEur: number;
  actualAiCostsEur: number;
  plannedAiCostsEur: number;
  totalTokens: number;
  netFinancialBenefitEur: number; // cash_savings + cost_avoidance - incremental_AI_costs
}

export interface DepartmentWaterfallRow {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  cashSavingsEur: number;
  costAvoidanceEur: number;
  incrementalAiCostsEur: number;
  plannedAiCostsEur: number;
  netFinancialBenefitEur: number;
  totalTokens: number;
}

export interface CostCenterNetRow {
  costCenter: string;
  departmentId: string;
  departmentName: string;
  hasAttributedBenefits: boolean;
  cashSavingsEur: number;
  costAvoidanceEur: number;
  actualAiCostsEur: number;
  plannedAiCostsEur: number;
  netFinancialBenefitEur: number | null; // Strictly null unless benefits are explicitly attributed to this cost center
  totalTokens: number;
}

export interface MonthlyCostTrendPoint {
  period: string; // YYYY-MM
  plannedEur: number;
  forecastEur?: number | null;
  actualEur: number;
  tokens: number;
}

export interface PlatformSpendRow {
  platform: string;
  actualEur: number;
  plannedEur: number;
  tokens: number;
  transactionCount: number;
}

export interface DepartmentFinancialRow {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  realizedCashSavingsEur: number;
  realizedCostAvoidanceEur: number;
  realizedFinancialBenefitsEur: number;
  annualHoursSaved: number;
  estimatedEfficiencyValueEur: number;
  actualAiCostsEur: number;
  totalTokens: number;
  netFinancialBenefitEur: number;
  roiPercent: number | null;
  annualBudgetEur: number;
  annualForecastEur: number | null;
  forecastCoveredMonthsCount: number;
  plannedMonthsCount: number;
  missingForecastMonths: number[];
  missingForecastEntriesCount: number;
  fallbackAppliedEntriesCount: number;
  forecastCompletenessPercent: number;
  hasMissingForecastData: boolean;
  ytdBudgetEur: number;
  ytdActualEur: number;
  ytdBudgetVarianceEur: number; // ytdBudgetEur - ytdActualEur
  forecastVarianceEur: number | null; // annualBudgetEur - annualForecastEur
  costPlanCount: number;
}

export interface MonthlyPlanForecastActualPoint {
  month: number; // 1..12
  period: string; // YYYY-MM
  monthLabel: string; // Jan..Dec
  plannedEur: number;
  forecastEur: number | null;
  actualEur: number;
  tokens: number;
  isElapsed: boolean;
  hasMissingForecast: boolean;
}

export interface PortfolioFinancialOverview {
  reportingYear: number;
  elapsedMonthCutoff: number;
  periodLabel: string;
  forecastMissingRule: ForecastMissingRule;
  summary: PortfolioFinancialSummary;
  annualBudgetEur: number;
  annualForecastEur: number | null;
  forecastCoveredMonthsCount: number;
  plannedMonthsCount: number;
  missingForecastMonths: number[];
  missingForecastEntriesCount: number;
  fallbackAppliedEntriesCount: number;
  forecastCompletenessPercent: number;
  hasMissingForecastData: boolean;
  ytdBudgetEur: number;
  ytdActualEur: number;
  ytdBudgetVarianceEur: number;
  ytdSpendUtilizationPercent: number | null;
  forecastVarianceEur: number | null;
  costPlanCount: number;
  departmentRows: DepartmentFinancialRow[];
  monthlyBudgetForecastActual: MonthlyPlanForecastActualPoint[];
}

const SHORT_MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatYearMonth(year: number, month: number): string {
  const m = Math.max(1, Math.min(12, Math.round(month)));
  return `${Math.round(year)}-${String(m).padStart(2, '0')}`;
}

export function extractPeriodYearMonth(
  period: string | undefined | null
): { year: number; month: number } | null {
  if (!period) return null;
  const m = /^(\d{4})-(\d{2})/.exec(period.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function resolveElapsedMonthCutoff(params: {
  reportingYear: number;
  referenceDate?: Date;
  filterPeriod?: string;
  explicitCutoff?: number;
}): number {
  if (typeof params.explicitCutoff === 'number') {
    return Math.max(0, Math.min(12, Math.round(params.explicitCutoff)));
  }
  if (params.filterPeriod) {
    const parsed = extractPeriodYearMonth(params.filterPeriod);
    if (parsed && parsed.year === params.reportingYear) {
      return parsed.month;
    }
  }
  const ref = params.referenceDate ?? new Date();
  const refYear = ref.getUTCFullYear();
  if (params.reportingYear < refYear) return 12;
  if (params.reportingYear > refYear) return 0;
  return Math.max(1, Math.min(12, ref.getUTCMonth() + 1));
}

export function collectAvailableReportingYears(params: {
  costPlans?: AiCostPlanEntry[];
  costs?: AiCostTransaction[];
  benefits?: BenefitEntry[];
  fallbackYear?: number;
}): number[] {
  const years = new Set<number>();
  for (const p of params.costPlans ?? []) {
    if (Number.isInteger(p.planningYear) && p.planningYear >= 2000) {
      years.add(p.planningYear);
    }
  }
  for (const c of params.costs ?? []) {
    const ym = extractPeriodYearMonth(c.period);
    if (ym) years.add(ym.year);
  }
  for (const b of params.benefits ?? []) {
    const ym = extractPeriodYearMonth(b.period);
    if (ym) years.add(ym.year);
  }
  if (years.size === 0 && params.fallbackYear) {
    years.add(params.fallbackYear);
  }
  return Array.from(years).sort((a, b) => b - a);
}

export function calculatePortfolioFinancialSummary(params: {
  initiatives: Initiative[];
  benefits: BenefitEntry[];
  costs: AiCostTransaction[];
  costPlans?: AiCostPlanEntry[];
}): PortfolioFinancialSummary {
  let annualHoursSaved = 0;
  let estimatedEfficiencyValueEur = 0;
  let efficiencyInitiativesWithRateCount = 0;
  let efficiencyInitiativesMissingRateCount = 0;

  for (const init of params.initiatives) {
    if (init.valueCategory === ValueCategory.EFFICIENCY) {
      const eff = calculateEfficiencyMetrics(
        init.valueCategory,
        init.usersCount,
        init.minutesSavedPerOccurrence,
        init.processFrequencyPerWeek,
        init.hourlyRate
      );
      annualHoursSaved += eff.annualHours;
      if (eff.estimatedEfficiencyValue !== null) {
        estimatedEfficiencyValueEur += eff.estimatedEfficiencyValue;
        efficiencyInitiativesWithRateCount += 1;
      } else {
        efficiencyInitiativesMissingRateCount += 1;
      }
    }
  }

  let estimatedCashAndAvoidanceEur = 0;
  let realizedCashSavingsEur = 0;
  let realizedCostAvoidanceEur = 0;
  let qualityBenefitsEstimatedEur = 0;
  let qualityBenefitsRealizedEur = 0;
  let strategicBenefitsEstimatedEur = 0;
  let strategicBenefitsRealizedEur = 0;

  for (const b of params.benefits) {
    switch (b.benefitType) {
      case BenefitType.CASH_SAVINGS:
        estimatedCashAndAvoidanceEur += b.estimatedAmountEur;
        realizedCashSavingsEur += b.realizedAmountEur;
        break;
      case BenefitType.COST_AVOIDANCE:
        estimatedCashAndAvoidanceEur += b.estimatedAmountEur;
        realizedCostAvoidanceEur += b.realizedAmountEur;
        break;
      case BenefitType.QUALITY_IMPROVEMENT:
        qualityBenefitsEstimatedEur += b.estimatedAmountEur;
        qualityBenefitsRealizedEur += b.realizedAmountEur;
        break;
      case BenefitType.STRATEGIC_BENEFIT:
        strategicBenefitsEstimatedEur += b.estimatedAmountEur;
        strategicBenefitsRealizedEur += b.realizedAmountEur;
        break;
    }
  }

  let actualAiCostsEur = 0;
  let plannedAiCostsEur = 0;
  let totalTokens = 0;

  for (const c of params.costs) {
    if (c.spendType === 'ACTUAL') {
      actualAiCostsEur += c.amountEur;
      totalTokens += c.tokens;
    } else if (!params.costPlans) {
      plannedAiCostsEur += c.amountEur;
    }
  }

  if (params.costPlans) {
    plannedAiCostsEur = params.costPlans.reduce(
      (sum, p) => sum + p.plannedAmountEur,
      0
    );
  }

  // Strictly cash savings + cost avoidance - incremental AI costs (no double counting with estimated efficiency value)
  const realizedFinancialBenefitsEur =
    realizedCashSavingsEur + realizedCostAvoidanceEur;
  const netFinancialBenefitEur =
    realizedFinancialBenefitsEur - actualAiCostsEur;

  return {
    annualHoursSaved,
    estimatedEfficiencyValueEur,
    efficiencyInitiativesWithRateCount,
    efficiencyInitiativesMissingRateCount,
    estimatedCashAndAvoidanceEur,
    realizedCashSavingsEur,
    realizedCostAvoidanceEur,
    realizedFinancialBenefitsEur,
    qualityBenefitsEstimatedEur,
    qualityBenefitsRealizedEur,
    strategicBenefitsEstimatedEur,
    strategicBenefitsRealizedEur,
    actualAiCostsEur,
    plannedAiCostsEur,
    totalTokens,
    netFinancialBenefitEur,
  };
}

/**
 * Shared single-source-of-truth Financial Overview & Department Reconciliation service.
 * Ensures Total Portfolio figures reconcile exactly with the sum of all department rows,
 * respects Annual vs YTD elapsed-month comparisons, and explicitly surfaces missing forecasts.
 */
export function calculatePortfolioFinancialDashboard(params: {
  departments: Department[];
  initiatives: Initiative[];
  benefits: BenefitEntry[];
  costs: AiCostTransaction[];
  costPlans: AiCostPlanEntry[];
  reportingYear: number;
  filterPeriod?: string; // '' = full year (YTD for actual vs planned), or 'YYYY-MM'
  referenceDate?: Date;
  elapsedMonthCutoff?: number;
  forecastMissingRule?: ForecastMissingRule;
  includeUnpopulatedDepartments?: boolean;
}): PortfolioFinancialOverview {
  const reportingYear = params.reportingYear;
  const forecastMissingRule = params.forecastMissingRule ?? 'FLAG_MISSING';
  const elapsedMonthCutoff = resolveElapsedMonthCutoff({
    reportingYear,
    referenceDate: params.referenceDate,
    filterPeriod: params.filterPeriod,
    explicitCutoff: params.elapsedMonthCutoff,
  });

  const singleMonthFilter = params.filterPeriod
    ? extractPeriodYearMonth(params.filterPeriod)
    : null;
  const isSingleMonthInYear =
    Boolean(singleMonthFilter) && singleMonthFilter!.year === reportingYear;

  const yearPrefix = `${reportingYear}-`;

  const matchesBenefitOrCostScope = (period: string | undefined): boolean => {
    if (!period) return false;
    if (isSingleMonthInYear) {
      return period === params.filterPeriod;
    }
    return period.startsWith(yearPrefix);
  };

  const scopedBenefits = params.benefits.filter((b) =>
    matchesBenefitOrCostScope(b.period)
  );
  const scopedCosts = params.costs.filter((c) =>
    matchesBenefitOrCostScope(c.period)
  );
  const yearPlans = params.costPlans.filter(
    (p) => p.planningYear === reportingYear
  );

  // Build canonical ordered department list including any department IDs referenced in data
  const deptMap = new Map<string, Department>();
  for (const d of params.departments) {
    deptMap.set(d.id, d);
  }
  const ensureDeptEntry = (deptId: string) => {
    if (!deptId || deptMap.has(deptId)) return;
    deptMap.set(deptId, {
      id: deptId,
      name: deptId,
      code: deptId.slice(0, 4).toUpperCase(),
      costCenter: 'UNASSIGNED',
    });
  };
  for (const i of params.initiatives) ensureDeptEntry(i.departmentId);
  for (const b of scopedBenefits) ensureDeptEntry(b.departmentId);
  for (const c of scopedCosts) ensureDeptEntry(c.departmentId);
  for (const p of yearPlans) ensureDeptEntry(p.departmentId);

  const summary = calculatePortfolioFinancialSummary({
    initiatives: params.initiatives,
    benefits: scopedBenefits,
    costs: scopedCosts,
    costPlans: yearPlans,
  });

  const computeForecastCoverageForPlans = (plans: AiCostPlanEntry[]) => {
    let annualBudgetEur = 0;
    let forecastSum = 0;
    let hasAnyForecastValue = false;
    let missingForecastEntriesCount = 0;
    let fallbackAppliedEntriesCount = 0;
    let ytdBudgetEur = 0;

    const plannedMonths = new Set<number>();
    const monthsWithCompleteForecast = new Set<number>();
    const monthsWithMissingForecastEntry = new Set<number>();

    for (const p of plans) {
      annualBudgetEur += p.plannedAmountEur;
      plannedMonths.add(p.month);

      const inYtdWindow = isSingleMonthInYear
        ? p.month === singleMonthFilter!.month
        : p.month <= elapsedMonthCutoff;
      if (inYtdWindow) {
        ytdBudgetEur += p.plannedAmountEur;
      }

      if (p.forecastAmountEur !== null && p.forecastAmountEur !== undefined) {
        forecastSum += p.forecastAmountEur;
        hasAnyForecastValue = true;
        if (!monthsWithMissingForecastEntry.has(p.month)) {
          monthsWithCompleteForecast.add(p.month);
        }
      } else {
        missingForecastEntriesCount += 1;
        if (forecastMissingRule === 'FALLBACK_TO_PLANNED') {
          forecastSum += p.plannedAmountEur;
          hasAnyForecastValue = true;
          fallbackAppliedEntriesCount += 1;
          if (!monthsWithMissingForecastEntry.has(p.month)) {
            monthsWithCompleteForecast.add(p.month);
          }
        } else {
          monthsWithMissingForecastEntry.add(p.month);
          monthsWithCompleteForecast.delete(p.month);
        }
      }
    }

    const missingForecastMonths: number[] = [];
    for (let m = 1; m <= 12; m += 1) {
      if (!monthsWithCompleteForecast.has(m)) {
        missingForecastMonths.push(m);
      }
    }

    const annualForecastEur = hasAnyForecastValue ? forecastSum : null;
    const forecastCoveredMonthsCount = monthsWithCompleteForecast.size;
    const forecastCompletenessPercent = Math.round(
      (forecastCoveredMonthsCount / 12) * 100
    );
    const hasMissingForecastData =
      plans.length === 0 ||
      missingForecastMonths.length > 0 ||
      missingForecastEntriesCount > 0;

    return {
      annualBudgetEur,
      annualForecastEur,
      forecastCoveredMonthsCount,
      plannedMonthsCount: plannedMonths.size,
      missingForecastMonths,
      missingForecastEntriesCount,
      fallbackAppliedEntriesCount,
      forecastCompletenessPercent,
      hasMissingForecastData,
      ytdBudgetEur,
      forecastVarianceEur:
        annualForecastEur !== null ? annualBudgetEur - annualForecastEur : null,
    };
  };

  // Department rows reconciled from the exact same filtered sets
  const departmentRows: DepartmentFinancialRow[] = [];
  for (const dept of deptMap.values()) {
    const dInits = params.initiatives.filter((i) => i.departmentId === dept.id);
    const dBens = scopedBenefits.filter((b) => b.departmentId === dept.id);
    const dCosts = scopedCosts.filter((c) => c.departmentId === dept.id);
    const dPlans = yearPlans.filter((p) => p.departmentId === dept.id);

    const hasActivity =
      dBens.length > 0 ||
      dCosts.length > 0 ||
      dPlans.length > 0 ||
      dInits.length > 0;
    if (!params.includeUnpopulatedDepartments && !hasActivity) {
      continue;
    }

    const dSummary = calculatePortfolioFinancialSummary({
      initiatives: dInits,
      benefits: dBens,
      costs: dCosts,
      costPlans: dPlans,
    });
    const dPlanStats = computeForecastCoverageForPlans(dPlans);

    let ytdActualEur = 0;
    for (const c of dCosts) {
      if (c.spendType !== 'ACTUAL') continue;
      const ym = extractPeriodYearMonth(c.period);
      if (!ym || ym.year !== reportingYear) continue;
      const inYtd = isSingleMonthInYear
        ? ym.month === singleMonthFilter!.month
        : ym.month <= elapsedMonthCutoff;
      if (inYtd) {
        ytdActualEur += c.amountEur;
      }
    }

    const roiPercent =
      dSummary.actualAiCostsEur > 0
        ? Math.round(
            (dSummary.netFinancialBenefitEur / dSummary.actualAiCostsEur) * 1000
          ) / 10
        : null;

    departmentRows.push({
      departmentId: dept.id,
      departmentName: dept.name,
      departmentCode: dept.code,
      realizedCashSavingsEur: dSummary.realizedCashSavingsEur,
      realizedCostAvoidanceEur: dSummary.realizedCostAvoidanceEur,
      realizedFinancialBenefitsEur: dSummary.realizedFinancialBenefitsEur,
      annualHoursSaved: dSummary.annualHoursSaved,
      estimatedEfficiencyValueEur: dSummary.estimatedEfficiencyValueEur,
      actualAiCostsEur: dSummary.actualAiCostsEur,
      totalTokens: dSummary.totalTokens,
      netFinancialBenefitEur: dSummary.netFinancialBenefitEur,
      roiPercent,
      annualBudgetEur: dPlanStats.annualBudgetEur,
      annualForecastEur: dPlanStats.annualForecastEur,
      forecastCoveredMonthsCount: dPlanStats.forecastCoveredMonthsCount,
      plannedMonthsCount: dPlanStats.plannedMonthsCount,
      missingForecastMonths: dPlanStats.missingForecastMonths,
      missingForecastEntriesCount: dPlanStats.missingForecastEntriesCount,
      fallbackAppliedEntriesCount: dPlanStats.fallbackAppliedEntriesCount,
      forecastCompletenessPercent: dPlanStats.forecastCompletenessPercent,
      hasMissingForecastData: dPlanStats.hasMissingForecastData,
      ytdBudgetEur: dPlanStats.ytdBudgetEur,
      ytdActualEur,
      ytdBudgetVarianceEur: dPlanStats.ytdBudgetEur - ytdActualEur,
      forecastVarianceEur: dPlanStats.forecastVarianceEur,
      costPlanCount: dPlans.length,
    });
  }

  // Compute portfolio-level Cost Planning & YTD figures using exact same rules
  // and verify portfolio forecast completeness across all active months
  const portfolioPlanStats = computeForecastCoverageForPlans(yearPlans);
  const ytdActualEur = departmentRows.reduce((s, r) => s + r.ytdActualEur, 0);
  const ytdBudgetVarianceEur = portfolioPlanStats.ytdBudgetEur - ytdActualEur;
  const ytdSpendUtilizationPercent =
    portfolioPlanStats.ytdBudgetEur > 0
      ? Math.round((ytdActualEur / portfolioPlanStats.ytdBudgetEur) * 1000) / 10
      : null;

  // Build 12-month Jan..Dec series for reportingYear
  const monthlyBudgetForecastActual: MonthlyPlanForecastActualPoint[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const period = formatYearMonth(reportingYear, m);
    const mPlans = yearPlans.filter((p) => p.month === m);
    const mCosts = scopedCosts.filter(
      (c) => c.spendType === 'ACTUAL' && c.period === period
    );
    const plannedEur = mPlans.reduce((s, p) => s + p.plannedAmountEur, 0);
    let mForecastSum = 0;
    let mHasForecast = false;
    let mHasMissingForecast = mPlans.length === 0;
    for (const p of mPlans) {
      if (p.forecastAmountEur !== null && p.forecastAmountEur !== undefined) {
        mForecastSum += p.forecastAmountEur;
        mHasForecast = true;
      } else if (forecastMissingRule === 'FALLBACK_TO_PLANNED') {
        mForecastSum += p.plannedAmountEur;
        mHasForecast = true;
      } else {
        mHasMissingForecast = true;
      }
    }

    const actualEur = mCosts.reduce((s, c) => s + c.amountEur, 0);
    const tokens = mCosts.reduce((s, c) => s + c.tokens, 0);

    monthlyBudgetForecastActual.push({
      month: m,
      period,
      monthLabel: SHORT_MONTH_LABELS[m - 1],
      plannedEur,
      forecastEur: mHasForecast ? mForecastSum : null,
      actualEur,
      tokens,
      isElapsed: m <= elapsedMonthCutoff,
      hasMissingForecast: mHasMissingForecast,
    });
  }

  const periodLabel = isSingleMonthInYear
    ? `Month ${params.filterPeriod}`
    : elapsedMonthCutoff > 0
      ? `YTD Jan–${SHORT_MONTH_LABELS[elapsedMonthCutoff - 1]} ${reportingYear}`
      : `FY ${reportingYear}`;

  return {
    reportingYear,
    elapsedMonthCutoff,
    periodLabel,
    forecastMissingRule,
    summary,
    annualBudgetEur: portfolioPlanStats.annualBudgetEur,
    annualForecastEur: portfolioPlanStats.annualForecastEur,
    forecastCoveredMonthsCount: portfolioPlanStats.forecastCoveredMonthsCount,
    plannedMonthsCount: portfolioPlanStats.plannedMonthsCount,
    missingForecastMonths: portfolioPlanStats.missingForecastMonths,
    missingForecastEntriesCount: portfolioPlanStats.missingForecastEntriesCount,
    fallbackAppliedEntriesCount: portfolioPlanStats.fallbackAppliedEntriesCount,
    forecastCompletenessPercent: portfolioPlanStats.forecastCompletenessPercent,
    hasMissingForecastData: portfolioPlanStats.hasMissingForecastData,
    ytdBudgetEur: portfolioPlanStats.ytdBudgetEur,
    ytdActualEur,
    ytdBudgetVarianceEur,
    ytdSpendUtilizationPercent,
    forecastVarianceEur: portfolioPlanStats.forecastVarianceEur,
    costPlanCount: yearPlans.length,
    departmentRows,
    monthlyBudgetForecastActual,
  };
}

export function calculateDepartmentWaterfalls(params: {
  departments: Department[];
  benefits: BenefitEntry[];
  costs: AiCostTransaction[];
  costPlans?: AiCostPlanEntry[];
}): DepartmentWaterfallRow[] {
  const byDept = new Map<string, DepartmentWaterfallRow>();
  for (const d of params.departments) {
    byDept.set(d.id, {
      departmentId: d.id,
      departmentName: d.name,
      departmentCode: d.code,
      cashSavingsEur: 0,
      costAvoidanceEur: 0,
      incrementalAiCostsEur: 0,
      plannedAiCostsEur: 0,
      netFinancialBenefitEur: 0,
      totalTokens: 0,
    });
  }

  for (const b of params.benefits) {
    let row = byDept.get(b.departmentId);
    if (!row) {
      row = {
        departmentId: b.departmentId,
        departmentName: b.departmentId,
        departmentCode: b.departmentId.slice(0, 4).toUpperCase(),
        cashSavingsEur: 0,
        costAvoidanceEur: 0,
        incrementalAiCostsEur: 0,
        plannedAiCostsEur: 0,
        netFinancialBenefitEur: 0,
        totalTokens: 0,
      };
      byDept.set(b.departmentId, row);
    }
    if (b.benefitType === BenefitType.CASH_SAVINGS) {
      row.cashSavingsEur += b.realizedAmountEur;
    } else if (b.benefitType === BenefitType.COST_AVOIDANCE) {
      row.costAvoidanceEur += b.realizedAmountEur;
    }
  }

  for (const c of params.costs) {
    let row = byDept.get(c.departmentId);
    if (!row) {
      row = {
        departmentId: c.departmentId,
        departmentName: c.departmentId,
        departmentCode: c.departmentId.slice(0, 4).toUpperCase(),
        cashSavingsEur: 0,
        costAvoidanceEur: 0,
        incrementalAiCostsEur: 0,
        plannedAiCostsEur: 0,
        netFinancialBenefitEur: 0,
        totalTokens: 0,
      };
      byDept.set(c.departmentId, row);
    }
    if (c.spendType === 'ACTUAL') {
      row.incrementalAiCostsEur += c.amountEur;
      row.totalTokens += c.tokens;
    } else if (!params.costPlans) {
      row.plannedAiCostsEur += c.amountEur;
    }
  }

  if (params.costPlans) {
    for (const p of params.costPlans) {
      let row = byDept.get(p.departmentId);
      if (!row) {
        row = {
          departmentId: p.departmentId,
          departmentName: p.departmentId,
          departmentCode: p.departmentId.slice(0, 4).toUpperCase(),
          cashSavingsEur: 0,
          costAvoidanceEur: 0,
          incrementalAiCostsEur: 0,
          plannedAiCostsEur: 0,
          netFinancialBenefitEur: 0,
          totalTokens: 0,
        };
        byDept.set(p.departmentId, row);
      }
      row.plannedAiCostsEur += p.plannedAmountEur;
    }
  }

  return Array.from(byDept.values())
    .map((r) => ({
      ...r,
      netFinancialBenefitEur:
        r.cashSavingsEur + r.costAvoidanceEur - r.incrementalAiCostsEur,
    }))
    .filter(
      (r) =>
        r.cashSavingsEur > 0 ||
        r.costAvoidanceEur > 0 ||
        r.incrementalAiCostsEur > 0 ||
        r.plannedAiCostsEur > 0
    );
}

/**
 * Computes cost-center-level net financial benefit ONLY when benefits can be explicitly
 * attributed to that cost center (`benefit.costCenter`). Never invents or pro-rates splits.
 */
export function calculateCostCenterNetBenefits(params: {
  departments: Department[];
  benefits: BenefitEntry[];
  costs: AiCostTransaction[];
}): CostCenterNetRow[] {
  const deptNameMap = new Map(params.departments.map((d) => [d.id, d.name]));
  const map = new Map<string, CostCenterNetRow>();

  const ensureRow = (costCenter: string, departmentId: string): CostCenterNetRow => {
    const key = costCenter.trim().toUpperCase();
    const existing = map.get(key);
    if (existing) return existing;
    const row: CostCenterNetRow = {
      costCenter: costCenter.trim(),
      departmentId,
      departmentName: deptNameMap.get(departmentId) ?? departmentId,
      hasAttributedBenefits: false,
      cashSavingsEur: 0,
      costAvoidanceEur: 0,
      actualAiCostsEur: 0,
      plannedAiCostsEur: 0,
      netFinancialBenefitEur: null,
      totalTokens: 0,
    };
    map.set(key, row);
    return row;
  };

  for (const c of params.costs) {
    if (!c.costCenter.trim()) continue;
    const row = ensureRow(c.costCenter, c.departmentId);
    if (c.spendType === 'ACTUAL') {
      row.actualAiCostsEur += c.amountEur;
      row.totalTokens += c.tokens;
    } else {
      row.plannedAiCostsEur += c.amountEur;
    }
  }

  for (const b of params.benefits) {
    const cc = b.costCenter?.trim();
    if (!cc) continue;
    if (
      b.benefitType !== BenefitType.CASH_SAVINGS &&
      b.benefitType !== BenefitType.COST_AVOIDANCE
    ) {
      continue;
    }
    const row = ensureRow(cc, b.departmentId);
    row.hasAttributedBenefits = true;
    if (b.benefitType === BenefitType.CASH_SAVINGS) {
      row.cashSavingsEur += b.realizedAmountEur;
    } else {
      row.costAvoidanceEur += b.realizedAmountEur;
    }
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      netFinancialBenefitEur: r.hasAttributedBenefits
        ? r.cashSavingsEur + r.costAvoidanceEur - r.actualAiCostsEur
        : null,
    }))
    .sort((a, b) => a.costCenter.localeCompare(b.costCenter));
}

export function calculateMonthlyCostTrends(
  costs: AiCostTransaction[],
  costPlans?: AiCostPlanEntry[],
  forecastMissingRule: ForecastMissingRule = 'FLAG_MISSING'
): MonthlyCostTrendPoint[] {
  const byPeriod = new Map<string, MonthlyCostTrendPoint>();

  for (const c of costs) {
    if (!c.period) continue;
    const existing = byPeriod.get(c.period) ?? {
      period: c.period,
      plannedEur: 0,
      forecastEur: null,
      actualEur: 0,
      tokens: 0,
    };
    if (c.spendType === 'ACTUAL') {
      existing.actualEur += c.amountEur;
      existing.tokens += c.tokens;
    } else if (!costPlans || costPlans.length === 0) {
      existing.plannedEur += c.amountEur;
    }
    byPeriod.set(c.period, existing);
  }

  if (costPlans && costPlans.length > 0) {
    for (const p of costPlans) {
      const period = p.period || formatYearMonth(p.planningYear, p.month);
      const existing = byPeriod.get(period) ?? {
        period,
        plannedEur: 0,
        forecastEur: null,
        actualEur: 0,
        tokens: 0,
      };
      existing.plannedEur += p.plannedAmountEur;
      const effForecast =
        p.forecastAmountEur !== null && p.forecastAmountEur !== undefined
          ? p.forecastAmountEur
          : forecastMissingRule === 'FALLBACK_TO_PLANNED'
            ? p.plannedAmountEur
            : null;
      if (effForecast !== null) {
        existing.forecastEur = (existing.forecastEur ?? 0) + effForecast;
      }
      byPeriod.set(period, existing);
    }
  }

  return Array.from(byPeriod.values()).sort((a, b) =>
    a.period.localeCompare(b.period)
  );
}

export function calculatePlatformSpendAndTokens(
  costs: AiCostTransaction[],
  costPlans?: AiCostPlanEntry[]
): PlatformSpendRow[] {
  const map = new Map<string, PlatformSpendRow>();
  const hasPlans = Boolean(costPlans && costPlans.length > 0);
  for (const c of costs) {
    const key = c.platform || 'Other';
    const row = map.get(key) ?? {
      platform: key,
      actualEur: 0,
      plannedEur: 0,
      tokens: 0,
      transactionCount: 0,
    };
    row.transactionCount += 1;
    if (c.spendType === 'ACTUAL') {
      row.actualEur += c.amountEur;
      row.tokens += c.tokens;
    } else if (!hasPlans) {
      row.plannedEur += c.amountEur;
    }
    map.set(key, row);
  }
  if (costPlans && costPlans.length > 0) {
    for (const p of costPlans) {
      const key = p.platform || 'Other';
      const row = map.get(key) ?? {
        platform: key,
        actualEur: 0,
        plannedEur: 0,
        tokens: 0,
        transactionCount: 0,
      };
      row.plannedEur += p.plannedAmountEur;
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.actualEur - a.actualEur);
}

