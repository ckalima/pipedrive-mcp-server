# Issue #46 - Plan: Remove invalid `all_not_deleted` from deals status enum

## 1. Issue + one-line summary

**Issue #46:** `status=all_not_deleted` is not a valid Pipedrive v2 value for the deals `status` query parameter.

**Summary:** Remove the non-existent `all_not_deleted` value from the deal status enum (Zod schema + both tool inputSchemas) so the exposed enum matches the v2 spec (`open` / `won` / `lost` / `deleted`). This is an **enum-only correctness fix** - no handler logic changes are required, because the correct way to get "all not deleted" deals in v2 is to **omit** the `status` parameter, which the handlers already do.

---

## 2. Root cause

The value `all_not_deleted` is exposed in three places, none of which correspond to a real v2 enum value:

- **`src/schemas/common.ts:68`** - the shared Zod enum:
  ```ts
  export const DealStatusSchema = z.enum(["open", "won", "lost", "deleted", "all_not_deleted"])
    .describe("Deal status filter");
  ```
  This schema is imported and reused by BOTH `ListDealsSchema` (`src/schemas/deals.ts:9`, used at line 35) and `SearchDealsSchema` (used at line 142). Fixing this single enum fixes the Zod-level validation for both list and search at once.

- **`src/tools/deals.ts:265`** - the hand-written JSON Schema `inputSchema.enum` for `pipedrive_list_deals`:
  ```ts
  status: { type: "string", enum: ["open", "won", "lost", "deleted", "all_not_deleted"], description: "Filter by deal status" },
  ```

- **`src/tools/deals.ts:357`** - the hand-written JSON Schema `inputSchema.enum` for `pipedrive_search_deals`:
  ```ts
  status: { type: "string", enum: ["open", "won", "lost", "deleted", "all_not_deleted"], description: "Filter by status" },
  ```

  (The MCP `inputSchema` enums are maintained separately from the Zod schemas and are NOT derived from them, so they must be edited independently.)

**Handler already omits `status` when undefined - confirmed:**

- `src/tools/deals.ts:39` (`listDeals`): `if (params.status) queryParams.set("status", params.status);`
- `src/tools/deals.ts:194` (`searchDeals`): `if (params.status) queryParams.set("status", params.status);`

Because both handlers only set the `status` query param when truthy, the existing behavior for "all not deleted deals" is already achieved by simply not passing a status. Removing `all_not_deleted` therefore requires NO handler change.

**Note on what `all_not_deleted` would do today:** Under v2's stricter validation, sending `status=all_not_deleted` is not in the accepted enum and would be rejected by the API (likely HTTP 400). So the value is not merely redundant - it is actively invalid. Removing it is a correctness fix.

---

## 3. v2 target shape (authoritative spec)

From the vendored spec `docs/api/openapi-v2.yaml` (v2.0.0), the `GET /deals` `status` query parameter, **lines 1848-1857**:

```yaml
        - in: query
          name: status
          schema:
            type: string
            enum:
              - open
              - won
              - lost
              - deleted
          description: 'Only fetch deals with a specific status. If omitted, all not deleted deals are returned. If set to deleted, deals that have been deleted up to 30 days ago will be included. Multiple statuses can be included as a comma separated array. If filter_id is provided, this is ignored.'
```

Key facts from the spec:
- The valid enum is exactly: `open`, `won`, `lost`, `deleted`. There is **no** `all_not_deleted`.
- The description explicitly states: **"If omitted, all not deleted deals are returned."** This is the v2 mechanism that `all_not_deleted` was incorrectly trying to express as an enum value.

(Context: the deals list operation block begins around line 1800 of the same file; the `status` param is the block quoted above.)

---

## 4. Changes (file-by-file, precise)

> **Zod version:** main is on Zod 3.25. Write all schema code in **Zod 3** syntax (`z.enum([...])`). Do NOT migrate to Zod 4 - a separate pending PR (#16 PR B) handles that later.

### 4.1 `src/schemas/common.ts` (line 68)

Remove `"all_not_deleted"` from the enum. Optionally tighten the description to point users at omission.

**Before:**
```ts
export const DealStatusSchema = z.enum(["open", "won", "lost", "deleted", "all_not_deleted"])
  .describe("Deal status filter");
```

**After:**
```ts
export const DealStatusSchema = z.enum(["open", "won", "lost", "deleted"])
  .describe("Deal status filter (omit to return all non-deleted deals)");
```

(The `.describe()` text change is optional polish; the load-bearing change is dropping `"all_not_deleted"` from the enum array. Keep the description change if it does not conflict with any assertion - no test asserts on this description string.)

### 4.2 `src/tools/deals.ts` (line 265 - `pipedrive_list_deals` inputSchema)

**Before:**
```ts
status: { type: "string", enum: ["open", "won", "lost", "deleted", "all_not_deleted"], description: "Filter by deal status" },
```

**After:**
```ts
status: { type: "string", enum: ["open", "won", "lost", "deleted"], description: "Filter by deal status (omit to return all non-deleted deals)" },
```

### 4.3 `src/tools/deals.ts` (line 357 - `pipedrive_search_deals` inputSchema)

**Before:**
```ts
status: { type: "string", enum: ["open", "won", "lost", "deleted", "all_not_deleted"], description: "Filter by status" },
```

**After:**
```ts
status: { type: "string", enum: ["open", "won", "lost", "deleted"], description: "Filter by status (omit to return all non-deleted deals)" },
```

(Description tweaks are optional; the required change is removing `"all_not_deleted"` from each `enum` array.)

### 4.4 No handler logic change

**Explicitly: do NOT edit any handler body.** `listDeals` (deals.ts:39) and `searchDeals` (deals.ts:194) already use `if (params.status) queryParams.set("status", params.status)`, so omitting `status` already produces "all non-deleted deals" per the v2 spec. Narrowing the enum simply prevents callers from supplying a value the API would reject.

### 4.5 Schemas NOT to change (in scope of deals.ts but intentionally untouched)

- `CreateDealSchema.status` (`src/schemas/deals.ts:80`) and `UpdateDealSchema.status` (`src/schemas/deals.ts:114`) already use inline `z.enum(["open", "won", "lost"])` and never contained `all_not_deleted`. Leave them as-is. (Their corresponding inputSchema enums at deals.ts:306 and deals.ts:334 are likewise already `["open","won","lost"]`.) These confirm the narrowing direction is correct.

---

## 5. Test changes (flip every false-green assertion)

There are exactly **two** false-green assertions that currently assert `all_not_deleted` is VALID. Both must be corrected, and a negative assertion should be added so the new (correct) behavior is locked in.

### 5.1 `tests/unit/schemas/common.test.ts` (lines 221-233, the `DealStatusSchema` describe block)

**Current (false-green) - line 223 includes `'all_not_deleted'`:**
```ts
describe('DealStatusSchema', () => {
  it('should accept all valid statuses', () => {
    const statuses = ['open', 'won', 'lost', 'deleted', 'all_not_deleted'];
    statuses.forEach((status) => {
      const result = DealStatusSchema.parse(status);
      expect(result).toBe(status);
    });
  });

  it('should reject invalid status', () => {
    expect(() => DealStatusSchema.parse('pending')).toThrow();
  });
});
```

**Corrected:**
```ts
describe('DealStatusSchema', () => {
  it('should accept all valid statuses', () => {
    const statuses = ['open', 'won', 'lost', 'deleted'];
    statuses.forEach((status) => {
      const result = DealStatusSchema.parse(status);
      expect(result).toBe(status);
    });
  });

  it('should reject invalid status', () => {
    expect(() => DealStatusSchema.parse('pending')).toThrow();
  });

  it('should reject all_not_deleted (not a valid v2 status)', () => {
    expect(() => DealStatusSchema.parse('all_not_deleted')).toThrow();
  });
});
```

### 5.2 `tests/unit/schemas/deals.test.ts` (lines 50-56, the `ListDealsSchema` status test)

**Current (false-green) - line 51 includes `'all_not_deleted'`:**
```ts
it('should accept all valid status values', () => {
  const statuses = ['open', 'won', 'lost', 'deleted', 'all_not_deleted'];
  statuses.forEach((status) => {
    const result = ListDealsSchema.parse({ status });
    expect(result.status).toBe(status);
  });
});
```

**Corrected:**
```ts
it('should accept all valid status values', () => {
  const statuses = ['open', 'won', 'lost', 'deleted'];
  statuses.forEach((status) => {
    const result = ListDealsSchema.parse({ status });
    expect(result.status).toBe(status);
  });
});

it('should reject all_not_deleted status (not a valid v2 status)', () => {
  expect(() => ListDealsSchema.parse({ status: 'all_not_deleted' })).toThrow();
});
```

(There is already a separate `should reject invalid status` test at deals.test.ts:66 asserting `{ status: 'invalid' }` throws; leave it. The new assertion specifically pins `all_not_deleted` as rejected.)

### 5.3 `tests/integration/tools/deals.test.ts` - NO change required

Grep confirms this file does NOT reference `all_not_deleted`. Its only status usages are `status=open` (lines 68, 243) and `status: 'won'` (lines 188-199), all of which remain valid. **Do not edit this file.**

### 5.4 (Optional) `SearchDealsSchema` negative coverage

`SearchDealsSchema.status` also resolves to `DealStatusSchema`, so it is covered transitively by 5.1. Adding a dedicated `SearchDealsSchema.parse({ term: '...', status: 'all_not_deleted' })`-throws assertion in `tests/unit/schemas/deals.test.ts` is optional but harmless extra coverage. Not required for DoD.

---

## 6. Out of scope / disjointness

This issue is part of parallel batch #42-#46. **You OWN `common.ts` in this batch.**

**Touch ONLY these files:**
- `src/schemas/common.ts`
- `src/tools/deals.ts`
- `tests/unit/schemas/common.test.ts`
- `tests/unit/schemas/deals.test.ts`

**Do NOT touch:**
- `tests/integration/tools/deals.test.ts` - confirmed it does not reference `all_not_deleted`; no change needed.
- `src/tools/index.ts` - no edits (registration is unaffected; the enum lives in deals.ts/common.ts).
- Any other entity's schema/tool/test files (persons, organizations, activities, notes, etc.).
- Create/Update deal status enums (already correct at `["open","won","lost"]`).
- Generated artifacts under `dist/` and `bundle/` - these are build outputs; they regenerate on `npm run build` and must not be hand-edited.
- `package.json` / lockfile - no dependency changes (stay on Zod 3).

---

## 7. Definition of Done

- [ ] `src/schemas/common.ts:68` `DealStatusSchema` enum is `["open", "won", "lost", "deleted"]` (no `all_not_deleted`), written in Zod 3 syntax.
- [ ] `src/tools/deals.ts` both `status` inputSchema enums (list ~265, search ~357) are `["open", "won", "lost", "deleted"]`.
- [ ] No handler body was modified (the omit-when-undefined logic at deals.ts:39 and deals.ts:194 is unchanged).
- [ ] `tests/unit/schemas/common.test.ts` no longer asserts `all_not_deleted` is valid and now asserts it is rejected.
- [ ] `tests/unit/schemas/deals.test.ts` no longer asserts `all_not_deleted` is valid and now asserts it is rejected.
- [ ] Every corrected assertion is verified against `docs/api/openapi-v2.yaml` lines 1848-1857 (enum = open/won/lost/deleted; omit => all non-deleted).
- [ ] `npm run build` is green (TypeScript compiles; note `z.infer` types narrow automatically - no manual type edits needed).
- [ ] `npm test` is green **after** the assertions are corrected to match v2 (the two formerly false-green tests now reflect real v2 behavior).
- [ ] Only the four listed files were changed (no other source/test files, no `dist/`/`bundle/`, no `src/tools/index.ts`).

---

## 8. Risks / notes

- **Breaking but correctness-positive:** Narrowing the enum is technically a breaking change for any caller that was passing `status: "all_not_deleted"`. However, that value was never valid against the v2 API (it would be rejected, likely 400), so no working call relied on it. Callers wanting "all non-deleted deals" should simply omit `status` - and the handlers already do exactly that. Document this in the PR description.
- **Zod 3, not 4:** main is on Zod 3.25; keep `z.enum([...])` syntax. A later PR (#16 PR B) migrates to Zod 4 - do not pre-migrate here.
- **Shared schema fan-out:** Because `DealStatusSchema` is imported by both `ListDealsSchema` and `SearchDealsSchema`, the single common.ts edit propagates to both Zod validators. The two `src/tools/deals.ts` inputSchema enums are independent hand-written copies and must each be edited - missing one would leave an MCP-advertised enum out of sync with the Zod validator.
- **Type inference:** `z.infer<typeof ...>` for `ListDealsParams` / `SearchDealsParams` will automatically drop `"all_not_deleted"` from the `status` union once the enum changes; no manual TypeScript type edits are required, and any stray usage would surface as a compile error (none expected).
- **Generated `.d.ts` noise:** `dist/` and `bundle/` currently contain the old union (`... | "all_not_deleted"`). These are stale build artifacts and will refresh on the next `npm run build`; do not hand-edit them and do not treat them as source.
