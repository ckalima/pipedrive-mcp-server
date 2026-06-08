# Issue #43 — Projects create/update: send v2 plural ID arrays (org_ids/person_ids/label_ids)

> Implementation plan. A separate agent will implement from this document. It is self-contained and precise. Implement in **Zod 3** syntax (main is on Zod 3.25; do NOT pre-migrate to Zod 4 — that is pending #16 PR B).

---

## 1. Issue + one-line summary

**Issue #43:** `pipedrive_create_project` / `pipedrive_update_project` send `person_id` / `org_id` (scalars) and `labels` (wrong key) instead of the v2 plural integer arrays `person_ids` / `org_ids` / `label_ids`, so person/org associations and labels are **silently dropped** by the v2 API.

**Fix in one line:** Replace scalar `org_id`/`person_id` with integer-array `org_ids`/`person_ids`, rename `labels` → `label_ids` (already an array), across the schema, tool body keys, and tool `inputSchema`; remove the now-resolved `// guess` comments; flip the false-green tests to assert the v2 shape.

---

## 2. Root cause (file:line; sent vs. wanted)

This is a **regression introduced by #14** (`docs/plans/2026-06-07-issue-14-projects-tools.md`, line 9 explicitly flagged these as "conservative guesses"). The fields carry `// guess` comments to this day.

### `src/schemas/projects.ts`
- `CreateProjectSchema` (lines 57–62) declares:
  - `org_id: z.number().int().positive().optional()` (line 57) — **scalar; wrong shape**
  - `person_id: z.number().int().positive().optional()` (line 59) — **scalar; wrong shape**
  - `labels: z.array(z.number().int().positive()).optional()` (line 61) — **array, but WRONG KEY** (v2 wants `label_ids`)
- `UpdateProjectSchema` (lines 87–92) declares the same three fields with the same defects (`org_id` line 87, `person_id` line 89, `labels` line 91).
- `deal_ids` (create line 55, update line 85) is **already correct** (`z.array(z.number().int().positive())`); leave its type alone (just drop its `// guess` comment).

### `src/tools/projects.ts`
- `createProject` body assembly (lines 109–111) sends `body.org_id`, `body.person_id`, `body.labels`.
- `updateProject` body assembly (lines 148–150) sends `body.org_id`, `body.person_id`, `body.labels`.
- `inputSchema` for `pipedrive_create_project` (lines 328–330) exposes `org_id` (number), `person_id` (number), `labels` (array of number).
- `inputSchema` for `pipedrive_update_project` (lines 353–355) exposes the same three.

### What is sent vs. what v2 wants
| Currently sent | v2 expects | v2 type |
| --- | --- | --- |
| `org_id` (integer scalar) | `org_ids` | array of integer |
| `person_id` (integer scalar) | `person_ids` | array of integer |
| `labels` (integer array) | `label_ids` | array of integer |
| `deal_ids` (integer array) | `deal_ids` | array of integer (already correct) |

The singular keys (`org_id`, `person_id`) and the misnamed `labels` are **not in the v2 request schema**, so the v2 API ignores them and the associations/labels never persist.

---

## 3. v2 target shape (quoted from `docs/api/openapi-v2.yaml`, v2.0.0)

**POST `/projects`** (`operationId: addProject`, declared `post:` at line 19589). requestBody schema, lines 19635–19654:

```yaml
                deal_ids:                                    # line 19635
                  type: array
                  description: An array of IDs of the deals this project is associated with
                  items:
                    type: integer
                person_ids:                                  # line 19640
                  type: array
                  description: An array of IDs of the persons this project is associated with
                  items:
                    type: integer
                org_ids:                                     # line 19645
                  type: array
                  description: An array of IDs of the organizations this project is associated with
                  items:
                    type: integer
                label_ids:                                   # line 19650
                  type: array
                  description: An array of IDs of the labels this project has
                  items:
                    type: integer
```

**PATCH `/projects/{id}`** (`operationId: updateProject`, declared `patch:` at line 20090). requestBody schema is **identical**, lines 20140–20159:

```yaml
                deal_ids:                                    # line 20140
                  type: array
                  description: An array of IDs of the deals this project is associated with
                  items:
                    type: integer
                person_ids:                                  # line 20145
                  type: array
                  description: An array of IDs of the persons this project is associated with
                  items:
                    type: integer
                org_ids:                                     # line 20150
                  type: array
                  description: An array of IDs of the organizations this project is associated with
                  items:
                    type: integer
                label_ids:                                   # line 20155
                  type: array
                  description: An array of IDs of the labels this project has
                  items:
                    type: integer
```

Both endpoints: the four ID-association fields are `type: array, items: {type: integer}`. There is no `org_id`, `person_id`, or `labels` key anywhere in either schema. (Notes for the implementer: the spec also lists `health_status`, `template_id`, and `custom_fields` — these are **out of scope** for #43; do not add them.)

---

## 4. Changes — file by file, precise

### 4a. `src/schemas/projects.ts`

**`CreateProjectSchema`** — replace lines 55–62 (`deal_ids` through `labels`) so the block reads:

```ts
  deal_ids: z.array(z.number().int().positive()).optional()
    .describe("Deal IDs linked to the project"),
  person_ids: z.array(z.number().int().positive()).optional()
    .describe("Person IDs linked to the project"),
  org_ids: z.array(z.number().int().positive()).optional()
    .describe("Organization IDs linked to the project"),
  label_ids: z.array(z.number().int().positive()).optional()
    .describe("Label IDs to attach to the project"),
```

Changes within that block:
- `deal_ids` — type unchanged; **remove the `// guess` comment** and keep its description.
- DELETE the scalar `org_id` field.
- DELETE the scalar `person_id` field.
- DELETE the `labels` field; REPLACE with `label_ids` (same `z.array(z.number().int().positive()).optional()` type).
- ADD `person_ids` and `org_ids` as `z.array(z.number().int().positive()).optional()`.
- No `// guess` comments on any of the four (they are now spec-confirmed).

> Ordering tip: match the spec field order (`deal_ids`, `person_ids`, `org_ids`, `label_ids`). Ordering is cosmetic for Zod object schemas; pick this order for readability.

**`UpdateProjectSchema`** — apply the same transformation to lines 85–92, using "New …" phrasing consistent with the rest of that schema:

```ts
  deal_ids: z.array(z.number().int().positive()).optional()
    .describe("New deal IDs linked to the project"),
  person_ids: z.array(z.number().int().positive()).optional()
    .describe("New person IDs linked to the project"),
  org_ids: z.array(z.number().int().positive()).optional()
    .describe("New organization IDs linked to the project"),
  label_ids: z.array(z.number().int().positive()).optional()
    .describe("New label IDs to attach to the project"),
```

**Type exports:** `CreateProjectParams` (line 133) and `UpdateProjectParams` (line 134) are `z.infer<>` of the schemas — they update automatically. **No manual edit needed**, but be aware the inferred property names change (`org_id`→`org_ids`, etc.); this is what drives the tool-body edits below.

### 4b. `src/tools/projects.ts` — body assembly

**`createProject`** — replace lines 108–111. The new block (keep `deal_ids`, swap the other three):

```ts
  if (params.deal_ids) body.deal_ids = params.deal_ids;
  if (params.person_ids) body.person_ids = params.person_ids;
  if (params.org_ids) body.org_ids = params.org_ids;
  if (params.label_ids) body.label_ids = params.label_ids;
```

(Removes `body.org_id`, `body.person_id`, `body.labels`.)

**`updateProject`** — replace lines 147–150 (these read off `updateFields`):

```ts
  if (updateFields.deal_ids) body.deal_ids = updateFields.deal_ids;
  if (updateFields.person_ids) body.person_ids = updateFields.person_ids;
  if (updateFields.org_ids) body.org_ids = updateFields.org_ids;
  if (updateFields.label_ids) body.label_ids = updateFields.label_ids;
```

> Note on the `if (params.x)` truthiness guard: an empty array `[]` is truthy in JS, so `[]` would still be sent. That matches existing `deal_ids` behavior and is fine for #43 (the v2 custom-fields empty-array caveat in the spec applies to `set` custom fields, not these association arrays). Do not change the guard style.

### 4c. `src/tools/projects.ts` — `inputSchema` properties + descriptions

**`pipedrive_create_project` inputSchema** — replace lines 327–330. Keep `deal_ids`; convert `org_id`/`person_id` from `number` to integer arrays; rename `labels`→`label_ids`:

```ts
        deal_ids: { type: "array", items: { type: "number" }, description: "Deal IDs linked to the project" },
        person_ids: { type: "array", items: { type: "number" }, description: "Person IDs linked to the project" },
        org_ids: { type: "array", items: { type: "number" }, description: "Organization IDs linked to the project" },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to attach to the project" },
```

**`pipedrive_update_project` inputSchema** — replace lines 352–355:

```ts
        deal_ids: { type: "array", items: { type: "number" }, description: "New deal IDs linked to the project" },
        person_ids: { type: "array", items: { type: "number" }, description: "New person IDs linked to the project" },
        org_ids: { type: "array", items: { type: "number" }, description: "New organization IDs linked to the project" },
        label_ids: { type: "array", items: { type: "number" }, description: "New label IDs to attach to the project" },
```

> JSON-Schema `items` uses `type: "number"` to stay consistent with the existing `deal_ids` declaration and the rest of this file's inputSchema style (numeric IDs are declared `number`, not `integer`, throughout). Zod still enforces `.int().positive()`. Do not introduce `integer` here.

- `required` arrays are unaffected (these fields are all optional in both tools).

---

## 5. Test changes — every false-green assertion to flip + new assertions

> **Why false-green:** the suite currently passes while the bug ships. Two causes: (a) the unit schema test asserts the OLD/WRONG shape (`org_id`, `person_id`, `labels`) and would still pass against the broken code; (b) the integration test never asserts these association keys at all, so it cannot catch the wrong key being sent. Both must be corrected so the tests would FAIL on the old code and PASS only on the v2-correct code.

### 5a. `tests/unit/schemas/projects.test.ts`

**`CreateProjectSchema` › "should accept full payload"** (lines 107–128). In the `params` object, change:
- `org_id: 4,` → `org_ids: [4],`
- `person_id: 5,` → `person_ids: [5],`
- `labels: [10, 20],` → `label_ids: [10, 20],`

And update the assertion on line 127:
- `expect(result.labels).toEqual([10, 20]);` → `expect(result.label_ids).toEqual([10, 20]);`

Add two new assertions in the same test to lock the plural-array contract:
- `expect(result.person_ids).toEqual([5]);`
- `expect(result.org_ids).toEqual([4]);`

**`CreateProjectSchema` › "should accept positive-integer deal_ids and labels"** (lines 142–146). Rename the test and flip the `labels` usage to `label_ids`:
- Title → `'should accept positive-integer deal_ids and label_ids'`
- Parse input `labels: [3]` → `label_ids: [3]`
- Assertion line 145: `expect(result.labels).toEqual([3]);` → `expect(result.label_ids).toEqual([3]);`

**`CreateProjectSchema` › "should reject negative labels"** (lines 152–154). Rename + flip key:
- Title → `'should reject negative label_ids'`
- Body: `labels: [-1]` → `label_ids: [-1]`

Add **new** rejection tests (mirror the existing `deal_ids` negative test) so the new arrays are validated:
```ts
    it('should reject negative org_ids', () => {
      expect(() => CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, org_ids: [-1] })).toThrow();
    });

    it('should reject negative person_ids', () => {
      expect(() => CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, person_ids: [-1] })).toThrow();
    });
```

**`UpdateProjectSchema` › "should accept all updatable fields"** (lines 171–191). In the `params` object change:
- `org_id: 5,` → `org_ids: [5],`
- `person_id: 6,` → `person_ids: [6],`
- `labels: [7],` → `label_ids: [7],`

Add new assertions to verify the arrays round-trip:
- `expect(result.org_ids).toEqual([5]);`
- `expect(result.person_ids).toEqual([6]);`
- `expect(result.label_ids).toEqual([7]);`

> After these edits, grep `tests/unit/schemas/projects.test.ts` for `org_id`, `person_id`, `labels` (singular/old) and confirm **zero** matches for the old keys (only `org_ids`/`person_ids`/`label_ids` remain). `deal_ids` references stay as-is.

### 5b. `tests/integration/tools/projects.test.ts`

There is currently **no** assertion on `org_id`/`person_id`/`labels` (grep confirms only `deal_ids` is asserted, lines 197 & 203). The fix here is to ADD coverage that asserts the v2 plural-array keys are present in the request body — this is the assertion that would have caught the bug.

**`createProject` › "should include optional fields when provided"** (lines 188–204). Extend the call payload and add assertions:
- In the `createProject({...})` argument (currently lines 192–198), add: `org_ids: [4], person_ids: [5], label_ids: [10, 20],` alongside the existing `description` and `deal_ids`.
- After the existing `expect(body.deal_ids).toEqual([1, 2]);` (line 203), add:
```ts
      expect(body.org_ids).toEqual([4]);
      expect(body.person_ids).toEqual([5]);
      expect(body.label_ids).toEqual([10, 20]);
      expect(Array.isArray(body.org_ids)).toBe(true);
      // assert the OLD/WRONG keys are NOT sent (regression guard for #43)
      expect(body).not.toHaveProperty('org_id');
      expect(body).not.toHaveProperty('person_id');
      expect(body).not.toHaveProperty('labels');
```

**`updateProject`** — add a NEW test in the `describe('updateProject', …)` block (after the existing "should send only provided fields in body" test, ~line 272) that asserts the plural arrays on PATCH:
```ts
    it('should send v2 plural association arrays in body', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { updateProject } = await getProjectsTools();

      await updateProject({ id: 1, org_ids: [5], person_ids: [6], label_ids: [7], deal_ids: [1] });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.org_ids).toEqual([5]);
      expect(body.person_ids).toEqual([6]);
      expect(body.label_ids).toEqual([7]);
      expect(body.deal_ids).toEqual([1]);
      expect(body).not.toHaveProperty('org_id');
      expect(body).not.toHaveProperty('person_id');
      expect(body).not.toHaveProperty('labels');
    });
```

> Mocking note: these tests use the shared `mockApiSuccess` from `tests/helpers/mockFetch.ts` (already imported at the top of the file). Do NOT edit the helper — just call it. Request body is read via `JSON.parse(mockFn.mock.calls[0][1].body)`, exactly as the existing body-assertion tests do.

### 5c. Verification grep after edits
- `tests/unit/schemas/projects.test.ts`: no occurrences of the old keys `org_id`, `person_id`, or `labels` (the word `labels` only as part of nothing — confirm clean).
- `tests/integration/tools/projects.test.ts`: contains assertions for `body.org_ids`, `body.person_ids`, `body.label_ids`, and `not.toHaveProperty('org_id'|'person_id'|'labels')`.

---

## 6. Out of scope / disjointness (do NOT touch)

This issue runs in a parallel batch (#42–#46). Touch **ONLY** these four files:
- `src/schemas/projects.ts`
- `src/tools/projects.ts`
- `tests/integration/tools/projects.test.ts`
- `tests/unit/schemas/projects.test.ts`

**Do NOT touch:**
- `src/schemas/common.ts` (shared schemas)
- `src/tools/index.ts` (tool registration / `allTools`)
- `tests/helpers/mockFetch.ts`, `tests/helpers/fixtures.ts`, `tests/helpers/mockEnv.ts` (shared test helpers)
- any other entity's schema/tool/test files
- `package.json`, lockfile, tsconfig (no dependency or config changes)

**Also out of scope (do not add even though the spec lists them):** `health_status`, `template_id`, `custom_fields`. Issue #43 is strictly the three mis-shaped association fields. Do not "fix" or remove the other existing `// guess`-style fields (`description`, `status`, `owner_id`, `start_date`, `end_date`) — they are not part of this issue. (You MAY drop the `// guess` comment on `deal_ids` since you are editing that exact line and it is spec-confirmed; leave the other `// guess` comments alone.)

---

## 7. Definition of Done

1. `npm run build` is green (TypeScript compiles; inferred `CreateProjectParams`/`UpdateProjectParams` now expose `org_ids`/`person_ids`/`label_ids`, and `src/tools/projects.ts` references those names).
2. `npm test` is green **after** the test assertions are corrected to the v2 shape (the suite was false-green before; it must now pass for the right reason).
3. Schema (`src/schemas/projects.ts`): `CreateProjectSchema` and `UpdateProjectSchema` expose `deal_ids`, `person_ids`, `org_ids`, `label_ids` as `z.array(z.number().int().positive()).optional()`; no `org_id`/`person_id`/`labels`; no `// guess` on these four.
4. Tool (`src/tools/projects.ts`): both body builders send `person_ids`/`org_ids`/`label_ids` (arrays); both `inputSchema` blocks declare `person_ids`/`org_ids`/`label_ids` as `{ type: "array", items: { type: "number" } }` with updated descriptions; no `org_id`/`person_id`/`labels` keys remain.
5. Every assertion in §5 is verified against `docs/api/openapi-v2.yaml` (POST lines 19635–19654; PATCH lines 20140–20159) — plural keys, integer items.
6. Only the four projects files in §6 are modified (`git diff --name-only` lists exactly those).
7. Both create and update have at least one test asserting `body.org_ids` is an array AND that the old singular keys are absent.

---

## 8. Risks / notes

- **Breaking public input contract (intended).** Renaming the tool inputs `org_id`→`org_ids`, `person_id`→`person_ids`, `labels`→`label_ids` changes the tool's public schema. This is correct: the old keys silently dropped data, so no working caller could have depended on them. The new keys are arrays, so callers must pass `[id]` instead of `id`.
- **Zod 3, not Zod 4.** Write all schema code in Zod 3.25 syntax (`z.array(z.number().int().positive()).optional().describe(...)`). Do NOT pre-migrate to Zod 4 — #16 PR B handles that later. Keep `.describe()` chaining as in the existing file.
- **Regression from #14.** These fields originated as explicit guesses in `docs/plans/2026-06-07-issue-14-projects-tools.md` (line 9 calls them "conservative guesses"; the `// guess` comments survived into `src/schemas/projects.ts`). This plan removes the guesswork by binding to the vendored v2 spec.
- **False-green tests are the core risk.** The existing unit test asserts the WRONG shape and the integration test omits these keys entirely — both pass against broken code. The implementation is incomplete unless the §5 assertions are flipped so they would FAIL on the pre-fix code.
- **Empty-array truthiness.** `if (params.org_ids)` sends `[]` because empty arrays are truthy. This matches existing `deal_ids` behavior and is acceptable for #43; do not add special-casing.
- **Disjointness.** Stay strictly within the four projects files; the parallel batch depends on no cross-file edits (no `common.ts`, no `index.ts`, no shared helpers).
