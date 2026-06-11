---
title: "feat: config writes (pipelines/stages/fields CRUD with v2 renames; product-field writes)"
status: active
date: 2026-06-09
issue: 70
branch: agent/70-config-writes
origin: gh issue #70
type: feat
scope: large
---

# feat: config writes — pipelines, stages, and fields CRUD with v2 renames; product-field writes

> Roadmap area **R4**, split from issue #50 (Products entity, closed 2026-06-09). Parent epic: #51.
> Reference plan: `docs/plans/2026-06-09-issue-50-expand-v2-coverage-plan.md` (§ R4).

> **Revision (2026-06-10):** Incorporated ce-doc-review feedback. Key changes: (1) promoted the
> client array-body / DELETE-with-body gap from a "low risk / open question" to a **blocking
> prerequisite** — added **U0** and brought `src/client.ts` into scope; (2) documented that
> `field_code` is the server-generated 40-char hash (not the field name) and added a create→update
> round-trip test; (3) replaced the vacuous "v1 name absent from body" negative tests with
> meaningful schema-level strip tests plus positive value assertions, and added explicit
> `is_deleted`-write-rejection tests; (4) committed `destructiveOperationGuard()` on **all**
> `delete*` and `delete*FieldOptions` handlers (removed the U4 hedge); (5) replaced
> `.passthrough()` on `ui_visibility`/`important_fields`/`required_fields` with explicit
> spec-enumerated, unknown-stripping shapes; (6) made `CreateProductFieldSchema` an explicit field
> list (no `description`); (7) corrected the pipeline rename spec citation; (8) rebuilt the
> Requirements Traceability table with one row per granular R-ID.

> **Revision (2026-06-10, round 2):** Incorporated round-2 ce-doc-review feedback. (a) U0 now also
> widens the **private `request()`** body type — the round-1 client fix would not compile otherwise;
> (b) corrected the pipeline/stage update claim — the v2 spec sets no `minProperties`, so an
> `{id}`-only update is a valid no-op (enforce non-empty client-side via `.refine()` if a no-op call
> should be rejected); (c) added a shared `FieldCodeSchema` that rejects path separators in
> `field_code`; (d) acknowledged the CRM-wide blast radius of the ungated PATCH options sub-verbs and
> the all-or-nothing semantics of delete-options. Also corrected the Problem Frame inversion count
> (one, not two).

## Problem Frame

The MCP server exposes read-only access to pipeline/stage/field configuration. There is no way
to create, rename, or delete pipelines, stages, or custom fields through the MCP interface.
Additionally, the product-field write operations (`addProductField`, `updateProductField`,
`deleteProductField`, and the options sub-verbs) were explicitly deferred from the #50 Products
entity work because they belong to the config-write surface.

The existing read handlers in `src/tools/pipelines.ts` and `src/tools/fields.ts` already consume
the v2 API correctly. This issue is mostly additive: new write handlers, new Zod schemas, and
updated tool registrations. One existing file, `src/client.ts`, must be extended (see U0) because
the field-options sub-verbs require request-body shapes the current client cannot send — no
existing read or write handler is otherwise modified.

**Critical correctness risk:** the v2 API renamed several boolean fields from their v1 names, and
one of those renames (`active` → `is_deleted`) inverts the semantic meaning of the boolean. Any
schema or handler that uses the v1 name silently sends or reads the wrong field. Every schema and
test in this plan must use the v2 names exclusively.

---

## Scope

### In scope

- **Client body capabilities (prerequisite, U0):** widen `PipedriveClient.patch`/`.post` to accept
  array request bodies, and add a body-bearing DELETE so the options sub-verbs can transmit their
  `[{id}]` / `[{id,label}]` payloads. Required by U3/U4 options sub-verbs.
- **Pipeline writes:** `createPipeline` (POST `/pipelines`), `updatePipeline` (PATCH
  `/pipelines/{id}`), `deletePipeline` (DELETE `/pipelines/{id}`)
- **Stage writes:** `createStage` (POST `/stages`), `updateStage` (PATCH `/stages/{id}`),
  `deleteStage` (DELETE `/stages/{id}`)
- **Deal field writes:** `createDealField` (POST `/dealFields`), `updateDealField` (PATCH
  `/dealFields/{field_code}`), `deleteDealField` (DELETE `/dealFields/{field_code}`)
- **Person field writes:** `createPersonField`, `updatePersonField`, `deletePersonField`
- **Organization field writes:** `createOrganizationField`, `updateOrganizationField`,
  `deleteOrganizationField`
- **Product field writes (deferred from #50):** `createProductField`, `updateProductField`,
  `deleteProductField`
- **Field-options sub-verbs (all four entity types):** `updateDealFieldOptions` (PATCH
  `/dealFields/{field_code}/options`), `deleteDealFieldOptions` (DELETE), and equivalents for
  person, organization, and product fields
- Schemas for all of the above in the appropriate schema files
- Unit tests (schemas) and integration tests (handlers) for all new tools

### Out of scope

- Reading/listing pipelines, stages, or fields — already implemented, not touched
- Pipeline ordering beyond what `order_nr` is returned in — no reorder endpoint in v2 spec
- v1-only capabilities already documented in `docs/v1-only-capabilities.md`
- Multipart product image upload/update (deferred from #50, tracked separately)
- Any change to `src/utils/` (only `src/client.ts` is touched, scoped to U0's body-type widening)

---

## Requirements Traceability

Each row carries a unique requirement ID matching the `U*-R*` references used in the Implementation
Units. Rows map one-to-one to the requirement IDs cited in each unit's **Requirements** line.

| U-R ID | Requirement | Source |
|--------|-------------|--------|
| U0-R1 | Widen `client.patch`/`.post` body type to accept array payloads | ce-doc-review (P0); client.ts:65-82 |
| U0-R2 | Add a body-bearing DELETE so options-delete sub-verbs can send `[{id}]` | ce-doc-review (P0); spec deleteDealFieldOptions `requestBody: required` |
| U1-R1 | Create pipeline via POST `/pipelines` (required `name`) | Issue #70, spec line 17843 |
| U1-R2 | Update pipeline via PATCH `/pipelines/{id}` (sparse body) | Issue #70, spec line 17843 |
| U1-R3 | `deletePipeline` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U1-R4 | Pipeline body uses `is_deal_probability_enabled` (not v1 `deal_probability`) | v2 rename, spec line 17974 (create body) |
| U2-R1 | Create stage via POST `/stages` (required `name` + `pipeline_id`) | Issue #70, spec line 17399 |
| U2-R2 | Update stage via PATCH `/stages/{id}` (sparse body) | Issue #70, spec line 17399 |
| U2-R3 | `deleteStage` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U2-R4 | Stage body uses `is_deal_rot_enabled` (not `rotten_flag`) and `days_to_rotten` (not `rotten_days`) | v2 rename, spec lines 17553-17558 |
| U3-R1 | Create deal/person/org custom fields via v2 API | Issue #70, spec lines 6306, 9455, 12000 |
| U3-R2 | Update deal/person/org custom fields (sparse body) | spec lines 6892, 9455, 12000 |
| U3-R3 | Delete deal/person/org custom fields | spec lines 6892, 9455, 12000 |
| U3-R4 | Field-options bulk **update** sub-verb (PATCH) for all three entity types | spec line 7352 |
| U3-R5 | Field-options bulk **delete** sub-verb (DELETE) for all three entity types | spec line 7420 |
| U3-R6 | PATCH/DELETE path param is `field_code` — the server-generated 40-char hash, not the field name or an integer `id` | spec lines 6892, 7200; addDealField response example |
| U3-R7 | `deleteXxxField` and `deleteXxxFieldOptions` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U3-R8 | `options` array required in create body for `enum`/`set` field types (enforced via `.superRefine`) | spec line 6354 |
| U4-R1 | Create product custom field via v2 API (`field_name` + `field_type`) | Issue #70, spec line 15500 |
| U4-R2 | Product field update accepts only `field_name` and `ui_visibility` (simpler model) | spec line 15879 |
| U4-R3 | `deleteProductField` and `deleteProductFieldOptions` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U4-R4 | Product field options sub-verbs: bulk update (PATCH) and bulk delete (DELETE) | spec lines 16205, 16272 |

---

## Research / Patterns to Follow

### Canonical pattern: products write handlers

The `createProduct`/`updateProduct`/`deleteProduct` handlers in `src/tools/products.ts`
(lines 151-252) establish the pattern for all write handlers in this plan:

1. `getClient()` at the top of the handler
2. Build `body: Record<string, unknown>` with only the required field(s), then conditionally
   copy optional fields via `if (params.x !== undefined) body.x = params.x`
3. `client.post/patch/delete(endpoint, body, "v2")` — or for delete, `client.delete(endpoint, "v2")`
4. Guard: `if (!response.success || !response.data) return mcpErrorResult(response);`
5. Return `{ content: [{ type: "text" as const, text: JSON.stringify({ summary, data }, null, 2) }] }`
6. Every delete handler calls `destructiveOperationGuard()` as its first statement and returns
   immediately if it returns non-null

Schema pattern from `src/schemas/products.ts`:
- Create schemas extend `z.object({})` with required fields listed first
- Update schemas extend `IdParamSchema` (or add `field_code: z.string()` for field entities),
  with all fields optional
- Delete schemas are just `IdParamSchema` (or `{ field_code: z.string() }` for fields)

Tool entry pattern (from `pipelineTools`/`fieldTools`): hand-written JSON Schema in `inputSchema`,
`handler` pointing to the async function, `schema` pointing to the Zod schema.

### Stages are co-located with pipelines (no new files needed)

`src/tools/pipelines.ts` (4.1K) and `src/schemas/pipelines.ts` (868B) already cover stages reads.
Adding stage write handlers to `src/tools/pipelines.ts` keeps coupling to one file and mirrors
how all existing read-write entities work. **No new `stages.ts` file is needed.**

### Field writes co-locate with existing field reads

`src/tools/fields.ts` (8.6K) and `src/schemas/fields.ts` (1.6K) cover field reads for all entity
types. Field writes extend these files. The `fieldTools` array already registered in
`src/tools/index.ts` will be extended in-place.

### Client body types (the U0 prerequisite)

`PipedriveClient.patch`/`.post` are currently typed `body: Record<string, unknown>` and
`.delete(endpoint, version)` takes no body argument at all (`src/client.ts`). The field-options
sub-verbs require **array** request bodies (`[{id, label}]` for update, `[{id}]` for delete) at the
top level, and the delete-options endpoints require that body on a DELETE request. No existing
handler sends an array body or a DELETE body, so there is no precedent to copy — the client must be
extended first. This is U0 and is a hard dependency of every options sub-verb in U3/U4.

---

### Verified v2 shapes

All shapes below verified against `docs/api/openapi-v2.yaml`. Cited line numbers are navigation
anchors to the start of each path block — the POST/PATCH/DELETE request bodies live within the
block, so navigate by `operationId` (e.g., `addPipeline`, `updatePipeline`) rather than trusting an
exact body-schema line.

#### Pipelines (`/pipelines`, spec line 17843)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/pipelines` | `name` (string) | pipeline object |
| Update | PATCH | `/pipelines/{id}` | none required (spec sets no `minProperties`); any subset of `name`, `is_deal_probability_enabled` | pipeline object |
| Delete | DELETE | `/pipelines/{id}` | none | `{ id: integer }` |

Pipeline object response fields (lines 17911-17939):
`id`, `name`, `order_nr`, `is_deleted`, `is_deal_probability_enabled`, `add_time`, `update_time`

Create optional body fields: `is_deal_probability_enabled` (boolean, default false). The
`addPipeline` (POST) request body is the block near line 17974; the `updatePipeline` (PATCH) body is
a separate block further down the same path — `is_deal_probability_enabled` appears in both.

#### Stages (`/stages`, spec line 17399)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/stages` | `name` (string), `pipeline_id` (integer) | stage object |
| Update | PATCH | `/stages/{id}` | none required (spec sets no `minProperties`); any subset of the optional fields | stage object |
| Delete | DELETE | `/stages/{id}` | none | `{ id: integer }` |

Stage object response fields (lines 17469-17500):
`id`, `order_nr`, `name`, `is_deleted`, `deal_probability`, `pipeline_id`, `is_deal_rot_enabled`,
`days_to_rotten` (nullable integer), `add_time`, `update_time`

Create optional body fields: `deal_probability` (integer), `is_deal_rot_enabled` (boolean),
`days_to_rotten` (integer). Note: `deal_probability` here is a stage-level field on the stage
object itself, NOT the pipeline-level `is_deal_probability_enabled` rename — see the rename table
below.

Update body fields (lines 17764-17781): `name`, `pipeline_id`, `deal_probability`,
`is_deal_rot_enabled`, `days_to_rotten` — all optional; the spec sets no `minProperties`, so an
`{id}`-only body is a valid no-op (unlike field updates, which carry `minProperties: 1`).

#### Deal fields (`/dealFields`, spec line 5981)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/dealFields` | `field_name` (string, 1-255), `field_type` (enum) | field object |
| Update | PATCH | `/dealFields/{field_code}` | at least one optional field (minProperties: 1) | field object |
| Delete | DELETE | `/dealFields/{field_code}` | none | field object |
| Update options | PATCH | `/dealFields/{field_code}/options` | top-level array of `{id, label}` | `{ data: [{id, label}] }` |
| Delete options | DELETE | `/dealFields/{field_code}/options` | top-level array of `{id}` (`requestBody: required: true`) | `{ data: [{id, label}] }` |

**`field_code` is the server-generated 40-character hash** for the field (e.g.,
`946947d1b02fd3ef20798d6112ec5d895a686a21`), returned in the create response's `data.field_code`
and in list/read responses — it is NOT the human-entered field name and NOT an integer `id`. Every
PATCH/DELETE/options call must thread back the `field_code` harvested from the create (or read)
response. Passing the field name yields a 404.

Supported `field_type` values for create (lines 6336-6352): `varchar`, `text`, `double`, `phone`,
`date`, `daterange`, `time`, `timerange`, `set`, `enum`, `varchar_auto`, `address`, `monetary`,
`org`, `people`, `user`.

Optional create body fields (lines 6353-6438): `options` (array of `{label}`; required for `enum`
and `set`), `ui_visibility`, `important_fields`, `required_fields`, `description`.

Update body fields (lines 6892-6968): `field_name`, `ui_visibility`, `important_fields`,
`required_fields`, `description`. Note: `field_code` and `field_type` cannot be changed.

#### Person fields (`/personFields`, spec line 9174)

Same create/update/delete/options pattern as deal fields. Path parameter for
update/delete/options is `field_code` (same 40-char hash semantics). Required create fields:
`field_name`, `field_type`. Same `field_type` enum values. `ui_visibility` for person fields
includes `show_in_add_deal_dialog` instead of `show_in_pipelines`. `important_fields.stage_ids`
references deal stages (not person stages). `required_fields` for person fields has only `enabled`
(no `stage_ids` or `statuses`).

#### Organization fields (`/organizationFields`, spec line 11667)

Same create/update/delete/options pattern. `field_code` is the 40-char hash. `ui_visibility` for
org fields includes `show_in_add_deal_dialog` and `show_in_add_person_dialog`.
`important_fields.stage_ids` references deal stages. `required_fields` for org fields has only
`enabled`.

#### Product fields (`/productFields`, spec line 15282)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/productFields` | `field_name` (string, 1-255), `field_type` (enum) | field object |
| Update | PATCH | `/productFields/{field_code}` | at least one of `field_name`, `ui_visibility` | field object |
| Delete | DELETE | `/productFields/{field_code}` | none | field object |
| Update options | PATCH | `/productFields/{field_code}/options` | top-level array of `{id, label}` | `{ data: [{id, label}] }` |
| Delete options | DELETE | `/productFields/{field_code}/options` | top-level array of `{id}` (`requestBody: required: true`) | `{ data: [{id, label}] }` |

Product field `ui_visibility` is a simpler model than other entities: only `add_visible_flag` and
`details_visible_flag` (no `show_in_pipelines`, `important_fields`, or `required_fields`).
The update body accepts only `field_name` and `ui_visibility` (spec line 15879) — notably no
`description`, `important_fields`, or `required_fields` at all. `field_code` is the 40-char hash.

---

### v2 field renames

All renames verified against `docs/api/openapi-v2.yaml`. The spec uses only the v2 names in request
body schemas and response objects.

| v1 name | v2 name | Entity | Spec reference | Semantic note |
|---------|---------|--------|---------------|---------------|
| `active` | `is_deleted` | Pipeline, Stage | Lines 17921, 17479 | **INVERTS**: `active: true` in v1 = `is_deleted: false` in v2. `is_deleted` is a read-only response field; it must NOT appear in any write body schema (see R-1). |
| `deal_probability` (pipeline-level boolean) | `is_deal_probability_enabled` | Pipeline | Line 17974 (addPipeline/create body); also present in updatePipeline body | A flag on the pipeline object (not per-stage). Note: `deal_probability` also appears on the Stage object as an integer percentage — a different, unrelated field that was NOT renamed. |
| `selected` | `is_selected` | (not a pipeline/stage/field write field per spec) | Not present in v2 write bodies | Confirmed absent from the write body schemas for pipelines, stages, and all field types. Do not add `is_selected` to write schemas. |
| `rotten_flag` | `is_deal_rot_enabled` | Stage | Line 17553 | Boolean: whether deals in this stage can go rotten. |
| `rotten_days` | `days_to_rotten` | Stage | Line 17557 | Integer (nullable): days until a deal goes rotten. |

**The `is_deleted` inversion is the highest correctness risk in this plan.** `is_deleted` is a
read-only response field; deletion is triggered only by calling DELETE on the resource. It must NOT
appear in any create or update request body schema. The test strategy includes explicit tests that
`is_deleted` (and `active`) are stripped by the create/update schemas for pipelines and stages
(see Test Strategy and R-1) so this is an enforced contract, not a prose convention.

**Note on `selected`/`is_selected`:** After verifying the v2 spec's write body schemas for all
in-scope endpoints, `is_selected` does not appear in any create/update request body. This rename
does not affect the schemas written in this plan.

---

## Implementation Units

### U0: Client body capabilities (prerequisite for options sub-verbs)

**Goal:** Extend `src/client.ts` so the field-options sub-verbs can send array request bodies, and
so the delete-options sub-verbs can send a body on a DELETE request.

**Requirements:** U0-R1 (array bodies on `patch`/`post`), U0-R2 (body-bearing DELETE).

**Dependencies:** None. Hard dependency of U3 and U4 options sub-verbs.

**Files:**
- `src/client.ts` — widen the `patch`/`post`/`request` body parameter types; add a body-bearing delete path
- `tests/integration/` — client-level tests for the new body shapes (or exercised via the U3 options handler tests)

**Approach:**
- Widen the `body` parameter on `patch<T>` and `post<T>` **and on the private `request<T>()` method
  they delegate to** from `Record<string, unknown>` to `Record<string, unknown> | unknown[]`.
  `request()`'s `body` param (currently `Record<string, unknown> | undefined` in `src/client.ts`)
  must become `Record<string, unknown> | unknown[] | undefined`, or `tsc` rejects forwarding an
  array through it under `strict` — the public-method widening alone does not compile. The runtime
  `JSON.stringify(body)` and `if (body)` Content-Type logic is unchanged (a non-empty array is
  truthy and serializes correctly); only the type signatures widen.
- Add a body-bearing DELETE. The current `delete<T>(endpoint, version)` passes `undefined` for the
  body. Add an optional body parameter (e.g., `delete<T>(endpoint, version, body?: Record<string, unknown> | unknown[])`)
  and thread it through `request("DELETE", endpoint, body, …)`. Keep the existing two-arg call
  sites working (body defaults to `undefined`), so no existing delete handler changes.
- **Confirm** against `docs/api/openapi-v2.yaml` that the delete-options endpoints genuinely take a
  request body (verified: `deleteDealFieldOptions` `requestBody: required: true`, `schema: type:
  array`). If a future API version moves option IDs to the query string, this unit's DELETE-body
  path is still backward-compatible (body optional).

**Test scenarios:**
- `client.patch(endpoint, [{...}], "v2")` typechecks and sends a JSON array body
- `client.delete(endpoint, "v2", [{ id: 1 }])` sends a DELETE with a JSON array body
- Existing two-arg `client.delete(endpoint, "v2")` still sends a body-less DELETE (no regression)

**Verification:** `npm run build && npm test` green.

---

### U1: Pipeline writes

**Goal:** Add `createPipeline`, `updatePipeline`, `deletePipeline` to `src/tools/pipelines.ts`
and the corresponding schemas to `src/schemas/pipelines.ts`.

**Requirements:** U1-R1 (create with required `name`), U1-R2 (update sparse body), U1-R3
(delete gated by guard), U1-R4 (v2 field names in body and descriptions).

**Dependencies:** None. Extends existing files, touches no other tools.

**Files:**
- `src/schemas/pipelines.ts` — add `CreatePipelineSchema`, `UpdatePipelineSchema`,
  `DeletePipelineSchema` and type exports
- `src/tools/pipelines.ts` — add handler functions, extend `pipelineTools` array
- `tests/unit/schemas/pipelines.test.ts` — new describe blocks for write schemas
- `tests/integration/tools/pipelines.test.ts` — new describe blocks for write handlers

**Approach:**
- `CreatePipelineSchema`: `z.object({ name: z.string().min(1), is_deal_probability_enabled: z.boolean().optional() }).strict()` — `.strict()` so `active`/`is_deleted`/`deal_probability` are rejected, not silently dropped
- `UpdatePipelineSchema`: `IdParamSchema.extend({ name: z.string().min(1).optional(), is_deal_probability_enabled: z.boolean().optional() }).strict()` — the v2 spec sets no `minProperties`, so an `{id}`-only body is a valid no-op (not an API error); add a `.refine()` requiring at least one updatable field if a no-op call should be rejected client-side
- `DeletePipelineSchema`: `IdParamSchema`
- Handler `createPipeline`: build body with required `name`, conditionally add `is_deal_probability_enabled`. POST to `/pipelines`, version `"v2"`. Return `{ summary: "Pipeline created", data }`.
- Handler `updatePipeline`: build sparse body from optional fields. PATCH to `/pipelines/${id}`. Return `{ summary: "Pipeline ${id} updated", data }`.
- Handler `deletePipeline`: `destructiveOperationGuard()` first. DELETE `/pipelines/${id}`. Return `{ summary: "Pipeline ${id} deleted", data }`.
- All three entries added to `pipelineTools` array with hand-written `inputSchema`. Descriptions use "marks the pipeline as deleted" for DELETE; never reference an "active" flag.

**Patterns:** Mirror `createProduct`/`updateProduct`/`deleteProduct` in `src/tools/products.ts`.

**Test scenarios:**
- `CreatePipelineSchema`: rejects missing `name`; accepts `name` alone; accepts with `is_deal_probability_enabled: true`; **rejects** `active`, `is_deleted`, and pipeline-level `deal_probability` (`.strict()` → parse error)
- `UpdatePipelineSchema`: rejects missing `id`; accepts `id` alone with optional fields omitted; accepts partial update with `is_deal_probability_enabled`; rejects `active`/`is_deleted`
- `DeletePipelineSchema`: rejects missing `id`; accepts valid `id`
- **v2 rename correctness (positive):** integration test asserts the `createPipeline` POST body contains `is_deal_probability_enabled` **with the caller's value** when set
- `deletePipeline` with `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset returns guard error with `isError: true` and makes no network call
- `deletePipeline` with `PIPEDRIVE_ENABLE_DESTRUCTIVE=true` calls DELETE `/api/v2/pipelines/{id}`
- `updatePipeline` with API 404 returns `NOT_FOUND` error

**Verification:** `npm run build && npm test` green.

---

### U2: Stage writes

**Goal:** Add `createStage`, `updateStage`, `deleteStage` to the pipeline files (stages are
co-located in `src/tools/pipelines.ts` and `src/schemas/pipelines.ts`).

**Requirements:** U2-R1 (create requires `name` + `pipeline_id`), U2-R2 (update sparse body),
U2-R3 (delete gated), U2-R4 (use `is_deal_rot_enabled` and `days_to_rotten` everywhere).

**Dependencies:** U1 (shares the same files; implement sequentially, not in parallel).

**Files:**
- `src/schemas/pipelines.ts` — add `CreateStageSchema`, `UpdateStageSchema`, `DeleteStageSchema`
- `src/tools/pipelines.ts` — add handler functions, extend `pipelineTools` array
- `tests/unit/schemas/pipelines.test.ts` — new describe blocks
- `tests/integration/tools/pipelines.test.ts` — new describe blocks

**Approach:**
- `CreateStageSchema`: `z.object({ name: z.string().min(1), pipeline_id: z.number().int().positive(), deal_probability: z.number().int().min(0).max(100).optional(), is_deal_rot_enabled: z.boolean().optional(), days_to_rotten: z.number().int().nullable().optional() }).strict()`
- `UpdateStageSchema`: `IdParamSchema.extend({ name: ..optional, pipeline_id: ..optional, deal_probability: ..optional, is_deal_rot_enabled: ..optional, days_to_rotten: ..nullable.optional }).strict()`
- `DeleteStageSchema`: `IdParamSchema`
- Handler `createStage`: build body with `name` and `pipeline_id`; conditionally add optional fields. POST to `/stages`, version `"v2"`.
- Handler `updateStage`: sparse body. PATCH to `/stages/${id}`.
- Handler `deleteStage`: guard first. DELETE `/stages/${id}`.

**Patterns:** Mirror pipeline handlers from U1.

**Test scenarios:**
- `CreateStageSchema`: rejects missing `name`; rejects missing `pipeline_id`; accepts all optional fields including `is_deal_rot_enabled: true` and `days_to_rotten: 5`; accepts `days_to_rotten: null`; **rejects** `rotten_flag`, `rotten_days`, `active`, `is_deleted` (`.strict()` → parse error, proving v1 names cannot reach the body via the schema)
- **v2 rename correctness (positive):** integration test asserts `createStage` POST body contains `is_deal_rot_enabled` **with the caller's value** and `days_to_rotten` **with the caller's value** when provided
- **Schema strip test (meaningful negative):** parsing `{ rotten_flag: true, rotten_days: 5, ... }` through `CreateStageSchema` errors (`.strict()`); confirming the handler can never forward a v1 key — this replaces the prior vacuous "body does not contain rotten_flag" assertion
- `deleteStage` guard blocks when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset; no network call made
- `updateStage` calls PATCH `/api/v2/stages/{id}`

**Verification:** `npm run build && npm test` green.

---

### U3: Deal / person / organization field writes

**Goal:** Add create, update, and delete handlers for deal fields, person fields, and organization
fields. Add field-options bulk update and delete for each entity type.

This is the largest unit. It touches `src/tools/fields.ts` (8.6K) and `src/schemas/fields.ts`
(1.6K) which already have read handlers.

**Requirements:** U3-R1 (create d/p/o), U3-R2 (update d/p/o), U3-R3 (delete d/p/o), U3-R4 (options
update sub-verb), U3-R5 (options delete sub-verb), U3-R6 (`field_code` 40-char hash path param),
U3-R7 (delete + delete-options gated by guard), U3-R8 (`options` required for `enum`/`set`).

**Dependencies:** U0 (options sub-verbs need the client body capabilities). U1/U2 do not touch
these files; implement U3 after U0 (and after U1/U2 to keep PRs small).

**Files:**
- `src/schemas/fields.ts` — add: `FieldTypeSchema`, `FieldOptionInputSchema`, explicit
  `ui_visibility`/`important_fields`/`required_fields` shapes (deal/person/org variants),
  `CreateDealFieldSchema`, `UpdateDealFieldSchema`, `DeleteDealFieldSchema`,
  `UpdateDealFieldOptionsSchema`, `DeleteDealFieldOptionsSchema`, and equivalents for person and
  org; type exports
- `src/tools/fields.ts` — add handler functions for all 15 new operations (5 per entity type:
  create, update, delete, update-options, delete-options); extend `fieldTools` array
- `tests/unit/schemas/fields.test.ts` — new describe blocks for write schemas
- `tests/integration/tools/fields.test.ts` — new describe blocks for write handlers

**Approach — schemas:**
- Shared `FieldTypeSchema`: `z.enum(["varchar", "text", "double", "phone", "date", "daterange", "time", "timerange", "set", "enum", "varchar_auto", "address", "monetary", "org", "people", "user"])` — the write-allowed subset per the spec
- Shared `FieldOptionInputSchema`: `z.object({ label: z.string().min(1) }).strict()`
- Shared `FieldCodeSchema`: `z.string().min(1).regex(/^[^/]+$/, "field_code must not contain '/'")` — `field_code` is interpolated into the request path (`/dealFields/${field_code}`), so rejecting path separators closes path-segment injection across all eight new URL sites. It deliberately does NOT hard-enforce the 40-char hex hash format, since built-in (non-custom) fields may use human-readable keys at the same endpoints. **All `field_code` params below use `FieldCodeSchema`.**
- **Explicit sub-object shapes (no `.passthrough()`):** the spec fully enumerates `ui_visibility`,
  `important_fields`, and `required_fields` per entity, so define explicit Zod objects with the
  spec's keys and default strip behaviour (or `.strict()` to reject unknowns). This closes the hole
  where `.passthrough()` would forward arbitrary v1-named keys, undermining the "v2 names
  exclusively" guarantee. Deal/org `ui_visibility`: the spec-enumerated visibility flags;
  `important_fields`: `{ stage_ids?: number[], pipeline_ids?: number[] }` (note `stage_ids`
  references **deal** stages even on person/org fields — call this out in the tool description);
  `required_fields`: deal has `{ enabled, stage_ids?, statuses? }`, person/org have `{ enabled }`.
- `CreateDealFieldSchema`: `z.object({ field_name: z.string().min(1).max(255), field_type: FieldTypeSchema, options: z.array(FieldOptionInputSchema).optional(), ui_visibility: DealUiVisibilitySchema.optional(), important_fields: ImportantFieldsSchema.optional(), required_fields: DealRequiredFieldsSchema.optional(), description: z.string().nullable().optional() }).superRefine((v, ctx) => { if ((v.field_type === "enum" || v.field_type === "set") && (!v.options || v.options.length === 0)) ctx.addIssue({ code: "custom", path: ["options"], message: "options is required for enum/set field types" }); })`
- `UpdateDealFieldSchema`: `z.object({ field_code: FieldCodeSchema, field_name: z.string().min(1).max(255).optional(), ui_visibility: ..optional, important_fields: ..optional, required_fields: ..optional, description: ..nullable.optional })` — `field_type` and `field_code` cannot be changed
- `DeleteDealFieldSchema`: `z.object({ field_code: FieldCodeSchema })`
- `UpdateDealFieldOptionsSchema`: `z.object({ field_code: FieldCodeSchema, options: z.array(z.object({ id: z.number().int().positive(), label: z.string().min(1).max(255) }).strict()).min(1) })`
- `DeleteDealFieldOptionsSchema`: `z.object({ field_code: FieldCodeSchema, option_ids: z.array(z.number().int().positive()).min(1) })`
- Person and org schemas follow the same pattern with entity-appropriate `ui_visibility`/
  `required_fields` shapes. Document the per-entity differences in JSDoc.

**Approach — handlers:**
- `createDealField(params)`: build body with `field_name` and `field_type` required; conditionally add optional fields. POST to `/dealFields`, version `"v2"`. Return `{ summary: "Deal field created", data }`. (`data.field_code` in the response is the 40-char hash callers must keep for later updates.)
- `updateDealField(params)`: build sparse body from optional fields. PATCH to `/dealFields/${params.field_code}`. Return `{ summary: "Deal field ${field_code} updated", data }`.
- `deleteDealField(params)`: `destructiveOperationGuard()` first. DELETE `/dealFields/${params.field_code}`. Return `{ summary: "Deal field ${field_code} deleted", data }`.
- `updateDealFieldOptions(params)`: PATCH body is the array directly (not nested): `client.patch("/dealFields/${field_code}/options", params.options, "v2")` (relies on U0's array-body widening). Return `{ summary: "Deal field ${field_code} options updated", data }`.
- `deleteDealFieldOptions(params)`: **`destructiveOperationGuard()` first** (bulk option deletion is data-destructive). Body is array `params.option_ids.map(id => ({ id }))`. `client.delete("/dealFields/${field_code}/options", "v2", body)` (relies on U0's body-bearing DELETE). Note: the endpoint is all-or-nothing — if any `option_id` does not exist the whole batch fails; surface this caveat in the tool description.
- Repeat the same five handlers for `personField` and `organizationField`, substituting endpoint paths `/personFields/{field_code}` and `/organizationFields/{field_code}`.

**Guard policy (explicit):** all `deleteXxxField` **and** `deleteXxxFieldOptions` handlers call
`destructiveOperationGuard()` as their first statement. The PATCH `updateXxxFieldOptions`
sub-verbs are NOT gated — consistent with the project convention that the guard covers destructive
DELETE operations, and with every existing update handler being ungated (see FYI note below).
Acknowledged: a bulk `updateXxxFieldOptions` PATCH relabels an option used across all CRM records
for that field, so its blast radius is wider than a single-record update; the ungated decision
follows project convention and can be revisited (add the guard to the four update-options handlers)
if a guarded variant is wanted later, with no schema change required.

**Test scenarios:**
- Schema: `CreateDealFieldSchema` rejects missing `field_name`; rejects missing `field_type`; rejects unsupported `field_type` (e.g., `"picture"`); `.superRefine` triggers when `field_type` is `enum`/`set` and `options` is absent; accepts all optional fields omitted for non-enum types
- Schema: explicit sub-object shapes reject an unknown/v1-named key inside `ui_visibility` (no `.passthrough()` leak)
- Schema: `FieldCodeSchema` rejects a `field_code` containing `/` (path-separator guard), accepts a 40-char hex hash and a plain built-in key
- **field_code round-trip (integration):** `createDealField` returns `data.field_code` (40-char hash); feed that exact value to `updateDealField` / `deleteDealField` and assert the PATCH/DELETE path uses it — proves the create→update workflow
- Integration: `createDealField` uses POST `/api/v2/dealFields`; body contains `field_name` and `field_type`; `options` passed when provided
- Integration: `updateDealField` uses PATCH `/api/v2/dealFields/{field_code}`; body does not contain `field_type`
- Integration: `deleteDealField` with guard unset returns error + no network call; with guard set uses DELETE `/api/v2/dealFields/{field_code}`
- Integration: `updateDealFieldOptions` sends a top-level array body to PATCH `/api/v2/dealFields/{field_code}/options`
- Integration: `deleteDealFieldOptions` **guard blocks when not enabled (no network call)**; with guard set sends DELETE (with body) carrying the array of `{id}` objects
- Equivalent test cases for person and organization field handlers

**Verification:** `npm run build && npm test` green.

---

### U4: Product field writes

**Goal:** Add the three deferred product-field write handlers (`createProductField`,
`updateProductField`, `deleteProductField`) plus options sub-verbs. This completes the product
field CRUD that was explicitly deferred from the #50 Products entity work.

**Requirements:** U4-R1 (create requires `field_name` + `field_type`), U4-R2 (update accepts
only `field_name` and `ui_visibility`), U4-R3 (delete + delete-options gated), U4-R4 (options
sub-verbs).

**Dependencies:** U0 (options sub-verbs) and U3 (extends the same `fields.ts`/`schemas/fields.ts`;
implement after U3 lands to avoid conflicts).

**Files:**
- `src/schemas/fields.ts` — add `CreateProductFieldSchema`, `UpdateProductFieldSchema`,
  `DeleteProductFieldSchema`, `UpdateProductFieldOptionsSchema`, `DeleteProductFieldOptionsSchema`
- `src/tools/fields.ts` — add five product field handler functions; extend `fieldTools` array
- `tests/unit/schemas/fields.test.ts` — new describe blocks
- `tests/integration/tools/fields.test.ts` — new describe blocks

**Approach:**
- `CreateProductFieldSchema`: explicitly enumerated (do NOT derive from `CreateDealFieldSchema`) —
  `z.object({ field_name: z.string().min(1).max(255), field_type: FieldTypeSchema, options: z.array(FieldOptionInputSchema).optional(), ui_visibility: ProductUiVisibilitySchema.optional() }).superRefine(...enum/set options check...)`. `ProductUiVisibilitySchema` has only `add_visible_flag` and `details_visible_flag`. **No** `description`, `important_fields`, or `required_fields` — these are absent from the product field model by design (spec).
- `UpdateProductFieldSchema`: `z.object({ field_code: FieldCodeSchema, field_name: z.string().min(1).max(255).optional(), ui_visibility: ProductUiVisibilitySchema.optional() })` — the v2 spec for product field update accepts ONLY these two fields (spec line 15879).
- `DeleteProductFieldSchema`: `z.object({ field_code: FieldCodeSchema })`
- Options schemas: same shape as deal/person/org options schemas
- Handlers follow the same five-handler pattern from U3, with `/productFields/{field_code}` paths
- **Guard policy:** `deleteProductField` and `deleteProductFieldOptions` both call
  `destructiveOperationGuard()` as their first statement — consistent with every other `delete*`
  handler in the codebase (`deleteProductVariation`, `deleteProductFollower`, etc.). No exceptions.

**Test scenarios:**
- `CreateProductFieldSchema` does NOT accept `description`, `important_fields`, or `required_fields` (the schema enumerates only the product-model fields); passing `description` is a parse error / not forwarded
- `UpdateProductFieldSchema` accepts only `field_name` and `ui_visibility`; `important_fields`/`required_fields`/`description` are not forwarded
- Integration: `createProductField` POST to `/api/v2/productFields`; body contains `field_name` and `field_type`; field_code round-trip into update/delete (as in U3)
- Integration: `updateProductField` sends only `field_name` or `ui_visibility`
- Integration: `deleteProductField` guard blocks when unset; DELETE with guard set
- Integration: `deleteProductFieldOptions` guard blocks when unset; sends DELETE (with body) carrying `[{id}]` when guard set
- Integration: `updateProductFieldOptions` sends a top-level array body to PATCH

**Verification:** `npm run build && npm test` green.

---

## Risks

### R-1 (HIGH): `is_deleted` boolean inversion

`active: true` (v1) means the resource is active; `is_deleted: false` (v2) means the same thing —
the boolean meaning is inverted. Mitigations:

1. **Schema exposure:** `is_deleted` (and `active`) must NOT appear in any create/update body schema.
   Create/update schemas for pipelines and stages use `.strict()` so these keys are **rejected**,
   and the Test Strategy includes explicit tests asserting they are rejected (not merely dropped).
   Deletion is triggered only by calling DELETE on the resource.
2. **Description text:** Tool descriptions must not reference the v1 "active" concept. Use "marks
   the pipeline as deleted" for DELETE operations.

### R-2 (MEDIUM): `field_code` is a server-generated hash, not the field name

Field PATCH/DELETE/options operations use the 40-character `field_code` hash in the path (e.g.,
`/dealFields/946947d1…`), returned by the create call and in read/list responses — NOT the human
field name and NOT an integer `id`. The existing `IdParamSchema` (`z.number().int().positive()`)
must NOT be used for field write schemas; each defines its own `field_code: FieldCodeSchema`.
`FieldCodeSchema` also rejects path separators (`/`) so an attacker- or mistake-supplied value
cannot redirect the interpolated request path to a different endpoint. A create→update round-trip
integration test (U3/U4) proves the workflow. Passing the field name yields a 404.

### R-3 (MEDIUM): `enum`/`set` fields require `options` in create body

The spec marks `options` optional but the API rejects `enum`/`set` creates without it. Mitigation:
a `.superRefine()` on each create schema that requires `options` when `field_type` is `enum`/`set`.
This is a **must-have** test (asserted in U3/U4 test scenarios), not just documentation.

### R-4 (LOW): Product field update body is narrower than other entity field updates

Product field create/update has no `description`, `important_fields`, or `required_fields`. The
product schemas are enumerated explicitly (not derived from deal schemas) so these fields cannot
leak in. Tested in U4.

### R-5 (LOW): `selected`/`is_selected` rename — no write exposure

`is_selected` does not appear in any in-scope create/update request body. No action required.

### R-6 (RESOLVED): Options sub-verb body shape requires client changes

The options update/delete endpoints use top-level array bodies, and delete-options requires that
body on a DELETE. The current client cannot send either. **Resolved by U0**, which widens
`patch`/`post` to accept arrays and adds a body-bearing DELETE; `src/client.ts` is in scope for this
plan. Verified against the spec that delete-options has `requestBody: required: true`.

### R-7 (LOW): Sub-object validation via explicit shapes, not passthrough

`ui_visibility`/`important_fields`/`required_fields` use explicit, spec-enumerated Zod shapes with
unknown-key stripping (not `.passthrough()`), so arbitrary v1-named keys cannot be forwarded inside
these objects. Per-entity differences (e.g., `important_fields.stage_ids` referencing deal stages
even on person/org fields) are documented in JSDoc and tool descriptions.

---

## Test Strategy

All new tests follow the existing patterns in `tests/unit/schemas/pipelines.test.ts` and
`tests/integration/tools/pipelines.test.ts`.

**Unit tests (schema validation, `tests/unit/schemas/`):**
- Every new schema has its own `describe` block
- Required fields rejected when missing; optional fields accepted when absent
- **Positive v2-name test:** parsing with v2 names passes and the value survives
- **Meaningful negative test (schema strip/reject):** parsing an input that includes a v1 name
  (e.g., `{ rotten_flag: true }`, `{ active: true }`, pipeline-level `{ deal_probability: true }`)
  through a `.strict()` create/update schema **errors** — proving a v1 key can never reach the body.
  (This replaces the prior "body does not contain X" handler assertions, which were vacuous because
  handlers only copy declared params and Zod strips unknowns by default.)
- **`is_deleted` rejection:** `CreatePipelineSchema`, `UpdatePipelineSchema`, `CreateStageSchema`,
  `UpdateStageSchema` reject `is_deleted` and `active`
- **enum/set refine:** create-schema `.superRefine` triggers when `options` is absent for
  `enum`/`set`
- **Explicit sub-object shapes:** unknown keys inside `ui_visibility`/`important_fields`/
  `required_fields` are stripped/rejected (no passthrough leak)

**Integration tests (handler behavior, `tests/integration/tools/`):**
- Correct HTTP method, endpoint, and API version in the fetch call
- Required body fields present; optional body fields absent when not supplied
- **Positive v2-name assertion:** v2 keys present in the body **with the caller's value**
- **field_code round-trip:** create returns `data.field_code` (hash); that exact value is used in
  the subsequent PATCH/DELETE path
- **Options sub-verbs:** update sends a top-level array body via PATCH; delete sends a body-bearing
  DELETE carrying `[{id}]`
- `isError: true` on API error (via `mockApiError`)
- **Delete + delete-options guard tests:** guard blocks when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset —
  confirm no fetch call (`mockFn.mock.calls.length === 0`); guard passes and the DELETE call is made
  when `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`

---

## Sequencing

All units touch **different files from #67, #68, and #69**:
- #67 (deal sub-resources): `src/tools/deals.ts`, `src/schemas/deals.ts`
- #68 (project sub-entities): `src/tools/projects.ts`, `src/schemas/projects.ts`
- #69 (cross-entity followers + media): `src/tools/persons.ts`, `src/tools/organizations.ts`, etc.
- **#70 (this plan):** `src/client.ts` (U0), `src/tools/pipelines.ts`, `src/schemas/pipelines.ts`, `src/tools/fields.ts`, `src/schemas/fields.ts`

`src/client.ts` is shared infrastructure; the U0 change is purely additive (widen a body type, add
an optional DELETE body) and backward-compatible, so it does not conflict with the other roadmap
items, which do not modify the client's method signatures. **#70 remains file-disjoint enough to
develop in parallel with #67-#69.**

Within this plan:

1. **U0 (client body capabilities)** — prerequisite for all options sub-verbs; land first
2. **U1 (pipeline writes)** — standalone, establishes the create/update/delete pattern
3. **U2 (stage writes)** — extends the same files as U1; implement after U1 lands
4. **U3 (deal/person/org field writes)** — depends on U0; extends `fields.ts`
5. **U4 (product field writes)** — depends on U0 + U3; extends `fields.ts`

Recommended PR structure: U0+U1+U2 in one PR (client prerequisite + pipeline/stage writes share
review context), U3+U4 in another, for a total of 2 PRs. Alternatively one PR per unit.

---

## Open Questions (resolved)

1. **Ship all field entity write types together?** **Resolved:** ship deal/person/org together in
   U3, product fields in U4. All four field write types land within this issue.

2. **Field-options sub-verbs ship with field writes or separately?** **Resolved:** ship the options
   sub-verbs within the same PR as the corresponding field writes — an `enum`/`set` field is not
   useful without option management.

3. **`deleteProductField` / `deleteProductFieldOptions` guard behavior?** **Resolved:** gate all
   `delete*` and `delete*FieldOptions` handlers with `destructiveOperationGuard()`, consistent with
   `deleteProductVariation`/`deleteProductFollower`. PATCH `update*FieldOptions` sub-verbs are not
   gated (the guard covers DELETE operations; updates are not gated anywhere in the codebase). This
   is a deliberate, documented decision.

4. **Client `patch`/`delete` body types for array payloads?** **Resolved:** the current client
   cannot send array bodies or a DELETE body. **U0** widens `patch`/`post` to
   `Record<string, unknown> | unknown[]` and adds an optional DELETE body. `src/client.ts` is in
   scope.

---

## Confidence

**High** for U0 (client body capabilities): the change is small, additive, and backward-compatible;
the runtime serialization already handles arrays, so only the type signature and an optional DELETE
body parameter are needed. Verified against the spec that delete-options requires a request body.

**High** for U1 and U2 (pipeline and stage writes): small additive units, spec shapes verified,
direct pattern from existing Products write handlers, `.strict()` schemas + explicit reject tests
make the v2 rename correctness an enforced contract.

**High** for U3 (deal/person/org field writes): the `field_code`-is-a-hash semantics are now
documented and round-trip-tested; explicit sub-object shapes close the passthrough leak; the
options sub-verbs rest on the U0 prerequisite.

**High** for U4 (product field writes): the narrower product model is enumerated explicitly (not
derived), and delete/delete-options are gated like every other delete. The only residual is the
usual API-shape risk, mitigated by the same test pattern as U3.
