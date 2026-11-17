import {
  CATEGORY_LABELS,
  CreateInitiativeInput,
  Department,
  Initiative,
  LIFECYCLE_LABELS,
  LifecycleEvent,
  LifecycleStatus,
  RegistrableCategory,
  UserAccount,
  VALUE_CATEGORY_LABELS,
  ValueCategory,
} from './types';
import { computeNextReviewDue } from './calculations';

export type SharePointDomainField =
  | 'initiativeId'
  | 'title'
  | 'businessProblem'
  | 'description'
  | 'businessCapability'
  | 'department'
  | 'owner'
  | 'ownerEmail'
  | 'aiPlatform'
  | 'solutionType'
  | 'aiType'
  | 'category'
  | 'lifecycleStatus'
  | 'valueCategory'
  | 'usersCount'
  | 'minutesSavedPerOccurrence'
  | 'processFrequencyPerWeek'
  | 'hourlyRate'
  | 'ideaDate'
  | 'goLiveDate'
  | 'createdAt'
  | 'updatedAt'
  | 'lastOwnerReviewAt'
  | 'nextReviewDue'
  | 'version';

export type SharePointColumnMappings = Record<SharePointDomainField, string>;

export const DEFAULT_SHAREPOINT_COLUMN_MAPPINGS: SharePointColumnMappings = {
  initiativeId: 'InitiativeId',
  title: 'Title',
  businessProblem: 'BusinessProblem',
  description: 'Description',
  businessCapability: 'BusinessCapability',
  department: 'Department',
  owner: 'AccountableOwner',
  ownerEmail: 'AccountableOwnerEmail',
  aiPlatform: 'AIPlatform',
  solutionType: 'SolutionType',
  aiType: 'AIType',
  category: 'RegistryCategory',
  lifecycleStatus: 'LifecycleStatus',
  valueCategory: 'ValueCategory',
  usersCount: 'UsersCount',
  minutesSavedPerOccurrence: 'MinutesSavedPerOccurrence',
  processFrequencyPerWeek: 'ProcessFrequencyPerWeek',
  hourlyRate: 'HourlyRate',
  ideaDate: 'IdeaDate',
  goLiveDate: 'GoLiveDate',
  createdAt: 'Created',
  updatedAt: 'Modified',
  lastOwnerReviewAt: 'LastOwnerReviewAt',
  nextReviewDue: 'NextReviewDue',
  version: 'VersionNumber',
};

export const REQUIRED_REGISTRY_DOMAIN_FIELDS: ReadonlySet<SharePointDomainField> =
  new Set([
    'title',
    'businessProblem',
    'description',
    'businessCapability',
    'department',
    'owner',
    'category',
    'lifecycleStatus',
    'valueCategory',
    'usersCount',
    'minutesSavedPerOccurrence',
    'processFrequencyPerWeek',
    'ideaDate',
  ]);

export interface LifecycleListColumnMappings {
  initiativeId: string;
  fromStatus: string;
  toStatus: string;
  actorId: string;
  actorName: string;
  occurredAt: string;
  note: string;
  isGovernedException: string;
}

export const DEFAULT_LIFECYCLE_LIST_MAPPINGS: LifecycleListColumnMappings = {
  initiativeId: 'InitiativeId',
  fromStatus: 'FromStatus',
  toStatus: 'ToStatus',
  actorId: 'ActorId',
  actorName: 'ActorName',
  occurredAt: 'OccurredAt',
  note: 'TransitionNote',
  isGovernedException: 'IsGovernedException',
};

export interface UsageListColumnMappings {
  initiativeId: string;
  usersCount: string;
  minutesSavedPerOccurrence: string;
  processFrequencyPerWeek: string;
  recordedAt: string;
  recordedBy: string;
}

export const DEFAULT_USAGE_LIST_MAPPINGS: UsageListColumnMappings = {
  initiativeId: 'InitiativeId',
  usersCount: 'UsersCount',
  minutesSavedPerOccurrence: 'MinutesSavedPerOccurrence',
  processFrequencyPerWeek: 'ProcessFrequencyPerWeek',
  recordedAt: 'RecordedAt',
  recordedBy: 'RecordedBy',
};

export interface FinancialListColumnMappings {
  initiativeId: string;
  fiscalYear: string;
  benefitType: string;
  estimatedAnnualValue: string;
  realizedAnnualValue: string;
  annualRunCost: string;
  implementationCost: string;
  currency: string;
}

export const DEFAULT_FINANCIAL_LIST_MAPPINGS: FinancialListColumnMappings = {
  initiativeId: 'InitiativeId',
  fiscalYear: 'FiscalYear',
  benefitType: 'BenefitType',
  estimatedAnnualValue: 'EstimatedAnnualValue',
  realizedAnnualValue: 'RealizedAnnualValue',
  annualRunCost: 'AnnualRunCost',
  implementationCost: 'ImplementationCost',
  currency: 'Currency',
};

export interface DiscoveredSharePointColumn {
  id: string;
  name: string;
  displayName: string;
  columnType: string;
  required: boolean;
  readOnly: boolean;
  indexed: boolean;
}

export interface ColumnMappingIssue {
  severity: 'error' | 'warning';
  itemId?: string;
  columnName?: string;
  domainField?: string;
  message: string;
}

export interface ColumnDiagnosticRow {
  domainField: SharePointDomainField;
  expectedInternalName: string;
  required: boolean;
  matched: boolean;
  discoveredColumn?: DiscoveredSharePointColumn;
  status: 'MATCHED' | 'MISSING_REQUIRED' | 'MISSING_OPTIONAL';
}

export interface RawSharePointListItem {
  id: string;
  eTag?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  fields?: Record<string, unknown>;
}

export interface UsageTrackingSnapshot {
  id: string;
  initiativeId: string;
  usersCount: number;
  minutesSavedPerOccurrence: number;
  processFrequencyPerWeek: number;
  recordedAt: string;
  recordedBy: string;
}

export function redactSensitiveTokens(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      '[REDACTED_JWT]'
    );
}

function asTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.LookupValue === 'string') return obj.LookupValue.trim();
    if (typeof obj.Email === 'string') return obj.Email.trim();
    if (typeof obj.Title === 'string') return obj.Title.trim();
  }
  return '';
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeIsoDate(value: unknown): string | undefined {
  const raw = asTrimmedString(value);
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function normalizeIsoTimestamp(value: unknown): string | undefined {
  const raw = asTrimmedString(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function normalizeEnumValue<T extends string>(
  rawValue: unknown,
  enumValues: readonly T[],
  labelsMap: Record<T, string>
): T | undefined {
  const raw = asTrimmedString(rawValue);
  if (!raw) return undefined;
  const normalized = raw.toUpperCase().replace(/[\s&-]+/g, '_');

  for (const val of enumValues) {
    if (val === raw || val === normalized) {
      return val;
    }
  }
  for (const val of enumValues) {
    const label = labelsMap[val];
    if (
      label.toLowerCase() === raw.toLowerCase() ||
      label.toUpperCase().replace(/[\s&-]+/g, '_') === normalized
    ) {
      return val;
    }
  }
  return undefined;
}

function getFieldCaseInsensitive(
  fields: Record<string, unknown>,
  internalName: string
): unknown {
  if (internalName in fields) {
    return fields[internalName];
  }
  const lower = internalName.toLowerCase();
  for (const key of Object.keys(fields)) {
    if (key.toLowerCase() === lower) {
      return fields[key];
    }
  }
  return undefined;
}

export function diagnoseSharePointColumns(
  discoveredColumns: DiscoveredSharePointColumn[],
  columnMappings: SharePointColumnMappings
): {
  rows: ColumnDiagnosticRow[];
  issues: ColumnMappingIssue[];
  unmappedListColumns: DiscoveredSharePointColumn[];
} {
  const byInternalLower = new Map<string, DiscoveredSharePointColumn>();
  for (const col of discoveredColumns) {
    byInternalLower.set(col.name.toLowerCase(), col);
  }

  const mappedInternalLower = new Set<string>();
  const rows: ColumnDiagnosticRow[] = [];
  const issues: ColumnMappingIssue[] = [];

  (Object.keys(columnMappings) as SharePointDomainField[]).forEach(
    (domainField) => {
      const expectedInternalName = columnMappings[domainField]?.trim() || '';
      const required = REQUIRED_REGISTRY_DOMAIN_FIELDS.has(domainField);
      const discovered = expectedInternalName
        ? byInternalLower.get(expectedInternalName.toLowerCase())
        : undefined;

      if (discovered) {
        mappedInternalLower.add(discovered.name.toLowerCase());
      }

      const status: ColumnDiagnosticRow['status'] = discovered
        ? 'MATCHED'
        : required
          ? 'MISSING_REQUIRED'
          : 'MISSING_OPTIONAL';

      rows.push({
        domainField,
        expectedInternalName,
        required,
        matched: Boolean(discovered),
        discoveredColumn: discovered,
        status,
      });

      if (!discovered && required) {
        issues.push({
          severity: 'error',
          columnName: expectedInternalName,
          domainField,
          message: `Required SharePoint column "${expectedInternalName}" for domain field "${domainField}" was not found on the list.`,
        });
      } else if (!discovered && expectedInternalName) {
        issues.push({
          severity: 'warning',
          columnName: expectedInternalName,
          domainField,
          message: `Optional SharePoint column "${expectedInternalName}" for domain field "${domainField}" was not found; fallback defaults will be used.`,
        });
      }
    }
  );

  const unmappedListColumns = discoveredColumns.filter(
    (c) => !mappedInternalLower.has(c.name.toLowerCase()) && !c.readOnly
  );

  return { rows, issues, unmappedListColumns };
}

export function mapSharePointItemToInitiative(
  rawItem: RawSharePointListItem,
  options: {
    siteId: string;
    listId: string;
    columnMappings: SharePointColumnMappings;
    departments?: Department[];
    users?: UserAccount[];
    nowIso?: string;
  }
): {
  initiative?: Initiative;
  issues: ColumnMappingIssue[];
} {
  const issues: ColumnMappingIssue[] = [];
  const fields = rawItem.fields ?? {};
  const map = options.columnMappings;
  const itemId = String(rawItem.id ?? '').trim();
  const nowIso = options.nowIso ?? new Date().toISOString();

  if (!itemId) {
    issues.push({
      severity: 'error',
      message: 'SharePoint list item is missing an item id.',
    });
    return { issues };
  }

  const readField = (field: SharePointDomainField) =>
    getFieldCaseInsensitive(fields, map[field]);

  const stableId = asTrimmedString(readField('initiativeId')) || `sp-${itemId}`;
  const title = asTrimmedString(readField('title'));
  if (!title) {
    issues.push({
      severity: 'error',
      itemId,
      columnName: map.title,
      domainField: 'title',
      message: `Item #${itemId} is missing a value in "${map.title}" (title).`,
    });
    return { issues };
  }

  const businessProblem =
    asTrimmedString(readField('businessProblem')) ||
    'Pending problem statement completion in SharePoint list.';
  const description =
    asTrimmedString(readField('description')) || businessProblem;
  const businessCapability =
    asTrimmedString(readField('businessCapability')) || 'General Enterprise';

  if (!asTrimmedString(readField('businessProblem'))) {
    issues.push({
      severity: 'warning',
      itemId,
      columnName: map.businessProblem,
      domainField: 'businessProblem',
      message: `Item #${itemId} ("${title}") had blank "${map.businessProblem}"; placeholder applied.`,
    });
  }

  // Department resolution
  const rawDept = asTrimmedString(readField('department'));
  const matchedDept = options.departments?.find(
    (d) =>
      d.id.toLowerCase() === rawDept.toLowerCase() ||
      d.name.toLowerCase() === rawDept.toLowerCase() ||
      d.code.toLowerCase() === rawDept.toLowerCase()
  );
  const departmentId =
    matchedDept?.id ||
    (rawDept ? `sp-dept:${rawDept}` : 'sp-dept:unassigned');

  // Owner resolution
  const rawOwner = asTrimmedString(readField('owner'));
  const rawOwnerEmail = asTrimmedString(readField('ownerEmail'));
  const matchedUser = options.users?.find(
    (u) =>
      (rawOwnerEmail &&
        u.email.toLowerCase() === rawOwnerEmail.toLowerCase()) ||
      (rawOwner &&
        (u.id.toLowerCase() === rawOwner.toLowerCase() ||
          u.displayName.toLowerCase() === rawOwner.toLowerCase() ||
          u.email.toLowerCase() === rawOwner.toLowerCase()))
  );
  const ownerId =
    matchedUser?.id ||
    rawOwnerEmail ||
    rawOwner ||
    'unassigned-owner';

  const rawCategory = readField('category');
  const category =
    normalizeEnumValue(
      rawCategory,
      Object.values(RegistrableCategory),
      CATEGORY_LABELS
    ) ?? RegistrableCategory.AI_SOLUTION;

  if (rawCategory && !normalizeEnumValue(rawCategory, Object.values(RegistrableCategory), CATEGORY_LABELS)) {
    issues.push({
      severity: 'warning',
      itemId,
      columnName: map.category,
      domainField: 'category',
      message: `Item #${itemId} ("${title}") had unrecognized category "${asTrimmedString(rawCategory)}"; defaulted to AI Solution.`,
    });
  }

  const rawLifecycle = readField('lifecycleStatus');
  const lifecycleStatus =
    normalizeEnumValue(
      rawLifecycle,
      Object.values(LifecycleStatus),
      LIFECYCLE_LABELS
    ) ?? LifecycleStatus.IDEA;

  if (rawLifecycle && !normalizeEnumValue(rawLifecycle, Object.values(LifecycleStatus), LIFECYCLE_LABELS)) {
    issues.push({
      severity: 'warning',
      itemId,
      columnName: map.lifecycleStatus,
      domainField: 'lifecycleStatus',
      message: `Item #${itemId} ("${title}") had unrecognized lifecycle status "${asTrimmedString(rawLifecycle)}"; defaulted to Idea.`,
    });
  }

  const rawValueCategory = readField('valueCategory');
  const valueCategory =
    normalizeEnumValue(
      rawValueCategory,
      Object.values(ValueCategory),
      VALUE_CATEGORY_LABELS
    ) ?? ValueCategory.EFFICIENCY;

  if (rawValueCategory && !normalizeEnumValue(rawValueCategory, Object.values(ValueCategory), VALUE_CATEGORY_LABELS)) {
    issues.push({
      severity: 'warning',
      itemId,
      columnName: map.valueCategory,
      domainField: 'valueCategory',
      message: `Item #${itemId} ("${title}") had unrecognized value category "${asTrimmedString(rawValueCategory)}"; defaulted to Efficiency Savings.`,
    });
  }

  const parsedUsers = asOptionalNumber(readField('usersCount'));
  const parsedMinutes = asOptionalNumber(readField('minutesSavedPerOccurrence'));
  const parsedFreq = asOptionalNumber(readField('processFrequencyPerWeek'));
  const parsedRate = asOptionalNumber(readField('hourlyRate'));
  const parsedVersion = asOptionalNumber(readField('version'));

  if (parsedUsers === undefined || parsedUsers < 0) {
    issues.push({
      severity: 'warning',
      itemId,
      columnName: map.usersCount,
      domainField: 'usersCount',
      message: `Item #${itemId} ("${title}") has missing or invalid "${map.usersCount}"; defaulted to 0.`,
    });
  }
  if (parsedMinutes === undefined || parsedMinutes < 0) {
    issues.push({
      severity: 'warning',
      itemId,
      columnName: map.minutesSavedPerOccurrence,
      domainField: 'minutesSavedPerOccurrence',
      message: `Item #${itemId} ("${title}") has missing or invalid "${map.minutesSavedPerOccurrence}"; defaulted to 0.`,
    });
  }
  if (parsedFreq === undefined || parsedFreq < 0) {
    issues.push({
      severity: 'warning',
      itemId,
      columnName: map.processFrequencyPerWeek,
      domainField: 'processFrequencyPerWeek',
      message: `Item #${itemId} ("${title}") has missing or invalid "${map.processFrequencyPerWeek}"; defaulted to 0.`,
    });
  }

  const createdAt =
    normalizeIsoTimestamp(readField('createdAt')) ??
    normalizeIsoTimestamp(rawItem.createdDateTime) ??
    nowIso;
  const updatedAt =
    normalizeIsoTimestamp(readField('updatedAt')) ??
    normalizeIsoTimestamp(rawItem.lastModifiedDateTime) ??
    createdAt;
  const ideaDate =
    normalizeIsoDate(readField('ideaDate')) ?? createdAt.slice(0, 10);
  const goLiveDate = normalizeIsoDate(readField('goLiveDate'));
  const lastOwnerReviewAt =
    normalizeIsoTimestamp(readField('lastOwnerReviewAt')) ?? null;
  const nextReviewDue =
    normalizeIsoTimestamp(readField('nextReviewDue')) ??
    computeNextReviewDue(new Date(lastOwnerReviewAt ?? createdAt));

  const initiative: Initiative = {
    id: stableId,
    title,
    businessProblem,
    description,
    businessCapability,
    departmentId,
    ownerId,
    aiPlatform: asTrimmedString(readField('aiPlatform')) || 'Other',
    solutionType:
      asTrimmedString(readField('solutionType')) || 'Enterprise Copilot Extension',
    aiType: asTrimmedString(readField('aiType')) || 'Generative AI / LLM',
    category,
    lifecycleStatus,
    valueCategory,
    usersCount: parsedUsers !== undefined && parsedUsers >= 0 ? Math.round(parsedUsers) : 0,
    minutesSavedPerOccurrence:
      parsedMinutes !== undefined && parsedMinutes >= 0 ? parsedMinutes : 0,
    processFrequencyPerWeek:
      parsedFreq !== undefined && parsedFreq >= 0 ? parsedFreq : 0,
    hourlyRate: parsedRate !== undefined && parsedRate >= 0 ? parsedRate : undefined,
    ideaDate,
    goLiveDate,
    createdAt,
    updatedAt,
    lastOwnerReviewAt,
    nextReviewDue,
    version:
      parsedVersion !== undefined && parsedVersion >= 1
        ? Math.floor(parsedVersion)
        : 1,
    syncLinkage: {
      sourceSystem: 'MICROSOFT_LISTS',
      siteId: options.siteId,
      listId: options.listId,
      itemId,
      sourceETag: rawItem.eTag,
      lastSyncedAt: nowIso,
    },
  };

  return { initiative, issues };
}

export function mapSharePointItemToLifecycleEvent(
  rawItem: RawSharePointListItem,
  mappings: LifecycleListColumnMappings
): LifecycleEvent | null {
  const fields = rawItem.fields ?? {};
  const initiativeId = asTrimmedString(
    getFieldCaseInsensitive(fields, mappings.initiativeId)
  );
  if (!initiativeId) return null;

  const toStatus =
    normalizeEnumValue(
      getFieldCaseInsensitive(fields, mappings.toStatus),
      Object.values(LifecycleStatus),
      LIFECYCLE_LABELS
    ) ?? LifecycleStatus.IDEA;

  const fromRaw = getFieldCaseInsensitive(fields, mappings.fromStatus);
  const fromStatus = fromRaw
    ? (normalizeEnumValue(
        fromRaw,
        Object.values(LifecycleStatus),
        LIFECYCLE_LABELS
      ) ?? null)
    : null;

  const rawException = getFieldCaseInsensitive(
    fields,
    mappings.isGovernedException
  );
  const isGovernedException =
    rawException === true ||
    String(rawException).toLowerCase() === 'true' ||
    String(rawException) === '1';

  return {
    id: `sp-evt-${rawItem.id}`,
    initiativeId,
    fromStatus,
    toStatus,
    actorId:
      asTrimmedString(getFieldCaseInsensitive(fields, mappings.actorId)) ||
      'sp-actor',
    actorName:
      asTrimmedString(getFieldCaseInsensitive(fields, mappings.actorName)) ||
      'SharePoint User',
    timestamp:
      normalizeIsoTimestamp(
        getFieldCaseInsensitive(fields, mappings.occurredAt)
      ) ??
      normalizeIsoTimestamp(rawItem.createdDateTime) ??
      new Date().toISOString(),
    note:
      asTrimmedString(getFieldCaseInsensitive(fields, mappings.note)) ||
      'Recorded in SharePoint Lifecycle History list.',
    isGovernedException,
  };
}

export function mapSharePointItemToUsageSnapshot(
  rawItem: RawSharePointListItem,
  mappings: UsageListColumnMappings
): UsageTrackingSnapshot | null {
  const fields = rawItem.fields ?? {};
  const initiativeId = asTrimmedString(
    getFieldCaseInsensitive(fields, mappings.initiativeId)
  );
  if (!initiativeId) return null;

  const usersCount = asOptionalNumber(
    getFieldCaseInsensitive(fields, mappings.usersCount)
  );
  const minutesSavedPerOccurrence = asOptionalNumber(
    getFieldCaseInsensitive(fields, mappings.minutesSavedPerOccurrence)
  );
  const processFrequencyPerWeek = asOptionalNumber(
    getFieldCaseInsensitive(fields, mappings.processFrequencyPerWeek)
  );

  if (
    usersCount === undefined ||
    minutesSavedPerOccurrence === undefined ||
    processFrequencyPerWeek === undefined
  ) {
    return null;
  }

  return {
    id: `sp-usage-${rawItem.id}`,
    initiativeId,
    usersCount: Math.max(0, Math.round(usersCount)),
    minutesSavedPerOccurrence: Math.max(0, minutesSavedPerOccurrence),
    processFrequencyPerWeek: Math.max(0, processFrequencyPerWeek),
    recordedAt:
      normalizeIsoTimestamp(
        getFieldCaseInsensitive(fields, mappings.recordedAt)
      ) ??
      normalizeIsoTimestamp(rawItem.lastModifiedDateTime) ??
      new Date().toISOString(),
    recordedBy:
      asTrimmedString(getFieldCaseInsensitive(fields, mappings.recordedBy)) ||
      'SharePoint User',
  };
}

/**
 * Step 4 Preparation: Builds a Graph ListItem `fields` dictionary from a domain
 * CreateInitiativeInput using the configured internal column mappings.
 * Not executed while SharePoint writes remain disabled.
 */
export function buildSharePointFieldsPayload(
  input: Partial<CreateInitiativeInput> & {
    initiativeId?: string;
    version?: number;
    lastOwnerReviewAt?: string | null;
    nextReviewDue?: string;
  },
  mappings: SharePointColumnMappings
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.initiativeId !== undefined)
    payload[mappings.initiativeId] = input.initiativeId;
  if (input.title !== undefined) payload[mappings.title] = input.title;
  if (input.businessProblem !== undefined)
    payload[mappings.businessProblem] = input.businessProblem;
  if (input.description !== undefined)
    payload[mappings.description] = input.description;
  if (input.businessCapability !== undefined)
    payload[mappings.businessCapability] = input.businessCapability;
  if (input.departmentId !== undefined)
    payload[mappings.department] = input.departmentId;
  if (input.ownerId !== undefined) payload[mappings.owner] = input.ownerId;
  if (input.aiPlatform !== undefined)
    payload[mappings.aiPlatform] = input.aiPlatform;
  if (input.solutionType !== undefined)
    payload[mappings.solutionType] = input.solutionType;
  if (input.aiType !== undefined) payload[mappings.aiType] = input.aiType;
  if (input.category !== undefined) payload[mappings.category] = input.category;
  if (input.lifecycleStatus !== undefined)
    payload[mappings.lifecycleStatus] = input.lifecycleStatus;
  if (input.valueCategory !== undefined)
    payload[mappings.valueCategory] = input.valueCategory;
  if (input.usersCount !== undefined)
    payload[mappings.usersCount] = input.usersCount;
  if (input.minutesSavedPerOccurrence !== undefined)
    payload[mappings.minutesSavedPerOccurrence] =
      input.minutesSavedPerOccurrence;
  if (input.processFrequencyPerWeek !== undefined)
    payload[mappings.processFrequencyPerWeek] = input.processFrequencyPerWeek;
  if (input.hourlyRate !== undefined)
    payload[mappings.hourlyRate] = input.hourlyRate;
  if (input.ideaDate !== undefined) payload[mappings.ideaDate] = input.ideaDate;
  if (input.goLiveDate !== undefined)
    payload[mappings.goLiveDate] = input.goLiveDate;
  if (input.version !== undefined) payload[mappings.version] = input.version;
  if (input.lastOwnerReviewAt !== undefined)
    payload[mappings.lastOwnerReviewAt] = input.lastOwnerReviewAt;
  if (input.nextReviewDue !== undefined)
    payload[mappings.nextReviewDue] = input.nextReviewDue;

  return payload;
}
