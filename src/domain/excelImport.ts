import {
  AI_PLATFORMS,
  AiCostTransaction,
  CATEGORY_LABELS,
  COST_CATEGORY_LABELS,
  CostCategory,
  Department,
  DepartmentAliasRule,
  Initiative,
  LIFECYCLE_LABELS,
  LifecycleStatus,
  RegistrableCategory,
  SpendType,
  UserAccount,
  VALUE_CATEGORY_LABELS,
  ValueCategory,
} from './types';
import {
  DEFAULT_OPERATIONS_CONFIG,
  resolveDepartmentWithAliases,
} from './operationsReporting';

export type InitiativeImportField =
  | 'sharepointId'
  | 'title'
  | 'description'
  | 'businessProblem'
  | 'businessCapability'
  | 'department'
  | 'owner'
  | 'aiPlatform'
  | 'aiType'
  | 'solutionType'
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
  | '__EXCLUDE__';

export const INITIATIVE_IMPORT_FIELD_LABELS: Record<
  InitiativeImportField,
  string
> = {
  sharepointId: 'Initiative / SharePoint Item ID',
  title: 'Solution / Use Case Name *',
  businessProblem: 'Business Problem',
  description: 'Short Description',
  businessCapability: 'Business Capability',
  department: 'Business Area / Department *',
  owner: 'Accountable Owner',
  aiPlatform: 'AI Platform',
  solutionType: 'Solution Type',
  aiType: 'AI Type',
  category: 'Registry Category',
  lifecycleStatus: 'Lifecycle Status *',
  valueCategory: 'Value Measurement Category *',
  usersCount: 'Users',
  minutesSavedPerOccurrence: 'Minutes Saved / Occurrence',
  processFrequencyPerWeek: 'Process Frequency / Week',
  hourlyRate: 'Hourly Rate (EUR, Optional)',
  ideaDate: 'Idea Date',
  goLiveDate: 'Go-Live Date',
  createdAt: 'Created Date',
  updatedAt: 'Last Modified Date',
  __EXCLUDE__: 'Exclude / Ignore Column',
};

export type MappingMatchMethod =
  | 'EXACT_ALIAS'
  | 'FUZZY_STRING'
  | 'MOCK_PROVIDER'
  | 'TEMPLATE'
  | 'MANUAL'
  | 'EXCLUDED'
  | 'UNMAPPED';

export interface ColumnMappingSuggestion<TField extends string> {
  sourceHeader: string;
  targetField: TField;
  method: MappingMatchMethod;
  confidencePercent: number;
  reason: string;
}

/**
 * Replaceable interface for AI-assisted spreadsheet column mapping.
 * Demo builds use deterministic MockColumnMappingProvider; production builds
 * can plug in a server-side Azure OpenAI / Gemini mapper without UI changes.
 */
export interface AIColumnMappingProvider {
  readonly providerName: string;
  suggestField(
    header: string
  ): { field: InitiativeImportField; reason: string; confidence: number } | null;
}

const INITIATIVE_HEADER_ALIASES: Record<
  Exclude<InitiativeImportField, '__EXCLUDE__'>,
  string[]
> = {
  sharepointId: [
    'id',
    'sp id',
    'sharepoint id',
    'sharepoint item id',
    'item id',
    'itemid',
    'external id',
    'initiative id',
    'initiativeid',
    'kennziffer',
  ],
  title: [
    'title',
    'solution name',
    'use case name',
    'solution / use case name',
    'use case',
    'initiative',
    'initiative name',
    'name',
    'ai solution',
    'project name',
    'titel',
    'losungsname',
    'anwendungsfall',
  ],
  businessProblem: [
    'business problem',
    'problem',
    'problem statement',
    'pain point',
    'challenge',
    'geschaftsproblem',
    'problemstellung',
  ],
  description: [
    'description',
    'short description',
    'solution description',
    'summary',
    'details',
    'scope',
    'beschreibung',
    'kurzbeschreibung',
  ],
  businessCapability: [
    'business capability',
    'capability',
    'process area',
    'domain capability',
    'fahigkeit',
    'prozessbereich',
  ],
  department: [
    'business area',
    'department',
    'dept',
    'business unit',
    'business area / department',
    'function',
    'division',
    'fachbereich',
    'abteilung',
    'bereich',
  ],
  owner: [
    'owner',
    'accountable owner',
    'lead',
    'business owner',
    'sponsor',
    'contact',
    'verantwortlicher',
    'eigentumer',
    'ansprechpartner',
  ],
  aiPlatform: [
    'ai platform',
    'platform',
    'technology',
    'vendor',
    'stack',
    'ki plattform',
    'plattform',
  ],
  aiType: [
    'ai type',
    'model type',
    'ai capability',
    'technique',
    'ki typ',
  ],
  solutionType: [
    'solution type',
    'implementation type',
    'delivery type',
    'losungstyp',
  ],
  category: [
    'category',
    'registry category',
    'classification',
    'ai category',
    'kategorie',
  ],
  lifecycleStatus: [
    'lifecycle status',
    'status',
    'stage',
    'lifecycle',
    'phase',
    'current stage',
    'lebenszyklus',
    'lebenszyklusstatus',
  ],
  valueCategory: [
    'value category',
    'value measurement category',
    'value type',
    'benefit category',
    'primary value',
    'wertkategorie',
    'nutzenkategorie',
  ],
  usersCount: [
    'users',
    'users count',
    'user count',
    'active users',
    'target users',
    'headcount',
    'nutzer',
    'benutzer',
    'anzahl nutzer',
  ],
  minutesSavedPerOccurrence: [
    'minutes saved',
    'minutes saved per occurrence',
    'mins saved',
    'time saved mins',
    'minutes',
    'zeitersparnis',
    'eingesparte minuten',
  ],
  processFrequencyPerWeek: [
    'process frequency',
    'process frequency per week',
    'frequency',
    'weekly frequency',
    'runs per week',
    'occurrences per week',
    'freq/wk',
    'haufigkeit',
    'frequenz pro woche',
  ],
  hourlyRate: [
    'hourly rate',
    'rate',
    'cost per hour',
    'eur/hr',
    'hourly cost',
    'stundensatz',
  ],
  ideaDate: [
    'idea date',
    'submitted date',
    'start date',
    'ideendatum',
  ],
  goLiveDate: [
    'go live date',
    'go-live date',
    'golive date',
    'launch date',
    'production date',
    'produktivdatum',
    'golive datum',
  ],
  createdAt: [
    'created date',
    'created',
    'created at',
    'erstellungsdatum',
    'erstellt am',
  ],
  updatedAt: [
    'last modified date',
    'modified date',
    'modified',
    'last updated',
    'updated at',
    'anderungsdatum',
    'zuletzt geandert',
  ],
};

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramSet(str: string): string[] {
  const s = str.replace(/\s+/g, '');
  if (s.length < 2) return [s];
  const pairs: string[] = [];
  for (let i = 0; i < s.length - 1; i += 1) {
    pairs.push(s.slice(i, i + 2));
  }
  return pairs;
}

export function diceSimilarity(a: string, b: string): number {
  const na = normalizeHeader(a);
  const nb = normalizeHeader(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const pairsA = bigramSet(na);
  const pairsB = bigramSet(nb);
  const pool = [...pairsB];
  let matches = 0;
  for (const p of pairsA) {
    const idx = pool.indexOf(p);
    if (idx !== -1) {
      matches += 1;
      pool.splice(idx, 1);
    }
  }
  return (2 * matches) / (pairsA.length + pairsB.length);
}

/**
 * Deterministic mock implementation of AIColumnMappingProvider for column
 * mapping suggestions when header aliases and fuzzy matching leave ambiguous columns.
 */
export class MockColumnMappingProvider implements AIColumnMappingProvider {
  public readonly providerName = 'MockColumnMappingProvider (Rule-Based Demo)';

  public suggestField(
    header: string
  ): { field: InitiativeImportField; reason: string; confidence: number } | null {
    const h = normalizeHeader(header);
    if (!h) return null;
    if (h.includes('hrs') || h.includes('freq') || h.includes('weekly') || h.includes('woche')) {
      return {
        field: 'processFrequencyPerWeek',
        reason: 'Rule-based heuristic: cadence/frequency keyword detected',
        confidence: 72,
      };
    }
    if (h.includes('min') || h.includes('saving time') || h.includes('ersparnis')) {
      return {
        field: 'minutesSavedPerOccurrence',
        reason: 'Rule-based heuristic: duration-saved keyword detected',
        confidence: 74,
      };
    }
    if (h.includes('benef') || h.includes('impact') || h.includes('nutzen')) {
      return {
        field: 'valueCategory',
        reason: 'Rule-based heuristic: value/impact keyword detected',
        confidence: 68,
      };
    }
    if (h.includes('team') || h.includes('org') || h.includes('area') || h.includes('abt')) {
      return {
        field: 'department',
        reason: 'Rule-based heuristic: organizational area keyword detected',
        confidence: 70,
      };
    }
    if (h.includes('sponsor') || h.includes('manager') || h.includes('author') || h.includes('owner')) {
      return {
        field: 'owner',
        reason: 'Rule-based heuristic: ownership role keyword detected',
        confidence: 70,
      };
    }
    if (h.includes('modif') || h.includes('updat') || h.includes('geandert')) {
      return {
        field: 'updatedAt',
        reason: 'Rule-based heuristic: last modified date keyword detected',
        confidence: 72,
      };
    }
    if (h.includes('creat') || h.includes('erstell')) {
      return {
        field: 'createdAt',
        reason: 'Rule-based heuristic: created date keyword detected',
        confidence: 72,
      };
    }
    return null;
  }
}

export function suggestInitiativeColumnMappings(
  headers: string[],
  options?: { useMockProvider?: boolean; provider?: AIColumnMappingProvider }
): ColumnMappingSuggestion<InitiativeImportField>[] {
  const usedTargets = new Set<InitiativeImportField>();
  const mockProvider =
    options?.useMockProvider !== false
      ? options?.provider ?? new MockColumnMappingProvider()
      : null;

  return headers.map((sourceHeader) => {
    const norm = normalizeHeader(sourceHeader);
    if (!norm) {
      return {
        sourceHeader,
        targetField: '__EXCLUDE__',
        method: 'UNMAPPED',
        confidencePercent: 0,
        reason: 'Empty header',
      };
    }

    // 1. Exact alias check
    for (const [field, aliases] of Object.entries(INITIATIVE_HEADER_ALIASES) as Array<
      [Exclude<InitiativeImportField, '__EXCLUDE__'>, string[]]
    >) {
      if (usedTargets.has(field)) continue;
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        usedTargets.add(field);
        return {
          sourceHeader,
          targetField: field,
          method: 'EXACT_ALIAS',
          confidencePercent: 100,
          reason: `Matched known header alias "${sourceHeader}"`,
        };
      }
    }

    // 2. Fuzzy string match
    let bestField: Exclude<InitiativeImportField, '__EXCLUDE__'> | null = null;
    let bestScore = 0;
    for (const [field, aliases] of Object.entries(INITIATIVE_HEADER_ALIASES) as Array<
      [Exclude<InitiativeImportField, '__EXCLUDE__'>, string[]]
    >) {
      if (usedTargets.has(field)) continue;
      for (const alias of aliases) {
        const sim = diceSimilarity(norm, alias);
        if (sim > bestScore) {
          bestScore = sim;
          bestField = field;
        }
      }
    }
    if (bestField && bestScore >= 0.62) {
      usedTargets.add(bestField);
      return {
        sourceHeader,
        targetField: bestField,
        method: 'FUZZY_STRING',
        confidencePercent: Math.round(bestScore * 100),
        reason: `Fuzzy string similarity (${Math.round(bestScore * 100)}%)`,
      };
    }

    // 3. Optional AIColumnMappingProvider heuristic
    if (mockProvider) {
      const mockHit = mockProvider.suggestField(sourceHeader);
      if (mockHit && !usedTargets.has(mockHit.field)) {
        usedTargets.add(mockHit.field);
        return {
          sourceHeader,
          targetField: mockHit.field,
          method: 'MOCK_PROVIDER',
          confidencePercent: mockHit.confidence,
          reason: `${mockHit.reason} (Demo)`,
        };
      }
    }

    return {
      sourceHeader,
      targetField: '__EXCLUDE__',
      method: 'UNMAPPED',
      confidencePercent: 0,
      reason: 'No automatic match — choose a field or keep excluded',
    };
  });
}

export function findDuplicateTargetFieldConflicts(
  mappings: ColumnMappingSuggestion<InitiativeImportField>[]
): Array<{ targetField: InitiativeImportField; sourceHeaders: string[] }> {
  const byTarget = new Map<InitiativeImportField, string[]>();
  for (const m of mappings) {
    if (m.targetField === '__EXCLUDE__') continue;
    const arr = byTarget.get(m.targetField) ?? [];
    arr.push(m.sourceHeader);
    byTarget.set(m.targetField, arr);
  }
  const conflicts: Array<{
    targetField: InitiativeImportField;
    sourceHeaders: string[];
  }> = [];
  for (const [targetField, sourceHeaders] of byTarget.entries()) {
    if (sourceHeaders.length > 1) {
      conflicts.push({ targetField, sourceHeaders });
    }
  }
  return conflicts;
}

export function applyMappingTemplate(
  headers: string[],
  templateMappings: Array<{ sourceHeader: string; targetField: string }>,
  fallbackSuggestions: ColumnMappingSuggestion<InitiativeImportField>[]
): ColumnMappingSuggestion<InitiativeImportField>[] {
  const tplMap = new Map(
    templateMappings.map((t) => [normalizeHeader(t.sourceHeader), t.targetField])
  );
  const usedTargets = new Set<InitiativeImportField>();
  const validTargets = new Set<string>(Object.keys(INITIATIVE_IMPORT_FIELD_LABELS));

  return headers.map((header) => {
    const norm = normalizeHeader(header);
    const tplTarget = tplMap.get(norm);
    if (tplTarget && validTargets.has(tplTarget)) {
      const field = tplTarget as InitiativeImportField;
      if (field === '__EXCLUDE__' || !usedTargets.has(field)) {
        if (field !== '__EXCLUDE__') usedTargets.add(field);
        return {
          sourceHeader: header,
          targetField: field,
          method: field === '__EXCLUDE__' ? 'EXCLUDED' : 'TEMPLATE',
          confidencePercent: field === '__EXCLUDE__' ? 0 : 100,
          reason: 'Applied from saved mapping template',
        };
      }
    }
    const fallback = fallbackSuggestions.find((f) => f.sourceHeader === header);
    if (fallback && (fallback.targetField === '__EXCLUDE__' || !usedTargets.has(fallback.targetField))) {
      if (fallback.targetField !== '__EXCLUDE__') {
        usedTargets.add(fallback.targetField);
      }
      return fallback;
    }
    return {
      sourceHeader: header,
      targetField: '__EXCLUDE__',
      method: 'UNMAPPED',
      confidencePercent: 0,
      reason: 'Unmapped column',
    };
  });
}

export function normalizeLifecycleStatusInput(
  raw: unknown
): LifecycleStatus | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[\s/_&-]+/g, ' ');
  if (!s) return null;
  if (s === 'idea' || s === 'ideation' || s === 'concept' || s === 'idee') return LifecycleStatus.IDEA;
  if (s === 'assessment' || s === 'assess' || s === 'evaluation' || s === 'bewertung' || s === 'prufung') return LifecycleStatus.ASSESSMENT;
  if (s === 'development' || s === 'dev' || s === 'in development' || s === 'build' || s === 'entwicklung' || s === 'in entwicklung') return LifecycleStatus.DEVELOPMENT;
  if (s === 'pilot' || s === 'poc' || s === 'trial' || s === 'pilotierung') return LifecycleStatus.PILOT;
  if (s === 'production' || s === 'prod' || s === 'live' || s === 'deployed' || s === 'produktion' || s === 'produktiv') return LifecycleStatus.PRODUCTION;
  if (s === 'monitoring' || s === 'monitor' || s === 'operations' || s === 'uberwachung' || s === 'betrieb') return LifecycleStatus.MONITORING;
  if (s === 'retire' || s === 'retired' || s === 'decommissioned' || s === 'archived' || s === 'abgelost' || s === 'eingestellt') return LifecycleStatus.RETIRE;
  if (s === 'scale improve' || s === 'scale and improve' || s === 'scale' || s === 'scaling' || s === 'skalierung') return LifecycleStatus.SCALE_IMPROVE;

  for (const status of Object.values(LifecycleStatus)) {
    if (status.toLowerCase() === s.replace(/\s+/g, '_')) return status;
    if (LIFECYCLE_LABELS[status].toLowerCase() === s) return status;
  }
  return null;
}

export function normalizeValueCategoryInput(raw: unknown): ValueCategory | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[\s/_-]+/g, ' ');
  if (!s) return null;
  if (
    s.includes('efficienc') ||
    s.includes('effizienz') ||
    s.includes('einspar') ||
    s.includes('time') ||
    s.includes('productiv')
  ) {
    return ValueCategory.EFFICIENCY;
  }
  if (
    s.includes('qualit') ||
    s.includes('accura') ||
    s.includes('error') ||
    s.includes('fehler')
  ) {
    return ValueCategory.QUALITY;
  }
  if (
    s.includes('strateg') ||
    s.includes('growth') ||
    s.includes('capabilit')
  ) {
    return ValueCategory.STRATEGIC;
  }
  for (const val of Object.values(ValueCategory)) {
    if (val.toLowerCase() === s || VALUE_CATEGORY_LABELS[val].toLowerCase() === s) {
      return val;
    }
  }
  return null;
}

export function normalizeRegistrableCategoryInput(
  raw: unknown
): RegistrableCategory | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s/_-]+/g, ' ');
  if (!s) return null;
  if (s.includes('agent')) return RegistrableCategory.AI_AGENT;
  if (s.includes('enhanced') || s.includes('app')) return RegistrableCategory.AI_ENHANCED_APP;
  if (s.includes('automat') || s.includes('rpa') || s.includes('workflow')) return RegistrableCategory.AI_AUTOMATION;
  if (s.includes('develop') || s.includes('custom') || s.includes('entwickel')) return RegistrableCategory.AI_DEVELOPED_SOLUTION;
  if (s.includes('solution') || s.includes('losung')) return RegistrableCategory.AI_SOLUTION;

  for (const cat of Object.values(RegistrableCategory)) {
    if (cat.toLowerCase().replace(/_/g, ' ') === s || CATEGORY_LABELS[cat].toLowerCase() === s) {
      return cat;
    }
  }
  return null;
}

/**
 * Parses numbers cleanly across English (`1,250.50`) and German (`1.250,50` / `24,5`)
 * Excel exports, stripping currency and time-unit suffixes.
 */
export function parseNumericCell(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let str = String(raw)
    .replace(/[€$£\s\u00A0]/g, '')
    .replace(/(mins?|minutes?|hrs?|hours?|std|\/wk|\/week)$/i, '')
    .trim();
  if (!str) return null;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal mark
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // German: 1.250,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // English: 1,250.50
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Multiple commas (1,250,000) or exact 3-digit thousands group (4,250) -> English thousands
    if (/^-?\d{1,3}(,\d{3})+$/.test(str)) {
      str = str.replace(/,/g, '');
    } else {
      // German decimal comma (24,5 or 1250,75)
      str = str.replace(',', '.');
    }
  } else if (hasDot && /^-?\d{1,3}(\.\d{3}){2,}$/.test(str)) {
    // Multiple dots (1.250.000) -> German thousands
    str = str.replace(/\./g, '');
  }

  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

export function normalizeDateCell(raw: unknown): string | undefined {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return undefined;
  }
  if (typeof raw === 'number' && raw > 25569) {
    // Excel serial date
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // German DD.MM.YYYY (or D.M.YYYY)
  const deMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (deMatch) {
    const dd = deMatch[1].padStart(2, '0');
    const mm = deMatch[2].padStart(2, '0');
    const yyyy = deMatch[3];
    const iso = `${yyyy}-${mm}-${dd}`;
    const check = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso) {
      return iso;
    }
  }
  // US MM/DD/YYYY
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (usMatch) {
    const mm = usMatch[1].padStart(2, '0');
    const dd = usMatch[2].padStart(2, '0');
    const yyyy = usMatch[3];
    const iso = `${yyyy}-${mm}-${dd}`;
    const check = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso) {
      return iso;
    }
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

export function resolveDepartmentMatch(
  rawDept: string,
  departments: Department[],
  aliasRules: DepartmentAliasRule[] = DEFAULT_OPERATIONS_CONFIG.aliasRules
): {
  departmentId: string;
  departmentName: string;
  isNewDepartment: boolean;
  isAmbiguous?: boolean;
  candidateDepartmentNames?: string[];
} {
  const resolved = resolveDepartmentWithAliases(rawDept, departments, aliasRules);
  return {
    departmentId: resolved.departmentId,
    departmentName: resolved.departmentName,
    isNewDepartment: resolved.isNewDepartment,
    isAmbiguous: resolved.isAmbiguous,
    candidateDepartmentNames: resolved.candidateDepartmentNames,
  };
}

export interface NormalizedInitiativeImportRow {
  rowIndex: number; // 1-based data row index
  rawRow: Record<string, unknown>;
  sharepointId?: string;
  title: string;
  businessProblem: string;
  description: string;
  businessCapability: string;
  departmentId: string;
  departmentName: string;
  isNewDepartment: boolean;
  isAmbiguousDepartment?: boolean;
  ownerId: string;
  ownerDisplayName: string;
  aiPlatform: string;
  aiType: string;
  solutionType: string;
  category: RegistrableCategory;
  lifecycleStatus: LifecycleStatus;
  valueCategory: ValueCategory;
  usersCount: number;
  minutesSavedPerOccurrence: number;
  processFrequencyPerWeek: number;
  hourlyRate?: number;
  ideaDate: string;
  goLiveDate?: string;
  createdAt?: string;
  updatedAt?: string;
  needsDataCompletion: boolean;
  missingDataFields: string[];
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export function validateAndNormalizeInitiativeImportBatch(params: {
  rows: Record<string, unknown>[];
  mappings: ColumnMappingSuggestion<InitiativeImportField>[];
  departments: Department[];
  users: UserAccount[];
  aliasRules?: DepartmentAliasRule[];
  nowIso?: string;
  allowIncompleteRecords?: boolean;
}): {
  validRows: NormalizedInitiativeImportRow[];
  invalidRows: NormalizedInitiativeImportRow[];
  allRows: NormalizedInitiativeImportRow[];
} {
  const nowDate = (params.nowIso ?? new Date().toISOString()).slice(0, 10);
  const allowIncomplete = params.allowIncompleteRecords === true;
  const fieldToHeader = new Map<InitiativeImportField, string>();
  for (const m of params.mappings) {
    if (m.targetField !== '__EXCLUDE__' && !fieldToHeader.has(m.targetField)) {
      fieldToHeader.set(m.targetField, m.sourceHeader);
    }
  }

  const readCell = (
    row: Record<string, unknown>,
    field: InitiativeImportField
  ): unknown => {
    const header = fieldToHeader.get(field);
    return header ? row[header] : undefined;
  };

  const allRows: NormalizedInitiativeImportRow[] = params.rows.map(
    (rawRow, idx) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const missingDataFields: string[] = [];

      const spId = String(readCell(rawRow, 'sharepointId') ?? '').trim() || undefined;
      const title = String(readCell(rawRow, 'title') ?? '').trim();
      const businessProblem = String(
        readCell(rawRow, 'businessProblem') ?? ''
      ).trim();
      const description = String(readCell(rawRow, 'description') ?? '').trim();
      const rawCap = String(
        readCell(rawRow, 'businessCapability') ?? ''
      ).trim();
      const rawDept = String(readCell(rawRow, 'department') ?? '').trim();
      const rawOwner = String(readCell(rawRow, 'owner') ?? '').trim();

      if (!title) errors.push('Missing required Title / Solution Name.');
      if (!rawDept) errors.push('Missing required Business Area / Department.');

      if (!businessProblem) {
        missingDataFields.push('Business Problem');
        if (!allowIncomplete) {
          errors.push('Missing required Business Problem (not fabricated).');
        } else {
          warnings.push('Business Problem blank — flagged Needs Data Completion.');
        }
      }
      if (!description) {
        missingDataFields.push('Description');
        if (!allowIncomplete) {
          errors.push('Missing required Description (not fabricated).');
        } else {
          warnings.push('Description blank — flagged Needs Data Completion.');
        }
      }
      if (!rawOwner) {
        missingDataFields.push('Accountable Owner');
        if (!allowIncomplete) {
          errors.push('Missing required Accountable Owner.');
        } else {
          warnings.push('Accountable Owner blank — flagged Needs Data Completion.');
        }
      }

      const deptResolved = rawDept
        ? resolveDepartmentMatch(rawDept, params.departments, params.aliasRules)
        : {
            departmentId: '',
            departmentName: '',
            isNewDepartment: false,
            isAmbiguous: false,
          };

      if (deptResolved.isAmbiguous) {
        missingDataFields.push('Department Classification Review');
        warnings.push(
          deptResolved.candidateDepartmentNames?.length
            ? `Ambiguous department "${rawDept}" matches multiple options (${deptResolved.candidateDepartmentNames.join(', ')}) — review in Settings alias rules.`
            : `Department "${rawDept}" is ambiguous for Operations classification — kept separate for manual review.`
        );
      }

      // Resolve owner without inventing credentials
      const matchedUser = rawOwner
        ? params.users.find(
            (u) =>
              u.id.toLowerCase() === rawOwner.toLowerCase() ||
              u.displayName.toLowerCase() === rawOwner.toLowerCase() ||
              u.email.toLowerCase() === rawOwner.toLowerCase()
          )
        : undefined;
      const ownerId =
        matchedUser?.id ||
        (rawOwner
          ? `user-imp-${rawOwner.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
          : '');
      const ownerDisplayName = matchedUser?.displayName || rawOwner;

      const rawStatus = readCell(rawRow, 'lifecycleStatus');
      const lifecycleStatus = normalizeLifecycleStatusInput(rawStatus);
      if (!lifecycleStatus) {
        errors.push(
          rawStatus
            ? `Unrecognized Lifecycle Status "${String(rawStatus)}".`
            : 'Missing required Lifecycle Status.'
        );
      }

      const rawValue = readCell(rawRow, 'valueCategory');
      const valueCategory = normalizeValueCategoryInput(rawValue);
      if (!valueCategory) {
        errors.push(
          rawValue
            ? `Unrecognized Value Category "${String(rawValue)}".`
            : 'Missing required Value Category.'
        );
      }

      const rawCat = readCell(rawRow, 'category');
      let category = normalizeRegistrableCategoryInput(rawCat);
      if (!category) {
        if (rawCat && String(rawCat).trim()) {
          errors.push(`Unrecognized Registry Category "${String(rawCat)}".`);
        } else {
          category = RegistrableCategory.AI_SOLUTION;
          warnings.push('Category not mapped; defaulted to AI Solution.');
        }
      }

      const rawUsers = readCell(rawRow, 'usersCount');
      const rawMins = readCell(rawRow, 'minutesSavedPerOccurrence');
      const rawFreq = readCell(rawRow, 'processFrequencyPerWeek');
      const rawRate = readCell(rawRow, 'hourlyRate');

      const usersCount = parseNumericCell(rawUsers);
      const minutesSaved = parseNumericCell(rawMins);
      const freqPerWeek = parseNumericCell(rawFreq);
      const hourlyRate = parseNumericCell(rawRate);

      const usersBlank = rawUsers === undefined || String(rawUsers).trim() === '';
      const minsBlank = rawMins === undefined || String(rawMins).trim() === '';
      const freqBlank = rawFreq === undefined || String(rawFreq).trim() === '';

      if (usersBlank && allowIncomplete) {
        missingDataFields.push('Users Count');
        warnings.push('Users Count blank — flagged Needs Data Completion.');
      } else if (usersCount === null || usersCount < 0) {
        errors.push('Users Count must be a non-negative number.');
      }

      if (minsBlank && allowIncomplete) {
        missingDataFields.push('Minutes Saved');
        warnings.push('Minutes Saved blank — flagged Needs Data Completion.');
      } else if (minutesSaved === null || minutesSaved < 0) {
        errors.push('Minutes Saved must be a non-negative number.');
      }

      if (freqBlank && allowIncomplete) {
        missingDataFields.push('Process Frequency');
        warnings.push('Process Frequency blank — flagged Needs Data Completion.');
      } else if (freqPerWeek === null || freqPerWeek < 0) {
        errors.push('Process Frequency / Week must be a non-negative number.');
      }

      if (rawRate !== undefined && String(rawRate).trim() !== '' && (hourlyRate === null || hourlyRate < 0)) {
        errors.push('Hourly Rate must be a non-negative number.');
      }

      const rawCreatedAt = readCell(rawRow, 'createdAt');
      const createdAt = normalizeDateCell(rawCreatedAt);
      const rawUpdatedAt = readCell(rawRow, 'updatedAt');
      const updatedAt = normalizeDateCell(rawUpdatedAt);

      const rawIdeaDate = readCell(rawRow, 'ideaDate');
      const ideaDateParsed = normalizeDateCell(rawIdeaDate);
      const ideaDate = ideaDateParsed ?? createdAt ?? nowDate;
      if (!ideaDateParsed && !createdAt) {
        missingDataFields.push('Idea / Created Date');
        warnings.push(`Idea/Created Date blank; recorded import date ${ideaDate}.`);
      }

      const rawGoLive = readCell(rawRow, 'goLiveDate');
      const goLiveDate = normalizeDateCell(rawGoLive);
      if (
        (lifecycleStatus === LifecycleStatus.PILOT ||
          lifecycleStatus === LifecycleStatus.PRODUCTION ||
          lifecycleStatus === LifecycleStatus.MONITORING ||
          lifecycleStatus === LifecycleStatus.SCALE_IMPROVE) &&
        !goLiveDate
      ) {
        missingDataFields.push('Go-Live Date');
      }

      if (!rawCap) {
        missingDataFields.push('Business Capability');
        warnings.push('Business Capability blank — flagged Needs Data Completion.');
      }

      if (
        valueCategory === ValueCategory.EFFICIENCY &&
        hourlyRate === null
      ) {
        missingDataFields.push('Hourly Rate (Efficiency)');
      }

      const rawPlatform = String(readCell(rawRow, 'aiPlatform') ?? '').trim();
      if (!rawPlatform) {
        missingDataFields.push('AI Platform');
      }
      const aiPlatform = rawPlatform || AI_PLATFORMS[7];
      const aiType =
        String(readCell(rawRow, 'aiType') ?? '').trim() || 'Generative AI / LLM';
      const solutionType =
        String(readCell(rawRow, 'solutionType') ?? '').trim() ||
        'Enterprise Copilot Extension';

      const isValid = errors.length === 0;
      const needsDataCompletion = missingDataFields.length > 0;

      return {
        rowIndex: idx + 1,
        rawRow,
        sharepointId: spId,
        title,
        businessProblem,
        description,
        businessCapability: rawCap || '',
        departmentId: deptResolved.departmentId,
        departmentName: deptResolved.departmentName,
        isNewDepartment: deptResolved.isNewDepartment,
        isAmbiguousDepartment: deptResolved.isAmbiguous,
        ownerId,
        ownerDisplayName,
        aiPlatform,
        aiType,
        solutionType,
        category: category ?? RegistrableCategory.AI_SOLUTION,
        lifecycleStatus: lifecycleStatus ?? LifecycleStatus.IDEA,
        valueCategory: valueCategory ?? ValueCategory.EFFICIENCY,
        usersCount: usersCount !== null ? Math.round(usersCount) : 0,
        minutesSavedPerOccurrence: minutesSaved ?? 0,
        processFrequencyPerWeek: freqPerWeek ?? 0,
        hourlyRate: hourlyRate ?? undefined,
        ideaDate,
        goLiveDate,
        createdAt: createdAt ? `${createdAt}T00:00:00.000Z` : undefined,
        updatedAt: updatedAt ? `${updatedAt}T00:00:00.000Z` : undefined,
        needsDataCompletion,
        missingDataFields,
        errors,
        warnings,
        isValid,
      };
    }
  );

  return {
    validRows: allRows.filter((r) => r.isValid),
    invalidRows: allRows.filter((r) => !r.isValid),
    allRows,
  };
}

export type DuplicateResolutionAction =
  | 'IMPORT_NEW'
  | 'UPDATE_EXISTING'
  | 'SKIP';

export interface DuplicateChangeDiff {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface DuplicateReviewItem {
  row: NormalizedInitiativeImportRow;
  matchType: 'NONE' | 'SHAREPOINT_ID' | 'TITLE_AND_DEPARTMENT';
  matchedInitiative?: Initiative;
  changes: DuplicateChangeDiff[];
  decision: DuplicateResolutionAction;
}

export function detectImportDuplicates(
  validRows: NormalizedInitiativeImportRow[],
  existingInitiatives: Initiative[]
): DuplicateReviewItem[] {
  return validRows.map((row) => {
    // Priority 1: Stable SharePoint Item ID (or direct ID)
    let matchType: DuplicateReviewItem['matchType'] = 'NONE';
    let matched: Initiative | undefined;

    if (row.sharepointId) {
      matched = existingInitiatives.find(
        (e) =>
          (e.syncLinkage?.itemId &&
            e.syncLinkage.itemId.toLowerCase() ===
              row.sharepointId!.toLowerCase()) ||
          e.id.toLowerCase() === row.sharepointId!.toLowerCase()
      );
      if (matched) {
        matchType = 'SHAREPOINT_ID';
      }
    }

    // Priority 2: Normalized Title + Department match
    if (!matched) {
      const rowTitleNorm = row.title.trim().toLowerCase();
      matched = existingInitiatives.find(
        (e) =>
          e.title.trim().toLowerCase() === rowTitleNorm &&
          e.departmentId === row.departmentId
      );
      if (matched) {
        matchType = 'TITLE_AND_DEPARTMENT';
      }
    }

    if (!matched) {
      return {
        row,
        matchType: 'NONE',
        changes: [],
        decision: 'IMPORT_NEW',
      };
    }

    const diffs: DuplicateChangeDiff[] = [];
    const check = (field: string, oldV: unknown, newV: unknown) => {
      const o = String(oldV ?? '').trim();
      const n = String(newV ?? '').trim();
      if (o !== n) {
        diffs.push({ field, oldValue: o || '—', newValue: n || '—' });
      }
    };

    check('Title', matched.title, row.title);
    check('Business Problem', matched.businessProblem, row.businessProblem);
    check('Description', matched.description, row.description);
    check('Lifecycle Status', matched.lifecycleStatus, row.lifecycleStatus);
    check('Value Category', matched.valueCategory, row.valueCategory);
    check('Users Count', matched.usersCount, row.usersCount);
    check('Minutes Saved', matched.minutesSavedPerOccurrence, row.minutesSavedPerOccurrence);
    check('Weekly Frequency', matched.processFrequencyPerWeek, row.processFrequencyPerWeek);
    check('Hourly Rate', matched.hourlyRate ?? '', row.hourlyRate ?? '');
    check('AI Platform', matched.aiPlatform, row.aiPlatform);

    // Default to SKIP on exact or SharePoint ID re-imports so re-importing never duplicates
    const defaultDecision: DuplicateResolutionAction =
      diffs.length === 0 || matchType === 'SHAREPOINT_ID'
        ? 'SKIP'
        : 'UPDATE_EXISTING';

    return {
      row,
      matchType,
      matchedInitiative: matched,
      changes: diffs,
      decision: defaultDecision,
    };
  });
}

// ---------- COST EXCEL/CSV IMPORT (MODULE 4) ----------

export type CostImportField =
  | 'department'
  | 'costCenter'
  | 'period'
  | 'platform'
  | 'costCategory'
  | 'spendType'
  | 'amountEur'
  | 'tokens'
  | 'initiativeId'
  | 'note'
  | '__EXCLUDE__';

export const COST_IMPORT_FIELD_LABELS: Record<CostImportField, string> = {
  department: 'Department *',
  costCenter: 'Cost Center *',
  period: 'Period (YYYY-MM) *',
  platform: 'AI Platform *',
  costCategory: 'Cost Category *',
  spendType: 'Spend Type (Planned/Actual)',
  amountEur: 'Amount (EUR) *',
  tokens: 'Tokens Consumed',
  initiativeId: 'Linked Initiative ID (Optional)',
  note: 'Note (Optional)',
  __EXCLUDE__: 'Exclude Column',
};

const COST_HEADER_ALIASES: Record<
  Exclude<CostImportField, '__EXCLUDE__'>,
  string[]
> = {
  department: ['department', 'dept', 'business area', 'business unit'],
  costCenter: ['cost center', 'costcenter', 'cost centre', 'cc'],
  period: ['period', 'month', 'billing month', 'year month', 'date'],
  platform: ['platform', 'ai platform', 'service', 'vendor'],
  costCategory: ['cost category', 'category', 'expense type', 'line item'],
  spendType: ['spend type', 'type', 'planned vs actual', 'actual or planned', 'budget type'],
  amountEur: ['amount eur', 'amount', 'eur', 'cost eur', 'spend eur', 'cost'],
  tokens: ['tokens', 'token count', 'tokens consumed', 'usage tokens'],
  initiativeId: ['initiative id', 'initiative', 'solution id'],
  note: ['note', 'notes', 'comment', 'memo'],
};

export function suggestCostColumnMappings(
  headers: string[]
): ColumnMappingSuggestion<CostImportField>[] {
  const used = new Set<CostImportField>();
  return headers.map((sourceHeader) => {
    const norm = normalizeHeader(sourceHeader);
    for (const [field, aliases] of Object.entries(COST_HEADER_ALIASES) as Array<
      [Exclude<CostImportField, '__EXCLUDE__'>, string[]]
    >) {
      if (used.has(field)) continue;
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        used.add(field);
        return {
          sourceHeader,
          targetField: field,
          method: 'EXACT_ALIAS',
          confidencePercent: 100,
          reason: `Matched alias "${sourceHeader}"`,
        };
      }
    }
    let best: Exclude<CostImportField, '__EXCLUDE__'> | null = null;
    let bestScore = 0;
    for (const [field, aliases] of Object.entries(COST_HEADER_ALIASES) as Array<
      [Exclude<CostImportField, '__EXCLUDE__'>, string[]]
    >) {
      if (used.has(field)) continue;
      for (const alias of aliases) {
        const s = diceSimilarity(norm, alias);
        if (s > bestScore) {
          bestScore = s;
          best = field;
        }
      }
    }
    if (best && bestScore >= 0.62) {
      used.add(best);
      return {
        sourceHeader,
        targetField: best,
        method: 'FUZZY_STRING',
        confidencePercent: Math.round(bestScore * 100),
        reason: `Fuzzy match (${Math.round(bestScore * 100)}%)`,
      };
    }
    return {
      sourceHeader,
      targetField: '__EXCLUDE__',
      method: 'UNMAPPED',
      confidencePercent: 0,
      reason: 'Unmapped column',
    };
  });
}

function normalizePeriod(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}\/\d{2}$/.test(s)) return s.replace('/', '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 7);
  }
  return null;
}

function normalizeCostCategory(raw: unknown): CostCategory | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('licen') || s.includes('seat') || s.includes('subscr')) return CostCategory.LICENSING;
  if (s.includes('token') || s.includes('api') || s.includes('usage')) return CostCategory.TOKENS_API;
  if (s.includes('infra') || s.includes('cloud') || s.includes('compute') || s.includes('gpu')) return CostCategory.INFRASTRUCTURE;
  if (s.includes('impl') || s.includes('build') || s.includes('consult')) return CostCategory.IMPLEMENTATION;
  if (s.includes('supp') || s.includes('ops') || s.includes('maint')) return CostCategory.SUPPORT;
  for (const cat of Object.values(CostCategory)) {
    if (cat.toLowerCase() === s || COST_CATEGORY_LABELS[cat].toLowerCase() === s) {
      return cat;
    }
  }
  return null;
}

export interface NormalizedCostImportRow {
  rowIndex: number;
  departmentId: string;
  departmentName: string;
  isNewDepartment: boolean;
  costCenter: string;
  period: string;
  platform: string;
  costCategory: CostCategory;
  spendType: SpendType;
  amountEur: number;
  tokens: number;
  initiativeId?: string;
  note?: string;
  errors: string[];
  isValid: boolean;
}

export function validateAndNormalizeCostImportBatch(params: {
  rows: Record<string, unknown>[];
  mappings: ColumnMappingSuggestion<CostImportField>[];
  departments: Department[];
}): {
  validRows: NormalizedCostImportRow[];
  invalidRows: NormalizedCostImportRow[];
  allRows: NormalizedCostImportRow[];
} {
  const fieldToHeader = new Map<CostImportField, string>();
  for (const m of params.mappings) {
    if (m.targetField !== '__EXCLUDE__' && !fieldToHeader.has(m.targetField)) {
      fieldToHeader.set(m.targetField, m.sourceHeader);
    }
  }

  const read = (row: Record<string, unknown>, field: CostImportField) => {
    const h = fieldToHeader.get(field);
    return h ? row[h] : undefined;
  };

  const allRows: NormalizedCostImportRow[] = params.rows.map((row, idx) => {
    const errors: string[] = [];
    const rawDept = String(read(row, 'department') ?? '').trim();
    const costCenter = String(read(row, 'costCenter') ?? '').trim();
    const rawPeriod = read(row, 'period');
    const platform = String(read(row, 'platform') ?? '').trim();
    const rawCategory = read(row, 'costCategory');
    const rawSpendType = String(read(row, 'spendType') ?? 'ACTUAL').trim().toUpperCase();
    const amountEur = parseNumericCell(read(row, 'amountEur'));
    const rawTokens = read(row, 'tokens');
    const tokens =
      rawTokens === undefined || String(rawTokens).trim() === ''
        ? 0
        : parseNumericCell(rawTokens);

    if (!rawDept) errors.push('Missing Department.');
    if (!costCenter) errors.push('Missing Cost Center.');
    const period = normalizePeriod(rawPeriod);
    if (!period) errors.push('Period must be valid (e.g. YYYY-MM).');
    if (!platform) errors.push('Missing AI Platform.');
    const costCategory = normalizeCostCategory(rawCategory);
    if (!costCategory) errors.push('Missing or unrecognized Cost Category.');
    const spendType: SpendType = rawSpendType.includes('PLAN')
      ? 'PLANNED'
      : 'ACTUAL';
    if (amountEur === null || amountEur < 0) {
      errors.push('Amount EUR must be a non-negative number.');
    }
    if (tokens === null || tokens < 0) {
      errors.push('Tokens must be a non-negative integer.');
    }

    const deptResolved = rawDept
      ? resolveDepartmentMatch(rawDept, params.departments)
      : { departmentId: '', departmentName: '', isNewDepartment: false };

    return {
      rowIndex: idx + 1,
      departmentId: deptResolved.departmentId,
      departmentName: deptResolved.departmentName,
      isNewDepartment: deptResolved.isNewDepartment,
      costCenter,
      period: period ?? '',
      platform,
      costCategory: costCategory ?? CostCategory.LICENSING,
      spendType,
      amountEur: amountEur ?? 0,
      tokens: tokens !== null ? Math.round(tokens) : 0,
      initiativeId: String(read(row, 'initiativeId') ?? '').trim() || undefined,
      note: String(read(row, 'note') ?? '').trim() || undefined,
      errors,
      isValid: errors.length === 0,
    };
  });

  return {
    validRows: allRows.filter((r) => r.isValid),
    invalidRows: allRows.filter((r) => !r.isValid),
    allRows,
  };
}

export function buildImportErrorsCsv(
  rows: Array<{ rowIndex: number; identifier: string; errors: string[] }>
): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ['Row,Identifier,Errors'];
  for (const r of rows) {
    if (r.errors.length === 0) continue;
    lines.push(
      [String(r.rowIndex), escape(r.identifier), escape(r.errors.join(' | '))].join(',')
    );
  }
  return lines.join('\n');
}

// ---------- COST PLANNING EXCEL/CSV IMPORT (5-STEP WORKFLOW) ----------

export type CostPlanImportField =
  | 'department'
  | 'planningYear'
  | 'month'
  | 'period'
  | 'platform'
  | 'costCategory'
  | 'plannedAmountEur'
  | 'forecastAmountEur'
  | 'costCenter'
  | 'licenseCount'
  | 'comments'
  | '__EXCLUDE__';

export const COST_PLAN_IMPORT_FIELD_LABELS: Record<CostPlanImportField, string> = {
  department: 'Department *',
  planningYear: 'Planning Year *',
  month: 'Month (1–12 or Name) *',
  period: 'Period (YYYY-MM / MM-YYYY)',
  platform: 'AI Platform *',
  costCategory: 'Cost Category',
  plannedAmountEur: 'Planned Cost / Budget (EUR) *',
  forecastAmountEur: 'Forecast Cost (EUR, Optional)',
  costCenter: 'Cost Center (Optional)',
  licenseCount: 'License / Seat Count (Optional)',
  comments: 'Comments / Notes (Optional)',
  __EXCLUDE__: 'Exclude / Ignore Column',
};

const COST_PLAN_HEADER_ALIASES: Record<
  Exclude<CostPlanImportField, '__EXCLUDE__'>,
  string[]
> = {
  department: [
    'department',
    'dept',
    'business area',
    'business unit',
    'division',
    'abteilung',
    'fachbereich',
    'bereich',
  ],
  planningYear: [
    'planning year',
    'plan year',
    'year',
    'budget year',
    'fiscal year',
    'fy',
    'planungsjahr',
    'jahr',
  ],
  month: ['month', 'month number', 'monat', 'plan month', 'billing month'],
  period: ['period', 'year month', 'yyyy mm', 'yyyy-mm', 'zeitraum', 'periode'],
  platform: ['platform', 'ai platform', 'vendor', 'tool', 'service', 'ki plattform', 'plattform'],
  costCategory: [
    'cost category',
    'category',
    'expense type',
    'cost type',
    'kostenart',
    'kategorie',
  ],
  plannedAmountEur: [
    'planned cost',
    'planned amount',
    'planned eur',
    'planned amount eur',
    'planned',
    'budget',
    'annual budget',
    'monthly budget',
    'plan eur',
    'plankosten',
    'geplante kosten',
  ],
  forecastAmountEur: [
    'forecast cost',
    'forecast amount',
    'forecast eur',
    'forecast amount eur',
    'forecast',
    'latest forecast',
    'prognose',
    'forecast kosten',
  ],
  costCenter: ['cost center', 'cost centre', 'costcenter', 'cc', 'kostenstelle'],
  licenseCount: [
    'license count',
    'licenses',
    'seats',
    'seat count',
    'users',
    'lizenzen',
    'anzahl lizenzen',
  ],
  comments: ['comments', 'comment', 'note', 'notes', 'memo', 'kommentar', 'bemerkung'],
};

export class MockCostPlanMappingProvider {
  public readonly providerName = 'MockCostPlanMappingProvider (Rule-Based Demo)';

  public suggestField(
    header: string
  ): { field: CostPlanImportField; reason: string; confidence: number } | null {
    const h = normalizeHeader(header);
    if (!h) return null;
    if (h.includes('forecast') || h.includes('prognos') || h.includes('fcst')) {
      return {
        field: 'forecastAmountEur',
        reason: 'Rule-based heuristic: forecast keyword detected',
        confidence: 78,
      };
    }
    if (h.includes('plan') || h.includes('budget') || h.includes('plankost')) {
      if (h.includes('year') || h.includes('jahr')) {
        return {
          field: 'planningYear',
          reason: 'Rule-based heuristic: planning year keyword detected',
          confidence: 76,
        };
      }
      return {
        field: 'plannedAmountEur',
        reason: 'Rule-based heuristic: planned budget amount keyword detected',
        confidence: 76,
      };
    }
    if (h.includes('licen') || h.includes('seat') || h.includes('lizenz')) {
      return {
        field: 'licenseCount',
        reason: 'Rule-based heuristic: license/seat keyword detected',
        confidence: 74,
      };
    }
    if (h.includes('abt') || h.includes('dept') || h.includes('bereich') || h.includes('org')) {
      return {
        field: 'department',
        reason: 'Rule-based heuristic: department keyword detected',
        confidence: 72,
      };
    }
    if (h.includes('kostenst') || h === 'cc') {
      return {
        field: 'costCenter',
        reason: 'Rule-based heuristic: cost center keyword detected',
        confidence: 74,
      };
    }
    if (h.includes('monat') || h.includes('month')) {
      return {
        field: 'month',
        reason: 'Rule-based heuristic: month keyword detected',
        confidence: 74,
      };
    }
    if (h.includes('plat') || h.includes('tool') || h.includes('vendor')) {
      return {
        field: 'platform',
        reason: 'Rule-based heuristic: AI platform keyword detected',
        confidence: 72,
      };
    }
    return null;
  }
}

export function suggestCostPlanColumnMappings(
  headers: string[],
  options?: { useMockProvider?: boolean }
): ColumnMappingSuggestion<CostPlanImportField>[] {
  const used = new Set<CostPlanImportField>();
  const mockProvider =
    options?.useMockProvider !== false ? new MockCostPlanMappingProvider() : null;

  return headers.map((sourceHeader) => {
    const norm = normalizeHeader(sourceHeader);
    if (!norm) {
      return {
        sourceHeader,
        targetField: '__EXCLUDE__',
        method: 'UNMAPPED',
        confidencePercent: 0,
        reason: 'Empty header',
      };
    }

    for (const [field, aliases] of Object.entries(COST_PLAN_HEADER_ALIASES) as Array<
      [Exclude<CostPlanImportField, '__EXCLUDE__'>, string[]]
    >) {
      if (used.has(field)) continue;
      if (aliases.some((a) => normalizeHeader(a) === norm)) {
        used.add(field);
        return {
          sourceHeader,
          targetField: field,
          method: 'EXACT_ALIAS',
          confidencePercent: 100,
          reason: `Matched known cost planning header "${sourceHeader}"`,
        };
      }
    }

    let bestField: Exclude<CostPlanImportField, '__EXCLUDE__'> | null = null;
    let bestScore = 0;
    for (const [field, aliases] of Object.entries(COST_PLAN_HEADER_ALIASES) as Array<
      [Exclude<CostPlanImportField, '__EXCLUDE__'>, string[]]
    >) {
      if (used.has(field)) continue;
      for (const alias of aliases) {
        const sim = diceSimilarity(norm, alias);
        if (sim > bestScore) {
          bestScore = sim;
          bestField = field;
        }
      }
    }
    if (bestField && bestScore >= 0.62) {
      used.add(bestField);
      return {
        sourceHeader,
        targetField: bestField,
        method: 'FUZZY_STRING',
        confidencePercent: Math.round(bestScore * 100),
        reason: `Fuzzy header match (${Math.round(bestScore * 100)}%)`,
      };
    }

    if (mockProvider) {
      const hit = mockProvider.suggestField(sourceHeader);
      if (hit && !used.has(hit.field)) {
        used.add(hit.field);
        return {
          sourceHeader,
          targetField: hit.field,
          method: 'MOCK_PROVIDER',
          confidencePercent: hit.confidence,
          reason: `${hit.reason} (Demo)`,
        };
      }
    }

    return {
      sourceHeader,
      targetField: '__EXCLUDE__',
      method: 'UNMAPPED',
      confidencePercent: 0,
      reason: 'No automatic match — choose a Cost Planning field or ignore column',
    };
  });
}

export function findDuplicateCostPlanConflicts(
  mappings: ColumnMappingSuggestion<CostPlanImportField>[]
): Array<{ targetField: CostPlanImportField; sourceHeaders: string[] }> {
  const byTarget = new Map<CostPlanImportField, string[]>();
  for (const m of mappings) {
    if (m.targetField === '__EXCLUDE__') continue;
    const arr = byTarget.get(m.targetField) ?? [];
    arr.push(m.sourceHeader);
    byTarget.set(m.targetField, arr);
  }
  const conflicts: Array<{
    targetField: CostPlanImportField;
    sourceHeaders: string[];
  }> = [];
  for (const [targetField, sourceHeaders] of byTarget.entries()) {
    if (sourceHeaders.length > 1) {
      conflicts.push({ targetField, sourceHeaders });
    }
  }
  return conflicts;
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  januar: 1,
  feb: 2,
  february: 2,
  februar: 2,
  mar: 3,
  march: 3,
  maerz: 3,
  marz: 3,
  mrz: 3,
  apr: 4,
  april: 4,
  may: 5,
  mai: 5,
  jun: 6,
  june: 6,
  juni: 6,
  jul: 7,
  july: 7,
  juli: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  dez: 12,
  dezember: 12,
};

function parseMonthToken(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const r = Math.round(raw);
    if (r >= 1 && r <= 12) return r;
    if (r > 25569) {
      const utcDays = Math.floor(r - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(d.getTime())) return d.getUTCMonth() + 1;
    }
    return null;
  }
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/\.$/, '');
  if (/^(0?[1-9]|1[0-2])$/.test(s)) {
    return Number(s);
  }
  if (s in MONTH_NAME_MAP) {
    return MONTH_NAME_MAP[s];
  }
  const ym = /^(\d{4})[-/.](0?[1-9]|1[0-2])/.exec(s);
  if (ym) return Number(ym[2]);
  const my = /^(0?[1-9]|1[0-2])[-/.](\d{4})$/.exec(s);
  if (my) return Number(my[1]);
  return null;
}

export function normalizeCostPlanMonthAndYear(params: {
  rawYear?: unknown;
  rawMonth?: unknown;
  rawPeriod?: unknown;
  defaultPlanningYear?: number;
}): { planningYear: number | null; month: number | null; period: string | null } {
  let year: number | null = null;
  let month: number | null = null;

  // 1. Parse period if supplied (YYYY-MM, YYYY/MM, MM/YYYY, MM.YYYY, or Excel date serial)
  if (params.rawPeriod !== undefined && String(params.rawPeriod).trim() !== '') {
    const rp = params.rawPeriod;
    if (typeof rp === 'number' && rp > 25569) {
      const d = new Date(Math.floor(rp - 25569) * 86400 * 1000);
      if (!Number.isNaN(d.getTime())) {
        year = d.getUTCFullYear();
        month = d.getUTCMonth() + 1;
      }
    } else {
      const s = String(rp).trim();
      const ym = /^(\d{4})[-/.](0?[1-9]|1[0-2])(?:[-/.]\d{1,2})?$/.exec(s);
      const my = /^(0?[1-9]|1[0-2])[-/.](\d{4})$/.exec(s);
      if (ym) {
        year = Number(ym[1]);
        month = Number(ym[2]);
      } else if (my) {
        month = Number(my[1]);
        year = Number(my[2]);
      }
    }
  }

  // 2. Explicit Year column overrides / fills
  if (params.rawYear !== undefined && String(params.rawYear).trim() !== '') {
    const parsedYear = parseNumericCell(params.rawYear);
    if (parsedYear !== null && Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100) {
      year = parsedYear;
    } else {
      const match4 = /(\d{4})/.exec(String(params.rawYear));
      if (match4) {
        year = Number(match4[1]);
      }
    }
  }

  // 3. Explicit Month column overrides / fills
  if (params.rawMonth !== undefined && String(params.rawMonth).trim() !== '') {
    const parsedMonth = parseMonthToken(params.rawMonth);
    if (parsedMonth !== null) {
      month = parsedMonth;
    }
  }

  if (year === null && params.defaultPlanningYear) {
    year = params.defaultPlanningYear;
  }

  const period =
    year !== null && month !== null
      ? `${year}-${String(month).padStart(2, '0')}`
      : null;

  return { planningYear: year, month, period };
}

export interface NormalizedCostPlanImportRow {
  rowIndex: number;
  rawRow: Record<string, unknown>;
  departmentId: string;
  departmentName: string;
  isNewDepartment: boolean;
  isAmbiguousDepartment?: boolean;
  planningYear: number;
  month: number;
  period: string;
  platform: string;
  costCategory: CostCategory;
  plannedAmountEur: number;
  forecastAmountEur: number | null; // Strictly preserved as null when blank
  costCenter?: string;
  licenseCount?: number | null;
  comments?: string;
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export function validateAndNormalizeCostPlanImportBatch(params: {
  rows: Record<string, unknown>[];
  mappings: ColumnMappingSuggestion<CostPlanImportField>[];
  departments: Department[];
  aliasRules?: DepartmentAliasRule[];
  defaultPlanningYear?: number;
}): {
  validRows: NormalizedCostPlanImportRow[];
  invalidRows: NormalizedCostPlanImportRow[];
  allRows: NormalizedCostPlanImportRow[];
} {
  const fieldToHeader = new Map<CostPlanImportField, string>();
  for (const m of params.mappings) {
    if (m.targetField !== '__EXCLUDE__' && !fieldToHeader.has(m.targetField)) {
      fieldToHeader.set(m.targetField, m.sourceHeader);
    }
  }

  const read = (row: Record<string, unknown>, field: CostPlanImportField) => {
    const h = fieldToHeader.get(field);
    return h ? row[h] : undefined;
  };

  const allRows: NormalizedCostPlanImportRow[] = params.rows.map((rawRow, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawDept = String(read(rawRow, 'department') ?? '').trim();
    const rawYear = read(rawRow, 'planningYear');
    const rawMonth = read(rawRow, 'month');
    const rawPeriod = read(rawRow, 'period');
    const platform = String(read(rawRow, 'platform') ?? '').trim();
    const rawCategory = read(rawRow, 'costCategory');
    const rawPlanned = read(rawRow, 'plannedAmountEur');
    const rawForecast = read(rawRow, 'forecastAmountEur');
    const costCenter = String(read(rawRow, 'costCenter') ?? '').trim() || undefined;
    const rawLicenses = read(rawRow, 'licenseCount');
    const comments = String(read(rawRow, 'comments') ?? '').trim() || undefined;

    if (!rawDept) {
      errors.push('Missing required Department.');
    }

    const deptResolved = rawDept
      ? resolveDepartmentMatch(rawDept, params.departments, params.aliasRules)
      : {
          departmentId: '',
          departmentName: '',
          isNewDepartment: false,
          isAmbiguous: false,
        };

    if (deptResolved.isAmbiguous) {
      warnings.push(
        `Department "${rawDept}" matches multiple candidates — verify alias mapping in Settings.`
      );
    }

    const { planningYear, month, period } = normalizeCostPlanMonthAndYear({
      rawYear,
      rawMonth,
      rawPeriod,
      defaultPlanningYear: params.defaultPlanningYear,
    });
    if (planningYear === null || planningYear < 2000 || planningYear > 2100) {
      errors.push('Missing or invalid Planning Year (expected 2000–2100 or Period YYYY-MM).');
    }
    if (month === null || month < 1 || month > 12) {
      errors.push('Missing or invalid Month (expected 1–12, month name, or Period YYYY-MM).');
    }

    if (!platform) {
      errors.push('Missing required AI Platform.');
    }

    let costCategory = normalizeCostCategory(rawCategory);
    if (!costCategory) {
      if (rawCategory !== undefined && String(rawCategory).trim() !== '') {
        errors.push(`Unrecognized Cost Category "${String(rawCategory)}".`);
      } else {
        costCategory = CostCategory.LICENSING;
        warnings.push('Cost Category blank/unmapped — defaulted to Platform Licensing.');
      }
    }

    const plannedVal = parseNumericCell(rawPlanned);
    if (
      rawPlanned === undefined ||
      String(rawPlanned).trim() === '' ||
      plannedVal === null ||
      plannedVal < 0
    ) {
      errors.push('Planned Cost (EUR) is required and must be a non-negative number.');
    }

    const forecastBlank =
      rawForecast === undefined || String(rawForecast).trim() === '';
    let forecastAmountEur: number | null = null;
    if (forecastBlank) {
      forecastAmountEur = null;
      warnings.push('Forecast Cost blank — preserved as Missing Forecast (never fabricated).');
    } else {
      const parsedForecast = parseNumericCell(rawForecast);
      if (parsedForecast === null || parsedForecast < 0) {
        errors.push('Forecast Cost (EUR) must be blank or a non-negative number.');
      } else {
        forecastAmountEur = parsedForecast;
      }
    }

    const licensesBlank =
      rawLicenses === undefined || String(rawLicenses).trim() === '';
    let licenseCount: number | null = null;
    if (!licensesBlank) {
      const parsedLic = parseNumericCell(rawLicenses);
      if (parsedLic === null || parsedLic < 0) {
        errors.push('License Count must be blank or a non-negative integer.');
      } else {
        licenseCount = Math.round(parsedLic);
      }
    }

    return {
      rowIndex: idx + 1,
      rawRow,
      departmentId: deptResolved.departmentId,
      departmentName: deptResolved.departmentName,
      isNewDepartment: deptResolved.isNewDepartment,
      isAmbiguousDepartment: deptResolved.isAmbiguous,
      planningYear: planningYear ?? (params.defaultPlanningYear ?? new Date().getUTCFullYear()),
      month: month ?? 1,
      period: period ?? '',
      platform,
      costCategory: costCategory ?? CostCategory.LICENSING,
      plannedAmountEur: plannedVal !== null && plannedVal >= 0 ? plannedVal : 0,
      forecastAmountEur,
      costCenter,
      licenseCount,
      comments,
      errors,
      warnings,
      isValid: errors.length === 0,
    };
  });

  return {
    validRows: allRows.filter((r) => r.isValid),
    invalidRows: allRows.filter((r) => !r.isValid),
    allRows,
  };
}

export function buildCostPlanCompositeKey(params: {
  departmentId: string;
  planningYear: number;
  month: number;
  platform: string;
  costCategory: CostCategory;
  costCenter?: string;
}): string {
  return [
    params.departmentId.trim().toLowerCase(),
    String(params.planningYear),
    String(params.month),
    params.platform.trim().toLowerCase(),
    params.costCategory,
    (params.costCenter ?? '').trim().toLowerCase(),
  ].join('::');
}

export interface CostPlanDuplicateReviewItem {
  row: NormalizedCostPlanImportRow;
  matchType: 'NONE' | 'EXACT_PLAN_KEY';
  matchedPlan?: import('./types').AiCostPlanEntry;
  changes: DuplicateChangeDiff[];
  decision: import('./types').CostPlanDuplicateAction;
}

export function detectCostPlanDuplicates(
  validRows: NormalizedCostPlanImportRow[],
  existingPlans: import('./types').AiCostPlanEntry[]
): CostPlanDuplicateReviewItem[] {
  const existingByKey = new Map<string, import('./types').AiCostPlanEntry>();
  for (const plan of existingPlans) {
    const key = buildCostPlanCompositeKey({
      departmentId: plan.departmentId,
      planningYear: plan.planningYear,
      month: plan.month,
      platform: plan.platform,
      costCategory: plan.costCategory,
      costCenter: plan.costCenter,
    });
    if (!existingByKey.has(key)) {
      existingByKey.set(key, plan);
    }
  }

  return validRows.map((row) => {
    const key = buildCostPlanCompositeKey({
      departmentId: row.departmentId,
      planningYear: row.planningYear,
      month: row.month,
      platform: row.platform,
      costCategory: row.costCategory,
      costCenter: row.costCenter,
    });
    const matched = existingByKey.get(key);
    if (!matched) {
      return {
        row,
        matchType: 'NONE',
        changes: [],
        decision: 'CREATE_NEW',
      };
    }

    const changes: DuplicateChangeDiff[] = [];
    const check = (field: string, oldV: unknown, newV: unknown) => {
      const o = oldV === null || oldV === undefined || oldV === '' ? '—' : String(oldV).trim();
      const n = newV === null || newV === undefined || newV === '' ? '—' : String(newV).trim();
      if (o !== n) {
        changes.push({ field, oldValue: o, newValue: n });
      }
    };

    check('Planned EUR', matched.plannedAmountEur, row.plannedAmountEur);
    check(
      'Forecast EUR',
      matched.forecastAmountEur === null ? 'Missing' : matched.forecastAmountEur,
      row.forecastAmountEur === null ? 'Missing' : row.forecastAmountEur
    );
    check('License Count', matched.licenseCount ?? '', row.licenseCount ?? '');
    check('Comments', matched.comments ?? '', row.comments ?? '');

    return {
      row,
      matchType: 'EXACT_PLAN_KEY',
      matchedPlan: matched,
      changes,
      decision: changes.length === 0 ? 'SKIP' : 'UPDATE_EXISTING',
    };
  });
}

