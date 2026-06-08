# Implementation Plan: Migrate `listStages` / `getStage` to v2 (Issue #9)

> Firewalled-pipeline plan artifact. The implement agent executes this verbatim.
> Sibling of issue #8 (`listPipelines` v2, already merged). MIRROR that exact pattern.

## Scope

Touch ONLY:
1. `src/schemas/pipelines.ts` — replace `ListStagesSchema` (keep `GetStageSchema` as-is)
2. `src/tools/pipelines.ts` — rewrite `listStages` + `getStage` bodies + their tool `inputSchema` entries
3. `tests/integration/tools/pipelines.test.ts` — update breaking stages/getStage tests + add v2 coverage
4. `tests/unit/schemas/pipelines.test.ts` — update breaking `ListStagesSchema` tests

### Scope guard (do NOT cross)
- Do NOT touch `listPipelines`, `ListPipelinesSchema`, or the `pipedrive_list_pipelines` tool entry — already migrated to v2 in #8. Resist any "consistency" edits to it.
- Do NOT modify `src/utils/pagination.ts`, `src/utils/formatting.ts`, `src/schemas/common.ts`, or `src/client.ts` — they already provide everything needed.
- Do NOT modify `tests/helpers/mockFetch.ts` (shared `fixtures.stage` is informational; the handler returns it verbatim and never inspects fields). See section 4.

## Key decisions (read first)

- **Keep `pipeline_id` filter.** Pipedrive v2 `GET /stages` supports a `pipeline_id` query-param filter. The existing tool and tests rely on it. So `ListStagesSchema` becomes `PaginationParamsSchema` (cursor + limit) **extended/merged** with the optional `pipeline_id`, not a bare `PaginationParamsSchema`. This differs from #8, where `ListPipelinesSchema = PaginationParamsSchema` with no extra filter.
- **`getStage`** only changes by dropping the `"v1"` 3rd arg so it defaults to v2 `GET /stages/{id}`. `GetStageSchema` stays `IdParamSchema` (id-based, unchanged).
- **Field renames are INFORMATIONAL passthrough.** v2 renames `active_flag`→`is_deleted` (semantics inverted); `pipeline_id` stays. No per-field transform — the handler returns `response.data` verbatim, same reasoning as #8. See section 4.

## 1. `src/schemas/pipelines.ts`

The import line already pulls in both needed schemas — no import change required:
```ts
import { IdParamSchema, PaginationParamsSchema } from "./common.js";
```

Replace the current `ListStagesSchema` definition:
```ts
/**
 * List stages parameters
 */
export const ListStagesSchema = z.object({
  pipeline_id: z.number().int().positive().optional()
    .describe("Filter by pipeline ID (if not provided, returns all stages)"),
});
```
with the v2 cursor-pagination version that merges pagination params with the `pipeline_id` filter:
```ts
/**
 * List stages parameters (v2 cursor-based pagination, optional pipeline filter)
 */
export const ListStagesSchema = PaginationParamsSchema.extend({
  pipeline_id: z.number().int().positive().optional()
    .describe("Filter by pipeline ID (if not provided, returns all stages)"),
});
```

Notes:
- `z` is still imported and used (the `.extend({ pipeline_id: z.number()... })` call). Keep the `import { z } from "zod";` line.
- `GetStageSchema = IdParamSchema;` — leave untouched.
- Type exports — leave untouched. `ListStagesParams` (`z.infer<typeof ListStagesSchema>`) now resolves to `{ cursor?: string; limit: number; pipeline_id?: number }`, which the rewritten handler consumes correctly.
- Do NOT touch `ListPipelinesSchema`.

## 2. `src/tools/pipelines.ts`

The needed helpers are already imported at the top of the file (added by #8):
```ts
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { createListSummary } from "../utils/formatting.js";
```
No new imports are required. Do NOT re-add duplicate imports.

### Rewrite `listStages`

Replace the entire current `listStages` function (currently builds a manual `URLSearchParams`, passes `"v1"`, and builds a custom summary string) with the v2 version below. It mirrors `listPipelines`: build v2 pagination params, append `pipeline_id` when present, call `client.get` with NO 3rd version arg (defaults to v2), extract v2 pagination, and use `createListSummary`.

```ts
/**
 * List stages, optionally filtered by pipeline
 */
export async function listStages(params: ListStagesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
  if (params.pipeline_id) {
    queryParams.set("pipeline_id", String(params.pipeline_id));
  }

  // Uses v2 API for stages
  const response = await client.get<unknown[]>("/stages", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const stages = response.data;
  const pagination = extractPaginationV2(response);

  const additionalInfo = params.pipeline_id
    ? `pipeline ${params.pipeline_id}`
    : undefined;

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("stage", stages.length, pagination.has_more, additionalInfo),
        data: stages,
        pagination,
      }, null, 2),
    }],
  };
}
```

Rationale for `additionalInfo`:
- `createListSummary(entityName, count, hasMore, additionalInfo?)` renders `additionalInfo` as `(…)`. So with a filter the summary reads e.g. `Found 1 stage. (pipeline 2).` and without it `Found 3 stages.` Either way it still contains the substring `"N stage"`, which is all the integration tests assert (`expect(parsed.summary).toContain('3 stage')`). Confirmed against `src/utils/formatting.ts`.

### Rewrite `getStage`

Only drop the `"v1"` version arg (and the now-redundant explicit `undefined` params arg can stay or go; keep the call shape identical to before minus the version). Replace:
```ts
  const response = await client.get<unknown>(
    `/stages/${params.id}`,
    undefined,
    "v1"
  );
```
with:
```ts
  const response = await client.get<unknown>(`/stages/${params.id}`);
```
Everything else in `getStage` (the `summary: \`Stage ${params.id}\``, the `data: response.data` passthrough, the error guard) stays identical.

### Update the `pipedrive_list_stages` tool definition

Add `cursor` and `limit` to `inputSchema.properties` alongside the existing `pipeline_id`. Replace:
```ts
  {
    name: "pipedrive_list_stages",
    description: "List all stages, optionally filtered by pipeline. Stages represent steps in the sales process.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pipeline_id: { type: "number", description: "Filter by pipeline ID (returns all stages if not specified)" },
      },
    },
    handler: listStages,
    schema: ListStagesSchema,
  },
```
with:
```ts
  {
    name: "pipedrive_list_stages",
    description: "List stages with cursor pagination, optionally filtered by pipeline. Stages represent steps in the sales process.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
        pipeline_id: { type: "number", description: "Filter by pipeline ID (returns all stages if not specified)" },
      },
    },
    handler: listStages,
    schema: ListStagesSchema,
  },
```

Leave the `pipedrive_get_stage` tool entry exactly as-is (its `inputSchema` is already correct: `id` required, no pagination). Leave the `pipedrive_list_pipelines` entry exactly as-is.

## 3. `src/tools/index.ts`

No change. Stages are already registered via the `pipelineTools` spread; the tool names and count are unchanged.

## 4. Field-rename note (`active_flag`→`is_deleted`): INFORMATIONAL — no transformation

The v2 stage object renames `active_flag` to `is_deleted` (inverted semantics) and keeps `pipeline_id`. Per the #8 precedent and the migration plan's Open Decision #1 ("ship v2 field names, don't normalize"), the handler returns Pipedrive's `data` verbatim and never inspects individual stage fields. No remap. Do NOT modify `fixtures.stage` in `tests/helpers/mockFetch.ts` — it is shared and the handler does not read its fields; the stages tests only check `id`, `name`, array length, and the summary string, none of which are affected by the rename.

## 5. Response-wrapping assumption

Assume v2 `GET /stages` is wrapped like `GET /deals` / `GET /pipelines`: `{ success, data: [...], additional_data: { next_cursor } }`, and `GET /stages/{id}` returns `{ success, data: {...} }`. The client extracts `data` / `additional_data` generically, so `extractPaginationV2` works unchanged. With no `additional_data`, pagination resolves to `{ next_cursor: undefined, has_more: false }`.

---

## 6. TEST IMPACT (MANDATORY — every breaking assertion enumerated)

File references below are inside the worktree. Current state read and confirmed.

### A. `tests/integration/tools/pipelines.test.ts`

#### A1. BREAKS — `listStages` › `should use v1 API` (lines ~121-129)
Currently asserts `expect(url).toContain('/v1/stages')`. After migration the URL is v2. **Replace the entire test** with:
```ts
    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listStages } = await getPipelinesTools();

      await listStages({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/stages');
      expect(url).not.toContain('/v1/');
    });
```

#### A2. BREAKS — `getStage` › `should use v1 API` (lines ~144-152)
Currently asserts `expect(url).toContain('/v1/stages/5')`. **Replace the entire test** with:
```ts
    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess(fixtures.stage);
      const { getStage } = await getPipelinesTools();

      await getStage({ id: 5 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/stages/5');
      expect(url).not.toContain('/v1/');
    });
```

#### A3. STILL PASSES (verify, do not change) — `listStages` › `should filter by pipeline_id` (lines ~111-119)
Asserts `expect(url).toContain('pipeline_id=2')`. The rewritten handler still sets `pipeline_id` on the query string, so this passes unchanged. Keep as-is.

#### A4. STILL PASSES (verify, do not change)
- `listStages` › `should return all stages` — asserts `summary` contains `'3 stage'` and `data` length 3. `createListSummary("stage", 3, false)` → `"Found 3 stages."` ✓ contains `"3 stage"`.
- `getStage` › `should return single stage` — asserts `summary === 'Stage 1'` and `data.name === 'Lead'`. Unchanged. ✓
- `getStage` › `should handle not found` — asserts text contains `'NOT_FOUND'`. Unchanged. ✓

#### A5. NEW tests to ADD inside the `describe('listStages', …)` block (mirror #8 pipeline pagination additions)
```ts
    it('should use cursor for pagination', async () => {
      const mockFn = mockApiSuccess([]);
      const { listStages } = await getPipelinesTools();

      await listStages({ cursor: 'next_page_cursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=next_page_cursor');
    });

    it('should pass limit to API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listStages } = await getPipelinesTools();

      await listStages({ limit: 25 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=25');
    });

    it('should include pagination info when more items available', async () => {
      const { listStages } = await getPipelinesTools();
      mockFetch({ data: [fixtures.stage], additional_data: paginationFixtures.v2WithMore });

      const result = await listStages({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });
```

#### A6. Imports
`mockFetch`, `fixtures`, and `paginationFixtures` are ALREADY imported at the top of this file (lines 7-13, added during #8). No import change needed. Verify before adding — do NOT duplicate.

### B. `tests/unit/schemas/pipelines.test.ts`

#### B1. BREAKS — `ListStagesSchema` › `should accept empty object` (lines ~36-39)
Currently:
```ts
    it('should accept empty object', () => {
      const result = ListStagesSchema.parse({});
      expect(result.pipeline_id).toBeUndefined();
    });
```
After the schema merges `PaginationParamsSchema`, `parse({})` now also yields `limit: 50` (default) and `cursor: undefined`. The `pipeline_id` assertion is still true, so this test technically still passes — BUT to mirror #8's `ListPipelinesSchema` coverage and document the new defaults, **replace it** with:
```ts
    it('should apply default limit and accept empty object', () => {
      const result = ListStagesSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.cursor).toBeUndefined();
      expect(result.pipeline_id).toBeUndefined();
    });
```

#### B2. STILL PASSES (verify, do not change) — remaining `ListStagesSchema` tests (lines ~41-53)
- `should accept pipeline_id` → `parse({ pipeline_id: 1 })`, `pipeline_id === 1`. ✓ (`.extend` preserves the field)
- `should reject non-positive pipeline_id` → `parse({ pipeline_id: 0 })` / `-1` throw. ✓
- `should reject non-integer pipeline_id` → `parse({ pipeline_id: 1.5 })` throws. ✓

#### B3. NEW tests to ADD inside the `describe('ListStagesSchema', …)` block (cover the new cursor/limit params)
```ts
    it('should accept cursor and limit', () => {
      const result = ListStagesSchema.parse({ cursor: 'abc', limit: 25 });
      expect(result.cursor).toBe('abc');
      expect(result.limit).toBe(25);
    });

    it('should reject limit above 100', () => {
      expect(() => ListStagesSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject limit below 1', () => {
      expect(() => ListStagesSchema.parse({ limit: 0 })).toThrow();
    });

    it('should accept cursor with pipeline_id', () => {
      const result = ListStagesSchema.parse({ cursor: 'abc', pipeline_id: 2 });
      expect(result.cursor).toBe('abc');
      expect(result.pipeline_id).toBe(2);
    });
```

#### B4. STILL PASSES (verify, do not change) — `GetStageSchema` block (lines ~56-73)
`GetStageSchema = IdParamSchema` is unchanged; all four tests (`require id`, `accept valid id`, `reject non-positive`, `reject non-integer`) pass unchanged.

#### B5. Do NOT touch the `ListPipelinesSchema` describe block — out of scope (#8).

### C. Summary of breaking assertions (the failure mode this section guards against)
| Test file | Test | Old assertion | Fix |
|---|---|---|---|
| integration | `listStages › should use v1 API` | `/v1/stages` | rewrite to v2 (`/api/v2/stages`, `not /v1/`) |
| integration | `getStage › should use v1 API` | `/v1/stages/5` | rewrite to v2 (`/api/v2/stages/5`, `not /v1/`) |
| unit | `ListStagesSchema › should accept empty object` | shape `{ pipeline_id }` only | rewrite to also assert `limit: 50`, `cursor: undefined` |

No other existing assertion changes. The `pipeline_id=2` filter test and all `getStage` data/error tests remain valid.

---

## 7. Risks
- Shared file: a careless find-replace of `"v1"` in `pipelines.ts` would corrupt unrelated handlers. Only `listStages` and `getStage` lose the `"v1"` arg; `listPipelines` is already v2.
- v2 path segment is `/api/v2/stages`; the `not.toContain('/v1/')` guards catch a version regression.
- `buildPaginationParamsV2` always sets `limit` (default 50, matches schema default), so an unfiltered `listStages({})` sends `limit=50` — harmless and expected.
- `pipeline_id` is appended AFTER `buildPaginationParamsV2`, so both `limit`/`cursor` and `pipeline_id` coexist on the query string (verified by A3 + A5 tests).

## Verification (done by separate VERIFY agent, not the implementer)
`npm run build` + `npm test` must both pass.
