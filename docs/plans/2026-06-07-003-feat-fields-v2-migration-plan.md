---
title: "feat: migrate fields endpoints from v1 to v2"
status: active
date: 2026-06-07
type: feat
issue: 10
depth: standard
---

# Migrate Fields Endpoints from v1 to v2

## Summary

Migrate `listDealFields`, `listPersonFields`, and `listOrganizationFields` from v1 offset pagination to v2 cursor pagination on the corresponding `/api/v2` endpoints. Fix a latent bug in `getField` where only the first page is fetched, causing fields beyond the first page to silently return "Field not found". Update schemas and tests throughout. Must ship before the v1 sunset on July 31, 2026.

---

## Problem Frame

### v1 sunset deadline

The v1 API is hard-sunsetted on **July 31, 2026**. All three list handlers (`listDealFields`, `listPersonFields`, `listOrganizationFields`) call `client.get(..., "v1")` with `buildPaginationParamsV1`/`extractPaginationV1`. After sunset they will fail for all callers.

### getField page-1 bug (explicit)

`getField` in `src/tools/fields.ts` fetches a single page of fields via `client.get(endpoint, undefined, "v1")` - no pagination params are passed, so the API returns only the first page (default 50 items). It then does `response.data.find(f => f.key === params.key)` on that one page. Any custom field that happens to be defined after the 50th field is permanently unreachable: the handler silently returns `"Field not found: <key> in <entity_type> fields"` with no indication that pages were skipped. This is a correctness bug, not just a v1/v2 issue - it exists today and gets worse as organizations accumulate more custom fields.

### v2 field renames

The issue notes that v2 uses `field_key` instead of `field_id` as the canonical identifier. The current `getField` lookup uses `f.key` to match - this property name must be confirmed against v2 response shape. The three v2-migrated list endpoints (`/dealFields`, `/personFields`, `/organizationFields`) are available as of December 2025.

### Scope boundary: product/activity/project fields

`getField` supports `entity_type` values `product`, `activity`, and `project` in addition to the three being migrated. These map to `/productFields`, `/activityFields`, `/projectFields` which may not yet have v2 equivalents. These are handled in `getField` only (no dedicated list handlers exist for them). This plan keeps those three on v1 for now and documents the residual.

---

## Requirements

- **R1** - `listDealFields`, `listPersonFields`, `listOrganizationFields` must call v2 endpoints (`/dealFields`, `/personFields`, `/organizationFields`) without the `"v1"` version argument.
- **R2** - All three list handlers must use `buildPaginationParamsV2` / `extractPaginationV2` and expose `cursor`/`has_more` in the response, not `next_start`.
- **R3** - `src/schemas/fields.ts` list schemas must extend `PaginationParamsSchema` (v2 cursor-based) instead of `PaginationParamsV1Schema`.
- **R4** - `getField` must not silently miss fields beyond the first page. Fix by paginating through all pages until the target key is found or pages are exhausted. For the three v2-migrated entity types use v2 endpoints; for `product`, `activity`, `project` keep v1 but still paginate all pages.
- **R5** - The MCP tool `inputSchema` properties in the `fieldTools` array must be updated to reflect `cursor` (string) instead of `start` (number) for the three list tools.
- **R6** - All existing integration tests must be updated to assert v2 endpoints and v2 pagination structures; stale v1 assertions must be replaced.
- **R7** - New regression test must verify `getField` finds a field that would be on page 2 (i.e., not returned on the first fetch call).

---

## Key Technical Decisions

1. **`getField` fix via full pagination, not a direct-lookup endpoint** - v2 does not expose a `GET /dealFields/{field_key}` or equivalent direct-by-key endpoint. The fix is to paginate through all pages using `buildPaginationParamsV2`/`extractPaginationV2` in a `while (has_more)` loop and stop early when the key is found. This is O(pages) worst-case but correct, and consistent with how other "find by attribute" patterns work in the codebase (e.g., `getField` was already doing a client-side find, just broken at page boundaries).

2. **Per-entity-type version routing inside `getField`** - Because `product`/`activity`/`project` field endpoints may not exist in v2 yet, `getField` must keep two code paths: v2 pagination for `deal`/`person`/`organization`, and v1 pagination for `product`/`activity`/`project`. Define a `V2_ENTITY_TYPES` constant set for this guard. This keeps the fix contained and avoids breaking the three entity types that are out of scope.

3. **No response-shape transformation** - The plan does not add any translation layer between v1 and v2 field response shapes. Callers receive whatever the v2 API returns. If field renames (`field_key` vs `key`) affect the `getField` lookup, the match expression must use the correct v2 property name; this is addressed in U2.

4. **`inputSchema` in tool definitions updated inline** - The `fieldTools` array in `src/tools/fields.ts` defines its own `inputSchema` objects separate from the Zod schemas. Both must be updated in lockstep (Zod schema in `src/schemas/fields.ts`, raw JSON schema object in the `fieldTools` array).

---

## Implementation Units

### U1 - Update `src/schemas/fields.ts` to v2 cursor pagination

**Goal** - Replace v1 offset schemas with v2 cursor schemas for the three list operations.

**Requirements** - R3

**Dependencies** - None

**Files**
- `src/schemas/fields.ts`

**Approach**

Replace the import of `PaginationParamsV1Schema` with `PaginationParamsSchema` (the v2 cursor schema from `src/schemas/common.ts`). Update `ListOrganizationFieldsSchema`, `ListDealFieldsSchema`, `ListPersonFieldsSchema` to equal `PaginationParamsSchema`. The inferred TypeScript types `ListOrganizationFieldsParams` etc. will automatically reflect `cursor?: string` and `limit: number` (max 100). No changes needed to `GetFieldSchema` or `FieldEntityTypeSchema`.

**Patterns to follow** - `src/schemas/deals.ts` imports `PaginationParamsSchema` for its list schema.

**Test scenarios**
- Schema accepts `{}` and defaults `limit` to 50
- Schema accepts `{ cursor: "abc", limit: 25 }`
- Schema rejects `limit` > 100
- Schema does NOT accept `start` (verify old v1 field is gone)
- `GetFieldSchema` unaffected - still requires `entity_type` and `key`

**Verification** - `npm test` with unit schema tests passing; TypeScript compile succeeds.

---

### U2 - Migrate three list handlers and fix `getField` in `src/tools/fields.ts`

**Goal** - Switch all three list handlers to v2 and fix the `getField` page-1 bug with full pagination.

**Requirements** - R1, R2, R4, R5

**Dependencies** - U1 (schemas must be v2 before updating handlers that use the param types)

**Files**
- `src/tools/fields.ts`

**Approach**

**List handlers (three identical changes):**

Replace:
```ts
buildPaginationParamsV1(params.start, params.limit)
client.get<unknown[]>(endpoint, queryParams, "v1")
extractPaginationV1(response)
pagination: { next_start: ..., has_more: ... }
```
With:
```ts
buildPaginationParamsV2(params.cursor, params.limit)
client.get<unknown[]>(endpoint, queryParams)  // v2 is default
extractPaginationV2(response)
pagination  // the PaginationInfo object directly, matching deals.ts pattern
```

Import swap: remove `buildPaginationParamsV1`, `extractPaginationV1`; add `buildPaginationParamsV2`, `extractPaginationV2`.

**`getField` fix:**

Define a constant at module level:
```ts
const FIELDS_V2_ENTITY_TYPES = new Set(["organization", "deal", "person"]);
```

Replace the single `client.get(endpoint, undefined, "v1")` call with a pagination loop. Pseudocode:

```ts
const useV2 = FIELDS_V2_ENTITY_TYPES.has(params.entity_type);
let cursor: string | undefined;
let field: { key: string; [k: string]: unknown } | undefined;

do {
  const queryParams = useV2
    ? buildPaginationParamsV2(cursor)
    : buildPaginationParamsV1(cursor ? parseInt(cursor) : undefined);
  const response = await client.get<Array<{ key: string; [k: string]: unknown }>>(
    endpoint,
    queryParams,
    useV2 ? "v2" : "v1"
  );
  if (!response.success || !response.data) return mcpErrorResult(response);
  field = response.data.find(f => f.key === params.key);
  const pagination = useV2 ? extractPaginationV2(response) : extractPaginationV1(response);
  cursor = pagination.next_cursor;
} while (!field && cursor);
```

Note: v2 field objects use `key` as the property name (same as v1 per Pipedrive docs for the `key` field - the issue's mention of `field_key` vs `field_id` refers to the query parameter used for direct lookup, not the field on the returned object). If integration testing reveals otherwise, the match expression must be updated to use the actual v2 property name.

**`inputSchema` in `fieldTools` array:**

For the three list tools, replace:
```json
{ "start": { "type": "number", "description": "Pagination offset" } }
```
With:
```json
{ "cursor": { "type": "string", "description": "Cursor for pagination (from previous response)" } }
```

**Patterns to follow** - `src/tools/deals.ts` `listDeals` for list handler shape. The `do...while` pagination loop is new but is a standard pattern for "search across all pages."

**Test scenarios** - Covered in U3.

**Verification** - `npm run build` (TypeScript compile); handlers return `pagination.next_cursor` not `pagination.next_start`.

---

### U3 - Update integration tests in `tests/integration/tools/fields.test.ts`

**Goal** - Replace all v1 endpoint assertions and add the `getField` page-2 regression test.

**Requirements** - R6, R7

**Dependencies** - U2

**Files**
- `tests/integration/tools/fields.test.ts`

**Approach**

**Update existing `listOrganizationFields` tests:**
- `'should use v1 API'` test: rename to `'should use v2 API'`, assert URL contains `/api/v2/organizationFields` not `/v1/organizationFields`
- `'should pass pagination parameters'`: replace `start=50` + `limit=100` with `cursor=<value>` + `limit=100`. Call `listOrganizationFields({ cursor: 'abc', limit: 100 })`.
- Add: `'should include cursor in pagination response'` - mock `mockFetch({ data: [...], additional_data: paginationFixtures.v2WithMore })`, assert `parsed.pagination.next_cursor === 'cursor_abc123'` and `parsed.pagination.has_more === true`.

**Update `listDealFields` tests:**
- Same pattern as organization: replace v1 endpoint assertion with v2.

**Update `listPersonFields` tests:**
- Same pattern.

**Update `getField` tests:**
- `'should use correct v1 API endpoint for each entity type'`: split into two sub-tests:
  - `'should use v2 API endpoint for deal/person/organization entity types'` - assert `/api/v2/dealFields`, `/api/v2/personFields`, `/api/v2/organizationFields`
  - `'should use v1 API endpoint for product/activity/project entity types'` - assert `/v1/productFields`, `/v1/activityFields`, `/v1/projectFields`

**Add regression test (R7):**
```ts
it('should find a field that would be on page 2 (regression: page-1 bug)', async () => {
  const page1Fields = Array.from({ length: 50 }, (_, i) =>
    ({ ...createFieldFixture(`field_${i}`, `Field ${i}`, 'varchar'), key: `field_${i}` })
  );
  const page2Fields = [
    { ...createFieldFixture('custom_hash_abc', 'My Custom Field', 'varchar'), key: 'custom_hash_abc' },
  ];

  // First fetch returns 50 fields with a next_cursor; second returns page 2
  mockFetch([
    { data: page1Fields, additional_data: { next_cursor: 'page2cursor' } },
    { data: page2Fields, additional_data: undefined },
  ]);
  const { getField } = await getFieldsTools();

  const result = await getField({ entity_type: 'deal', key: 'custom_hash_abc' });

  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.data.name).toBe('My Custom Field');
  // Verify two fetch calls were made
  // (mockFetch returns a vi.fn(); use vi.mocked(global.fetch).mock.calls.length)
});
```

Note: `mockFetch` from `tests/helpers/mockFetch.ts` accepts an array of `MockResponseOptions` and cycles through them per call - this pattern is already supported.

**Patterns to follow** - `tests/integration/tools/deals.test.ts` for v2 pagination assertions and multi-response mock pattern. `tests/integration/tools/fields.test.ts` existing structure for beforeEach setup.

**Verification** - `npm test tests/integration/tools/fields.test.ts` passes with no v1 endpoint assertions remaining (except product/activity/project in `getField`).

---

### U4 - Update unit schema tests in `tests/unit/schemas/fields.test.ts`

**Goal** - Replace v1-specific assertions with v2 cursor equivalents.

**Requirements** - R6

**Dependencies** - U1

**Files**
- `tests/unit/schemas/fields.test.ts`

**Approach**

**`ListOrganizationFieldsSchema` tests:**
- Remove: `'should accept pagination params'` with `{ start: 50, limit: 100 }` and `expect(result.start).toBe(50)`
- Remove: `'should accept limit up to 500 (v1 API)'` - v2 caps at 100
- Add: `'should accept cursor param'` - `parse({ cursor: 'abc', limit: 50 })`, assert `result.cursor === 'abc'`
- Add: `'should default limit to 50'` - unchanged behavior
- Add: `'should reject limit above 100'` - `expect(() => parse({ limit: 101 })).toThrow()`
- Add: `'should not accept start param'` - `expect(() => parse({ start: 50 })).toThrow()` (Zod strips unknown by default; if schema uses `.strict()` this throws, otherwise just drops it - verify behavior and adjust assertion accordingly)

**`ListDealFieldsSchema` and `ListPersonFieldsSchema`:**
- Same pattern: replace `start`/limit-500 tests with cursor/limit-100 tests.

**`GetFieldSchema`** - No changes needed.

**`FieldEntityTypeSchema`** - No changes needed.

**Patterns to follow** - `tests/unit/schemas/activities.test.ts` or `tests/unit/schemas/deals.test.ts` for v2 pagination schema test patterns.

**Verification** - `npm test tests/unit/schemas/fields.test.ts` passes.

---

## Scope Boundaries

**In scope:**
- `listDealFields`, `listPersonFields`, `listOrganizationFields` - full v2 migration
- `getField` - pagination bug fix + v2 for deal/person/organization entity types
- Schema update for the three list schemas
- All tests for the above

**Out of scope:**
- `getField` for `product`, `activity`, `project` entity types - kept on v1 pagination (bug-fixed only)
- `productFields`, `activityFields`, `projectFields` v2 migration - tracked separately (no v2 availability confirmed)
- Issue #7 (auth mechanism migration) - listed as a dependency; this plan assumes `client.get()` correctly handles v2 auth already (confirmed: existing v2 tools like `deals.ts` omit the `"v1"` arg and work correctly)
- Response-shape normalization or backwards-compat translation layer
- Any new list tools for product/activity/project fields

---

## Verification

The implementation is complete when:

1. `npm run build` exits with no TypeScript errors
2. `npm test` passes all tests (zero failures)
3. `tests/integration/tools/fields.test.ts` contains no assertions with `/v1/dealFields`, `/v1/personFields`, or `/v1/organizationFields` (only `/v1/productFields`, `/v1/activityFields`, `/v1/projectFields` are still permitted)
4. The page-2 regression test in U3 exists and passes (two-fetch mock, field found on second page)
5. `tests/unit/schemas/fields.test.ts` contains no reference to `start` param acceptance or `limit` > 100 acceptance for list schemas

---

*Planned by [Menehune](https://github.com/ckalima/menehune) via /backlog:plan (fan-out)*
