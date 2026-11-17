import {
  DEFAULT_FINANCIAL_LIST_MAPPINGS,
  DEFAULT_LIFECYCLE_LIST_MAPPINGS,
  DEFAULT_SHAREPOINT_COLUMN_MAPPINGS,
  DEFAULT_USAGE_LIST_MAPPINGS,
  FinancialListColumnMappings,
  LifecycleListColumnMappings,
  SharePointColumnMappings,
  UsageListColumnMappings,
} from '../domain/sharepointMapping';

export interface SharePointConnectionConfig {
  // Entra ID (MSAL Public Client SPA — non-secret identifiers only)
  tenantId: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];

  // Microsoft Graph SharePoint identifiers
  siteId: string;
  registryListId: string;
  lifecycleListId: string;
  usageListId: string;
  financialListId: string;

  // Configurable SharePoint internal column names
  columnMappings: SharePointColumnMappings;
  lifecycleColumnMappings: LifecycleListColumnMappings;
  usageColumnMappings: UsageListColumnMappings;
  financialColumnMappings: FinancialListColumnMappings;

  // Step 4 safety lock: writes stay disabled until mapping & server/SharePoint permissions are verified
  writesEnabled: false;
}

export const SP_CONFIG_STORAGE_KEY = 'aas_sp_connection_config_v1';

export const DEFAULT_GRAPH_SCOPES = ['User.Read', 'Sites.Read.All'];

function readViteEnv(name: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> })
      ?.env;
    return env?.[name]?.trim() ?? '';
  } catch {
    return '';
  }
}

export function getDefaultRedirectUri(): string {
  const fromEnv = readViteEnv('VITE_ENTRA_REDIRECT_URI');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export function createDefaultSharePointConfig(): SharePointConnectionConfig {
  return {
    tenantId: readViteEnv('VITE_ENTRA_TENANT_ID'),
    clientId: readViteEnv('VITE_ENTRA_CLIENT_ID'),
    redirectUri: getDefaultRedirectUri(),
    scopes: [...DEFAULT_GRAPH_SCOPES],
    siteId: readViteEnv('VITE_SP_SITE_ID'),
    registryListId: readViteEnv('VITE_SP_REGISTRY_LIST_ID'),
    lifecycleListId: readViteEnv('VITE_SP_LIFECYCLE_LIST_ID'),
    usageListId: readViteEnv('VITE_SP_USAGE_LIST_ID'),
    financialListId: readViteEnv('VITE_SP_FINANCIAL_LIST_ID'),
    columnMappings: { ...DEFAULT_SHAREPOINT_COLUMN_MAPPINGS },
    lifecycleColumnMappings: { ...DEFAULT_LIFECYCLE_LIST_MAPPINGS },
    usageColumnMappings: { ...DEFAULT_USAGE_LIST_MAPPINGS },
    financialColumnMappings: { ...DEFAULT_FINANCIAL_LIST_MAPPINGS },
    writesEnabled: false,
  };
}

export function loadSharePointConfig(): SharePointConnectionConfig {
  const defaults = createDefaultSharePointConfig();
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(SP_CONFIG_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SharePointConnectionConfig>;
    return {
      ...defaults,
      tenantId:
        typeof parsed.tenantId === 'string'
          ? parsed.tenantId.trim()
          : defaults.tenantId,
      clientId:
        typeof parsed.clientId === 'string'
          ? parsed.clientId.trim()
          : defaults.clientId,
      redirectUri:
        typeof parsed.redirectUri === 'string' && parsed.redirectUri.trim()
          ? parsed.redirectUri.trim()
          : defaults.redirectUri,
      scopes:
        Array.isArray(parsed.scopes) && parsed.scopes.length > 0
          ? parsed.scopes.filter((s) => typeof s === 'string' && s.trim())
          : defaults.scopes,
      siteId:
        typeof parsed.siteId === 'string'
          ? parsed.siteId.trim()
          : defaults.siteId,
      registryListId:
        typeof parsed.registryListId === 'string'
          ? parsed.registryListId.trim()
          : defaults.registryListId,
      lifecycleListId:
        typeof parsed.lifecycleListId === 'string'
          ? parsed.lifecycleListId.trim()
          : defaults.lifecycleListId,
      usageListId:
        typeof parsed.usageListId === 'string'
          ? parsed.usageListId.trim()
          : defaults.usageListId,
      financialListId:
        typeof parsed.financialListId === 'string'
          ? parsed.financialListId.trim()
          : defaults.financialListId,
      columnMappings: {
        ...defaults.columnMappings,
        ...(parsed.columnMappings ?? {}),
      },
      lifecycleColumnMappings: {
        ...defaults.lifecycleColumnMappings,
        ...(parsed.lifecycleColumnMappings ?? {}),
      },
      usageColumnMappings: {
        ...defaults.usageColumnMappings,
        ...(parsed.usageColumnMappings ?? {}),
      },
      financialColumnMappings: {
        ...defaults.financialColumnMappings,
        ...(parsed.financialColumnMappings ?? {}),
      },
      writesEnabled: false,
    };
  } catch {
    return defaults;
  }
}

export function saveSharePointConfig(
  config: SharePointConnectionConfig
): SharePointConnectionConfig {
  const sanitized: SharePointConnectionConfig = {
    ...config,
    tenantId: config.tenantId.trim(),
    clientId: config.clientId.trim(),
    redirectUri: config.redirectUri.trim() || getDefaultRedirectUri(),
    scopes:
      config.scopes.length > 0
        ? config.scopes.map((s) => s.trim()).filter(Boolean)
        : [...DEFAULT_GRAPH_SCOPES],
    siteId: config.siteId.trim(),
    registryListId: config.registryListId.trim(),
    lifecycleListId: config.lifecycleListId.trim(),
    usageListId: config.usageListId.trim(),
    financialListId: config.financialListId.trim(),
    writesEnabled: false,
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(
      SP_CONFIG_STORAGE_KEY,
      JSON.stringify(sanitized)
    );
  }
  return sanitized;
}

export function resetSharePointConfig(): SharePointConnectionConfig {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(SP_CONFIG_STORAGE_KEY);
  }
  return createDefaultSharePointConfig();
}

export function isEntraConfigured(config: SharePointConnectionConfig): boolean {
  return Boolean(config.tenantId && config.clientId && config.redirectUri);
}

export function isSharePointRegistryConfigured(
  config: SharePointConnectionConfig
): boolean {
  return Boolean(config.siteId && config.registryListId);
}
