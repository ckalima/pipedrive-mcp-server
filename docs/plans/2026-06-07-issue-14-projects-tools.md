# Implementation Plan: Projects tools (Issue #14)

> Firewalled-pipeline plan artifact. The implement agent executes this verbatim.
> Adds 2 new source files + 1 edit + 2 new test files. Match existing style exactly:
> 2-space indent, double-quoted strings in `src/`, `.js` ESM import suffixes, JSDoc block comments, `type: "text" as const`.

## Assumptions (live API unreachable — stated explicitly)

Where the issue does not guarantee fields, these are conservative guesses. Mark guessed optional fields with a short `// guess` inline comment.

1. **Create/update fields**: required `title`, `board_id`, `phase_id` (per issue). Optional (guess): `description`, `status`, `owner_id`, `start_date`, `end_date`, `deal_ids`, `org_id`, `person_id`, `labels`.
2. **Archive**: `archive_project` → `PATCH /projects/{id}` with body `{ status: "archived" }` (guess; noted in JSDoc + risks).
3. **Status typing**: use `z.string().optional()` everywhere (NO enum) — most beta-safe.
4. **`/projects/search`**: assume exists on v2 with `term`/`exact_match`/`limit`/`cursor`/`include_fields` (mirror `searchLeads`).
5. **`list_project_tasks`**: v1 `GET /projects/{id}/tasks`, assume v1 offset pagination (`buildPaginationParamsV1`/`extractPaginationV1`). Params are inert if unsupported.
6. **Project IDs are positive integers** — use `IdParamSchema` from `common.ts`, NOT a UUID.

## 1. `src/schemas/projects.ts` (NEW)

Header: `/** * Zod schemas for Project-related operations (Projects add-on, PUBLIC BETA) */`

Imports from `./common.js`: `PaginationParamsSchema`, `PaginationParamsV1Schema`, `IdParamSchema`, `SearchTermSchema`, `DateStringSchema`, `VisibilitySchema`; plus `import { z } from "zod";`

Schemas (use `.describe(...)` in the established style):

1. `ListProjectsSchema = PaginationParamsSchema.extend({ ... })`:
   - `filter_id: z.number().int().positive().optional()` — "Filter by saved filter ID"
   - `phase_id: z.number().int().positive().optional()` — "Filter by phase ID"
   - `status: z.string().optional()` — "Filter by project status (e.g. open, completed, canceled, deleted)"
   - `board_id: z.number().int().positive().optional()` — "Filter by board ID"
   - `include_fields: z.string().optional()` — "Comma-separated additional fields to include"

2. `GetProjectSchema = IdParamSchema;`

3. `CreateProjectSchema = z.object({ ... })`:
   - `title: z.string().min(1).max(255)` — "Project title (required)"
   - `board_id: z.number().int().positive()` — "Board ID the project belongs to (required)"
   - `phase_id: z.number().int().positive()` — "Phase ID within the board (required)"
   - `description: z.string().optional()` // guess
   - `status: z.string().optional()` // guess
   - `owner_id: z.number().int().positive().optional()` // guess
   - `start_date: DateStringSchema.optional()` // guess
   - `end_date: DateStringSchema.optional()` // guess
   - `deal_ids: z.array(z.number().int().positive()).optional()` // guess
   - `org_id: z.number().int().positive().optional()` // guess
   - `person_id: z.number().int().positive().optional()` // guess
   - `labels: z.array(z.number().int().positive()).optional()` // guess

4. `UpdateProjectSchema = IdParamSchema.extend({ ... })` — same fields as create but ALL optional (including `title`, `board_id`, `phase_id`), descriptions prefixed "New ...".

5. `DeleteProjectSchema = IdParamSchema;`

6. `ArchiveProjectSchema = IdParamSchema;`

7. `SearchProjectsSchema = z.object({ ... })` mirroring `SearchLeadsSchema`:
   - `term: SearchTermSchema` — "Search term for project title"
   - `include_fields: z.string().optional()`
   - `exact_match: z.boolean().optional().default(false)`
   - `limit: z.number().min(1).max(100).optional().default(50)`
   - `cursor: z.string().optional()`

8. `ListProjectTasksSchema = PaginationParamsV1Schema.extend({ id: z.number().int().positive().describe("Project ID") })`

Type exports: `ListProjectsParams`, `GetProjectParams`, `CreateProjectParams`, `UpdateProjectParams`, `DeleteProjectParams`, `ArchiveProjectParams`, `SearchProjectsParams`, `ListProjectTasksParams`.

## 2. `src/tools/projects.ts` (NEW)

Header: `/** * Project-related MCP tools for Pipedrive (Projects add-on, PUBLIC BETA) */`

Imports: `getClient` from `../client.js`; all schemas + types from `../schemas/projects.js`; `buildPaginationParamsV2, extractPaginationV2, buildPaginationParamsV1, extractPaginationV1` from `../utils/pagination.js`; `mcpErrorResult, destructiveOperationGuard` from `../utils/errors.js`; `createListSummary` from `../utils/formatting.js`.

Handlers (standard return shape `{ content: [{ type: "text" as const, text: JSON.stringify({...}, null, 2) }] }`):

- **`listProjects`** (v2, default version): `buildPaginationParamsV2(params.cursor, params.limit)`; conditionally set `filter_id`, `phase_id`, `status`, `board_id`, `include_fields` (`if (params.X) queryParams.set("X", String(params.X))`; string fields without `String()`); `client.get<unknown[]>("/projects", queryParams)`; guard `!response.success || !response.data`; `extractPaginationV2`; summary `createListSummary("project", n, has_more)` + `data` + `pagination`.
- **`getProject`** (v2): `client.get<unknown>(\`/projects/${params.id}\`)`; guard; summary `Project ${params.id}`.
- **`createProject`** (v2 POST): `body = { title, board_id, phase_id }`; add optionals with `if (params.X) body.X = params.X;`; `client.post<unknown>("/projects", body)`; guard; summary `"Project created"`.
- **`updateProject`** (v2 PATCH): `const { id, ...updateFields } = params;` build body with `if (updateFields.X) body.X = updateFields.X;`; `client.patch<unknown>(\`/projects/${id}\`, body)`; guard; summary `Project ${id} updated`.
- **`deleteProject`** (v2 DELETE, gated): `const guard = destructiveOperationGuard(); if (guard) return guard;` then `getClient()`; `client.delete<{ id: number }>(\`/projects/${params.id}\`)`; guard; summary `Project ${params.id} deleted`.
- **`archiveProject`** (v2 PATCH): `client.patch<unknown>(\`/projects/${params.id}\`, { status: "archived" })`; guard; summary `Project ${params.id} archived`. JSDoc note: "Archives a project by setting status to 'archived' via PATCH. (Archive endpoint semantics assumed; see issue #14.)"
- **`searchProjects`** (v2, mirror `searchLeads`): build `URLSearchParams`, set `term`; `if (params.exact_match) set("exact_match","true")`; `if (params.limit) set("limit", String(...))`; `if (params.cursor) set("cursor", ...)`; `if (params.include_fields) set("include_fields", ...)`; `client.get<unknown>("/projects/search", queryParams, "v2")`; guard; summary `Search results for "${params.term}"`.
- **`listProjectTasks`** (v1, mirror `listLeads`): `buildPaginationParamsV1(params.start, params.limit)`; `client.get<unknown[]>(\`/projects/${params.id}/tasks\`, queryParams, "v1")`; guard on `!response.success` only; `const tasks = response.data || []`; `extractPaginationV1`; summary `createListSummary("task", n, has_more)` + `data` + `pagination`.

### `projectTools` array (order matches issue table)
Each `{ name, description, inputSchema, handler, schema }`. EVERY description ends with the beta caveat suffix: ` (Requires the Projects add-on; Projects API is in public beta.)`

| name | inputSchema props | handler | schema | required |
|---|---|---|---|---|
| `pipedrive_list_projects` | cursor(str), limit(num), filter_id(num), phase_id(num), status(str), board_id(num), include_fields(str) | listProjects | ListProjectsSchema | — |
| `pipedrive_get_project` | id(num) | getProject | GetProjectSchema | ["id"] |
| `pipedrive_create_project` | title,board_id,phase_id,description,status,owner_id,start_date,end_date,deal_ids(array num),org_id,person_id,labels(array num) | createProject | CreateProjectSchema | ["title","board_id","phase_id"] |
| `pipedrive_update_project` | id + all create fields optional | updateProject | UpdateProjectSchema | ["id"] |
| `pipedrive_delete_project` | id(num) | deleteProject | DeleteProjectSchema | ["id"] |
| `pipedrive_search_projects` | term,include_fields,exact_match(bool),limit(num),cursor(str) | searchProjects | SearchProjectsSchema | ["term"] |
| `pipedrive_archive_project` | id(num) | archiveProject | ArchiveProjectSchema | ["id"] |
| `pipedrive_list_project_tasks` | id(num), start(num), limit(num) | listProjectTasks | ListProjectTasksSchema | ["id"] |

Descriptions: list = "List projects from Pipedrive with optional filtering by board, phase, or status. Returns paginated results."; get = "Get detailed information about a specific project by ID."; create = "Create a new project in Pipedrive. Requires title, board_id, and phase_id."; update = "Update an existing project in Pipedrive."; delete = "Delete a project. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true environment variable."; search = "Search for projects in Pipedrive by title."; archive = "Archive a project by setting its status to archived."; list_project_tasks = "List tasks belonging to a project." — each + beta suffix. Use `{ type: "array", items: { type: "number" }, ... }` for `deal_ids`/`labels`.

## 3. `src/tools/index.ts` — register

```diff
 import { leadsTools } from "./leads.js";
+import { projectTools } from "./projects.js";
 ...
   ...leadsTools,
+  ...projectTools,
```
(Place spread after `...leadsTools` in Tier 1.) No other change — `toolDefinitions`/`getToolHandler`/`getToolSchema` derive from `allTools`.

## 4. Test plan

### 4a. `tests/unit/schemas/projects.test.ts` (NEW) — mirror `leads.test.ts`/`deals.test.ts` style
- **ListProjectsSchema**: `{}` → `limit` default 50; accepts cursor/filter_id/phase_id/status/board_id/include_fields; rejects `limit:0`, `limit>100`, non-positive `filter_id`.
- **GetProjectSchema**: accepts `{id:1}`; rejects `{}`, string id, `id:0`, `id:-1`, UUID string (locks integer id).
- **CreateProjectSchema**: requires title/board_id/phase_id individually; accepts minimal trio; accepts full payload; rejects empty title, title>255, bad `start_date` ('12/31/2024'); accepts positive-int `deal_ids`/`labels`, rejects negatives.
- **UpdateProjectSchema**: requires id; rejects string id; accepts `{id}` alone; accepts all updatable; rejects bad `end_date`.
- **DeleteProjectSchema** / **ArchiveProjectSchema**: require id; accept int; reject string/zero/negative.
- **SearchProjectsSchema**: requires term; defaults `exact_match=false`, `limit=50`; rejects empty/over-500 term, `limit:0`, `limit>100`.
- **ListProjectTasksSchema**: requires id; `{id}` → `limit` default 50; accepts `{id,start,limit}`; rejects missing/string id, `limit>500`, negative `start`.

### 4b. `tests/integration/tools/projects.test.ts` (NEW) — copy leads integration header
`import { describe, it, expect, beforeEach, vi } from 'vitest';`, `setupValidEnv` from `'../../helpers/mockEnv.js'`, `mockFetch, mockApiSuccess, mockApiError, paginationFixtures` from `'../../helpers/mockFetch.js'`, handlers from `'../../../src/tools/projects.js'`. `beforeEach: setupValidEnv(); vi.unstubAllGlobals();`

Define local fixtures in-file (do NOT modify shared `mockFetch.ts`):
```ts
const projectFixture = { id: 1, title: 'Test Project', board_id: 1, phase_id: 1, status: 'open', owner_id: 1, add_time: '2024-01-01T00:00:00Z', update_time: '2024-01-01T00:00:00Z' };
const createProjectsFixture = (n: number) => Array.from({ length: n }, (_, i) => ({ ...projectFixture, id: i + 1, title: `Test Project ${i + 1}` }));
```
Assertion conventions: `mockFn.mock.calls[0]` is `[url, options]`; v2 URLs contain `/api/v2/`, v1 URLs contain `/v1/`.

Cases:
- **listProjects**: list+summary pluralization (`1 project`/`3 projects`), data length, `pagination.has_more`; `paginationFixtures.v2WithMore` → `has_more=true`, `next_cursor='cursor_abc123'`; passes `board_id`/`phase_id`/`status`/`filter_id` in URL; cursor; v2 endpoint (`/api/v2/` + `/projects`); `mockApiError(401)` → isError.
- **getProject**: single project, summary `Project 1`, `data.title`; v2 `/projects/1`; `mockApiError(404)` → isError + `NOT_FOUND`.
- **createProject**: summary `Project created`; POST `/projects`, `options.method==='POST'`, v2; body has title/board_id/phase_id; optionals included when provided; `not.toHaveProperty('description')` when omitted; `mockApiError(400)` → isError.
- **updateProject**: summary `updated`+`1`; `PATCH`; `/projects/1`; only provided fields in body; `not.toHaveProperty('board_id')` when omitted.
- **deleteProject** guard OFF (`delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE`) → isError + `DESTRUCTIVE_DISABLED`; ON (`= 'true'`) + `mockApiSuccess({id:1})` → summary `deleted`; `DELETE` to `/projects/1`, v2.
- **archiveProject**: summary `archived`+`1`; `PATCH` `/projects/1`; `expect(JSON.parse(options.body)).toEqual({ status: 'archived' })`.
- **searchProjects**: summary contains term; `/projects/search` on v2; `term=` in query; `exact_match=true` when set; `include_fields` passed; `mockApiError(400)` → isError.
- **listProjectTasks** (v1): tasks + summary; url contains `/v1/projects/1/tasks` (NOT `/api/v2/`); `paginationFixtures.v1WithMore` → `has_more=true`; `mockApiError(403)` → isError (simulates missing add-on).
- **registration smoke**: import `{ allTools }` from `'../../../src/tools/index.js'`; assert all 8 tool names present.

> Note: verify `mockFetch.ts` exports `paginationFixtures.v1WithMore` / `v2WithMore`; if names differ, adapt to the actual exports.

## 5. Risks
1. Beta instability — loose typing keeps schemas from rejecting valid payloads; field-name corrections are localized to schema + body-building.
2. ID type — integer confirmed; unit tests reject UUIDs.
3. Archive semantics — assumed PATCH `{status:"archived"}`; integration test asserts exact body.
4. `/projects/search` existence/version — assumed v2; isolated to `searchProjects`.
5. `list_project_tasks` pagination — inert if unsupported.
6. No existing test asserts a fixed `allTools` total, so adding 8 tools breaks nothing.

## Verification (done by separate VERIFY agent, not the implementer)
`npm run build` + `npm test` must pass.
