import {
  AiCostTransaction,
  BenefitEntry,
  Department,
  DepartmentAliasRule,
  Initiative,
  OperationsReportingConfig,
  ReportingScope,
} from './types';

/**
 * Exact Operations-first priority order required across Executive Dashboard,
 * Lifecycle Management, Savings Data Quality, and Presentation Mode.
 */
export const DEFAULT_OPERATIONS_DEPARTMENT_ORDER = [
  'dept-eng',
  'dept-proc',
  'dept-site',
  'dept-ana',
] as const;

export const DEFAULT_OPERATIONS_DEPARTMENT_NAMES = [
  'Engineering',
  'Procurement',
  'Site Service',
  'Analytics',
] as const;

export const DEFAULT_DEPARTMENT_ALIAS_RULES: DepartmentAliasRule[] = [
  { id: 'alias-eng-1', alias: 'eng', targetDepartmentId: 'dept-eng' },
  { id: 'alias-eng-2', alias: 'mechanical engineering', targetDepartmentId: 'dept-eng' },
  { id: 'alias-eng-3', alias: 'plant engineering', targetDepartmentId: 'dept-eng' },
  { id: 'alias-eng-4', alias: 'manufacturing engineering', targetDepartmentId: 'dept-eng' },
  { id: 'alias-proc-1', alias: 'proc', targetDepartmentId: 'dept-proc' },
  { id: 'alias-proc-2', alias: 'purchasing', targetDepartmentId: 'dept-proc' },
  { id: 'alias-proc-3', alias: 'sourcing', targetDepartmentId: 'dept-proc' },
  { id: 'alias-proc-4', alias: 'strategic procurement', targetDepartmentId: 'dept-proc' },
  { id: 'alias-site-1', alias: 'site services', targetDepartmentId: 'dept-site' },
  { id: 'alias-site-2', alias: 'site operations', targetDepartmentId: 'dept-site' },
  { id: 'alias-site-3', alias: 'field service', targetDepartmentId: 'dept-site' },
  { id: 'alias-site-4', alias: 'facility operations', targetDepartmentId: 'dept-site' },
  { id: 'alias-ana-1', alias: 'data & analytics', targetDepartmentId: 'dept-ana' },
  { id: 'alias-ana-2', alias: 'operations analytics', targetDepartmentId: 'dept-ana' },
  { id: 'alias-ana-3', alias: 'business intelligence', targetDepartmentId: 'dept-ana' },
  { id: 'alias-ana-4', alias: 'bi & analytics', targetDepartmentId: 'dept-ana' },
];

export const DEFAULT_OPERATIONS_CONFIG: OperationsReportingConfig = {
  operationsDepartmentIds: [...DEFAULT_OPERATIONS_DEPARTMENT_ORDER],
  aliasRules: [...DEFAULT_DEPARTMENT_ALIAS_RULES],
};

function normalizeDeptToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function getEffectiveOperationsDepartmentIds(
  departments: Department[],
  config?: OperationsReportingConfig
): string[] {
  const configured = config?.operationsDepartmentIds ?? DEFAULT_OPERATIONS_CONFIG.operationsDepartmentIds;
  const result: string[] = [];
  const seen = new Set<string>();

  for (const id of configured) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  // Also include any dynamically imported department whose exact name matches a canonical Operations name
  const canonicalSet = new Set(
    DEFAULT_OPERATIONS_DEPARTMENT_NAMES.map((n) => normalizeDeptToken(n))
  );
  for (const dept of departments) {
    if (canonicalSet.has(normalizeDeptToken(dept.name)) && !seen.has(dept.id)) {
      seen.add(dept.id);
      result.push(dept.id);
    }
  }

  return result;
}

export function isOperationsDepartment(
  departmentId: string,
  departments: Department[],
  config?: OperationsReportingConfig
): boolean {
  const opsIds = new Set(getEffectiveOperationsDepartmentIds(departments, config));
  return opsIds.has(departmentId);
}

/**
 * Orders departments with priority Operations order first:
 * 1. Engineering, 2. Procurement, 3. Site Service, 4. Analytics,
 * followed by any additional configured Operations departments, then remaining departments alphabetically.
 */
export function orderDepartmentsOperationsFirst(
  departments: Department[],
  config?: OperationsReportingConfig
): Department[] {
  const opsIds = getEffectiveOperationsDepartmentIds(departments, config);
  const rankMap = new Map<string, number>();

  // Assign canonical Operations names lowest ranks 0..3 first if IDs differ in imported datasets
  DEFAULT_OPERATIONS_DEPARTMENT_NAMES.forEach((canonName, idx) => {
    const match = departments.find(
      (d) => normalizeDeptToken(d.name) === normalizeDeptToken(canonName)
    );
    if (match) {
      rankMap.set(match.id, idx);
    }
  });

  opsIds.forEach((id, idx) => {
    if (!rankMap.has(id)) {
      rankMap.set(id, 10 + idx);
    }
  });

  return [...departments].sort((a, b) => {
    const ra = rankMap.get(a.id);
    const rb = rankMap.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function filterDepartmentsByScope(
  departments: Department[],
  scope: ReportingScope,
  config?: OperationsReportingConfig
): Department[] {
  const ordered = orderDepartmentsOperationsFirst(departments, config);
  if (scope === 'ALL') return ordered;
  const opsSet = new Set(getEffectiveOperationsDepartmentIds(departments, config));
  return ordered.filter((d) => opsSet.has(d.id));
}

export function filterPortfolioByReportingScope(params: {
  initiatives: Initiative[];
  benefits?: BenefitEntry[];
  costs?: AiCostTransaction[];
  departments: Department[];
  scope: ReportingScope;
  config?: OperationsReportingConfig;
}): {
  initiatives: Initiative[];
  benefits: BenefitEntry[];
  costs: AiCostTransaction[];
  scopedDepartments: Department[];
} {
  const {
    initiatives,
    benefits = [],
    costs = [],
    departments,
    scope,
    config,
  } = params;

  const orderedDepts = orderDepartmentsOperationsFirst(departments, config);
  if (scope === 'ALL') {
    return {
      initiatives,
      benefits,
      costs,
      scopedDepartments: orderedDepts,
    };
  }

  const opsSet = new Set(getEffectiveOperationsDepartmentIds(departments, config));
  return {
    initiatives: initiatives.filter((i) => opsSet.has(i.departmentId)),
    benefits: benefits.filter((b) => opsSet.has(b.departmentId)),
    costs: costs.filter((c) => opsSet.has(c.departmentId)),
    scopedDepartments: orderedDepts.filter((d) => opsSet.has(d.id)),
  };
}

export function formatReportingScopeLabel(
  scope: ReportingScope,
  departments: Department[],
  config?: OperationsReportingConfig
): string {
  if (scope === 'ALL') {
    return 'Scope: All Departments';
  }
  const opsDepts = filterDepartmentsByScope(departments, 'OPERATIONS', config);
  const names =
    opsDepts.length > 0
      ? opsDepts.map((d) => d.name)
      : [...DEFAULT_OPERATIONS_DEPARTMENT_NAMES];
  return `Scope: Operations (${names.join(', ')})`;
}

export interface DepartmentAliasResolutionResult {
  departmentId: string;
  departmentName: string;
  isNewDepartment: boolean;
  isAmbiguous: boolean;
  matchedBy: 'EXACT' | 'ALIAS_RULE' | 'PARTIAL' | 'AMBIGUOUS' | 'NEW_DEPARTMENT';
  candidateDepartmentNames?: string[];
}

/**
 * Resolves imported spreadsheet department names using:
 * 1. Exact ID / code / normalized name
 * 2. Configured alias rules (e.g. "Purchasing" -> Procurement, "Mechanical Engineering" -> Engineering)
 * 3. Single-hit unambiguous partial match
 * If multiple departments match partially or contain compound ambiguous names (e.g., "Ops & Support"),
 * flags `isAmbiguous: true` instead of silently misclassifying.
 */
export function resolveDepartmentWithAliases(
  rawDept: string,
  departments: Department[],
  aliasRules: DepartmentAliasRule[] = DEFAULT_OPERATIONS_CONFIG.aliasRules
): DepartmentAliasResolutionResult {
  const norm = normalizeDeptToken(rawDept);
  if (!norm) {
    return {
      departmentId: '',
      departmentName: '',
      isNewDepartment: false,
      isAmbiguous: false,
      matchedBy: 'NEW_DEPARTMENT',
    };
  }

  const exact = departments.find(
    (d) =>
      normalizeDeptToken(d.id) === norm ||
      normalizeDeptToken(d.code) === norm ||
      normalizeDeptToken(d.name) === norm
  );
  if (exact) {
    return {
      departmentId: exact.id,
      departmentName: exact.name,
      isNewDepartment: false,
      isAmbiguous: false,
      matchedBy: 'EXACT',
    };
  }

  // Configured alias rules
  const aliasHits = aliasRules.filter(
    (rule) => normalizeDeptToken(rule.alias) === norm
  );
  const uniqueTargetIds = Array.from(
    new Set(aliasHits.map((r) => r.targetDepartmentId))
  );
  if (uniqueTargetIds.length === 1) {
    const targetDept = departments.find((d) => d.id === uniqueTargetIds[0]);
    if (targetDept) {
      return {
        departmentId: targetDept.id,
        departmentName: targetDept.name,
        isNewDepartment: false,
        isAmbiguous: false,
        matchedBy: 'ALIAS_RULE',
      };
    }
  } else if (uniqueTargetIds.length > 1) {
    const candidateNames = uniqueTargetIds.map(
      (id) => departments.find((d) => d.id === id)?.name ?? id
    );
    const slug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ambiguous';
    return {
      departmentId: `dept-amb-${slug}`,
      departmentName: rawDept.trim(),
      isNewDepartment: true,
      isAmbiguous: true,
      matchedBy: 'AMBIGUOUS',
      candidateDepartmentNames: candidateNames,
    };
  }

  // Unambiguous single partial match (only match distinct tokens, flag multiple hits as ambiguous)
  const partialHits = departments.filter((d) => {
    const deptNorm = normalizeDeptToken(d.name);
    const primarySegment = normalizeDeptToken(d.name.split('&')[0]);
    return (
      deptNorm.includes(norm) ||
      norm === primarySegment ||
      (primarySegment.length >= 4 && norm.includes(primarySegment))
    );
  });

  if (partialHits.length === 1) {
    return {
      departmentId: partialHits[0].id,
      departmentName: partialHits[0].name,
      isNewDepartment: false,
      isAmbiguous: false,
      matchedBy: 'PARTIAL',
    };
  }

  if (partialHits.length > 1) {
    const slug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ambiguous';
    return {
      departmentId: `dept-amb-${slug}`,
      departmentName: rawDept.trim(),
      isNewDepartment: true,
      isAmbiguous: true,
      matchedBy: 'AMBIGUOUS',
      candidateDepartmentNames: partialHits.map((d) => d.name),
    };
  }

  // Generic compound or vague labels like "Ops & Support" or "Shared Operations" should not auto-guess Operations
  const looksAmbiguousOps =
    /\bops\b|\boperations?\b/.test(norm) &&
    !/operations & supply chain/.test(norm);

  const slug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
  return {
    departmentId: `dept-imp-${slug}`,
    departmentName: rawDept.trim(),
    isNewDepartment: true,
    isAmbiguous: looksAmbiguousOps,
    matchedBy: looksAmbiguousOps ? 'AMBIGUOUS' : 'NEW_DEPARTMENT',
  };
}
