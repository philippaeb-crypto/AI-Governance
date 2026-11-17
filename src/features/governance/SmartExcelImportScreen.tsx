import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  applyMappingTemplate,
  buildImportErrorsCsv,
  ColumnMappingSuggestion,
  detectImportDuplicates,
  DuplicateResolutionAction,
  DuplicateReviewItem,
  findDuplicateTargetFieldConflicts,
  INITIATIVE_IMPORT_FIELD_LABELS,
  InitiativeImportField,
  suggestInitiativeColumnMappings,
  validateAndNormalizeInitiativeImportBatch,
} from '../../domain/excelImport';
import {
  ImportBatchRecord,
  ImportMappingTemplate,
  LIFECYCLE_LABELS,
  WorkspaceDataset,
} from '../../domain/types';
import {
  downloadSampleInitiativesWorkbook,
  extractWorksheetRows,
  ParsedWorkbook,
  ParsedWorksheetData,
  parseLocalSpreadsheetFile,
  triggerCsvDownload,
} from '../../services/excelParser';
import { useApp } from '../../services/appContext';

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_TITLES: Record<WizardStep, string> = {
  1: '1. Upload',
  2: '2. Column Mapping',
  3: '3. Validation',
  4: '4. Duplicate Review',
  5: '5. Import',
};

export const SmartExcelImportScreen: React.FC = () => {
  const {
    repository,
    currentUser,
    departments,
    users,
    operationsConfig,
    activeDataset,
    bumpDataRevision,
    notify,
    navigate,
  } = useApp();

  const [step, setStep] = useState<WizardStep>(1);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetData, setSheetData] = useState<ParsedWorksheetData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [useMockProvider, setUseMockProvider] = useState(true);
  const [allowIncompleteRecords, setAllowIncompleteRecords] = useState(true);
  const [mappings, setMappings] = useState<
    ColumnMappingSuggestion<InitiativeImportField>[]
  >([]);

  // Mapping Templates
  const [templates, setTemplates] = useState<ImportMappingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [targetDataset, setTargetDataset] = useState<WorkspaceDataset>(
    'IMPORTED_PORTFOLIO'
  );
  const [duplicateItems, setDuplicateItems] = useState<DuplicateReviewItem[]>(
    []
  );
  const [committedBatch, setCommittedBatch] =
    useState<ImportBatchRecord | null>(null);
  const [pastBatches, setPastBatches] = useState<ImportBatchRecord[]>([]);
  const [committing, setCommitting] = useState(false);

  const loadHistoryAndTemplates = React.useCallback(async () => {
    const [batches, tplList] = await Promise.all([
      repository.listImportBatches(),
      repository.listMappingTemplates(),
    ]);
    setPastBatches(batches);
    setTemplates(tplList);
  }, [repository]);

  React.useEffect(() => {
    void loadHistoryAndTemplates();
  }, [loadHistoryAndTemplates, committedBatch]);

  const applyWorksheet = (wb: ParsedWorkbook, sheetName: string) => {
    const parsed = extractWorksheetRows(wb.workbook, sheetName);
    setSelectedSheet(sheetName);
    setSheetData(parsed);
    setSelectedTemplateId('');
    setMappings(
      suggestInitiativeColumnMappings(parsed.headers, { useMockProvider })
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setSelectedTemplateId('');
      setMappings(
        suggestInitiativeColumnMappings(firstParsed.headers, { useMockProvider })
      );
      setCommittedBatch(null);

      if (firstParsed.rows.length === 0 || firstParsed.headers.length === 0) {
        setUploadError(
          `Worksheet "${parsedWb.sheetNames[0]}" in "${parsedWb.fileName}" contains 0 data rows. Switch worksheets or upload a populated file.`
        );
      }
      setStep(2);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unsupported or corrupted file.';
      setUploadError(msg);
      notify('error', 'Unable to parse spreadsheet', msg);
    } finally {
      e.target.value = '';
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!workbook) return;
    setUploadError(null);
    applyWorksheet(workbook, sheetName);
  };

  const handleToggleMockProvider = (enabled: boolean) => {
    setUseMockProvider(enabled);
    if (sheetData) {
      setMappings(
        suggestInitiativeColumnMappings(sheetData.headers, {
          useMockProvider: enabled,
        })
      );
    }
  };

  const handleMappingChange = (
    sourceHeader: string,
    targetField: InitiativeImportField
  ) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceHeader === sourceHeader
          ? {
              ...m,
              targetField,
              method: targetField === '__EXCLUDE__' ? 'EXCLUDED' : 'MANUAL',
              confidencePercent: targetField === '__EXCLUDE__' ? 0 : 100,
              reason:
                targetField === '__EXCLUDE__'
                  ? 'Manually excluded'
                  : 'Manually mapped by user',
            }
          : m
      )
    );
  };

  const mappingConflicts = useMemo(
    () => findDuplicateTargetFieldConflicts(mappings),
    [mappings]
  );

  const conflictingHeaders = useMemo(() => {
    const set = new Set<string>();
    for (const c of mappingConflicts) {
      for (const h of c.sourceHeaders) set.add(h);
    }
    return set;
  }, [mappingConflicts]);

  const handleAutoResolveConflicts = () => {
    const seen = new Set<InitiativeImportField>();
    setMappings((prev) =>
      prev.map((m) => {
        if (m.targetField === '__EXCLUDE__') return m;
        if (seen.has(m.targetField)) {
          return {
            ...m,
            targetField: '__EXCLUDE__',
            method: 'EXCLUDED',
            confidencePercent: 0,
            reason: 'Auto-excluded duplicate target column',
          };
        }
        seen.add(m.targetField);
        return m;
      })
    );
  };

  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!sheetData) return;
    if (!templateId) {
      setMappings(
        suggestInitiativeColumnMappings(sheetData.headers, { useMockProvider })
      );
      return;
    }
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const fallback = suggestInitiativeColumnMappings(sheetData.headers, {
      useMockProvider,
    });
    setMappings(
      applyMappingTemplate(sheetData.headers, tpl.mappings, fallback)
    );
    notify(
      'info',
      'Mapping template applied',
      `Loaded column mapping template "${tpl.name}".`
    );
  };

  const handleSaveTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) {
      notify('error', 'Template name required', 'Enter a name for the mapping template.');
      return;
    }
    if (mappingConflicts.length > 0) {
      notify(
        'error',
        'Resolve column conflicts first',
        'Two source columns cannot map to the same target field.'
      );
      return;
    }
    setSavingTemplate(true);
    try {
      const saved = await repository.saveMappingTemplate({
        name,
        mappings: mappings.map((m) => ({
          sourceHeader: m.sourceHeader,
          targetField: m.targetField,
        })),
      });
      setNewTemplateName('');
      await loadHistoryAndTemplates();
      setSelectedTemplateId(saved.id);
      notify('success', 'Mapping template saved', `Saved "${saved.name}" to IndexedDB.`);
    } catch (err) {
      notify(
        'error',
        'Unable to save template',
        err instanceof Error ? err.message : 'Save failed.'
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await repository.deleteMappingTemplate(id);
      if (selectedTemplateId === id) setSelectedTemplateId('');
      await loadHistoryAndTemplates();
      notify('info', 'Mapping template deleted');
    } catch (err) {
      notify(
        'error',
        'Unable to delete template',
        err instanceof Error ? err.message : 'Delete failed.'
      );
    }
  };

  const validationBatch = useMemo(() => {
    if (!sheetData) {
      return { validRows: [], invalidRows: [], allRows: [] };
    }
    return validateAndNormalizeInitiativeImportBatch({
      rows: sheetData.rows,
      mappings,
      departments,
      users,
      allowIncompleteRecords,
      aliasRules: operationsConfig.aliasRules,
    });
  }, [
    sheetData,
    mappings,
    departments,
    users,
    allowIncompleteRecords,
    operationsConfig.aliasRules,
  ]);

  const needsCompletionCount = useMemo(
    () => validationBatch.validRows.filter((r) => r.needsDataCompletion).length,
    [validationBatch.validRows]
  );

  const enterDuplicateReview = async () => {
    const currentActive = repository.getActiveDataset();
    let existingInTarget = await repository.listInitiatives();
    if (targetDataset !== currentActive) {
      await repository.switchDataset(targetDataset);
      existingInTarget = await repository.listInitiatives();
      await repository.switchDataset(currentActive);
    }
    const items = detectImportDuplicates(
      validationBatch.validRows,
      existingInTarget
    );
    setDuplicateItems(items);
    setStep(4);
  };

  const handleTargetDatasetChange = async (nextTarget: WorkspaceDataset) => {
    setTargetDataset(nextTarget);
    if (step === 4) {
      const currentActive = repository.getActiveDataset();
      if (nextTarget !== currentActive) {
        await repository.switchDataset(nextTarget);
      }
      const existing = await repository.listInitiatives();
      if (nextTarget !== currentActive) {
        await repository.switchDataset(currentActive);
      }
      setDuplicateItems(
        detectImportDuplicates(validationBatch.validRows, existing)
      );
    }
  };

  const handleDecisionChange = (
    rowIndex: number,
    decision: DuplicateResolutionAction
  ) => {
    setDuplicateItems((prev) =>
      prev.map((item) =>
        item.row.rowIndex === rowIndex ? { ...item, decision } : item
      )
    );
  };

  const handleCommitBatch = async () => {
    if (!workbook || duplicateItems.length === 0) return;
    setCommitting(true);
    try {
      const batch = await repository.commitInitiativeImportBatch({
        fileName: workbook.fileName,
        worksheetName: selectedSheet,
        targetDataset,
        items: duplicateItems,
        failedCount: validationBatch.invalidRows.length,
        actor: currentUser,
      });
      setCommittedBatch(batch);
      setStep(5);
      await bumpDataRevision();
      notify(
        'success',
        'Excel Import Committed to IndexedDB',
        `${batch.createdCount} created, ${batch.updatedCount} updated, ${batch.skippedCount} skipped, ${batch.errorCount} failed.`
      );
    } catch (err) {
      notify(
        'error',
        'Import batch rejected',
        err instanceof Error ? err.message : 'Unable to commit batch.'
      );
    } finally {
      setCommitting(false);
    }
  };

  const handleExportErrors = () => {
    const csv = buildImportErrorsCsv(
      validationBatch.invalidRows.map((r) => ({
        rowIndex: r.rowIndex,
        identifier: r.title || r.sharepointId || `Row ${r.rowIndex}`,
        errors: r.errors,
      }))
    );
    triggerCsvDownload('aas_import_validation_errors.csv', csv);
  };

  const samplePreviewRows = sheetData?.rows.slice(0, 10) ?? [];

  const duplicateCounts = useMemo(() => {
    return {
      newCount: duplicateItems.filter((i) => i.decision === 'IMPORT_NEW').length,
      updateCount: duplicateItems.filter((i) => i.decision === 'UPDATE_EXISTING')
        .length,
      skipCount: duplicateItems.filter((i) => i.decision === 'SKIP').length,
    };
  }, [duplicateItems]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Smart Excel & CSV Portfolio Import
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Five-step SharePoint & Excel ingestion wizard with local file
            parsing, alias + fuzzy + MockColumnMappingProvider detection,
            template persistence, bilingual normalization, and duplicate review.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadSampleInitiativesWorkbook}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Download Sample SharePoint Export (.xlsx)</span>
        </button>
      </div>

      {/* Local-Only Processing Privacy Banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div>
          <strong className="text-slate-900">
            100% Local Browser Parsing & Transactional Staging:
          </strong>{' '}
          Uploaded XLSX/CSV files are parsed locally in memory via SheetJS and
          validated before committing to IndexedDB. Uploaded file contents are
          never transmitted to external AI services.
        </div>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <div>{uploadError}</div>
        </div>
      )}

      {/* 5-Step Wizard Progress Strip */}
      <nav aria-label="Excel import steps" className="overflow-x-auto">
        <ol className="grid min-w-[540px] grid-cols-5 gap-2">
          {([1, 2, 3, 4, 5] as WizardStep[]).map((s) => {
            const active = step === s;
            const done = step > s;
            const canClick =
              s === 1 ||
              (s <= step && s < 5) ||
              (s === 5 && committedBatch !== null);
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => canClick && setStep(s)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'border-[#004F9F] bg-[#004F9F] text-white'
                      : done
                        ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  }`}
                >
                  {STEP_TITLES[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* STEP 1: Upload */}
      {step === 1 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Step 1: Upload XLSX or CSV File
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Select a SharePoint list export or spreadsheet (.xlsx, .xls, .csv)
              to inspect worksheets, row/column counts, and the first 10 rows.
            </p>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-[#004F9F] hover:bg-blue-50/30">
            <Upload className="h-8 w-8 text-[#004F9F]" aria-hidden="true" />
            <span className="mt-3 text-sm font-semibold text-slate-900">
              Choose Excel (.xlsx / .xls) or CSV file
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Supports SharePoint export fields (English & German): ID, Title,
              Solution Name, Description, Business Problem, Business Area,
              Business Capability, Owner, AI Platform, AI Type, Lifecycle Status,
              Value Category, Users, Minutes Saved, Process Frequency, Created
              Date, Last Modified Date.
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>

          {workbook && sheetData && (
            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-slate-700">
                  <span className="font-semibold text-slate-900">
                    File: {workbook.fileName}
                  </span>
                  <span>Worksheet: {selectedSheet}</span>
                  <span className="tabular-nums">
                    Rows: <strong>{sheetData.rows.length}</strong>
                  </span>
                  <span className="tabular-nums">
                    Columns: <strong>{sheetData.headers.length}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-md bg-[#004F9F] px-3.5 py-1.5 font-medium text-white hover:bg-[#003E7E]"
                >
                  Continue to Column Mapping
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* STEP 2: Column Mapping */}
      {step === 2 && workbook && sheetData && (
        <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 2: Worksheet & Column Mapping
              </h2>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">
                File: <strong className="text-slate-900">{workbook.fileName}</strong>{' '}
                · {sheetData.rows.length} row{sheetData.rows.length === 1 ? '' : 's'} ·{' '}
                {sheetData.headers.length} column{sheetData.headers.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label
                  htmlFor="worksheet-select"
                  className="mr-2 text-xs font-medium text-slate-600"
                >
                  Worksheet:
                </label>
                <select
                  id="worksheet-select"
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                >
                  {workbook.sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={useMockProvider}
                  onChange={(e) => handleToggleMockProvider(e.target.checked)}
                />
                <span>Use MockColumnMappingProvider</span>
              </label>
            </div>
          </div>

          {/* Saved Mapping Templates Bar */}
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label
                  htmlFor="apply-mapping-template"
                  className="block text-[11px] font-semibold text-slate-600"
                >
                  Saved Mapping Templates ({templates.length})
                </label>
                <select
                  id="apply-mapping-template"
                  value={selectedTemplateId}
                  onChange={(e) => handleApplyTemplate(e.target.value)}
                  className="mt-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="">Auto-Detect (Aliases + Fuzzy + Mock)</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedTemplateId && (
                <button
                  type="button"
                  onClick={() => void handleDeleteTemplate(selectedTemplateId)}
                  aria-label="Delete selected mapping template"
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label
                  htmlFor="new-template-name"
                  className="block text-[11px] font-semibold text-slate-600"
                >
                  Save Current Mapping as Template
                </label>
                <input
                  id="new-template-name"
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Monthly SharePoint DE Export"
                  className="mt-1 w-56 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <button
                type="button"
                disabled={savingTemplate}
                onClick={() => void handleSaveTemplate()}
                className="inline-flex items-center gap-1 rounded-md border border-[#004F9F] bg-white px-3 py-1.5 text-xs font-medium text-[#004F9F] hover:bg-blue-50 disabled:opacity-50"
              >
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{savingTemplate ? 'Saving...' : 'Save Template'}</span>
              </button>
            </div>
          </div>

          {/* Duplicate Target Conflict Alert */}
          {mappingConflicts.length > 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-900"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <div>
                  <strong>Duplicate Target Column Conflicts Detected:</strong>{' '}
                  Each AAS registry field may only be mapped once:{' '}
                  {mappingConflicts
                    .map(
                      (c) =>
                        `${INITIATIVE_IMPORT_FIELD_LABELS[c.targetField]} (${c.sourceHeaders.join(', ')})`
                    )
                    .join('; ')}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAutoResolveConflicts}
                className="rounded border border-red-300 bg-white px-2.5 py-1 font-medium text-red-800 hover:bg-red-100 whitespace-nowrap"
              >
                Auto-Exclude Duplicates
              </button>
            </div>
          )}

          {sheetData.rows.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-center text-xs text-amber-900">
              The selected worksheet "{selectedSheet}" has no data rows to
              preview or validate. Select another worksheet or upload a
              different file.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <th className="px-3 py-2.5">Source Spreadsheet Header</th>
                      <th className="px-3 py-2.5">Detection Method</th>
                      <th className="px-3 py-2.5">Confidence</th>
                      <th className="px-3 py-2.5">Target Portfolio Field</th>
                      <th className="px-3 py-2.5">Sample Value (Row 1)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {mappings.map((m) => {
                      const hasConflict = conflictingHeaders.has(m.sourceHeader);
                      return (
                        <tr
                          key={m.sourceHeader}
                          className={
                            hasConflict ? 'bg-red-50/70' : 'hover:bg-slate-50'
                          }
                        >
                          <td className="px-3 py-2.5 font-medium text-slate-900">
                            {m.sourceHeader}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                            {m.method}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-700">
                            {m.confidencePercent > 0
                              ? `${m.confidencePercent}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              aria-label={`Map column ${m.sourceHeader}`}
                              value={m.targetField}
                              onChange={(e) =>
                                handleMappingChange(
                                  m.sourceHeader,
                                  e.target.value as InitiativeImportField
                                )
                              }
                              className={`w-full max-w-xs rounded border bg-white px-2.5 py-1 text-xs text-slate-800 ${
                                hasConflict
                                  ? 'border-red-500 ring-1 ring-red-400'
                                  : 'border-slate-300'
                              }`}
                            >
                              {(
                                Object.keys(
                                  INITIATIVE_IMPORT_FIELD_LABELS
                                ) as InitiativeImportField[]
                              ).map((field) => (
                                <option key={field} value={field}>
                                  {INITIATIVE_IMPORT_FIELD_LABELS[field]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-500">
                            {String(sheetData.rows[0]?.[m.sourceHeader] ?? '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {samplePreviewRows.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Spreadsheet Preview (First {samplePreviewRows.length} of{' '}
                    {sheetData.rows.length} rows)
                  </div>
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          {sheetData.headers.map((h) => (
                            <th key={h} className="px-2.5 py-2 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {samplePreviewRows.map((row, idx) => (
                          <tr key={idx}>
                            {sheetData.headers.map((h) => (
                              <td
                                key={h}
                                className="max-w-[180px] truncate px-2.5 py-1.5 text-slate-700"
                              >
                                {String(row[h] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Change File</span>
            </button>
            <button
              type="button"
              disabled={sheetData.rows.length === 0 || mappingConflicts.length > 0}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
            >
              <span>Validate & Normalize Rows</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Validation & Normalization */}
      {step === 3 && (
        <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 3: Row Validation & Bilingual Field Normalization
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Normalizes English and German lifecycle statuses, decimals (e.g.
                15,5 / 1.250,50), and dates (DD.MM.YYYY / ISO) without ever
                fabricating missing business data.
              </p>
            </div>

            {validationBatch.invalidRows.length > 0 && (
              <button
                type="button"
                onClick={handleExportErrors}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Export {validationBatch.invalidRows.length} Error Row(s) CSV
                </span>
              </button>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800">
            <input
              type="checkbox"
              checked={allowIncompleteRecords}
              onChange={(e) => setAllowIncompleteRecords(e.target.checked)}
            />
            <span>
              <strong>Allow importing incomplete rows</strong> — Flag rows
              missing optional/non-core fields (Problem, Description, Owner,
              Users, Capability) with a <strong>Needs Data Completion</strong>{' '}
              flag without inventing missing text or numbers.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Total Parsed Rows</div>
              <div className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                {validationBatch.allRows.length}
              </div>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3">
              <div className="text-xs text-emerald-800">Valid Ready Rows</div>
              <div className="mt-0.5 text-xl font-bold text-emerald-900 tabular-nums">
                {validationBatch.validRows.length}
              </div>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
              <div className="text-xs text-amber-800">Needs Data Completion</div>
              <div className="mt-0.5 text-xl font-bold text-amber-900 tabular-nums">
                {needsCompletionCount}
              </div>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50/70 p-3">
              <div className="text-xs text-red-800">Rows With Errors</div>
              <div className="mt-0.5 text-xl font-bold text-red-900 tabular-nums">
                {validationBatch.invalidRows.length}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Normalized Stage & Dept</th>
                  <th className="px-3 py-2 text-right">Users / Saved</th>
                  <th className="px-3 py-2">Validation & Completion Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {validationBatch.allRows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={row.isValid ? 'bg-white' : 'bg-red-50/40'}
                  >
                    <td className="px-3 py-2 font-mono text-slate-500 tabular-nums">
                      #{row.rowIndex}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {row.title || '(Missing Title)'}
                      {row.sharepointId && (
                        <div className="font-mono text-[11px] text-slate-500">
                          ID: {row.sharepointId}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {LIFECYCLE_LABELS[row.lifecycleStatus]} ·{' '}
                      {row.departmentName || '(Missing Dept)'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {row.usersCount}u · {row.minutesSavedPerOccurrence}m ·{' '}
                      {row.processFrequencyPerWeek}/wk
                    </td>
                    <td className="px-3 py-2">
                      {row.isValid ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Valid</span>
                            </span>
                            {row.needsDataCompletion && (
                              <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                Needs Data Completion
                              </span>
                            )}
                            {row.isAmbiguousDepartment && (
                              <span className="inline-flex items-center rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                                Ambiguous Dept Name
                              </span>
                            )}
                          </div>
                          {row.warnings && row.warnings.length > 0 && (
                            <div className="text-[11px] text-amber-800">
                              {row.warnings.join(' · ')}
                            </div>
                          )}
                          {row.needsDataCompletion && (
                            <div className="text-[11px] text-amber-800">
                              Missing: {row.missingDataFields.join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <ul className="list-disc pl-4 text-red-700">
                          {row.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Adjust Column Mapping</span>
            </button>
            <button
              type="button"
              disabled={validationBatch.validRows.length === 0}
              onClick={() => void enterDuplicateReview()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
            >
              <span>
                Review {validationBatch.validRows.length} Valid Row(s) for
                Duplicates
              </span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: Duplicate Review & Staging */}
      {step === 4 && (
        <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 4: Duplicate Review & Transactional Staging
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Checks SharePoint Item IDs first and Title + Department second.
                Compare existing vs incoming field values side-by-side before
                committing to IndexedDB.
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs">
              <div className="font-semibold text-slate-800">
                Target Portfolio Dataset
              </div>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void handleTargetDatasetChange('IMPORTED_PORTFOLIO')
                  }
                  className={`rounded px-2.5 py-1 font-medium ${
                    targetDataset === 'IMPORTED_PORTFOLIO'
                      ? 'bg-[#004F9F] text-white'
                      : 'border border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  Imported Data (Isolated, Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => void handleTargetDatasetChange('SAMPLE_DEMO')}
                  className={`rounded px-2.5 py-1 font-medium ${
                    targetDataset === 'SAMPLE_DEMO'
                      ? 'bg-[#004F9F] text-white'
                      : 'border border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  Merge into Sample Demo
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <span className="text-slate-500">Import New:</span>{' '}
              <strong className="tabular-nums text-slate-900">
                {duplicateCounts.newCount}
              </strong>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <span className="text-slate-500">Update Existing:</span>{' '}
              <strong className="tabular-nums text-slate-900">
                {duplicateCounts.updateCount}
              </strong>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <span className="text-slate-500">Skip:</span>{' '}
              <strong className="tabular-nums text-slate-900">
                {duplicateCounts.skipCount}
              </strong>
            </div>
          </div>

          <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {duplicateItems.map((item) => (
              <div key={item.row.rowIndex} className="space-y-3 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      <span>
                        Row #{item.row.rowIndex}: {item.row.title}
                      </span>
                      {item.row.needsDataCompletion && (
                        <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          Needs Data Completion
                        </span>
                      )}
                      {item.row.isAmbiguousDepartment && (
                        <span className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                          Review Dept Mapping
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-slate-500">
                      {item.row.departmentName} ·{' '}
                      {LIFECYCLE_LABELS[item.row.lifecycleStatus]} ·{' '}
                      {item.matchType === 'NONE'
                        ? 'No duplicate detected'
                        : item.matchType === 'SHAREPOINT_ID'
                          ? `Matched existing by SharePoint ID (${item.matchedInitiative?.syncLinkage.itemId ?? item.matchedInitiative?.id})`
                          : `Matched existing by Title + Department`}
                    </div>
                  </div>

                  <select
                    aria-label={`Action for row ${item.row.rowIndex}`}
                    value={item.decision}
                    onChange={(e) =>
                      handleDecisionChange(
                        item.row.rowIndex,
                        e.target.value as DuplicateResolutionAction
                      )
                    }
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                  >
                    {item.matchedInitiative && (
                      <>
                        <option value="SKIP">Skip (Keep Existing)</option>
                        <option value="UPDATE_EXISTING">Update Existing</option>
                      </>
                    )}
                    <option value="IMPORT_NEW">Import as New Initiative</option>
                    {!item.matchedInitiative && (
                      <option value="SKIP">Skip Row</option>
                    )}
                  </select>
                </div>

                {item.matchedInitiative && item.changes.length > 0 && (
                  <div className="overflow-x-auto rounded border border-amber-200 bg-amber-50/40">
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-amber-200 bg-amber-50 text-amber-950">
                          <th className="px-3 py-1.5 font-semibold">Field</th>
                          <th className="px-3 py-1.5 font-semibold">
                            Existing Registry Value
                          </th>
                          <th className="px-3 py-1.5 font-semibold">
                            Incoming Spreadsheet Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-200/70">
                        {item.changes.map((c) => (
                          <tr key={c.field}>
                            <td className="px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">
                              {c.field}
                            </td>
                            <td className="px-3 py-1.5 text-slate-600">
                              {c.oldValue}
                            </td>
                            <td className="px-3 py-1.5 font-medium text-[#004F9F]">
                              {c.newValue}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {item.matchedInitiative && item.changes.length === 0 && (
                  <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    Exact match with existing record — all compared fields are
                    identical. Skip prevents creating a duplicate on re-import.
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to Validation</span>
            </button>
            <button
              type="button"
              disabled={committing}
              onClick={handleCommitBatch}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E] disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {committing
                  ? 'Committing Batch...'
                  : 'Commit Staged Batch to IndexedDB'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* STEP 5: Import Summary */}
      {step === 5 && committedBatch && (
        <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 5: Import Complete ({committedBatch.fileName})
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Committed atomically to IndexedDB dataset{' '}
                <strong>
                  {committedBatch.targetDataset === 'IMPORTED_PORTFOLIO'
                    ? 'Imported Data'
                    : 'Sample Demo Data'}
                </strong>
                . Active workspace switched to{' '}
                <strong>
                  {activeDataset === 'IMPORTED_PORTFOLIO'
                    ? 'Imported Data'
                    : 'Sample Demo Data'}
                </strong>
                .
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">Created</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                {committedBatch.createdCount}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">Updated</div>
              <div className="mt-1 text-2xl font-bold text-[#004F9F] tabular-nums">
                {committedBatch.updatedCount}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">Skipped</div>
              <div className="mt-1 text-2xl font-bold text-slate-600 tabular-nums">
                {committedBatch.skippedCount}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">
                Failed (Validation Errors)
              </div>
              <div className="mt-1 text-2xl font-bold text-red-700 tabular-nums">
                {committedBatch.errorCount}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => navigate({ page: 'explore' })}
              className="rounded-md bg-[#004F9F] px-4 py-2 text-xs font-medium text-white hover:bg-[#003E7E]"
            >
              Explore Portfolio Overview
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: 'gov-overview' })}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              View Executive Dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
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

      {/* Import History */}
      {pastBatches.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <History className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>Recent Import Batches (Active Dataset)</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">File / Sheet</th>
                  <th className="py-2 pr-3">Kind</th>
                  <th className="py-2 pr-3 text-right">Created</th>
                  <th className="py-2 pr-3 text-right">Updated</th>
                  <th className="py-2 pr-3 text-right">Skipped</th>
                  <th className="py-2 pr-3 text-right">Failed</th>
                  <th className="py-2 text-right">Imported At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pastBatches.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {b.fileName} ({b.worksheetName})
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">
                      {b.kind}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.createdCount}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.updatedCount}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.skippedCount}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.errorCount}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">
                      {new Date(b.importedAt).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
