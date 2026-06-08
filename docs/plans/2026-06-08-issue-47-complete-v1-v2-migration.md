# Plan — Issue #47: complete v1→v2 migration (search, project tasks, fields, archive)

Branch: `agent/47-complete-v1-v2-migration` (off origin/main @ 3cf3a59)
Worktree: `/Users/ckalima/repos/pipedrive-mcp-server/.claude/menehune/worktrees/agent-47-complete-v1-v2-migration`
Spec (authoritative, vendored): `docs/api/openapi-v2.yaml`. Where spec ≠ issue text, **spec wins** — discrepancies are flagged inline.

This plan is split into THREE write-disjoint lanes (S / P / F). Three implementers can each take one lane in parallel. Read your lane top-to-bottom; it is self-contained. Do NOT read each other's source files except where this plan says a file is shared.

---

## 0. GLOBAL RULES (every lane MUST obey)

### 0.1 Zod is 4.4.3 — NOT Zod 3 (override stale notes)
`package.json` pins `"zod": "^4.4.3"`. Any comment/memory/old-plan saying "Zod 3.25 / do not migrate" is **STALE — ignore it**. Match existing idioms already in this repo:
- `z.email()` (not `z.string().email()`)
- `z.record(z.string(), z.unknown())`
- `Schema.extend({...})` and `Schema.extend(Other.shape)` (NOT `.merge`)
- `z.enum([...])`, `.optional()`, `.default(...)`, `.describe(...)`
Do NOT downgrade or "modernize" anything outside your assigned edits.

### 0.2 FALSE-GREEN HAZARD — why a green suite does NOT prove correctness
Two structural reasons the test suite can stay green while the code is wrong:
1. **`tsconfig.json` excludes `**/*.test.ts`** (line 19: `"exclude": ["node_modules", "dist", "**/*.test.ts"]`). Tests are NEVER type-checked. A test can pass a param that the Zod type forbids and tsc will never complain.
2. **Integration + functional tests call handlers DIRECTLY** (e.g. `await searchDeals({term:'x'})`), bypassing the MCP dispatcher's `Schema.parse(...)`. So a handler test does NOT exercise the Zod schema at all.

Therefore EACH lane MUST add BOTH kinds of real guards:
- **UNIT schema guards** (`tests/unit/schemas/<entity>.test.ts`): call `Schema.parse(...)` and assert the NEW param shape is accepted AND the OLD shape is rejected-or-stripped. This is the ONLY place Zod is actually exercised.
- **INTEGRATION wire-shape guards** (`tests/integration/tools/<entity>.test.ts`): inspect the mocked `fetch` call — assert the exact URL/path, the HTTP method, and `JSON.parse(options.body)` — so the ACTUAL outbound request is pinned.

### 0.3 ADVERSARIAL REVERT-PROOF (reviewer will run this per lane)
For each lane the reviewer will: keep the NEW tests, `git checkout origin/main -- <the lane's src files>`, re-run the suite. The new guards MUST FAIL against old src. A guard that still passes on old src is worthless. Each lane below names the specific assertions that constitute its revert-proof.

### 0.4 OUT OF SCOPE — do NOT touch
- `tests/functional/crud-flows.test.ts:82` (persons `email:` latent v1 shape) and `:160` (orgs `address:'100 Tech Way'` string). Tracked under #49. **Leave them.** (They pass today only because handlers are called directly and `createPerson`/`createOrganization` ignore unknown `email`/string-`address` at runtime.)
- `src/schemas/common.ts`, `src/tools/index.ts`, `src/utils/pagination.ts` — READ-ONLY. The v2 cursor helpers already exist; reuse by import. Do NOT modify them. (Note: `buildPaginationParamsV1`/`extractPaginationV1` remain used by leads/notes/mail, so they stay in pagination.ts even after Lane F drops fields.ts's use — do not delete them.)
- All four changes modify EXISTING tools/handlers in place. `src/tools/index.ts` needs NO change. There is a smoke test asserting 8 project tools registered — it keeps passing.

### 0.5 Shared-helper ownership
`tests/helpers/fixtures.ts` and `tests/helpers/mockFetch.ts` are shared. **LANE S is the SOLE owner of edits to these two files** (see §S.4). LANES P and F MUST use test-file-LOCAL inline fixtures and MUST NOT edit `tests/helpers/*`. Neither P nor F has any unavoidable shared-helper need (verified — both can build responses with the existing `mockFetch({data,additional_data})` primitive). If that changes, STOP and escalate; it would serialize the lanes.

### 0.6 Client method reference (read-only, all lanes)
`src/client.ts`:
- `get<T>(endpoint, params?: URLSearchParams, version: "v1"|"v2" = "v2")`
- `post<T>(endpoint, body: Record<string,unknown>, version = "v2")`  ← Lane P archive uses this
- `patch<T>(endpoint, body, version = "v2")`
- `delete<T>(endpoint, version = "v2")`
Base URLs: v2 → `…/api/v2`, v1 → `…/v1` (so a v2 URL contains `/api/v2/`, a v1 URL contains `/v1/`). Auth: v2 sets `x-api-token` header; v1 appends `?api_token=`. The response wrapper exposes `response.additional_data.next_cursor` (read by `extractPaginationV2`).

---

# LANE S — Search → v2 (deals, persons, organizations)

**Owner of:** `src/tools/deals.ts`, `src/tools/persons.ts`, `src/tools/organizations.ts`, `src/schemas/deals.ts`, `src/schemas/persons.ts`, `src/schemas/organizations.ts`, `tests/unit/schemas/{deals,persons,organizations}.test.ts`, `tests/integration/tools/{deals,persons,organizations}.test.ts`, **and the shared `tests/helpers/fixtures.ts` + `tests/helpers/mockFetch.ts`** (§S.4).

**Headline:** switch all three search handlers from v1 `/itemSearch` to the dedicated v2 search endpoints (`/deals/search`, `/persons/search`, `/organizations/search`); add cursor/limit pagination; replace persons' boolean `search_by_email`/`search_by_phone` with a single `fields` param; keep `org_id`→`organization_id` mapping.

## S.1 Spec citations (verified against `docs/api/openapi-v2.yaml`)

**`/deals/search` — line 3817** (GET, operationId `searchDeals`). Query params:
- `term` (required, string)
- `fields` (string, comma-separated; enum: `custom_fields`, `notes`, `title`)  ← line 3840
- `exact_match` (boolean) — line 3848
- `person_id` (integer) — line 3853
- `organization_id` (integer) — line 3858  ← **NOT `org_id`**
- `status` (string; enum `open`,`won`,`lost`) — line 3863
- `include_fields` (string; enum `deal.cc_email`) — line 3872
- `limit` (integer, default 100, max 500) — line 3879
- `cursor` (string) — line 3885
Response (line 3891+): `{ success, data: { items: [ { result_score, item:{...} } ] }, additional_data: { next_cursor } }`.

**`/organizations/search` — line 16741** (GET, `searchOrganization`). Query params: `term` (req), `fields` (enum: `address`, `custom_fields`, `notes`, `name`) line 16763, `exact_match`, `limit`, `cursor`. **No `organization_id`, no `person_id`, no `status`, no `include_fields`.** Response same envelope: `data.items[].{result_score,item}` + `additional_data.next_cursor` (line 16851).

**`/persons/search` — line 16875** (GET, `searchPersons`). Query params: `term` (req), `fields` (enum: `custom_fields`, `email`, `notes`, `phone`, `name`) line 16897, `exact_match`, `organization_id` (integer) line 16912, `include_fields` (enum `person.picture`) line 16917, `limit`, `cursor`. **No `person_id`, no `status`.** Response same envelope (line 16936+).

> SPEC SURPRISES vs issue text:
> - Issue says "map `org_id`→`organization_id`" — confirmed for deals + persons. **Organizations search has NO org filter at all** (you don't have an org filtering an org). Current org schema already has no `org_id`, so nothing to map there.
> - Issue says replace `search_by_email`/`search_by_phone` with `fields`. Confirmed: persons v2 uses `fields=email,phone,name,notes,custom_fields`. The two booleans do NOT exist in v2.
> - `exact_match` and `term` DO carry over to all three (confirmed). `status` carries over ONLY for deals. `person_id` exists ONLY on deals search.
> - The v2 `fields` value is a **comma-separated string** (e.g. `"email,phone"`), passed verbatim as the query value. Implement `fields` as a single string param (NOT an array, NOT booleans).

## S.2 Source edits

### S.2.a `src/schemas/deals.ts` — `SearchDealsSchema` (lines 135-147)
Add `fields` and cursor pagination; keep `term`, `person_id`, `org_id`, `status`, `exact_match`, `limit`. Replace the block with:
```ts
export const SearchDealsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term to find in deal title, notes, and custom fields"),
  fields: z.string().optional()
    .describe("Comma-separated fields to search (allowed: title, notes, custom_fields). Defaults to all."),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by linked organization"),
  status: DealStatusSchema.optional(),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});
```
(`SearchDealsParams` type export at line 161 is unchanged — it re-infers.)

### S.2.b `src/schemas/persons.ts` — `SearchPersonsSchema` (lines 117-130) **[the core schema flip]**
REMOVE `search_by_email` (line 122) and `search_by_phone` (line 124). ADD `fields` + `cursor`. Replace the block with:
```ts
export const SearchPersonsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for name, email, phone, or notes"),
  fields: z.string().optional()
    .describe("Comma-separated fields to search (allowed: name, email, phone, notes, custom_fields). Defaults to all."),
  org_id: z.number().int().positive().optional()
    .describe("Filter by organization"),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});
```

### S.2.c `src/schemas/organizations.ts` — `SearchOrganizationsSchema` (lines 119-126)
Add `fields` + `cursor`:
```ts
export const SearchOrganizationsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for organization name or address"),
  fields: z.string().optional()
    .describe("Comma-separated fields to search (allowed: name, address, notes, custom_fields). Defaults to all."),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});
```

### S.2.d `src/tools/deals.ts` — `searchDeals` (lines 186-218)
Replace the whole handler body (keep the function signature). New body:
```ts
export async function searchDeals(params: SearchDealsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.org_id) queryParams.set("organization_id", String(params.org_id));
  if (params.status) queryParams.set("status", params.status);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/deals/search", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Search results for "${params.term}"`,
        data: response.data,
        pagination,
      }, null, 2),
    }],
  };
}
```
Notes: drop the `item_types` query param (v2 endpoint is entity-specific, no `item_types`). Drop the `"v1"` 3rd arg → defaults to v2. `extractPaginationV2` is already imported at line 20. `data` is the v2 `{items:[...]}` object — passed through as-is (do not unwrap).

### S.2.e `src/tools/persons.ts` — `searchPersons` (lines 171-203)
Replace the whole handler body:
```ts
export async function searchPersons(params: SearchPersonsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.org_id) queryParams.set("organization_id", String(params.org_id));
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/persons/search", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Search results for "${params.term}"`,
        data: response.data,
        pagination,
      }, null, 2),
    }],
  };
}
```
This REMOVES the `search_by_email`/`search_by_phone` query lines (old lines 178-179) and the `item_types` line. `extractPaginationV2` is imported at line 20.

### S.2.f `src/tools/organizations.ts` — `searchOrganizations` (lines 164-193)
Replace the whole handler body:
```ts
export async function searchOrganizations(params: SearchOrganizationsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/organizations/search", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Search results for "${params.term}"`,
        data: response.data,
        pagination,
      }, null, 2),
    }],
  };
}
```
`extractPaginationV2` is imported at line 20.

### S.2.g Hand-written `inputSchema` JSON literals (NOT generated — must hand-edit all three)

**deals.ts `pipedrive_search_deals` inputSchema (lines 351-362):** under `properties`, ADD `fields` and `cursor`, keep the rest:
```ts
        term: { type: "string", description: "Search term" },
        fields: { type: "string", description: "Comma-separated fields to search (title, notes, custom_fields). Defaults to all." },
        person_id: { type: "number", description: "Filter by linked person" },
        org_id: { type: "number", description: "Filter by linked organization" },
        status: { type: "string", enum: ["open", "won", "lost", "deleted"], description: "Filter by status (omit to return all non-deleted deals)" },
        exact_match: { type: "boolean", description: "Use exact match instead of fuzzy" },
        limit: { type: "number", description: "Number of results (1-100)" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
```

**persons.ts `pipedrive_search_persons` inputSchema (lines 369-378):** REMOVE the `search_by_email` line (374) and `search_by_phone` line (375); ADD `fields` and `cursor`:
```ts
        term: { type: "string", description: "Search term" },
        fields: { type: "string", description: "Comma-separated fields to search (name, email, phone, notes, custom_fields). Defaults to all." },
        org_id: { type: "number", description: "Filter by organization" },
        exact_match: { type: "boolean", description: "Use exact match" },
        limit: { type: "number", description: "Number of results (1-100)" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
```

**organizations.ts `pipedrive_search_organizations` inputSchema (lines 336-340):** ADD `fields` and `cursor`:
```ts
        term: { type: "string", description: "Search term" },
        fields: { type: "string", description: "Comma-separated fields to search (name, address, notes, custom_fields). Defaults to all." },
        exact_match: { type: "boolean", description: "Use exact match" },
        limit: { type: "number", description: "Number of results (1-100)" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
```
Also update the three search tool `description` strings to drop "v1"/"itemSearch" wording if present (deals desc line 350, persons 368, orgs 333 currently say nothing about v1 — leave wording, they're fine; only ensure no text claims email/phone booleans).

## S.3 Test edits

### S.3.a UNIT schema guards
**`tests/unit/schemas/persons.test.ts` — `describe('SearchPersonsSchema')` (lines 248-285): FLIP.** This block is currently FALSE-GREEN — it asserts `search_by_email`/`search_by_phone` defaults (lines 256-257) and passes them as input (266-267). Replace the whole describe with:
```ts
  describe('SearchPersonsSchema', () => {
    it('should require term', () => {
      expect(() => SearchPersonsSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just term and apply defaults', () => {
      const result = SearchPersonsSchema.parse({ term: 'john' });
      expect(result.term).toBe('john');
      expect(result.exact_match).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should accept the new fields param and cursor', () => {
      const result = SearchPersonsSchema.parse({ term: 'jane', fields: 'email,phone', org_id: 5, cursor: 'c1', exact_match: true, limit: 25 });
      expect(result.fields).toBe('email,phone');
      expect(result.org_id).toBe(5);
      expect(result.cursor).toBe('c1');
      expect(result.exact_match).toBe(true);
    });

    // REGRESSION GUARD (revert-proof): the old boolean params must no longer exist on the parsed output.
    it('should NOT carry search_by_email / search_by_phone (removed in v2 migration)', () => {
      const result = SearchPersonsSchema.parse({ term: 'x', search_by_email: true, search_by_phone: false } as Record<string, unknown>);
      expect((result as Record<string, unknown>).search_by_email).toBeUndefined();
      expect((result as Record<string, unknown>).search_by_phone).toBeUndefined();
    });

    it('should reject empty term', () => {
      expect(() => SearchPersonsSchema.parse({ term: '' })).toThrow();
    });

    it('should reject term over 500 characters', () => {
      expect(() => SearchPersonsSchema.parse({ term: 'a'.repeat(501) })).toThrow();
    });
  });
```
> NOTE on revert-proof strength: because Zod strips unknown keys by default, the "NOT carry" test passes on BOTH new and old schema for the *stripping* assertion — so on its own it is NOT a strong revert-proof. The STRONG unit revert-proof is the `fields`/`cursor` ACCEPTANCE test combined with the integration assertions in S.3.d. On old src, `result.fields`/`result.cursor` would be `undefined` (old schema lacks them) → the acceptance `expect(result.fields).toBe('email,phone')` FAILS. Keep both tests.

**`tests/unit/schemas/deals.test.ts` — `describe('SearchDealsSchema')` (lines 260-302): ADD acceptance for `fields` + `cursor`.** Insert a new `it` after the "all optional filters" test (after line 289):
```ts
    it('should accept fields and cursor (v2 search)', () => {
      const result = SearchDealsSchema.parse({ term: 'x', fields: 'title,notes', cursor: 'abc' });
      expect(result.fields).toBe('title,notes');
      expect(result.cursor).toBe('abc');
    });
```

**`tests/unit/schemas/organizations.test.ts` — `describe('SearchOrganizationsSchema')` (around lines 175-199): ADD acceptance for `fields` + `cursor`.** Insert after the "all optional filters" test (after line 194):
```ts
    it('should accept fields and cursor (v2 search)', () => {
      const result = SearchOrganizationsSchema.parse({ term: 'x', fields: 'name,address', cursor: 'abc' });
      expect(result.fields).toBe('name,address');
      expect(result.cursor).toBe('abc');
    });
```

### S.3.b INTEGRATION wire-shape guards — deals
**`tests/integration/tools/deals.test.ts` — `describe('searchDeals')` (lines 204-247): FLIP.**
- Line 218-225 "should use v1 API for search" asserts `url).toContain('/v1/itemSearch')` → **this is the FALSE-GREEN test. Replace it** with a v2 path + version assertion:
```ts
    it('should call the v2 /deals/search endpoint (not v1 itemSearch)', async () => {
      const mockFn = mockApiSuccess({ items: [] });

      await searchDeals({ term: 'enterprise' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals/search');
      expect(url).not.toContain('/itemSearch');
      expect(url).not.toContain('/v1/');
    });
```
- In "should pass search parameters" (lines 227-246): KEEP `term`, `person_id`, `organization_id`(=2), `status`, `exact_match`, `limit`. ADD `fields` + `cursor`. The `org_id: 2 → organization_id=2` assertion (line 243) STAYS (still correct in v2). New body:
```ts
    it('should pass v2 search parameters', async () => {
      const mockFn = mockApiSuccess({ items: [] });

      await searchDeals({
        term: 'test',
        fields: 'title,notes',
        person_id: 1,
        org_id: 2,
        status: 'open',
        exact_match: true,
        limit: 25,
        cursor: 'cur1',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=test');
      expect(url).toContain('fields=title%2Cnotes');
      expect(url).toContain('person_id=1');
      expect(url).toContain('organization_id=2');
      expect(url).toContain('status=open');
      expect(url).toContain('exact_match=true');
      expect(url).toContain('limit=25');
      expect(url).toContain('cursor=cur1');
      expect(url).not.toContain('item_types');
    });
```
- ADD a pagination-parse test:
```ts
    it('should parse next_cursor from v2 search response', async () => {
      mockFetch({ data: { items: [] }, additional_data: { next_cursor: 'NEXT' } });

      const result = await searchDeals({ term: 'x' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.next_cursor).toBe('NEXT');
      expect(parsed.pagination.has_more).toBe(true);
    });
```
(`mockFetch` is already imported at line 16-21.)

### S.3.c INTEGRATION wire-shape guards — organizations
**`tests/integration/tools/organizations.test.ts` — `describe('searchOrganizations')` (lines 141-163): FLIP.**
- Replace "should use v1 API for search" (lines 154-162, asserts `/v1/itemSearch`) with:
```ts
    it('should call the v2 /organizations/search endpoint (not v1 itemSearch)', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchOrganizations } = await getOrganizationsTools();

      await searchOrganizations({ term: 'acme' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/organizations/search');
      expect(url).not.toContain('/itemSearch');
      expect(url).not.toContain('/v1/');
    });
```
- ADD a params test + pagination test:
```ts
    it('should pass term, fields, and cursor', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchOrganizations } = await getOrganizationsTools();

      await searchOrganizations({ term: 'acme corp', fields: 'name,address', cursor: 'cur1', exact_match: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=acme+corp');
      expect(url).toContain('fields=name%2Caddress');
      expect(url).toContain('cursor=cur1');
      expect(url).toContain('exact_match=true');
      expect(url).not.toContain('item_types');
    });

    it('should parse next_cursor from v2 search response', async () => {
      mockFetch({ data: { items: [] }, additional_data: { next_cursor: 'NEXT' } });
      const { searchOrganizations } = await getOrganizationsTools();

      const result = await searchOrganizations({ term: 'x' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });
```

### S.3.d INTEGRATION wire-shape guards — persons
**`tests/integration/tools/persons.test.ts` — `describe('searchPersons')` (lines 166-207): FLIP.**
- Replace "should use v1 API for search" (lines 179-187, `/v1/itemSearch`) with:
```ts
    it('should call the v2 /persons/search endpoint (not v1 itemSearch)', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchPersons } = await getPersonsTools();

      await searchPersons({ term: 'test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/persons/search');
      expect(url).not.toContain('/itemSearch');
      expect(url).not.toContain('/v1/');
    });
```
- Replace "should pass search parameters" (lines 189-206) — it currently passes `search_by_email`/`search_by_phone` and asserts `search_by_email=1`/`search_by_phone=0` (lines 204-205). This is the FALSE-GREEN test. New body asserts `fields` and that the old boolean keys are NOT on the wire:
```ts
    it('should pass v2 search parameters (fields, organization_id, cursor)', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchPersons } = await getPersonsTools();

      await searchPersons({
        term: 'jane',
        fields: 'email,phone',
        org_id: 5,
        exact_match: true,
        cursor: 'cur1',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=jane');
      expect(url).toContain('fields=email%2Cphone');
      expect(url).toContain('organization_id=5');
      expect(url).toContain('exact_match=true');
      expect(url).toContain('cursor=cur1');
      // revert-proof: old boolean params must NOT appear on the wire
      expect(url).not.toContain('search_by_email');
      expect(url).not.toContain('search_by_phone');
      expect(url).not.toContain('item_types');
    });

    it('should parse next_cursor from v2 search response', async () => {
      mockFetch({ data: { items: [] }, additional_data: { next_cursor: 'NEXT' } });
      const { searchPersons } = await getPersonsTools();

      const result = await searchPersons({ term: 'x' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });
```

## S.4 SHARED-HELPER additions (LANE S OWNS THESE — P and F must not touch)
Edit `tests/helpers/fixtures.ts` (`createSearchResultsFixture` already produces the v1-style `{items:[{result_score,item}]}` which is ALSO the v2 shape — keep it). ADD ONE helper to make pagination-bearing search responses ergonomic so future lanes/tests reuse it:
```ts
/**
 * Creates a v2 search response body: { items: [...] } plus optional next_cursor.
 * v2 /{entity}/search returns data.items[] and additional_data.next_cursor.
 */
export function createV2SearchResponse(items: unknown[], nextCursor?: string) {
  return {
    data: { items: items.map((item, i) => ({ result_score: 1 - i * 0.1, item })) },
    additional_data: nextCursor ? { next_cursor: nextCursor } : undefined,
  };
}
```
This is OPTIONAL for S's own tests (S inlines `mockFetch({data:{items:[]},additional_data:{next_cursor:'NEXT'}})` above), but adding it here keeps all shared-fixture churn inside Lane S. No edit to `tests/helpers/mockFetch.ts` is required (its `MockResponseOptions.additional_data.next_cursor` field already exists, line 17). If you find you need nothing in fixtures.ts, you may skip this addition entirely — just confirm in the PR that helpers were untouched so P/F stay clean.

## S.5 Lane-S adversarial revert-proof (reviewer runs)
Keep all new S tests; `git checkout origin/main -- src/tools/deals.ts src/tools/persons.ts src/tools/organizations.ts src/schemas/deals.ts src/schemas/persons.ts src/schemas/organizations.ts`; run `npm test`. MUST FAIL on:
- deals/persons/orgs integration: `url).toContain('/api/v2/<entity>/search')` (old code calls `/v1/itemSearch`).
- persons integration: `url).not.toContain('search_by_email')` (old code emits it).
- persons unit: `expect(result.fields).toBe('email,phone')` (old schema strips `fields` → undefined).
- deals/orgs unit: `expect(result.fields)...`/`expect(result.cursor)...` (old schema lacks them).

---

# LANE P — Project archive + project tasks (single file pair)

**Owner of:** `src/tools/projects.ts`, `src/schemas/projects.ts`, `tests/unit/schemas/projects.test.ts`, `tests/integration/tools/projects.test.ts`. **MUST NOT touch `tests/helpers/*`** — use the inline `projectFixture`/`createProjectsFixture` already at the top of the integration test (lines 14-26) and inline task fixtures.

**Headline:** (1) `archiveProject` → `POST /projects/{id}/archive` with NO body (was `PATCH /projects/{id}` `{status:'archived'}`). (2) `listProjectTasks` → v2 `GET /tasks?project_id={id}` with cursor pagination (was v1 `GET /projects/{id}/tasks` with offset).

## P.1 Spec citations (verified against `docs/api/openapi-v2.yaml`)

**`/projects/{id}/archive` — line 20705.** Method: **POST** (line 20706), operationId `archiveProject`. Parameters: ONLY `id` (in path, integer) — **there is NO `requestBody`** (confirm: lines 20717-20723 list only the path param, then jump to `responses`). So the call sends an EMPTY body. Response (line 20724+): `{ success, data: { id, title, description, status, board_id, phase_id, owner_id, …, archive_time, custom_fields } }` — same `Project` object shape as update.
> SPEC SURPRISE vs current code: current `archiveProject` does `PATCH /projects/{id}` with `{status:'archived'}`. v2 has a dedicated `POST …/archive` with no body. The issue is correct; implement POST + empty body.

**`/tasks` — line 20984.** Method: GET (line 20985), operationId `getTasks`, tags include `Beta`. Query params: `cursor` (line 20999), `limit` (line 21005, default 100 max 500), `is_done`, `is_milestone`, `assignee_id`, **`project_id` (integer, line 21029** — "only tasks belonging to this project are returned"), `parent_task_id`. Response (line 21041+): `{ success, data: [ {id,title,project_id,is_done,...} ], additional_data: { next_cursor } }`.
> SPEC CONFIRMATIONS vs issue text: v2 `/tasks` EXISTS and takes `project_id` as a query filter (confirmed line 21029). v2 has **NO `/projects/{id}/tasks`** — grep of openapi-v2.yaml for `/projects/{id}/tasks` returns zero hits (only `/projects/{id}`, `/projects/{id}/archive`, `/projects/{id}/permittedUsers`, `/projects/{id}/changelog` exist). For contrast, the v1 spec (`openapi-v1.yaml:30344`) DOES have `/projects/{id}/tasks` — that's the legacy path being abandoned. Issue is correct.

## P.2 Source edits — `src/tools/projects.ts`

### P.2.a Imports (lines 24-29)
After this lane, `buildPaginationParamsV1` and `extractPaginationV1` are NO LONGER USED in this file (the only users were `listProjectTasks`). REMOVE them from the import. New import block:
```ts
import {
  buildPaginationParamsV2,
  extractPaginationV2,
} from "../utils/pagination.js";
```
(Leave `pagination.ts` itself untouched — leads/notes/mail still import V1 helpers. This is only the projects.ts import list.)

### P.2.b `archiveProject` (lines 199-217)
Replace the handler (drop the stale comment at 196-197 referencing PATCH/issue #14). New:
```ts
/**
 * Archive a project via the dedicated v2 POST /projects/{id}/archive endpoint (no body).
 */
export async function archiveProject(params: ArchiveProjectParams) {
  const client = getClient();

  const response = await client.post<unknown>(`/projects/${params.id}/archive`, {});

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Project ${params.id} archived`,
        data: response.data,
      }, null, 2),
    }],
  };
}
```
Note: `client.post(endpoint, body)` requires a body arg (type `Record<string,unknown>`); pass `{}` → serializes to `"{}"`. The integration test asserts the parsed body equals `{}` (empty object), method POST, path `/projects/{id}/archive`.

### P.2.c `listProjectTasks` (lines 252-276)
Replace the handler (and drop the "v1 endpoint" comment at 250-251). New:
```ts
/**
 * List tasks belonging to a project via v2 GET /tasks?project_id={id} (cursor pagination).
 */
export async function listProjectTasks(params: ListProjectTasksParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
  queryParams.set("project_id", String(params.id));

  const response = await client.get<unknown[]>("/tasks", queryParams);

  if (!response.success) {
    return mcpErrorResult(response);
  }

  const tasks = response.data || [];
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("task", tasks.length, pagination.has_more),
        data: tasks,
        pagination,
      }, null, 2),
    }],
  };
}
```
(Default version is v2 — drop the `"v1"` 3rd arg. `createListSummary` already imported at line 31.)

### P.2.d Tool inputSchema for `pipedrive_list_project_tasks` (lines 406-419)
Change the `start` property (v1 offset) to `cursor` (v2). Replace the `properties` block:
```ts
      properties: {
        id: { type: "number", description: "Project ID" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100, default 50)" },
      },
```
(archive tool inputSchema at lines 393-404 needs NO change — still just `id`. Optionally update the archive tool `description` at line 394 to drop "by setting its status to archived" → "Archive a project." since v2 uses a dedicated endpoint; cosmetic.)

## P.3 Source edits — `src/schemas/projects.ts`

### P.3.a Imports (lines 6-12)
`PaginationParamsV1Schema` is used ONLY by `ListProjectTasksSchema`. After the change it's unused here → REMOVE it from this import (do NOT remove from common.ts; leads/notes/mail use it). New import:
```ts
import {
  PaginationParamsSchema,
  IdParamSchema,
  SearchTermSchema,
  DateStringSchema,
} from "./common.js";
```

### P.3.b `ListProjectTasksSchema` (lines 122-126)
Switch from V1 (`start`/`limit` offset) to V2 (`cursor`/`limit`). Replace:
```ts
/**
 * List project tasks parameters (v2 GET /tasks?project_id=)
 */
export const ListProjectTasksSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("Project ID"),
});
```
`PaginationParamsSchema` (common.ts) = `{ cursor?: string, limit: number default 50, max 100 }`. So `start` is gone; `cursor` is in. Type export at line 138 re-infers — no change.

## P.4 Test edits

### P.4.a UNIT — `tests/unit/schemas/projects.test.ts` — `describe('ListProjectTasksSchema')` (lines 302-331): FLIP
Currently FALSE-GREEN: line 313-318 passes `start: 50` and asserts `result.start).toBe(50)`, and line 328-330 rejects negative `start`. Under v2 there is no `start`. Replace the whole describe:
```ts
  describe('ListProjectTasksSchema', () => {
    it('should require id', () => {
      expect(() => ListProjectTasksSchema.parse({})).toThrow();
    });

    it('should apply limit default with id', () => {
      const result = ListProjectTasksSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should accept id, cursor, and limit (v2)', () => {
      const result = ListProjectTasksSchema.parse({ id: 1, cursor: 'c1', limit: 25 });
      expect(result.id).toBe(1);
      expect(result.cursor).toBe('c1');
      expect(result.limit).toBe(25);
    });

    it('should reject string id', () => {
      expect(() => ListProjectTasksSchema.parse({ id: '1' })).toThrow();
    });

    // revert-proof: v2 limit cap is 100 (v1 schema allowed up to 500)
    it('should reject limit over 100 (v2 cap)', () => {
      expect(() => ListProjectTasksSchema.parse({ id: 1, limit: 101 })).toThrow();
    });

    // revert-proof: v1 offset param `start` is gone — Zod strips it (assert acceptance of cursor instead)
    it('should strip the removed v1 start param', () => {
      const result = ListProjectTasksSchema.parse({ id: 1, start: 50 } as Record<string, unknown>);
      expect((result as Record<string, unknown>).start).toBeUndefined();
    });
  });
```
> Revert-proof strength: the STRONG unit guard is "reject limit over 100" — old `PaginationParamsV1Schema` allows up to 500, so `parse({id:1,limit:101})` SUCCEEDS on old src → `expect(...).toThrow()` FAILS on old src. Good. (The `start` strip test is weak alone since both versions strip unknowns; rely on the limit-cap test + integration path test.)

### P.4.b INTEGRATION — `tests/integration/tools/projects.test.ts`
**`describe('archiveProject')` (lines 338-361): FLIP.** Line 350-360 "should send PATCH request … with status archived" asserts `options.method).toBe('PATCH')` and body `{status:'archived'}` — FALSE-GREEN. Replace that `it` (keep the "should return archived summary" test at 339-348, it still passes):
```ts
    it('should POST to the v2 /projects/{id}/archive endpoint with an empty body', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { archiveProject } = await getProjectsTools();

      await archiveProject({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/projects/1/archive');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({});
      // revert-proof: must NOT be the old PATCH-with-status call
      expect(options.method).not.toBe('PATCH');
      expect(JSON.parse(options.body)).not.toHaveProperty('status');
    });
```

**`describe('listProjectTasks')` (lines 425-470): FLIP.**
- Line 441-450 "should call v1 API endpoint (not v2)" asserts `/v1/projects/1/tasks` and `not.toContain('/api/v2/')` — FALSE-GREEN. Replace:
```ts
    it('should call the v2 /tasks endpoint with project_id filter (not v1 /projects/{id}/tasks)', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProjectTasks } = await getProjectsTools();

      await listProjectTasks({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/tasks');
      expect(url).toContain('project_id=1');
      expect(url).not.toContain('/v1/');
      expect(url).not.toContain('/projects/1/tasks');
    });
```
- Line 452-460 "should handle v1 pagination with has_more=true" uses `paginationFixtures.v1WithMore` and passes `start: 0`. Replace with a v2 cursor pagination test:
```ts
    it('should handle v2 cursor pagination (has_more=true)', async () => {
      mockFetch({ data: [{ id: 1, project_id: 1 }], additional_data: { next_cursor: 'NEXT' } });
      const { listProjectTasks } = await getProjectsTools();

      const result = await listProjectTasks({ id: 1, cursor: 'c0' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('NEXT');
    });

    it('should send the cursor on the wire', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProjectTasks } = await getProjectsTools();

      await listProjectTasks({ id: 1, cursor: 'abc' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=abc');
    });
```
The "should return tasks with summary" test (lines 426-439) uses `paginationFixtures.v1NoMore` for `additional_data`; v2 `extractPaginationV2` only reads `additional_data.next_cursor`, so `v1NoMore` (which has `pagination:{more_items_in_collection:false}` but no `next_cursor`) yields `has_more:false` — the test asserts only `'2 tasks'` and length 2, so it STILL PASSES. You MAY leave it, but for cleanliness change its `additional_data` to `paginationFixtures.v2NoMore` (which is `undefined`). Keep the import of `paginationFixtures` (still used by listProjects tests). The "should return isError on API error" test (462-469) is unchanged.

> `mockFetch` and `mockApiSuccess` are already imported (lines 7-12); `paginationFixtures` too. No new imports, no helper edits.

## P.5 Lane-P adversarial revert-proof (reviewer runs)
Keep new P tests; `git checkout origin/main -- src/tools/projects.ts src/schemas/projects.ts`; `npm test`. MUST FAIL on:
- archive integration: `url).toContain('/api/v2/projects/1/archive')` + `options.method).toBe('POST')` + body `{}` (old code does PATCH `/projects/1` `{status:'archived'}`).
- tasks integration: `url).toContain('/api/v2/tasks')` + `project_id=1` (old code calls `/v1/projects/1/tasks`).
- tasks unit: `parse({id:1,limit:101})` toThrow (old v1 schema allows ≤500 → no throw).

---

# LANE F — Fields → v2 (add product/activity/project, drop v1 branch)

**Owner of:** `src/tools/fields.ts`, `src/schemas/fields.ts` (likely NO change — see F.2.c), `tests/unit/schemas/fields.test.ts`, `tests/integration/tools/fields.test.ts`. **MUST NOT touch `tests/helpers/*`** — use the existing `createFieldFixture` + `paginationFixtures` already imported in the fields integration test (line 12) and inline arrays.

**Headline:** extend `FIELDS_V2_ENTITY_TYPES` to all six entities and collapse `getField` to always-v2, removing the v1 pagination branch and the now-unused v1 imports.

## F.1 Spec citations (verified against `docs/api/openapi-v2.yaml`) — INCLUDING A MAJOR SURPRISE

All six field endpoints EXIST in v2 with `cursor`+`limit` pagination and `additional_data.next_cursor`:
- `/organizationFields` — line 11667 (params: `include_fields`, `limit`, `cursor`)
- `/dealFields` — line 5981
- `/personFields` — line 9174
- `/productFields` — line 15282 (params: `include_fields` enum `ui_visibility`, `limit`, `cursor`)
- `/activityFields` — line 1399 (params: `include_fields`, `limit`, `cursor`)
- `/projectFields` — line 18229 (tags include `Beta`; params: `limit`, `cursor`)

So the issue's premise holds: v2 endpoints exist for ALL six → the v1 branch CAN be collapsed.

> **SPEC SURPRISE #1 (loud — read before coding):** In `openapi-v2.yaml`, EVERY field endpoint's `data[]` item uses the schema `{ field_name, field_code, field_type, is_custom_field, is_optional_response_field, options?, subfields?, … }`. The key field is **`field_code`**, NOT `key` (dealFields data item line ~6049 `field_code:`; personFields ~9241 `field_code:`; org line 11733; product 15341; activity 1457; project 18283). HOWEVER the CURRENT shipped, merged code (`getField` line 169) matches on `f.key === params.key`, and the existing, passing v2 list handlers/tests for deal/person/org all use `key` (via `createFieldFixture`, which emits `key`). This means EITHER the live v2 API actually returns `key` (and the vendored spec's `field_code` is aspirational/renamed) OR the field module is already latently mismatched against the spec for the THREE entities that already use v2.
>
> **DECISION: do NOT change the `.key`/`key` matching in this lane.** Reconciling `key` vs `field_code` is OUT OF SCOPE for #47 (it would rewrite already-shipped, already-"working" v2 deal/person/org handlers and their fixtures — a separate concern). Lane F's job is narrowly to move product/activity/project onto the SAME v2 path the other three already use, so all six behave identically. After this lane, product/activity/project will match on `key` exactly as deal/person/org do today. If the live API truly uses `field_code`, that is a pre-existing bug affecting all six equally and should be filed separately — flag it in the PR description, do NOT fix it here.

> **SPEC SURPRISE #2:** The v1 spec (`openapi-v1.yaml`) has `/productFields` (line 28349) and `/activityFields` (line 140) but **NO `/projectFields`** (grep returns zero). So the CURRENT code's v1 branch for `entity_type:'project'` (`endpointMap.project='/projectFields'` called with `version='v1'`) hits a NONEXISTENT v1 endpoint — it only "works" in tests because fetch is mocked. Moving `project` to v2 is therefore strictly a fix (v1 projectFields never existed). This reinforces collapsing the branch.

Conclusion: collapse the v1 branch for ALL six. No entity must stay on v1.

## F.2 Source edits — `src/tools/fields.ts`

### F.2.a Imports (lines 18-23)
After collapsing, `buildPaginationParamsV1` and `extractPaginationV1` are unused in this file. REMOVE them. New:
```ts
import {
  buildPaginationParamsV2,
  extractPaginationV2,
} from "../utils/pagination.js";
```
(Do NOT touch pagination.ts.)

### F.2.b `FIELDS_V2_ENTITY_TYPES` (line 30) + `getField` (lines 123-196)
The `FIELDS_V2_ENTITY_TYPES` set becomes redundant once every entity is v2 — simplest correct change is to delete it and the `useV2` conditional. Replace from line 27 (the comment block above the set) through the end of `getField`'s pagination loop. Concretely:

1. DELETE the `FIELDS_V2_ENTITY_TYPES` declaration (lines 27-30, the comment + `const ... = new Set([...])`).
2. In `getField`, KEEP `endpointMap` (lines 127-134) and the unknown-entity guard (136-144) AS-IS — all six map to their `/*Fields` v2 endpoint.
3. REMOVE the `useV2` line (146) and collapse the do/while to always-v2. Replace the body from line 146 to 176 with:
```ts
  // Paginate through all pages (v2 cursor) until the field is found or pages are exhausted.
  let cursor: string | undefined;
  let field: { key: string; [k: string]: unknown } | undefined;

  do {
    const queryParams = buildPaginationParamsV2(cursor);

    const response = await client.get<Array<{ key: string; [k: string]: unknown }>>(
      endpoint,
      queryParams,
    );

    if (!response.success || !response.data) {
      return mcpErrorResult(response);
    }

    field = response.data.find(f => f.key === params.key);

    const pagination = extractPaginationV2(response);
    cursor = pagination.has_more ? pagination.next_cursor : undefined;
  } while (!field && cursor);
```
(Drop the `version` arg entirely → defaults to v2, so all six now hit `/api/v2/*Fields`.) Update the doc comment at lines 119-122 to: "Get a single field by key — paginates v2 field pages to find the field. All entity types use the v2 endpoint." Also update the file header comment (lines 1-5) line "v1 for product/activity/project" → "all entity types use v2".

> The `getField` `.find(f => f.key === ...)` stays (see SURPRISE #1). The `endpointMap` already contains all six entries — no change needed there.

### F.2.c `src/schemas/fields.ts` — NO CHANGE EXPECTED
`FieldEntityTypeSchema` (line 11) already enumerates all six entities; `GetFieldSchema` already accepts all six (verified by the existing unit test at fields.test.ts:113-119). The list schemas are v2 `PaginationParamsSchema` already. So **this lane likely edits no schema file.** Confirm and state so in the PR. (If you discover a missing entity in the enum, add it — but it's already complete.)

## F.3 Test edits — `tests/integration/tools/fields.test.ts`

### F.3.a FLIP the false-green v1 test (lines 226-245)
The test "should use v1 API endpoint for product/activity/project entity types" asserts `/v1/productFields`, `/v1/activityFields`, `/v1/projectFields`. This is now WRONG — these go to v2. Replace that entire `it` with a v2 assertion:
```ts
    it('should use v2 API endpoint for product/activity/project entity types', async () => {
      const { getField } = await getFieldsTools();

      let mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'product', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/productFields');
      expect(mockFn.mock.calls[0][0]).not.toContain('/v1/');

      vi.unstubAllGlobals();
      mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'activity', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/activityFields');
      expect(mockFn.mock.calls[0][0]).not.toContain('/v1/');

      vi.unstubAllGlobals();
      mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'project', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/projectFields');
      expect(mockFn.mock.calls[0][0]).not.toContain('/v1/');
    });
```
(`vi` is already imported at line 5; `mockApiSuccess` at line 8.)

The existing test "should use v2 API endpoint for deal/person/organization entity types" (lines 205-224) is unchanged and still passes.

### F.3.b ADD a v2 cursor-pagination test for a product/activity/project entity (revert-proof for the loop)
The current page-2 regression test (lines 256-285) only exercises `deal`. Add one that proves product/activity/project now paginate via v2 cursor (on old src they'd use the v1 offset branch — `buildPaginationParamsV1(parseInt(cursor))` — and the URL would carry `/v1/` and `start=`, failing these assertions):
```ts
    it('should paginate product fields via v2 cursor across pages', async () => {
      const page1 = Array.from({ length: 50 }, (_, i) => ({
        ...createFieldFixture(`p_${i}`, `P ${i}`, 'varchar'), key: `p_${i}`,
      }));
      const page2 = [{ ...createFieldFixture('target', 'Target Field', 'varchar'), key: 'target' }];

      mockFetch([
        { data: page1, additional_data: { next_cursor: 'page2cursor' } },
        { data: page2, additional_data: undefined },
      ]);
      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'product', key: 'target' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.name).toBe('Target Field');

      const fetchMock = vi.mocked(global.fetch);
      expect(fetchMock.mock.calls.length).toBe(2);
      // both calls must be v2 and carry a v2 cursor on page 2 (not a v1 ?start=)
      expect(fetchMock.mock.calls[0][0]).toContain('/api/v2/productFields');
      expect(fetchMock.mock.calls[1][0]).toContain('cursor=page2cursor');
      expect(fetchMock.mock.calls[1][0]).not.toContain('start=');
    });
```
(`mockFetch`, `createFieldFixture`, `vi` all already imported.)

## F.4 Test edits — `tests/unit/schemas/fields.test.ts`
No schema changed (F.2.c), so unit schema tests need NO change. The existing test already asserts all six entity types are accepted (lines 113-119). Leave the file. (If you DID add an enum entry in F.2.c, add a matching acceptance assertion — but expected: no change.)

## F.5 Lane-F adversarial revert-proof (reviewer runs)
Keep new F tests; `git checkout origin/main -- src/tools/fields.ts`; `npm test`. MUST FAIL on:
- "should use v2 API endpoint for product/activity/project" → old code routes these to `/v1/*Fields` → `toContain('/api/v2/productFields')` FAILS.
- "should paginate product fields via v2 cursor" → old code's v1 branch builds `?start=` and hits `/v1/productFields` → `toContain('/api/v2/productFields')` and `cursor=page2cursor` / `not.toContain('start=')` FAIL.

---

# VERIFICATION (all lanes)

Build + test from the worktree root:
```
npm run build      # tsc — note: this does NOT type-check tests (tsconfig excludes **/*.test.ts)
npm test           # vitest run — the real correctness gate is the new unit + integration guards
npm run lint       # eslint src/ — ensure removed imports don't leave unused-import lint errors
```
A green `npm test` is necessary but NOT sufficient (see §0.2). The true gate is each lane's adversarial revert-proof (§S.5 / §P.5 / §F.5): the reviewer reverts that lane's `src/` files to origin/main while KEEPING the new tests and confirms the new guards FAIL. If any guard still passes on reverted src, that guard is worthless and must be strengthened before merge.

Lint watch-outs (unused imports after edits):
- Lane P removes `buildPaginationParamsV1`/`extractPaginationV1` from `src/tools/projects.ts` and `PaginationParamsV1Schema` from `src/schemas/projects.ts`.
- Lane F removes `buildPaginationParamsV1`/`extractPaginationV1` from `src/tools/fields.ts` and deletes `FIELDS_V2_ENTITY_TYPES`.
Run `npm run build` after edits — `tsc` flags unused locals if `noUnusedLocals` is on; regardless, leaving an unused import is a lint failure.

---

# WRITE-DISJOINTNESS / PARALLEL-SAFETY

| File | Lane S | Lane P | Lane F |
|---|---|---|---|
| src/tools/deals.ts, persons.ts, organizations.ts | ✏️ | | |
| src/schemas/deals.ts, persons.ts, organizations.ts | ✏️ | | |
| src/tools/projects.ts, src/schemas/projects.ts | | ✏️ | |
| src/tools/fields.ts (src/schemas/fields.ts likely untouched) | | | ✏️ |
| tests/unit/schemas/{deals,persons,organizations}.test.ts | ✏️ | | |
| tests/integration/tools/{deals,persons,organizations}.test.ts | ✏️ | | |
| tests/unit/schemas/projects.test.ts, tests/integration/tools/projects.test.ts | | ✏️ | |
| tests/unit/schemas/fields.test.ts (no change), tests/integration/tools/fields.test.ts | | | ✏️ |
| tests/helpers/fixtures.ts, tests/helpers/mockFetch.ts | ✏️ (sole owner) | ❌ | ❌ |
| src/schemas/common.ts, src/tools/index.ts, src/utils/pagination.ts | ❌ READ-ONLY | ❌ | ❌ |

No two lanes write the same file. Shared test helpers are exclusively Lane S. **The three lanes are write-disjoint and SAFE TO IMPLEMENT IN PARALLEL.**
