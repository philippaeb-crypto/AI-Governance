# AAS AI Governance — Server-Side API Contract (Phase 2 Target)

> **Phase 1 Status:** This document defines the planned REST API contract under `/api/v1/`. In the Phase 1 prototype, no Azure backend is connected; client components call the `InitiativeRepository` and `SimilarityProvider` TypeScript interfaces backed by local browser demo storage (`MockInitiativeRepository`).

## 1. Authentication & Authorization Expectations

- **Authentication (Phase 2):** All `/api/v1/*` routes require a valid Microsoft Entra ID JWT Bearer token (`Authorization: Bearer <token>`). The Phase 1 Demo Role/User Switcher must be removed and replaced with server-verified Entra claims (`oid`, `preferred_username`, app roles `EMPLOYEE`, `GOVERNANCE`, `ADMIN`).
- **Authorization Rules (Enforced Server-Side):**
  - `EMPLOYEE`: Read all initiatives; create initiatives (`ownerId` defaults to caller or validated directory user); update/review/transition **only** initiatives where `initiative.ownerId === caller.id`.
  - `GOVERNANCE`: Read and update all initiatives; perform governed lifecycle transitions across any initiative; read governance portfolio metrics and sync status.
  - `ADMIN`: Reserved for platform configuration, department directory sync, and integration settings.

## 2. Standard Error Envelope

All non-2xx responses return a typed JSON error payload matching `AppRepositoryError`:

```json
{
  "error": {
    "code": "CONCURRENCY_CONFLICT",
    "message": "Initiative was modified by another user (expected version 3, found 4).",
    "fieldErrors": {},
    "currentVersion": 4,
    "correlationId": "b8b4f0c2-7f9a-4e2f-b9b2-6f8b371e2f10"
  }
}
```

| HTTP Status | Error Code | Meaning |
| --- | --- | --- |
| `401` | `UNAUTHORIZED` | Missing, expired, or invalid Entra ID Bearer token |
| `403` | `FORBIDDEN` | Authenticated user lacks role or ownership permission |
| `404` | `NOT_FOUND` | Requested initiative, department, or user does not exist |
| `400` / `422` | `VALIDATION_ERROR` | Mandatory field, non-negative usage, or governed exception reason validation failed (`fieldErrors` populated) |
| `409` | `CONCURRENCY_CONFLICT` | Optimistic concurrency `If-Match` / `expectedVersion` mismatch |

## 3. Endpoint Specification (`/api/v1/`)

### Initiatives

- **`GET /api/v1/initiatives`**
  - Query params: `search`, `departmentId`, `lifecycleStatus`, `category`, `valueCategory`, `ownerId`, `overdueOnly`.
  - Response `200 OK`: `{ "items": Initiative[], "total": number }`
- **`GET /api/v1/initiatives/:id`**
  - Response `200 OK`: `{ "initiative": Initiative, "lifecycleHistory": LifecycleEvent[] }`
  - Response `404 Not Found`: `NOT_FOUND`
- **`POST /api/v1/initiatives`**
  - Body: `CreateInitiativeInput`
  - Behavior: Runs deterministic registry scope check & field validation; writes initial `LifecycleEvent` in the same SQL transaction as `initiatives` insert.
  - Response `201 Created`: `Initiative` (includes `version: 1` and `ETag` header)
- **`PATCH /api/v1/initiatives/:id`**
  - Headers / Body: Requires `If-Match` or `expectedVersion: number`.
  - Behavior: Verifies ownership (`EMPLOYEE`) or `GOVERNANCE` role, validates fields, checks `version = expectedVersion`, increments `version`.
  - Response `200 OK`: Updated `Initiative`
  - Response `409 Conflict`: `CONCURRENCY_CONFLICT`

### Lifecycle & Monthly Owner Reviews

- **`POST /api/v1/initiatives/:id/lifecycle-events`**
  - Body: `{ "expectedVersion": number, "toStatus": LifecycleStatus, "note": string }`
  - Behavior: Permits non-linear transitions; requires justification `note` (>= 8 chars) when `isGovernedExceptionTransition(from, to)` is true. Appends immutable row to `lifecycle_events` and updates `initiatives.lifecycle_status` + `version` atomically.
  - Response `201 Created`: `{ "initiative": Initiative, "event": LifecycleEvent }`
- **`POST /api/v1/initiatives/:id/reviews`**
  - Body: `{ "expectedVersion": number, "reviewNote"?: string }`
  - Behavior: Updates `lastOwnerReviewAt = SYSUTCDATETIME()` and advances `nextReviewDue = DATEADD(day, 30, SYSUTCDATETIME())`.
  - Response `200 OK`: Updated `Initiative`

### Portfolio Metrics & Discovery

- **`GET /api/v1/portfolio/metrics`**
  - Roles: `GOVERNANCE` (and summary counts for `EMPLOYEE` home)
  - Response `200 OK`: `PortfolioMetrics` (`activeSolutionsCount` strictly `PILOT + PRODUCTION`).
- **`POST /api/v1/similarity/preview`**
  - Body: `{ "queryText": string, "departmentId"?: string, "businessCapability"?: string, "excludeInitiativeId"?: string }`
  - Response `200 OK`: `{ "matches": SimilarityMatch[] }`
- **`GET /api/v1/departments`** & **`GET /api/v1/users`**
  - Response `200 OK`: Directory reference lists synced from Entra ID / ERP cost centers.
- **`GET /api/v1/sync/status`**
  - Roles: `GOVERNANCE`, `ADMIN`
  - Response `200 OK`: Outbox queue depth, last Graph delta sync timestamp, and conflict count.
