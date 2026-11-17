import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDevelopmentLeadTimeDays,
  computeInitiativeCompleteness,
  computeProductionAgingDays,
  computeStageAgingDays,
  computeStageTimeBreakdown,
  computeStoredLifecycleTransitions,
} from '../domain/calculations';
import {
  applyMappingTemplate,
  buildImportErrorsCsv,
  detectImportDuplicates,
  findDuplicateTargetFieldConflicts,
  normalizeDateCell,
  parseNumericCell,
  suggestCostColumnMappings,
  suggestInitiativeColumnMappings,
  validateAndNormalizeCostImportBatch,
  validateAndNormalizeInitiativeImportBatch,
} from '../domain/excelImport';
import {
  calculateCostCenterNetBenefits,
  calculateDepartmentWaterfalls,
  calculatePortfolioFinancialSummary,
} from '../domain/financials';
import {
  buildCanonicalPairKey,
  computeRedundancyAnalysis,
  ELIGIBLE_REDUNDANCY_STATUSES,
} from '../domain/redundancy';
import {
  BenefitType,
  CostCategory,
  LifecycleStatus,
  RedundancyDisposition,
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
  SEED_LIFECYCLE_EVENTS,
  SEED_USERS,
} from '../repositories/seedData';

const employeeMarcus = SEED_USERS.find((u) => u.id === 'user-marcus')!;
const employeeSarah = SEED_USERS.find((u) => u.id === 'user-sarah')!;
const governanceElena = SEED_USERS.find((u) => u.id === 'user-elena')!;

test('Smart Excel Import: alias, fuzzy, and MockColumnMappingProvider detection + row validation without fabrication', () => {
  const headers = [
    'SP_ID',
    'Solution Name',
    'Pain Point',
    'Solution Description',
    'Org Unit', // triggers MockColumnMappingProvider
    'Accountable Lead',
    'Lifecycle Stage',
    'Value Category',
    'Active Users',
    'Time Saved Mins', // triggers MockColumnMappingProvider
    'Weekly Freq', // triggers MockColumnMappingProvider
    'Hourly Rate',
    'Unused Extra Column',
  ];

  const mappings = suggestInitiativeColumnMappings(headers, {
    useMockProvider: true,
  });

  const byHeader = new Map(mappings.map((m) => [m.sourceHeader, m]));
  assert.equal(byHeader.get('SP_ID')?.targetField, 'sharepointId');
  assert.equal(byHeader.get('SP_ID')?.method, 'EXACT_ALIAS');
  assert.equal(byHeader.get('Org Unit')?.targetField, 'department');
  assert.equal(byHeader.get('Org Unit')?.method, 'MOCK_PROVIDER');
  assert.equal(byHeader.get('Unused Extra Column')?.targetField, '__EXCLUDE__');

  const rows = [
    {
      SP_ID: 'SP-700',
      'Solution Name': 'Procurement Clause Checker',
      'Pain Point': 'Slow manual supplier contract clause reviews.',
      'Solution Description': 'Automated legal clause risk flagging.',
      'Org Unit': 'Procurement',
      'Accountable Lead': 'Marcus Weber',
      'Lifecycle Stage': 'POC', // normalizes to PILOT
      'Value Category': 'Productivity Gains', // normalizes to EFFICIENCY
      'Active Users': '40',
      'Time Saved Mins': '20',
      'Weekly Freq': '3',
      'Hourly Rate': '75',
      'Unused Extra Column': 'ignored',
    },
    {
      SP_ID: 'SP-701',
      'Solution Name': 'Incomplete Entry',
      'Pain Point': '', // must fail validation, never fabricated
      'Solution Description': '',
      'Org Unit': 'Finance',
      'Accountable Lead': 'Elena Vance',
      'Lifecycle Stage': 'InvalidStage',
      'Value Category': 'Efficiency',
      'Active Users': '-5',
      'Time Saved Mins': '10',
      'Weekly Freq': '2',
    },
  ];

  const validation = validateAndNormalizeInitiativeImportBatch({
    rows,
    mappings,
    departments: SEED_DEPARTMENTS,
    users: SEED_USERS,
    nowIso: '2026-11-15T10:00:00.000Z',
  });

  assert.equal(validation.validRows.length, 1);
  assert.equal(validation.invalidRows.length, 1);

  const valid = validation.validRows[0];
  assert.equal(valid.lifecycleStatus, LifecycleStatus.PILOT);
  assert.equal(valid.valueCategory, ValueCategory.EFFICIENCY);
  assert.equal(valid.departmentId, 'dept-proc');
  assert.equal(valid.ownerId, 'user-marcus');
  assert.equal(valid.hourlyRate, 75);

  const invalid = validation.invalidRows[0];
  assert.ok(invalid.errors.some((e) => e.includes('Business Problem')));
  assert.ok(invalid.errors.some((e) => e.includes('Description')));
  assert.ok(invalid.errors.some((e) => e.includes('Lifecycle Status')));
  assert.ok(invalid.errors.some((e) => e.includes('Users Count')));

  const csv = buildImportErrorsCsv(
    validation.invalidRows.map((r) => ({
      rowIndex: r.rowIndex,
      identifier: r.title,
      errors: r.errors,
    }))
  );
  assert.ok(csv.includes('Incomplete Entry'));
  assert.ok(csv.includes('Business Problem'));
});

test('DemoRepository: dataset isolation, idempotent SharePoint re-import, and ownership delete guard', async () => {
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-15T12:00:00.000Z'),
    autoHydrate: false,
  });

  assert.equal(repo.getActiveDataset(), 'SAMPLE_DEMO');
  const seedList = await repo.listInitiatives();
  assert.equal(seedList.length, SEED_INITIATIVES.length);

  // Switch to clean IMPORTED_PORTFOLIO dataset — must be completely isolated from SAMPLE_DEMO
  await repo.switchDataset('IMPORTED_PORTFOLIO');
  assert.equal((await repo.listInitiatives()).length, 0);

  const headers = [
    'SharePoint ID',
    'Title',
    'Business Problem',
    'Description',
    'Department',
    'Owner',
    'Lifecycle Status',
    'Value Category',
    'Users',
    'Minutes Saved',
    'Process Frequency',
  ];
  const mappings = suggestInitiativeColumnMappings(headers);
  const rows = [
    {
      'SharePoint ID': 'SP-9901',
      Title: 'Contract Obligation Extractor',
      'Business Problem': 'Manual obligation extraction from PDF agreements.',
      Description: 'Extracts renewal dates and SLA penalties for Legal.',
      Department: 'Legal & Compliance',
      Owner: 'Sarah Chen',
      'Lifecycle Status': 'Pilot',
      'Value Category': 'Quality Improvements',
      Users: 18,
      'Minutes Saved': 25,
      'Process Frequency': 4,
    },
  ];

  const batch1 = validateAndNormalizeInitiativeImportBatch({
    rows,
    mappings,
    departments: SEED_DEPARTMENTS,
    users: SEED_USERS,
  });
  const dupes1 = detectImportDuplicates(batch1.validRows, await repo.listInitiatives());
  assert.equal(dupes1[0].decision, 'IMPORT_NEW');

  // Employee role cannot commit governance Excel imports
  await assert.rejects(
    () =>
      repo.commitInitiativeImportBatch({
        fileName: 'portfolio.xlsx',
        worksheetName: 'Sheet1',
        targetDataset: 'IMPORTED_PORTFOLIO',
        items: dupes1,
        actor: employeeMarcus,
      }),
    /AI Portfolio Manager role is required/
  );

  // Governance commits batch into IMPORTED_PORTFOLIO
  const record1 = await repo.commitInitiativeImportBatch({
    fileName: 'portfolio.xlsx',
    worksheetName: 'Sheet1',
    targetDataset: 'IMPORTED_PORTFOLIO',
    items: dupes1,
    actor: governanceElena,
  });
  assert.equal(record1.createdCount, 1);

  const importedList = await repo.listInitiatives();
  assert.equal(importedList.length, 1);
  assert.equal(importedList[0].provenance, 'IMPORTED_EXCEL');

  // Re-importing exact same file defaults to SKIP via SharePoint ID match and creates 0 duplicates
  const dupes2 = detectImportDuplicates(batch1.validRows, importedList);
  assert.equal(dupes2[0].matchType, 'SHAREPOINT_ID');
  assert.equal(dupes2[0].changes.length, 0);
  assert.equal(dupes2[0].decision, 'SKIP');

  const record2 = await repo.commitInitiativeImportBatch({
    fileName: 'portfolio.xlsx',
    worksheetName: 'Sheet1',
    targetDataset: 'IMPORTED_PORTFOLIO',
    items: dupes2,
    actor: governanceElena,
  });
  assert.equal(record2.createdCount, 0);
  assert.equal(record2.skippedCount, 1);
  assert.equal((await repo.listInitiatives()).length, 1);

  // Ownership guard on deleteInitiative: Marcus cannot delete Sarah's initiative
  await assert.rejects(
    () => repo.deleteInitiative(importedList[0].id, employeeMarcus),
    /can only delete initiatives they own/
  );

  // Sarah (owner) CAN delete her own initiative
  await repo.deleteInitiative(importedList[0].id, employeeSarah);
  assert.equal((await repo.listInitiatives()).length, 0);

  // SAMPLE_DEMO remains completely untouched
  await repo.switchDataset('SAMPLE_DEMO');
  assert.equal((await repo.listInitiatives()).length, SEED_INITIATIVES.length);
});

test('Financials: separates Efficiency vs Realized benefits without double counting and enforces strict Cost-Center attribution', () => {
  const summary = calculatePortfolioFinancialSummary({
    initiatives: SEED_INITIATIVES,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
  });

  // Only Cash Savings + Cost Avoidance contribute to netFinancialBenefitEur
  assert.equal(
    summary.realizedFinancialBenefitsEur,
    summary.realizedCashSavingsEur + summary.realizedCostAvoidanceEur
  );
  assert.equal(
    summary.netFinancialBenefitEur,
    summary.realizedFinancialBenefitsEur - summary.actualAiCostsEur
  );
  // Efficiency value stays cleanly separated and non-zero
  assert.ok(summary.estimatedEfficiencyValueEur > 0);
  assert.ok(summary.annualHoursSaved > 0);

  const waterfalls = calculateDepartmentWaterfalls({
    departments: SEED_DEPARTMENTS,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
  });
  assert.ok(waterfalls.length > 0);
  for (const row of waterfalls) {
    assert.equal(
      row.netFinancialBenefitEur,
      row.cashSavingsEur + row.costAvoidanceEur - row.incrementalAiCostsEur
    );
  }

  // Cost center net benefit is strictly calculated only when realized benefits have explicit costCenter
  const ccRows = calculateCostCenterNetBenefits({
    departments: SEED_DEPARTMENTS,
    benefits: SEED_BENEFITS,
    costs: SEED_COST_TRANSACTIONS,
  });
  const unattributed = ccRows.find((r) => !r.hasAttributedBenefits);
  assert.ok(unattributed, 'Seed data should include cost center without attributed benefits');
  assert.equal(unattributed.netFinancialBenefitEur, null);

  const attributed = ccRows.find((r) => r.hasAttributedBenefits);
  assert.ok(attributed, 'Seed data should include cost center with explicit benefit attribution');
  assert.equal(
    attributed.netFinancialBenefitEur,
    attributed.cashSavingsEur +
      attributed.costAvoidanceEur -
      attributed.actualAiCostsEur
  );
});

test('Cost Import normalization validates required fields and preserves planned vs actual spend', () => {
  const headers = [
    'Department',
    'Cost Center',
    'Period',
    'AI Platform',
    'Cost Category',
    'Spend Type',
    'Amount EUR',
    'Tokens',
  ];
  const mappings = suggestCostColumnMappings(headers);
  const res = validateAndNormalizeCostImportBatch({
    rows: [
      {
        Department: 'Finance',
        'Cost Center': 'CC-FIN-200',
        Period: '2026-11',
        'AI Platform': 'Azure OpenAI Service',
        'Cost Category': 'LLM Tokens',
        'Spend Type': 'Actual',
        'Amount EUR': '€4,250',
        Tokens: '12000000',
      },
      {
        Department: 'Finance',
        'Cost Center': 'CC-FIN-200',
        Period: 'bad-period',
        'AI Platform': 'Azure OpenAI Service',
        'Cost Category': 'UnknownCat',
        'Spend Type': 'Planned',
        'Amount EUR': '-50',
        Tokens: '0',
      },
    ],
    mappings,
    departments: SEED_DEPARTMENTS,
  });

  assert.equal(res.validRows.length, 1);
  assert.equal(res.invalidRows.length, 1);
  assert.equal(res.validRows[0].costCategory, CostCategory.TOKENS_API);
  assert.equal(res.validRows[0].spendType, 'ACTUAL');
  assert.equal(res.validRows[0].amountEur, 4250);
  assert.equal(res.validRows[0].tokens, 12000000);
});

test('Redundancy Engine evaluates strictly Idea..Pilot stages and persists Governance review decisions', async () => {
  const analysis = computeRedundancyAnalysis(SEED_INITIATIVES, 24);
  const expectedEligible = SEED_INITIATIVES.filter((i) =>
    ELIGIBLE_REDUNDANCY_STATUSES.has(i.lifecycleStatus)
  ).length;
  assert.equal(analysis.eligibleInitiativesCount, expectedEligible);
  assert.ok(analysis.candidatePairs.length >= 1);

  for (const pair of analysis.candidatePairs) {
    assert.ok(ELIGIBLE_REDUNDANCY_STATUSES.has(pair.initiativeA.lifecycleStatus));
    assert.ok(ELIGIBLE_REDUNDANCY_STATUSES.has(pair.initiativeB.lifecycleStatus));
    assert.equal(pair.isDemoHeuristic, true);
  }

  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    autoHydrate: false,
  });

  const pair = analysis.candidatePairs[0];
  const saved = await repo.saveRedundancyReview(
    {
      pairKey: buildCanonicalPairKey(pair.initiativeA.id, pair.initiativeB.id),
      initiativeAId: pair.initiativeA.id,
      initiativeBId: pair.initiativeB.id,
      heuristicScore: pair.heuristicScore,
      disposition: RedundancyDisposition.REUSE_OPPORTUNITY,
      collaborationRecommendation:
        'Consolidate ingestion prompts into shared Legal & Procurement workspace.',
    },
    governanceElena
  );
  assert.equal(saved.disposition, RedundancyDisposition.REUSE_OPPORTUNITY);
  assert.equal(saved.reviewerName, governanceElena.displayName);

  const reviews = await repo.listRedundancyReviews();
  assert.ok(reviews.some((r) => r.pairKey === pair.pairKey));
});

test('Lifecycle Lead Time (Idea -> Production), Production Aging, Stage Time, and Stored Transitions', () => {
  const prodInit = SEED_INITIATIVES.find(
    (i) => i.lifecycleStatus === LifecycleStatus.PRODUCTION && i.goLiveDate
  )!;
  const prodLeadTime = computeDevelopmentLeadTimeDays(prodInit, SEED_LIFECYCLE_EVENTS);
  assert.ok(prodLeadTime !== null && prodLeadTime >= 0);

  const prodAging = computeProductionAgingDays(
    prodInit,
    SEED_LIFECYCLE_EVENTS,
    new Date('2026-11-15T00:00:00.000Z')
  );
  assert.ok(prodAging !== null && prodAging >= 0);

  const stageBreakdown = computeStageTimeBreakdown(
    prodInit,
    SEED_LIFECYCLE_EVENTS,
    new Date('2026-11-15T00:00:00.000Z')
  );
  assert.ok(stageBreakdown.length >= 1);

  // Pilot initiatives have not reached Production yet, so Idea -> Production lead time is null
  const pilotInit = SEED_INITIATIVES.find(
    (i) => i.lifecycleStatus === LifecycleStatus.PILOT
  )!;
  assert.equal(computeDevelopmentLeadTimeDays(pilotInit, SEED_LIFECYCLE_EVENTS), null);
  assert.equal(computeProductionAgingDays(pilotInit, SEED_LIFECYCLE_EVENTS), null);

  const aging = computeStageAgingDays(
    pilotInit,
    SEED_LIFECYCLE_EVENTS,
    new Date('2026-11-15T00:00:00.000Z')
  );
  assert.ok(aging !== null && aging >= 0);

  const completeReport = computeInitiativeCompleteness({
    ...pilotInit,
    valueCategory: ValueCategory.EFFICIENCY,
    hourlyRate: undefined,
  });
  assert.ok(completeReport.missingFields.includes('Hourly Rate (Efficiency)'));
  assert.ok(completeReport.scorePercent < 100);

  // Stored transitions only count real fromStatus -> toStatus events
  const realTransitions = computeStoredLifecycleTransitions(SEED_LIFECYCLE_EVENTS);
  assert.ok(realTransitions.length > 0);
  const initialOnly = computeStoredLifecycleTransitions([
    {
      id: 'evt-init-only',
      initiativeId: 'init-x',
      fromStatus: null,
      toStatus: LifecycleStatus.IDEA,
      actorId: 'u1',
      actorName: 'User',
      timestamp: '2026-10-01T00:00:00.000Z',
      note: 'Registered',
      isGovernedException: false,
    },
  ]);
  assert.equal(initialOnly.length, 0);
});

test('Bilingual German/English decimals & dates, incomplete row staging, conflict checks, and mapping templates', async () => {
  assert.equal(parseNumericCell('1.250,50'), 1250.5);
  assert.equal(parseNumericCell('24,5'), 24.5);
  assert.equal(parseNumericCell('€4,250.75'), 4250.75);
  assert.equal(normalizeDateCell('18.08.2026'), '2026-08-18');
  assert.equal(normalizeDateCell('2026-08-18'), '2026-08-18');

  const headers = [
    'ID',
    'Anwendungsfall',
    'Fachbereich',
    'Lebenszyklusstatus',
    'Nutzenkategorie',
    'Eingesparte Minuten',
    'Erstellungsdatum',
    'Zuletzt geandert',
  ];
  const mappings = suggestInitiativeColumnMappings(headers, { useMockProvider: true });
  const mapByHeader = new Map(mappings.map((m) => [m.sourceHeader, m.targetField]));
  assert.equal(mapByHeader.get('Anwendungsfall'), 'title');
  assert.equal(mapByHeader.get('Fachbereich'), 'department');
  assert.equal(mapByHeader.get('Lebenszyklusstatus'), 'lifecycleStatus');
  assert.equal(mapByHeader.get('Nutzenkategorie'), 'valueCategory');
  assert.equal(mapByHeader.get('Erstellungsdatum'), 'createdAt');
  assert.equal(mapByHeader.get('Zuletzt geandert'), 'updatedAt');

  // Duplicate target-field conflict detection
  const conflicted = mappings.map((m) =>
    m.sourceHeader === 'Anwendungsfall' ? { ...m, targetField: 'department' as const } : m
  );
  const conflicts = findDuplicateTargetFieldConflicts(conflicted);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].targetField, 'department');

  // Incomplete rows with allowIncompleteRecords=true get flagged without fabrication
  const validation = validateAndNormalizeInitiativeImportBatch({
    rows: [
      {
        ID: 'SP-DE-1',
        Anwendungsfall: 'Rechnungsprüfung KI',
        Fachbereich: 'Finance',
        Lebenszyklusstatus: 'Pilotierung',
        Nutzenkategorie: 'Effizienz',
        'Eingesparte Minuten': '15,5',
        Erstellungsdatum: '12.05.2026',
        'Zuletzt geandert': '18.08.2026',
      },
    ],
    mappings,
    departments: SEED_DEPARTMENTS,
    users: SEED_USERS,
    allowIncompleteRecords: true,
  });

  assert.equal(validation.validRows.length, 1);
  const row = validation.validRows[0];
  assert.equal(row.lifecycleStatus, LifecycleStatus.PILOT);
  assert.equal(row.valueCategory, ValueCategory.EFFICIENCY);
  assert.equal(row.minutesSavedPerOccurrence, 15.5);
  assert.equal(row.ideaDate, '2026-05-12');
  assert.equal(row.businessProblem, '');
  assert.equal(row.needsDataCompletion, true);
  assert.ok(row.missingDataFields.includes('Business Problem'));
  assert.ok(row.missingDataFields.includes('Accountable Owner'));

  // Persist mapping template via DemoRepository
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    autoHydrate: false,
  });
  const savedTpl = await repo.saveMappingTemplate({
    name: 'German SharePoint Export',
    mappings: mappings.map((m) => ({
      sourceHeader: m.sourceHeader,
      targetField: m.targetField,
    })),
  });
  const tpls = await repo.listMappingTemplates();
  assert.equal(tpls.length, 1);
  assert.equal(tpls[0].name, 'German SharePoint Export');

  const applied = applyMappingTemplate(
    headers,
    savedTpl.mappings,
    suggestInitiativeColumnMappings(headers)
  );
  assert.equal(applied[0].method, 'TEMPLATE');
});

