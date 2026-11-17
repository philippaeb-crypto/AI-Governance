import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAnnualHours,
  calculateEfficiencyMetrics,
  computePortfolioMetrics,
  isReviewOverdue,
} from '../domain/calculations';
import {
  isGovernedExceptionTransition,
  validateLifecycleTransition,
} from '../domain/lifecycle';
import { evaluateRegistryScope } from '../domain/registryScope';
import {
  LifecycleStatus,
  RegistrableCategory,
  ScopeDecision,
  ValueCategory,
} from '../domain/types';
import { validateCreateInitiativeInput } from '../domain/validation';
import { SEED_DEPARTMENTS, SEED_INITIATIVES } from '../repositories/seedData';

test('efficiency formula calculates annualHours and estimatedEfficiencyValue strictly for EFFICIENCY', () => {
  // 25 users * 15 min * 4 times/week * 52 / 60 = 1300 hours
  const hours = calculateAnnualHours(25, 15, 4);
  assert.equal(hours, 1300);

  const eff = calculateEfficiencyMetrics(ValueCategory.EFFICIENCY, 25, 15, 4, 60);
  assert.equal(eff.isApplicable, true);
  assert.equal(eff.annualHours, 1300);
  assert.equal(eff.estimatedEfficiencyValue, 78000);

  const effNoRate = calculateEfficiencyMetrics(ValueCategory.EFFICIENCY, 25, 15, 4);
  assert.equal(effNoRate.isApplicable, true);
  assert.equal(effNoRate.estimatedEfficiencyValue, null);

  const quality = calculateEfficiencyMetrics(ValueCategory.QUALITY, 25, 15, 4, 60);
  assert.equal(quality.isApplicable, false);
  assert.equal(quality.annualHours, 0);
  assert.equal(quality.estimatedEfficiencyValue, null);

  const strategic = calculateEfficiencyMetrics(ValueCategory.STRATEGIC, 25, 15, 4, 60);
  assert.equal(strategic.isApplicable, false);
  assert.equal(strategic.estimatedEfficiencyValue, null);
});

test('usage validation requires non-negative mandatory fields for all value categories', () => {
  const basePayload = {
    title: 'Quality Audit Helper',
    businessProblem: 'Manual quality checks take too long',
    description: 'AI helper for standardized floor audits across teams',
    businessCapability: 'Quality Assurance',
    departmentId: 'dept-ops',
    ownerId: 'user-marcus',
    aiPlatform: 'Azure OpenAI Service',
    solutionType: 'Custom Developed Application',
    aiType: 'Generative AI / LLM',
    category: RegistrableCategory.AI_SOLUTION,
    lifecycleStatus: LifecycleStatus.IDEA,
    valueCategory: ValueCategory.QUALITY,
    usersCount: 10,
    minutesSavedPerOccurrence: 5,
    processFrequencyPerWeek: 3,
    ideaDate: '2026-11-10',
  };

  assert.deepEqual(validateCreateInitiativeInput(basePayload), {});

  const negativeErrors = validateCreateInitiativeInput({
    ...basePayload,
    usersCount: -1,
    minutesSavedPerOccurrence: -5,
    processFrequencyPerWeek: -2,
    hourlyRate: -10,
  });

  assert.ok(negativeErrors.usersCount);
  assert.ok(negativeErrors.minutesSavedPerOccurrence);
  assert.ok(negativeErrors.processFrequencyPerWeek);
  assert.ok(negativeErrors.hourlyRate);

  const missingErrors = validateCreateInitiativeInput({
    ...basePayload,
    usersCount: '',
    minutesSavedPerOccurrence: null,
    processFrequencyPerWeek: undefined,
  });

  assert.ok(missingErrors.usersCount);
  assert.ok(missingErrors.minutesSavedPerOccurrence);
  assert.ok(missingErrors.processFrequencyPerWeek);
});

test('registry scope classifier detects excluded Personal/Learning/One-Time uses and ambiguous inputs', () => {
  const personal = evaluateRegistryScope({
    ideaText: 'Summarize my own notes and draft my emails for personal productivity',
  });
  assert.equal(personal.decision, ScopeDecision.NOT_REQUIRED);

  const learning = evaluateRegistryScope({
    ideaText: 'A Python course tutorial exercise to practice prompt engineering',
  });
  assert.equal(learning.decision, ScopeDecision.NOT_REQUIRED);

  const oneTime = evaluateRegistryScope({
    ideaText: 'One-time script to reformat a single presentation dataset once for a meeting',
  });
  assert.equal(oneTime.decision, ScopeDecision.NOT_REQUIRED);

  const ambiguous = evaluateRegistryScope({
    ideaText: 'AI helper for emails',
  });
  assert.equal(ambiguous.decision, ScopeDecision.NEEDS_CLARIFICATION);
  assert.ok(ambiguous.clarificationQuestions.length > 0);

  const clarifiedRegister = evaluateRegistryScope({
    ideaText: 'AI helper for emails',
    clarifications: {
      isSharedOrOperational: 'yes',
      isRepeatableProcess: 'yes',
      intendedForm: 'workflow_automation',
    },
  });
  assert.equal(clarifiedRegister.decision, ScopeDecision.REGISTER);
  assert.equal(clarifiedRegister.suggestedCategory, RegistrableCategory.AI_AUTOMATION);

  const clearEnterprise = evaluateRegistryScope({
    ideaText:
      'Power Automate workflow with Azure AI Document Intelligence to extract vendor invoice fields for the finance department weekly.',
  });
  assert.equal(clearEnterprise.decision, ScopeDecision.REGISTER);
  assert.equal(clearEnterprise.suggestedCategory, RegistrableCategory.AI_AUTOMATION);
});

test('lifecycle allows governed non-linear exceptions only with reason note', () => {
  assert.equal(
    isGovernedExceptionTransition(LifecycleStatus.IDEA, LifecycleStatus.PRODUCTION),
    true
  );
  assert.equal(
    isGovernedExceptionTransition(LifecycleStatus.IDEA, LifecycleStatus.ASSESSMENT),
    false
  );

  const missingReason = validateLifecycleTransition({
    fromStatus: LifecycleStatus.IDEA,
    toStatus: LifecycleStatus.PRODUCTION,
    note: 'ok',
  });
  assert.equal(missingReason.valid, false);
  assert.equal(missingReason.isGovernedException, true);

  const validException = validateLifecycleTransition({
    fromStatus: LifecycleStatus.IDEA,
    toStatus: LifecycleStatus.PRODUCTION,
    note: 'Vendor SaaS feature already live in ERP tenant and registered retroactively.',
  });
  assert.equal(validException.valid, true);
  assert.equal(validException.isGovernedException, true);
});

test('portfolio metrics use Pilot + Production strictly for Active Solutions and separate post-production stages', () => {
  const now = new Date('2026-11-16T00:00:00.000Z');
  const metrics = computePortfolioMetrics(SEED_INITIATIVES, SEED_DEPARTMENTS, now);

  const expectedActive = SEED_INITIATIVES.filter(
    (i) =>
      i.lifecycleStatus === LifecycleStatus.PILOT ||
      i.lifecycleStatus === LifecycleStatus.PRODUCTION
  ).length;

  assert.equal(metrics.totalInitiatives, SEED_INITIATIVES.length);
  assert.equal(metrics.activeSolutionsCount, expectedActive);
  assert.equal(metrics.liveCount, expectedActive);
  // Every initiative belongs to exactly one cohort: Pipeline, Live, Monitoring, Scale / Improve, or Retire
  assert.equal(
    metrics.pipelineCount +
      metrics.liveCount +
      metrics.monitoringCount +
      metrics.scaleImproveCount +
      metrics.retiredCount,
    metrics.totalInitiatives
  );
  assert.equal(metrics.needsCompletionCount, 0);
  assert.equal(
    isReviewOverdue('2026-10-31T14:20:00.000Z', now),
    true
  );
  assert.equal(
    isReviewOverdue('2026-12-10T11:45:00.000Z', now),
    false
  );
});

