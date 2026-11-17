import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCostPlanDuplicates,
  findDuplicateCostPlanConflicts,
  normalizeCostPlanMonthAndYear,
  suggestCostPlanColumnMappings,
  validateAndNormalizeCostPlanImportBatch,
} from '../domain/excelImport';
import { calculatePortfolioFinancialDashboard } from '../domain/financials';
import { CostCategory } from '../domain/types';
import { DemoRepository } from '../repositories/demoRepository';
import { MemoryWorkspacePersistence } from '../repositories/indexedDbStore';
import {
  SEED_BENEFITS,
  SEED_COST_PLANS,
  SEED_COST_TRANSACTIONS,
  SEED_DEPARTMENTS,
  SEED_INITIATIVES,
  SEED_USERS,
} from '../repositories/seedData';
import {
  extractWorksheetRows,
  parseLocalSpreadsheetFile,
} from '../services/excelParser';

const employeeMarcus = SEED_USERS.find((u) => u.id === 'user-marcus')!;
const governanceElena = SEED_USERS.find((u) => u.id === 'user-elena')!;

test('Cost Planning CRUD: persists in repository across reload & enforces Governance RBAC and validation', async () => {
  const sharedPersistence = new MemoryWorkspacePersistence();
  const repo1 = new DemoRepository({
    persistence: sharedPersistence,
    nowProvider: () => new Date('2026-11-16T10:00:00.000Z'),
    autoHydrate: false,
  });

  const seededPlans = await repo1.listCostPlans({ planningYear: 2026 });
  assert.equal(seededPlans.length, SEED_COST_PLANS.length);

  // Employee cannot create or mutate cost plans
  await assert.rejects(
    () =>
      repo1.saveCostPlan(
        {
          departmentId: 'dept-ana',
          planningYear: 2027,
          month: 1,
          platform: 'Azure OpenAI Service',
          costCategory: CostCategory.TOKENS_API,
          plannedAmountEur: 4000,
          forecastAmountEur: 3800,
        },
        employeeMarcus
      ),
    /AI Portfolio Manager role is required/
  );

  // Negative amounts rejected
  await assert.rejects(
    () =>
      repo1.saveCostPlan(
        {
          departmentId: 'dept-ana',
          planningYear: 2027,
          month: 1,
          platform: 'Azure OpenAI Service',
          costCategory: CostCategory.TOKENS_API,
          plannedAmountEur: -100,
          forecastAmountEur: null,
        },
        governanceElena
      ),
    /non-negative Planned\/Forecast EUR/
  );

  // Governance creates a 2027 plan with blank forecast (strictly null)
  const created = await repo1.saveCostPlan(
    {
      departmentId: 'dept-ana',
      planningYear: 2027,
      month: 1,
      platform: 'Azure OpenAI Service',
      costCategory: CostCategory.TOKENS_API,
      plannedAmountEur: 4200,
      forecastAmountEur: null,
      costCenter: 'CC-2400',
      licenseCount: 30,
      comments: 'Initial FY27 Analytics capacity plan',
    },
    governanceElena
  );
  assert.equal(created.period, '2027-01');
  assert.equal(created.forecastAmountEur, null);
  assert.equal(created.provenance, 'MANUAL');

  // Simulate reload via second DemoRepository instance backed by same persistence
  const repo2 = new DemoRepository({
    persistence: sharedPersistence,
    autoHydrate: false,
  });
  await repo2.hydrate();
  const reloaded2027 = await repo2.listCostPlans({ planningYear: 2027 });
  assert.equal(reloaded2027.length, 1);
  assert.equal(reloaded2027[0].plannedAmountEur, 4200);
  assert.equal(reloaded2027[0].forecastAmountEur, null);

  // Update forecast later
  const updated = await repo2.saveCostPlan(
    {
      id: created.id,
      departmentId: created.departmentId,
      planningYear: 2027,
      month: 1,
      platform: created.platform,
      costCategory: created.costCategory,
      plannedAmountEur: 4200,
      forecastAmountEur: 3950,
      costCenter: 'CC-2400',
      licenseCount: 32,
      comments: 'Q1 revised forecast',
    },
    governanceElena
  );
  assert.equal(updated.forecastAmountEur, 3950);

  // Delete entry
  await repo2.deleteCostPlan(created.id, governanceElena);
  assert.equal((await repo2.listCostPlans({ planningYear: 2027 })).length, 0);
});

test('Cost Planning Bulk Copy: duplicateCostPlanToMonth & copyMonthlyPlanAcrossYear handle skip and overwrite cleanly', async () => {
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    autoHydrate: false,
  });
  await repo.switchDataset('IMPORTED_PORTFOLIO');

  const jan = await repo.saveCostPlan(
    {
      departmentId: 'dept-eng',
      planningYear: 2026,
      month: 1,
      platform: 'Azure OpenAI Service',
      costCategory: CostCategory.TOKENS_API,
      plannedAmountEur: 3000,
      forecastAmountEur: 2900,
      costCenter: 'CC-2100',
      licenseCount: 25,
    },
    governanceElena
  );

  // Duplicate Jan -> Feb
  const dup = await repo.duplicateCostPlanToMonth(
    {
      sourcePlanId: jan.id,
      targetPlanningYear: 2026,
      targetMonth: 2,
    },
    governanceElena
  );
  assert.equal(dup.action, 'CREATED');
  assert.equal(dup.entry.period, '2026-02');
  assert.equal(dup.entry.plannedAmountEur, 3000);

  // Copy Jan across months 2..4 without overwrite -> skips Feb, creates Mar & Apr
  const copy1 = await repo.copyMonthlyPlanAcrossYear(
    {
      sourcePlanningYear: 2026,
      sourceMonth: 1,
      targetMonths: [2, 3, 4],
      overwriteExisting: false,
    },
    governanceElena
  );
  assert.equal(copy1.createdCount, 2);
  assert.equal(copy1.skippedCount, 1);
  assert.equal(copy1.updatedCount, 0);

  // Update Jan amount and copy across [2, 3] with overwriteExisting=true -> updates 2
  await repo.saveCostPlan(
    {
      id: jan.id,
      departmentId: jan.departmentId,
      planningYear: 2026,
      month: 1,
      platform: jan.platform,
      costCategory: jan.costCategory,
      plannedAmountEur: 3500,
      forecastAmountEur: 3400,
      costCenter: jan.costCenter,
      licenseCount: 28,
    },
    governanceElena
  );
  const copy2 = await repo.copyMonthlyPlanAcrossYear(
    {
      sourcePlanningYear: 2026,
      sourceMonth: 1,
      targetMonths: [2, 3],
      overwriteExisting: true,
    },
    governanceElena
  );
  assert.equal(copy2.updatedCount, 2);
  const febUpdated = (await repo.listCostPlans({ planningYear: 2026 })).find(
    (p) => p.month === 2
  )!;
  assert.equal(febUpdated.plannedAmountEur, 3500);
});

test('Cost Plan Excel/CSV Import: bilingual EN/DE numbers, months, missing forecast=null, duplicate handling, and never overwrites Actuals', async () => {
  const periodParsed = normalizeCostPlanMonthAndYear({
    rawPeriod: '03/2026',
  });
  assert.equal(periodParsed.planningYear, 2026);
  assert.equal(periodParsed.month, 3);
  assert.equal(periodParsed.period, '2026-03');

  const headers = [
    'Fachbereich',
    'Planungsjahr',
    'Monat',
    'KI Plattform',
    'Kostenart',
    'Plankosten',
    'Prognose',
    'Kostenstelle',
    'Lizenzen',
    'Kommentar',
  ];
  const mappings = suggestCostPlanColumnMappings(headers, {
    useMockProvider: true,
  });
  assert.equal(findDuplicateCostPlanConflicts(mappings).length, 0);

  const byHeader = new Map(mappings.map((m) => [m.sourceHeader, m.targetField]));
  assert.equal(byHeader.get('Fachbereich'), 'department');
  assert.equal(byHeader.get('Plankosten'), 'plannedAmountEur');
  assert.equal(byHeader.get('Prognose'), 'forecastAmountEur');

  const validation = validateAndNormalizeCostPlanImportBatch({
    rows: [
      {
        Fachbereich: 'Engineering',
        Planungsjahr: 2026,
        Monat: 'März',
        'KI Plattform': 'Azure OpenAI Service',
        Kostenart: 'LLM Tokens',
        Plankosten: '3.250,50',
        Prognose: '3.100,25',
        Kostenstelle: 'CC-2100',
        Lizenzen: '34',
        Kommentar: 'German decimal format',
      },
      {
        Fachbereich: 'Site Service',
        Planungsjahr: 2026,
        Monat: 'Dezember',
        'KI Plattform': 'Microsoft Copilot Studio',
        Kostenart: 'LLM Tokens',
        Plankosten: '€1,850.00',
        Prognose: '', // Blank forecast MUST stay null
        Kostenstelle: 'CC-2300',
        Lizenzen: '',
        Kommentar: 'Blank forecast preserved',
      },
      {
        Fachbereich: 'Analytics',
        Planungsjahr: 2026,
        Monat: 13, // Invalid month
        'KI Plattform': 'Azure OpenAI Service',
        Kostenart: 'Licensing',
        Plankosten: '-50',
        Prognose: '100',
      },
    ],
    mappings,
    departments: SEED_DEPARTMENTS,
  });

  assert.equal(validation.validRows.length, 2);
  assert.equal(validation.invalidRows.length, 1);

  assert.equal(validation.validRows[0].month, 3);
  assert.equal(validation.validRows[0].plannedAmountEur, 3250.5);
  assert.equal(validation.validRows[0].forecastAmountEur, 3100.25);

  assert.equal(validation.validRows[1].month, 12);
  assert.equal(validation.validRows[1].plannedAmountEur, 1850);
  assert.equal(validation.validRows[1].forecastAmountEur, null);

  // Commit into SAMPLE_DEMO and verify Actual transactions ledger count/amounts are completely untouched
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    autoHydrate: false,
  });
  const actualsBefore = await repo.listCostTransactions();
  const existingPlans = await repo.listCostPlans();
  const dupes = detectCostPlanDuplicates(validation.validRows, existingPlans);

  // Site Service Dec 2026 matches SEED_COST_PLANS (where planned was 2200 -> now 1850)
  const siteDecDupe = dupes.find(
    (d) => d.row.departmentId === 'dept-site' && d.row.month === 12
  )!;
  assert.equal(siteDecDupe.matchType, 'EXACT_PLAN_KEY');
  assert.equal(siteDecDupe.decision, 'UPDATE_EXISTING');

  const batch = await repo.commitCostPlanImportBatch({
    fileName: 'cost_plan_de_en.xlsx',
    worksheetName: 'AI_Cost_Plan_2026',
    targetDataset: 'SAMPLE_DEMO',
    items: dupes,
    failedCount: validation.invalidRows.length,
    actor: governanceElena,
  });
  assert.equal(batch.kind, 'COST_PLANS');
  assert.equal(batch.errorCount, 1);

  const actualsAfter = await repo.listCostTransactions();
  assert.deepEqual(actualsAfter, actualsBefore);
});

test('Financial Overview & Department Reconciliation: 1:1 sum parity, YTD cutoff, Forecast missing rules, and non-cash separation', () => {
  const overviewFlagMissing = calculatePortfolioFinancialDashboard({
    departments: SEED_DEPARTMENTS,
    initiatives: SEED_INITIATIVES,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
    costPlans: SEED_COST_PLANS,
    reportingYear: 2026,
    referenceDate: new Date('2026-11-16T00:00:00.000Z'),
    forecastMissingRule: 'FLAG_MISSING',
  });

  // Seed data deliberately leaves Site Service Dec 2026 forecast null -> 11/12 months covered
  assert.equal(overviewFlagMissing.elapsedMonthCutoff, 11);
  assert.equal(overviewFlagMissing.forecastCoveredMonthsCount, 11);
  assert.equal(overviewFlagMissing.hasMissingForecastData, true);
  assert.deepEqual(overviewFlagMissing.missingForecastMonths, [12]);
  assert.equal(overviewFlagMissing.missingForecastEntriesCount, 1);

  // 1:1 Department Reconciliation with Portfolio Totals
  const sumDeptRealizedCash = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.realizedCashSavingsEur,
    0
  );
  const sumDeptCostAvoidance = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.realizedCostAvoidanceEur,
    0
  );
  const sumDeptRealizedBenefits = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.realizedFinancialBenefitsEur,
    0
  );
  const sumDeptActualCosts = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.actualAiCostsEur,
    0
  );
  const sumDeptNetBenefit = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.netFinancialBenefitEur,
    0
  );
  const sumDeptAnnualBudget = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.annualBudgetEur,
    0
  );
  const sumDeptAnnualForecast = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + (r.annualForecastEur ?? 0),
    0
  );
  const sumDeptYtdBudget = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.ytdBudgetEur,
    0
  );
  const sumDeptYtdActual = overviewFlagMissing.departmentRows.reduce(
    (s, r) => s + r.ytdActualEur,
    0
  );

  assert.equal(
    sumDeptRealizedCash,
    overviewFlagMissing.summary.realizedCashSavingsEur
  );
  assert.equal(
    sumDeptCostAvoidance,
    overviewFlagMissing.summary.realizedCostAvoidanceEur
  );
  assert.equal(
    sumDeptRealizedBenefits,
    overviewFlagMissing.summary.realizedFinancialBenefitsEur
  );
  assert.equal(
    sumDeptActualCosts,
    overviewFlagMissing.summary.actualAiCostsEur
  );
  assert.equal(
    sumDeptNetBenefit,
    overviewFlagMissing.summary.netFinancialBenefitEur
  );
  assert.equal(sumDeptAnnualBudget, overviewFlagMissing.annualBudgetEur);
  assert.equal(sumDeptAnnualForecast, overviewFlagMissing.annualForecastEur);
  assert.equal(sumDeptYtdBudget, overviewFlagMissing.ytdBudgetEur);
  assert.equal(sumDeptYtdActual, overviewFlagMissing.ytdActualEur);

  // Estimated Efficiency Value stays non-cash and never enters Net Financial Benefit
  assert.ok(overviewFlagMissing.summary.estimatedEfficiencyValueEur > 0);
  assert.equal(
    overviewFlagMissing.summary.netFinancialBenefitEur,
    overviewFlagMissing.summary.realizedFinancialBenefitsEur -
      overviewFlagMissing.summary.actualAiCostsEur
  );

  // Analytics remains top financial performer in seed dataset strictly from data
  const sortedByNet = [...overviewFlagMissing.departmentRows].sort(
    (a, b) => b.netFinancialBenefitEur - a.netFinancialBenefitEur
  );
  assert.equal(sortedByNet[0].departmentId, 'dept-ana');

  // Fallback rule fills missing Dec Site Service forecast with planned amount (3900) -> 12/12 months
  const overviewFallback = calculatePortfolioFinancialDashboard({
    departments: SEED_DEPARTMENTS,
    initiatives: SEED_INITIATIVES,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
    costPlans: SEED_COST_PLANS,
    reportingYear: 2026,
    referenceDate: new Date('2026-11-16T00:00:00.000Z'),
    forecastMissingRule: 'FALLBACK_TO_PLANNED',
  });
  assert.equal(overviewFallback.forecastCoveredMonthsCount, 12);
  assert.equal(overviewFallback.fallbackAppliedEntriesCount, 1);
  assert.equal(
    (overviewFallback.annualForecastEur ?? 0) -
      (overviewFlagMissing.annualForecastEur ?? 0),
    3900
  );
});

test('CSV Parser: preserves UTF-8 umlauts (März) and German thousands/decimals (2.450,50) without float truncation', async () => {
  const csv = [
    'Department,Year,Month,Platform,Category,Planned Cost,Latest Forecast,Licenses,Cost Center,Comments',
    'Analytics,2027,März,Azure OpenAI Service,LLM Tokens,"2.450,50","2.100,00",18,CC-2400,German decimal & month test',
    'Procurement,2027,April,Power Automate AI Builder,Platform Licensing,1850,,12,CC-2200,Blank forecast stays null',
  ].join('\n');
  const file = new File([csv], 'cost_plan_utf8_test.csv', {
    type: 'text/csv;charset=utf-8',
  });
  const parsedWb = await parseLocalSpreadsheetFile(file);
  const extracted = extractWorksheetRows(parsedWb.workbook, parsedWb.sheetNames[0]);
  const mappings = suggestCostPlanColumnMappings(extracted.headers, {
    useMockProvider: true,
  });
  const validation = validateAndNormalizeCostPlanImportBatch({
    rows: extracted.rows,
    mappings,
    departments: SEED_DEPARTMENTS,
  });

  assert.equal(validation.invalidRows.length, 0);
  assert.equal(validation.validRows.length, 2);
  assert.equal(validation.validRows[0].month, 3);
  assert.equal(validation.validRows[0].plannedAmountEur, 2450.5);
  assert.equal(validation.validRows[0].forecastAmountEur, 2100);
  assert.equal(validation.validRows[1].month, 4);
  assert.equal(validation.validRows[1].plannedAmountEur, 1850);
  assert.equal(validation.validRows[1].forecastAmountEur, null);
});
