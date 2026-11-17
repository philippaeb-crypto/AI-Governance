import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePortfolioFinancialSummary } from '../domain/financials';
import { computeRedundancyAnalysis } from '../domain/redundancy';
import {
  addBusinessDays,
  buildDecisionAssistantRecommendation,
  canEscalateToBoard,
  computeCaseDeadlines,
  computeCaseSlaStatus,
  computeNextBoardMeetingDate,
  computeRedundancyPortfolioMetrics,
  countOverdueBusinessDays,
  DEFAULT_REDUNDANCY_DEADLINE_CONFIG,
  getCaseProcessStep,
  hasOwnerDisagreement,
  migrateLegacyRedundancyCase,
  REDUNDANCY_PROCESS_STEPS,
  verifyNoSynergyDoubleCounting,
} from '../domain/redundancyWorkflow';
import {
  LifecycleStatus,
  normalizeRedundancyCaseStatus,
  RedundancyCaseStatus,
} from '../domain/types';
import { DemoRepository } from '../repositories/demoRepository';
import { MemoryWorkspacePersistence } from '../repositories/indexedDbStore';
import { SEED_USERS } from '../repositories/seedData';

const govUser = SEED_USERS.find((u) => u.id === 'user-elena')!;
const ownerMarcus = SEED_USERS.find((u) => u.id === 'user-marcus')!;
const ownerPriya = SEED_USERS.find((u) => u.id === 'user-priya')!;

test('1. Duplicate match does not create duplicate case across createRedundancyCase and syncActiveMatchesToRedundancyCases', async () => {
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-16T12:00:00.000Z'),
    autoHydrate: false,
  });

  const initialCases = await repo.listRedundancyCases();
  // Seed already has rc-2001 (init-2004 <-> init-2012) and rc-2002 (init-2003 <-> init-2014)
  const dupAttempt = await repo.createRedundancyCase(
    { initiativeAId: 'init-2012', initiativeBId: 'init-2004' }, // Reversed order!
    govUser
  );
  assert.equal(dupAttempt.created, false);
  assert.equal(dupAttempt.redundancyCase.id, 'rc-2001');

  const sync1 = await repo.syncActiveMatchesToRedundancyCases(govUser);
  // Only init-2009 <-> init-2015 had no seeded case yet
  assert.equal(sync1.createdCount, 1);
  assert.ok(sync1.skippedExistingCount >= 2);

  // Re-running sync immediately creates 0 duplicates
  const sync2 = await repo.syncActiveMatchesToRedundancyCases(govUser);
  assert.equal(sync2.createdCount, 0);
  assert.equal(sync2.cases.length, initialCases.length + 1);
});

test('2. Owner disagreement enables escalation & Decision Assistant recommends Board review', async () => {
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-16T12:00:00.000Z'),
    autoHydrate: false,
  });

  // Sync so init-2009 <-> init-2015 gets a fresh case
  const sync = await repo.syncActiveMatchesToRedundancyCases(govUser);
  const freshCase = sync.cases.find(
    (c) =>
      (c.initiativeAId === 'init-2009' && c.initiativeBId === 'init-2015') ||
      (c.initiativeAId === 'init-2015' && c.initiativeBId === 'init-2009')
  )!;
  assert.ok(freshCase);
  assert.equal(hasOwnerDisagreement(freshCase), false);

  await repo.addRedundancyDiscussionNote(
    {
      caseId: freshCase.id,
      applyToSide: 'A',
      stance: 'AGREED',
      note: 'Procurement supports reusing analytics shift digest summary.',
    },
    govUser
  );
  const afterConflict = await repo.addRedundancyDiscussionNote(
    {
      caseId: freshCase.id,
      applyToSide: 'B',
      stance: 'DISAGREED',
      note: 'Analytics requires isolated scheduling taxonomy and objects to merge.',
    },
    govUser
  );

  assert.equal(hasOwnerDisagreement(afterConflict), true);
  const escalCheck = canEscalateToBoard(afterConflict);
  assert.equal(escalCheck.allowed, true);
  assert.ok(
    escalCheck.reasons.some((r) => r.toLowerCase().includes('disagree'))
  );

  const rec = buildDecisionAssistantRecommendation(afterConflict);
  assert.equal(rec.boardEscalationRecommended, true);
  assert.ok(rec.boardEscalationReason);

  const escalated = await repo.escalateRedundancyCaseToBoard(
    {
      caseId: freshCase.id,
      escalationReason: 'Unresolved owner disagreement on scope consolidation.',
    },
    govUser
  );
  assert.equal(escalated.redundancyCase.status, 'ESCALATED');
  assert.equal(escalated.boardDecision.status, 'PENDING');
});

test('3. AI Governance Board decision is recorded without silently mutating initiative lifecycleStatus', async () => {
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-18T10:00:00.000Z'),
    autoHydrate: false,
  });

  const beforeA = await repo.getInitiative('init-2003');
  const beforeB = await repo.getInitiative('init-2014');

  const res = await repo.recordBoardDecision(
    {
      caseId: 'rc-2002',
      decisionOutcome: 'PAUSE',
      boardRationale:
        'Board mandates pausing duplicate extractor build in Site Service until shared OCR benchmark passes.',
      investmentImplications: 'Defers €45,000 duplicate build allocation.',
      followUpRequired: true,
    },
    govUser
  );

  assert.equal(res.boardDecision.status, 'DECIDED');
  assert.equal(res.boardDecision.decisionOutcome, 'PAUSE');
  assert.equal(res.redundancyCase.status, 'ACTION_AGREED');

  const detail = await repo.getRedundancyCaseDetail('rc-2002');
  assert.ok(
    detail.events.some((e) => e.eventType === 'BOARD_DECISION_RECORDED')
  );

  // Lifecycle stages must NOT have been mutated automatically
  const afterA = await repo.getInitiative('init-2003');
  const afterB = await repo.getInitiative('init-2014');
  assert.equal(afterA.initiative.lifecycleStatus, beforeA.initiative.lifecycleStatus);
  assert.equal(afterB.initiative.lifecycleStatus, beforeB.initiative.lifecycleStatus);
  assert.notEqual(afterB.initiative.lifecycleStatus, LifecycleStatus.RETIRE);
});

test('4. Completing overdue actions immediately updates portfolio metrics', async () => {
  const fixedNow = new Date('2026-11-16T12:00:00.000Z');
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => fixedNow,
    autoHydrate: false,
  });

  const [inits, casesBefore, actionsBefore] = await Promise.all([
    repo.listInitiatives(),
    repo.listRedundancyCases(),
    repo.listRedundancyActions(),
  ]);
  const analysis = computeRedundancyAnalysis(inits);
  const metricsBefore = computeRedundancyPortfolioMetrics({
    initiatives: inits,
    analysis,
    cases: casesBefore,
    actions: actionsBefore,
    now: fixedNow,
  });

  // act-2001-2 is seeded as IN_PROGRESS with dueDate 2026-11-12 (overdue on 2026-11-16)
  assert.equal(metricsBefore.actionsOverdueCount, 1);
  const prevCompleted = metricsBefore.actionsCompletedCount;

  const targetAction = actionsBefore.find((a) => a.id === 'act-2001-2')!;
  const assignedOwner =
    SEED_USERS.find((u) => u.id === targetAction.ownerId) ?? govUser;
  await repo.saveRedundancyAction(
    {
      id: targetAction.id,
      caseId: targetAction.caseId,
      title: targetAction.title,
      description: targetAction.description,
      ownerId: targetAction.ownerId,
      dueDate: targetAction.dueDate,
      status: 'COMPLETED',
      completionNotes: 'Adapter deployed in Analytics workspace.',
    },
    assignedOwner
  );

  const actionsAfter = await repo.listRedundancyActions();
  const metricsAfter = computeRedundancyPortfolioMetrics({
    initiatives: inits,
    analysis,
    cases: casesBefore,
    actions: actionsAfter,
    now: fixedNow,
  });

  assert.equal(metricsAfter.actionsOverdueCount, 0);
  assert.equal(metricsAfter.actionsCompletedCount, prevCompleted + 1);
});

test('5. Business-day overdue dates, holidays, immediate overdue flag, 10-bd follow-up, and monthly Board date calculate accurately', () => {
  const cfg = {
    ...DEFAULT_REDUNDANCY_DEADLINE_CONFIG,
    holidays: ['2026-11-18'],
  };

  // Start Mon 2026-11-16 + 5 business days (skipping Wed 2026-11-18 holiday + Sat/Sun Nov 21-22) => Tue 2026-11-24
  assert.equal(addBusinessDays('2026-11-16', 5, cfg.holidays), '2026-11-24');

  const deadlines = computeCaseDeadlines('2026-11-16T09:00:00.000Z', cfg);
  assert.equal(deadlines.triageDueAt, '2026-11-24');

  // Overdue business day count skipping weekends & holiday
  assert.equal(countOverdueBusinessDays('2026-11-16', '2026-11-16', cfg.holidays), 0);
  assert.equal(countOverdueBusinessDays('2026-11-16', '2026-11-19', cfg.holidays), 2); // Tue 17, Thu 19 (Wed 18 holiday skipped)

  // Immediate overdue flag + 10-business-day follow-up review due
  const slaOnNov27 = computeCaseSlaStatus(
    {
      id: 'rc-x',
      caseNumber: 'RC-X',
      pairKey: 'a::b',
      initiativeAId: 'a',
      initiativeBId: 'b',
      initiativeASnapshot: {
        id: 'a',
        title: 'A',
        departmentId: 'dept-eng',
        ownerId: 'u1',
        ownerName: 'O1',
        businessCapability: 'Cap',
        aiPlatform: 'Azure',
        lifecycleStatusAtDetection: LifecycleStatus.IDEA,
      },
      initiativeBSnapshot: {
        id: 'b',
        title: 'B',
        departmentId: 'dept-eng',
        ownerId: 'u2',
        ownerName: 'O2',
        businessCapability: 'Cap',
        aiPlatform: 'Azure',
        lifecycleStatusAtDetection: LifecycleStatus.PILOT,
      },
      heuristicScore: 50,
      matchedKeywords: ['cap'],
      capabilityOverlapSummary: 'Shared',
      similarityExplanation: 'Overlap',
      status: 'ACTION_AGREED',
      detectedAt: '2026-11-01T00:00:00.000Z',
      triagedAt: '2026-11-02T00:00:00.000Z',
      triageDueAt: '2026-11-08',
      ownerAlignmentDueAt: '2026-11-22',
      decisionDueAt: '2026-11-29',
      ownerAStance: 'AGREED',
      ownerBStance: 'AGREED',
      ownerDiscussionNotes: [],
      portfolioManagerRecommendation: '',
      decisionType: 'REUSE',
      decisionRationale: '',
      estimatedAvoidedEffortHours: 0,
      estimatedAvoidedEffortEur: 0,
      estimatedFinancialSynergyEur: 0,
      confirmedFinancialSynergyEur: 0,
      confirmedSynergyEvidence: '',
      synergyEvidenceStatus: 'NONE',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
    [
      {
        id: 'act-1',
        caseId: 'rc-x',
        title: 'Test action',
        description: 'Desc',
        ownerId: 'u1',
        ownerName: 'O1',
        dueDate: '2026-11-12',
        followUpReviewDueAt: addBusinessDays('2026-11-12', 10, cfg.holidays), // Nov 27 (Nov 18 holiday skipped)
        status: 'OPEN',
        completedAt: null,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    cfg,
    new Date('2026-11-27T12:00:00.000Z')
  );
  const eval1 = slaOnNov27.actionEvaluations.get('act-1')!;
  assert.equal(eval1.isOverdue, true);
  assert.equal(eval1.followUpReviewDueAt, '2026-11-27');
  assert.equal(eval1.isFollowUpReviewDue, true);

  // Monthly Board date: if day 15 is Sunday (2026-11-15), rolls forward to Mon 2026-11-16; if past, next month
  assert.equal(computeNextBoardMeetingDate('2026-11-10', 15, []), '2026-11-16');
  assert.equal(computeNextBoardMeetingDate('2026-11-16', 15, []), '2026-12-15');
});

test('6. Closing a redundancy case requires a documented outcome summary and evidenced confirmed synergy', async () => {
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-20T12:00:00.000Z'),
    autoHydrate: false,
  });

  // Short/empty summary rejected
  await assert.rejects(
    () =>
      repo.closeRedundancyCase(
        { caseId: 'rc-2001', closingOutcomeSummary: 'ok' },
        govUser
      ),
    /outcome summary/i
  );

  // Confirmed synergy > 0 without evidence rejected
  await repo.updateRedundancyCase(
    {
      caseId: 'rc-2001',
      confirmedFinancialSynergyEur: 5000,
      synergyEvidenceStatus: 'NONE',
      confirmedSynergyEvidence: '',
    },
    govUser
  );
  await assert.rejects(
    () =>
      repo.closeRedundancyCase(
        {
          caseId: 'rc-2001',
          closingOutcomeSummary: 'Reuse completed across Engineering and Analytics.',
        },
        govUser
      ),
    /evidence/i
  );

  // Document evidence and close cleanly
  await repo.updateRedundancyCase(
    {
      caseId: 'rc-2001',
      synergyEvidenceStatus: 'VERIFIED',
      confirmedSynergyEvidence: 'Finance Cost Center Q4 confirmation #INV-991',
    },
    govUser
  );
  const closed = await repo.closeRedundancyCase(
    {
      caseId: 'rc-2001',
      closingOutcomeSummary:
        'Analytics OCR adapter migrated onto Engineering extraction service; license overlap retired.',
    },
    govUser
  );
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closedBy, govUser.displayName);
});

test('7. Financial synergy & estimated avoided effort NEVER double-count into Net Financial Benefit', async () => {
  const fixedNow = new Date('2026-11-16T12:00:00.000Z');
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => fixedNow,
    autoHydrate: false,
  });

  const [inits, benefits, costs, casesBefore, actions] = await Promise.all([
    repo.listInitiatives(),
    repo.listBenefits(),
    repo.listCostTransactions(),
    repo.listRedundancyCases(),
    repo.listRedundancyActions(),
  ]);

  const finBefore = calculatePortfolioFinancialSummary({
    initiatives: inits,
    benefits,
    costs,
  });

  // Add large avoided effort and confirmed financial synergy on a case
  await repo.updateRedundancyCase(
    {
      caseId: 'rc-2001',
      estimatedAvoidedEffortHours: 500,
      estimatedAvoidedEffortEur: 40000,
      confirmedFinancialSynergyEur: 25000,
      synergyEvidenceStatus: 'VERIFIED',
      confirmedSynergyEvidence: 'Verified Q4 procurement savings note',
    },
    govUser
  );

  const [benefitsAfter, costsAfter, casesAfter] = await Promise.all([
    repo.listBenefits(),
    repo.listCostTransactions(),
    repo.listRedundancyCases(),
  ]);

  const finAfter = calculatePortfolioFinancialSummary({
    initiatives: inits,
    benefits: benefitsAfter,
    costs: costsAfter,
  });
  const redMetrics = computeRedundancyPortfolioMetrics({
    initiatives: inits,
    analysis: computeRedundancyAnalysis(inits),
    cases: casesAfter,
    actions,
    now: fixedNow,
  });

  // Net Financial Benefit remains invariant & strictly Cash Savings + Cost Avoidance - Actual AI Costs
  assert.equal(finAfter.netFinancialBenefitEur, finBefore.netFinancialBenefitEur);
  // Confirmed financial synergy only sums evidenced financial synergy (rc-2003 €14,500 + rc-2001 €25,000 = €39,500), never avoided effort
  assert.equal(redMetrics.confirmedFinancialSynergyValueEur, 39500);
  const expectedAvoidedEur = casesAfter
    .filter((c) => c.decisionType !== 'NOT_REDUNDANT')
    .reduce((sum, c) => sum + c.estimatedAvoidedEffortEur, 0);
  assert.equal(redMetrics.estimatedAvoidedEffortEur, expectedAvoidedEur);
  assert.ok(redMetrics.estimatedAvoidedEffortEur >= 40000);

  const check = verifyNoSynergyDoubleCounting(finAfter, redMetrics);
  assert.equal(check.confirmedSynergyExcludedFromNetBenefit, true);
  assert.equal(check.avoidedEffortExcludedFromConfirmedSynergy, true);
});

test('8. Historical redundancy cases remain retained when an initiative graduates to Production / Retire', async () => {
  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-16T12:00:00.000Z'),
    autoHydrate: false,
  });

  // rc-2003 already references init-2001 (PRODUCTION) and init-2003 (DEVELOPMENT)
  const rc2003 = await repo.getRedundancyCaseDetail('rc-2003');
  assert.equal(rc2003.redundancyCase.status, 'CLOSED');

  // Move init-2014 from ASSESSMENT -> DEVELOPMENT -> PILOT -> PRODUCTION
  let init2014 = (await repo.getInitiative('init-2014')).initiative;
  for (const next of [
    LifecycleStatus.DEVELOPMENT,
    LifecycleStatus.PILOT,
    LifecycleStatus.PRODUCTION,
  ]) {
    const res = await repo.recordLifecycleEvent(
      {
        initiativeId: init2014.id,
        expectedVersion: init2014.version,
        toStatus: next,
        note: `Promoted to ${next}`,
      },
      govUser
    );
    init2014 = res.initiative;
  }
  assert.equal(init2014.lifecycleStatus, LifecycleStatus.PRODUCTION);

  // Active matching no longer includes init-2014 in Idea-Pilot candidate pool,
  // yet existing historical case rc-2002 stays fully intact and accessible!
  const activeAnalysis = computeRedundancyAnalysis(await repo.listInitiatives());
  assert.equal(
    activeAnalysis.candidatePairs.some(
      (p) => p.initiativeA.id === 'init-2014' || p.initiativeB.id === 'init-2014'
    ),
    false
  );
  const rc2002After = await repo.getRedundancyCaseDetail('rc-2002');
  assert.equal(rc2002After.redundancyCase.caseNumber, 'RC-2026-002');
  assert.equal(
    rc2002After.redundancyCase.initiativeBSnapshot.ownerId,
    ownerPriya.id
  );
});

test('9. Streamlined 3-stage workflow migrates legacy statuses cleanly and preserves Board escalation details', async () => {
  assert.equal(REDUNDANCY_PROCESS_STEPS.length, 3);
  assert.deepEqual(
    REDUNDANCY_PROCESS_STEPS.map((s) => s.title),
    ['Review', 'Decide', 'Track']
  );

  assert.equal(normalizeRedundancyCaseStatus('UNDER_REVIEW'), 'IN_REVIEW');
  assert.equal(normalizeRedundancyCaseStatus('OWNER_DISCUSSION'), 'IN_REVIEW');
  assert.equal(normalizeRedundancyCaseStatus('IMPLEMENTATION'), 'ACTION_AGREED');

  assert.equal(getCaseProcessStep('NEW', false), 1);
  assert.equal(getCaseProcessStep('IN_REVIEW', false), 1);
  assert.equal(getCaseProcessStep('ESCALATED', false), 2);
  assert.equal(getCaseProcessStep('ACTION_AGREED', true), 3);
  assert.equal(getCaseProcessStep('CLOSED', true), 3);

  const repo = new DemoRepository({
    persistence: new MemoryWorkspacePersistence(),
    nowProvider: () => new Date('2026-11-18T12:00:00.000Z'),
    autoHydrate: false,
  });

  const detail = await repo.getRedundancyCaseDetail('rc-2001');
  const legacySimulated = migrateLegacyRedundancyCase({
    ...detail.redundancyCase,
    status: 'IMPLEMENTATION' as unknown as RedundancyCaseStatus,
  });
  assert.equal(legacySimulated.status, 'ACTION_AGREED');

  const escal = await repo.escalateRedundancyCaseToBoard(
    {
      caseId: 'rc-2002',
      escalationReason: 'Unresolved platform architecture disagreement.',
      decisionRequested: 'Authorize Engineering shared spec checker as baseline.',
      recommendedOption: 'MERGE',
      investmentImplications: 'Avoids €32,000 duplicate build spend.',
    },
    govUser
  );
  assert.equal(escal.redundancyCase.status, 'ESCALATED');
  assert.equal(
    escal.redundancyCase.decisionRequested,
    'Authorize Engineering shared spec checker as baseline.'
  );
  assert.equal(escal.redundancyCase.recommendedOption, 'MERGE');
  assert.equal(
    escal.boardDecision.decisionRequested,
    'Authorize Engineering shared spec checker as baseline.'
  );
  assert.equal(escal.boardDecision.recommendedOption, 'MERGE');
});
