import test from 'node:test';
import assert from 'node:assert/strict';
import { AppRepositoryError } from '../domain/errors';
import {
  DEFAULT_LIFECYCLE_LIST_MAPPINGS,
  DEFAULT_SHAREPOINT_COLUMN_MAPPINGS,
  DEFAULT_USAGE_LIST_MAPPINGS,
  diagnoseSharePointColumns,
  DiscoveredSharePointColumn,
  mapSharePointItemToInitiative,
  mapSharePointItemToLifecycleEvent,
  mapSharePointItemToUsageSnapshot,
  redactSensitiveTokens,
} from '../domain/sharepointMapping';
import {
  LifecycleStatus,
  RegistrableCategory,
  ValueCategory,
} from '../domain/types';
import { SharePointInitiativeRepository } from '../repositories/sharePointInitiativeRepository';
import { SEED_DEPARTMENTS, SEED_USERS } from '../repositories/seedData';
import { GraphSharePointClient } from '../services/graphSharePointClient';
import { MsalAuthState } from '../services/msalAuthService';
import { createDefaultSharePointConfig } from '../services/sharepointConfig';

test('mapSharePointItemToInitiative maps configurable internal column names to typed Initiative', () => {
  const customMappings = {
    ...DEFAULT_SHAREPOINT_COLUMN_MAPPINGS,
    businessProblem: 'field_2',
    usersCount: 'field_9',
  };

  const result = mapSharePointItemToInitiative(
    {
      id: '42',
      eTag: '"etag-42-v1"',
      createdDateTime: '2026-10-01T08:00:00.000Z',
      lastModifiedDateTime: '2026-11-10T12:00:00.000Z',
      fields: {
        InitiativeId: 'init-sp-42',
        Title: 'Supplier Contract Renewal Copilot',
        field_2: 'Procurement specialists manually review renewal clauses.',
        Description: 'Copilot workspace extracting renewal notice windows.',
        BusinessCapability: 'Vendor Contract Management',
        Department: 'Procurement',
        AccountableOwner: 'Sarah Chen',
        AIPlatform: 'Microsoft Copilot Studio',
        SolutionType: 'Enterprise Copilot Extension',
        AIType: 'Generative AI / LLM',
        RegistryCategory: 'AI Agent',
        LifecycleStatus: 'Pilot',
        ValueCategory: 'Efficiency Savings',
        field_9: '24',
        MinutesSavedPerOccurrence: 15,
        ProcessFrequencyPerWeek: 10,
        HourlyRate: 70,
        IdeaDate: '2026-09-15',
        VersionNumber: 2,
      },
    },
    {
      siteId: 'site-1',
      listId: 'list-1',
      columnMappings: customMappings,
      departments: SEED_DEPARTMENTS,
      users: SEED_USERS,
      nowIso: '2026-11-16T09:00:00.000Z',
    }
  );

  assert.ok(result.initiative);
  assert.equal(result.issues.length, 0);
  assert.equal(result.initiative.id, 'init-sp-42');
  assert.equal(result.initiative.title, 'Supplier Contract Renewal Copilot');
  assert.equal(result.initiative.departmentId, 'dept-proc');
  assert.equal(result.initiative.ownerId, 'user-sarah');
  assert.equal(result.initiative.category, RegistrableCategory.AI_AGENT);
  assert.equal(result.initiative.lifecycleStatus, LifecycleStatus.PILOT);
  assert.equal(result.initiative.valueCategory, ValueCategory.EFFICIENCY);
  assert.equal(result.initiative.usersCount, 24);
  assert.equal(result.initiative.version, 2);
  assert.equal(result.initiative.syncLinkage.sourceSystem, 'MICROSOFT_LISTS');
  assert.equal(result.initiative.syncLinkage.itemId, '42');
});

test('mapSharePointItemToInitiative surfaces errors on missing title and warnings on invalid numerics', () => {
  const missingTitle = mapSharePointItemToInitiative(
    { id: '99', fields: {} },
    {
      siteId: 'site-1',
      listId: 'list-1',
      columnMappings: DEFAULT_SHAREPOINT_COLUMN_MAPPINGS,
    }
  );
  assert.equal(missingTitle.initiative, undefined);
  assert.ok(missingTitle.issues.some((i) => i.severity === 'error'));

  const badNumbers = mapSharePointItemToInitiative(
    {
      id: '100',
      fields: {
        Title: 'Partial Row',
        UsersCount: -5,
        MinutesSavedPerOccurrence: 'not-a-number',
      },
    },
    {
      siteId: 'site-1',
      listId: 'list-1',
      columnMappings: DEFAULT_SHAREPOINT_COLUMN_MAPPINGS,
    }
  );
  assert.ok(badNumbers.initiative);
  assert.equal(badNumbers.initiative.usersCount, 0);
  assert.equal(badNumbers.initiative.minutesSavedPerOccurrence, 0);
  assert.ok(badNumbers.issues.some((i) => i.severity === 'warning'));
});

test('diagnoseSharePointColumns detects matched and missing required SharePoint columns', () => {
  const discovered: DiscoveredSharePointColumn[] = [
    {
      id: 'c1',
      name: 'Title',
      displayName: 'Title',
      columnType: 'text',
      required: true,
      readOnly: false,
      indexed: true,
    },
    {
      id: 'c2',
      name: 'UsersCount',
      displayName: 'Users Count',
      columnType: 'number',
      required: false,
      readOnly: false,
      indexed: false,
    },
  ];

  const diag = diagnoseSharePointColumns(
    discovered,
    DEFAULT_SHAREPOINT_COLUMN_MAPPINGS
  );
  const titleRow = diag.rows.find((r) => r.domainField === 'title');
  const probRow = diag.rows.find((r) => r.domainField === 'businessProblem');

  assert.equal(titleRow?.status, 'MATCHED');
  assert.equal(probRow?.status, 'MISSING_REQUIRED');
  assert.ok(diag.issues.some((i) => i.severity === 'error' && i.domainField === 'businessProblem'));
});

test('mapSharePointItemToLifecycleEvent and UsageSnapshot preserve stable initiativeId linkage', () => {
  const evt = mapSharePointItemToLifecycleEvent(
    {
      id: '7',
      fields: {
        InitiativeId: 'init-sp-42',
        FromStatus: 'PILOT',
        ToStatus: 'PRODUCTION',
        ActorId: 'user-elena',
        ActorName: 'Elena Vance',
        OccurredAt: '2026-11-12T15:00:00.000Z',
        TransitionNote: 'Approved after pilot telemetry review.',
        IsGovernedException: false,
      },
    },
    DEFAULT_LIFECYCLE_LIST_MAPPINGS
  );

  assert.ok(evt);
  assert.equal(evt.initiativeId, 'init-sp-42');
  assert.equal(evt.fromStatus, LifecycleStatus.PILOT);
  assert.equal(evt.toStatus, LifecycleStatus.PRODUCTION);

  const usage = mapSharePointItemToUsageSnapshot(
    {
      id: '11',
      fields: {
        InitiativeId: 'init-sp-42',
        UsersCount: 30,
        MinutesSavedPerOccurrence: 15,
        ProcessFrequencyPerWeek: 12,
        RecordedAt: '2026-11-15T10:00:00.000Z',
        RecordedBy: 'Sarah Chen',
      },
    },
    DEFAULT_USAGE_LIST_MAPPINGS
  );

  assert.ok(usage);
  assert.equal(usage.initiativeId, 'init-sp-42');
  assert.equal(usage.usersCount, 30);
});

test('GraphSharePointClient handles @odata.nextLink pagination and redacts tokens from errors', async () => {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (!url.includes('skiptoken=page2')) {
      return new Response(
        JSON.stringify({
          value: [{ id: '1', fields: { Title: 'Item 1' } }],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/sites/s1/lists/l1/items?$skiptoken=page2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        value: [{ id: '2', fields: { Title: 'Item 2' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const client = new GraphSharePointClient({
    getAccessToken: async () => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig1234567890',
    fetchImpl: fakeFetch,
  });

  const result = await client.fetchAllListItems('s1', 'l1');
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.items.length, 2);
  assert.equal(calls.length, 2);

  const redacted = redactSensitiveTokens(
    'Failed with Bearer abc.def.ghi and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig1234567890'
  );
  assert.ok(!redacted.includes('abc.def.ghi'));
  assert.ok(!redacted.includes('sig1234567890'));
});

test('SharePointInitiativeRepository supports read-only reads, diagnostics without tokens, and blocks all writes', async () => {
  const config = {
    ...createDefaultSharePointConfig(),
    tenantId: 'tenant-123',
    clientId: 'client-456',
    siteId: 'site-1',
    registryListId: 'list-registry',
    lifecycleListId: 'list-lifecycle',
  };

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/sites/site-1?$select=id,name,displayName,webUrl')) {
      return new Response(
        JSON.stringify({
          id: 'site-1',
          name: 'ai-gov',
          displayName: 'AAS AI Governance Hub',
          webUrl: 'https://contoso.sharepoint.com/sites/ai-gov',
        }),
        { status: 200 }
      );
    }
    if (url.includes('/lists/list-registry?$expand=columns')) {
      return new Response(
        JSON.stringify({
          id: 'list-registry',
          name: 'AI_Registry',
          displayName: 'AI Registry',
          columns: [
            { id: '1', name: 'Title', displayName: 'Title', text: {}, required: true },
            { id: '2', name: 'InitiativeId', displayName: 'InitiativeId', text: {} },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('/lists/list-registry/items')) {
      return new Response(
        JSON.stringify({
          value: [
            {
              id: '10',
              eTag: '"etag-10"',
              fields: {
                InitiativeId: 'init-sp-10',
                Title: 'Read-Only SharePoint Item',
                BusinessProblem: 'Manual ticket tagging.',
                Description: 'LLM classifier for support queue.',
                BusinessCapability: 'Service Desk Triage',
                Department: 'Customer Operations',
                AccountableOwner: 'Priya Nair',
                RegistryCategory: 'AI_AUTOMATION',
                LifecycleStatus: 'PRODUCTION',
                ValueCategory: 'EFFICIENCY',
                UsersCount: 14,
                MinutesSavedPerOccurrence: 5,
                ProcessFrequencyPerWeek: 40,
                IdeaDate: '2026-08-01',
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes('/lists/list-lifecycle?$expand=columns')) {
      return new Response(
        JSON.stringify({
          id: 'list-lifecycle',
          name: 'AI_Lifecycle_History',
          displayName: 'AI Lifecycle History',
          columns: [{ id: '1', name: 'InitiativeId', displayName: 'InitiativeId', text: {} }],
        }),
        { status: 200 }
      );
    }
    if (url.includes('/lists/list-lifecycle/items')) {
      return new Response(
        JSON.stringify({
          value: [
            {
              id: '501',
              fields: {
                InitiativeId: 'init-sp-10',
                FromStatus: 'PILOT',
                ToStatus: 'PRODUCTION',
                ActorId: 'user-elena',
                ActorName: 'Elena Vance',
                OccurredAt: '2026-10-15T12:00:00.000Z',
                TransitionNote: 'Promoted to production.',
                IsGovernedException: false,
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ error: { message: 'Not mocked' } }), { status: 404 });
  };

  const client = new GraphSharePointClient({
    getAccessToken: async () => 'secret-access-token-should-never-leak',
    fetchImpl: fakeFetch,
  });

  const authState: MsalAuthState = {
    configured: true,
    initialized: true,
    status: 'SIGNED_IN',
    account: {
      displayName: 'Elena Vance',
      username: 'elena.vance@contoso.onmicrosoft.com',
      tenantId: 'tenant-123',
      localAccountId: 'oid-elena',
      roles: ['Governance.Manage'],
    },
    grantedScopes: ['User.Read', 'Sites.Read.All'],
    tokenExpiresOn: '2026-11-16T18:00:00.000Z',
    lastError: null,
  };

  const repo = new SharePointInitiativeRepository({
    config,
    getClient: () => client,
    getAuthState: () => authState,
  });

  const items = await repo.listInitiatives();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'init-sp-10');

  const detail = await repo.getInitiative('init-sp-10');
  assert.equal(detail.lifecycleHistory.length, 1);
  assert.equal(detail.lifecycleHistory[0].toStatus, LifecycleStatus.PRODUCTION);

  const diag = await repo.runDiagnostics();
  assert.equal(diag.siteCheck.accessible, true);
  assert.equal(diag.registryListCheck.accessible, true);
  assert.equal(diag.registryListCheck.mappedItemsCount, 1);
  assert.equal(diag.secondaryLists[0].accessible, true);
  assert.ok(!JSON.stringify(diag).includes('secret-access-token-should-never-leak'));

  // Step 4: Verify all write methods remain disabled
  const sarah = SEED_USERS.find((u) => u.id === 'user-sarah')!;
  await assert.rejects(
    () =>
      repo.createInitiative(
        {
          title: 'New Idea',
          businessProblem: 'Manual work.',
          description: 'Automated workflow.',
          businessCapability: 'Ops',
          departmentId: 'dept-ops',
          ownerId: sarah.id,
          aiPlatform: 'Microsoft Copilot Studio',
          solutionType: 'Enterprise Copilot Extension',
          aiType: 'Generative AI / LLM',
          category: RegistrableCategory.AI_AGENT,
          lifecycleStatus: LifecycleStatus.IDEA,
          valueCategory: ValueCategory.EFFICIENCY,
          usersCount: 5,
          minutesSavedPerOccurrence: 10,
          processFrequencyPerWeek: 3,
          ideaDate: '2026-11-16',
        },
        sarah
      ),
    (err: unknown) =>
      err instanceof AppRepositoryError && err.code === 'FORBIDDEN'
  );

  await assert.rejects(
    () =>
      repo.updateInitiative(
        { id: 'init-sp-10', expectedVersion: 1, patch: { usersCount: 20 } },
        sarah
      ),
    (err: unknown) =>
      err instanceof AppRepositoryError && err.code === 'FORBIDDEN'
  );

  await assert.rejects(
    () =>
      repo.recordLifecycleEvent(
        {
          initiativeId: 'init-sp-10',
          expectedVersion: 1,
          toStatus: LifecycleStatus.MONITORING,
          note: 'Testing write lock.',
        },
        sarah
      ),
    (err: unknown) =>
      err instanceof AppRepositoryError && err.code === 'FORBIDDEN'
  );

  await assert.rejects(
    () =>
      repo.markOwnerReviewed(
        { initiativeId: 'init-sp-10', expectedVersion: 1 },
        sarah
      ),
    (err: unknown) =>
      err instanceof AppRepositoryError && err.code === 'FORBIDDEN'
  );
});
