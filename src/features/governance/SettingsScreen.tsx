import React, { useEffect, useState } from 'react';
import {
  Database,
  ImagePlus,
  Plus,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  clearApprovedBrandLogoUrl,
  getApprovedBrandLogoUrl,
  isUsingCustomBrandLogoOverride,
  restoreOfficialBrandLogoUrl,
  saveApprovedBrandLogoUrl,
} from '../../branding/abbottTheme';
import {
  DEFAULT_OPERATIONS_CONFIG,
  getEffectiveOperationsDepartmentIds,
} from '../../domain/operationsReporting';
import { DEFAULT_REDUNDANCY_DEADLINE_CONFIG } from '../../domain/redundancyWorkflow';
import { UserRole } from '../../domain/types';
import { AbbottLogoSlot } from '../../components/AbbottLogoSlot';
import { Modal } from '../../components/Modal';
import { useApp } from '../../services/appContext';

export const SettingsScreen: React.FC = () => {
  const {
    currentUser,
    syncStatus,
    activeDataset,
    switchDataset,
    resetAllDemoData,
    departments,
    operationsConfig,
    updateOperationsConfig,
    redundancyDeadlineConfig,
    updateRedundancyDeadlineConfig,
    bumpDataRevision,
    notify,
    navigate,
  } = useApp();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    getApprovedBrandLogoUrl()
  );
  const [usingCustomOverride, setUsingCustomOverride] = useState(() =>
    isUsingCustomBrandLogoOverride()
  );

  // Operations Scope & Alias Rules editor state
  const [opsDeptIds, setOpsDeptIds] = useState<string[]>(() =>
    getEffectiveOperationsDepartmentIds(departments, operationsConfig)
  );
  const [aliasRules, setAliasRules] = useState(operationsConfig.aliasRules);
  const [newAlias, setNewAlias] = useState('');
  const [newAliasTargetId, setNewAliasTargetId] = useState(
    departments[0]?.id ?? 'dept-eng'
  );
  const [savingOpsConfig, setSavingOpsConfig] = useState(false);

  // Redundancy Deadlines & Holidays state
  const [triageDays, setTriageDays] = useState(
    String(redundancyDeadlineConfig.triageBusinessDays)
  );
  const [alignDays, setAlignDays] = useState(
    String(redundancyDeadlineConfig.ownerAlignmentBusinessDays)
  );
  const [decisionDays, setDecisionDays] = useState(
    String(redundancyDeadlineConfig.decisionBusinessDays)
  );
  const [followUpDays, setFollowUpDays] = useState(
    String(redundancyDeadlineConfig.overdueActionFollowUpBusinessDays)
  );
  const [boardDayOfMonth, setBoardDayOfMonth] = useState(
    String(redundancyDeadlineConfig.boardMeetingDayOfMonth)
  );
  const [holidays, setHolidays] = useState<string[]>(
    redundancyDeadlineConfig.holidays
  );
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [savingDeadlines, setSavingDeadlines] = useState(false);

  useEffect(() => {
    setOpsDeptIds(
      getEffectiveOperationsDepartmentIds(departments, operationsConfig)
    );
    setAliasRules(operationsConfig.aliasRules);
    if (departments.length > 0 && !departments.some((d) => d.id === newAliasTargetId)) {
      setNewAliasTargetId(departments[0].id);
    }
  }, [departments, operationsConfig, newAliasTargetId]);

  useEffect(() => {
    setTriageDays(String(redundancyDeadlineConfig.triageBusinessDays));
    setAlignDays(String(redundancyDeadlineConfig.ownerAlignmentBusinessDays));
    setDecisionDays(String(redundancyDeadlineConfig.decisionBusinessDays));
    setFollowUpDays(
      String(redundancyDeadlineConfig.overdueActionFollowUpBusinessDays)
    );
    setBoardDayOfMonth(String(redundancyDeadlineConfig.boardMeetingDayOfMonth));
    setHolidays(redundancyDeadlineConfig.holidays);
  }, [redundancyDeadlineConfig]);

  const handleAddHoliday = () => {
    const clean = newHolidayDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      notify(
        'error',
        'Valid ISO date required',
        'Enter or select a corporate holiday date (YYYY-MM-DD).'
      );
      return;
    }
    setHolidays((prev) => Array.from(new Set([...prev, clean])).sort());
    setNewHolidayDate('');
  };

  const handleRemoveHoliday = (dateKey: string) => {
    setHolidays((prev) => prev.filter((d) => d !== dateKey));
  };

  const handleSaveDeadlines = async () => {
    setSavingDeadlines(true);
    try {
      await updateRedundancyDeadlineConfig({
        triageBusinessDays: Number(triageDays) || 5,
        ownerAlignmentBusinessDays: Number(alignDays) || 10,
        decisionBusinessDays: Number(decisionDays) || 5,
        overdueActionFollowUpBusinessDays: Number(followUpDays) || 10,
        boardMeetingDayOfMonth: Number(boardDayOfMonth) || 15,
        holidays,
        policyDisclaimer: redundancyDeadlineConfig.policyDisclaimer,
      });
      notify(
        'success',
        'Redundancy deadlines & holidays saved',
        'Updated SLA business-day targets and monthly Board schedule in IndexedDB.'
      );
    } catch (err) {
      notify(
        'error',
        'Unable to save deadlines',
        err instanceof Error ? err.message : 'Save failed.'
      );
    } finally {
      setSavingDeadlines(false);
    }
  };

  const handleResetDeadlines = async () => {
    setSavingDeadlines(true);
    try {
      await updateRedundancyDeadlineConfig(DEFAULT_REDUNDANCY_DEADLINE_CONFIG);
      notify(
        'info',
        'Proposed default deadlines restored',
        'Reset to 5/10/5/10 business days and monthly Board Day 15.'
      );
    } catch (err) {
      notify(
        'error',
        'Unable to restore deadlines',
        err instanceof Error ? err.message : 'Reset failed.'
      );
    } finally {
      setSavingDeadlines(false);
    }
  };

  const handleToggleOpsDept = (deptId: string) => {
    setOpsDeptIds((prev) =>
      prev.includes(deptId)
        ? prev.filter((id) => id !== deptId)
        : [...prev, deptId]
    );
  };

  const handleAddAliasRule = () => {
    const clean = newAlias.trim();
    if (!clean || !newAliasTargetId) {
      notify(
        'error',
        'Alias input required',
        'Enter a source spreadsheet label and select a target department.'
      );
      return;
    }
    const id = `alias-custom-${Date.now()}`;
    setAliasRules((prev) => [
      ...prev,
      { id, alias: clean, targetDepartmentId: newAliasTargetId },
    ]);
    setNewAlias('');
  };

  const handleDeleteAliasRule = (id: string) => {
    setAliasRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveOpsConfig = async () => {
    if (opsDeptIds.length === 0) {
      notify(
        'error',
        'Select at least one department',
        'The Operations reporting group requires at least one department.'
      );
      return;
    }
    setSavingOpsConfig(true);
    try {
      await updateOperationsConfig({
        operationsDepartmentIds: opsDeptIds,
        aliasRules,
      });
      notify(
        'success',
        'Operations reporting configuration saved',
        'Updated priority departments and alias normalization rules in IndexedDB.'
      );
    } catch (err) {
      notify(
        'error',
        'Unable to save configuration',
        err instanceof Error ? err.message : 'Save failed.'
      );
    } finally {
      setSavingOpsConfig(false);
    }
  };

  const handleResetOpsConfig = async () => {
    setSavingOpsConfig(true);
    try {
      await updateOperationsConfig(DEFAULT_OPERATIONS_CONFIG);
      notify(
        'info',
        'Default Operations configuration restored',
        'Reset to Engineering, Procurement, Site Service, and Analytics.'
      );
    } finally {
      setSavingOpsConfig(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('error', 'Invalid brand asset', 'Upload an official SVG or PNG logo file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) return;
      saveApprovedBrandLogoUrl(result);
      setLogoUrl(result);
      setUsingCustomOverride(true);
      await bumpDataRevision();
      notify('success', 'Custom logo override loaded', 'Applied across navigation and Presentation Mode.');
    };
    reader.readAsDataURL(file);
  };

  const handleRestoreOfficialLogo = async () => {
    restoreOfficialBrandLogoUrl();
    const official = getApprovedBrandLogoUrl();
    setLogoUrl(official);
    setUsingCustomOverride(false);
    await bumpDataRevision();
    notify('success', 'Official Abbott logo restored', 'Default approved corporate logo active.');
  };

  const handleClearLogo = async () => {
    clearApprovedBrandLogoUrl();
    setLogoUrl(null);
    setUsingCustomOverride(true);
    await bumpDataRevision();
    notify('info', 'Logo placeholder enabled', 'Showing explicit logo placeholder.');
  };

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      await resetAllDemoData();
      setConfirmOpen(false);
    } finally {
      setResetting(false);
    }
  };

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Platform Settings, Operations Scope & Demo Data (IndexedDB)
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure the Operations priority department group, Excel department
            alias rules, Abbott corporate logo asset, and isolated IndexedDB
            workspaces.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ page: 'gov-diagnostics' })}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Optional SharePoint & Entra Diagnostics</span>
        </button>
      </div>

      {/* Operations Priority Scope & Department Alias Rules */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Operations Reporting Scope & Department Alias Rules
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-600">
              Governance analytics and dashboards automatically evaluate all
              departments present in the active dataset, prioritizing the
              configured Operations group first (Engineering, Procurement, Site
              Service, Analytics) followed by any additional imported
              departments.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={savingOpsConfig}
              onClick={() => void handleResetOpsConfig()}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Restore Defaults
            </button>
            <button
              type="button"
              disabled={savingOpsConfig}
              onClick={() => void handleSaveOpsConfig()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#003D7A] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{savingOpsConfig ? 'Saving...' : 'Save Scope & Aliases'}</span>
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-800">
            Departments Prioritized First as Operations Group
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {departments.map((d) => {
              const checked = opsDeptIds.includes(d.id);
              return (
                <label
                  key={d.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                    checked
                      ? 'border-[#004F9F] bg-[#EBF3FB]/60 text-slate-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleOpsDept(d.id)}
                  />
                  <span className="truncate font-medium">{d.name}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-500">
                    {d.code}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div>
            <div className="text-xs font-semibold text-slate-800">
              Excel Import Department Alias Normalization Rules ({aliasRules.length})
            </div>
            <p className="text-[11px] text-slate-500">
              Normalized aliases map spreadsheet department labels cleanly during
              Smart Excel Import. Ambiguous labels are flagged instead of
              auto-guessed.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor="alias-source-input"
                className="block text-[11px] font-medium text-slate-600"
              >
                Spreadsheet Department Alias
              </label>
              <input
                id="alias-source-input"
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="e.g. Global Sourcing"
                className="mt-1 w-52 rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="alias-target-select"
                className="block text-[11px] font-medium text-slate-600"
              >
                Maps To Target Department
              </label>
              <select
                id="alias-target-select"
                value={newAliasTargetId}
                onChange={(e) => setNewAliasTargetId(e.target.value)}
                className="mt-1 w-52 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddAliasRule}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Alias Rule</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {aliasRules.map((rule) => (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-800"
              >
                <span className="font-mono text-slate-600">
                  &ldquo;{rule.alias}&rdquo;
                </span>
                <span className="text-slate-400">→</span>
                <strong className="text-[#004F9F]">
                  {deptName(rule.targetDepartmentId)}
                </strong>
                <button
                  type="button"
                  onClick={() => handleDeleteAliasRule(rule.id)}
                  aria-label={`Remove alias rule ${rule.alias}`}
                  className="ml-1 text-slate-400 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Redundancy Review Deadlines, Holidays & Monthly Board Schedule */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Redundancy Review Deadlines, Corporate Holidays &amp; Monthly Board Schedule
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-600">
              Configure business-day SLAs (weekends &amp; listed holidays excluded)
              for Redundancy &amp; Synergies triage, owner alignment, decisions,
              overdue follow-up, and monthly AI Governance Board escalation dates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={savingDeadlines || currentUser.role !== UserRole.GOVERNANCE}
              onClick={() => void handleResetDeadlines()}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Restore Proposed Defaults
            </button>
            <button
              type="button"
              disabled={savingDeadlines || currentUser.role !== UserRole.GOVERNANCE}
              onClick={() => void handleSaveDeadlines()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#004F9F] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#003D7A] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {savingDeadlines ? 'Saving...' : 'Save Deadlines & Holidays'}
              </span>
            </button>
          </div>
        </div>

        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <strong>Proposed default review deadlines (not existing corporate policy):</strong>{' '}
          Defaults are 5 business days (Triage), 10 business days (Owner
          Alignment), 5 additional business days (Decision), 10 business days
          (Overdue Action Follow-Up Review), and Day 15 monthly AI Governance Board.
          {currentUser.role !== UserRole.GOVERNANCE &&
            ' Switch to Demo AI Portfolio Manager in the top header to edit and save.'}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 text-xs">
          <div>
            <label
              htmlFor="deadline-triage-bd"
              className="block font-medium text-slate-700"
            >
              Triage (Business Days)
            </label>
            <input
              id="deadline-triage-bd"
              type="number"
              min={1}
              max={60}
              value={triageDays}
              onChange={(e) => setTriageDays(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="deadline-align-bd"
              className="block font-medium text-slate-700"
            >
              Owner Alignment (bd)
            </label>
            <input
              id="deadline-align-bd"
              type="number"
              min={1}
              max={60}
              value={alignDays}
              onChange={(e) => setAlignDays(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="deadline-decision-bd"
              className="block font-medium text-slate-700"
            >
              Decision (Additional bd)
            </label>
            <input
              id="deadline-decision-bd"
              type="number"
              min={1}
              max={60}
              value={decisionDays}
              onChange={(e) => setDecisionDays(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="deadline-followup-bd"
              className="block font-medium text-slate-700"
            >
              Overdue Follow-Up (bd)
            </label>
            <input
              id="deadline-followup-bd"
              type="number"
              min={1}
              max={60}
              value={followUpDays}
              onChange={(e) => setFollowUpDays(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="deadline-board-day"
              className="block font-medium text-slate-700"
            >
              Monthly Board Day (1–28)
            </label>
            <input
              id="deadline-board-day"
              type="number"
              min={1}
              max={28}
              value={boardDayOfMonth}
              onChange={(e) => setBoardDayOfMonth(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-3 text-xs">
          <div className="font-semibold text-slate-800">
            Corporate Holidays Excluded from Business-Day Calculations (
            {holidays.length})
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor="holiday-date-input"
                className="block text-[11px] font-medium text-slate-600"
              >
                Add Holiday Date (YYYY-MM-DD)
              </label>
              <input
                id="holiday-date-input"
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="mt-1 rounded border border-slate-300 px-2.5 py-1.5 text-slate-900 tabular-nums"
              />
            </div>
            <button
              type="button"
              onClick={handleAddHoliday}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Holiday</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {holidays.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-800 tabular-nums"
              >
                <span>{h}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveHoliday(h)}
                  aria-label={`Remove holiday ${h}`}
                  className="text-slate-400 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Dataset Isolation Switcher */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Workspace Dataset Isolation (Demo vs Imported Data)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Keep preloaded synthetic demo records strictly separate from real
            imported spreadsheets unless you explicitly choose to merge during
            import.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void switchDataset('SAMPLE_DEMO')}
            className={`rounded-lg border p-4 text-left transition-colors ${
              activeDataset === 'SAMPLE_DEMO'
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="text-xs font-bold text-slate-900">
              Sample Demo Data{' '}
              {activeDataset === 'SAMPLE_DEMO' ? '(Active)' : ''}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Preloaded multi-department enterprise portfolio with Operations
              priority units (Engineering, Procurement, Site Service, Analytics),
              financial benefits, monthly AI costs, and synergy candidates.
            </p>
          </button>
          <button
            type="button"
            onClick={() => void switchDataset('IMPORTED_PORTFOLIO')}
            className={`rounded-lg border p-4 text-left transition-colors ${
              activeDataset === 'IMPORTED_PORTFOLIO'
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="text-xs font-bold text-slate-900">
              Imported Portfolio Data{' '}
              {activeDataset === 'IMPORTED_PORTFOLIO' ? '(Active)' : ''}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Clean workspace containing only your Excel/CSV imports and user
              registrations — zero synthetic demo records mixed in.
            </p>
          </button>
        </div>
      </section>

      {/* Abbott Corporate Identity & Official Asset Slot */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Abbott Corporate Identity & Official Logo Asset
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-600">
              The approved official Abbott corporate logo is configured as the
              default brand asset across navigation, dashboards, and all 16:9
              Presentation Mode headers. You may optionally upload a local SVG or
              PNG override or restore the official default.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#004F9F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#003D7A]">
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Upload Logo Override</span>
              <input
                type="file"
                accept=".svg,.png,image/svg+xml,image/png"
                onChange={handleLogoUpload}
                className="sr-only"
              />
            </label>
            {usingCustomOverride && (
              <button
                type="button"
                onClick={() => void handleRestoreOfficialLogo()}
                className="inline-flex items-center gap-1 rounded-md border border-[#BFD7EE] bg-[#EBF3FB] px-2.5 py-1.5 text-xs font-medium text-[#004F9F] hover:bg-[#DCEAF9]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Restore Official Logo</span>
              </button>
            )}
            {logoUrl && (
              <button
                type="button"
                onClick={() => void handleClearLogo()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Hide Logo</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3">
          <span className="text-xs text-slate-600">
            Current Brand Header Preview (
            {usingCustomOverride
              ? logoUrl
                ? 'Custom Override Active'
                : 'Placeholder Active'
              : 'Official Abbott Default Active'}
            ):
          </span>
          <AbbottLogoSlot variant="header" logoUrlOverride={logoUrl} />
        </div>
      </section>

      {/* Local Demo Storage Status */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database className="h-4 w-4 text-slate-700" aria-hidden="true" />
              <span>Active Repository Status</span>
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-600">
              {syncStatus?.disclaimer ??
                'Single-browser IndexedDB persistence is active for demonstration only. It does not provide multi-user synchronization or enterprise security.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Demo Data</span>
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Storage Mode</dt>
            <dd className="mt-0.5 font-mono font-medium text-slate-900">
              {syncStatus?.mode ?? 'LOCAL_INDEXEDDB_DEMO'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Storage / List Key</dt>
            <dd className="mt-0.5 font-mono text-slate-800">
              {syncStatus?.storageKey ?? 'aas_ai_governance_idb_v1'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Last Store Read / Write</dt>
            <dd className="mt-0.5 font-mono text-slate-800 tabular-nums">
              {syncStatus?.lastUpdatedAt
                ? new Date(syncStatus.lastUpdatedAt).toLocaleString('en-US')
                : 'Seed baseline'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Microsoft 365 SharePoint & Entra Architecture */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Server className="h-4 w-4 text-slate-700" aria-hidden="true" />
          <span>Microsoft 365 SharePoint Lists & Entra ID Integration</span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          SharePoint Lists serves as the primary target persistent data store
          via Microsoft Graph, authenticated with Microsoft Entra ID (MSAL).
          Writes remain disabled until column mappings and permissions are
          verified against the live tenant.
        </p>

        <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 text-xs">
          <div className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
            <div>
              <div className="font-semibold text-slate-900">
                SharePointInitiativeRepository (Microsoft Graph v1.0)
              </div>
              <div className="text-slate-600">
                Read-only Graph access to AI Registry, Lifecycle History, Usage
                Tracking, and future Financial Data lists with pagination and
                configurable column mappings.
              </div>
            </div>
            <span className="font-mono text-slate-700 whitespace-nowrap shrink-0">
              Read-Only Ready · Writes Disabled
            </span>
          </div>
          <div className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
            <div>
              <div className="font-semibold text-slate-900">
                MsalAuthService (EntraAuthProvider)
              </div>
              <div className="text-slate-600">
                Configurable Microsoft Entra ID SPA login/logout and token
                acquisition via MSAL popup flows (no hardcoded credentials).
              </div>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-slate-700 whitespace-nowrap shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Configurable · Tenant Test Required</span>
            </span>
          </div>
          <div className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
            <div>
              <div className="font-semibold text-slate-900">
                Server-Side Authorization & SharePoint Permissions
              </div>
              <div className="text-slate-600">
                Employees read all initiatives and edit only their own. Client
                checks are UI-only; server-side RBAC or SharePoint item-level
                permissions are required before enabling writes.
              </div>
            </div>
            <span className="font-mono text-slate-500 whitespace-nowrap shrink-0">
              Required Before Writes
            </span>
          </div>
        </div>
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reset Demo Data to Baseline?"
        description="This clears all initiatives, lifecycle transitions, reviews, and intake drafts stored in this browser and restores the initial synthetic seed dataset."
      >
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={resetting}
            onClick={handleConfirmReset}
            className="rounded-md bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {resetting ? 'Resetting...' : 'Confirm Reset'}
          </button>
        </div>
      </Modal>
    </div>
  );
};
