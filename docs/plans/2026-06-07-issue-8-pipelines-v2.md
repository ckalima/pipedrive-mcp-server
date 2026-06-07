# Implementation Plan: Migrate `listPipelines` to v2 (Issue #8)

> Firewalled-pipeline plan artifact. The implement agent executes this verbatim.

## Scope

Touch ONLY:
1. `src/schemas/pipelines.ts` — replace `ListPipelinesSchema`
2. `src/tools/pipelines.ts` — rewrite `listPipelines` body + its tool `inputSchema`
3. `tests/integration/tools/pipelines.test.ts` — update breaking tests + add coverage
4. `tests/unit/schemas/pipelines.test.ts` — update breaking tests

Do NOT touch `listStages`, `getStage`, `ListStagesSchema`, `GetStageSchema`, or their tests (issue #9, separate PR sharing this file). Leave them on v1. Resist "consistency" edits to the sibling handlers.

## 1. `src/schemas/pipelines.ts`

Change the import:
```ts
import { IdParamSchema, PaginationParamsSchema } from "./common.js";
```

Replace the `ListPipelinesSchema` definition (currently `z.object({})`) with:
```ts
/**
 * List pipelines parameters (v2 cursor-based pagination)
 */
export const ListPipelinesSchema = PaginationParamsSchema;
```

The exported `ListPipelinesParams` type (`z.infer<typeof ListPipelinesSchema>`) needs no change — it resolves to `{ cursor?: string; limit: number }`. Leave `ListStagesSchema`, `GetStageSchema`, and all type exports untouched. `z` is still imported/used by `ListStagesSchema`.

## 2. `src/tools/pipelines.ts`

### Imports — add after the existing `mcpErrorResult` import:
```ts
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { createListSummary } from "../utils/formatting.js";
```

### Rewrite `listPipelines` (param renamed `_params` → `params`):
```ts
/**
 * List all pipelines
 */
export async function listPipelines(params: ListPipelinesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  // Uses v2 API for pipelines
  const response = await client.get<unknown[]>("/pipelines", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pipelines = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("pipeline", pipelines.length, pagination.has_more),
        data: pipelines,
        pagination,
      }, null, 2),
    }],
  };
}
```
- Omit the 3rd `version` arg so it defaults to `"v2"`.
- `createListSummary("pipeline", ...)` pluralizes correctly.

### Update the `pipedrive_list_pipelines` tool definition:
```ts
  {
    name: "pipedrive_list_pipelines",
    description: "List sales pipelines in Pipedrive with cursor pagination. Pipelines contain stages that deals move through.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
      },
    },
    handler: listPipelines,
    schema: ListPipelinesSchema,
  },
```
Leave `pipedrive_list_stages` and `pipedrive_get_stage` entries exactly as-is.

## 3. Field-rename note (`user_id`→`owner_id`, `active_flag`→`is_deleted`): INFORMATIONAL — no transformation

The tool returns Pipedrive's `data` verbatim and never inspects individual fields; no sibling tool transforms response fields. The v2 API already returns v2 field names. Adding a remap would be inconsistent and exceed scope. Do NOT modify `fixtures.pipeline` in `tests/helpers/mockFetch.ts` (shared, not inspected by the handler).

## 4. Response-wrapping assumption

Assume v2 `GET /pipelines` is wrapped like `GET /deals`: `{ success, data: [...], additional_data: { next_cursor } }`. The client extracts `data`/`additional_data` generically, so `extractPaginationV2` works unchanged. If no `additional_data`, it yields `{ next_cursor: undefined, has_more: false }`.

## 5. Test plan

### EXISTING tests that WILL BREAK — must update

**A. `tests/integration/tools/pipelines.test.ts` "should use v1 API"** — asserts `/v1/pipelines`. Rewrite to v2:
```ts
    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPipelines } = await getPipelinesTools();

      await listPipelines({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/pipelines');
      expect(url).not.toContain('/v1/');
    });
```
(If the file imports handlers directly rather than via a `getPipelinesTools()` helper, match the file's existing import/call style.)

**B. `tests/unit/schemas/pipelines.test.ts` "ListPipelinesSchema" block** — `parse({})` now returns `{ limit: 50 }`, not `{}`. Replace the two existing `ListPipelinesSchema` tests with:
```ts
  describe('ListPipelinesSchema', () => {
    it('should apply default limit', () => {
      const result = ListPipelinesSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.cursor).toBeUndefined();
    });

    it('should accept cursor and limit', () => {
      const result = ListPipelinesSchema.parse({ cursor: 'abc', limit: 25 });
      expect(result.cursor).toBe('abc');
      expect(result.limit).toBe(25);
    });

    it('should reject limit above 100', () => {
      expect(() => ListPipelinesSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject limit below 1', () => {
      expect(() => ListPipelinesSchema.parse({ limit: 0 })).toThrow();
    });
  });
```
Leave `ListStagesSchema` and `GetStageSchema` blocks untouched.

### NEW assertions to ADD (integration), mirroring deals pagination tests:
```ts
    it('should use cursor for pagination', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPipelines } = await getPipelinesTools();
      await listPipelines({ cursor: 'next_page_cursor' });
      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=next_page_cursor');
    });

    it('should pass limit to API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPipelines } = await getPipelinesTools();
      await listPipelines({ limit: 25 });
      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=25');
    });

    it('should include pagination info when more items available', async () => {
      const { listPipelines } = await getPipelinesTools();
      mockFetch({ data: [fixtures.pipeline], additional_data: paginationFixtures.v2WithMore });
      const result = await listPipelines({});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });
```
Add `mockFetch` and `paginationFixtures` to the file's imports from `../../helpers/mockFetch.js` if not already present. The existing "should return list of pipelines" and "should handle API error" tests stay valid.

## 6. Risks
- v2 path segment is `/api/v2/pipelines`; the `not.toContain('/v1/')` guard catches version regressions.
- Shared file: a careless find-replace on `"v1"` would corrupt the #9 sibling. Only `listPipelines` changes.
- `buildPaginationParamsV2` always sets `limit` (default 50, agrees with schema default).

## Verification (done by separate VERIFY agent, not the implementer)
`npm run build` + `npm test` must pass.
