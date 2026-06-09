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

## Problem Frame

The MCP server exposes read-only access to pipeline/stage/field configuration. There is no way
to create, rename, or delete pipelines, stages, or custom fields through the MCP interface.
Additionally, the product-field write operations (`addProductField`, `updateProductField`,
`deleteProductField`, and the options sub-verbs) were explicitly deferred from the #50 Products
entity work because they belong to the config-write surface.

The existing read handlers in `src/tools/pipelines.ts` and `src/tools/fields.ts` already consume
the v2 API correctly. This issue is purely additive: new write handlers, new Zod schemas, and
updated tool registrations — no existing handlers require modification.

**Critical correctness risk:** the v2 API renamed several boolean fields from their v1 names, and
two of those renames invert the semantic meaning of the boolean. Any schema or handler that uses
the v1 name silently sends or reads the wrong field. Every schema and test in this plan must use
the v2 names exclusively.

---

## Scope

### In scope

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
- Any change to `src/client.ts` or `src/utils/`

---

## Requirements Traceability

| U-ID | Requirement | Source |
|------|-------------|--------|
| U1   | Create, update, delete pipelines via v2 API | Issue #70, spec line 17843 |
| U1   | Pipeline body uses `is_deal_probability_enabled` (not v1 `deal_probability` on pipeline) | v2 rename, spec line 17974 |
| U1   | `deletePipeline` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U2   | Create, update, delete stages via v2 API | Issue #70, spec line 17399 |
| U2   | Stage body uses `is_deal_rot_enabled` (not `rotten_flag`) and `days_to_rotten` (not `rotten_days`) | v2 rename, spec lines 17553-17558 |
| U2   | `deleteStage` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U3   | Create, update, delete deal/person/org custom fields via v2 API | Issue #70, spec lines 6306, 9455, 12000 |
| U3   | Field key identifier for PATCH/DELETE is `field_code` (string), not an integer `id` | spec lines 6892, 7200 |
| U3   | `options` array required in create body for `enum`/`set` field types | spec line 6354 |
| U3   | `deleteXxxField` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U3   | Options sub-verbs: bulk update and bulk delete per field | spec lines 7352, 7420 |
| U4   | Create, update, delete product custom fields via v2 API | Issue #70, spec line 15500 |
| U4   | Product field update accepts only `field_name` and `ui_visibility` (simpler model than other entities) | spec line 15879 |
| U4   | `deleteProductField` gated by `destructiveOperationGuard()` | CLAUDE.md convention |
| U4   | Product field options sub-verbs: bulk update and bulk delete | spec lines 16205, 16272 |

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

---

### Verified v2 shapes

All shapes below verified against `docs/api/openapi-v2.yaml` at the cited line numbers.

#### Pipelines (`/pipelines`, spec line 17843)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/pipelines` | `name` (string) | pipeline object |
| Update | PATCH | `/pipelines/{id}` | at least one of: `name`, `is_deal_probability_enabled` | pipeline object |
| Delete | DELETE | `/pipelines/{id}` | none | `{ id: integer }` |

Pipeline object response fields (lines 17911-17939):
`id`, `name`, `order_nr`, `is_deleted`, `is_deal_probability_enabled`, `add_time`, `update_time`

Create optional body fields: `is_deal_probability_enabled` (boolean, default false)

#### Stages (`/stages`, spec line 17399)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/stages` | `name` (string), `pipeline_id` (integer) | stage object |
| Update | PATCH | `/stages/{id}` | at least one of the optional fields | stage object |
| Delete | DELETE | `/stages/{id}` | none | `{ id: integer }` |

Stage object response fields (lines 17469-17500):
`id`, `order_nr`, `name`, `is_deleted`, `deal_probability`, `pipeline_id`, `is_deal_rot_enabled`,
`days_to_rotten` (nullable integer), `add_time`, `update_time`

Create optional body fields: `deal_probability` (integer), `is_deal_rot_enabled` (boolean),
`days_to_rotten` (integer). Note: `deal_probability` here is a stage-level field on the stage
object itself, NOT the pipeline-level `is_deal_probability_enabled` rename — see the rename table
below.

Update body fields (lines 17764-17781): `name`, `pipeline_id`, `deal_probability`,
`is_deal_rot_enabled`, `days_to_rotten` — all optional (at least one required).

#### Deal fields (`/dealFields`, spec line 5981)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/dealFields` | `field_name` (string, 1-255), `field_type` (enum) | field object |
| Update | PATCH | `/dealFields/{field_code}` | at least one optional field (minProperties: 1) | field object |
| Delete | DELETE | `/dealFields/{field_code}` | none | field object |
| Update options | PATCH | `/dealFields/{field_code}/options` | array of `{id, label}` | `{ data: [{id, label}] }` |
| Delete options | DELETE | `/dealFields/{field_code}/options` | array of `{id}` | `{ data: [{id, label}] }` |

Path parameter for update/delete is `field_code` (string), not an integer. This is a key
difference from entity tools that use integer `id` paths.

Supported `field_type` values for create (lines 6336-6352): `varchar`, `text`, `double`, `phone`,
`date`, `daterange`, `time`, `timerange`, `set`, `enum`, `varchar_auto`, `address`, `monetary`,
`org`, `people`, `user`.

Optional create body fields (lines 6353-6438): `options` (array of `{label}`; required for `enum`
and `set`), `ui_visibility`, `important_fields`, `required_fields`, `description`.

Update body fields (lines 6892-6968): `field_name`, `ui_visibility`, `important_fields`,
`required_fields`, `description`. Note: `field_code` and `field_type` cannot be changed.

#### Person fields (`/personFields`, spec line 9174)

Same create/update/delete/options pattern as deal fields. Path parameter for
update/delete/options is `field_code`. Required create fields: `field_name`, `field_type`. Same
`field_type` enum values. `ui_visibility` for person fields includes `show_in_add_deal_dialog`
instead of `show_in_pipelines`. `important_fields.stage_ids` references deal stages (not person
stages). `required_fields` for person fields has only `enabled` (no `stage_ids` or `statuses`).

#### Organization fields (`/organizationFields`, spec line 11667)

Same create/update/delete/options pattern. `ui_visibility` for org fields includes
`show_in_add_deal_dialog` and `show_in_add_person_dialog`. `important_fields.stage_ids` references
deal stages. `required_fields` for org fields has only `enabled`.

#### Product fields (`/productFields`, spec line 15282)

| Operation | Method | Path | Required body fields | Response `data` shape |
|-----------|--------|------|---------------------|-----------------------|
| Create | POST | `/productFields` | `field_name` (string, 1-255), `field_type` (enum) | field object |
| Update | PATCH | `/productFields/{field_code}` | at least one of `field_name`, `ui_visibility` | field object |
| Delete | DELETE | `/productFields/{field_code}` | none | field object |
| Update options | PATCH | `/productFields/{field_code}/options` | array of `{id, label}` | `{ data: [{id, label}] }` |
| Delete options | DELETE | `/productFields/{field_code}/options` | array of `{id}` | `{ data: [{id, label}] }` |

Product field `ui_visibility` is a simpler model than other entities: only `add_visible_flag` and
`details_visible_flag` (no `show_in_pipelines`, `important_fields`, or `required_fields`).
The update body accepts only `field_name` and `ui_visibility` (spec line 15879) — notably no
`description`, `important_fields`, or `required_fields` at all.

---

### v2 field renames

All five renames were verified against `docs/api/openapi-v2.yaml`. The spec uses only the v2
names in request body schemas and response objects.

| v1 name | v2 name | Entity | Spec reference | Semantic note |
|---------|---------|--------|---------------|---------------|
| `active` | `is_deleted` | Pipeline, Stage | Lines 17921, 17479 | **INVERTS**: `active: true` in v1 = `is_deleted: false` in v2. Sending `is_deleted: true` marks the entity for deletion — the opposite of "active". This is the highest-severity rename risk. |
| `deal_probability` (pipeline-level boolean) | `is_deal_probability_enabled` | Pipeline | Line 17924 | A flag on the pipeline object (not per-stage). Note: `deal_probability` also appears on the Stage object as an integer percentage — this is a different, unrelated field that was NOT renamed. |
| `selected` | `is_selected` | (not a pipeline/stage/field write field per spec) | Not present in v2 write bodies | Confirmed absent from the write body schemas for pipelines, stages, and all field types in the v2 spec. This rename may apply to other read-only response fields outside this issue's scope. Do not add `is_selected` to write schemas unless the spec explicitly shows it as a writable field. |
| `rotten_flag` | `is_deal_rot_enabled` | Stage | Line 17553 | Boolean: whether deals in this stage can go rotten. |
| `rotten_days` | `days_to_rotten` | Stage | Line 17557 | Integer (nullable): days until a deal goes rotten. |

**The `is_deleted` inversion is the highest correctness risk in this plan.** A developer
writing a schema might reach for `active: true` from muscle memory. The v2 write API does not
accept `active` at all — it simply does not appear in any POST or PATCH request body in the spec.
The `is_deleted` field is read-only in responses (it appears in GET/list responses to show whether
a resource is soft-deleted). For write operations, deletion is triggered by calling DELETE on the
resource, not by setting a body field. There is no `is_deleted` field in any create or update
request body in the spec. Schema implementers must not add it as a writable field.

**Note on `selected`/`is_selected`:** The issue body lists `selected → is_selected` as a required
rename. After verifying the v2 spec's write body schemas for all in-scope endpoints, `is_selected`
does not appear in any create/update request body for pipelines, stages, or field write endpoints.
The spec uses `is_selected` only in certain v1 compatibility contexts outside this scope. This
rename does not affect the schemas written in this plan.

---

## Implementation Units

### U1: Pipeline writes

**Goal:** Add `createPipeline`, `updatePipeline`, `deletePipeline` to `src/tools/pipelines.ts`
and the corresponding schemas to `src/schemas/pipelines.ts`.

**Requirements:** U1-R1 (create with required `name`), U1-R2 (update with optional fields), U1-R3
(delete gated by guard), U1-R4 (v2 field names in body and descriptions).

**Dependencies:** None. Extends existing files, touches no other tools.

**Files:**
- `src/schemas/pipelines.ts` — add `CreatePipelineSchema`, `UpdatePipelineSchema`,
  `DeletePipelineSchema` and type exports
- `src/tools/pipelines.ts` — add handler functions, extend `pipelineTools` array
- `tests/unit/schemas/pipelines.test.ts` — new describe blocks for write schemas
- `tests/integration/tools/pipelines.test.ts` — new describe blocks for write handlers

**Approach:**
- `CreatePipelineSchema`: `z.object({ name: z.string().min(1), is_deal_probability_enabled: z.boolean().optional() })`
- `UpdatePipelineSchema`: `IdParamSchema.extend({ name: z.string().min(1).optional(), is_deal_probability_enabled: z.boolean().optional() })` — caller provides at least one field; no Zod-level `.refine` needed (the API will reject empty bodies, which is fine)
- `DeletePipelineSchema`: `IdParamSchema`
- Handler `createPipeline`: build body with required `name`, conditionally add `is_deal_probability_enabled`. POST to `/pipelines`, version `"v2"`. Return `{ summary: "Pipeline created", data }`.
- Handler `updatePipeline`: build sparse body from optional fields. PATCH to `/pipelines/${id}`. Return `{ summary: "Pipeline ${id} updated", data }`.
- Handler `deletePipeline`: `destructiveOperationGuard()` first. DELETE `/pipelines/${id}`. Return `{ summary: "Pipeline ${id} deleted", data }`.
- All three entries added to `pipelineTools` array with hand-written `inputSchema`.

**Patterns:** Mirror `createProduct`/`updateProduct`/`deleteProduct` in `src/tools/products.ts`.

**Test scenarios:**
- `CreatePipelineSchema`: rejects missing `name`; accepts `name` alone; accepts with `is_deal_probability_enabled: true`; rejects unknown fields passthrough
- `UpdatePipelineSchema`: rejects missing `id`; accepts `id` alone with optional fields omitted; accepts partial update with `is_deal_probability_enabled`
- `DeletePipelineSchema`: rejects missing `id`; accepts valid `id`
- **v2 rename correctness:** integration test asserts that `createPipeline` POST body contains `is_deal_probability_enabled` when set, and does NOT contain `deal_probability` or `active`
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
- `CreateStageSchema`: `z.object({ name: z.string().min(1), pipeline_id: z.number().int().positive(), deal_probability: z.number().int().min(0).max(100).optional(), is_deal_rot_enabled: z.boolean().optional(), days_to_rotten: z.number().int().nullable().optional() })`
- `UpdateStageSchema`: `IdParamSchema.extend({ name: ..optional, pipeline_id: ..optional, deal_probability: ..optional, is_deal_rot_enabled: ..optional, days_to_rotten: ..nullable.optional })`
- `DeleteStageSchema`: `IdParamSchema`
- Handler `createStage`: build body with `name` and `pipeline_id`; conditionally add optional fields. POST to `/stages`, version `"v2"`.
- Handler `updateStage`: sparse body. PATCH to `/stages/${id}`.
- Handler `deleteStage`: guard first. DELETE `/stages/${id}`.

**Patterns:** Mirror pipeline handlers from U1.

**Test scenarios:**
- `CreateStageSchema`: rejects missing `name`; rejects missing `pipeline_id`; accepts all optional fields including `is_deal_rot_enabled: true` and `days_to_rotten: 5`; accepts `days_to_rotten: null`
- **v2 rename correctness:** integration test asserts that `createStage` POST body contains `is_deal_rot_enabled` (not `rotten_flag`) and `days_to_rotten` (not `rotten_days`) when provided
- **Negative rename test:** assert that POST body does NOT contain `rotten_flag` or `rotten_days`
- `deleteStage` guard blocks when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset; no network call made
- `updateStage` calls PATCH `/api/v2/stages/{id}`

**Verification:** `npm run build && npm test` green.

---

### U3: Deal / person / organization field writes

**Goal:** Add create, update, and delete handlers for deal fields, person fields, and organization
fields. Add field-options bulk update and delete for each entity type.

This is the largest unit. It touches `src/tools/fields.ts` (8.6K) and `src/schemas/fields.ts`
(1.6K) which already have read handlers.

**Requirements:** U3-R1 through U3-R4 (create/update/delete for three entity types), U3-R5
(options sub-verbs), U3-R6 (`field_code` string path param for PATCH/DELETE), U3-R7 (delete
gated by guard), U3-R8 (`options` array required in create body for `enum`/`set` types).

**Dependencies:** U1 and U2 do not touch these files; U3 can be developed in parallel with U1/U2
at the file level. However, to reduce merge complexity, implement U3 after U1/U2 land.

**Files:**
- `src/schemas/fields.ts` — add: field type enum schema, options input schema, ui_visibility
  schemas (deal/person/org variants), `CreateDealFieldSchema`, `UpdateDealFieldSchema`,
  `DeleteDealFieldSchema`, `UpdateDealFieldOptionsSchema`, `DeleteDealFieldOptionsSchema`, and
  equivalents for person and org; type exports
- `src/tools/fields.ts` — add handler functions for all 15 new operations (5 per entity type:
  create, update, delete, update-options, delete-options); extend `fieldTools` array
- `tests/unit/schemas/fields.test.ts` — new describe blocks for write schemas
- `tests/integration/tools/fields.test.ts` — new describe blocks for write handlers

**Approach — schemas:**
- Shared `FieldTypeSchema`: `z.enum(["varchar", "text", "double", "phone", "date", "daterange", "time", "timerange", "set", "enum", "varchar_auto", "address", "monetary", "org", "people", "user"])` — this is the write-allowed subset per the spec; the read responses return a wider enum including system types (`int`, `boolean`, `picture`, etc.) but those cannot be created
- Shared `FieldOptionInputSchema`: `z.object({ label: z.string().min(1) })`
- `CreateDealFieldSchema`: `z.object({ field_name: z.string().min(1).max(255), field_type: FieldTypeSchema, options: z.array(FieldOptionInputSchema).optional(), ui_visibility: z.object({...}).optional(), important_fields: z.object({...}).optional(), required_fields: z.object({...}).optional(), description: z.string().nullable().optional() })`
- `UpdateDealFieldSchema`: `z.object({ field_code: z.string(), field_name: z.string().min(1).max(255).optional(), ui_visibility: ..optional, important_fields: ..optional, required_fields: ..optional, description: ..nullable.optional })`
- `DeleteDealFieldSchema`: `z.object({ field_code: z.string() })`
- `UpdateDealFieldOptionsSchema`: `z.object({ field_code: z.string(), options: z.array(z.object({ id: z.number().int().positive(), label: z.string().min(1).max(255) })).min(1) })`
- `DeleteDealFieldOptionsSchema`: `z.object({ field_code: z.string(), option_ids: z.array(z.number().int().positive()).min(1) })`
- Person and org field schemas follow the same pattern but with entity-appropriate `ui_visibility` shapes. For simplicity, use `z.object({}).passthrough().optional()` for `ui_visibility`, `important_fields`, and `required_fields` in the Zod schemas (these sub-objects are complex and change per entity; use passthrough to avoid false validation failures). Document the entity-specific shapes in JSDoc comments.

**Approach — handlers:**
- `createDealField(params)`: build body with `field_name` and `field_type` required; conditionally add optional fields. POST to `/dealFields`, version `"v2"`. Return `{ summary: "Deal field created", data }`.
- `updateDealField(params)`: build sparse body from optional fields. PATCH to `/dealFields/${params.field_code}`. Return `{ summary: "Deal field ${field_code} updated", data }`.
- `deleteDealField(params)`: guard first. DELETE `/dealFields/${params.field_code}`. Return `{ summary: "Deal field ${field_code} deleted", data }`.
- `updateDealFieldOptions(params)`: POST body is the array directly (not nested): `client.patch("/dealFields/${field_code}/options", params.options, "v2")`. Return `{ summary: "Deal field ${field_code} options updated", data }`.
- `deleteDealFieldOptions(params)`: guard first. Body is array `params.option_ids.map(id => ({ id }))`. DELETE to `/dealFields/${field_code}/options`.
- Repeat the same five handlers for `personField` and `organizationField`, substituting endpoint paths `/personFields/{field_code}` and `/organizationFields/{field_code}`.

**Test scenarios:**
- Schema: `CreateDealFieldSchema` rejects missing `field_name`; rejects missing `field_type`; rejects unsupported `field_type` value (e.g., `"picture"`); accepts `options` for `enum` type; accepts all optional fields omitted
- **Rename correctness:** No v2 rename applies to field write bodies (the renames are on pipeline/stage objects). Assert that handler does not send any v1-only field names.
- Integration: `createDealField` uses POST `/api/v2/dealFields`; body contains `field_name` and `field_type`; optional `options` passed when provided
- Integration: `updateDealField` uses PATCH `/api/v2/dealFields/{field_code}`; body does not contain `field_type`
- Integration: `deleteDealField` with guard unset returns error, no network call; with guard set uses DELETE `/api/v2/dealFields/{field_code}`
- Integration: `updateDealFieldOptions` sends array body to PATCH `/api/v2/dealFields/{field_code}/options`
- Integration: `deleteDealFieldOptions` guard blocks when not enabled; with guard set sends DELETE with array of `{id}` objects
- Equivalent test cases for person and organization field handlers

**Verification:** `npm run build && npm test` green.

---

### U4: Product field writes

**Goal:** Add the three deferred product-field write handlers (`createProductField`,
`updateProductField`, `deleteProductField`) plus options sub-verbs. This completes the product
field CRUD that was explicitly deferred from the #50 Products entity work.

**Requirements:** U4-R1 (create requires `field_name` + `field_type`), U4-R2 (update accepts
only `field_name` and `ui_visibility` — simpler model), U4-R3 (delete gated), U4-R4 (options
sub-verbs).

**Dependencies:** U3 touches `src/tools/fields.ts` and `src/schemas/fields.ts`. U4 extends those
same files, so implement U4 after U3 lands to avoid conflicts.

**Files:**
- `src/schemas/fields.ts` — add `CreateProductFieldSchema`, `UpdateProductFieldSchema`,
  `DeleteProductFieldSchema`, `UpdateProductFieldOptionsSchema`, `DeleteProductFieldOptionsSchema`
- `src/tools/fields.ts` — add five product field handler functions; extend `fieldTools` array
- `tests/unit/schemas/fields.test.ts` — new describe blocks
- `tests/integration/tools/fields.test.ts` — new describe blocks

**Approach:**
- `CreateProductFieldSchema`: same as `CreateDealFieldSchema` but `ui_visibility` is the simpler
  product model (`add_visible_flag`, `details_visible_flag` only; no `show_in_pipelines`,
  `important_fields`, `required_fields`, `description`)
- `UpdateProductFieldSchema`: `z.object({ field_code: z.string(), field_name: z.string().min(1).max(255).optional(), ui_visibility: z.object({}).passthrough().optional() })` — NOTE: the v2 spec for product field update accepts ONLY these two fields (spec line 15879). Do not add `description`, `important_fields`, or `required_fields` to the update schema.
- `DeleteProductFieldSchema`: `z.object({ field_code: z.string() })`
- Options schemas: same shape as deal/person/org options schemas
- Handlers follow the same five-handler pattern from U3, with `/productFields/{field_code}` paths
- `deleteProductFieldOptions` is NOT gated by `destructiveOperationGuard` per the product-field
  read code style — however, verify this against the existing `deleteProductImage` handler; if
  other product deletes use the guard, use it here too. Recommendation: gate all `delete*` handlers
  for consistency.

**Test scenarios:**
- `CreateProductFieldSchema` rejects `description` (not a valid field for product fields based on the spec); verify by checking the spec's product field create body — if spec shows description is not listed, add a test asserting it is not in the schema
- `UpdateProductFieldSchema` does NOT include `important_fields` or `required_fields`; test that passing these is not forwarded
- Integration: `createProductField` POST to `/api/v2/productFields`; body contains `field_name` and `field_type`
- Integration: `updateProductField` sends only `field_name` or `ui_visibility`, not `description`
- Integration: `deleteProductField` guard behavior
- Options sub-verb tests as per U3 pattern

**Verification:** `npm run build && npm test` green.

---

## Risks

### R-1 (HIGH): `is_deleted` boolean inversion

`active: true` (v1) means the resource is active. `is_deleted: false` (v2) means the same thing —
the boolean meaning is inverted. Two risks:

1. **Schema exposure:** If `is_deleted` were accidentally added to a create or update request body
   schema, callers could inadvertently mark a resource as deleted when setting it to `true`. The
   mitigation is: `is_deleted` must NOT appear in any write (POST or PATCH) body schema in this
   plan. It is a read-only response field, and deletion is triggered only by calling DELETE on the
   resource.

2. **Description text:** Tool descriptions must not reference the v1 concept of "active". Use
   language like "marks the pipeline as deleted" for DELETE operations and never mention an
   "active" flag.

### R-2 (MEDIUM): `field_code` vs `id` for field PATCH/DELETE paths

All field entity write operations use a string `field_code` in the path (e.g.,
`/dealFields/{field_code}`), not an integer `id`. The existing `IdParamSchema` from
`src/schemas/common.ts` uses `z.number().int().positive()` and must NOT be used for field update
and delete schemas. Each field schema must define its own `field_code: z.string()` param.

### R-3 (MEDIUM): `enum`/`set` fields require `options` in create body

The spec says `options` is required for `enum` and `set` field types but the spec schema marks it
as `optional`. The API will return a validation error if `options` is omitted for these types.
Mitigation: add a `.superRefine()` or `.refine()` on the create schema that asserts `options` is
present when `field_type` is `"enum"` or `"set"`. Document this in the tool description.

### R-4 (LOW): Product field update body is narrower than other entity field updates

Deal/person/org field updates accept `field_name`, `description`, `ui_visibility`,
`important_fields`, `required_fields`. Product field update (spec line 15879) accepts ONLY
`field_name` and `ui_visibility`. If the schemas are copied from deal fields without reading the
spec for product fields, extra fields will be present that the API silently ignores or rejects.

### R-5 (LOW): `selected`/`is_selected` rename — no write exposure

After spec verification, `is_selected` does not appear in any create or update request body for
the in-scope endpoints. No action required. If a future reviewer asks about this rename, note that
it affects only v1 compatibility contexts outside this issue's scope.

### R-6 (LOW): Options sub-verb body shape

The options update/delete endpoints use array bodies at the top level (not `{ options: [...] }`).
The client must send the array directly: `client.patch(endpoint, arrayValue, "v2")`. Confirm that
`src/client.ts`'s `patch` method accepts any `unknown` body value, not just `Record<string, unknown>`.
If the client types are restrictive, the handler may need to cast.

---

## Test Strategy

All new tests follow the existing patterns in `tests/unit/schemas/pipelines.test.ts` and
`tests/integration/tools/pipelines.test.ts`.

**Unit tests (schema validation, `tests/unit/schemas/`):**
- Every new schema has its own `describe` block in the appropriate file
- Test: required fields rejected when missing
- Test: optional fields accepted when absent
- Test: v2 field names are present in the schema (parse with them, verify they pass)
- Test: v1 field names are NOT present (parse with v1 name, verify it does not pollute the output)
- Test for pipeline: schema does not have `active` or `deal_probability` (as a pipeline boolean)
- Test for stage: schema has `is_deal_rot_enabled` and `days_to_rotten`, not `rotten_flag` / `rotten_days`
- Test for enum/set fields: schema-level refine triggers when `options` absent

**Integration tests (handler behavior, `tests/integration/tools/`):**
- Every new handler has its own `describe` block
- Test: correct HTTP method, endpoint, and API version in fetch call
- Test: required body fields present in request body
- Test: optional body fields absent from request when not supplied
- Test: v2 field names sent in body (not v1 names)
- Test: `isError: true` on API error (via `mockApiError`)
- Test (delete handlers only): guard blocks when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset — confirm
  no fetch call was made (check `mockFn.mock.calls.length === 0`)
- Test (delete handlers only): guard passes and DELETE call made when
  `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`

---

## Sequencing

All four units touch **different files from #67, #68, and #69**:
- #67 (deal sub-resources): `src/tools/deals.ts`, `src/schemas/deals.ts`
- #68 (project sub-entities): `src/tools/projects.ts`, `src/schemas/projects.ts`
- #69 (cross-entity followers + media): `src/tools/persons.ts`, `src/tools/organizations.ts`, etc.
- **#70 (this plan):** `src/tools/pipelines.ts`, `src/schemas/pipelines.ts`, `src/tools/fields.ts`, `src/schemas/fields.ts`

**#70 is fully file-disjoint from #67, #68, and #69 and can be developed and merged in parallel.**
There are no shared file dependencies between roadmap items.

Within this plan, the recommended sequencing is:

1. **U1 (pipeline writes)** — smallest unit, standalone, establishes the create/update/delete
   pattern for this plan
2. **U2 (stage writes)** — extends the same files as U1; implement after U1 lands
3. **U3 (deal/person/org field writes)** — extends `fields.ts`; can be started while U1/U2 are
   in review since files are disjoint
4. **U4 (product field writes)** — extends `fields.ts`; implement after U3 lands to avoid
   conflicts

Recommended PR structure: one PR per unit (U1 → U2 → U3 → U4), or combine U1+U2 into one PR
(they share files and are both small) and U3+U4 into another PR, for a total of 2 PRs.

---

## Open Questions

1. **Do all four field entity write types need to ship together?** Shipping deal field writes
   without person/org/product field writes would be a partial API that may confuse users. Recommend
   shipping all three "standard" field types (deal, person, org) together in U3, and product fields
   separately in U4 (since product fields have a notably different update shape).

2. **Should field-options sub-verbs (update/delete options) ship with field writes or separately?**
   The options sub-verbs are additive and do not block the basic create/update/delete flow.
   However, an `enum` or `set` field is not useful without the ability to manage its options.
   Recommend shipping options sub-verbs within the same PR as the corresponding field writes.

3. **`deleteProductField` guard behavior:** The issue description groups all delete operations
   under `destructiveOperationGuard()`. Verify against the existing `deleteProductVariation` and
   `deleteProductFollower` handlers to confirm the convention — both use the guard, so
   `deleteProductField` and `deleteProductFieldOptions` should as well.

4. **Client `patch`/`delete` body types for array payloads:** The options endpoints take an array
   body. Confirm that `PipedriveClient.patch(endpoint, body, version)` and `.delete` accept
   `unknown` or `unknown[]` as the body argument. If typed as `Record<string, unknown>`, the call
   site may need a cast.

---

## Confidence

**High** for U1 and U2 (pipeline and stage writes): small additive units, spec shapes fully
verified, direct pattern from existing Products write handlers, v2 rename correctness is
verifiable by spec line numbers.

**High** for U3 (deal/person/org field writes): the field-code-as-path-param difference is the
main risk and is well-documented. The `ui_visibility` passthrough approach avoids false validation.

**Medium** for U4 (product field writes): the narrower update body is a subtle spec-divergence
risk. The `options` sub-verb array-body shape requires confirming client type compatibility.
Overall well-scoped; medium confidence reflects two small unknowns, not architectural uncertainty.
