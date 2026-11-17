import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { calculateEfficiencyMetrics } from '../../domain/calculations';
import { AppRepositoryError } from '../../domain/errors';
import { evaluateRegistryScope } from '../../domain/registryScope';
import {
  AI_PLATFORMS,
  AI_TYPES,
  CATEGORY_LABELS,
  InitiativeDraft,
  LIFECYCLE_LABELS,
  LifecycleStatus,
  RegistrableCategory,
  ScopeClarificationAnswers,
  ScopeDecision,
  SimilarityMatch,
  SOLUTION_TYPES,
  VALUE_CATEGORY_DESCRIPTIONS,
  VALUE_CATEGORY_LABELS,
  ValueCategory,
} from '../../domain/types';
import {
  validateInitiativeDetails,
  validateUsageAndValue,
} from '../../domain/validation';
import { LifecycleStatusBadge } from '../../components/StatusBadge';
import { MockAiSuggestion } from '../../services/aiProvider';
import { useApp } from '../../services/appContext';

const STEP_LABELS = [
  '1. Describe Idea',
  '2. Registry Scope',
  '3. Similarity Preview',
  '4. Initiative Details',
  '5. Usage & Value',
  '6. Review & Save',
];

function createEmptyDraft(defaultDeptId: string, defaultOwnerId: string): InitiativeDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    step: 1,
    ideaText: '',
    departmentId: defaultDeptId,
    clarificationAnswers: {},
    title: '',
    businessProblem: '',
    description: '',
    businessCapability: '',
    ownerId: defaultOwnerId,
    aiPlatform: AI_PLATFORMS[0],
    solutionType: SOLUTION_TYPES[0],
    aiType: AI_TYPES[0],
    category: '',
    lifecycleStatus: LifecycleStatus.IDEA,
    valueCategory: ValueCategory.EFFICIENCY,
    usersCount: '',
    minutesSavedPerOccurrence: '',
    processFrequencyPerWeek: '',
    hourlyRate: '',
    ideaDate: today,
    goLiveDate: '',
    savedAt: new Date().toISOString(),
  };
}

export const SmartIntakeWizard: React.FC = () => {
  const {
    repository,
    aiProvider,
    currentUser,
    departments,
    users,
    navigate,
    bumpDataRevision,
    notify,
  } = useApp();

  const [draft, setDraft] = useState<InitiativeDraft>(() => {
    const existing = repository.getDraft();
    if (existing) return existing;
    return createEmptyDraft(
      currentUser.departmentId || departments[0]?.id || 'dept-eng',
      currentUser.id
    );
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mockSuggestion, setMockSuggestion] = useState<MockAiSuggestion | null>(
    null
  );
  const [similarityMatches, setSimilarityMatches] = useState<SimilarityMatch[]>(
    []
  );
  const [loadingSimilarity, setLoadingSimilarity] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(() =>
    Boolean(repository.getDraft())
  );

  // Persist draft automatically on every change so navigating back/away preserves work
  useEffect(() => {
    repository.saveDraft({
      ...draft,
      savedAt: new Date().toISOString(),
    });
  }, [draft, repository]);

  const scopeResult = useMemo(
    () =>
      evaluateRegistryScope({
        ideaText: draft.ideaText,
        departmentId: draft.departmentId,
        clarifications: draft.clarificationAnswers,
      }),
    [draft.ideaText, draft.departmentId, draft.clarificationAnswers]
  );

  // Load similarity preview when entering Step 3
  useEffect(() => {
    if (draft.step !== 3) return;
    let active = true;
    async function runSimilarity() {
      setLoadingSimilarity(true);
      try {
        const matches = await aiProvider.findSimilarInitiatives({
          queryText: `${draft.title} ${draft.ideaText} ${draft.description}`,
          departmentId: draft.departmentId,
          businessCapability: draft.businessCapability,
        });
        if (active) setSimilarityMatches(matches);
      } finally {
        if (active) setLoadingSimilarity(false);
      }
    }
    void runSimilarity();
    return () => {
      active = false;
    };
  }, [
    draft.step,
    draft.ideaText,
    draft.title,
    draft.description,
    draft.departmentId,
    draft.businessCapability,
    aiProvider,
  ]);

  const updateDraft = (patch: Partial<InitiativeDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const updateClarification = (
    key: keyof ScopeClarificationAnswers,
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      clarificationAnswers: {
        ...prev.clarificationAnswers,
        [key]: value,
      },
    }));
  };

  const handleSaveDraftClick = () => {
    repository.saveDraft({
      ...draft,
      savedAt: new Date().toISOString(),
    });
    notify(
      'info',
      'Draft saved locally',
      'Your intake progress is saved in local demo storage.'
    );
  };

  const handleDiscardDraft = () => {
    repository.clearDraft();
    setRestoredNotice(false);
    setMockSuggestion(null);
    setFieldErrors({});
    setDraft(
      createEmptyDraft(
        currentUser.departmentId || departments[0]?.id || 'dept-eng',
        currentUser.id
      )
    );
    notify('info', 'Draft cleared', 'Started a fresh Smart Intake form.');
  };

  const handleGenerateMockAiSuggestion = () => {
    const suggestion = aiProvider.suggestMetadataFromDescription(
      draft.ideaText,
      scopeResult.suggestedCategory
    );
    setMockSuggestion(suggestion);
  };

  const handleApplyMockAiSuggestion = () => {
    if (!mockSuggestion) return;
    updateDraft({
      title: draft.title || mockSuggestion.suggestedTitle,
      businessProblem:
        draft.businessProblem || draft.ideaText.trim(),
      description: draft.description || draft.ideaText.trim(),
      businessCapability:
        draft.businessCapability || mockSuggestion.suggestedCapability,
      category: draft.category || mockSuggestion.suggestedCategory,
      aiPlatform: mockSuggestion.suggestedPlatform,
      solutionType: mockSuggestion.suggestedSolutionType,
      aiType: mockSuggestion.suggestedAiType,
      valueCategory: mockSuggestion.suggestedValueCategory,
    });
    notify(
      'info',
      'Demo suggestion applied',
      'Review and verify all pre-filled fields in Step 4 & Step 5.'
    );
  };

  const goToStep = (nextStep: number) => {
    setFieldErrors({});

    if (nextStep > draft.step) {
      if (draft.step === 1) {
        const errs: Record<string, string> = {};
        if (draft.ideaText.trim().length < 10) {
          errs.ideaText =
            'Describe the AI idea in at least 10 characters so scope rules can evaluate it.';
        }
        if (!draft.departmentId) {
          errs.departmentId = 'Select a business area / department.';
        }
        if (Object.keys(errs).length > 0) {
          setFieldErrors(errs);
          return;
        }
      }

      if (draft.step === 2) {
        if (scopeResult.decision !== ScopeDecision.REGISTER) {
          setFieldErrors({
            scope:
              scopeResult.decision === ScopeDecision.NOT_REQUIRED
                ? 'Excluded personal, learning, or one-time uses should not be registered. Adjust your description or clarification answers if this is a shared operational solution.'
                : 'Answer all clarifying questions above so the scope decision can resolve to Register.',
          });
          return;
        }
        // Pre-populate reasonable starting values when advancing past scope check
        updateDraft({
          step: nextStep,
          category: draft.category || scopeResult.suggestedCategory || RegistrableCategory.AI_SOLUTION,
          businessProblem: draft.businessProblem || draft.ideaText.trim(),
          description: draft.description || draft.ideaText.trim(),
        });
        return;
      }

      if (draft.step === 4) {
        const errors = validateInitiativeDetails({
          ...draft,
        });
        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors);
          return;
        }
      }

      if (draft.step === 5) {
        const errors = validateUsageAndValue({
          ...draft,
        });
        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors);
          return;
        }
      }
    }

    updateDraft({ step: nextStep });
  };

  const handleSubmitInitiative = async () => {
    const detailsErrors = validateInitiativeDetails(draft);
    const usageErrors = validateUsageAndValue(draft);
    const allErrors = { ...detailsErrors, ...usageErrors };
    if (Object.keys(allErrors).length > 0) {
      setFieldErrors(allErrors);
      notify(
        'error',
        'Validation errors remain',
        'Return to Steps 4 or 5 to resolve missing or invalid fields.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await repository.createInitiative(
        {
          title: draft.title,
          businessProblem: draft.businessProblem,
          description: draft.description,
          businessCapability: draft.businessCapability,
          departmentId: draft.departmentId,
          ownerId: draft.ownerId,
          aiPlatform: draft.aiPlatform,
          solutionType: draft.solutionType,
          aiType: draft.aiType,
          category: draft.category as RegistrableCategory,
          lifecycleStatus: draft.lifecycleStatus,
          valueCategory: draft.valueCategory,
          usersCount: Number(draft.usersCount),
          minutesSavedPerOccurrence: Number(draft.minutesSavedPerOccurrence),
          processFrequencyPerWeek: Number(draft.processFrequencyPerWeek),
          hourlyRate:
            draft.hourlyRate.trim() !== ''
              ? Number(draft.hourlyRate)
              : undefined,
          ideaDate: draft.ideaDate,
          goLiveDate: draft.goLiveDate || undefined,
        },
        currentUser
      );

      repository.clearDraft();
      await bumpDataRevision();
      notify(
        'success',
        'AI Initiative Registered',
        `"${created.title}" is now visible in the enterprise portfolio.`
      );
      navigate({ page: 'detail', initiativeId: created.id });
    } catch (err) {
      if (err instanceof AppRepositoryError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
      notify(
        'error',
        'Registration failed',
        err instanceof Error ? err.message : 'Unable to save initiative'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;
  const userName = (id: string) =>
    users.find((u) => u.id === id)?.displayName ?? id;

  const liveEfficiencyPreview = calculateEfficiencyMetrics(
    draft.valueCategory,
    Number(draft.usersCount || 0),
    Number(draft.minutesSavedPerOccurrence || 0),
    Number(draft.processFrequencyPerWeek || 0),
    draft.hourlyRate.trim() !== '' ? Number(draft.hourlyRate) : undefined
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Register AI Initiative
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Guided intake with deterministic registry scoping, local similarity
            preview, and mandatory usage sizing.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSaveDraftClick}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Save Draft</span>
          </button>
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear Draft</span>
          </button>
        </div>
      </div>

      {restoredNotice && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700">
          <span>
            Restored your in-progress draft from local demo storage. Navigating
            between steps preserves all entries.
          </span>
          <button
            type="button"
            onClick={() => setRestoredNotice(false)}
            className="font-medium text-slate-500 hover:text-slate-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 6-Step Progress Strip */}
      <nav aria-label="Smart intake steps" className="overflow-x-auto">
        <ol className="grid min-w-[640px] grid-cols-6 gap-2">
          {STEP_LABELS.map((label, idx) => {
            const stepNum = idx + 1;
            const isActive = draft.step === stepNum;
            const isCompleted = draft.step > stepNum;
            const canJump = stepNum <= draft.step;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!canJump}
                  onClick={() => canJump && goToStep(stepNum)}
                  className={`w-full rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap truncate ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : isCompleted
                        ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  }`}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step Panels */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        {/* STEP 1: Describe Idea */}
        {draft.step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 1: Describe Your AI Idea & Business Area
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Describe what problem you want to solve, who uses it, and how
                often the process runs. Deterministic rules in Step 2 will check
                whether it belongs in the enterprise AI registry.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="intake-dept"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Business Area / Department *
                </label>
                <select
                  id="intake-dept"
                  value={draft.departmentId}
                  onChange={(e) =>
                    updateDraft({ departmentId: e.target.value })
                  }
                  className="mt-1 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  <option value="">Select department...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                {fieldErrors.departmentId && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.departmentId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="intake-idea-text"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Natural Language Description *
                </label>
                <textarea
                  id="intake-idea-text"
                  rows={4}
                  value={draft.ideaText}
                  onChange={(e) => {
                    updateDraft({
                      ideaText: e.target.value,
                      clarificationAnswers: {},
                    });
                    setFieldErrors({});
                  }}
                  placeholder="Example: Automate vendor invoice PDF extraction in Finance using Power Automate AI Builder for 18 clerks weekly..."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.ideaText && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.ideaText}
                  </p>
                )}
              </div>

              {/* Helpful Quick Test Scenarios for evaluators */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">
                  Sample Descriptions (Optional Quick Fill)
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft({
                        ideaText:
                          'Power Automate workflow with Azure AI Document Intelligence to extract vendor invoice exceptions for the finance team weekly.',
                        clarificationAnswers: {},
                      })
                    }
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Enterprise Workflow (Registers)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft({
                        ideaText: 'AI helper for customer emails',
                        clarificationAnswers: {},
                      })
                    }
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Ambiguous Case (Triggers Clarification)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft({
                        ideaText:
                          'Summarize my personal notes for a Python course tutorial exercise',
                        clarificationAnswers: {},
                      })
                    }
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Personal / Learning (Excluded)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <span>Evaluate Registry Scope</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Registry Scope Check */}
        {draft.step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 2: Deterministic Registry Scope Check
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Deterministic rules evaluate your description first before any
                demo AI suggestion. {scopeResult.governanceNote}
              </p>
            </div>

            {/* Scope Decision Result Panel */}
            <div
              className={`rounded-lg border p-4 ${
                scopeResult.decision === ScopeDecision.REGISTER
                  ? 'border-emerald-300 bg-emerald-50/70'
                  : scopeResult.decision === ScopeDecision.NOT_REQUIRED
                    ? 'border-red-300 bg-red-50/70'
                    : 'border-amber-300 bg-amber-50/70'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {scopeResult.decision === ScopeDecision.REGISTER ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                ) : scopeResult.decision === ScopeDecision.NOT_REQUIRED ? (
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                ) : (
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                )}
                <div className="space-y-1.5">
                  <div className="text-sm font-bold text-slate-900">
                    Decision:{' '}
                    {scopeResult.decision === ScopeDecision.REGISTER
                      ? 'REGISTER IN PORTFOLIO'
                      : scopeResult.decision === ScopeDecision.NOT_REQUIRED
                        ? 'REGISTRATION NOT REQUIRED (EXCLUDED USE)'
                        : 'NEEDS CLARIFICATION'}
                  </div>
                  {scopeResult.suggestedCategory && (
                    <div className="text-xs font-medium text-slate-800">
                      Recommended Registrable Category:{' '}
                      <strong>
                        {CATEGORY_LABELS[scopeResult.suggestedCategory]}
                      </strong>
                    </div>
                  )}
                  <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
                    {scopeResult.reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Clarification Questions when NEEDS_CLARIFICATION */}
            {scopeResult.clarificationQuestions.length > 0 && (
              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-900">
                  Clarification Questions Required by Scope Rules
                </div>
                {scopeResult.clarificationQuestions.map((q) => (
                  <fieldset key={q.id} className="space-y-2">
                    <legend className="text-xs font-medium text-slate-800">
                      {q.prompt}
                    </legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt) => {
                        const selected =
                          draft.clarificationAnswers[q.id] === opt.value;
                        return (
                          <label
                            key={opt.value}
                            className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-xs transition-colors ${
                              selected
                                ? 'border-slate-900 bg-white font-medium text-slate-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`clarify-${q.id}`}
                              value={opt.value}
                              checked={selected}
                              onChange={() =>
                                updateClarification(q.id, opt.value)
                              }
                              className="mt-0.5"
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}

            {/* Reset clarification answers link if answered */}
            {Object.keys(draft.clarificationAnswers).length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => updateDraft({ clarificationAnswers: {} })}
                  className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
                >
                  Reset clarification answers
                </button>
              </div>
            )}

            {/* Optional Deterministic Mock AI Suggestion */}
            {scopeResult.decision === ScopeDecision.REGISTER && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Optional Demo Metadata Assistant (MockAiProvider)
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Generates deterministic field suggestions locally. No
                      external AI provider is called.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateMockAiSuggestion}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Preview Demo Suggestion</span>
                  </button>
                </div>

                {mockSuggestion && (
                  <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs">
                    <div className="font-semibold text-amber-800">
                      Demo Output — Deterministic Mock AI (Not Live AI)
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {mockSuggestion.disclaimer}
                    </p>
                    <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-slate-500">Suggested Title</dt>
                        <dd className="font-medium text-slate-900">
                          {mockSuggestion.suggestedTitle}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Suggested Capability</dt>
                        <dd className="font-medium text-slate-900">
                          {mockSuggestion.suggestedCapability}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Platform / AI Type</dt>
                        <dd className="font-medium text-slate-900">
                          {mockSuggestion.suggestedPlatform} ·{' '}
                          {mockSuggestion.suggestedAiType}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Value Category</dt>
                        <dd className="font-medium text-slate-900">
                          {
                            VALUE_CATEGORY_LABELS[
                              mockSuggestion.suggestedValueCategory
                            ]
                          }
                        </dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={handleApplyMockAiSuggestion}
                      className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      Apply Demo Suggestions to Draft
                    </button>
                  </div>
                )}
              </div>
            )}

            {fieldErrors.scope && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{fieldErrors.scope}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Back to Idea</span>
              </button>

              {scopeResult.decision === ScopeDecision.NOT_REQUIRED ? (
                <button
                  type="button"
                  onClick={() => navigate({ page: 'home' })}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  Exit Without Registering
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <span>Continue to Similarity Preview</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Similarity Preview */}
        {draft.step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 3: Portfolio Similarity Preview
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Check whether similar initiatives already exist across
                departments before entering full registration details.
              </p>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <strong>Demo Similarity Preview:</strong> Computed locally via
              deterministic keyword & capability overlap against seeded/demo
              repository initiatives only. No external AI service or Microsoft
              Graph endpoint is called.
            </div>

            {loadingSimilarity ? (
              <div className="py-6 text-xs text-slate-500">
                Scanning local portfolio records...
              </div>
            ) : similarityMatches.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-5 text-center">
                <div className="text-sm font-semibold text-slate-900">
                  No close keyword overlaps detected in local demo inventory
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  You can proceed to register the initiative details.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                {similarityMatches.map((match) => (
                  <div
                    key={match.initiative.id}
                    className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {match.initiative.title}
                        </span>
                        <LifecycleStatusBadge
                          status={match.initiative.lifecycleStatus}
                        />
                      </div>
                      <p className="text-xs text-slate-600">
                        {match.initiative.businessProblem}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>{deptName(match.initiative.departmentId)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Matched terms:{' '}
                          {match.matchedTerms.join(', ') || 'department match'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          Demo overlap index: {match.score}%
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          page: 'detail',
                          initiativeId: match.initiative.id,
                        })
                      }
                      className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Inspect Existing
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Back to Scope</span>
              </button>
              <button
                type="button"
                onClick={() => goToStep(4)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <span>Proceed to Initiative Details</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Initiative Details */}
        {draft.step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 4: Initiative Details, Ownership & Classification
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Complete the core portfolio profile. All required fields are
                validated before advancing.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label
                  htmlFor="step4-title"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Initiative Title *
                </label>
                <input
                  id="step4-title"
                  type="text"
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  placeholder="e.g., AP Invoice Exception Triage Automation"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.title && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.title}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="step4-problem"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Business Problem *
                </label>
                <textarea
                  id="step4-problem"
                  rows={2}
                  value={draft.businessProblem}
                  onChange={(e) =>
                    updateDraft({ businessProblem: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.businessProblem && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.businessProblem}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="step4-description"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Solution Description *
                </label>
                <textarea
                  id="step4-description"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => updateDraft({ description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.description && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.description}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step4-capability"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Business Capability *
                </label>
                <input
                  id="step4-capability"
                  type="text"
                  value={draft.businessCapability}
                  onChange={(e) =>
                    updateDraft({ businessCapability: e.target.value })
                  }
                  placeholder="e.g., Accounts Payable & Reconciliation"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.businessCapability && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.businessCapability}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step4-department"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Business Area / Department *
                </label>
                <select
                  id="step4-department"
                  value={draft.departmentId}
                  onChange={(e) =>
                    updateDraft({ departmentId: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.departmentId && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.departmentId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step4-owner"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Accountable Owner *
                </label>
                <select
                  id="step4-owner"
                  value={draft.ownerId}
                  onChange={(e) => updateDraft({ ownerId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {users
                    .filter((u) => u.role !== 'ADMIN')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} ({u.role})
                      </option>
                    ))}
                </select>
                {fieldErrors.ownerId && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.ownerId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step4-category"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Registrable AI Category *
                </label>
                <select
                  id="step4-category"
                  value={draft.category}
                  onChange={(e) =>
                    updateDraft({
                      category: e.target.value as RegistrableCategory,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  <option value="">Select category...</option>
                  {Object.values(RegistrableCategory).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                {fieldErrors.category && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.category}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step4-platform"
                  className="block text-xs font-semibold text-slate-700"
                >
                  AI Platform *
                </label>
                <select
                  id="step4-platform"
                  value={draft.aiPlatform}
                  onChange={(e) => updateDraft({ aiPlatform: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {AI_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="step4-solution-type"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Solution Type *
                </label>
                <select
                  id="step4-solution-type"
                  value={draft.solutionType}
                  onChange={(e) =>
                    updateDraft({ solutionType: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {SOLUTION_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="step4-ai-type"
                  className="block text-xs font-semibold text-slate-700"
                >
                  AI Type *
                </label>
                <select
                  id="step4-ai-type"
                  value={draft.aiType}
                  onChange={(e) => updateDraft({ aiType: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {AI_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="step4-lifecycle"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Initial Lifecycle Status *
                </label>
                <select
                  id="step4-lifecycle"
                  value={draft.lifecycleStatus}
                  onChange={(e) =>
                    updateDraft({
                      lifecycleStatus: e.target.value as LifecycleStatus,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  {Object.values(LifecycleStatus).map((s) => (
                    <option key={s} value={s}>
                      {LIFECYCLE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="step4-idea-date"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Idea Date *
                </label>
                <input
                  id="step4-idea-date"
                  type="date"
                  value={draft.ideaDate}
                  onChange={(e) => updateDraft({ ideaDate: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.ideaDate && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.ideaDate}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step4-golive-date"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Target / Actual Go-Live Date (optional)
                </label>
                <input
                  id="step4-golive-date"
                  type="date"
                  value={draft.goLiveDate}
                  onChange={(e) => updateDraft({ goLiveDate: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Back to Similarity</span>
              </button>
              <button
                type="button"
                onClick={() => goToStep(5)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <span>Continue to Usage & Value</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Usage & Value */}
        {draft.step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 5: Usage Sizing & Value Classification
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Select exactly one primary value category. All three usage
                inputs are mandatory for every registered initiative, including
                Quality Improvements and Strategic Benefits.
              </p>
            </div>

            {/* Single-select Value Category */}
            <fieldset className="space-y-2.5">
              <legend className="text-xs font-semibold text-slate-700">
                Primary Value Category (Choose One) *
              </legend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {Object.values(ValueCategory).map((vc) => {
                  const selected = draft.valueCategory === vc;
                  return (
                    <label
                      key={vc}
                      className={`flex cursor-pointer flex-col rounded-lg border p-3.5 transition-colors ${
                        selected
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="valueCategory"
                          value={vc}
                          checked={selected}
                          onChange={() => updateDraft({ valueCategory: vc })}
                        />
                        <span className="text-xs font-semibold text-slate-900">
                          {VALUE_CATEGORY_LABELS[vc]}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                        {VALUE_CATEGORY_DESCRIPTIONS[vc]}
                      </p>
                    </label>
                  );
                })}
              </div>
              {fieldErrors.valueCategory && (
                <p className="text-xs text-red-600">
                  {fieldErrors.valueCategory}
                </p>
              )}
            </fieldset>

            {/* Mandatory Usage Inputs */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="step5-users"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Users Count (active users) *
                </label>
                <input
                  id="step5-users"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.usersCount}
                  onChange={(e) => updateDraft({ usersCount: e.target.value })}
                  placeholder="e.g., 25"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.usersCount && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.usersCount}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step5-minutes"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Minutes Saved per Occurrence (min) *
                </label>
                <input
                  id="step5-minutes"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.minutesSavedPerOccurrence}
                  onChange={(e) =>
                    updateDraft({ minutesSavedPerOccurrence: e.target.value })
                  }
                  placeholder="e.g., 15"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.minutesSavedPerOccurrence && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.minutesSavedPerOccurrence}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step5-frequency"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Process Frequency (occurrences / week) *
                </label>
                <input
                  id="step5-frequency"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.processFrequencyPerWeek}
                  onChange={(e) =>
                    updateDraft({ processFrequencyPerWeek: e.target.value })
                  }
                  placeholder="e.g., 4"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.processFrequencyPerWeek && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.processFrequencyPerWeek}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="step5-rate"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Hourly Rate ($/hr, optional)
                </label>
                <input
                  id="step5-rate"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.hourlyRate}
                  onChange={(e) => updateDraft({ hourlyRate: e.target.value })}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                />
                {fieldErrors.hourlyRate && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.hourlyRate}
                  </p>
                )}
              </div>
            </div>

            {/* Live Calculation Preview */}
            {liveEfficiencyPreview.isApplicable ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-slate-600">
                      Estimated Annual Hours (users × min × occ/wk × 52 / 60)
                    </div>
                    <div className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                      {liveEfficiencyPreview.annualHours.toLocaleString(
                        'en-US',
                        { maximumFractionDigits: 1 }
                      )}{' '}
                      hrs / yr
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-600">
                      Estimated Efficiency Value (Non-Cash Productivity
                      Equivalent)
                    </div>
                    <div className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                      {liveEfficiencyPreview.estimatedEfficiencyValue !== null
                        ? `$${liveEfficiencyPreview.estimatedEfficiencyValue.toLocaleString(
                            'en-US',
                            { maximumFractionDigits: 0 }
                          )}`
                        : 'Provide optional hourly rate to preview'}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Productivity equivalent only — never reported as cash budget
                  savings.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                Because{' '}
                <strong>{VALUE_CATEGORY_LABELS[draft.valueCategory]}</strong> is
                selected, efficiency hours and monetary equivalent formulas are
                not calculated. Mandatory usage metrics are still recorded for
                enterprise portfolio sizing.
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => goToStep(4)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Back to Details</span>
              </button>
              <button
                type="button"
                onClick={() => goToStep(6)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <span>Review & Confirm</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: Review & Save */}
        {draft.step === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Step 6: Review & Register Initiative
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Verify all entries below. After saving, you can immediately edit
                the record from the Initiative Detail view.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2">
              <div>
                <div className="text-slate-500">Title</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {draft.title}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Department & Owner</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {deptName(draft.departmentId)} · {userName(draft.ownerId)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Category & Lifecycle</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {draft.category
                    ? CATEGORY_LABELS[draft.category as RegistrableCategory]
                    : '—'}{' '}
                  · {LIFECYCLE_LABELS[draft.lifecycleStatus]}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Technology Stack</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {draft.aiPlatform} · {draft.solutionType} · {draft.aiType}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-slate-500">Business Problem</div>
                <div className="mt-0.5 text-slate-800">
                  {draft.businessProblem}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-slate-500">Solution Description</div>
                <div className="mt-0.5 text-slate-800">{draft.description}</div>
              </div>
              <div>
                <div className="text-slate-500">Value Category</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {VALUE_CATEGORY_LABELS[draft.valueCategory]}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Usage Metrics</div>
                <div className="mt-0.5 font-semibold text-slate-900 tabular-nums">
                  {draft.usersCount} users · {draft.minutesSavedPerOccurrence}{' '}
                  min saved · {draft.processFrequencyPerWeek} occ/week
                </div>
              </div>
              {liveEfficiencyPreview.isApplicable && (
                <div className="sm:col-span-2 border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-900 tabular-nums">
                    Annual Productivity Hours:{' '}
                    {liveEfficiencyPreview.annualHours.toLocaleString('en-US', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    hrs/yr
                  </span>
                  {liveEfficiencyPreview.estimatedEfficiencyValue !== null && (
                    <span className="ml-4 font-semibold text-slate-900 tabular-nums">
                      Non-Cash Productivity Equivalent: $
                      {liveEfficiencyPreview.estimatedEfficiencyValue.toLocaleString(
                        'en-US',
                        { maximumFractionDigits: 0 }
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              Registration creates enterprise portfolio visibility only. It does
              not grant compliance, security, or budget approval to proceed.
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => goToStep(5)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Back to Usage & Value</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitInitiative}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {submitting ? 'Saving Initiative...' : 'Save & Register Initiative'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
