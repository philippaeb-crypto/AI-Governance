# AAS AI Governance — Microsoft Entra ID & SharePoint Lists Setup Guide

> **Verification Notice:** Live Microsoft Entra ID authentication, SharePoint read access, column mappings, and authorization permissions must be tested and verified against your actual Microsoft 365 tenant before enabling any write operations. Do not assume client-side checks enforce security.

---

## 1. Architecture Overview

Microsoft **SharePoint Lists** serves as the primary persistent data store accessed via **Microsoft Graph v1.0** using **Microsoft Entra ID (MSAL SPA)** delegated authentication:

- **Demo Mode (`MockInitiativeRepository`)** remains available for single-browser testing without tenant credentials.
- **SharePoint Read-Only Mode (`SharePointInitiativeRepository`)** reads live SharePoint Lists with `@odata.nextLink` pagination and configurable internal column mappings.
- **Write Guardrail (Step 4):** `createInitiative`, `updateInitiative`, `recordLifecycleEvent`, and `markOwnerReviewed` are prepared at the interface/payload level but remain **disabled** until column mappings and server-side or SharePoint list-level permissions are verified.
- **AI Functionality:** Similarity preview continues to use `MockAiProvider` until an enterprise AI provider is introduced.

---

## 2. Microsoft Entra ID App Registration (SPA)

1. Sign in to the **Microsoft Entra admin center** (`https://entra.microsoft.com`) as an Application Administrator or Cloud Application Administrator.
2. Navigate to **Identity → Applications → App registrations → New registration**.
3. Configure:
   - **Name:** `AAS AI Governance Web App`
   - **Supported account types:** `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI:** Select **Single-page application (SPA)** (critical — do **not** use Web or Public client/native). Add all active environment origins:
     - Local development: `http://localhost:3000`
     - Development preview: `https://ais-dev-ur5pdsxh6m22nezktfpy3k-670349232699.europe-west2.run.app`
     - Shared preview / pre-prod: `https://ais-pre-ur5pdsxh6m22nezktfpy3k-670349232699.europe-west2.run.app`
     - Production custom domain (when deployed)
4. On the app's **Overview** page, record:
   - **Directory (tenant) ID** → `VITE_ENTRA_TENANT_ID`
   - **Application (client) ID** → `VITE_ENTRA_CLIENT_ID`
5. **No Client Secrets:** Never create or embed client secrets in the React SPA. MSAL uses Authorization Code Flow with PKCE and popup authentication (`loginPopup` / `acquireTokenPopup`) to support embedded iframe contexts cleanly.
6. *(Optional Role Claims)* Under **App roles**, define `Governance.Manage` and `Platform.Admin` roles and assign users/groups if you wish to inspect Entra `roles` claims.

---

## 3. Required Microsoft Graph Permissions & Admin Consent

In the App Registration, navigate to **API permissions → Add a permission → Microsoft Graph → Delegated permissions**:

### Phase 1B (Read-Only Verification)
| Permission | Type | Purpose | Admin Consent |
| --- | --- | --- | --- |
| `User.Read` | Delegated | Sign in and read basic profile (`name`, `username`, `oid`) | Usually no (user consent) unless restricted by tenant policy |
| `Sites.Read.All` | Delegated | Read SharePoint site metadata, list columns, and list items | Often required depending on tenant consent settings |

> **Least-Privilege Alternative (`Sites.Selected`):** For strict tenant governance, grant `Sites.Selected` instead of `Sites.Read.All` and explicitly assign `Read` permission to the target SharePoint site via Graph `/sites/{siteId}/permissions`.

### Granting Admin Consent
1. Click **Grant admin consent for \<Tenant\>** in **API permissions** if your tenant restricts user consent for `Sites.Read.All`.
2. Confirm the **Status** column shows a green checkmark (`Granted for <Tenant>`).

### Future Write Enablement (Not Active Yet)
Do **not** grant `Sites.ReadWrite.All` until:
1. All internal column names in `AI_Registry` and secondary lists pass the Connection Diagnostics check with zero errors.
2. Security enforcement is verified (see Section 6).

---

## 4. Locating SharePoint Site ID and List IDs

### Option A: Microsoft Graph Explorer (`https://developer.microsoft.com/graph/graph-explorer`)
1. Find your **Site ID**:
   ```http
   GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site-relative-path}
   ```
   Example response `id`: `contoso.sharepoint.com,11111111-2222-3333-4444-555555555555,66666666-7777-8888-9999-aaaaaaaaaaaa` → set as `VITE_SP_SITE_ID`.
2. List all lists on the site to copy each **List GUID**:
   ```http
   GET https://graph.microsoft.com/v1.0/sites/{siteId}/lists?$select=id,displayName,name
   ```

### Option B: SharePoint List Settings URL
Open a list in SharePoint → **Settings (gear) → List settings**. The URL ends with `?List=%7B<GUID>%7D`. Decode `%7B` / `%7D` to obtain the GUID.

---

## 5. Separate SharePoint Lists Architecture (Step 5)

To avoid overloading the main registry list and preserve auditability, store lifecycle history, usage tracking, and future financial data in **separate SharePoint lists** linked via a stable text column **`InitiativeId`** (UUID or stable business key, indexed).

### List 1: `AI_Registry` (`VITE_SP_REGISTRY_LIST_ID`)
Default internal column mappings (override any column in the **Connection Diagnostics** UI if your existing list uses legacy internal names like `field_1`):

| Domain Field | Default Internal Column Name | SharePoint Column Type | Required |
| --- | --- | --- | --- |
| `initiativeId` | `InitiativeId` | Single line of text (Indexed) | Recommended |
| `title` | `Title` | Single line of text | Yes |
| `businessProblem` | `BusinessProblem` | Multiple lines of text | Yes |
| `description` | `Description` | Multiple lines of text | Yes |
| `businessCapability` | `BusinessCapability` | Single line of text | Yes |
| `department` | `Department` | Choice or Single line of text | Yes |
| `owner` | `AccountableOwner` | Single line of text or Person | Yes |
| `ownerEmail` | `AccountableOwnerEmail` | Single line of text | Recommended |
| `aiPlatform` | `AIPlatform` | Choice or Single line of text | Recommended |
| `solutionType` | `SolutionType` | Choice or Single line of text | Recommended |
| `aiType` | `AIType` | Choice or Single line of text | Recommended |
| `category` | `RegistryCategory` | Choice (`AI_AGENT`, `AI_SOLUTION`, `AI_ENHANCED_APP`, `AI_AUTOMATION`, `AI_DEVELOPED_SOLUTION`) | Yes |
| `lifecycleStatus` | `LifecycleStatus` | Choice (`IDEA`, `ASSESSMENT`, `DEVELOPMENT`, `PILOT`, `PRODUCTION`, `MONITORING`, `RETIRE`, `SCALE_IMPROVE`) | Yes |
| `valueCategory` | `ValueCategory` | Choice (`EFFICIENCY`, `QUALITY`, `STRATEGIC`) | Yes |
| `usersCount` | `UsersCount` | Number (>= 0) | Yes |
| `minutesSavedPerOccurrence` | `MinutesSavedPerOccurrence` | Number (>= 0) | Yes |
| `processFrequencyPerWeek` | `ProcessFrequencyPerWeek` | Number (>= 0) | Yes |
| `hourlyRate` | `HourlyRate` | Number (optional) | No |
| `ideaDate` | `IdeaDate` | Date and Time (Date only) | Yes |
| `goLiveDate` | `GoLiveDate` | Date and Time (Date only) | No |
| `lastOwnerReviewAt` | `LastOwnerReviewAt` | Date and Time | No |
| `nextReviewDue` | `NextReviewDue` | Date and Time | No |
| `version` | `VersionNumber` | Number (Integer) | No |

### List 2: `AI_Lifecycle_History` (`VITE_SP_LIFECYCLE_LIST_ID`)
Linked to `AI_Registry` by **`InitiativeId`**:
- `InitiativeId` (Single line of text, Indexed)
- `FromStatus` (Choice / Text, nullable)
- `ToStatus` (Choice / Text)
- `ActorId` (Text)
- `ActorName` (Text)
- `OccurredAt` (Date and Time)
- `TransitionNote` (Multiple lines of text)
- `IsGovernedException` (Yes/No)

### List 3: `AI_Usage_Tracking` (`VITE_SP_USAGE_LIST_ID`)
Linked to `AI_Registry` by **`InitiativeId`**:
- `InitiativeId` (Single line of text, Indexed)
- `UsersCount` (Number)
- `MinutesSavedPerOccurrence` (Number)
- `ProcessFrequencyPerWeek` (Number)
- `RecordedAt` (Date and Time)
- `RecordedBy` (Text)

### List 4: `AI_Financial_Ledger` (`VITE_SP_FINANCIAL_LIST_ID` — Future Phase)
Linked to `AI_Registry` by **`InitiativeId`**:
- `InitiativeId` (Single line of text, Indexed)
- `FiscalYear` (Text)
- `BenefitType` (Choice)
- `EstimatedAnnualValue` (Number / Currency)
- `RealizedAnnualValue` (Number / Currency)
- `AnnualRunCost` (Number / Currency)
- `ImplementationCost` (Number / Currency)
- `Currency` (Text, e.g. `USD`, `EUR`)

---

## 6. Security & Authorization Requirements Before Enabling Writes

Client-side UI checks (`canEditInitiative`) only control UI affordances and **do not provide security**. Before enabling writes:

1. **Employee Read-All / Edit-Own Rule:**
   - Employees must be able to **read all** initiatives across departments, **create** new initiatives, and **edit only their own** initiatives.
   - AI Portfolio Manager users (`GOVERNANCE` role claim) must be able to edit lifecycle and portfolio records across departments.
2. **Recommended Enforcement Pattern (Server-Side API Layer):**
   - Route write mutations (`POST/PATCH`) through a protected backend API (Azure Functions / Node / .NET) that validates the Entra ID Bearer JWT, verifies `ownerId === caller.oid` (or `GOVERNANCE` AI Portfolio Manager role claim), checks optimistic concurrency (`If-Match` ETag), and executes the SharePoint update using least-privilege permissions or On-Behalf-Of (OBO).
3. **Alternative SharePoint-Native Enforcement:**
   - Use SharePoint item-level permissions (`Read all items`, `Create items and edit items that were created by the user`) combined with AI Portfolio Manager group Full Control/Edit permissions, while handling `Created By` vs transferred `AccountableOwner` carefully via Power Automate / server workflow.

---

## 7. Deployment Environment Variables (`VITE_*`)

Configure non-secret build/runtime variables in your hosting environment (or enter them in the **SharePoint & Entra** diagnostics screen for browser session testing):

```env
VITE_ENTRA_TENANT_ID="<your-tenant-guid>"
VITE_ENTRA_CLIENT_ID="<your-spa-client-guid>"
VITE_ENTRA_REDIRECT_URI="https://your-deployed-app-origin"
VITE_SP_SITE_ID="contoso.sharepoint.com,<site-guid>,<web-guid>"
VITE_SP_REGISTRY_LIST_ID="<registry-list-guid>"
VITE_SP_LIFECYCLE_LIST_ID="<lifecycle-list-guid>"
VITE_SP_USAGE_LIST_ID="<usage-list-guid>"
VITE_SP_FINANCIAL_LIST_ID="<financial-list-guid>"
```
