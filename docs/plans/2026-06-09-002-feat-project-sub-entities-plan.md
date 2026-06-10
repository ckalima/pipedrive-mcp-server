---
title: "feat: project sub-entities (tasks CRUD, boards, phases, templates, fields, archived, permittedUsers, changelog)"
status: active
date: 2026-06-09
issue: 68
branch: agent/68-project-sub-entities
origin: gh issue #68
type: feat
scope: large
---

# feat: project sub-entities (issue #68)

> **Revision (2026-06-10):** Incorporated ce-doc-review feedback (5 reviewers). Fixed the
> Requirements Traceability table (was off-by-one from R-P1 down; R-U1/R-C1 pointed at the empty
> U8); removed the phantom U8 unit and relocated its PR-grouping guidance into Sequencing; resolved
> Q4 (`parent_task_id` is spec-confirmed `type: string`, `z.string().optional()`); made an explicit
> decision on the `listTasks`/`listProjectTasks` redundancy (delegate + sharpened descriptions, see
> R-1); added LLM-visible `done`/`milestone` description guidance (R-4); noted the intentional
> limit-100 cap (R-9) and the tool-count growth (R-8). Feasibility review passed with zero findings.

> **Revision 2 (2026-06-10):** Round-2 ce-doc-review (coherence/feasibility/adversarial; feasibility
> again clean, all round-1 fixes verified landed). Applied 3 mechanical fixes: (1) added the
> project-template schemas/handlers to the Output Structure `projects.ts` file-map (were omitted);
> (2) reconciled the PR-strategy line with Sequencing — U5 (`fields.ts`) is its own PR, the
> `projects.ts` extensions are PR A=U4+U6 then PR B=U7 (no longer bundles U5); (3) corrected the R-1
> `listProjectTasks` description to say `id` (the tool's actual input field per `ListProjectTasksSchema`),
> not `project_id` (which is only the internal query key).

> **R2 of the #51 epic.** This is the largest of the four split issues (#67-#70). Tasks and boards
> are standalone top-level entities (not nested under `/projects/{id}/`) and are large enough to
> justify new files. Phases also live at the top level. All endpoints confirmed against
> `docs/api/openapi-v2.yaml` before writing this plan.

## Problem Frame

The existing `src/tools/projects.ts` covers project CRUD, archive, and search, plus a single
`listProjectTasks` stub (line 246 — it already calls `GET /tasks?project_id=...`). However, the
full task lifecycle (create, get-by-id, update, delete), board management, phase management,
project templates, project fields metadata, archived-projects list, permitted-users read, and
project changelog are all missing.

These gaps mean Claude cannot help users manage project workflow structure (boards, phases), cannot
read or mutate tasks beyond a filtered list, and cannot inspect who has access to a project or
review its change history.

This plan covers all endpoints in the #68 issue scope, grouped into independently-shippable units.

---

## Scope

### In scope

- **Tasks CRUD**: `GET /tasks` (list), `GET /tasks/{id}` (get), `POST /tasks` (create),
  `PATCH /tasks/{id}` (update), `DELETE /tasks/{id}` (delete, gated)
- **Boards CRUD**: `GET /boards` (list), `GET /boards/{id}` (get), `POST /boards` (create),
  `PATCH /boards/{id}` (update), `DELETE /boards/{id}` (delete, gated)
- **Phases CRUD**: `GET /phases?board_id=` (list, board_id required), `GET /phases/{id}` (get),
  `POST /phases` (create), `PATCH /phases/{id}` (update), `DELETE /phases/{id}` (delete, gated)
- **Project templates**: `GET /projectTemplates` (list, paginated), `GET /projectTemplates/{id}` (get)
- **Project fields**: `GET /projectFields` (list, paginated) — read-only; write ops are R4
- **Archived projects**: `GET /projects/archived` (list, paginated, filter params)
- **Permitted users**: `GET /projects/{id}/permittedUsers` (list, no pagination)
- **Project changelog**: `GET /projects/{id}/changelog` (list, cursor paginated)

### Out of scope

- Task subtask tree management beyond `parent_task_id` forwarding (API handles hierarchy)
- Project field **write** ops (addProjectField, updateProjectField) — these belong to R4
- Any `/projects/{id}/plan` or `/projects/{id}/groups` endpoints (not present in the spec)
- Multipart uploads (no such endpoint exists in the projects domain)
- #67 (deal sub-resources), #69 (followers + media), #70 (config writes) — fully file-disjoint

### Confirmed: no /projects/{id}/plan or /projects/{id}/groups in spec

`grep -nE "/projects/\{id\}/" docs/api/openapi-v2.yaml` returns only three paths:
`/projects/{id}/archive` (line 20705), `/projects/{id}/permittedUsers` (line 20841),
`/projects/{id}/changelog` (line 20883). The issue body references "plan/groups" as possible
candidates — they do not exist in the vendored spec. **Do not implement them.**

---

## Requirements Traceability

| Req ID | Source (issue #68 body) | Covered by |
|--------|-------------------------|------------|
| R-T1 | Tasks CRUD (`/tasks`) | U1 (list+get), U2 (create+update+delete) |
| R-B1 | Boards (`/boards`) | U3 (list+get+create+update+delete) |
| R-P1 | Phases (`/phases`) | U3 (boards + phases share one unit) |
| R-PT1 | Project templates (`/projectTemplates`) | U4 |
| R-PF1 | Project fields list (`/projectFields`) | U5 |
| R-A1 | Archived projects (`/projects/archived`) | U6 |
| R-U1 | Permitted users (`/projects/{id}/permittedUsers`) | U7 |
| R-C1 | Project changelog (`/projects/{id}/changelog`) | U7 |

---

## Research / Patterns to Follow

### Existing project coverage (as of branch baseline)

`src/tools/projects.ts` exports `projectTools` (8 entries): `listProjects`, `getProject`,
`createProject`, `updateProject`, `deleteProject`, `archiveProject`, `searchProjects`,
`listProjectTasks`.

`listProjectTasks` already calls `GET /tasks?project_id=...` (line 250). The new full task CRUD
must NOT duplicate this handler — instead the new `listTasks` in `src/tools/tasks.ts` will handle
the general case, and `listProjectTasks` remains a convenience wrapper in `projects.ts`.

### Canonical handler pattern (from `src/tools/products.ts`)

```
const client = getClient();
const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
// conditional queryParams.set(...)
const response = await client.get<unknown[]>("/endpoint", queryParams, "v2");
if (!response.success || !response.data) return mcpErrorResult(response);
const data = response.data;
const pagination = extractPaginationV2(response);
return { content: [{ type: "text" as const, text: JSON.stringify({ summary, data, pagination }, null, 2) }] };
```

Single-item get, create, update follow the same shape without pagination. Delete:

```
const guard = destructiveOperationGuard();
if (guard) return guard;
const client = getClient();
const response = await client.delete<{ id: number }>(`/endpoint/${params.id}`, "v2");
if (!response.success || !response.data) return mcpErrorResult(response);
return { content: [{ type: "text" as const, text: JSON.stringify({ summary: `... deleted`, data: response.data }, null, 2) }] };
```

### Registration pattern (from `src/tools/index.ts`)

The index imports named `*Tools` arrays and spreads them into `allTools`. New task, board, and
phase tools must be registered here. Project-fields (U5) is appended to `fieldTools` in the
existing `src/tools/fields.ts`. Archived projects, permitted users, and changelog (U6/U7) are
additive to `src/tools/projects.ts`.

### Test pattern (from `tests/integration/tools/products.read.test.ts`)

```typescript
import { setupValidEnv } from '../../helpers/mockEnv.js';
import { mockFetch, mockApiSuccess, mockApiError, paginationFixtures } from '../../helpers/mockFetch.js';

describe('listTasks', () => {
  beforeEach(() => { setupValidEnv(); vi.unstubAllGlobals(); });

  it('returns list with summary', async () => {
    mockFetch({ data: [...], additional_data: paginationFixtures.v2NoMore });
    const { listTasks } = await import('../../../src/tools/tasks.js');
    const result = await listTasks({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary).toContain('3 tasks');
  });
});
```

---

### Verified v2 shapes (from `docs/api/openapi-v2.yaml`)

#### Tasks

**GET /tasks** (line 20984) - `getTasks` - cursor pagination, limit max 500
- Query params: `cursor`, `limit`, `is_done` (boolean), `is_milestone` (boolean), `assignee_id` (int), `project_id` (int), `parent_task_id` (string — `null` for root-only, integer for subtasks)
- Response: `data[]` with `{ id, title, creator_id, description, project_id, is_done, is_milestone, due_date, start_date, parent_task_id, assignee_ids[], priority, add_time, update_time, marked_as_done_time }`, `additional_data.next_cursor`

**POST /tasks** (line 21145) - `addTask` - response 201 Created
- Required body: `title` (string, min 1, max 255), `project_id` (int)
- Optional body: `parent_task_id` (int, nullable), `description` (string, nullable), `done` (int enum 0|1), `milestone` (int enum 0|1), `due_date` (date string, nullable), `start_date` (date string, nullable), `assignee_id` (int, nullable), `assignee_ids` (array int, maxItems 10), `priority` (int, nullable, min 0)
- **Note:** POST uses `done` (int 0|1) and `milestone` (int 0|1), NOT booleans `is_done`/`is_milestone`. GET response uses `is_done`/`is_milestone` booleans. The schema naming asymmetry is spec-accurate and must be followed.
- Response: same task shape as GET, `additional_data: null`

**GET /tasks/{id}** (line 21319) - `getTask`
- Path param: `id` (int)
- Response: single task object, `additional_data: null`

**PATCH /tasks/{id}** (line 21438) - `updateTask`
- Path param: `id` (int)
- Body: all optional (same fields as POST)
- Response: updated task object

**DELETE /tasks/{id}** (line 21615) - `deleteTask` - "If the task has subtasks, those will also be deleted"
- Response: `{ success, data: { id }, additional_data: null }`

#### Boards

**GET /boards** (line 21661) - `getProjectsBoards`
- **No cursor/limit params** - returns all active boards in one response (no pagination)
- Response: `data[]` with `{ id, name, order_nr, add_time, update_time }`, `additional_data: null`
- **Spec discrepancy noted:** no pagination on this endpoint (confirmed at line 21675 — no parameters block)

**POST /boards** (line 21720) - `addProjectBoard`
- Required body: `name` (string)
- Optional body: `order_nr` (int, min 1, max total_boards + 1)
- Response: single board object

**GET /boards/{id}** (line 21787) - `getProjectsBoard`
- Response: single board object

**PATCH /boards/{id}** (line 21846) - `updateProjectBoard`
- Optional body: `name`, `order_nr`
- Response: updated board object

**DELETE /boards/{id}** (line 21917) - `deleteProjectBoard` - "Marks a project board as deleted"
- Response: `{ success, data: { id } }`

#### Phases

**GET /phases** (line 21958) - `getProjectsPhases`
- **Required query param:** `board_id` (int) — not optional, spec says `required: true`
- **No cursor/limit params** - returns all active phases for a board in one response
- Response: `data[]` with `{ id, name, board_id, order_nr, add_time, update_time }`, `additional_data: null`

**POST /phases** (line 22029) - `addProjectPhase`
- Required body: `name` (string), `board_id` (int)
- Optional body: `order_nr` (int, min 1)
- Response: single phase object

**GET /phases/{id}** (line 22104) - `getProjectsPhase`
- Response: single phase object

**PATCH /phases/{id}** (line 22167) - `updateProjectPhase`
- Optional body: `name`, `board_id`, `order_nr`
- Response: updated phase object

**DELETE /phases/{id}** (line 22245) - `deleteProjectPhase` - "Marks a project phase as deleted"
- Response: `{ success, data: { id } }`

#### Project Templates

**GET /projectTemplates** (line 20327) - `getProjectTemplates` - cursor paginated
- Query params: `cursor`, `limit` (max 500)
- Response: `data[]` with `{ id, title, description, projects_board_id, owner_id, add_time, update_time }`, `additional_data.next_cursor`

**GET /projectTemplates/{id}** (line 20411) - `getProjectTemplate`
- Path param: `id` (int)
- Response: single template object

#### Project Fields

**GET /projectFields** (line 18229) - `getProjectFields` - cursor paginated, v2
- Query params: `limit` (max 500), `cursor`
- OAuth scopes: `projects:read`, `projects:full`, `project-fields:full`
- Response: `data[]` with `{ field_name, field_code, field_type, is_custom_field, is_optional_response_field, options[] }`, `additional_data.next_cursor`
- `field_type` enum includes `projects_board`, `projects_phase` (project-specific types)

#### Archived Projects

**GET /projects/archived** (line 19782) - `getArchivedProjects` - cursor paginated
- Query params: `filter_id` (int), `status` (string, e.g. `open,completed`), `phase_id` (int), `limit` (max 500), `cursor`
- **Note:** This is a static path `/projects/archived` — it is NOT a dynamic `{status}` variant. It is the archived list endpoint regardless of status filter.
- Response: same project schema as `GET /projects`

#### Permitted Users

**GET /projects/{id}/permittedUsers** (line 20841) - `getProjectUsers`
- Path param: `id` (int)
- **No pagination** — returns `data[]` as an array of integer user IDs directly
- Response: `{ success, data: [123, 456] }` — data is `integer[]` not object array
- No `additional_data` field

#### Project Changelog

**GET /projects/{id}/changelog** (line 20883) - `getProjectChangelog` - cursor paginated
- Path param: `id` (int)
- Query params: `limit` (max 500), `cursor`
- Response: `data[]` with `{ change_source, change_source_user_agent, time, new_values, old_values, actor_user_id }`, `additional_data.next_cursor`

---

## Output Structure

This is the recommended file structure. Tasks and boards/phases are new files due to size; the
fields, archived, permitted-users, and changelog additions fit in existing files.

```
src/
  schemas/
    tasks.ts           # NEW - all task schemas (list, get, create, update, delete)
    boards.ts          # NEW - board + phase schemas (they share a domain)
    projects.ts        # EDIT - add: ListProjectTemplatesSchema, GetProjectTemplateSchema, ListArchivedProjectsSchema, GetProjectPermittedUsersSchema, GetProjectChangelogSchema
    fields.ts          # EDIT - add: ListProjectFieldsSchema
  tools/
    tasks.ts           # NEW - all task handlers + taskTools array
    boards.ts          # NEW - board + phase handlers + boardTools + phaseTools arrays
    projects.ts        # EDIT - add: listProjectTemplates, getProjectTemplate, listArchivedProjects, getProjectPermittedUsers, getProjectChangelog handlers
    fields.ts          # EDIT - add: listProjectFields handler + fieldTools entry
    index.ts           # EDIT - import + spread taskTools, boardTools, phaseTools (new files); no change for projects/fields

tests/
  unit/schemas/
    tasks.test.ts      # NEW
    boards.test.ts     # NEW (covers boards + phases)
  integration/tools/
    tasks.test.ts      # NEW (multiple describe blocks per operation)
    boards.test.ts     # NEW (boards + phases)
    projects.archived.test.ts   # NEW
    projects.changelog.test.ts  # NEW
```

**Decision: project templates go in `src/tools/projects.ts`** (additive, thematically adjacent;
2 read-only handlers do not warrant a new file). Their schemas go in `src/schemas/projects.ts`.

**Decision: boards and phases share `src/tools/boards.ts` and `src/schemas/boards.ts`** because:
phases are always scoped to a board (`board_id` required), they share GET/POST/PATCH/DELETE shape,
and the combined handler count (~10 handlers) remains manageable in one file. Export two separate
arrays, `boardTools` and `phaseTools` (matching the `index.ts` import below), for clearer
granularity in the registration list.

**`src/tools/index.ts` changes required:**
```typescript
import { taskTools } from "./tasks.js";
import { boardTools, phaseTools } from "./boards.js";

export const allTools = [
  ...dealTools,
  ...personTools,
  ...activityTools,
  ...noteTools,
  ...leadsTools,
  ...projectTools,    // now includes archived/permittedUsers/changelog
  ...productTools,
  ...taskTools,       // NEW Tier 1
  ...boardTools,      // NEW Tier 1
  ...phaseTools,      // NEW Tier 1
  ...mailTools,
  ...fieldTools,      // now includes listProjectFields
  ...organizationTools,
  ...pipelineTools,
  ...userTools,
];
```

---

## Implementation Units

Units are ordered for incremental, independently-mergeable delivery. U1-U2 share the `tasks.ts`
files (sequential). U3 (boards+phases) is in new files, file-disjoint from U1-U2. U5 (project
fields) edits only `fields.ts`, disjoint from everything else here. U4, U6, and U7 all edit
`src/tools/projects.ts` (and its schema), so they are NOT disjoint from each other — they must be
serialized or merged into one PR (see R-6).

The recommended PR strategy: **U1+U2 as one PR** (tasks CRUD), **U3 as one PR** (boards+phases),
**U5 as one PR** (project fields — `fields.ts`, fully disjoint), and the `projects.ts` extensions as
**PR A = U4+U6** then **PR B = U7** (they share `projects.ts`; see Sequencing). Decide the exact
bundling based on review bandwidth — U5 must NOT be bundled into the `projects.ts` PRs (different file).

---

### U1 - Tasks read (list, get)

**Goal:** Add `listTasks` and `getTask` as the foundational task handlers. Establishes
`src/tools/tasks.ts` and `src/schemas/tasks.ts`. `listTasks` is the general-purpose task list
(optional `project_id` filter); the existing `listProjectTasks` stays as a narrowly-scoped
project convenience — see R-1 for the sharpened descriptions that keep the two non-overlapping.

**Requirements:** R-T1 (partial)

**Dependencies:** None (greenfield files)

**Files:**
- `src/schemas/tasks.ts` (new)
- `src/tools/tasks.ts` (new, read handlers + `taskTools` array with 2 entries)
- `src/tools/index.ts` (edit: import + spread `...taskTools`)
- `tests/unit/schemas/tasks.test.ts` (new)
- `tests/integration/tools/tasks.test.ts` (new, listTasks + getTask blocks)

**Approach:**
- `ListTasksSchema` extends `PaginationParamsSchema` with `is_done` (boolean optional), `is_milestone` (boolean optional), `assignee_id` (int optional), `project_id` (int optional), `parent_task_id` (string optional — API accepts `"null"` as a string to mean root-only, or an integer-string for subtask filtering)
- **Limit cap (intentional):** `PaginationParamsSchema` / `buildPaginationParamsV2` clamp `limit` to max 100, matching every other v2 list tool, even though the `/tasks` spec documents max 500. Do NOT raise the schema max to 500 — keep parity with the existing convention. The test asserting `limit>100` rejection is correct, not a defect. (Applies equally to U4 templates, U5 fields, U6 archived, U7 changelog.)
- `GetTaskSchema` = `IdParamSchema`
- `listTasks`: `buildPaginationParamsV2` + conditionally set each filter; `client.get<unknown[]>("/tasks", queryParams, "v2")`
- `getTask`: `client.get<unknown>(\`/tasks/${params.id}\`, undefined, "v2")`

**Patterns to follow:** `listProducts` / `getProduct` in `src/tools/products.ts`

**Test scenarios (`tasks.schema.test.ts`):**
- `ListTasksSchema` accepts empty input (defaults: limit=50)
- `ListTasksSchema` accepts all filter params and forwards them
- `ListTasksSchema` rejects limit=0 and limit>100
- `GetTaskSchema` requires `id` as positive int

**Test scenarios (`tasks.test.ts` - listTasks):**
- Returns list + summary using `createListSummary("task", ...)`
- Pluralizes correctly (1 task, 3 tasks)
- Pagination cursor forwarded in next response; `has_more` correct
- `is_done=true` forwarded as `"true"` in query string
- `is_milestone`, `assignee_id`, `project_id` each forwarded when present, absent when not set
- API failure returns `isError: true`

**Test scenarios (`tasks.test.ts` - getTask):**
- Returns task data with summary `"Task {id}"`
- 404 response surfaces NOT_FOUND via `mcpErrorResult`

**Verification:** `npm run build` clean, `npm test` green, `listTasks`/`getTask` registered in allTools

---

### U2 - Tasks write (create, update, delete)

**Goal:** Add `createTask`, `updateTask`, `deleteTask`. Completes the full task CRUD surface.

**Requirements:** R-T1 (complete)

**Dependencies:** U1 (same `tasks.ts` files; must land sequentially)

**Files:**
- `src/schemas/tasks.ts` (edit: add `CreateTaskSchema`, `UpdateTaskSchema`, `DeleteTaskSchema`)
- `src/tools/tasks.ts` (edit: add 3 handlers + 3 `taskTools` entries)
- `tests/unit/schemas/tasks.test.ts` (edit: add create/update/delete schema test blocks)
- `tests/integration/tools/tasks.test.ts` (edit: add createTask, updateTask, deleteTask blocks)

**Approach:**
- `CreateTaskSchema`: `title` (string, min 1, max 255, required), `project_id` (int, required), all others optional
- `UpdateTaskSchema`: `IdParamSchema` extended with all body fields optional
- `DeleteTaskSchema`: `IdParamSchema`
- **Key asymmetry (done/milestone):** POST/PATCH body uses `done` (int 0|1) and `milestone` (int 0|1), NOT booleans. The `is_done`/`is_milestone` booleans are only GET-response fields. Because the GET response trains the calling LLM on the boolean names, the LLM is likely to send `done: true` on create/update. Two mitigations, both required:
  1. **Coerce, don't hard-reject:** wrap the field in `z.preprocess` that maps `true`/`false` to `1`/`0` before a `z.union([z.literal(0), z.literal(1)])` check, so a stray `done: true` becomes `done: 1` rather than a hard validation error the LLM cannot easily self-correct. (Reject genuinely out-of-range values like `2` or non-coercible strings.)
  2. **LLM-visible description:** state in the `createTask`/`updateTask` tool *descriptions* (the LLM never sees schema comments) that `done`/`milestone` take `0` or `1`, and that the corresponding read fields are `is_done`/`is_milestone`.
- `createTask`: build body with required fields first, then conditionally add optional fields
- `updateTask`: `const { id, ...fields } = params;`, build body with only defined fields
- `deleteTask`: `destructiveOperationGuard()` first; note the subtask cascade in the summary string

**Test scenarios (`tasks.schema.test.ts`):**
- `CreateTaskSchema` requires both `title` and `project_id`
- `CreateTaskSchema` rejects `title` of length 0 and > 255
- `done` field accepts `0` and `1`, coerces `true`→`1` and `false`→`0`, rejects `2` and non-coercible values
- `milestone` field same constraints
- `assignee_ids` max 10 items
- `UpdateTaskSchema` only requires `id`

**Test scenarios (`tasks.test.ts` - createTask):**
- Required fields (`title`, `project_id`) sent in body
- Optional fields (`description`, `done`, `assignee_ids`, `due_date`, `priority`) forwarded when present, absent when not set
- Summary says "Task created"
- API failure returns `isError: true`

**Test scenarios (`tasks.test.ts` - updateTask):**
- `id` becomes path param, not body field
- Empty update (only `id`) sends empty body
- Partial field forwarding

**Test scenarios (`tasks.test.ts` - deleteTask):**
- `destructiveOperationGuard` returns error with no network call when env unset
- With `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`, calls `DELETE /tasks/{id}`
- Summary mentions subtask cascade: "Task {id} deleted (subtasks also deleted)"
- API failure returns `isError: true`

**Verification:** `npm run build` clean, `npm test` green

---

### U3 - Boards and phases (full CRUD)

**Goal:** Add list, get, create, update, delete for both boards and phases. Boards are a global
resource; phases are always scoped to a board (`board_id` required for list/create).

**Requirements:** R-B1, R-P1

**Dependencies:** None (new files, file-disjoint from U1/U2)

**Files:**
- `src/schemas/boards.ts` (new)
- `src/tools/boards.ts` (new; exports `boardTools` and `phaseTools`)
- `src/tools/index.ts` (edit: import + spread `...boardTools`, `...phaseTools`)
- `tests/unit/schemas/boards.test.ts` (new)
- `tests/integration/tools/boards.test.ts` (new; covers boards + phases)

**Approach:**

Boards:
- `ListBoardsSchema`: `z.object({})` (no params — GET /boards has NO pagination or filters)
- `GetBoardSchema`: `IdParamSchema`
- `CreateBoardSchema`: `name` (string required), `order_nr` (int, min 1, optional)
- `UpdateBoardSchema`: `IdParamSchema.extend({ name: z.string().optional(), order_nr: z.number().int().min(1).optional() })`
- `DeleteBoardSchema`: `IdParamSchema`
- `listBoards`: `client.get<unknown[]>("/boards", undefined, "v2")` — no pagination call; response is the full list. Use `createListSummary("project board", ...)` but no `pagination` key in output (no `additional_data.next_cursor` in spec).

Phases:
- `ListPhasesSchema`: `z.object({ board_id: z.number().int().positive() })` — `board_id` is REQUIRED per spec
- `GetPhaseSchema`: `IdParamSchema`
- `CreatePhaseSchema`: `name` (string required), `board_id` (int required), `order_nr` (int, min 1, optional)
- `UpdatePhaseSchema`: `IdParamSchema.extend({ name?, board_id?, order_nr? })`
- `DeletePhaseSchema`: `IdParamSchema`
- `listPhases`: `queryParams.set("board_id", String(params.board_id))`; `client.get<unknown[]>("/phases", queryParams, "v2")` — no cursor pagination

**Patterns to follow:** `deleteProduct` for gated deletes; `listProducts` for list pattern. Note that boards and phases deviate from cursor-pagination — their list responses return all records without `next_cursor`.

**Test scenarios (`boards.schema.test.ts`):**
- `ListBoardsSchema` accepts empty object
- `CreateBoardSchema` requires `name`, rejects empty string
- `UpdateBoardSchema` only requires `id`
- `order_nr` < 1 rejected (min 1)
- `ListPhasesSchema` requires `board_id`, rejects missing or non-positive
- `CreatePhaseSchema` requires both `name` and `board_id`

**Test scenarios (`boards.test.ts` - boards):**
- `listBoards` returns all boards; summary uses `createListSummary("project board", ...)` — no `pagination` key in output
- `getBoard` returns board with summary
- `createBoard` sends `name` (required) and optionally `order_nr`
- `updateBoard` splits `id` into path, sends only defined fields
- `deleteBoard`: guard blocks when env unset (no fetch); with env enabled, calls `DELETE /boards/{id}`; summary "Project board {id} deleted"
- `listBoards` API failure returns `isError: true`

**Test scenarios (`boards.test.ts` - phases):**
- `listPhases` requires `board_id` in query string
- `createPhase` requires `name` and `board_id` in body
- `updatePhase` splits `id` into path, `board_id` can move to body (re-parenting a phase)
- `deletePhase`: guard blocks; with env, calls `DELETE /phases/{id}`
- API failure returns `isError: true`

**Verification:** `npm run build` clean, `npm test` green, boards + phases in allTools

---

### U4 - Project templates (list, get)

**Goal:** Add `listProjectTemplates` and `getProjectTemplate`. Read-only; no create/update/delete
in spec. Templates are global/account-level resources.

**Requirements:** R-PT1

**Dependencies:** File-disjoint from U1-U3, but U4 shares `projects.ts` (and its schema) with U6
and U7 — serialize or co-PR with them (see R-6).

**Files:**
- `src/schemas/projects.ts` (edit: add `ListProjectTemplatesSchema`, `GetProjectTemplateSchema`)
- `src/tools/projects.ts` (edit: add 2 handlers + 2 `projectTools` entries)
- `tests/unit/schemas/projects.test.ts` (edit: add template schema test blocks)
- `tests/integration/tools/projects.test.ts` (edit: add listProjectTemplates, getProjectTemplate blocks)

**Approach:**
- `ListProjectTemplatesSchema`: `PaginationParamsSchema` (cursor + limit only)
- `GetProjectTemplateSchema`: `IdParamSchema`
- `listProjectTemplates`: standard `buildPaginationParamsV2` + `extractPaginationV2` + `createListSummary("project template", ...)`; endpoint `GET /projectTemplates`
- `getProjectTemplate`: `client.get<unknown>(\`/projectTemplates/${params.id}\`, undefined, "v2")`; summary `"Project template ${params.id}"`

**Patterns to follow:** `listProducts` / `getProduct`

**Test scenarios (`projects.test.ts`):**
- `listProjectTemplates` returns list with pagination; summary counts "1 project template", "3 project templates"
- Pagination cursor forwarded; `has_more` correct
- `getProjectTemplate` returns template object with summary
- Not-found (404) returns `isError: true`

**Verification:** `npm run build` clean, `npm test` green

---

### U5 - Project fields (list)

**Goal:** Add `listProjectFields` to `src/tools/fields.ts`. Read-only metadata list. Pattern
already established by `listProductFields` which was added in issue #50 slice 3.

**Requirements:** R-PF1

**Dependencies:** None (disjoint from U1-U4)

**Files:**
- `src/schemas/fields.ts` (edit: add `ListProjectFieldsSchema`)
- `src/tools/fields.ts` (edit: add `listProjectFields` handler + `fieldTools` entry)
- `tests/unit/schemas/fields.test.ts` (edit: add project fields schema block)
- `tests/integration/tools/fields.test.ts` (edit: add `listProjectFields` block)

**Approach:**
- `ListProjectFieldsSchema`: `PaginationParamsSchema` (same as `ListProductFieldsSchema` minus `include_fields` — the spec for `/projectFields` does not list an `include_fields` param)
- `listProjectFields`: `client.get<unknown[]>("/projectFields", queryParams, "v2")` + `createListSummary("project field", ...)`

**Patterns to follow:** `listProductFields` in `src/tools/fields.ts`

**Test scenarios (`fields.test.ts`):**
- Returns list with pagination
- Summary text uses `createListSummary("project field", ...)`
- API failure returns `isError: true`

**Verification:** `npm run build` clean, `npm test` green

---

### U6 - Archived projects (list)

**Goal:** Add `listArchivedProjects` to `src/tools/projects.ts`. The `/projects/archived` endpoint
shares filter params with the existing `listProjects` but is a separate endpoint and should be a
separate tool for clarity.

**Requirements:** R-A1

**Dependencies:** Additive to `projects.ts` and `projects` schema. Coordinate sequencing with U4
and U7 (all touch the same two files) — land sequentially or as one combined PR.

**Files:**
- `src/schemas/projects.ts` (edit: add `ListArchivedProjectsSchema`)
- `src/tools/projects.ts` (edit: add `listArchivedProjects` handler + `projectTools` entry)
- `tests/unit/schemas/projects.test.ts` (edit: add archived schema test block)
- `tests/integration/tools/projects.test.ts` (edit: add `listArchivedProjects` block)

**Approach:**
- `ListArchivedProjectsSchema`: `PaginationParamsSchema.extend({ filter_id?, status?, phase_id? })` — same optional filters as `ListProjectsSchema`
- `listArchivedProjects`: same as `listProjects` but endpoint is `"/projects/archived"` — use `createListSummary("archived project", ...)`

**Test scenarios:**
- `listArchivedProjects` calls `GET /projects/archived` (verify URL in mock)
- `filter_id`, `status`, `phase_id` each forwarded when present, absent when not set
- Pagination cursor forwarded
- Summary uses "archived project" noun
- API failure returns `isError: true`

**Verification:** `npm run build` clean, `npm test` green

---

### U7 - Permitted users + project changelog

**Goal:** Add `getProjectPermittedUsers` and `getProjectChangelog`. Both are per-project read
endpoints with different response shapes. Group in one unit because they are both small additions
to the same files as U4/U6.

**Requirements:** R-U1, R-C1

**Dependencies:** Additive to `projects.ts` / `projects` schema. Land after or alongside U4/U6
(they all edit the same two files — coordinate into the same PR or strictly sequence them).

**Files:**
- `src/schemas/projects.ts` (edit: add `GetProjectPermittedUsersSchema`, `GetProjectChangelogSchema`)
- `src/tools/projects.ts` (edit: add 2 handlers + 2 `projectTools` entries)
- `tests/unit/schemas/projects.test.ts` (edit: add 2 schema blocks)
- `tests/integration/tools/projects.test.ts` (edit: add 2 handler blocks)

**Approach:**

Permitted users:
- `GetProjectPermittedUsersSchema`: `IdParamSchema` (project id only, no pagination)
- `getProjectPermittedUsers`: `client.get<number[]>(\`/projects/${params.id}/permittedUsers\`, undefined, "v2")`
- Response shape is unusual: `data` is `number[]` (user IDs), no `additional_data`. Build summary as `"${data.length} permitted user(s) for project ${params.id}"`.
- No `extractPaginationV2` call — the endpoint has no pagination

Project changelog:
- `GetProjectChangelogSchema`: `PaginationParamsSchema.extend({ id: z.number().int().positive() })`
- `getProjectChangelog`: `buildPaginationParamsV2(params.cursor, params.limit)` + `client.get<unknown[]>(\`/projects/${params.id}/changelog\`, queryParams, "v2")`
- Summary: `createListSummary("changelog entry", data.length, pagination.has_more)` with `pagination` key

**Test scenarios (`projects.test.ts` - permittedUsers):**
- Returns array of user IDs (integers)
- Summary contains user count
- Empty array handled (0 permitted users)
- API failure returns `isError: true`

**Test scenarios (`projects.test.ts` - changelog):**
- Returns paginated list; summary uses "changelog entry"
- Pagination cursor forwarded
- `actor_user_id`, `new_values`, `old_values` present in each entry
- API failure returns `isError: true`

**Verification:** `npm run build` clean, `npm test` green

> **Note:** This plan has seven units (U1-U7). `getProjectTemplate` (get-by-id) is covered by U4
> alongside the templates list — there is no separate unit for it. PR-grouping guidance for the
> shared-`projects.ts` units lives in the Sequencing section below.

---

## Risks

**R-1 (listTasks vs listProjectTasks — overlapping tools).** `listTasks` (general, optional
`project_id`) is a functional superset of the existing `listProjectTasks` (project-scoped). For an
LLM caller, two tools that both "list a project's tasks" raise tool-selection cost and can drift.
**Decision: keep both, but make the boundary explicit and the drift risk bounded.**
- **Sharpen descriptions so they do not overlap.** `pipedrive_list_project_tasks`: "List tasks for
  a project you already have the ID for — pass only `id` (the project ID; `ListProjectTasksSchema`
  exposes `id`, not `project_id`)." `pipedrive_list_tasks`: "General
  task query across all projects, with optional `project_id`, `assignee_id`, done/milestone, and
  parent filters. Use for anything beyond a single project's full task list."
- **Bound the drift.** Both call `GET /tasks` with identical response handling, so today they cannot
  diverge in output shape; only the filter set differs. If `listTasks` later gains response-shaping
  logic, refactor `listProjectTasks` to delegate to it at that point. Until then no delegation is
  needed and U1 stays greenfield.
- The one-line description tweak to `listProjectTasks` is a trivial, non-conflicting edit folded
  into whichever `projects.ts`-touching unit lands first (U4/U6/U7).

**R-2 (boards and phases have no cursor pagination).** The list endpoints for `/boards` and
`/phases` return all records with no `next_cursor`. Handlers must NOT call `extractPaginationV2`
on these responses (it would silently return `has_more: false` but the output shape would be
misleading). Mitigation: explicitly skip the `pagination` key in the response JSON for these two
endpoints, and note this in comments.

**R-3 (GET /phases requires board_id).** Unlike most list endpoints, `board_id` is a REQUIRED
query param for `GET /phases`. The Zod schema must enforce this (`z.number().int().positive()`
without `.optional()`). Without it the API will likely return a 400 or empty result. Mitigation:
enforce in schema; assert in test.

**R-4 (task body asymmetry: done/milestone vs is_done/is_milestone).** POST/PATCH task body uses
`done` (int 0|1) and `milestone` (int 0|1); GET response returns `is_done`/`is_milestone`
(booleans). The GET response trains the LLM on the boolean names, so it will likely send
`done: true` on write. Mitigation (see U2 Approach): wrap the write fields in `z.preprocess` that
coerces `true`/`false` → `1`/`0` before the `z.union([z.literal(0), z.literal(1)])` check (so a
stray boolean is repaired, not hard-rejected), AND state the `0`/`1` rule in the LLM-visible
`createTask`/`updateTask` tool descriptions. Add schema tests for both the accept and coerce paths.

**R-5 (permittedUsers response is `number[]`, not `object[]`).** The response `data` is an array
of integers, not objects. `client.get<number[]>(...)` is the correct type annotation. Do not
call `extractPaginationV2` or `createListSummary` in the normal way — build a manual summary
string. Mitigation: explicit type annotation + bespoke summary + test that checks data is an array
of numbers.

**R-6 (shared-file sequencing: U4/U6/U7 all edit `projects.ts`).** These three units cannot land
in parallel to the same branch. Recommended: land U4+U6 together (same PR), then U7 (separate
PR). Both PRs can be drafted in parallel on feature branches and merged sequentially.

**R-7 (Beta tag).** The task/board/phase/project endpoints carry the `Beta` tag. Add "(Projects
add-on; Projects API in public beta.)" to all new tool descriptions, consistent with existing
`projectTools` descriptions. **Exception:** `GET /projectTemplates` is NOT Beta-tagged in the spec
(see Q5) — omit the beta disclaimer from the two template tool descriptions.

**R-8 (tool-count growth / agent selection — accept, with awareness).** This adds ~17 tools (tasks
×5, boards ×5, phases ×5, templates ×2, plus fields/archived/permittedUsers/changelog) to an
already-large surface; the consumer is an LLM doing tool selection from a flat list. We accept the
growth — the endpoints are in scope for #68 — but the mitigation is that each new tool gets a
distinct, action-scoped description (R-1 makes the one genuine near-duplicate explicit). If agent
tool-selection accuracy is ever measured and degrades, the levers are: consolidate near-duplicates,
group related tools in `allTools` registration order, or gate the Projects-add-on tools behind an
env flag for operators without the add-on. None of those are needed now; noted so the option is
pre-identified rather than discovered late.

**R-9 (limit cap is intentional, not a spec mismatch).** Every new paginated list tool (tasks,
templates, fields, archived, changelog) caps `limit` at 100 via the shared `PaginationParamsSchema`
/ `buildPaginationParamsV2`, even though several of these endpoints document a spec max of 500. This
is deliberate parity with every existing v2 list tool — do NOT raise the schema max to 500 for these
endpoints. The "rejects limit>100" test assertions are correct.

---

## Test Strategy

- Per CLAUDE.md: unit tests for every new/edited schema (`tests/unit/schemas/`); integration tests
  for every handler (`tests/integration/tools/`) using `setupValidEnv()` + mocked `fetch`.
- Every unit's tests must assert:
  - Param forwarding: each optional param present when set, absent (not in URL) when not set
  - Pagination: cursor forwarded; `has_more` true/false; `next_cursor` extracted
  - `isError: true` on API failure via `mcpErrorResult`
  - For deletes: `destructiveOperationGuard` returns error with NO network call when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset; with env set, DELETE path is called correctly
  - Board/phase-specific: no `pagination` key in response for non-paginated list endpoints
  - Phases-specific: `board_id` absent from query → schema rejection before any handler call
  - Tasks-specific: `done`/`milestone` accept `0`/`1`, coerce `true`/`false`→`1`/`0`, reject `2`; `createTask`/`updateTask` descriptions state the int-vs-bool rule (LLM-visible)
  - PermittedUsers-specific: `data` is an array of integers

---

## Sequencing

The recommended implementation order. The numbering is **not** a strict dependency chain: U5
(`fields.ts`) and the U4/U6/U7 group (`projects.ts`) are file-disjoint and can proceed in parallel.
Real ordering constraints are only U2-after-U1 and U7-after-U4+U6.

1. **U1** (tasks read) — new files, no dependencies, smallest surface to review
2. **U2** (tasks write) — additive to U1's files, sequence after U1 lands
3. **U3** (boards + phases) — new files, fully disjoint from U1/U2, can start in parallel
4. **U5** (project fields) — edits only `fields.ts`/`fields` schema; disjoint from everything else, can land any time
5. **U4 + U6** (templates + archived) — additive to `projects.ts` / `projects` schema
6. **U7** (permittedUsers + changelog) — same files as U4/U6, sequence after U4+U6 land

**PR grouping for the `projects.ts` extensions** (U4/U6/U7 all edit the same two files, so they
cannot land in parallel):
- **PR A**: U4 (templates) + U6 (archived)
- **PR B**: U7 (permittedUsers + changelog)

Both PRs are file-disjoint from U1-U3 and U5 but overlap each other — land PR A, then PR B.

**File disjoint matrix** (summary):

| Unit | `tasks.ts` | `boards.ts` | `projects.ts` | `fields.ts` | `index.ts` |
|------|-----------|------------|--------------|------------|-----------|
| U1 | schema+tool (new) | - | - | - | edit |
| U2 | schema+tool (edit) | - | - | - | - |
| U3 | - | schema+tool (new) | - | - | edit |
| U4 | - | - | schema+tool (edit) | - | - |
| U5 | - | - | - | schema+tool (edit) | - |
| U6 | - | - | schema+tool (edit) | - | - |
| U7 | - | - | schema+tool (edit) | - | - |

U4, U6, U7 all edit `projects.ts` — they must be serialized or merged into one PR.

**Parallelizable with #67, #69, #70:** This entire issue is file-disjoint from:
- #67 (deals sub-resources — touches `deals.ts`)
- #69 (cross-entity followers + media — touches `deals.ts`, `persons.ts`, `organizations.ts`, `client.ts`)
- #70 (config writes — touches `fields.ts`, `pipelines.ts`, and stages files)

Exception: U5 (project fields in `fields.ts`) has a potential conflict with #70 which also edits
`fields.ts`. If both land in the same sprint, serialize #68-U5 before #70 or merge them.

---

## Open Questions

**Q1 (resolved):** Do `/boards` and `/phases` have cursor pagination? No — confirmed at lines
21661 and 21958. Neither endpoint has `cursor` or `limit` parameters. Handlers must not call
`buildPaginationParamsV2` or `extractPaginationV2` for these list endpoints.

**Q2 (resolved):** Are `/projects/{id}/plan` and `/projects/{id}/groups` in the spec? No —
confirmed by grep of the vendored `openapi-v2.yaml`. These paths do not exist. Do not implement.

**Q3:** Should `deleteBoard` and `deletePhase` include a note about cascading effects? The spec
says "Marks a project board/phase as deleted" with no explicit cascade warning. Tasks reference
`project_id`, not `board_id`. Default: do not add cascade warning unless spec confirms one.

**Q4 (resolved):** The `parent_task_id` filter on `GET /tasks` has type `string` in the spec (not
integer), to allow the string value `"null"` for root-only filtering — confirmed in
`docs/api/openapi-v2.yaml` and restated in "Verified v2 shapes" above. The Zod schema uses
`z.string().optional()` for this filter param, NOT `z.number()` (which would break the `"null"`
root-only filter). No implementation-time confirmation needed.

**Q5:** `GET /projectTemplates` is NOT tagged `Beta` in the spec (unlike tasks, boards, phases).
Omit the beta disclaimer from template tool descriptions, consistent with the spec's tagging.

---

## Confidence

**High** for U1-U3: endpoint shapes are fully specified and verified in the vendored spec; the
task/board/phase domain follows the same CRUD pattern as Products with minor variations (no
pagination for boards/phases; body field asymmetry for tasks). Direct templates to follow exist in
`products.ts`.

**High** for U4-U7: small additive units with verified spec shapes; patterns already established
in `projects.ts` and `fields.ts`.

**High** for the `parent_task_id` filter (Q4 now resolved): the spec confirms `type: string`, the
schema uses `z.string().optional()`, and the `"null"` root-only sentinel is handled. No open
ambiguity remains.

**Low risk overall:** No client-side changes required, no multipart uploads, no v1 dependencies,
no external service calls beyond the Pipedrive v2 API.
