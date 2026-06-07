---
title: "feat: add Leads tools (list, get, create, update, delete, search)"
status: active
date: 2026-06-07
type: feat
issue: 12
depth: standard
---

# feat: add Leads tools

## Summary

Implement 7 MCP tools for managing Pipedrive Leads. All CRUD tools call the v1 REST API (`/leads`, `/leads/{id}`). The search tool calls v2 (`/leads/search`). A new `src/schemas/leads.ts` handles Zod validation; `src/tools/leads.ts` holds handlers and the exported `leadsTools` array; `src/tools/index.ts` receives a single spread addition.

## Problem Frame

No lead management is currently available in this MCP server. Leads are a first-class Pipedrive entity - pre-deal records that link to a person or organization and carry a monetary `value` object (`{amount, currency}`) rather than a flat number. Without leads support, users must use the Pipedrive UI for an entire stage of the sales funnel.

Lead-to-deal conversion is out of scope (tracked in issue #13).

## Requirements

- **R1** - Implement `pipedrive_list_leads`: `GET /v1/leads` with offset pagination, optional `archived_flag=false` filter.
- **R2** - Implement `pipedrive_list_archived_leads`: `GET /v1/leads?archived_flag=true` with offset pagination. Shares the same endpoint as list but forces `archived_flag=true`.
- **R3** - Implement `pipedrive_get_lead`: `GET /v1/leads/{id}`. Lead IDs are UUIDs (strings), not integers.
- **R4** - Implement `pipedrive_create_lead`: `POST /v1/leads` with required `title`, required link to either `person_id` or `organization_id` (at least one), optional `value` object, `owner_id`, `label_ids`, `expected_close_date`, `visible_to`.
- **R5** - Implement `pipedrive_update_lead`: `PATCH /v1/leads/{id}` with all fields optional.
- **R6** - Implement `pipedrive_delete_lead`: `DELETE /v1/leads/{id}`, gated by `PIPEDRIVE_ENABLE_DESTRUCTIVE=true` via `destructiveOperationGuard`.
- **R7** - Implement `pipedrive_search_leads`: `GET /api/v2/leads/search` (v2 endpoint per issue spec). Requires `term`, supports `include_fields`, `exact_match`, `limit`.
- **R8** - Register all 7 tools in `src/tools/index.ts` `allTools` array under a "Leads" tier comment.
- **R9** - Unit tests for all schemas in `tests/unit/schemas/leads.test.ts`.
- **R10** - Integration tests for all handlers in `tests/integration/tools/leads.test.ts`.

## Key Technical Decisions

1. **Lead ID type is string (UUID)**: Unlike persons/deals which use `z.number().int().positive()`, lead IDs are UUIDs. Use `z.string().uuid()` for `id` parameters in `GetLeadSchema`, `UpdateLeadSchema`, and `DeleteLeadSchema`. Do not extend `IdParamSchema`.

2. **`value` is an object, not a flat number**: Define a `LeadValueSchema = z.object({ amount: z.number().nonnegative(), currency: CurrencyCodeSchema.unwrap().optional() })` (make currency required when amount is present via `.refine()` if desired, or keep both optional). Use this in both Create and Update schemas.

3. **`pipedrive_list_leads` vs `pipedrive_list_archived_leads`**: Both call `GET /v1/leads`. `listLeads` sets `archived_flag=false` (or omits it - the API default is non-archived). `listArchivedLeads` hardcodes `archived_flag=true`. Both share the same v1 offset pagination pattern (`buildPaginationParamsV1` / `extractPaginationV1`).

4. **`pipedrive_search_leads` uses v2**: Per the issue spec table, search calls `GET /api/v2/leads/search`. Pass `"v2"` as the third argument to `client.get()`. This is unlike `searchPersons` which calls v1 `itemSearch`. Use the v2 cursor pagination helpers for search response extraction.

5. **Pagination**: All list/search tools use `PaginationParamsV1Schema` (start/limit) for list tools; search may support v2 cursor - use `PaginationParamsSchema` (cursor/limit) for `SearchLeadsSchema` since the v2 search endpoint returns cursor-based results.

## Output Structure

```
src/
  schemas/
    leads.ts          # NEW - Zod schemas and type exports
  tools/
    leads.ts          # NEW - Handler functions and leadsTools array
    index.ts          # MODIFIED - import leadsTools, add to allTools spread
tests/
  unit/schemas/
    leads.test.ts     # NEW - Schema unit tests
  integration/tools/
    leads.test.ts     # NEW - Handler integration tests
  helpers/
    fixtures.ts       # MODIFIED - add lead fixture and createLeadsFixture helper
    mockFetch.ts      # MODIFIED - add lead entry to fixtures object
```

---

## Implementation Units

### U1 - Lead Schemas (`src/schemas/leads.ts`)

**Goal**: Define and export all Zod schemas for lead operations.

**Requirements**: R1-R7

**Dependencies**: `src/schemas/common.ts` (`PaginationParamsV1Schema`, `PaginationParamsSchema`, `IdParamSchema` for reference, `SearchTermSchema`, `VisibilitySchema`, `CurrencyCodeSchema`)

**Files**: `src/schemas/leads.ts` (new)

**Approach**:

```
LeadValueSchema
  amount: z.number().nonnegative()
  currency: z.string().length(3).toUpperCase().optional()

LeadIdSchema
  id: z.string().uuid()  // NOT IdParamSchema - leads use UUID strings

ListLeadsSchema extends PaginationParamsV1Schema
  owner_id?: z.number().int().positive()
  person_id?: z.number().int().positive()
  organization_id?: z.number().int().positive()
  filter_id?: z.number().int().positive()
  sort?: z.string()  // e.g. "id ASC"

ListArchivedLeadsSchema = ListLeadsSchema  // same shape; archived_flag set in handler

GetLeadSchema = LeadIdSchema

CreateLeadSchema
  title: z.string().min(1).max(255)   // required
  person_id?: z.number().int().positive()
  organization_id?: z.number().int().positive()
  value?: LeadValueSchema
  owner_id?: z.number().int().positive()
  label_ids?: z.array(z.string().uuid())  // lead labels use UUID IDs
  expected_close_date?: DateStringSchema  // YYYY-MM-DD via common.ts
  visible_to?: VisibilitySchema

UpdateLeadSchema extends LeadIdSchema
  title?: z.string().min(1).max(255)
  person_id?: z.number().int().positive()
  organization_id?: z.number().int().positive()
  value?: LeadValueSchema
  owner_id?: z.number().int().positive()
  label_ids?: z.array(z.string().uuid())
  expected_close_date?: DateStringSchema
  visible_to?: VisibilitySchema
  is_archived?: z.boolean()

DeleteLeadSchema = LeadIdSchema

SearchLeadsSchema
  term: SearchTermSchema
  include_fields?: z.string()
  exact_match?: z.boolean().optional().default(false)
  limit?: z.number().min(1).max(100).optional().default(50)
  cursor?: z.string().optional()
```

**Patterns to follow**: `src/schemas/persons.ts` for overall structure. Use `.optional()` not `.nullable()`. Export `z.infer<>` type aliases at the bottom. Import from `./common.js`.

**Test scenarios** (in U3):
- `LeadValueSchema`: accepts `{amount: 0}`, `{amount: 500, currency: 'USD'}`, rejects negative amounts, rejects currency not 3 chars.
- `ListLeadsSchema`: defaults `limit=50`, accepts `start`, `owner_id`, `filter_id`.
- `GetLeadSchema`: requires valid UUID, rejects integer, rejects empty string.
- `CreateLeadSchema`: requires `title`, accepts `person_id` without `organization_id`, accepts value object, validates `visible_to` via `VisibilitySchema` (only 1/3/5/7), accepts `expected_close_date` in YYYY-MM-DD format, rejects bad date format.
- `UpdateLeadSchema`: requires UUID `id`, all other fields optional, accepts `is_archived: true`.
- `DeleteLeadSchema`: requires UUID `id`.
- `SearchLeadsSchema`: requires `term`, defaults `exact_match=false`, `limit=50`.

**Verification**: `npm test -- tests/unit/schemas/leads.test.ts` passes with no TypeScript errors.

---

### U2 - Lead Tool Handlers (`src/tools/leads.ts`)

**Goal**: Implement all 7 handler functions and the exported `leadsTools` array with MCP tool definitions.

**Requirements**: R1-R7

**Dependencies**: U1 (schemas), `src/client.ts`, `src/utils/pagination.ts` (v1 and v2 helpers), `src/utils/errors.ts` (`mcpErrorResult`, `destructiveOperationGuard`), `src/utils/formatting.ts` (`createListSummary`)

**Files**: `src/tools/leads.ts` (new)

**Approach**:

```typescript
// listLeads - GET /v1/leads (archived_flag=false by default)
const queryParams = buildPaginationParamsV1(params.start, params.limit);
queryParams.set("archived_flag", "false");
if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
if (params.person_id) queryParams.set("person_id", String(params.person_id));
if (params.organization_id) queryParams.set("organization_id", String(params.organization_id));
if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
if (params.sort) queryParams.set("sort", params.sort);
const response = await client.get<unknown[]>("/leads", queryParams, "v1");
// check !response.success, then use response.data || []
// extractPaginationV1(response)
// return createListSummary("lead", leads.length, pagination.has_more)

// listArchivedLeads - GET /v1/leads?archived_flag=true
// identical to listLeads but hardcode: queryParams.set("archived_flag", "true")

// getLead - GET /v1/leads/{id}
// id is UUID string
const response = await client.get<unknown>(`/leads/${params.id}`, undefined, "v1");
// summary: `Lead ${params.id}`

// createLead - POST /v1/leads
const body: Record<string, unknown> = { title: params.title };
if (params.person_id) body.person_id = params.person_id;
if (params.organization_id) body.organization_id = params.organization_id;
if (params.value) body.value = params.value;
if (params.owner_id) body.owner_id = params.owner_id;
if (params.label_ids) body.label_ids = params.label_ids;
if (params.expected_close_date) body.expected_close_date = params.expected_close_date;
if (params.visible_to) body.visible_to = params.visible_to;
const response = await client.post<unknown>("/leads", body, "v1");
// summary: "Lead created"

// updateLead - PATCH /v1/leads/{id}
const { id, ...updateFields } = params;
// build body from defined updateFields
const response = await client.patch<unknown>(`/leads/${id}`, body, "v1");
// summary: `Lead ${id} updated`

// deleteLead - DELETE /v1/leads/{id}
const guard = destructiveOperationGuard();
if (guard) return guard;
const response = await client.delete<{ id: string }>(`/leads/${params.id}`, "v1");
// summary: `Lead ${params.id} deleted`

// searchLeads - GET /api/v2/leads/search
const queryParams = new URLSearchParams();
queryParams.set("term", params.term);
if (params.exact_match) queryParams.set("exact_match", "true");
if (params.limit) queryParams.set("limit", String(params.limit));
if (params.cursor) queryParams.set("cursor", params.cursor);
if (params.include_fields) queryParams.set("include_fields", params.include_fields);
const response = await client.get<unknown>("/leads/search", queryParams, "v2");
// summary: `Search results for "${params.term}"`
```

**Tool definition objects in `leadsTools` array** - each has `name`, `description`, `inputSchema` (plain JSON Schema object mirroring the Zod schema), `handler`, and `schema` fields. Order: list, listArchived, get, create, update, search, delete.

Key `inputSchema` notes:
- `id` property for get/update/delete: `{ type: "string", description: "Lead UUID" }`
- `value`: `{ type: "object", properties: { amount: { type: "number" }, currency: { type: "string" } } }`
- `visible_to`: `{ type: "number", enum: [1, 3, 5, 7], description: "Visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" }`

**Patterns to follow**: Exactly `src/tools/notes.ts` for v1 list pattern (import `buildPaginationParamsV1`, `extractPaginationV1`, pass `"v1"` to all client calls). Exactly `src/tools/persons.ts` for overall file structure, `leadsTools` array, and delete guard pattern.

**Test scenarios** (in U4):
- `listLeads`: returns list with summary, passes `archived_flag=false`, passes `owner_id`/`person_id`/`organization_id` filters, handles v1 pagination has_more.
- `listArchivedLeads`: same shape but URL contains `archived_flag=true`.
- `getLead`: returns single lead with summary `Lead <uuid>`, handles 404 NOT_FOUND.
- `createLead`: creates with title only (+ one of person_id/org_id), creates with value object, POSTs to `/v1/leads`, sends correct body fields.
- `updateLead`: PATCHes `/v1/leads/<uuid>`, summary contains `updated`, sends only provided fields.
- `deleteLead`: blocked when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset (returns `DESTRUCTIVE_DISABLED` error), deletes when env set, sends DELETE to `/v1/leads/<uuid>`.
- `searchLeads`: uses v2 URL `/api/v2/leads/search` (or equivalent), passes `term`, `exact_match`, `include_fields`.

**Verification**: `npm test -- tests/integration/tools/leads.test.ts` passes.

---

### U3 - Schema Unit Tests (`tests/unit/schemas/leads.test.ts`)

**Goal**: Achieve full coverage of all schema validation rules.

**Requirements**: R9

**Dependencies**: U1 (schemas)

**Files**: `tests/unit/schemas/leads.test.ts` (new)

**Approach**: Mirror `tests/unit/schemas/persons.test.ts` exactly in structure. Use `describe` blocks per schema, `it` assertions per rule. Import all exported schemas from `src/schemas/leads.js`.

**Test scenarios**:
- `LeadValueSchema`: valid `{amount: 0}` (zero allowed), valid with currency `'USD'`, rejects `amount: -1`, rejects `currency: 'US'` (too short), rejects `currency: 'USDD'` (too long).
- `ListLeadsSchema`: empty input returns `{limit: 50}`, all filters pass through, rejects `limit: 0`, rejects `limit: 501`.
- `ListArchivedLeadsSchema`: same rules as ListLeadsSchema (they share the same Zod type).
- `GetLeadSchema`: requires `id`, accepts valid UUID `'550e8400-e29b-41d4-a716-446655440000'`, rejects integer `1`, rejects `'not-a-uuid'`, rejects `''`.
- `CreateLeadSchema`: requires `title`, accepts `title + person_id`, accepts full payload with value object, rejects empty title `''`, rejects title over 255 chars, validates `visible_to` (accepts 1/3/5/7, rejects 2/4/6/8), rejects invalid `expected_close_date` format.
- `UpdateLeadSchema`: requires `id` (UUID), all other fields optional, accepts `is_archived: true`.
- `DeleteLeadSchema`: requires `id` (UUID), rejects missing `id`.
- `SearchLeadsSchema`: requires `term`, defaults `exact_match=false` and `limit=50`, rejects empty term.

**Verification**: `npm test -- tests/unit/schemas/leads.test.ts` passes with 100% schema coverage.

---

### U4 - Integration Tests (`tests/integration/tools/leads.test.ts`)

**Goal**: Confirm every handler calls the correct v1/v2 endpoint, passes expected query/body parameters, returns the correct MCP response shape, and that delete is properly gated.

**Requirements**: R10

**Dependencies**: U2 (handlers), test helpers (`setupValidEnv`, `mockFetch`, `mockApiSuccess`, `mockApiError`, `fixtures`, `paginationFixtures`), `tests/helpers/fixtures.ts` (new `createLeadsFixture`).

**Files**:
- `tests/integration/tools/leads.test.ts` (new)
- `tests/helpers/fixtures.ts` (modified - add `createLeadsFixture`)
- `tests/helpers/mockFetch.ts` (modified - add `lead` fixture entry)

**Approach**: Mirror `tests/integration/tools/persons.test.ts`. Dynamic import pattern `async function getLeadsTools() { return import('../../../src/tools/leads.js'); }`. `beforeEach` calls `setupValidEnv(); vi.unstubAllGlobals();`.

Add to `tests/helpers/mockFetch.ts` fixtures:
```typescript
lead: {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test Lead',
  value: { amount: 5000, currency: 'USD' },
  person_id: 1,
  organization_id: null,
  owner_id: 1,
  expected_close_date: '2024-12-31',
  is_archived: false,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
},
```

Add to `tests/helpers/fixtures.ts`:
```typescript
export function createLeadsFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.lead,
    id: `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
    title: `Test Lead ${i + 1}`,
  }));
}
```

**Test scenarios per describe block**:

`listLeads`:
- Returns list with summary containing `N leads`, data array.
- URL contains `archived_flag=false`.
- Passes `owner_id`, `person_id`, `organization_id` as query params.
- Uses v1 pagination: `parsed.pagination.has_more = true` when `v1WithMore` fixture used.

`listArchivedLeads`:
- URL contains `archived_flag=true`.
- Returns list with summary containing `N leads`.

`getLead`:
- Returns single lead, summary is `'Lead 550e8400-...'`.
- Returns NOT_FOUND error on 404.

`createLead`:
- Summary is `'Lead created'` on success.
- POSTs to a URL containing `/v1/leads`.
- Body contains `title`, `person_id`, `value` when provided.
- Does not include `undefined` fields in body.

`updateLead`:
- Summary contains `updated`.
- Sends PATCH request.
- URL contains `/v1/leads/<uuid>`.

`deleteLead`:
- Returns `DESTRUCTIVE_DISABLED` error when env var unset.
- Returns summary containing `deleted` when env var set.
- Sends DELETE to URL containing `/v1/leads/<uuid>`.

`searchLeads`:
- URL contains `/leads/search`.
- URL contains `v2` or is the v2 base URL.
- Passes `term`, `exact_match=true` when specified.
- Summary contains the search term.

**Verification**: `npm test -- tests/integration/tools/leads.test.ts` passes. All destructive guard assertions confirmed.

---

### U5 - Tool Registration (`src/tools/index.ts`)

**Goal**: Register all 7 leads tools in the MCP server's `allTools` array.

**Requirements**: R8

**Dependencies**: U2 (leadsTools export)

**Files**: `src/tools/index.ts` (modified)

**Approach**:

Add import:
```typescript
import { leadsTools } from "./leads.js";
```

Add to `allTools` array under Tier 1 with a comment (leads are core CRM entities, alongside deals, persons, activities, notes):
```typescript
export const allTools = [
  // Tier 1: Core CRM Operations
  ...dealTools,
  ...personTools,
  ...activityTools,
  ...noteTools,
  ...leadsTools,   // ADD

  // Tier 2: Email/Mail Tools
  ...mailTools,
  ...
```

No other changes needed - `getToolHandler` and `getToolSchema` are generic lookups that work automatically.

**Patterns to follow**: Existing import block and `allTools` array structure in `src/tools/index.ts`.

**Test scenarios**: Covered by existing `tests/integration/` suite - if `npm test` passes after the spread addition, registration is confirmed. Optionally add a quick smoke check in the integration test: `import { allTools } from '../../../src/tools/index.js'` and assert `allTools.some(t => t.name === 'pipedrive_list_leads')`.

**Verification**: `npm run build` succeeds (no TS errors). `npm test` passes full suite.

---

## Scope Boundaries

**In scope**:
- All 7 leads tools listed in issue #12.
- Lead label IDs (UUID arrays, passed through as-is - no label lookup).
- `value` object (`amount`, `currency`).
- `is_archived` flag on update (allows archiving via PATCH).

**Out of scope**:
- Lead-to-deal conversion (issue #13).
- Lead label management (listing/creating labels).
- Lead followers API.
- Any v1-to-v2 migration for leads (no v2 CRUD endpoint exists yet as of this plan).

---

## Verification

After all units are complete:

1. `npm run build` - TypeScript compiles cleanly, no errors in new files.
2. `npm test` - Full test suite passes (no regressions + new tests green).
3. `npm run test:coverage` - Leads files show high coverage (target: handlers and schemas 90%+).
4. Manual check: confirm `src/tools/index.ts` `allTools` length increased by 7.

---

*Planned by [Menehune](https://github.com/ckalima/menehune) via /backlog:plan (fan-out)*
