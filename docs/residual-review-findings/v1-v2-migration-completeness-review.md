## v1 → v2 Migration Completeness Review

Review date: `2026-06-08`
Branch: `review/v1-v2-migration`
Sources: Pipedrive [v2 migration guide](https://pipedrive.readme.io/docs/pipedrive-api-v2-migration-guide), `openapi-v2.yaml` (authoritative v2 surface — 85 paths), full codebase + tests.
Tracker: [#51](https://github.com/ckalima/pipedrive-mcp-server/issues/51)

### Summary

The migration is substantially done and architecturally sound, but **not complete**. Several endpoints already marked "migrated" ship **silent data-shape bugs**, a few tools still call v1 despite v2 equivalents existing, and some current v1 coverage has **no v2 equivalent at all**.

Build is green (`tsc` exit 0) and **769 tests pass** — but that is **not** evidence of v2 correctness: the integration tests mock `fetch` and assert the current (sometimes wrong) request shapes, and some fixtures encode v1 field names. Three of the five P0 bugs sit in code with passing tests.

v1 hard sunset per `CLAUDE.md`: **2026-07-31** (~7 weeks out; the live guide page no longer states a date — verify against Pipedrive's current changelog, tracked in #49).

### Filed

P0 — confirmed against the OpenAPI request-body schemas (silent data loss / request rejection in shipped v2 code):

- **P1** `src/tools/persons.ts:105-106,142-143` -- create/update send scalar `email`/`phone`; v2 `POST/PATCH /persons` needs `emails`/`phones` arrays of `{value,primary,label}` (openapi 7973-8002) → contact info silently dropped -- [#42](https://github.com/ckalima/pipedrive-mcp-server/issues/42)
- **P1** `src/tools/projects.ts:109-111,148-150` (+`src/schemas/projects.ts:58-62`) -- send singular `person_id`/`org_id`/`labels`; v2 needs `person_ids`/`org_ids`/`label_ids` integer arrays (openapi 19640-19650) → associations/labels dropped -- [#43](https://github.com/ckalima/pipedrive-mcp-server/issues/43)
- **P1** `src/schemas/organizations.ts:59,79` (+`src/tools/organizations.ts:106,140`) -- `address` modeled/sent as string; v2 needs an `address` object (openapi 10780-10814) -- [#44](https://github.com/ckalima/pipedrive-mcp-server/issues/44)
- **P1** `src/schemas/activities.ts:107` + `src/tools/activities.ts:119,165` -- `location` string→object (openapi 466-499); `done` sent as `1`/`0`, v2 wants boolean (openapi 463-465) -- [#45](https://github.com/ckalima/pipedrive-mcp-server/issues/45)
- **P1** `src/schemas/common.ts:68` (+`src/tools/deals.ts:265,357`) -- `status=all_not_deleted` is not a valid v2 value (0 matches in spec; omit `status` instead) → likely 400 -- [#46](https://github.com/ckalima/pipedrive-mcp-server/issues/46)

P1/P2/P3 — migration debt, polish, hardening, coverage (umbrella issues with checklists):

- **P1** Complete migration before sunset: search→v2 `/…/search`, project tasks→v2 `/tasks`, product/activity/project fields→v2 (finishes #10), `archiveProject`→`POST /projects/{id}/archive` -- [#47](https://github.com/ckalima/pipedrive-mcp-server/issues/47)
- **P2** Param cleanup + leads gaps + mail pagination consistency -- [#48](https://github.com/ckalima/pipedrive-mcp-server/issues/48)
- **P2** Infra/test hardening: OpenAPI contract tests, client `version` safety, document v1-only-no-v2 capabilities + verify sunset date -- [#49](https://github.com/ckalima/pipedrive-mcp-server/issues/49)
- **P3** Coverage expansion: Products entity (missing entirely), deal/project sub-resources, followers, config writes -- [#50](https://github.com/ckalima/pipedrive-mcp-server/issues/50)

### Coverage & version matrix

| Entity | Tools | Current API | v2 exists? | Status |
|---|---|---|---|---|
| Deals | 6 | v2 CRUD + v1 search | Yes (rich) | PARTIAL |
| Persons | 6 | v2 CRUD + v1 search | Yes | PARTIAL + P0 (#42) |
| Organizations | 6 | v2 CRUD + v1 search | Yes | PARTIAL + P0 (#44) |
| Activities | 5 | v2 | Yes | "migrated" + P0 (#45) |
| Leads | 8 | v1 CRUD + v2 search/convert | Search+convert only | MIXED (correct) |
| Projects | 8 | v2 (mostly) + v1 tasks | Yes (rich) | MIXED + P0 (#43) |
| Notes | 5 | v1 | **No** | V1-ONLY (sunset risk) |
| Mail | 5 | v1 | **No** | V1-ONLY (sunset risk) |
| Fields | 4 | v2 (deal/person/org) + v1 (product/activity/project) | Yes (all 6) | PARTIAL |
| Pipelines | 1 | v2 | Yes | Migrated (read-only) |
| Stages | 2 | v2 | Yes | Migrated (read-only) |
| Users | 3 | v1 | **No** (only `/users/{id}/followers`) | V1-ONLY (sunset risk) |
| Products | 0 | — | Yes (full + variations) | **Not covered** |

### v1-only with no v2 equivalent (the real "v2 gap")

Correctly pinned to v1 today (every call verified to pass `"v1"`), but **no v2 path exists**, so they break at sunset unless Pipedrive ships v2 versions:

- **Notes** (5 tools) — no `/notes` in v2
- **Mail** (5 tools) — no `/mailbox`,`/mailMessages` in v2
- **Users** list/get/`me` (3 tools) — v2 has only `/users/{id}/followers`
- **Leads CRUD** (6 tools) — v2 has only `/leads/search` + `/leads/{id}/convert/*`

Action (in #49): document these as v1-retained-no-v2-path, watch Pipedrive's changelog, decide retain-vs-deprecate per capability.

### Cross-cutting observations

- **Client default `version="v2"` is a footgun** (`src/client.ts`): any future v1-only tool that forgets `"v1"` silently 404s against a non-existent v2 path. Add an endpoint→version registry or make `version` explicit/required (#49).
- **Tests encode the bugs** (false-green). Add contract tests that diff request bodies/URLs against `openapi-v2.yaml` (#49) — this would have caught every P0.
- **`custom_fields` pass-through is structurally OK** (v2 `custom_fields` is a flat hash-keyed object), but per-field value shapes (currency `{value,currency}`, address object, multi-option int array, date-range, time) are the caller's responsibility and undocumented.
- **v2 pagination cap** hardcoded to 100 (`pagination.ts`); some v2 endpoints allow up to 500 (e.g. leads search).
- **Clean:** `visible_to` as int+refine, `label_ids`, `owner_id`, PATCH verbs, cursor pagination, soft-delete handling in CRUD paths; activities `person_id` IS writable in v2 (verified — spec has zero `readOnly` markers; `participants` also supported).

### Recommended phased next steps

- **Phase 0 (now):** fix the 5 P0 data-shape bugs (#42-#46) and update their tests/fixtures to the v2 shapes. Small, disjoint-file, parallelizable.
- **Phase 1 (pre-sunset):** #47 — finish the remaining v1→v2 migrations and the archive endpoint; then prune invalid params (part of #48).
- **Phase 2:** #49 — contract tests + client version safety + v1-only documentation + sunset-date verification; #48 — leads gaps + mail pagination polish.
- **Phase 3:** #50 — coverage expansion by demand (Products first).
