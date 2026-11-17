import test from 'node:test';
import assert from 'node:assert/strict';
import { AppRepositoryError } from '../domain/errors';
import {
  LifecycleStatus,
  RegistrableCategory,
  ValueCategory,
} from '../domain/types';
import {
  MemoryStorageBackend,
  MockInitiativeRepository,
} from '../repositories/mockInitiativeRepository';
import { SEED_USERS } from '../repositories/seedData';
import { MockAiProvider } from '../services/aiProvider';

function createTestRepo(fixedIso = '2026-11-16T10:00:00.000Z') {
  const storage = new MemoryStorageBackend();
  const repo = new MockInitiativeRepository({
    storage,
    nowProvider: () => new Date(fixedIso),
  });
  return repo;
}

test('employee can create and edit own initiative, but cannot edit another employee initiative', async () => {
  const repo = createTestRepo();
  const sarah = SEED_USERS.find((u) => u.id === 'user-sarah')!;
  const marcus = SEED_USERS.find((u) => u.id === 'user-marcus')!;

  const created = await repo.createInitiative(
    {
      title: 'Treasury Cashflow Forecast Copilot',
      businessProblem: 'Manual weekly cashflow spreadsheet consolidation.',
      description: 'Copilot extension summarizing multi-currency bank positions.',
      businessCapability: 'Treasury & Liquidity Management',
      departmentId: 'dept-proc',
      ownerId: sarah.id,
      aiPlatform: 'Microsoft Copilot Studio',
      solutionType: 'Enterprise Copilot Extension',
      aiType: 'Generative AI / LLM',
      category: RegistrableCategory.AI_ENHANCED_APP,
      lifecycleStatus: LifecycleStatus.IDEA,
      valueCategory: ValueCategory.EFFICIENCY,
      usersCount: 8,
      minutesSavedPerOccurrence: 20,
      processFrequencyPerWeek: 5,
      hourlyRate: 65,
      ideaDate: '2026-11-16',
    },
    sarah
  );

  assert.equal(created.version, 1);

  const updated = await repo.updateInitiative(
    {
      id: created.id,
      expectedVersion: created.version,
      patch: { usersCount: 10 },
    },
    sarah
  );
  assert.equal(updated.usersCount, 10);
  assert.equal(updated.version, 2);

  // Marcus (another EMPLOYEE) cannot edit Sarah's initiative
  await assert.rejects(
    async () => {
      await repo.updateInitiative(
        {
          id: created.id,
          expectedVersion: updated.version,
          patch: { title: 'Unauthorized Title Change' },
        },
        marcus
      );
    },
    (err: unknown) =>
      err instanceof AppRepositoryError && err.code === 'FORBIDDEN'
  );
});

test('optimistic concurrency rejects stale expectedVersion updates', async () => {
  const repo = createTestRepo();
  const elena = SEED_USERS.find((u) => u.id === 'user-elena')!;

  const detail = await repo.getInitiative('init-2001');
  await repo.updateInitiative(
    {
      id: detail.initiative.id,
      expectedVersion: detail.initiative.version,
      patch: { usersCount: 20 },
    },
    elena
  );

  await assert.rejects(
    async () => {
      await repo.updateInitiative(
        {
          id: detail.initiative.id,
          expectedVersion: detail.initiative.version, // stale version
          patch: { usersCount: 22 },
        },
        elena
      );
    },
    (err: unknown) =>
      err instanceof AppRepositoryError && err.code === 'CONCURRENCY_CONFLICT'
  );
});

test('lifecycle change records immutable event and markOwnerReviewed advances nextReviewDue', async () => {
  const repo = createTestRepo('2026-11-16T10:00:00.000Z');
  const elena = SEED_USERS.find((u) => u.id === 'user-elena')!;
  const marcus = SEED_USERS.find((u) => u.id === 'user-marcus')!;

  const before = await repo.getInitiative('init-2001');
  const reviewed = await repo.markOwnerReviewed(
    {
      initiativeId: 'init-2001',
      expectedVersion: before.initiative.version,
    },
    marcus
  );

  assert.equal(reviewed.lastOwnerReviewAt, '2026-11-16T10:00:00.000Z');
  assert.equal(reviewed.nextReviewDue, '2026-12-16T10:00:00.000Z');

  const transition = await repo.recordLifecycleEvent(
    {
      initiativeId: 'init-2001',
      expectedVersion: reviewed.version,
      toStatus: LifecycleStatus.SCALE_IMPROVE,
      note: 'Expanding BOM verification to APAC plants.',
    },
    elena
  );

  assert.equal(transition.initiative.lifecycleStatus, LifecycleStatus.SCALE_IMPROVE);
  const after = await repo.getInitiative('init-2001');
  assert.equal(after.lifecycleHistory.length, before.lifecycleHistory.length + 1);
  assert.equal(after.lifecycleHistory[0].toStatus, LifecycleStatus.SCALE_IMPROVE);
});

test('MockAiProvider computes deterministic demo-labeled similarity matches strictly from repository data', async () => {
  const repo = createTestRepo();
  const ai = new MockAiProvider(repo);

  const matches = await ai.findSimilarInitiatives({
    queryText: 'CAD BOM revision drawings extraction engineering change control assistant',
    departmentId: 'dept-eng',
  });

  assert.ok(matches.length > 0);
  assert.equal(matches[0].initiative.id, 'init-2001');
  assert.equal(matches[0].isDemoOnly, true);
  assert.ok(matches[0].disclaimer.includes('Demo similarity preview'));
});
