import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLifecycleAnalytics } from '../domain/calculations';
import { calculateDepartmentWaterfalls } from '../domain/financials';
import {
  DEFAULT_OPERATIONS_CONFIG,
  filterPortfolioByReportingScope,
  formatReportingScopeLabel,
  orderDepartmentsOperationsFirst,
  resolveDepartmentWithAliases,
} from '../domain/operationsReporting';
import {
  buildSavingsDataQualityCsv,
  computeSavingsDataQualityReport,
  evaluateInitiativeSavingsQuality,
} from '../domain/savingsDataQuality';
import {
  BenefitEntry,
  BenefitType,
  Initiative,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LifecycleStatus,
  normalizeRoleDisplayLabel,
  RegistrableCategory,
  ROLE_DISPLAY_LABELS,
  UserRole,
  ValueCategory,
} from '../domain/types';
import { DemoRepository } from '../repositories/demoRepository';
import { MemoryWorkspacePersistence } from '../repositories/indexedDbStore';
import {
  SEED_BENEFITS,
  SEED_COST_TRANSACTIONS,
  SEED_DEPARTMENTS,
  SEED_INITIATIVES,
  SEED_USERS,
} from '../repositories/seedData';

const nowBaseline = new Date('2026-11-16T12:00:00.000Z');
const govUser = SEED_USERS.find((u) => u.id === 'user-elena')!;

function makeInitiative(overrides: Partial<Initiative>): Initiative {
  return {
    id: 'init-test-1',
    title: 'Test AI Initiative',
    businessProblem: 'Manual reconciliation across spreadsheets.',
    description: 'Automates exception routing for operations teams.',
    businessCapability: 'Workflow Automation',
    departmentId: 'dept-eng',
    ownerId: 'user-marcus',
    aiPlatform: 'Azure OpenAI Service',
    solutionType: 'Custom Developed Application',
    aiType: 'Generative AI / LLM',
    category: RegistrableCategory.AI_SOLUTION,
    lifecycleStatus: LifecycleStatus.PILOT,
    valueCategory: ValueCategory.EFFICIENCY,
    usersCount: 20,
    minutesSavedPerOccurrence: 15,
    processFrequencyPerWeek: 5,
    hourlyRate: 70,
    ideaDate: '2026-09-01',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    lastOwnerReviewAt: '2026-11-10T10:00:00.000Z',
    lastSavingsUpdatedAt: '2026-11-10T10:00:00.000Z',
    nextReviewDue: '2026-12-10T10:00:00.000Z',
    version: 1,
    provenance: 'SEED_DEMO',
    syncLinkage: { sourceSystem: 'LOCAL_DEMO' },
    ...overrides,
  };
}

test('computeLifecycleAnalytics enforces exact 8-stage order, largest stage highlight, ties, and Operations-first dept rows', () => {
  const orderedDepts = orderDepartmentsOperationsFirst(SEED_DEPARTMENTS);
  assert.deepEqual(
    orderedDepts.slice(0, 4).map((d) => d.name),
    ['Engineering', 'Procurement', 'Site Service', 'Analytics']
  );

  // Check exact stage labels including 'Scale / Improve'
  assert.equal(LIFECYCLE_LABELS[LifecycleStatus.SCALE_IMPROVE], 'Scale / Improve');
  assert.deepEqual(LIFECYCLE_ORDER, [
    LifecycleStatus.IDEA,
    LifecycleStatus.ASSESSMENT,
    LifecycleStatus.DEVELOPMENT,
    LifecycleStatus.PILOT,
    LifecycleStatus.PRODUCTION,
    LifecycleStatus.MONITORING,
    LifecycleStatus.SCALE_IMPROVE,
    LifecycleStatus.RETIRE,
  ]);

  // Controlled tie scenario across two stages
  const sample: Initiative[] = [
    makeInitiative({ id: 'a1', departmentId: 'dept-eng', lifecycleStatus: LifecycleStatus.IDEA }),
    makeInitiative({ id: 'a2', departmentId: 'dept-eng', lifecycleStatus: LifecycleStatus.PILOT }),
    makeInitiative({ id: 'a3', departmentId: 'dept-proc', lifecycleStatus: LifecycleStatus.PILOT }),
    makeInitiative({ id: 'a4', departmentId: 'dept-site', lifecycleStatus: LifecycleStatus.IDEA }),
    makeInitiative({ id: 'a5', departmentId: 'dept-ana', lifecycleStatus: LifecycleStatus.SCALE_IMPROVE }),
  ];

  const opsDepts = orderedDepts.slice(0, 4);
  const analytics = computeLifecycleAnalytics(sample, opsDepts);

  assert.equal(analytics.totalInitiatives, 5);
  assert.deepEqual(
    analytics.overallDistribution.map((s) => s.status),
    LIFECYCLE_ORDER
  );
  assert.equal(analytics.largestStageCount, 2);
  assert.equal(analytics.largestStagePercentage, 40);
  assert.deepEqual(analytics.largestStages, [
    LifecycleStatus.IDEA,
    LifecycleStatus.PILOT,
  ]);
  assert.equal(analytics.largestStageLabel, 'Idea / Pilot');

  // Each department row preserves the 4 Operations departments in order and sums percentages cleanly
  assert.deepEqual(
    analytics.departmentRows.map((r) => r.departmentName),
    ['Engineering', 'Procurement', 'Site Service', 'Analytics']
  );
  assert.equal(analytics.departmentRows[0].totalCount, 2);
  assert.equal(
    analytics.departmentRows[0].segments.find((s) => s.status === LifecycleStatus.IDEA)?.percentage,
    50
  );

  // Empty dataset never fabricates counts or stages
  const empty = computeLifecycleAnalytics([], opsDepts);
  assert.equal(empty.totalInitiatives, 0);
  assert.equal(empty.largestStageCount, 0);
  assert.equal(empty.largestStagePercentage, 0);
  assert.equal(empty.largestStageLabel, 'No Initiatives');
  assert.equal(empty.largestStages.length, 0);
});

test('Operations-first reporting scope & Excel department alias resolution never misclassify ambiguous labels', async () => {
  const mixedDepartments = [
    ...SEED_DEPARTMENTS,
    { id: 'dept-it', name: 'IT & Digital', code: 'ITD', costCenter: 'CC-2500' },
  ];
  const mixedInitiatives = [
    ...SEED_INITIATIVES,
    makeInitiative({ id: 'init-ext-it', departmentId: 'dept-it' }),
  ];

  const opsScoped = filterPortfolioByReportingScope({
    initiatives: mixedInitiatives,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
    departments: mixedDepartments,
    scope: 'OPERATIONS',
  });
  assert.deepEqual(
    opsScoped.scopedDepartments.map((d) => d.id),
    ['dept-eng', 'dept-proc', 'dept-site', 'dept-ana']
  );
  assert.ok(opsScoped.initiatives.length < mixedInitiatives.length);
  assert.ok(
    opsScoped.initiatives.every((i) =>
      ['dept-eng', 'dept-proc', 'dept-site', 'dept-ana'].includes(i.departmentId)
    )
  );

  const allScoped = filterPortfolioByReportingScope({
    initiatives: mixedInitiatives,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
    departments: mixedDepartments,
    scope: 'ALL',
  });
  assert.equal(allScoped.initiatives.length, mixedInitiatives.length);
  assert.equal(allScoped.scopedDepartments.length, mixedDepartments.length);

  assert.equal(
    formatReportingScopeLabel('OPERATIONS', mixedDepartments),
    'Scope: Operations (Engineering, Procurement, Site Service, Analytics)'
  );
  assert.equal(
    formatReportingScopeLabel('ALL', mixedDepartments),
    'Scope: All Departments'
  );

  // Alias resolution checks
  const purchasing = resolveDepartmentWithAliases('Purchasing', SEED_DEPARTMENTS);
  assert.equal(purchasing.departmentId, 'dept-proc');
  assert.equal(purchasing.matchedBy, 'ALIAS_RULE');
  assert.equal(purchasing.isAmbiguous, false);

  const plantEng = resolveDepartmentWithAliases('Plant Engineering', SEED_DEPARTMENTS);
  assert.equal(plantEng.departmentId, 'dept-eng');
  assert.equal(plantEng.isAmbiguous, false);

  // Ambiguous compound label must be flagged, not guessed into Engineering/Procurement/Site Service/Analytics
  const ambiguous = resolveDepartmentWithAliases('Ops & Support', SEED_DEPARTMENTS);
  assert.equal(ambiguous.isAmbiguous, true);
  assert.equal(ambiguous.matchedBy, 'AMBIGUOUS');
  assert.ok(
    !['dept-eng', 'dept-proc', 'dept-site', 'dept-ana'].includes(ambiguous.departmentId)
  );

  // DemoRepository persists custom Operations config & alias rules
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    autoHydrate: false,
  });
  const initialConfig = await repo.getOperationsConfig();
  assert.deepEqual(
    initialConfig.operationsDepartmentIds,
    DEFAULT_OPERATIONS_CONFIG.operationsDepartmentIds
  );
  const updatedConfig = await repo.saveOperationsConfig({
    operationsDepartmentIds: [...initialConfig.operationsDepartmentIds, 'dept-it'],
    aliasRules: [
      ...initialConfig.aliasRules,
      { id: 'alias-custom-1', alias: 'indirect buying', targetDepartmentId: 'dept-proc' },
    ],
  });
  assert.ok(updatedConfig.operationsDepartmentIds.includes('dept-it'));
  const reloaded = await repo.getOperationsConfig();
  assert.ok(reloaded.aliasRules.some((r) => r.alias === 'indirect buying'));
});

test('Savings Data Quality evaluates Efficiency, Quality, Strategic, Unverified Benefits, CSV export, and preserves lastSavingsUpdatedAt on unrelated edits', async () => {
  // 1. Missing efficiency inputs
  const missingEff = evaluateInitiativeSavingsQuality(
    makeInitiative({
      id: 'q1',
      lifecycleStatus: LifecycleStatus.PRODUCTION,
      usersCount: 0,
      minutesSavedPerOccurrence: 0,
      processFrequencyPerWeek: 0,
      hourlyRate: undefined,
    }),
    [],
    'Engineering',
    'Marcus Weber',
    nowBaseline
  );
  assert.equal(missingEff.isMissingSavingsData, true);
  assert.equal(missingEff.priority, 'HIGH');
  assert.ok(missingEff.issueTypes.includes('MISSING_SAVINGS_DATA'));

  // 2. Incomplete efficiency inputs (missing hourlyRate)
  const incompleteEff = evaluateInitiativeSavingsQuality(
    makeInitiative({
      id: 'q2',
      usersCount: 15,
      minutesSavedPerOccurrence: 10,
      processFrequencyPerWeek: 4,
      hourlyRate: undefined,
    }),
    [],
    'Engineering',
    'Marcus Weber',
    nowBaseline
  );
  assert.equal(incompleteEff.isIncompleteInputs, true);
  assert.ok(incompleteEff.issueTypes.includes('INCOMPLETE_SAVINGS_INPUTS'));

  // 3. Quality missing KPI evidence vs complete KPI evidence
  const missingQuality = evaluateInitiativeSavingsQuality(
    makeInitiative({
      id: 'q3',
      valueCategory: ValueCategory.QUALITY,
      qualityEvidenceOrKpi: '',
    }),
    [],
    'Site Service',
    'Priya Nair',
    nowBaseline
  );
  assert.equal(missingQuality.isIncompleteInputs, true);
  assert.ok(missingQuality.issueTypes.includes('MISSING_QUALITY_EVIDENCE'));

  // 4. Strategic missing success indicator
  const missingStrategic = evaluateInitiativeSavingsQuality(
    makeInitiative({
      id: 'q4',
      valueCategory: ValueCategory.STRATEGIC,
      strategicSuccessIndicator: '',
    }),
    [],
    'Analytics',
    'Hannah Richter',
    nowBaseline
  );
  assert.ok(missingStrategic.issueTypes.includes('MISSING_STRATEGIC_INDICATOR'));

  // 5. Unverified realized financial benefit
  const unverifiedBenefit: BenefitEntry = {
    id: 'ben-unv',
    initiativeId: 'q5',
    departmentId: 'dept-proc',
    benefitType: BenefitType.CASH_SAVINGS,
    estimatedAmountEur: 50000,
    realizedAmountEur: 22000,
    period: '2026-10',
    description: 'Pending audit signoff',
    evidenceStatus: 'PENDING',
    provenance: 'SEED_DEMO',
    createdAt: '2026-10-15T10:00:00.000Z',
  };
  const withUnverified = evaluateInitiativeSavingsQuality(
    makeInitiative({
      id: 'q5',
      departmentId: 'dept-proc',
    }),
    [unverifiedBenefit],
    'Procurement',
    'Lucas Meyer',
    nowBaseline
  );
  assert.ok(withUnverified.issueTypes.includes('UNVERIFIED_REALIZED_BENEFIT'));
  assert.equal(withUnverified.priority, 'HIGH');

  // 6. Portfolio report + CSV escaping
  const report = computeSavingsDataQualityReport({
    initiatives: SEED_INITIATIVES,
    benefits: SEED_BENEFITS,
    departments: orderDepartmentsOperationsFirst(SEED_DEPARTMENTS),
    users: SEED_USERS,
    now: nowBaseline,
  });
  assert.equal(report.totalInitiatives, SEED_INITIATIVES.length);
  assert.ok(report.missingSavingsDataCount >= 1);
  assert.ok(report.overdueReviewsCount >= 1);
  assert.ok(report.incompleteInputsCount >= 1);
  assert.ok(report.upToDateCount >= 1);

  const csv = buildSavingsDataQualityCsv(report.items.slice(0, 3));
  assert.ok(csv.startsWith('Initiative,Department,Owner,Lifecycle Stage'));
  assert.ok(csv.split('\n').length === 4);

  // 7. Critical invariant: unrelated metadata edits MUST NOT change lastSavingsUpdatedAt or lastOwnerReviewAt
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-20T15:00:00.000Z'),
    autoHydrate: false,
  });
  const target = (await repo.listInitiatives()).find((i) => i.id === 'init-2001')!;
  const originalSavingsAt = target.lastSavingsUpdatedAt;
  const originalReviewAt = target.lastOwnerReviewAt;

  const afterTitleEdit = await repo.updateInitiative(
    {
      id: target.id,
      expectedVersion: target.version,
      patch: {
        title: `${target.title} (Updated Copy)`,
      },
    },
    govUser
  );
  assert.equal(afterTitleEdit.lastSavingsUpdatedAt, originalSavingsAt);
  assert.equal(afterTitleEdit.lastOwnerReviewAt, originalReviewAt);

  // Editing a savings field + markSavingsReviewed DOES update lastSavingsUpdatedAt & lastOwnerReviewAt
  const afterSavingsEdit = await repo.updateInitiative(
    {
      id: afterTitleEdit.id,
      expectedVersion: afterTitleEdit.version,
      patch: {
        minutesSavedPerOccurrence: target.minutesSavedPerOccurrence + 2,
        markSavingsReviewed: true,
      },
    },
    govUser
  );
  assert.equal(afterSavingsEdit.lastSavingsUpdatedAt, '2026-11-20T15:00:00.000Z');
  assert.equal(afterSavingsEdit.lastOwnerReviewAt, '2026-11-20T15:00:00.000Z');
});

test('Role display labels map GOVERNANCE consistently to AI Portfolio Manager', () => {
  assert.equal(ROLE_DISPLAY_LABELS[UserRole.GOVERNANCE], 'AI Portfolio Manager');
  assert.equal(normalizeRoleDisplayLabel('Governance Manager'), 'AI Portfolio Manager');
  assert.equal(normalizeRoleDisplayLabel('Demo Governance Manager'), 'Demo AI Portfolio Manager');
  assert.equal(normalizeRoleDisplayLabel('Employee'), 'Employee');
});

test('Seed data includes only the 4 Operations departments and Analytics ranks #1 in Net Benefit, ROI, and Savings Quality', () => {
  assert.deepEqual(
    SEED_DEPARTMENTS.map((d) => d.name),
    ['Engineering', 'Procurement', 'Site Service', 'Analytics']
  );
  assert.equal(
    SEED_DEPARTMENTS.some((d) => d.name === 'Customer Operations'),
    false
  );

  const waterfalls = calculateDepartmentWaterfalls({
    departments: SEED_DEPARTMENTS,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
  });
  const sortedByNet = [...waterfalls].sort(
    (a, b) => b.netFinancialBenefitEur - a.netFinancialBenefitEur
  );
  assert.equal(sortedByNet[0].departmentId, 'dept-ana');
  assert.ok(sortedByNet[0].netFinancialBenefitEur > 0);
  const roiFor = (w: (typeof waterfalls)[number]) =>
    w.incrementalAiCostsEur > 0
      ? (w.netFinancialBenefitEur / w.incrementalAiCostsEur) * 100
      : null;
  const analyticsRow = sortedByNet[0];
  const analyticsRoi = roiFor(analyticsRow);
  assert.ok(analyticsRoi !== null && analyticsRoi > 500);
  assert.ok(
    waterfalls.every(
      (w) =>
        w.departmentId === 'dept-ana' ||
        roiFor(w) === null ||
        analyticsRoi! > roiFor(w)!
    )
  );

  const qualityReport = computeSavingsDataQualityReport({
    initiatives: SEED_INITIATIVES,
    benefits: SEED_BENEFITS,
    departments: SEED_DEPARTMENTS,
    users: SEED_USERS,
    now: nowBaseline,
  });
  const analyticsQuality = qualityReport.byDepartment.find(
    (d) => d.departmentId === 'dept-ana'
  )!;
  assert.equal(analyticsQuality.completenessPercent, 100);
  assert.equal(analyticsQuality.overdueCount, 0);
  assert.equal(analyticsQuality.actionRequiredCount, 0);
  assert.ok(
    qualityReport.items
      .filter((item) => item.departmentId === 'dept-ana')
      .every((item) => item.isUpToDate && item.issueTypes.length === 0)
  );
});
