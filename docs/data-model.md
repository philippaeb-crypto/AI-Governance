# AAS AI Governance — Persistent Data Model & Microsoft 365 SharePoint Architecture

> **Architecture Update:** Microsoft **SharePoint Lists** accessed via **Microsoft Graph** and **Microsoft Entra ID (MSAL)** is the primary target persistent data store (replacing Azure SQL). Demo Mode (`MockInitiativeRepository`) remains active by default until Entra ID and SharePoint Lists are configured and verified. See [`docs/sharepoint-entra-setup.md`](./sharepoint-entra-setup.md) for the live SharePoint Lists schema (`AI_Registry`, `AI_Lifecycle_History`, `AI_Usage_Tracking`, `AI_Financial_Ledger`) and Entra ID setup guide. The relational SQL tables below remain documented for reference if an analytical mirror is added later.

## 1. Azure SQL Relational Schema Mapping

### `dbo.departments`
| Column | SQL Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `UNIQUEIDENTIFIER` | `PRIMARY KEY` |
| `code` | `NVARCHAR(16)` | `NOT NULL UNIQUE` |
| `name` | `NVARCHAR(120)` | `NOT NULL` |
| `cost_center` | `NVARCHAR(32)` | `NOT NULL` |

### `dbo.users`
| Column | SQL Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `UNIQUEIDENTIFIER` | `PRIMARY KEY` (mapped to Entra `oid`) |
| `display_name` | `NVARCHAR(120)` | `NOT NULL` |
| `email` | `NVARCHAR(256)` | `NOT NULL UNIQUE` |
| `role` | `NVARCHAR(24)` | `CHECK (role IN ('EMPLOYEE','GOVERNANCE','ADMIN'))` |
| `department_id` | `UNIQUEIDENTIFIER` | `FOREIGN KEY REFERENCES dbo.departments(id)` |
| `job_title` | `NVARCHAR(120)` | `NULL` |

### `dbo.initiatives`
| Column | SQL Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `UNIQUEIDENTIFIER` | `PRIMARY KEY DEFAULT NEWSEQUENTIALID()` |
| `title` | `NVARCHAR(200)` | `NOT NULL` |
| `business_problem` | `NVARCHAR(MAX)` | `NOT NULL` |
| `description` | `NVARCHAR(MAX)` | `NOT NULL` |
| `business_capability` | `NVARCHAR(160)` | `NOT NULL` |
| `department_id` | `UNIQUEIDENTIFIER` | `NOT NULL FOREIGN KEY REFERENCES dbo.departments(id)` |
| `owner_id` | `UNIQUEIDENTIFIER` | `NOT NULL FOREIGN KEY REFERENCES dbo.users(id)` |
| `ai_platform` | `NVARCHAR(100)` | `NOT NULL` |
| `solution_type` | `NVARCHAR(100)` | `NOT NULL` |
| `ai_type` | `NVARCHAR(100)` | `NOT NULL` |
| `category` | `NVARCHAR(40)` | `CHECK (category IN ('AI_AGENT','AI_SOLUTION','AI_ENHANCED_APP','AI_AUTOMATION','AI_DEVELOPED_SOLUTION'))` |
| `lifecycle_status` | `NVARCHAR(24)` | `CHECK (lifecycle_status IN ('IDEA','ASSESSMENT','DEVELOPMENT','PILOT','PRODUCTION','MONITORING','RETIRE','SCALE_IMPROVE'))` |
| `value_category` | `NVARCHAR(24)` | `CHECK (value_category IN ('EFFICIENCY','QUALITY','STRATEGIC'))` |
| `users_count` | `INT` | `NOT NULL CHECK (users_count >= 0)` |
| `minutes_saved_per_occurrence` | `DECIMAL(10,2)` | `NOT NULL CHECK (minutes_saved_per_occurrence >= 0)` |
| `process_frequency_per_week` | `DECIMAL(10,2)` | `NOT NULL CHECK (process_frequency_per_week >= 0)` |
| `hourly_rate` | `DECIMAL(10,2)` | `NULL CHECK (hourly_rate >= 0)` |
| `idea_date` | `DATE` | `NOT NULL` |
| `go_live_date` | `DATE` | `NULL` |
| `created_at` | `DATETIME2(3)` | `NOT NULL DEFAULT SYSUTCDATETIME()` |
| `updated_at` | `DATETIME2(3)` | `NOT NULL DEFAULT SYSUTCDATETIME()` |
| `last_owner_review_at` | `DATETIME2(3)` | `NULL` |
| `next_review_due` | `DATETIME2(3)` | `NOT NULL` |
| `version` | `INT` | `NOT NULL DEFAULT 1` (optimistic concurrency token) |
| `source_system` | `NVARCHAR(32)` | `NULL` (`MICROSOFT_LISTS`, `AZURE_SQL`) |
| `site_id` | `NVARCHAR(128)` | `NULL` (SharePoint Site GUID) |
| `list_id` | `NVARCHAR(128)` | `NULL` (Microsoft List GUID) |
| `item_id` | `NVARCHAR(64)` | `NULL` (Microsoft List Item ID) |
| `source_etag` | `NVARCHAR(128)` | `NULL` (Graph API `@odata.etag` for conflict detection) |
| `last_synced_at` | `DATETIME2(3)` | `NULL` |

- Unique filtered index on `(site_id, list_id, item_id) WHERE item_id IS NOT NULL` to guarantee idempotent Microsoft Lists linkage.

### `dbo.lifecycle_events` (Append-Only Audit Log)
| Column | SQL Type | Constraints / Notes |
| --- | --- | --- |
| `id` | `UNIQUEIDENTIFIER` | `PRIMARY KEY` |
| `initiative_id` | `UNIQUEIDENTIFIER` | `NOT NULL FOREIGN KEY REFERENCES dbo.initiatives(id)` |
| `from_status` | `NVARCHAR(24)` | `NULL` (null on initial registration) |
| `to_status` | `NVARCHAR(24)` | `NOT NULL` |
| `actor_id` | `UNIQUEIDENTIFIER` | `NOT NULL FOREIGN KEY REFERENCES dbo.users(id)` |
| `actor_name` | `NVARCHAR(120)` | `NOT NULL` (denormalized snapshot for audit immutability) |
| `occurred_at` | `DATETIME2(3)` | `NOT NULL` |
| `note` | `NVARCHAR(1000)` | `NOT NULL` |
| `is_governed_exception` | `BIT` | `NOT NULL` |

### `dbo.sync_outbox` & `dbo.sync_conflicts`
- `dbo.sync_outbox`: `id`, `initiative_id`, `operation` (`UPSERT` | `DELETE`), `payload_json`, `expected_source_etag`, `attempt_count`, `next_retry_at`, `status` (`PENDING` | `IN_FLIGHT` | `COMPLETED` | `DEAD_LETTER`).
- `dbo.sync_conflicts`: `id`, `initiative_id`, `local_version`, `remote_etag`, `local_snapshot_json`, `remote_snapshot_json`, `status` (`OPEN` | `RESOLVED`), `resolved_by`, `resolved_at`.

---

## 2. Microsoft Lists / Graph Bidirectional Sync Strategy

Naive last-write-wins overwrites are explicitly prohibited. Phase 2 transitions in four controlled stages:

1. **Initial Inventory & Configurable Field Mapping**
   - Do **not** hardcode Microsoft Lists internal column names (`field_1`, `Title`, etc.). Maintain a declarative mapping table (`list_column_mappings`: `source_column_internal_name -> domain_field`) per SharePoint list.
   - Validate all mapped values against domain constraints (`value_category`, non-negative usage fields) before committing.
2. **Full Import with Source ID Retention**
   - Ingest existing Microsoft List items into `dbo.initiatives`, storing `source_system = 'MICROSOFT_LISTS'`, `site_id`, `list_id`, `item_id`, `source_etag`, and `last_synced_at`.
   - Record an initial `lifecycle_events` entry noting migration import.
3. **Conflict Detection & Transactional Outbox / Retries**
   - **Outbound (Azure SQL → Microsoft Lists):** Every `createInitiative`, `updateInitiative`, or `recordLifecycleEvent` transaction writes an outbox message to `dbo.sync_outbox`. An Azure Function worker sends `PATCH /sites/{siteId}/lists/{listId}/items/{itemId}/fields` with header `If-Match: <source_etag>`.
   - If Graph returns `412 Precondition Failed`, the worker does **not** force-overwrite; it marks the item in `dbo.sync_conflicts` for Governance review and halts further outbound writes on that item until resolved.
   - Transient `429` / `5xx` Graph errors use exponential backoff with `Retry-After` respect (`attempt_count`, `next_retry_at`).
   - **Inbound (Microsoft Lists → Azure SQL):** Poll Graph delta endpoint (`/items/delta`) using persisted `deltaToken`. Compare incoming `@odata.etag` against `source_etag` and `updated_at` vs `last_synced_at`. If both sides changed since `last_synced_at`, create a `dbo.sync_conflicts` record rather than overwriting.
4. **Staged Rollout to Bidirectional Sync**
   - **Stage A (Shadow Read-Only Import):** One-way scheduled sync from Lists → Azure SQL while teams continue viewing Lists.
   - **Stage B (App-Primary with Outbox Push):** Users move into AAS AI Governance web app; Azure SQL is system of record and pushes updates to Lists via outbox.
   - **Stage C (Controlled Bidirectional Sync):** Enable Graph delta pull for approved non-audit fields with ETag conflict detection and Governance conflict resolution UI.
