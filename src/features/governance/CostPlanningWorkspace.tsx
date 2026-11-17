import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  History,
  Layers,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  buildImportErrorsCsv,
  ColumnMappingSuggestion,
  COST_PLAN_IMPORT_FIELD_LABELS,
  CostPlanDuplicateReviewItem,
  CostPlanImportField,
  detectCostPlanDuplicates,
  findDuplicateCostPlanConflicts,
  suggestCostPlanColumnMappings,
  validateAndNormalizeCostPlanImportBatch,
} from '../../domain/excelImport';
import {
  formatYearMonth,
  PortfolioFinancialOverview,
} from '../../domain/financials';
import {
  AI_PLATFORMS,
  AiCostPlanEntry,
  COST_CATEGORY_LABELS,
  CostCategory,
  CostPlanDuplicateAction,
  Department,
  ForecastMissingRule,
  ImportBatchRecord,
  UserRole,
  WorkspaceDataset,
} from '../../domain/types';
import { CostTrendChart } from '../../components/charts/CostTrendChart';
import { Modal } from '../../components/Modal';
import {
  downloadSampleCostPlanWorkbook,
  extractWorksheetRows,
  ParsedWorkbook,
  ParsedWorksheetData,
  parseLocalSpreadsheetFile,
  triggerCsvDownload,
} from '../../services/excelParser';
import { useApp } from '../../services/appContext';

const MONTH_OPTIONS = [
  { value: 1, label: '01 — Jan' },
  { value: 2, label: '02 — Feb' },
  { value: 3, label: '03 — Mar' },
  { value: 4, label: '04 — Apr' },
  { value: 5, label: '05 — May' },
  { value: 6, label: '06 — Jun' },
  { value: 7, label: '07 — Jul' },
  { value: 8, label: '08 — Aug' },
  { value: 9, label: '09 — Sep' },
  { value: 10, label: '10 — Oct' },
  { value: 11, label: '11 — Nov' },
  { value: 12, label: '12 — Dec' },
] as const;

type ImportStep = 1 | 2 | 3 | 4 | 5;

const IMPORT_STEP_LABELS: Record<ImportStep, string> = {
  1: '1. Upload',
  2: '2. Column Mapping',
  3: '3. Validation',
  4: '4. Duplicate Review',
  5: '5. Import',
};

function eur(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}€${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export interface CostPlanningWorkspaceProps {
  departments: Department[];
  costPlans: AiCostPlanEntry[];
  actualCostCount: number;
  financialOverview: PortfolioFinancialOverview;
  reportingYear: number;
  onReportingYearChange: (year: number) => void;
  availableYears: number[];
  forecastMissingRule: ForecastMissingRule;
  onForecastMissingRuleChange: (rule: ForecastMissingRule) => void;
  onRefresh: () => Promise<void>;
  initialMode?: 'plans' | 'import';
  onModeChange?: (mode: 'plans' | 'import') => void;
}

export const CostPlanningWorkspace: React.FC<CostPlanningWorkspaceProps> = ({
  departments,
  costPlans,
  actualCostCount,
  financialOverview,
  reportingYear,
  onReportingYearChange,
  availableYears,
  forecastMissingRule,
  onForecastMissingRuleChange,
  onRefresh,
  initialMode = 'plans',
  onModeChange,
}) => {
  const { repository, currentUser, activeDataset, notify } = useApp();
  const isPortfolioManager = currentUser.role === UserRole.GOVERNANCE;

  const [mode, setMode] = useState<'plans' | 'import'>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const switchMode = (next: 'plans' | 'import') => {
    setMode(next);
    onModeChange?.(next);
  };

  // Ledger filters
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('');

  // Add / Edit Modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    departmentId: departments[0]?.id ?? '',
    planningYear: String(reportingYear),
    month: '11',
    platform: AI_PLATFORMS[0] as string,
    costCategory: CostCategory.TOKENS_API,
    plannedAmountEur: '2500',
    forecastAmountEur: '',
    costCenter: departments[0]?.costCenter ?? '',
    licenseCount: '',
    comments: '',
  });

  // Duplicate single entry to another month Modal
  const [dupTargetPlan, setDupTargetPlan] = useState<AiCostPlanEntry | null>(null);
  const [dupYear, setDupYear] = useState(String(reportingYear));
  const [dupMonth, setDupMonth] = useState('12');
  const [dupOverwrite, setDupOverwrite] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Copy monthly plan across year Modal
  const [copyYearModalOpen, setCopyYearModalOpen] = useState(false);
  const [copySourceYear, setCopySourceYear] = useState(String(reportingYear));
  const [copySourceMonth, setCopySourceMonth] = useState('1');
  const [copyDeptId, setCopyDeptId] = useState('');
  const [copyTargetMonths, setCopyTargetMonths] = useState<number[]>([
    2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);
  const [copyOverwrite, setCopyOverwrite] = useState(false);
  const [copyingYear, setCopyingYear] = useState(false);

  // Delete confirmation Modal (no window.confirm)
  const [deleteTargetPlan, setDeleteTargetPlan] = useState<AiCostPlanEntry | null>(
    null
  );
  const [deletingPlan, setDeletingPlan] = useState(false);

  // 5-Step Smart Cost Plan Excel/CSV Import Wizard State
  const [importStep, setImportStep] = useState<ImportStep>(1);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetData, setSheetData] = useState<ParsedWorksheetData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [useMockProvider, setUseMockProvider] = useState(true);
  const [targetDataset, setTargetDataset] = useState<WorkspaceDataset>(activeDataset);
  const [mappings, setMappings] = useState<
    ColumnMappingSuggestion<CostPlanImportField>[]
  >([]);
  const [duplicateItems, setDuplicateItems] = useState<
    CostPlanDuplicateReviewItem[]
  >([]);
  const [committedBatch, setCommittedBatch] = useState<ImportBatchRecord | null>(
    null
  );
  const [costPlanBatches, setCostPlanBatches] = useState<ImportBatchRecord[]>([]);
  const [committingImport, setCommittingImport] = useState(false);

  useEffect(() => {
    setTargetDataset(activeDataset);
  }, [activeDataset]);

  useEffect(() => {
    let active = true;
    async function loadBatches() {
      try {
        const all = await repository.listImportBatches();
        if (!active) return;
        setCostPlanBatches(all.filter((b) => b.kind === 'COST_PLANS'));
      } catch {
        // ignore secondary load error
      }
    }
    void loadBatches();
    return () => {
      active = false;
    };
  }, [repository, committedBatch, costPlans.length]);

  const yearSelectableOptions = useMemo(() => {
    const set = new Set<number>([
      ...availableYears,
      reportingYear,
      reportingYear + 1,
    ]);
    return Array.from(set).sort((a, b) => b - a);
  }, [availableYears, reportingYear]);

  const availablePlatforms = useMemo(() => {
    const set = new Set<string>(AI_PLATFORMS);
    for (const p of costPlans) {
      if (p.platform.trim()) set.add(p.platform.trim());
    }
    return Array.from(set).sort();
  }, [costPlans]);

  const filteredPlans = useMemo(() => {
    return costPlans.filter((p) => {
      if (p.planningYear !== reportingYear) return false;
      if (filterDepartmentId && p.departmentId !== filterDepartmentId) return false;
      if (filterPlatform && p.platform !== filterPlatform) return false;
      if (filterMonth && p.month !== Number(filterMonth)) return false;
      return true;
    });
  }, [
    costPlans,
    reportingYear,
    filterDepartmentId,
    filterPlatform,
    filterMonth,
  ]);

  const monthlyChartPoints = useMemo(
    () =>
      financialOverview.monthlyBudgetForecastActual.map((pt) => ({
        period: pt.period,
        plannedEur: pt.plannedEur,
        forecastEur: pt.forecastEur,
        actualEur: pt.actualEur,
        tokens: pt.tokens,
      })),
    [financialOverview.monthlyBudgetForecastActual]
  );

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const openAddModal = () => {
    const firstDept = departments[0];
    setEditingPlanId(null);
    setPlanForm({
      departmentId: filterDepartmentId || firstDept?.id || '',
      planningYear: String(reportingYear),
      month: filterMonth || '11',
      platform: filterPlatform || AI_PLATFORMS[0],
      costCategory: CostCategory.TOKENS_API,
      plannedAmountEur: '2500',
      forecastAmountEur: '',
      costCenter:
        departments.find((d) => d.id === (filterDepartmentId || firstDept?.id))
          ?.costCenter ?? '',
      licenseCount: '',
      comments: '',
    });
    setPlanModalOpen(true);
  };

  const openEditModal = (plan: AiCostPlanEntry) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      departmentId: plan.departmentId,
      planningYear: String(plan.planningYear),
      month: String(plan.month),
      platform: plan.platform,
      costCategory: plan.costCategory,
      plannedAmountEur: String(plan.plannedAmountEur),
      forecastAmountEur:
        plan.forecastAmountEur === null || plan.forecastAmountEur === undefined
          ? ''
          : String(plan.forecastAmountEur),
      costCenter: plan.costCenter ?? '',
      licenseCount:
        plan.licenseCount === null || plan.licenseCount === undefined
          ? ''
          : String(plan.licenseCount),
      comments: plan.comments ?? '',
    });
    setPlanModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const plannedVal = Number(planForm.plannedAmountEur);
    if (
      planForm.plannedAmountEur.trim() === '' ||
      !Number.isFinite(plannedVal) ||
      plannedVal < 0
    ) {
      notify(
        'error',
        'Invalid Planned Cost',
        'Planned Cost (EUR) is required and must be zero or positive.'
      );
      return;
    }

    let forecastVal: number | null = null;
    if (planForm.forecastAmountEur.trim() !== '') {
      const parsed = Number(planForm.forecastAmountEur);
      if (!Number.isFinite(parsed) || parsed < 0) {
        notify(
          'error',
          'Invalid Forecast Cost',
          'Forecast Cost (EUR) must be blank (missing) or zero or positive.'
        );
        return;
      }
      forecastVal = parsed;
    }

    let licVal: number | null = null;
    if (planForm.licenseCount.trim() !== '') {
      const parsedLic = Number(planForm.licenseCount);
      if (!Number.isFinite(parsedLic) || parsedLic < 0) {
        notify(
          'error',
          'Invalid License Count',
          'License count must be blank or a non-negative integer.'
        );
        return;
      }
      licVal = Math.round(parsedLic);
    }

    setSavingPlan(true);
    try {
      const savedYear = Number(planForm.planningYear);
      await repository.saveCostPlan(
        {
          id: editingPlanId ?? undefined,
          departmentId: planForm.departmentId,
          planningYear: savedYear,
          month: Number(planForm.month),
          platform: planForm.platform,
          costCategory: planForm.costCategory,
          plannedAmountEur: plannedVal,
          forecastAmountEur: forecastVal,
          costCenter: planForm.costCenter.trim() || undefined,
          licenseCount: licVal,
          comments: planForm.comments.trim() || undefined,
        },
        currentUser
      );
      if (savedYear !== reportingYear) {
        onReportingYearChange(savedYear);
      }
      setPlanModalOpen(false);
      await onRefresh();
      notify(
        'success',
        editingPlanId ? 'Cost plan entry updated' : 'Cost plan entry added',
        `${deptName(planForm.departmentId)} · ${formatYearMonth(savedYear, Number(planForm.month))}`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to save cost plan',
        err instanceof Error ? err.message : 'Validation failed'
      );
    } finally {
      setSavingPlan(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetPlan) return;
    setDeletingPlan(true);
    try {
      await repository.deleteCostPlan(deleteTargetPlan.id, currentUser);
      setDeleteTargetPlan(null);
      await onRefresh();
      notify(
        'info',
        'Cost plan entry deleted',
        'Actual spend transactions ledger remains unchanged.'
      );
    } catch (err) {
      notify(
        'error',
        'Unable to delete cost plan',
        err instanceof Error ? err.message : 'Delete failed'
      );
    } finally {
      setDeletingPlan(false);
    }
  };

  const handleDuplicateToMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dupTargetPlan) return;
    setDuplicating(true);
    try {
      const targetY = Number(dupYear);
      const targetM = Number(dupMonth);
      const res = await repository.duplicateCostPlanToMonth(
        {
          sourcePlanId: dupTargetPlan.id,
          targetPlanningYear: targetY,
          targetMonth: targetM,
          overwriteExisting: dupOverwrite,
        },
        currentUser
      );
      setDupTargetPlan(null);
      if (targetY !== reportingYear) {
        onReportingYearChange(targetY);
      }
      await onRefresh();
      notify(
        'success',
        res.action === 'UPDATED'
          ? 'Target month plan updated'
          : 'Cost plan duplicated to month',
        `${formatYearMonth(targetY, targetM)} · ${dupTargetPlan.platform}`
      );
    } catch (err) {
      notify(
        'error',
        'Unable to duplicate entry',
        err instanceof Error ? err.message : 'Duplicate failed'
      );
    } finally {
      setDuplicating(false);
    }
  };

  const handleCopyAcrossYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setCopyingYear(true);
    try {
      const srcYear = Number(copySourceYear);
      const srcMonth = Number(copySourceMonth);
      const result = await repository.copyMonthlyPlanAcrossYear(
        {
          sourcePlanningYear: srcYear,
          sourceMonth: srcMonth,
          targetMonths: copyTargetMonths,
          departmentId: copyDeptId || undefined,
          overwriteExisting: copyOverwrite,
        },
        currentUser
      );
      setCopyYearModalOpen(false);
      await onRefresh();
      notify(
        'success',
        'Monthly cost plan copied across year',
        `${result.createdCount} created, ${result.updatedCount} updated, ${result.skippedCount} skipped.`
      );
    } catch (err) {
      notify(
        'error',
        'Copy across year failed',
        err instanceof Error ? err.message : 'Unable to copy cost plans'
      );
    } finally {
      setCopyingYear(false);
    }
  };

  // --- 5-Step Excel Cost Plan Import Logic ---

  const mappingConflicts = useMemo(
    () => findDuplicateCostPlanConflicts(mappings),
    [mappings]
  );

  const costPlanValidation = useMemo(() => {
    if (!sheetData) {
      return { validRows: [], invalidRows: [], allRows: [] };
    }
    return validateAndNormalizeCostPlanImportBatch({
      rows: sheetData.rows,
      mappings,
      departments,
      defaultPlanningYear: reportingYear,
    });
  }, [sheetData, mappings, departments, reportingYear]);

  const handleApplyWorksheet = (wb: ParsedWorkbook, sheetName: string) => {
    const parsed = extractWorksheetRows(wb.workbook, sheetName);
    setSelectedSheet(sheetName);
    setSheetData(parsed);
    setMappings(
      suggestCostPlanColumnMappings(parsed.headers, { useMockProvider })
    );
    setCommittedBatch(null);
  };

  const handleCostPlanFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const parsedWb = await parseLocalSpreadsheetFile(file);
      if (parsedWb.sheetNames.length === 0) {
        const msg = 'No worksheets found in this workbook.';
        setUploadError(msg);
        notify('error', 'Empty workbook', msg);
        return;
      }
      const firstParsed = extractWorksheetRows(
        parsedWb.workbook,
        parsedWb.sheetNames[0]
      );
      setWorkbook(parsedWb);
      setSelectedSheet(parsedWb.sheetNames[0]);
      setSheetData(firstParsed);
      setMappings(
        suggestCostPlanColumnMappings(firstParsed.headers, { useMockProvider })
      );
      setCommittedBatch(null);
      if (firstParsed.rows.length === 0 || firstParsed.headers.length === 0) {
        setUploadError(
          `Worksheet "${parsedWb.sheetNames[0]}" contains 0 data rows.`
        );
      }
      setImportStep(2);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unsupported or corrupted file.';
      setUploadError(msg);
      notify('error', 'Unable to parse Cost Plan file', msg);
    } finally {
      e.target.value = '';
    }
  };

  const handleProceedToValidation = () => {
    if (mappingConflicts.length > 0) {
      notify(
        'error',
        'Resolve duplicate field mappings',
        'Two source columns cannot map to the same Cost Plan field.'
      );
      return;
    }
    setImportStep(3);
  };

  const handleProceedToDuplicateReview = () => {
    const existingForTarget = costPlans;
    const dupes = detectCostPlanDuplicates(
      costPlanValidation.validRows,
      existingForTarget
    );
    setDuplicateItems(dupes);
    setImportStep(4);
  };

  const handleCommitCostPlanImport = async () => {
    if (!workbook || !sheetData) return;
    setCommittingImport(true);
    try {
      const batch = await repository.commitCostPlanImportBatch({
        fileName: workbook.fileName,
        worksheetName: selectedSheet,
        targetDataset,
        items: duplicateItems,
        failedCount: costPlanValidation.invalidRows.length,
        actor: currentUser,
      });
      setCommittedBatch(batch);
      setImportStep(5);
      await onRefresh();
      notify(
        'success',
        'AI Cost Plan Import Committed',
        `${batch.createdCount} created, ${batch.updatedCount} updated, ${batch.skippedCount} skipped. Actual spend transactions were not overwritten.`
      );
    } catch (err) {
      notify(
        'error',
        'Cost Plan import rejected',
        err instanceof Error ? err.message : 'Unable to commit batch'
      );
    } finally {
      setCommittingImport(false);
    }
  };

  const missingForecastEntriesCount =
    financialOverview.missingForecastEntriesCount;
  const forecastCoveragePct = financialOverview.forecastCompletenessPercent;

  return (
    <div className="space-y-6">
      {/* Mode Switcher Bar (inner tabs omitted when parent page tabs control mode) */}
      <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            AI Cost Planning &amp; Forecasting Workspace
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Manage annual budgets and rolling monthly forecasts separately from
            recorded Actual Spend transactions ({actualCostCount} actual
            ledger rows preserved independently).
          </p>
        </div>

        {!onModeChange ? (
          <div
            className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5 shrink-0"
            role="tablist"
            aria-label="Cost Planning Mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'plans'}
              onClick={() => switchMode('plans')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'plans'
                  ? 'bg-[#004F9F] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cost Plan Ledger</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'import'}
              onClick={() => switchMode('import')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'import'
                  ? 'bg-[#004F9F] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Excel / CSV Import (5-Step)</span>
            </button>
          </div>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-[#BFD7EE] bg-[#EBF3FB] px-2.5 py-1 text-[11px] font-semibold text-[#004F9F]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Isolated from Actual Spend Ledger
          </span>
        )}
      </div>

      {mode === 'plans' ? (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">
                Annual AI Budget ({reportingYear})
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {eur(financialOverview.annualBudgetEur)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {financialOverview.plannedMonthsCount}/12 planned months ·{' '}
                {financialOverview.costPlanCount} plan entries
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Latest Annual Forecast ({reportingYear})
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    financialOverview.hasMissingForecastData
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {financialOverview.forecastCoveredMonthsCount}/12 mo (
                  {forecastCoveragePct}%)
                </span>
              </div>
              <div className="mt-1 text-2xl font-bold text-[#004F9F] tabular-nums">
                {financialOverview.annualForecastEur !== null
                  ? eur(financialOverview.annualForecastEur)
                  : 'Not Available'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {financialOverview.forecastVarianceEur !== null
                  ? `Forecast Variance vs Budget: ${eur(financialOverview.forecastVarianceEur)}`
                  : 'No forecast values recorded'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium text-slate-500">
                YTD Actual vs YTD Budget ({financialOverview.periodLabel})
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {eur(financialOverview.ytdActualEur)}{' '}
                <span className="text-sm font-medium text-slate-500">
                  / {eur(financialOverview.ytdBudgetEur)}
                </span>
              </div>
              <div
                className={`mt-1 text-[11px] font-semibold tabular-nums ${
                  financialOverview.ytdBudgetVarianceEur >= 0
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                YTD Variance:{' '}
                {financialOverview.ytdBudgetVarianceEur >= 0 ? '+' : ''}
                {eur(financialOverview.ytdBudgetVarianceEur)}{' '}
                {financialOverview.ytdBudgetVarianceEur >= 0
                  ? '(Under Budget)'
                  : '(Over Budget)'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <label
                htmlFor="cost-plan-missing-rule"
                className="block text-xs font-medium text-slate-500"
              >
                Missing Forecast Handling Rule
              </label>
              <select
                id="cost-plan-missing-rule"
                value={forecastMissingRule}
                onChange={(e) =>
                  onForecastMissingRuleChange(
                    e.target.value as ForecastMissingRule
                  )
                }
                className="mt-1.5 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
              >
                <option value="FLAG_MISSING">Flag Missing Honestly</option>
                <option value="FALLBACK_TO_PLANNED">
                  Fallback to Planned Budget
                </option>
              </select>
              <div className="mt-1.5 text-[11px] text-slate-600 tabular-nums">
                {missingForecastEntriesCount > 0
                  ? `${missingForecastEntriesCount} entry/entries have blank forecast (${
                      forecastMissingRule === 'FALLBACK_TO_PLANNED'
                        ? `${financialOverview.fallbackAppliedEntriesCount} fallback applied`
                        : 'never fabricated'
                    }).`
                  : 'All active plan entries contain forecast figures.'}
              </div>
            </div>
          </div>

          {/* Honest Missing Forecast Alert */}
          {financialOverview.hasMissingForecastData && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <div>
                <strong>Incomplete Forecast Coverage ({reportingYear}):</strong>{' '}
                Forecast data covers{' '}
                <strong>
                  {financialOverview.forecastCoveredMonthsCount} of 12 months
                </strong>{' '}
                ({forecastCoveragePct}% completeness).{' '}
                {financialOverview.missingForecastMonths.length > 0 && (
                  <span>
                    Missing/partial months:{' '}
                    {financialOverview.missingForecastMonths
                      .map((m) => MONTH_OPTIONS[m - 1]?.label.slice(-3) ?? m)
                      .join(', ')}
                    .
                  </span>
                )}{' '}
                Blank forecast cells are preserved honestly rather than
                invented.
              </div>
            </div>
          )}

          {/* Monthly Planned vs Forecast vs Actual Spend Chart */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {reportingYear} Monthly Budget, Latest Forecast &amp; Actual
                  Spend
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Aggregated from AI Cost Plan entries (Planned &amp; Forecast)
                  and Cost Ledger (Actual Spend). Amber stubs indicate missing
                  monthly forecast data.
                </p>
              </div>
              <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                Cutoff: {financialOverview.periodLabel}
              </span>
            </div>
            <div className="mt-4">
              <CostTrendChart points={monthlyChartPoints} />
            </div>
          </section>

          {/* Filters & Actions Toolbar */}
          <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 flex-1">
                <div>
                  <label
                    htmlFor="cplan-filter-year"
                    className="block text-[11px] font-semibold text-slate-500"
                  >
                    Planning Year
                  </label>
                  <select
                    id="cplan-filter-year"
                    value={reportingYear}
                    onChange={(e) =>
                      onReportingYearChange(Number(e.target.value))
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                  >
                    {yearSelectableOptions.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cplan-filter-dept"
                    className="block text-[11px] font-semibold text-slate-500"
                  >
                    Department
                  </label>
                  <select
                    id="cplan-filter-dept"
                    value={filterDepartmentId}
                    onChange={(e) => setFilterDepartmentId(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cplan-filter-platform"
                    className="block text-[11px] font-semibold text-slate-500"
                  >
                    AI Platform
                  </label>
                  <select
                    id="cplan-filter-platform"
                    value={filterPlatform}
                    onChange={(e) => setFilterPlatform(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                  >
                    <option value="">All Platforms</option>
                    {availablePlatforms.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cplan-filter-month"
                    className="block text-[11px] font-semibold text-slate-500"
                  >
                    Month
                  </label>
                  <select
                    id="cplan-filter-month"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                  >
                    <option value="">All 12 Months</option>
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={downloadSampleCostPlanWorkbook}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sample Plan (.xlsx)</span>
                </button>
                {isPortfolioManager && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setCopySourceYear(String(reportingYear));
                        setCopySourceMonth(filterMonth || '1');
                        setCopyDeptId(filterDepartmentId);
                        const srcM = Number(filterMonth || '1');
                        setCopyTargetMonths(
                          Array.from({ length: 12 }, (_, i) => i + 1).filter(
                            (m) => m > srcM
                          )
                        );
                        setCopyOverwrite(false);
                        setCopyYearModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy Month Across Year</span>
                    </button>
                    <button
                      type="button"
                      onClick={openAddModal}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#003E7E]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add Plan Entry</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Monthly Cost Plan Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3">Department / Cost Center</th>
                    <th className="py-2 pr-3">Platform / Category</th>
                    <th className="py-2 pr-3 text-right">Planned (EUR)</th>
                    <th className="py-2 pr-3 text-right">Forecast (EUR)</th>
                    <th className="py-2 pr-3 text-right">Licenses</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Comments</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-3 font-mono font-semibold tabular-nums text-slate-900">
                        {plan.period}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-900">
                          {deptName(plan.departmentId)}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {plan.costCenter || 'No Cost Center'}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="text-slate-900">{plan.platform}</div>
                        <div className="text-[11px] text-slate-500">
                          {COST_CATEGORY_LABELS[plan.costCategory]}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-slate-900">
                        {eur(plan.plannedAmountEur)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {plan.forecastAmountEur !== null &&
                        plan.forecastAmountEur !== undefined ? (
                          <span className="font-semibold text-[#004F9F]">
                            {eur(plan.forecastAmountEur)}
                          </span>
                        ) : (
                          <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                        {plan.licenseCount !== null &&
                        plan.licenseCount !== undefined
                          ? plan.licenseCount.toLocaleString('en-US')
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            plan.provenance === 'IMPORTED_EXCEL'
                              ? 'bg-blue-50 text-[#004F9F]'
                              : plan.provenance === 'MANUAL'
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {plan.provenance}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate py-2.5 pr-3 text-slate-600">
                        {plan.comments || '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {isPortfolioManager ? (
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              aria-label={`Edit cost plan ${plan.period} ${deptName(plan.departmentId)}`}
                              onClick={() => openEditModal(plan)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              title="Edit entry"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Duplicate cost plan ${plan.period} ${deptName(plan.departmentId)}`}
                              onClick={() => {
                                setDupTargetPlan(plan);
                                setDupYear(String(plan.planningYear));
                                setDupMonth(
                                  String(plan.month < 12 ? plan.month + 1 : 1)
                                );
                                setDupOverwrite(false);
                              }}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-[#004F9F]"
                              title="Duplicate to another month"
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete cost plan ${plan.period} ${deptName(plan.departmentId)}`}
                              onClick={() => setDeleteTargetPlan(plan)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                              title="Delete entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Read-only
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredPlans.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-8 text-center text-xs text-slate-500"
                      >
                        No cost plan entries found for {reportingYear} with the
                        selected filters. Add a manual entry or import a Cost
                        Plan spreadsheet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        /* 5-STEP EXCEL/CSV COST PLAN IMPORT WIZARD */
        <div className="space-y-6">
          {/* Stepper */}
          <nav
            aria-label="Cost plan import steps"
            className="grid grid-cols-5 gap-2"
          >
            {([1, 2, 3, 4, 5] as ImportStep[]).map((s) => {
              const active = importStep === s;
              const completed = importStep > s;
              return (
                <div
                  key={s}
                  className={`rounded-md border px-3 py-2 text-xs font-medium ${
                    active
                      ? 'border-[#004F9F] bg-[#004F9F] text-white'
                      : completed
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {IMPORT_STEP_LABELS[s]}
                </div>
              );
            })}
          </nav>

          {/* Step 1: Upload */}
          {importStep === 1 && (
            <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Step 1 — Upload AI Cost Plan Spreadsheet (.xlsx, .xls, .csv)
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Imports monthly Planned Budget and Latest Forecast records
                    using local SheetJS parsing. Handles German (1.250,50) and
                    English (1,250.00) decimals plus bilingual month names
                    without touching Actual Spend transactions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleCostPlanWorkbook}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download Sample Cost Plan (.xlsx)</span>
                </button>
              </div>

              <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <Upload
                  className="mx-auto h-8 w-8 text-slate-400"
                  aria-hidden="true"
                />
                <div className="mt-2 text-sm font-medium text-slate-900">
                  Select an Excel or CSV Cost Plan file
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Supported columns: Department, Planning Year, Month / Period,
                  AI Platform, Cost Category, Planned Cost (EUR), Forecast Cost
                  (optional), Cost Center, License Count, Comments.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E]">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  <span>Choose Cost Plan File</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleCostPlanFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 rounded-md border border-blue-200 bg-blue-50/70 p-4 text-xs text-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">
                    Target Workspace:{' '}
                    {targetDataset === 'SAMPLE_DEMO'
                      ? 'Sample Demo Data'
                      : 'Imported Portfolio Data'}
                  </div>
                  <div className="mt-0.5 text-slate-600">
                    Actual AI Spend transactions ({actualCostCount} entries) are
                    stored in a separate ledger and are never overwritten.
                  </div>
                </div>
                <select
                  aria-label="Target Workspace Dataset"
                  value={targetDataset}
                  onChange={(e) =>
                    setTargetDataset(e.target.value as WorkspaceDataset)
                  }
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="SAMPLE_DEMO">Sample Demo Data</option>
                  <option value="IMPORTED_PORTFOLIO">
                    Imported Portfolio Data
                  </option>
                </select>
              </div>

              {uploadError && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {costPlanBatches.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Recent Cost Plan Import Batches</span>
                  </div>
                  <div className="divide-y divide-slate-200 rounded-md border border-slate-200 text-xs">
                    {costPlanBatches.slice(0, 4).map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <div>
                          <span className="font-medium text-slate-900">
                            {b.fileName}
                          </span>{' '}
                          <span className="text-slate-500">
                            ({b.worksheetName})
                          </span>
                        </div>
                        <div className="tabular-nums text-slate-600">
                          +{b.createdCount} created · {b.updatedCount} updated ·{' '}
                          {b.skippedCount} skipped
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Step 2: Column Mapping */}
          {importStep === 2 && workbook && sheetData && (
            <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Step 2 — Worksheet Selection &amp; Column Mapping
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    File: <strong>{workbook.fileName}</strong> ·{' '}
                    {sheetData.rows.length} rows detected.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label
                      htmlFor="cplan-sheet-select"
                      className="mr-2 text-xs font-medium text-slate-600"
                    >
                      Worksheet:
                    </label>
                    <select
                      id="cplan-sheet-select"
                      value={selectedSheet}
                      onChange={(e) =>
                        handleApplyWorksheet(workbook, e.target.value)
                      }
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                    >
                      {workbook.sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={useMockProvider}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setUseMockProvider(next);
                        setMappings(
                          suggestCostPlanColumnMappings(sheetData.headers, {
                            useMockProvider: next,
                          })
                        );
                      }}
                    />
                    <span>Use MockCostPlanMappingProvider</span>
                  </label>
                </div>
              </div>

              {mappingConflicts.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Duplicate Target Field Conflict:</strong>{' '}
                    {mappingConflicts
                      .map(
                        (c) =>
                          `${COST_PLAN_IMPORT_FIELD_LABELS[c.targetField]} ← [${c.sourceHeaders.join(', ')}]`
                      )
                      .join('; ')}
                    . Each Cost Plan field may only be mapped once.
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Spreadsheet Header</th>
                      <th className="px-3 py-2">Detection Method</th>
                      <th className="px-3 py-2">Sample Value</th>
                      <th className="px-3 py-2">Target Cost Plan Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {mappings.map((m) => {
                      const sampleVal = sheetData.rows[0]?.[m.sourceHeader];
                      return (
                        <tr key={m.sourceHeader}>
                          <td className="px-3 py-2 font-semibold text-slate-900">
                            {m.sourceHeader}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                m.method === 'EXACT_ALIAS'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : m.method === 'FUZZY_STRING' ||
                                      m.method === 'MOCK_PROVIDER'
                                    ? 'bg-blue-100 text-[#004F9F]'
                                    : m.method === 'MANUAL'
                                      ? 'bg-slate-800 text-white'
                                      : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {m.method} ({m.confidencePercent}%)
                            </span>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {m.reason}
                            </div>
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-2 font-mono text-[11px] text-slate-600">
                            {sampleVal !== undefined && sampleVal !== ''
                              ? String(sampleVal)
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              aria-label={`Map column ${m.sourceHeader}`}
                              value={m.targetField}
                              onChange={(e) => {
                                const nextField = e.target
                                  .value as CostPlanImportField;
                                setMappings((prev) =>
                                  prev.map((x) =>
                                    x.sourceHeader === m.sourceHeader
                                      ? {
                                          ...x,
                                          targetField: nextField,
                                          method: 'MANUAL',
                                          confidencePercent: 100,
                                          reason: 'Manually selected',
                                        }
                                      : x
                                  )
                                );
                              }}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                            >
                              {(
                                Object.keys(
                                  COST_PLAN_IMPORT_FIELD_LABELS
                                ) as CostPlanImportField[]
                              ).map((f) => (
                                <option key={f} value={f}>
                                  {COST_PLAN_IMPORT_FIELD_LABELS[f]}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setImportStep(1)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  disabled={mappingConflicts.length > 0 || sheetData.rows.length === 0}
                  onClick={handleProceedToValidation}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
                >
                  <span>Validate {sheetData.rows.length} Rows</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          {/* Step 3: Validation */}
          {importStep === 3 && (
            <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Step 3 — Row Validation &amp; Missing Forecast Check
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Validates required Department, Year/Period, Month, AI
                    Platform, and Planned Cost (EUR). Blank forecasts are
                    strictly preserved as Missing Forecast without fabrication.
                  </p>
                </div>
                {costPlanValidation.invalidRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      triggerCsvDownload(
                        'aas_cost_plan_import_errors.csv',
                        buildImportErrorsCsv(
                          costPlanValidation.invalidRows.map((r) => ({
                            rowIndex: r.rowIndex,
                            identifier:
                              `${r.departmentName || 'Unknown'} ${r.period || ''}`.trim(),
                            errors: r.errors,
                          }))
                        )
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      Export {costPlanValidation.invalidRows.length} Invalid Row
                      Errors
                    </span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-emerald-800 font-medium">Valid Rows</div>
                  <div className="mt-0.5 text-xl font-bold text-emerald-950 tabular-nums">
                    {costPlanValidation.validRows.length}
                  </div>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <div className="text-red-800 font-medium">
                    Invalid / Rejected Rows
                  </div>
                  <div className="mt-0.5 text-xl font-bold text-red-950 tabular-nums">
                    {costPlanValidation.invalidRows.length}
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="text-amber-900 font-medium">
                    Blank Forecast Preserved Honestly
                  </div>
                  <div className="mt-0.5 text-xl font-bold text-amber-950 tabular-nums">
                    {
                      costPlanValidation.validRows.filter(
                        (r) => r.forecastAmountEur === null
                      ).length
                    }
                  </div>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2 text-right">Planned</th>
                      <th className="px-3 py-2 text-right">Forecast</th>
                      <th className="px-3 py-2">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {costPlanValidation.allRows.map((row) => (
                      <tr
                        key={row.rowIndex}
                        className={row.isValid ? '' : 'bg-red-50/50'}
                      >
                        <td className="px-3 py-2 font-mono text-slate-500">
                          #{row.rowIndex}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-800">
                          {row.period || 'Invalid'}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {row.departmentName || 'Missing'}
                          {row.isNewDepartment && (
                            <span className="ml-1.5 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-[#004F9F]">
                              New Dept
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.platform || 'Missing'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                          {eur(row.plannedAmountEur)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.forecastAmountEur !== null ? (
                            eur(row.forecastAmountEur)
                          ) : (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              Missing (null)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Valid
                              </span>
                              {row.warnings.map((w, wi) => (
                                <div
                                  key={wi}
                                  className="text-[11px] text-amber-800"
                                >
                                  {w}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] font-medium text-red-700">
                              {row.errors.join(' ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setImportStep(2)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Back to Mapping</span>
                </button>
                <button
                  type="button"
                  disabled={costPlanValidation.validRows.length === 0}
                  onClick={handleProceedToDuplicateReview}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
                >
                  <span>
                    Review Duplicates ({costPlanValidation.validRows.length}{' '}
                    Valid)
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          {/* Step 4: Duplicate Review */}
          {importStep === 4 && (
            <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Step 4 — Duplicate Review (Key: Dept + Year + Month +
                    Platform + Category + Cost Center)
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Choose whether matching entries are skipped, updated, or
                    created as separate line items.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setDuplicateItems((prev) =>
                        prev.map((it) =>
                          it.matchType === 'EXACT_PLAN_KEY'
                            ? { ...it, decision: 'SKIP' }
                            : it
                        )
                      )
                    }
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Skip All Matched
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDuplicateItems((prev) =>
                        prev.map((it) =>
                          it.matchType === 'EXACT_PLAN_KEY'
                            ? { ...it, decision: 'UPDATE_EXISTING' }
                            : it
                        )
                      )
                    }
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Update All Matched
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Period &amp; Dept</th>
                      <th className="px-3 py-2">Platform &amp; Category</th>
                      <th className="px-3 py-2">Match &amp; Field Diffs</th>
                      <th className="px-3 py-2">Action Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {duplicateItems.map((item) => (
                      <tr key={item.row.rowIndex}>
                        <td className="px-3 py-2">
                          <div className="font-mono font-semibold text-slate-900">
                            {item.row.period}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {item.row.departmentName}{' '}
                            {item.row.costCenter
                              ? `(${item.row.costCenter})`
                              : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-slate-900">
                            {item.row.platform}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {COST_CATEGORY_LABELS[item.row.costCategory]} · Plan{' '}
                            {eur(item.row.plannedAmountEur)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {item.matchType === 'NONE' ? (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                              No existing match (New)
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                Existing plan matched
                              </span>
                              {item.changes.length === 0 ? (
                                <div className="text-[11px] text-slate-500">
                                  Identical values
                                </div>
                              ) : (
                                item.changes.map((c) => (
                                  <div
                                    key={c.field}
                                    className="text-[11px] text-slate-600"
                                  >
                                    <strong>{c.field}:</strong> {c.oldValue} →{' '}
                                    {c.newValue}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            aria-label={`Duplicate decision row ${item.row.rowIndex}`}
                            value={item.decision}
                            onChange={(e) => {
                              const next = e.target
                                .value as CostPlanDuplicateAction;
                              setDuplicateItems((prev) =>
                                prev.map((it) =>
                                  it.row.rowIndex === item.row.rowIndex
                                    ? { ...it, decision: next }
                                    : it
                                )
                              );
                            }}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                          >
                            <option value="CREATE_NEW">Create New Entry</option>
                            {item.matchType === 'EXACT_PLAN_KEY' && (
                              <option value="UPDATE_EXISTING">
                                Update Existing Plan
                              </option>
                            )}
                            <option value="SKIP">Skip Row</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setImportStep(3)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Back to Validation</span>
                </button>
                <button
                  type="button"
                  disabled={committingImport || !isPortfolioManager}
                  onClick={handleCommitCostPlanImport}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {committingImport
                      ? 'Importing Cost Plans...'
                      : 'Commit Cost Plan Import'}
                  </span>
                </button>
              </div>
            </section>
          )}

          {/* Step 5: Import Complete */}
          {importStep === 5 && committedBatch && (
            <section className="rounded-lg border border-emerald-200 bg-white p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-6 w-6 text-emerald-700 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Step 5 — Cost Plan Import Complete
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Batch <strong>{committedBatch.id}</strong> from{' '}
                    <strong>{committedBatch.fileName}</strong> committed to{' '}
                    <strong>
                      {committedBatch.targetDataset === 'SAMPLE_DEMO'
                        ? 'Sample Demo Data'
                        : 'Imported Portfolio Data'}
                    </strong>
                    . Actual Spend transactions ({actualCostCount} records) were
                    not modified.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-500">Created</div>
                  <div className="text-xl font-bold text-emerald-700 tabular-nums">
                    {committedBatch.createdCount}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-500">Updated</div>
                  <div className="text-xl font-bold text-[#004F9F] tabular-nums">
                    {committedBatch.updatedCount}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-500">Skipped</div>
                  <div className="text-xl font-bold text-slate-700 tabular-nums">
                    {committedBatch.skippedCount}
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="text-slate-500">Rejected Rows</div>
                  <div className="text-xl font-bold text-red-700 tabular-nums">
                    {committedBatch.errorCount}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => switchMode('plans')}
                  className="rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E]"
                >
                  View Updated Cost Plan Ledger
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportStep(1);
                    setWorkbook(null);
                    setSheetData(null);
                    setCommittedBatch(null);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Import Another File
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Add / Edit Cost Plan Modal */}
      <Modal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        title={
          editingPlanId
            ? 'Edit Monthly AI Cost Plan Entry'
            : 'Add Monthly AI Cost Plan Entry'
        }
        description="Leave Forecast Cost blank if no rolling forecast is confirmed yet — missing forecasts are flagged instead of fabricated."
      >
        <form onSubmit={handleSavePlan} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cplan-form-dept"
                className="block font-semibold text-slate-700"
              >
                Department
              </label>
              <select
                id="cplan-form-dept"
                value={planForm.departmentId}
                onChange={(e) => {
                  const d = departments.find((x) => x.id === e.target.value);
                  setPlanForm({
                    ...planForm,
                    departmentId: e.target.value,
                    costCenter: d?.costCenter ?? planForm.costCenter,
                  });
                }}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
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
                htmlFor="cplan-form-cc"
                className="block font-semibold text-slate-700"
              >
                Cost Center (Optional)
              </label>
              <input
                id="cplan-form-cc"
                type="text"
                value={planForm.costCenter}
                onChange={(e) =>
                  setPlanForm({ ...planForm, costCenter: e.target.value })
                }
                placeholder="e.g. CC-2100"
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cplan-form-year"
                className="block font-semibold text-slate-700"
              >
                Planning Year
              </label>
              <input
                id="cplan-form-year"
                type="number"
                min={2000}
                max={2100}
                required
                value={planForm.planningYear}
                onChange={(e) =>
                  setPlanForm({ ...planForm, planningYear: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="cplan-form-month"
                className="block font-semibold text-slate-700"
              >
                Month
              </label>
              <select
                id="cplan-form-month"
                value={planForm.month}
                onChange={(e) =>
                  setPlanForm({ ...planForm, month: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cplan-form-platform"
                className="block font-semibold text-slate-700"
              >
                AI Platform
              </label>
              <select
                id="cplan-form-platform"
                value={planForm.platform}
                onChange={(e) =>
                  setPlanForm({ ...planForm, platform: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {availablePlatforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="cplan-form-category"
                className="block font-semibold text-slate-700"
              >
                Cost Category
              </label>
              <select
                id="cplan-form-category"
                value={planForm.costCategory}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    costCategory: e.target.value as CostCategory,
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {Object.values(CostCategory).map((cc) => (
                  <option key={cc} value={cc}>
                    {COST_CATEGORY_LABELS[cc]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="cplan-form-planned"
                className="block font-semibold text-slate-700"
              >
                Planned Cost (EUR) *
              </label>
              <input
                id="cplan-form-planned"
                type="number"
                min={0}
                step="0.01"
                required
                value={planForm.plannedAmountEur}
                onChange={(e) =>
                  setPlanForm({ ...planForm, plannedAmountEur: e.target.value })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="cplan-form-forecast"
                className="block font-semibold text-slate-700"
              >
                Forecast (EUR, Optional)
              </label>
              <input
                id="cplan-form-forecast"
                type="number"
                min={0}
                step="0.01"
                value={planForm.forecastAmountEur}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    forecastAmountEur: e.target.value,
                  })
                }
                placeholder="Blank = Missing"
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="cplan-form-licenses"
                className="block font-semibold text-slate-700"
              >
                Licenses (Optional)
              </label>
              <input
                id="cplan-form-licenses"
                type="number"
                min={0}
                value={planForm.licenseCount}
                onChange={(e) =>
                  setPlanForm({ ...planForm, licenseCount: e.target.value })
                }
                placeholder="e.g. 25"
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="cplan-form-comments"
              className="block font-semibold text-slate-700"
            >
              Comments (Optional)
            </label>
            <input
              id="cplan-form-comments"
              type="text"
              value={planForm.comments}
              onChange={(e) =>
                setPlanForm({ ...planForm, comments: e.target.value })
              }
              placeholder="Budget assumptions or license renewal rationale..."
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPlanModalOpen(false)}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingPlan}
              className="rounded bg-[#004F9F] px-3.5 py-1.5 font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
            >
              {savingPlan
                ? 'Saving...'
                : editingPlanId
                  ? 'Update Plan Entry'
                  : 'Save Plan Entry'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Duplicate Single Cost Plan to Another Month Modal */}
      <Modal
        open={Boolean(dupTargetPlan)}
        onClose={() => setDupTargetPlan(null)}
        title="Duplicate Cost Plan to Another Month"
        description={
          dupTargetPlan
            ? `Copy ${dupTargetPlan.period} · ${deptName(dupTargetPlan.departmentId)} · ${dupTargetPlan.platform} (${eur(dupTargetPlan.plannedAmountEur)})`
            : undefined
        }
      >
        <form onSubmit={handleDuplicateToMonth} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cplan-dup-year"
                className="block font-semibold text-slate-700"
              >
                Target Planning Year
              </label>
              <input
                id="cplan-dup-year"
                type="number"
                min={2000}
                max={2100}
                required
                value={dupYear}
                onChange={(e) => setDupYear(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="cplan-dup-month"
                className="block font-semibold text-slate-700"
              >
                Target Month
              </label>
              <select
                id="cplan-dup-month"
                value={dupMonth}
                onChange={(e) => setDupMonth(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={dupOverwrite}
              onChange={(e) => setDupOverwrite(e.target.checked)}
            />
            <span>
              Overwrite existing entry in target month if matching Platform &amp;
              Category exists
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDupTargetPlan(null)}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={duplicating}
              className="rounded bg-[#004F9F] px-3.5 py-1.5 font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
            >
              {duplicating ? 'Duplicating...' : 'Duplicate Entry'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Copy Monthly Plan Across Planning Year Modal */}
      <Modal
        open={copyYearModalOpen}
        onClose={() => setCopyYearModalOpen(false)}
        title="Copy Monthly Plan Across Planning Year"
        description="Replicate a source month's Planned & Forecast lines across selected months without affecting Actual Spend."
      >
        <form onSubmit={handleCopyAcrossYear} className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="cplan-copy-year"
                className="block font-semibold text-slate-700"
              >
                Year
              </label>
              <input
                id="cplan-copy-year"
                type="number"
                min={2000}
                max={2100}
                required
                value={copySourceYear}
                onChange={(e) => setCopySourceYear(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor="cplan-copy-src-month"
                className="block font-semibold text-slate-700"
              >
                Source Month
              </label>
              <select
                id="cplan-copy-src-month"
                value={copySourceMonth}
                onChange={(e) => {
                  const srcM = Number(e.target.value);
                  setCopySourceMonth(e.target.value);
                  setCopyTargetMonths((prev) => prev.filter((m) => m !== srcM));
                }}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="cplan-copy-dept"
                className="block font-semibold text-slate-700"
              >
                Department Scope
              </label>
              <select
                id="cplan-copy-dept"
                value={copyDeptId}
                onChange={(e) => setCopyDeptId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">
                Target Months ({copyTargetMonths.length} selected)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const srcM = Number(copySourceMonth);
                    setCopyTargetMonths(
                      MONTH_OPTIONS.map((m) => m.value).filter((m) => m > srcM)
                    );
                  }}
                  className="text-[11px] font-medium text-[#004F9F] hover:underline"
                >
                  Remaining Months
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const srcM = Number(copySourceMonth);
                    setCopyTargetMonths(
                      MONTH_OPTIONS.map((m) => m.value).filter(
                        (m) => m !== srcM
                      )
                    );
                  }}
                  className="text-[11px] font-medium text-[#004F9F] hover:underline"
                >
                  All Other Months
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MONTH_OPTIONS.map((m) => {
                const isSource = m.value === Number(copySourceMonth);
                const checked = copyTargetMonths.includes(m.value);
                return (
                  <label
                    key={m.value}
                    className={`flex items-center gap-1.5 rounded border px-2 py-1 ${
                      isSource
                        ? 'border-slate-200 bg-slate-100 text-slate-400'
                        : checked
                          ? 'border-[#004F9F] bg-blue-50 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isSource}
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCopyTargetMonths((prev) =>
                            [...prev, m.value].sort((a, b) => a - b)
                          );
                        } else {
                          setCopyTargetMonths((prev) =>
                            prev.filter((x) => x !== m.value)
                          );
                        }
                      }}
                    />
                    <span>{m.label.slice(-3)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={copyOverwrite}
              onChange={(e) => setCopyOverwrite(e.target.checked)}
            />
            <span>Overwrite existing matching entries in target months</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCopyYearModalOpen(false)}
              className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={copyingYear || copyTargetMonths.length === 0}
              className="rounded bg-[#004F9F] px-3.5 py-1.5 font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
            >
              {copyingYear ? 'Copying...' : 'Copy Monthly Plan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTargetPlan)}
        onClose={() => setDeleteTargetPlan(null)}
        title="Confirm Delete Cost Plan Entry"
        description="This removes only the Planned/Forecast budget line. Actual Spend transactions remain intact."
      >
        {deleteTargetPlan && (
          <div className="space-y-4 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div className="font-semibold text-slate-900">
                {deleteTargetPlan.period} · {deptName(deleteTargetPlan.departmentId)}
              </div>
              <div className="text-slate-600">
                {deleteTargetPlan.platform} ·{' '}
                {COST_CATEGORY_LABELS[deleteTargetPlan.costCategory]}
              </div>
              <div className="tabular-nums text-slate-800">
                Planned: {eur(deleteTargetPlan.plannedAmountEur)} · Forecast:{' '}
                {deleteTargetPlan.forecastAmountEur !== null
                  ? eur(deleteTargetPlan.forecastAmountEur)
                  : 'Missing'}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetPlan(null)}
                className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingPlan}
                onClick={handleConfirmDelete}
                className="rounded bg-red-700 px-3.5 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deletingPlan ? 'Deleting...' : 'Delete Plan Entry'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
