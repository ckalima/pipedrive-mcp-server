# Plan — Issue #49: v2 infra & test hardening (OpenAPI contract tests, client version safety, v1-only docs, sunset-date verification)

Spec (authoritative, vendored): `docs/api/openapi-v2.yaml` (v2) and `docs/api/openapi-v1.yaml` (v1). Every "correct shape/URL/version" claim below cites a spec line. Where the spec and prior memory/docs disagree, **spec wins** and the discrepancy is flagged.

This is **ONE issue / ONE PR**, split into FOUR write-disjoint lanes (A / B / C / D) that are safe to implement in parallel. Read your lane top-to-bottom; do NOT edit files outside your lane's manifest (§7).

**Scope discipline (P2 — infrastructure only).** This issue BUILDS the contract-test harness, the client version-safety mechanism, the v1-only docs, and fixes the latent test inputs. It does **NOT** fix #60 (`getField` `.key` → `field_code`) and does **NOT** migrate any v1-only endpoint to v2. #60 and the v1-only migrations are explicitly out of scope and are called out as the *motivating examples* the new harness must be able to catch (§2.4, §8).

---

## 0. GLOBAL RULES (every lane MUST obey)

### 0.1 Toolchain facts (verified against `package.json`)
`zod@^4.4.3`, `typescript@^6.0.3`, `vitest@^4.1.8`, `@modelcontextprotocol/sdk@^1.29.0`, `engines.node >= 20`. Tests run via `vitest run` (`vitest.config.ts`: `include: ['tests/**/*.test.ts']`, `environment: 'node'`, `globals: true`, `setupFiles: ['./tests/setup.ts']`). Match existing repo idioms: `z.email()` / `z.uuid()` (top-level), `z.record(z.string(), z.unknown())`, `Schema.extend({...})` (not `.merge`), `error.issues` (not `.errors`). Do NOT downgrade or "modernize" anything outside assigned edits.

### 0.2 THE FALSE-GREEN MECHANISM (root cause this issue exists)
Two independent, verified reasons the suite stays green while shipped code is wrong:

1. **Test files are NEVER type-checked.** `tsconfig.json:19` is `"exclude": ["node_modules", "dist", "**/*.test.ts"]`, and Vitest transpiles test files without type-checking. A test can pass a param the Zod type forbids and `tsc` never complains. (`npm run build` = `tsc` over `src/**/*` only.)
2. **Per-entity integration tests AND functional tests call handler functions DIRECTLY** (e.g. `await createPerson({...})`), bypassing the MCP dispatcher's `Schema.parse(...)`. So a handler test does NOT exercise the Zod schema, and a schema tightening does NOT fail those tests. The Zod boundary is exercised in exactly ONE place: `tests/integration/dispatcher.test.ts` (via `handleCallTool` → `getToolSchema(name).parse(args)`).

**Where the real guards live today (the only revert-proof gates):**
- UNIT schema tests calling `Schema.parse(...)` (assert accept/reject/transform).
- INTEGRATION tests asserting the handler's **outbound wire** (the `fetch` mock's captured URL/body).
- `tests/integration/dispatcher.test.ts` — the single Zod-at-the-boundary test.

**What #49 adds:** a CONTRACT-TEST layer that asserts real outbound request URLs/bodies against `openapi-v2.yaml` shapes, so a wrong shape **fails** (closes the gap that lets P0 data-shape bugs ship green). See §2.

### 0.3 How outbound `fetch` is captured (read-only; from `tests/helpers/mockFetch.ts`)
- `mockFetch(responses)` / `mockApiSuccess(data, additional_data?)` call `vi.stubGlobal('fetch', vi.fn(...))` and **return the mock fn**.
- The captured call is `mockFn.mock.calls[0]` = `[url, init]`. `url` is the first arg (a string/URL the client builds via `new URL(...).toString()`); `init.body` is the JSON string body (POST/PATCH/PUT) or `undefined` (GET).
- So: outbound **URL/query** is asserted with `expect(String(url)).toContain('...')`; outbound **body** with `JSON.parse(init.body)`.
- `tests/helpers/fixtures.ts` re-exports `fixtures` and `paginationFixtures` from `mockFetch.ts` and adds `createV2SearchResponse(items, nextCursor?)`. v1 pagination fixture is `paginationFixtures.v1WithMore` (`{ pagination: { more_items_in_collection: true, next_start: 50 } }`).

### 0.4 Client method reference (read-only — from `src/client.ts`)
`get<T>(endpoint, params?: URLSearchParams, version: ApiVersion = "v2")`, `post<T>(endpoint, body, version="v2")`, `patch`, `put`, `delete<T>(endpoint, version="v2")`. `ApiVersion = "v1" | "v2"`. v2 URL = `config.baseUrlV2 + endpoint` and sends `x-api-token` **header**; v1 URL = `config.baseUrlV1 + endpoint` and sends `api_token` **query param**. The `version` default `"v2"` is the footgun this issue addresses (§3).

---

## 1. CLAIM-VERIFICATION TABLE (claim → spec verdict → exact citation)

All line numbers are in the vendored specs unless noted.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| A | v2 has **no** `/notes` path | **CONFIRMED** | `grep '^  /notes' openapi-v2.yaml` → 0 matches. (v1 has it: `openapi-v1.yaml:17746`.) |
| B | v2 has **no** `/mailbox` / `/mailMessages` path | **CONFIRMED** | `grep '^  /mail' openapi-v2.yaml` → 0 matches. (v1: `/mailbox/mailThreads` `openapi-v1.yaml:15960`.) |
| C | v2 has **no** `/users` (list/get/me) path | **CONFIRMED** | `grep '^  /users' openapi-v2.yaml` → 0 matches. (v1: `/users` `openapi-v1.yaml:34864`, `/users/me` `openapi-v1.yaml:35436`.) Note: v2 *does* have `/users/{id}/followers` only — not list/get/me. |
| D | v2 has **no** general `/leads` CRUD; only search/convert | **CONFIRMED** | Only v2 leads path is `/leads/search` (`openapi-v2.yaml:16341`); plus `/leads/{id}/convert/*` (per #48 plan citations 2e/2f at `openapi-v2.yaml:16556`, `:16630`). No `^  /leads:` and no `/leads/{id}` GET/PATCH/DELETE in v2. (v1: `/leads` `openapi-v1.yaml:12457`.) |
| E | v2 `addPerson` body uses `emails`/`phones` **arrays of objects** (not scalar `email`/`phone`) | **CONFIRMED** | `addPerson` (operationId `openapi-v2.yaml:7945`) requestBody: `emails: { type: array, items: { type: object, properties: { value, primary, label } } }` and identical `phones:` block (`openapi-v2.yaml:7972-7997`). No `email`/`phone` scalar keys. |
| F | v2 `addOrganization` body uses `address` **object** (`OrganizationItemAddress`), not a string | **CONFIRMED** | `addOrganization` (operationId `openapi-v2.yaml:10745`) requestBody: `address: { type: object, title: OrganizationItemAddress, properties: { value, country, admin_area_level_1, ..., postal_code } }` (`openapi-v2.yaml:10779-10812`). |
| G | v2 field objects/paths key the field by **`field_code`**, not `key` (the #60 evidence) | **CONFIRMED** | v2 single-field path is `/activityFields/{field_code}` with `name: field_code` path param (`openapi-v2.yaml:1636`, `:1650`); field response items use `field_code:` (`openapi-v2.yaml:1456, 1530, 1566, 1577, 1594, 1599-1626`). `getField` matches on `f.key` (`src/tools/fields.ts:154`) → mismatch. **Out of scope to FIX (that's #60); the contract harness must be able to catch it (§2.4).** |
| H | CLAUDE.md sunset claim "2026-07-31" | **NEEDS CORRECTION (nuance)** | See §4 (sunset finding). The single hard date Pipedrive *officially* publishes is **2025-12-31**, and it applies only to a list of *selected* v1 endpoints that all HAVE v2 equivalents — it does **not** list notes/mail/users/leads. The "2026-07-31" full-v1 sunset is real and widely propagated by Pipedrive's own integration partners (Make, Zapier) but is **not** stated as a hard date on Pipedrive's current public developer docs (which say only "grace period of at least 1 year"). Action: keep 2026-07-31 as the working sunset but annotate it (§5, Lane C). |
| I | Shipped persons schema models `emails`/`phones` as arrays (so the #42 fix landed) | **CONFIRMED** | `src/schemas/persons.ts:17-30` `EmailInputSchema`/`PhoneInputSchema` = `z.array(z.object({ value, primary?, label? }))`; `CreatePersonSchema.emails/phones` (`:74-75`) and `UpdatePersonSchema` (`:97-98`). Handler forwards `body.emails`/`body.phones` (create `src/tools/persons.ts:104-105`, update `:141-142`). |
| J | Shipped orgs schema models `address` as an object (so the #44 fix landed) | **CONFIRMED** | `src/schemas/organizations.ts:19-42` `AddressSchema` (object), used by `CreateOrganizationSchema.address` (`:87`) and `UpdateOrganizationSchema.address` (`:106`). |

---

## 2. LANE A — OpenAPI contract-test harness (the headline deliverable)

**Goal:** a test layer that loads `docs/api/openapi-v2.yaml`, derives the *allowed* request shape for an operation, drives the **real handler** through the mocked `fetch`, captures the outbound URL/body, and asserts it conforms. Designed so it **would have caught every P0 data-shape bug** (#42–#46) and the #60 class.

### 2.1 Files (Lane A manifest)
- **NEW** `tests/contract/helpers/openapiContract.ts` — the spec loader + assertion helpers (Lane A OWNS this; no other lane touches it).
- **NEW** `tests/contract/requestBody.contract.test.ts` — POST/PATCH body conformance (persons, orgs, activities, deals, projects).
- **NEW** `tests/contract/requestParams.contract.test.ts` — GET list/search query-param conformance.
- **NEW** `tests/contract/responseShape.contract.test.ts` — response-field-name vs spec (the #60-catching test; asserts against the *shipped* getField behavior with an explicit `// KNOWN GAP #60` marker — see §2.4).
- **EDIT** `package.json` — add `js-yaml` (+ `@types/js-yaml`) to `devDependencies`. **CROSS-LANE FILE — see §7 contention note. Lane A owns the `package.json` edit; no other lane edits `package.json`.**

> **YAML parser:** `js-yaml@4.1.1` is already present in `node_modules` (transitive) and loads (`require('js-yaml').load` is a function), but it is **NOT** a declared dependency. The harness imports it, so it MUST be added to `devDependencies` to be revert-proof and CI-safe. Add `@types/js-yaml` too (tests aren't type-checked today per §0.2, but adding the types is correct hygiene and harmless). Do NOT add a heavyweight validator (ajv/openapi-types) — the harness only needs property-name/enum membership checks, which a tiny hand-rolled checker over the parsed YAML covers (keeps the dependency surface minimal; matches repo minimalism).

### 2.2 `openapiContract.ts` — design (what to build, not full code)
Export pure helpers (all read the parsed v2 doc once, memoized at module load):

```ts
// pseudo-signature contract — implementer fills in bodies
loadV2Spec(): Document                         // js-yaml.load(readFileSync('docs/api/openapi-v2.yaml','utf8'))
requestBodyProps(operationId): Set<string>     // allowed top-level body property names for a POST/PATCH op
requestBodyPropType(operationId, prop): 'array'|'object'|'string'|'integer'|'boolean'|...   // the spec 'type'
queryParamNames(operationId): Set<string>      // allowed query param names for a GET op
assertBodyConformsToSpec(operationId, body):   // throws if body has a key not in requestBodyProps,
                                               //   OR a key whose JS runtime type contradicts requestBodyPropType
                                               //   (array vs object vs scalar — the P0 class)
assertQueryConformsToSpec(operationId, url):   // throws if url has a query key not in queryParamNames
                                               //   (ignores auth: x-api-token is a header in v2; api_token only on v1)
```

Resolution rules the helper MUST implement (kept deliberately small):
- Find the operation by `operationId` (grep-locatable: e.g. `addPerson` at `openapi-v2.yaml:7945`). Walk `requestBody.content['application/json'].schema.properties` for body props; walk the path-item/operation `parameters` (where `in: query`) for query names.
- **Type check is the bug-catcher:** map the spec `type` to a runtime predicate — `array`→`Array.isArray`, `object`→`isPlainObject`, `string/integer/boolean`→`typeof`. A scalar `email` string where the spec says `emails: array` ⇒ FAIL; a string `address` where spec says `object` ⇒ FAIL. This is the precise assertion that catches #42/#44.
- **Unknown-key check** catches "param not in v2" bugs (#46 `status=all_not_deleted` style and #48 invalid query params): any outbound key absent from the spec's allowed set ⇒ FAIL.
- Keep `additionalProperties`/`custom_fields` permissive: `custom_fields` is a spec property of type object with `additionalProperties: true` (`openapi-v2.yaml:10813`+ for orgs; analogous for others) — the harness checks the **top-level** `custom_fields` key exists in spec and is an object, and does NOT recurse into its hash-keyed contents (those are caller-defined 40-char hashes).

### 2.3 The conformance tests (drive real handlers, assert against spec)
Pattern for every case (uses the existing helpers; NO new fixtures in `tests/helpers/*`):

```ts
it('addPerson outbound body conforms to v2 spec', async () => {
  const mockFn = mockApiSuccess(fixtures.person);
  const { createPerson } = await import('../../src/tools/persons.js');
  await createPerson({ name: 'X', emails: [{ value: 'a@b.com', primary: true }] });
  const [, init] = mockFn.mock.calls[0];
  assertBodyConformsToSpec('addPerson', JSON.parse(init.body));   // throws → test fails on a bad shape
});
```

Coverage to ship in §2.1's two request tests (operationIds are spec-locatable):
- **Bodies** (`requestBody.contract.test.ts`): `addPerson`/`updatePerson` (emails/phones arrays — catches #42), `addOrganization`/`updateOrganization` (address object — catches #44), `addDeal`/`updateDeal` (no `add_time` on create — #48 1i; `status` not `all_not_deleted` — #46), `addActivity`/`updateActivity` (location object, `done` boolean — #45), `addProject`/`updateProject` (`person_ids`/`org_ids`/`label_ids` arrays — #43).
- **Query** (`requestParams.contract.test.ts`): `getPersons`/`getOrganizations` (no `first_char`), `getActivities` (no `type`/`start_date`/`end_date`/`project_id`), `getProjects` (no `board_id`/`include_fields`), `getDeals` list, the four `*/search` ops, `getDealFields`/`getPersonFields`/`getOrganizationFields`.

> These operations were all **fixed by #42–#46 and #48 already**, so the contract tests are expected to **pass on current `main`**. Their value is forward-looking: §2.5 specifies the exact reverts under which each MUST fail. (This is the whole point — #49 proves the harness is a real gate, not theater.)

### 2.4 The #60-catching response test (build, but do NOT fix #60)
`getField` matches on `f.key` (`src/tools/fields.ts:154`) while v2 fields key on `field_code` (claim G). #49's job is to BUILD a test that demonstrates the harness can catch this class, while leaving the bug for #60. Two-part:

1. A spec assertion proving the property name: `expect(fieldResponseHasProperty('getActivityFields', 'field_code')).toBe(true)` and `expect(fieldResponseHasProperty('getActivityFields', 'key')).toBe(false)` (reads the v2 field response schema; `field_code` is at `openapi-v2.yaml:1456`+). This is revert-proof against the spec and documents the contract.
2. A handler-level test marked **`it.fails(...)`** (Vitest's expected-failure marker) OR `it.skip` with a `// #60` comment, that feeds `getField` a v2-shaped fixture keyed by `field_code` and asserts it is found. It is expected to FAIL today (handler reads `.key`). Using `it.fails` keeps the suite green now AND turns RED the moment #60 fixes the handler (forcing #60 to flip it to `it`). **Decide `it.fails` vs `it.skip` — recommend `it.fails`** so the harness actively tracks the gap. If `it.fails` proves flaky under Vitest 4, fall back to `it.skip` + a TODO referencing #60. (OPEN QUESTION Q1, §9.)

> Out of scope: changing `getField`. That is #60.

### 2.5 Lane A revert-proof (each contract test ↔ the src revert it must fail under)
Reviewer keeps the new contract tests, does `git checkout origin/main~N -- <src file>` to a PRE-fix state, re-runs; the named test MUST fail. (These are *historical* reverts proving the harness catches the real bugs.)
- `addPerson`/`updatePerson` body test → FAILS if persons handler reverts to scalar `body.email = params.email` (#42 pre-fix): `assertBodyConformsToSpec` throws on key `email` (not in spec) and/or wrong type.
- `addOrganization`/`updateOrganization` body test → FAILS if `address` reverts to a string (#44 pre-fix): type check `object` vs `string` throws.
- `addProject`/`updateProject` body test → FAILS if reverts to singular `person_id`/`org_id`/`labels` (#43 pre-fix): unknown-key throws.
- `addActivity` body test → FAILS if `location` string / `done` numeric (#45 pre-fix): type check throws.
- `addDeal` body/query test → FAILS if `add_time` re-added to create body (#48) or `status=all_not_deleted` re-sent (#46): unknown-key/invalid-value throws.
- `getPersons`/`getActivities`/`getProjects` query tests → FAIL if a removed invalid param (`first_char`/`type`/`board_id`/…) is re-sent (#48 revert): unknown-query-key throws.
- #60 `it.fails` test → turns RED (i.e. starts *passing*, which `it.fails` reports as failure) only when `getField` is fixed to read `field_code`; today it is correctly "failing as expected".

> **Why this is the gap-closer:** every one of these assertions runs against the **real outbound request**, so unlike the existing per-entity tests (which assert hand-written shapes and can encode the bug), a contract test cannot be satisfied by a wrong shape. It also covers the **#48 gap class** (a pagination output-shape regression that only a functional test caught): the harness's response-shape checks + the existing `tests/functional/pagination.test.ts` together gate output shapes. #49 does not need to re-fix #48; it documents that functional tests remain a required layer (§6).

---

## 3. LANE B — client `version` safety (`src/client.ts`)

### 3.1 The footgun (verified)
`get/post/patch/put/delete` all default `version: ApiVersion = "v2"` (`src/client.ts:57, 68, 79, 90, 100`). A new v1-only tool that forgets `"v1"` silently hits a non-existent v2 path and 404s. Today the v1 callers are explicit, but **37 v2 call sites across 7 files rely on the implicit default** (VERIFIED by grep — every `client.<m>(...)` in `src/tools/*` without a 3rd version arg): **activities (5), deals (6), fields (4), organizations (6), persons (6), pipelines (3), projects (7)**. The remaining tool files are already fully explicit and need NO change: `leads.ts` (10/10), `mail.ts` (5/5), `notes.ts` (5/5), `users.ts` (3/3), plus `projects/search` (1) — in particular the leads convert-status calls (`leads.ts:294,320,383`) **already pass `"v2"`**. So "no version arg" currently means BOTH "intended v2" and "forgot v1" — indistinguishable. That ambiguity is the bug.

### 3.2 Chosen approach: **make `version` explicit & required** (not a registry) — with justification
**Decision: require `version` as an explicit argument on every client method; remove the `= "v2"` default.** Rationale:
- A registry (endpoint-string → version map) re-introduces a different silent-failure mode: a new endpoint missing from the map falls back to *some* default, i.e. the same class of bug. It also couples the transport client to a knowledge of every path (a layering violation) and must be kept in sync with `src/tools/*` by hand.
- Requiring `version` makes the choice **local and visible at the call site** and **fails at compile time** for `src/` (which IS type-checked — `tsconfig` only excludes tests). A forgotten version becomes a `tsc` error (`Expected 3 arguments, but got 2`), not a runtime 404. This is the strongest, cheapest guard and matches the issue's "make version explicit/required" option.
- It does **not** break existing v2 callers behaviorally — they keep calling v2, just spelled `"v2"` explicitly. It is a pure mechanical edit + one signature change.

**Counter-consideration (note for reviewer):** requiring the arg touches all 37 implicit-v2 call sites across 7 files (a wide but mechanical diff). The registry would touch only `client.ts`. We accept the wider diff because compile-time enforcement is worth it and the call-site edits are trivial (`)` → `, "v2")`). If the reviewer prefers a smaller blast radius, the fallback is §3.4.

### 3.3 Exact edits (Lane B)
1. `src/client.ts`: change each public method signature to require version (drop the default):
   - `get<T>(endpoint: string, params: URLSearchParams | undefined, version: ApiVersion)` — note `params` becomes required-position (callers already pass it or `undefined`; verify each GET site passes a 2nd arg — they do, e.g. `get("/persons", queryParams)` and `get(`/persons/${id}`, undefined, "v2")`). Keep `params` optional in *type* (`params?: URLSearchParams`) but make `version` required by listing it after; since a required param cannot follow an optional one in TS, set the signature to `get<T>(endpoint: string, params: URLSearchParams | undefined, version: ApiVersion)` and update the ~12 GET call sites that omit the 2nd arg to pass `undefined` explicitly. (Most already do.)
   - `post/patch/put<T>(endpoint, body, version: ApiVersion)` — drop `= "v2"`.
   - `delete<T>(endpoint, version: ApiVersion)` — drop `= "v2"`.
   - Keep the private `request<T>(... version: ApiVersion = "v2")` default OR also make it required (internal-only; either is fine — recommend making it required for symmetry).
2. Update **all `src/tools/*` call sites** that omit `version` to pass `"v2"` explicitly (the 37 sites in §3.1: activities/deals/fields/organizations/persons/pipelines/projects). v1 callers already pass `"v1"` — leave them; leads/mail/notes/users are already fully explicit — leave them. `testConnection()` in `client.ts:192` already passes `"v1"` — leave it.

### 3.4 Fallback (only if reviewer rejects the wide diff)
Keep the default but add a **dev-time guard**: a private `assertKnownEndpointVersion(endpoint, version)` that warns (stderr, never stdout — STDIO safety) when a v1-shaped endpoint string (`/notes`, `/mailbox`, `/users`, `/leads` without `/search` or `/convert`, `/leads/{id}`) is requested with v2. This is weaker (runtime, string-heuristic) and is NOT recommended; documented only as an escape hatch. **Do not implement both.**

### 3.5 Lane B guards (revert-proof)
- **Type-level (the real guard):** after the change, `npm run build` (`tsc`) is itself the gate — a call site missing `version` fails to compile. Add a note to the PR: "build proves it." (No runtime test can replace this, because the bug is a *missing argument*, which only the type system sees.)
- **Runtime test** `tests/unit/client.test.ts` (or wherever client unit tests live — **VERIFY the path before editing**; if none exists, create `tests/unit/client.test.ts` and that file is Lane B's, no contention): assert that `get("/notes", undefined, "v1")` builds a URL containing `/v1/notes` and sends `api_token` as a query param (not header), and that `get("/persons", undefined, "v2")` builds `/api/v2/persons` with the `x-api-token` header and no `api_token` query. Revert-proof: not against the signature change (a type thing) but documents the v1/v2 routing so a future regression in `getBaseUrl`/header logic fails. (If a client unit test already asserts this, extend it; do not duplicate.)

> **Disjointness note:** Lane B edits `src/client.ts` and `src/tools/*` (adding `"v2"` to call sites). Lane A/C/D do **not** edit `src/tools/*` or `src/client.ts`. BUT Lane A's contract tests *import* `src/tools/*` handlers — that's runtime import, not a file edit, so no write-contention. Confirmed disjoint (§7).

---

## 4. SUNSET-DATE VERIFICATION (issue deliverable #4)

**Method:** consulted Pipedrive's own developer changelog + v2 overview, plus two major Pipedrive integration partners (Make, Zapier) for the propagated hard date. (`WebSearch` + `WebFetch`, June 2026.)

### Findings (with quoted text)

1. **Pipedrive official changelog — the only hard date Pipedrive itself publishes:** "Deprecation of selected API v1 endpoints" (Announced: April 14, 2025).
   - URL: https://developers.pipedrive.com/changelog/post/deprecation-of-selected-api-v1-endpoints
   - Quoted: the selected endpoints' "*availability and functionality will no longer be guaranteed*" after **"December 31, 2025"**, and "*This does not affect the entire API v1 platform.*"
   - Scope: lists Activities, Deals, Persons, Organizations, Products, Pipelines, Stages, Search endpoints — **all of which have v2 equivalents.** It **does NOT list notes, mail, users, or leads.** So the repo's v1-only surface (notes/mail/users/leads CRUD) is **not** covered by this Dec-31-2025 deprecation.

2. **Pipedrive v2 overview — no hard full-sunset date:**
   - URL: https://pipedrive.readme.io/docs/pipedrive-api-v2
   - Quoted: "*The corresponding v1 APIs will then be marked for deprecation and have a grace period of at least 1 year for migrations.*" No explicit calendar date for a full v1 shutdown.

3. **Integration partners propagate "July 31, 2026" as the full-v1 sunset:**
   - Make: https://help.make.com/pipedrive-api-v1-to-v2-transition-by-july-31-2026 — title states the date; body: "*existing scenarios using these modules will continue to run until July 31, 2026*" and "*after this date, Pipedrive API v1 endpoints will no longer be available, and the scenarios using them will stop working.*" (Make presents it as the migration deadline; does not itemize notes/mail/users/leads.)
   - Zapier: https://help.zapier.com/hc/en-us/articles/44170499172237 — "Action required: Update your Pipedrive workflows before the V1 API deprecation."

### Verdict on CLAUDE.md's `2026-07-31`
**Mostly correct, but imprecise — annotate, do not blindly trust.**
- The **2026-07-31** date is a real, widely-propagated full-v1-sunset date but is **carried by Pipedrive's partners, not stated as a hard date on Pipedrive's current public developer docs** (which say only "grace period of at least 1 year"). Keep it as the planning sunset.
- The **2025-12-31** date is the one Pipedrive *officially* commits to, but it applies ONLY to a selected set of endpoints that all have v2 equivalents — **none of the repo's v1-only tools (notes/mail/users/leads CRUD) are on that list.** So 2025-12-31 is NOT the date those specific tools break.
- **Net:** for THIS repo's v1-only surface, the relevant horizon is the **2026-07-31** full-v1 sunset (unverified by a hard Pipedrive-first-party date; verified by Pipedrive partners). CLAUDE.md should record both dates with their scopes and mark the 2026-07-31 as "per Pipedrive integration partners; Pipedrive's own docs state only 'grace period ≥ 1 year' — re-verify before relying on it."

---

## 5. LANE C — v1-only capability docs + sunset annotation

### 5.1 Files (Lane C manifest)
- **NEW** `docs/v1-only-capabilities.md` — the canonical list of v1-retained-no-v2-path tools, with spec citations, sunset horizon, and per-capability retain/deprecate stance.
- **EDIT** `CLAUDE.md` — correct/annotate the sunset line (`CLAUDE.md:37` "v1 hard sunset: July 31, 2026." and the API-Versions block `:31-37`).

### 5.2 `docs/v1-only-capabilities.md` content (what to write)
Document each v1-only-no-v2-equivalent capability with: tool names, current v1 endpoint + spec line, v2-absence proof, and a recommendation. Use claims A–D citations:

| Capability | Tools (count) | v1 endpoint (spec) | v2 equivalent? | Sunset action |
|---|---|---|---|---|
| **Notes** | 5 (`pipedrive_*_note*`) | `/notes` (`openapi-v1.yaml:17746`) | **None** (claim A) | Retain on v1; watch changelog. No migration target. |
| **Mail** | 5 (`pipedrive_*_mail*`/email) | `/mailbox/mailThreads` (`openapi-v1.yaml:15960`) | **None** (claim B) | Retain on v1; watch changelog. |
| **Users (list/get/`me`)** | 3 (`pipedrive_list_users`, `pipedrive_get_user`, `pipedrive_get_current_user`) | `/users` (`openapi-v1.yaml:34864`), `/users/me` (`openapi-v1.yaml:35436`) | **Only** `/users/{id}/followers` in v2 — not list/get/me (claim C) | Retain on v1; watch changelog. |
| **Leads CRUD** | 6 (`list/get/create/update/delete/list_archived`) | `/leads` (`openapi-v1.yaml:12457`) | **Only** `/leads/search` + `/leads/{id}/convert/*` in v2 (claim D) | Retain CRUD on v1; search/convert already v2 (`src/tools/leads.ts:249,294,320,383`). |

Add: the dual-date sunset framing from §4 (2025-12-31 selected-endpoints deprecation does NOT cover these; 2026-07-31 full sunset does, per partners), a "watch" link to https://developers.pipedrive.com/changelog, and an explicit note that **migrating these is out of scope for #49** (tracked for the future; #47 covers the v1→v2 migrations that DO have targets).

### 5.3 `CLAUDE.md` edit (precise)
Replace the single-line claim at `CLAUDE.md:37` ("v1 hard sunset: July 31, 2026. Migration to v2 is tracked in Phase 2 issues.") with a 2-3 line block that: (a) states 2026-07-31 as the working full-v1 sunset **with the "per Pipedrive partners; first-party docs say only 'grace period ≥1y'" caveat**; (b) notes the official 2025-12-31 selected-endpoints deprecation and that it excludes notes/mail/users/leads; (c) points to `docs/v1-only-capabilities.md`. Keep the surrounding API-Versions bullets (`:33-36`) intact. **Do not** touch any other CLAUDE.md section.

### 5.4 Lane C guards
Docs-only; no test gate. The factual claims are spec-cited (A–D) and §4 quotes. No revert-proof test applies (nothing executable changes).

---

## 6. LANE D — crud-flows latent v1-shape inputs

### 6.1 The latent inputs (re-found; lines are CURRENT in `tests/functional/crud-flows.test.ts`)
The issue cited "~82 (persons email)" and "~160 (orgs string address)". Verified current lines:
- **Persons — line 80-83:** `createPerson({ name: 'John Smith', email: [{ value: 'john.smith@example.com', primary: true }] })`. The **key is `email`** (singular) — a v1-ism. The shipped v2 schema has no `email` key (it's `emails`, `src/schemas/persons.ts:74`). Zod would **strip** `email` (unknown key) so the contact data never reaches the wire; this stays green only because the functional test calls `createPerson` directly (bypassing Zod) AND the handler only reads `params.emails` (so `email` is silently ignored even unvalidated). Note the *value* is already array-shaped — only the **key name** is wrong.
- **Organizations — line 158-161:** `createOrganization({ name: 'TechCorp Inc', address: '100 Tech Way' })`. `address` is a **string**; the shipped v2 schema requires an **object** (`src/schemas/organizations.ts:87` → `AddressSchema`). Zod would **reject** a string `address` (type error); green only because the functional test bypasses Zod and the handler forwards whatever it's given.

### 6.2 Exact replacements (Lane D)
- **Persons (crud-flows.test.ts:82):** change the key `email` → `emails` (value already correct):
  - FROM: `email: [{ value: 'john.smith@example.com', primary: true }],`
  - TO:   `emails: [{ value: 'john.smith@example.com', primary: true }],`
  - Spec basis: `addPerson` body `emails: array<{value,primary,label}>` (`openapi-v2.yaml:7972-7986`; claim E). Schema: `CreatePersonSchema.emails` (`src/schemas/persons.ts:74`).
- **Organizations (crud-flows.test.ts:160):** change string → object:
  - FROM: `address: '100 Tech Way',`
  - TO:   `address: { value: '100 Tech Way' },`
  - Spec basis: `addOrganization` body `address: object{ value, ... }` (`openapi-v2.yaml:10779-10812`; claim F). Schema: `CreateOrganizationSchema.address` → `AddressSchema` (`src/schemas/organizations.ts:87, 19-42`). `value` is the full-address subfield (`openapi-v2.yaml:10783`).

No other change in this file. The assertions in those two `it(...)` blocks only check `parsed.summary`/`parsed.data.id` from the mocked response (not the wire body), so they stay green; the edit removes the latent v1 shape so the inputs match what Zod-at-the-boundary would actually accept.

### 6.3 Lane D guards (revert-proof)
The existing crud-flows assertions do NOT inspect the outbound body, so by themselves they are not a gate. Make the cleanup revert-proof by adding **one wire assertion per fixed case** in the SAME file (Lane D owns it):
- After `createPerson(...)` (person cycle), capture the mock and assert the body carries `emails` (array) and NOT `email`:
  ```ts
  const personMock = mockApiSuccess({ ...fixtures.person, id: 200, name: 'John Smith' });
  // ...createPerson({ name:'John Smith', emails:[{ value:'john.smith@example.com', primary:true }] })
  const [, personInit] = personMock.mock.calls[0];
  const personBody = JSON.parse(personInit.body);
  expect(Array.isArray(personBody.emails)).toBe(true);
  expect(personBody).not.toHaveProperty('email');
  ```
  (Revert-proof: with the old `email:` key, the handler reads `params.emails` → undefined → `emails` absent from body → `Array.isArray(personBody.emails)` FAILS.)
- After `createOrganization(...)` (org cycle), assert `address` is an object with `value`:
  ```ts
  const orgMock = mockApiSuccess({ ...fixtures.organization, id: 400, name: 'TechCorp Inc' });
  // ...createOrganization({ name:'TechCorp Inc', address:{ value:'100 Tech Way' } })
  const [, orgInit] = orgMock.mock.calls[0];
  const orgBody = JSON.parse(orgInit.body);
  expect(typeof orgBody.address).toBe('object');
  expect(orgBody.address.value).toBe('100 Tech Way');
  ```
  (Revert-proof: with the old string `address`, `orgBody.address` is a string → `orgBody.address.value` is undefined → FAILS.)

> Reuse the mock fns already created at those lines (`mockApiSuccess(...)` returns the mock); the current code discards the return for person/org create — capture it. This is purely additive to the existing test bodies; do not restructure the CRUD cycles.

> **Overlap with Lane A?** Lane A's `requestBody.contract.test.ts` also asserts `addPerson`/`addOrganization` body conformance, but in a DIFFERENT file (`tests/contract/...`). Lane D's assertions live in `tests/functional/crud-flows.test.ts`. Different files ⇒ no write-contention. The duplication is intentional defense-in-depth and acceptable (one proves the latent input is gone in the functional flow; the other proves the harness gates the shape generally).

---

## 7. PER-LANE FILE MANIFEST (write-disjoint — NO file in two lanes)

| File | Lane A | Lane B | Lane C | Lane D |
|---|:--:|:--:|:--:|:--:|
| `tests/contract/helpers/openapiContract.ts` (NEW) | ✏️ | | | |
| `tests/contract/requestBody.contract.test.ts` (NEW) | ✏️ | | | |
| `tests/contract/requestParams.contract.test.ts` (NEW) | ✏️ | | | |
| `tests/contract/responseShape.contract.test.ts` (NEW) | ✏️ | | | |
| `package.json` (add js-yaml devDep) | ✏️ | | | |
| `src/client.ts` | | ✏️ | | |
| `src/tools/*.ts` (add explicit `"v2"` at 37 call sites: activities/deals/fields/organizations/persons/pipelines/projects) | | ✏️ | | |
| `tests/unit/client.test.ts` (edit or NEW) | | ✏️ | | |
| `docs/v1-only-capabilities.md` (NEW) | | | ✏️ | |
| `CLAUDE.md` | | | ✏️ | |
| `tests/functional/crud-flows.test.ts` | | | | ✏️ |
| `docs/api/openapi-v2.yaml` / `openapi-v1.yaml` | ❌ READ-ONLY | ❌ | ❌ READ-ONLY | ❌ |
| `tests/helpers/*` (mockFetch, fixtures) | ❌ | ❌ | ❌ | ❌ |
| `src/schemas/*`, `src/utils/*` | ❌ | ❌ | ❌ | ❌ |

### 7.1 Cross-lane contention analysis (explicit)
- **`src/tools/*.ts` — Lane B ONLY edits these** (appending `"v2"` to call sites). Lane A *imports* them in contract tests (dynamic `import(...)`) but does not edit them → runtime dependency, not write-contention. **Safe.** (If Lane B and Lane A run truly concurrently in one worktree, sequence them so Lane B's signature change lands before Lane A's `npm run build`; see §7.2.)
- **`tests/helpers/*` — owned by NO lane.** Every new test reuses existing helpers (`mockFetch`, `mockApiSuccess`, `fixtures`, `paginationFixtures`, `createV2SearchResponse`). No helper edit is required. If any lane *thinks* it needs a helper change, STOP and re-scope — that would create contention.
- **`package.json` — Lane A ONLY.** No other lane adds a dependency. (Lane B needs no new dep; `js-yaml` is Lane A's.)
- **`tsconfig.json` — touched by NO lane.** (The test-exclusion is documented as the root cause but is intentionally LEFT AS-IS: turning on test type-checking is a large, separate change with its own fallout and is NOT in #49's scope; see §8. Contract tests work *because* they assert at runtime, independent of test type-checking.)
- **No `src/tools/index.ts` edit** by any lane (no new tools are registered; the #60 test and contract tests don't add tools).

### 7.2 Parallelization guidance for the orchestrator
- **Fully parallel, separate worktrees:** A, B, C, D are file-disjoint → can be implemented in 4 parallel worktrees and merged in any order, EXCEPT the A↔B build coupling: Lane A's contract tests import handlers that Lane B re-saves with `"v2"` args. Since Lane B changes only the *arguments passed to the client* (not handler signatures or exports), Lane A's imports are unaffected behaviorally; the only risk is a merge-time `tsc` error if Lane B's `client.ts` signature lands without the call-site edits. Mitigate by keeping Lane B atomic (client.ts + all call sites in one lane/commit — they already are). **Recommended merge order: B → A → (C, D any order)** to guarantee a green `tsc`/`vitest` at each step. C and D are independent of everything.

---

## 8. EXPLICITLY OUT OF SCOPE (left to #60 / #50 / future)
- **#60 — `getField` `.key` → `field_code`:** NOT fixed here. §2.4 builds the harness assertion + an `it.fails` tracker; the actual handler fix is #60.
- **v1→v2 migration of notes/mail/users/leads CRUD:** NOT done (no v2 target exists; claims A–D). §5 only DOCUMENTS them.
- **Turning on test type-checking** (removing `**/*.test.ts` from `tsconfig` exclude or adding a `tsc --noEmit` over tests): NOT in scope — large fallout, separate hardening. The false-green mechanism is *mitigated* by the contract layer + the Lane B compile-time version guard, which is sufficient for #49.
- **#50 coverage expansion** (Products entity, sub-resources): untouched.
- **Migrating product/activity/project fields:** already on v2 in this repo (`src/tools/fields.ts:3,119-126` use v2 endpoints for all six entity types) — the README matrix saying "v1 (product/activity/project)" is STALE; no action. (#47 finished this.)

---

## 9. DECISIONS (RESOLVED 2026-06-08 by user) / RISKS
> All four open questions were reviewed and decided by the user before implement. These are now **binding spec** — the implementer follows them; no re-litigation.
- **Q1 (Lane A, #60 tracker style) → `it.fails`.** Use Vitest `it.fails(...)` for the #60-catching handler test, with a **narrow assertion + a `// KNOWN GAP #60` comment** so a *different* failure can't hide behind the expected-fail. It auto-flips RED when #60 lands, forcing follow-through. Only if `it.fails` proves genuinely flaky under Vitest 4, fall back to `it.skip` + `// TODO #60` — but try `it.fails` first.
- **Q2 (Lane B) → required `version` arg.** Make `version` a required argument on every client method; drop the `="v2"` defaults. Compile-time safety wins over the registry (relocates the silent fallback) and the §3.4 stderr-warn fallback (weaker). **The §3.4 fallback is NOT to be implemented.**
- **Q3 (js-yaml) → add it.** Add `js-yaml` + `@types/js-yaml` to `devDependencies` (pins the already-present transitive `4.1.1`; zero new install). Do NOT hand-roll a YAML reader and do NOT vendor the spec as JSON. Remember the `package.json` **denylist exception** on the PR.
- **Q4 (sunset date) → keep 2026-07-31, annotated.** Document 2026-07-31 as the working sunset horizon for the v1-only capabilities, explicitly flagged **partner-sourced (Make/Zapier) + "re-verify"**; also record the first-party **2025-12-31** date with its scope note (does NOT cover notes/mail/users/leads). Lead the doc with the *no-v2-path* risk, not the date.
- **Risk (low):** contract tests are expected GREEN on current `main` (the P0s are fixed). If any contract test fails on `main`, that surfaces a *real, currently-shipping* bug — treat as a finding, not a test defect, and report (do not weaken the assertion to make it pass).
- **Risk (low):** `client.test.ts` path is assumed — implementer must `ls tests/unit/` and either extend an existing client test or create `tests/unit/client.test.ts` (Lane B; no contention either way).

---

## 10. BUILD / VERIFY (all lanes)
```
npm run build      # tsc over src/** — Lane B: a missing `version` arg now FAILS here (that's the guard)
npm test           # vitest run — contract + functional + unit + dispatcher; green necessary, not sufficient (§0.2)
npm run lint       # eslint src/ — catch any unused after Lane B edits
```
Green `npm test` is necessary but not sufficient. The gates are: (1) Lane A contract tests FAIL under the historical P0 reverts in §2.5; (2) Lane B `tsc` FAILS if a call site omits `version`; (3) Lane D wire assertions FAIL under the old `email:`/string-`address` inputs (§6.3). The reviewer proves each by reverting the relevant src and re-running.
