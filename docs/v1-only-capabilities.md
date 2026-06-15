# v1-Only Capabilities (No v2 Equivalent)

**Risk summary:** The four capabilities below have no v2 migration target. When Pipedrive's full v1 API is retired, these tools will stop working. There is no upgrade path — they require Pipedrive to publish v2 endpoints before any migration is possible. This is a blocking external dependency, not a code issue.

Migrating these capabilities is **out of scope for #49**. Future migration work is tracked by #47 (v1→v2 migration, endpoints that have targets) and any follow-on issues once Pipedrive publishes the missing v2 paths.

---

## Sunset Horizon

Two dates are in play. They have different scopes and different levels of authority.

### 2025-12-31 — Official Pipedrive first-party date (selected endpoints only)

- **Source:** Pipedrive developer changelog, "Deprecation of selected API v1 endpoints" (announced April 14, 2025)
  https://developers.pipedrive.com/changelog/post/deprecation-of-selected-api-v1-endpoints
- **Quoted scope:** "*This does not affect the entire API v1 platform.*" The listed endpoints are Activities, Deals, Persons, Organizations, Products, Pipelines, Stages, and Search — **all of which have v2 equivalents**.
- **Applicability to this repo:** This date does **not** apply to notes, mail, users, or leads CRUD. Those endpoints are not on the deprecated list and have no v2 equivalent.

### 2026-07-31 — Full v1 sunset (partner-sourced; re-verify before relying on it)

- **Source:** Pipedrive integration partners, not a first-party Pipedrive calendar commitment.
  - Make: https://help.make.com/pipedrive-api-v1-to-v2-transition-by-july-31-2026 — "*existing scenarios using these modules will continue to run until July 31, 2026 ... after this date, Pipedrive API v1 endpoints will no longer be available.*"
  - Zapier: https://help.zapier.com/hc/en-us/articles/44170499172237 — "Action required: Update your Pipedrive workflows before the V1 API deprecation."
- **Pipedrive's own v2 overview** states only: "*The corresponding v1 APIs will then be marked for deprecation and have a grace period of at least 1 year for migrations.*" No hard date is stated on first-party docs.
  https://pipedrive.readme.io/docs/pipedrive-api-v2
- **Applicability to this repo:** This is the working planning horizon for the v1-only capabilities below. Treat it as a real target but re-verify against the Pipedrive changelog before committing to a migration timeline.

**Monitor the changelog:** https://developers.pipedrive.com/changelog

---

## Capabilities With No v2 Equivalent

### Notes (5 tools)

| Item | Detail |
|---|---|
| Tools | `pipedrive_get_notes`, `pipedrive_create_note`, `pipedrive_update_note`, `pipedrive_delete_note`, `pipedrive_list_notes` (5 tools) |
| v1 endpoint | `/notes` (`openapi-v1.yaml:17746`) |
| v2 equivalent | **None.** `grep '^  /notes' openapi-v2.yaml` returns 0 matches. (Claim A) |
| Recommendation | Retain on v1. Watch the Pipedrive changelog for a v2 `/notes` path before planning migration. No migration target exists today. |

### Mail (5 tools)

| Item | Detail |
|---|---|
| Tools | `pipedrive_list_mail_threads`, `pipedrive_get_mail_thread`, `pipedrive_list_mail_messages`, `pipedrive_get_mail_message`, `pipedrive_update_mail_thread` (5 tools) |
| v1 endpoint | `/mailbox/mailThreads` (`openapi-v1.yaml:15960`) |
| v2 equivalent | **None.** `grep '^  /mail' openapi-v2.yaml` returns 0 matches. (Claim B) |
| Recommendation | Retain on v1. Watch the changelog. No migration target exists today. |

### Users - list / get / me (3 tools)

| Item | Detail |
|---|---|
| Tools | `pipedrive_list_users`, `pipedrive_get_user`, `pipedrive_get_current_user` (3 tools) |
| v1 endpoints | `/users` (`openapi-v1.yaml:34864`), `/users/me` (`openapi-v1.yaml:35436`) |
| v2 equivalent | **None for list/get/me.** v2 has only `/users/{id}/followers` — not list, get-by-id, or me. `grep '^  /users' openapi-v2.yaml` returns 0 matches for those paths. (Claim C) |
| Recommendation | Retain on v1. Watch the changelog. The followers sub-resource is a different concern and does not substitute for user lookup. |

### Leads CRUD (list / get / create / update / delete)

| Item | Detail |
|---|---|
| Tools | `pipedrive_list_leads`, `pipedrive_get_lead`, `pipedrive_create_lead`, `pipedrive_update_lead`, `pipedrive_delete_lead`, `pipedrive_list_archived_leads` (6 tools) |
| v1 endpoint | `/leads` (`openapi-v1.yaml:12457`) |
| v2 equivalent | **None for CRUD.** v2 has only `/leads/search` (`openapi-v2.yaml:16341`) and `/leads/{id}/convert/*` (`openapi-v2.yaml:16556`, `openapi-v2.yaml:16630`). There is no `^  /leads:` and no `/leads/{id}` GET/PATCH/DELETE in v2. (Claim D) |
| Note | Search and convert-status calls in `src/tools/leads.ts` already target v2 (`leads.ts:249`, `:294`, `:320`, `:383`). Only the CRUD paths (list/get/create/update/delete) remain on v1. |
| Recommendation | Retain CRUD on v1. The v2 search and convert paths are already used. Watch the changelog for v2 CRUD paths. |

---

## Version Routing & Sunset Detection

The v1 version decision and lazy sunset detection for all four capabilities above
now live in one place: the routing seam in **`src/version-routing.ts`**. The v1-only
tool handlers call a capability-scoped seam (`notesV1`, `mailV1`, `usersV1`,
`leadsV1`) instead of passing a `"v1"` literal to the client, so:

- **Migration touches one file, not every call site.** When Pipedrive publishes a v2
  equivalent for one of these capabilities, flip that capability's registry entry in
  `src/version-routing.ts` (and update the handler's endpoint/shape) rather than
  hunting `"v1"` literals across the tool files. The client stays a pure transport.
- **Retirement is detected lazily from the call result**, with no startup probe. A 410
  Gone (the strong signal), or a 404 on a capability's collection root where opted in
  (notes `/notes`; users `/users`, `/users/me`; leads `/leads`; mail is 410-only
  because its thread list legitimately 404s), marks the capability retired for the
  process lifetime. Subsequent calls short-circuit to a clear "retired by Pipedrive,
  no v2 equivalent" message without another upstream request. Ordinary item not-found
  404s, validation, auth, rate-limit, 5xx, and network errors never trip it.
- **Telemetry is operator-only.** Each capability logs a once-per-session warning to
  stderr noting it rides v1 with no v2 equivalent. There is no per-call repetition and
  no model-facing notice on tool responses.

### Deprecation marking: operator-telemetry-only (resolved)

README and tool-annotation "deprecated" marks for the v1-only tools are intentionally
**not** added. The deprecation signal stays operator-only (the stderr warning above),
which keeps the model's context clean and avoids churn in `gen:docs` output (no tool
definitions change, so CI's doc-drift check stays green). This is a cheap optional add
if model-facing signaling is later wanted; revisit then.

---

## Spec Citation Basis

All four "no v2 equivalent" claims are grounded in the vendored OpenAPI specs at `docs/api/`:

| Claim | Statement | Verification |
|---|---|---|
| A (Notes) | v2 has no `/notes` path | `grep '^  /notes' docs/api/openapi-v2.yaml` → 0 matches |
| B (Mail) | v2 has no `/mailbox` or `/mailMessages` path | `grep '^  /mail' docs/api/openapi-v2.yaml` → 0 matches |
| C (Users) | v2 has no `/users` list/get/me path | `grep '^  /users' docs/api/openapi-v2.yaml` → 0 matches for list/get/me |
| D (Leads CRUD) | v2 has no general `/leads` CRUD | Only `/leads/search` at `openapi-v2.yaml:16341`; no `/leads/{id}` GET/PATCH/DELETE |

Specs are vendored at `docs/api/openapi-v1.yaml` and `docs/api/openapi-v2.yaml`. Retrieved 2026-06-08.
