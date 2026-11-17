import {
  DiscoveredSharePointColumn,
  RawSharePointListItem,
  redactSensitiveTokens,
} from '../domain/sharepointMapping';
import { AppRepositoryError, unauthorizedError } from '../domain/errors';

export interface SharePointSiteMetadata {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
}

export interface SharePointListMetadata {
  id: string;
  name: string;
  displayName: string;
  webUrl?: string;
  columns: DiscoveredSharePointColumn[];
}

export interface PaginatedListItemsResult {
  items: RawSharePointListItem[];
  pagesFetched: number;
  truncatedByMaxPages: boolean;
}

interface GraphColumnRaw {
  id?: string;
  name?: string;
  displayName?: string;
  required?: boolean;
  readOnly?: boolean;
  indexed?: boolean;
  text?: unknown;
  number?: unknown;
  choice?: unknown;
  dateTime?: unknown;
  boolean?: unknown;
  lookup?: unknown;
  personOrGroup?: unknown;
  calculated?: unknown;
  hyperlinkOrPicture?: unknown;
}

function inferColumnType(col: GraphColumnRaw): string {
  if (col.text) return 'text';
  if (col.number) return 'number';
  if (col.choice) return 'choice';
  if (col.dateTime) return 'dateTime';
  if (col.boolean) return 'boolean';
  if (col.lookup) return 'lookup';
  if (col.personOrGroup) return 'personOrGroup';
  if (col.calculated) return 'calculated';
  if (col.hyperlinkOrPicture) return 'hyperlinkOrPicture';
  return 'unknown';
}

export class GraphSharePointClient {
  private readonly getAccessToken: (scopes: string[]) => Promise<string>;
  private readonly scopes: string[];
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0';

  constructor(options: {
    getAccessToken: (scopes: string[]) => Promise<string>;
    scopes?: string[];
    fetchImpl?: typeof fetch;
  }) {
    this.getAccessToken = options.getAccessToken;
    this.scopes = options.scopes ?? ['User.Read', 'Sites.Read.All'];
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async requestJson<T>(url: string): Promise<T> {
    let token = '';
    try {
      token = await this.getAccessToken(this.scopes);
    } catch (err) {
      if (err instanceof AppRepositoryError) throw err;
      throw unauthorizedError(
        redactSensitiveTokens(
          err instanceof Error ? err.message : 'Unable to obtain Graph token.'
        )
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      throw new AppRepositoryError(
        'INTERNAL_ERROR',
        redactSensitiveTokens(
          err instanceof Error
            ? `Network error contacting Microsoft Graph: ${err.message}`
            : 'Network error contacting Microsoft Graph.'
        )
      );
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as {
          error?: { code?: string; message?: string };
        };
        if (body?.error?.message) {
          detail = `${body.error.code ? `${body.error.code}: ` : ''}${body.error.message}`;
        }
      } catch {
        // Ignore body parse failure
      }
      const sanitized = redactSensitiveTokens(detail);
      if (response.status === 401) {
        throw unauthorizedError(`Microsoft Graph authentication failed (${sanitized}).`);
      }
      if (response.status === 403) {
        throw new AppRepositoryError(
          'FORBIDDEN',
          `Microsoft Graph permission denied (${sanitized}).`
        );
      }
      if (response.status === 404) {
        throw new AppRepositoryError(
          'NOT_FOUND',
          `SharePoint site or list was not found (${sanitized}).`
        );
      }
      throw new AppRepositoryError(
        'INTERNAL_ERROR',
        `Microsoft Graph request failed (${sanitized}).`
      );
    }

    return (await response.json()) as T;
  }

  public async fetchSiteMetadata(siteId: string): Promise<SharePointSiteMetadata> {
    const encodedSite = encodeURIComponent(siteId.trim());
    const url = `${this.baseUrl}/sites/${encodedSite}?$select=id,name,displayName,webUrl`;
    const data = await this.requestJson<{
      id: string;
      name?: string;
      displayName?: string;
      webUrl?: string;
    }>(url);

    return {
      id: data.id,
      name: data.name ?? '',
      displayName: data.displayName || data.name || data.id,
      webUrl: data.webUrl ?? '',
    };
  }

  public async fetchListWithColumns(
    siteId: string,
    listId: string
  ): Promise<SharePointListMetadata> {
    const encodedSite = encodeURIComponent(siteId.trim());
    const encodedList = encodeURIComponent(listId.trim());
    const url = `${this.baseUrl}/sites/${encodedSite}/lists/${encodedList}?$expand=columns`;
    const data = await this.requestJson<{
      id: string;
      name?: string;
      displayName?: string;
      webUrl?: string;
      columns?: GraphColumnRaw[];
    }>(url);

    const columns: DiscoveredSharePointColumn[] = (data.columns ?? []).map(
      (col) => ({
        id: col.id ?? col.name ?? '',
        name: col.name ?? '',
        displayName: col.displayName ?? col.name ?? '',
        columnType: inferColumnType(col),
        required: Boolean(col.required),
        readOnly: Boolean(col.readOnly),
        indexed: Boolean(col.indexed),
      })
    );

    return {
      id: data.id,
      name: data.name ?? '',
      displayName: data.displayName || data.name || data.id,
      webUrl: data.webUrl,
      columns,
    };
  }

  public async fetchAllListItems(
    siteId: string,
    listId: string,
    options?: { pageSize?: number; maxPages?: number }
  ): Promise<PaginatedListItemsResult> {
    const pageSize = options?.pageSize ?? 200;
    const maxPages = options?.maxPages ?? 50;
    const encodedSite = encodeURIComponent(siteId.trim());
    const encodedList = encodeURIComponent(listId.trim());

    let nextUrl: string | undefined =
      `${this.baseUrl}/sites/${encodedSite}/lists/${encodedList}/items?$expand=fields&$top=${pageSize}`;
    const items: RawSharePointListItem[] = [];
    let pagesFetched = 0;
    let truncatedByMaxPages = false;

    while (nextUrl) {
      if (pagesFetched >= maxPages) {
        truncatedByMaxPages = true;
        break;
      }
      const page: {
        value?: RawSharePointListItem[];
        '@odata.nextLink'?: string;
      } = await this.requestJson(nextUrl);

      pagesFetched += 1;
      if (Array.isArray(page.value)) {
        items.push(...page.value);
      }
      nextUrl = page['@odata.nextLink'];
    }

    return {
      items,
      pagesFetched,
      truncatedByMaxPages,
    };
  }
}
