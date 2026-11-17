import {
  AccountInfo,
  BrowserCacheLocation,
  Configuration,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser';
import { unauthorizedError } from '../domain/errors';
import { redactSensitiveTokens } from '../domain/sharepointMapping';
import { UserAccount, UserRole } from '../domain/types';
import { EntraAuthProvider } from '../repositories/interfaces';
import {
  isEntraConfigured,
  SharePointConnectionConfig,
} from './sharepointConfig';

export type MsalAuthStatus =
  | 'UNCONFIGURED'
  | 'SIGNED_OUT'
  | 'AUTHENTICATING'
  | 'SIGNED_IN'
  | 'ERROR';

export interface SafeMsalAccountSummary {
  displayName: string;
  username: string;
  tenantId: string;
  localAccountId: string;
  roles: string[];
}

export interface MsalAuthState {
  configured: boolean;
  initialized: boolean;
  status: MsalAuthStatus;
  account: SafeMsalAccountSummary | null;
  grantedScopes: string[];
  tokenExpiresOn: string | null;
  lastError: string | null;
}

function extractRolesFromAccount(account: AccountInfo | null): string[] {
  if (!account?.idTokenClaims) return [];
  const claims = account.idTokenClaims as Record<string, unknown>;
  if (Array.isArray(claims.roles)) {
    return claims.roles.filter((r): r is string => typeof r === 'string');
  }
  return [];
}

function mapRolesToDomainRole(roles: string[]): UserRole {
  const upper = roles.map((r) => r.toUpperCase());
  if (upper.some((r) => r.includes('ADMIN'))) return UserRole.ADMIN;
  if (upper.some((r) => r.includes('GOVERNANCE'))) return UserRole.GOVERNANCE;
  return UserRole.EMPLOYEE;
}

function toSafeAccountSummary(
  account: AccountInfo | null
): SafeMsalAccountSummary | null {
  if (!account) return null;
  return {
    displayName: account.name || account.username || 'Microsoft 365 User',
    username: account.username,
    tenantId: account.tenantId,
    localAccountId: account.localAccountId,
    roles: extractRolesFromAccount(account),
  };
}

export class MsalAuthService implements EntraAuthProvider {
  public readonly providerName = 'MICROSOFT_ENTRA_ID' as const;

  private config: SharePointConnectionConfig;
  private pca: PublicClientApplication | null = null;
  private configSignature = '';
  private state: MsalAuthState;
  private listeners = new Set<(state: MsalAuthState) => void>();

  constructor(initialConfig: SharePointConnectionConfig) {
    this.config = initialConfig;
    this.state = {
      configured: isEntraConfigured(initialConfig),
      initialized: false,
      status: isEntraConfigured(initialConfig) ? 'SIGNED_OUT' : 'UNCONFIGURED',
      account: null,
      grantedScopes: [],
      tokenExpiresOn: null,
      lastError: null,
    };
  }

  public getState(): MsalAuthState {
    return this.state;
  }

  public subscribe(listener: (state: MsalAuthState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<MsalAuthState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private buildSignature(cfg: SharePointConnectionConfig): string {
    return `${cfg.tenantId}|${cfg.clientId}|${cfg.redirectUri}`;
  }

  public async updateConfig(nextConfig: SharePointConnectionConfig): Promise<void> {
    const nextSig = this.buildSignature(nextConfig);
    const changed = nextSig !== this.configSignature;
    this.config = nextConfig;

    if (!isEntraConfigured(nextConfig)) {
      this.pca = null;
      this.configSignature = '';
      this.setState({
        configured: false,
        initialized: false,
        status: 'UNCONFIGURED',
        account: null,
        grantedScopes: [],
        tokenExpiresOn: null,
        lastError: null,
      });
      return;
    }

    if (changed || !this.pca) {
      this.pca = null;
      await this.initialize();
    } else {
      this.setState({ configured: true });
    }
  }

  public async initialize(): Promise<void> {
    if (!isEntraConfigured(this.config)) {
      this.setState({
        configured: false,
        initialized: false,
        status: 'UNCONFIGURED',
        account: null,
        lastError: null,
      });
      return;
    }

    if (typeof window === 'undefined') {
      this.setState({
        configured: true,
        initialized: false,
        status: 'SIGNED_OUT',
      });
      return;
    }

    try {
      const msalConfig: Configuration = {
        auth: {
          clientId: this.config.clientId,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
          redirectUri: this.config.redirectUri,
        },
        cache: {
          cacheLocation: BrowserCacheLocation.SessionStorage,
        },
      };

      const instance = new PublicClientApplication(msalConfig);
      await instance.initialize();
      this.pca = instance;
      this.configSignature = this.buildSignature(this.config);

      const accounts = instance.getAllAccounts();
      const active = instance.getActiveAccount() ?? accounts[0] ?? null;
      if (active) {
        instance.setActiveAccount(active);
      }

      this.setState({
        configured: true,
        initialized: true,
        status: active ? 'SIGNED_IN' : 'SIGNED_OUT',
        account: toSafeAccountSummary(active),
        lastError: null,
      });
    } catch (err) {
      const msg = redactSensitiveTokens(
        err instanceof Error
          ? err.message
          : 'Failed to initialize Microsoft Entra MSAL client.'
      );
      this.pca = null;
      this.setState({
        configured: true,
        initialized: false,
        status: 'ERROR',
        account: null,
        lastError: msg,
      });
    }
  }

  public async signIn(): Promise<MsalAuthState> {
    if (!isEntraConfigured(this.config)) {
      const msg =
        'Configure Microsoft Entra Tenant ID, Client ID, and Redirect URI before signing in.';
      this.setState({ status: 'UNCONFIGURED', lastError: msg });
      throw unauthorizedError(msg);
    }

    if (!this.pca) {
      await this.initialize();
    }
    if (!this.pca) {
      throw unauthorizedError(
        this.state.lastError || 'MSAL client could not be initialized.'
      );
    }

    this.setState({ status: 'AUTHENTICATING', lastError: null });

    try {
      // Popup flow is required because AI Studio preview runs inside an iframe
      const result = await this.pca.loginPopup({
        scopes: this.config.scopes,
        prompt: 'select_account',
      });
      if (result.account) {
        this.pca.setActiveAccount(result.account);
      }
      const active =
        result.account ?? this.pca.getActiveAccount() ?? this.pca.getAllAccounts()[0] ?? null;

      this.setState({
        configured: true,
        initialized: true,
        status: active ? 'SIGNED_IN' : 'SIGNED_OUT',
        account: toSafeAccountSummary(active),
        grantedScopes: result.scopes ?? [],
        tokenExpiresOn: result.expiresOn ? result.expiresOn.toISOString() : null,
        lastError: null,
      });
      return this.state;
    } catch (err) {
      const msg = redactSensitiveTokens(
        err instanceof Error ? err.message : 'Microsoft sign-in failed.'
      );
      this.setState({
        status: this.state.account ? 'SIGNED_IN' : 'ERROR',
        lastError: msg,
      });
      throw unauthorizedError(msg);
    }
  }

  public async signOut(): Promise<void> {
    if (!this.pca) {
      this.setState({
        status: isEntraConfigured(this.config) ? 'SIGNED_OUT' : 'UNCONFIGURED',
        account: null,
        grantedScopes: [],
        tokenExpiresOn: null,
        lastError: null,
      });
      return;
    }

    const active = this.pca.getActiveAccount() ?? this.pca.getAllAccounts()[0];
    try {
      if (active) {
        await this.pca.logoutPopup({
          account: active,
          mainWindowRedirectUri: this.config.redirectUri,
        });
      }
    } catch {
      // Clear local MSAL state cleanly even if popup was dismissed
    } finally {
      this.setState({
        status: isEntraConfigured(this.config) ? 'SIGNED_OUT' : 'UNCONFIGURED',
        account: null,
        grantedScopes: [],
        tokenExpiresOn: null,
        lastError: null,
      });
    }
  }

  /**
   * Implements EntraAuthProvider.getSignedInPrincipal without exposing tokens.
   */
  public async getSignedInPrincipal(): Promise<UserAccount | null> {
    if (!this.state.account) return null;
    const summary = this.state.account;
    return {
      id: summary.localAccountId,
      displayName: summary.displayName,
      email: summary.username,
      role: mapRolesToDomainRole(summary.roles),
      departmentId: 'sp-dept:entra-directory',
      jobTitle:
        summary.roles.length > 0
          ? `Entra App Role: ${summary.roles.join(', ')}`
          : 'Microsoft Entra ID Authenticated User',
    };
  }

  /**
   * Acquires an access token strictly in-memory for Graph API requests.
   * NEVER store or render the returned token in React state, localStorage, or logs.
   */
  public async acquireApiToken(scopes: string[]): Promise<string> {
    if (!isEntraConfigured(this.config)) {
      throw unauthorizedError(
        'Microsoft Entra ID is not configured. Provide Tenant ID and Client ID.'
      );
    }
    if (!this.pca) {
      await this.initialize();
    }
    if (!this.pca) {
      throw unauthorizedError(
        this.state.lastError || 'MSAL client could not be initialized.'
      );
    }

    const account =
      this.pca.getActiveAccount() ?? this.pca.getAllAccounts()[0] ?? null;
    if (!account) {
      throw unauthorizedError(
        'Not signed in to Microsoft Entra ID. Sign in before reading SharePoint.'
      );
    }

    const requestedScopes =
      scopes.length > 0 ? scopes : this.config.scopes;

    try {
      const silent = await this.pca.acquireTokenSilent({
        scopes: requestedScopes,
        account,
      });
      this.setState({
        status: 'SIGNED_IN',
        account: toSafeAccountSummary(silent.account ?? account),
        grantedScopes: silent.scopes ?? requestedScopes,
        tokenExpiresOn: silent.expiresOn
          ? silent.expiresOn.toISOString()
          : null,
        lastError: null,
      });
      return silent.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        const interactive = await this.pca.acquireTokenPopup({
          scopes: requestedScopes,
          account,
        });
        this.setState({
          status: 'SIGNED_IN',
          account: toSafeAccountSummary(interactive.account ?? account),
          grantedScopes: interactive.scopes ?? requestedScopes,
          tokenExpiresOn: interactive.expiresOn
            ? interactive.expiresOn.toISOString()
            : null,
          lastError: null,
        });
        return interactive.accessToken;
      }
      const msg = redactSensitiveTokens(
        err instanceof Error ? err.message : 'Unable to acquire Microsoft Graph token.'
      );
      this.setState({ lastError: msg });
      throw unauthorizedError(msg);
    }
  }
}
