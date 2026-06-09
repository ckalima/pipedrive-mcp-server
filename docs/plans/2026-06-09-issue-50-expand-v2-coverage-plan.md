---
title: "Expand v2 coverage (Products entity + sub-resources, followers, config writes)"
status: active
date: 2026-06-09
issue: 50
branch: agent/50-expand-v2-coverage
origin: gh issue #50
type: feat
scope: large
---

# Expand v2 coverage: Products entity, sub-resources, followers, config writes

> **Revision (2026-06-09):** Incorporated document-review findings. Fixed the variation endpoint path
> to `/products/{id}/variations/{product_variation_id}`; resolved Q1 (`/productFields` is v2, removed the
> v1 404-fallback); pinned the U5 schema to `src/schemas/fields.ts`; split U6 so image list/delete ship
> with U1–U5 (only multipart upload/update defers); required the `deleteProduct` summary to state the
> 30-day soft-delete; and resolved the U6/R3 person-picture dependency (v2 upload endpoint unconfirmed).

## Problem Frame

The MCP server now covers the core v2 CRM entities (deals, persons, organizations,
activities, projects) plus the v1 long-tail (notes, mail, fields metadata, pipelines,
users, leads). Issue #50 is the last substantive coverage gap: the **Products** entity is
entirely absent, and several sub-resources/config-write surfaces across existing entities
are unimplemented.

This is the final child of the #51 v1→v2 migration-completeness tracker. It is **Large** and
**multi-area**, so it must be decomposed into **independently shippable slices** rather than
landed as one mega-PR. Per the planning decision (breadth fork resolved 2026-06-09), this plan
specifies the **Products entity in full implementation-unit detail** (the biggest single gap,
greenfield) and carries the **other four areas as phase-level roadmap units** to be expanded
into their own detailed plans when their slices come up.

### Source of truth

- Endpoint/param/response shapes verified against `docs/api/openapi-v2.yaml` (vendored v2 spec).
- Conventions mirror the existing full-CRUD+search entity `src/tools/persons.ts` and
  `src/schemas/persons.ts`.
- **Auth note (verified in code, supersedes CLAUDE.md prose):** v2 requests authenticate via the
  `x-api-token` **header**, set centrally in `src/client.ts` (the v1 `api_token` query param is
  v1-only). New product tools just call `client.get/post/patch/delete(..., "v2")`; they never
  touch auth directly.

## Scope

### In scope (this plan, full detail)

The **Products** entity and its first-party v2 sub-resources:

- Products core **read**: list, get-by-id, search
- Products core **write**: create, update, delete (delete gated by `PIPEDRIVE_ENABLE_DESTRUCTIVE`)
- Product **variations**: list, add, update, delete
- Product **followers**: list, add, delete, changelog
- Product **field reads**: list product fields (config metadata read)
- Product **images** (multipart upload): scoped as a separate, **deferrable** unit because it
  requires extending the JSON-only client with `multipart/form-data` support

### In scope (this plan, roadmap-level only)

Carried as phase units (R1–R4) with goals, endpoints, and disjoint-file targets, to be expanded
into their own detailed plans before implementation:

- **R1 Deal sub-resources**: followers, discounts, installments, line-item products + bulk,
  archived list, convert-to-lead
- **R2 Project sub-entities**: tasks CRUD, boards, phases, templates, fields list, archived,
  permittedUsers, changelog
- **R3 Followers + picture** (cross-entity): follower management for deals/persons/orgs; person picture
- **R4 Config writes**: pipelines/stages/fields create/update/delete with v2 field renames
  (`active→is_deleted`, `selected→is_selected`, `deal_probability→is_deal_probability_enabled`;
  stages `rotten_flag→is_deal_rot_enabled`, `rotten_days→days_to_rotten`)

### Out of scope

- The #51 tracker close-out (handled separately once #50 lands).
- Product-field **write** ops (`addProductField`/`updateProductField`/`deleteProductField`/options) —
  these belong to **R4 Config writes**, not the Products entity slice. Only the field **read**
  (list) ships in U5.
- Any v1-only capability already documented in `docs/v1-only-capabilities.md`.

## Requirements Traceability

| Req | Source (#50 checklist) | Covered by |
|-----|------------------------|------------|
| Products CRUD | "Products entity (CRUD …)" | U1 (read), U2 (write) |
| Products search | "Products entity (… search …)" | U1 |
| Product variations | "Products entity (… variations …)" | U3 |
| Product images | "Products entity (… images …)" | U6 (deferrable) |
| Product fields (list) | "Products entity (… product fields)" | U5 |
| Deal sub-resources | "Deal sub-resources (…)" | R1 (roadmap) |
| Project sub-entities | "Project sub-entities (…)" | R2 (roadmap) |
| Followers + picture | "Followers+picture (…)" | R3 (roadmap) |
| Config writes | "Config writes (… v2 renames)" | R4 (roadmap); product-field writes folded here |

## Research / Patterns to Follow

All new code mirrors the established entity conventions. Concrete references:

- **Handler shape** — `src/tools/persons.ts`:
  - `const client = getClient();` from `../client.js`
  - List: `const queryParams = buildPaginationParamsV2(params.cursor, params.limit);` then
    conditional `queryParams.set(k, String(v))`, then
    `await client.get<unknown[]>("/products", queryParams, "v2");`
  - Guard failures with `if (!response.success || !response.data) return mcpErrorResult(response);`
  - Success returns `{ content: [{ type: "text" as const, text: JSON.stringify({ summary, data, pagination }, null, 2) }] }`
    where `summary = createListSummary("product", data.length, pagination.has_more)`.
  - Get: `client.get<unknown>(\`/products/${params.id}\`, qs.toString() ? qs : undefined, "v2")`
  - Create: build `body: Record<string, unknown>`, `client.post<unknown>("/products", body, "v2")`
  - Update: `const { id, ...fields } = params;` build body, `client.patch<unknown>(\`/products/${id}\`, body, "v2")`
  - Search: `client.get<{ items?: unknown[] }>("/products/search", qs, "v2")` with `qs.set("term", params.term)`
  - Delete: `const guard = destructiveOperationGuard(); if (guard) return guard;` then
    `client.delete<{ id: number }>(\`/products/${params.id}\`, "v2")`
- **Schema shape** — `src/schemas/persons.ts` + `src/schemas/common.ts`: extend
  `PaginationParamsSchema` for list; reuse `IdParamSchema`, `SearchTermSchema`, `SortDirectionSchema`,
  `VisibilitySchema`, `CurrencyCodeSchema`, `CustomFieldValueSchema`. **`visible_to` MUST use
  `VisibilitySchema`** (`z.number().int().refine(... [1,3,5,7])`), never a string enum.
- **Pagination** — `src/utils/pagination.ts`: `buildPaginationParamsV2` / `extractPaginationV2`
  (reads `additional_data.next_cursor`). v2 limit caps at 100 in the builder.
- **Errors** — `src/utils/errors.ts`: `mcpErrorResult(response)` for API failures (never inline
  fallbacks); `destructiveOperationGuard()` for deletes.
- **Registration** — `src/tools/index.ts`: add `import { productTools } from "./products.js";` and
  spread `...productTools` into `allTools` (Tier 1 block).
- **Tool entry shape** — each `productTools` entry: `{ name: "pipedrive_<verb>_product[...]",
  description, inputSchema: { type: "object" as const, properties: {...}, required: [...] }, handler,
  schema }`. `inputSchema` is **hand-written JSON Schema** (not generated from Zod); `visible_to`
  rendered as `{ type: "number", enum: [1, 3, 5, 7] }`.
- **Tests** — unit tests for schemas in `tests/unit/`; integration tests for handlers in
  `tests/integration/` using `setupValidEnv()` from `tests/helpers/mockEnv.ts` and mocked `fetch`.

### Verified v2 Product shapes (from `docs/api/openapi-v2.yaml`)

- **GET /products** params: `owner_id` int, `ids` csv (max 100), `filter_id` int, `cursor`,
  `limit` (max 500; builder caps at 100), `sort_by` enum `id|name|add_time|update_time` (default `id`),
  `sort_direction` enum `asc|desc`, `updated_since` RFC3339, `custom_fields` csv (max 15).
- **POST /products** body: required `name`; optional `code`, `description`, `unit`, `tax` (number,
  default 0), `category` (number), `owner_id` int, `is_linkable` bool (default true),
  `visible_to` enum 1/3/5/7, `prices` array of `{currency, price, cost?, direct_cost?}`,
  `custom_fields` object, `billing_frequency` enum
  `one-time|annually|semi-annually|quarterly|monthly|weekly` (default `one-time`),
  `billing_frequency_cycles` int nullable (≤208). PATCH /products/{id} = same fields, all optional.
- **Product response item**: `{ id, name, code, unit, tax, is_deleted, is_linkable, visible_to,
  owner_id, add_time, update_time, description, category, custom_fields, billing_frequency,
  billing_frequency_cycles, prices: [{ product_id, price, currency, cost, direct_cost, notes }] }`.
  Pagination via `additional_data.next_cursor`.
- **GET /products/search** params: `term` required (min 2 chars, or 1 with `exact_match`),
  `fields` enum `code|custom_fields|name`, `exact_match` bool, `include_fields` enum `product.price`,
  `limit` (default 100, max 500), `cursor`. Response: `data.items[]` each
  `{ result_score, item: { id, type, name, code, visible_to, owner, custom_fields } }`,
  `additional_data.next_cursor`. (Same `data.items` envelope as `searchPersons`.)
- **Variations** `/products/{id}/variations`: GET (`cursor`, `limit`) → `data[]` of
  `{ id, name, product_id, prices[] }`; POST body required `name`, optional `prices` array of
  `{currency, price, cost?, direct_cost?, notes?}`; PATCH `/products/{id}/variations/{product_variation_id}`; DELETE.
- **Followers** `/products/{id}/followers`: `getProductFollowers`, `addProductFollower`
  (body `user_id`), `getProductFollowersChangelog`, `deleteProductFollower`.
- **Product fields** `/productFields`: `getProductFields` (list, paginated config metadata read).
- **Images** `/products/{id}/images`: `uploadProductImage` is `multipart/form-data` — the current
  `src/client.ts` only sends JSON bodies, so this requires a client enhancement (see U6 risk).

## Implementation Units (Products — full detail)

Units are ordered for incremental, independently-mergeable delivery. U1 establishes the entity;
later units are additive to the same `products.ts`/`products.ts` schema (sequential, not parallel,
because they share those two files) **except** U5 (touches `fields.ts`) and U6 (touches `client.ts`),
which have disjoint file sets and could be parallelized.

Each unit is its own PR-sized slice. After each unit: `npm run build` clean + `npm test` green.

### U1 — Products entity scaffold + read (list, get, search)

**Files:**
- `src/schemas/products.ts` (new): `ListProductsSchema` (extends `PaginationParamsSchema`),
  `GetProductSchema` (extends `IdParamSchema`), `SearchProductsSchema`; type exports.
- `src/tools/products.ts` (new): `listProducts`, `getProduct`, `searchProducts` handlers +
  `productTools` array (read entries only for now).
- `src/tools/index.ts` (edit): import + spread `...productTools`.

**Decisions:**
- `searchProducts` reuses the `data.items` envelope handling from `searchPersons`
  (`client.get<{ items?: unknown[] }>("/products/search", ...)`).
- `sort_by` enum `id|name|add_time|update_time`; default omitted (let API default to `id`).
- `custom_fields` passthrough as csv string param (matches persons `custom_fields`).

**Test scenarios** (`tests/unit/products.schema.test.ts`, `tests/integration/products.read.test.ts`):
- list: default pagination params; `limit` clamped; `cursor` forwarded; `owner_id`/`ids`/`filter_id`/
  `sort_by`/`sort_direction`/`updated_since`/`custom_fields` each forwarded when present and omitted when absent.
- list: API failure → `isError: true` via `mcpErrorResult`; success → summary text uses `createListSummary("product", …)` and includes `next_cursor`.
- get: id path-encoded; not-found (404) surfaces `NOT_FOUND`.
- search: `term` required (schema rejects empty / <min); `fields` enum rejects invalid; `exact_match` bool; `items` envelope unwrapped; pagination cursor surfaced.
- schema: `visible_to` accepts 1/3/5/7 and rejects 2/4/anything else; rejects string `visible_to`.

### U2 — Products core write (create, update, delete)

**Files:**
- `src/schemas/products.ts` (edit): `CreateProductSchema`, `UpdateProductSchema` (extends `IdParamSchema`),
  `DeleteProductSchema = IdParamSchema`; `PriceInputSchema`, `BillingFrequencySchema` helpers.
- `src/tools/products.ts` (edit): `createProduct`, `updateProduct`, `deleteProduct` + tool entries.

**Decisions:**
- `prices` modeled as `z.array(z.object({ currency, price, cost?, direct_cost? }))` reusing
  `CurrencyCodeSchema`-style validation; `price` required within each entry.
- `billing_frequency` enum exactly the 6 API values; `billing_frequency_cycles` `z.number().int().max(208).nullable().optional()`.
- `visible_to` via `VisibilitySchema`. `custom_fields` via `z.record(z.string(), CustomFieldValueSchema)`.
- `deleteProduct` opens with `destructiveOperationGuard()`; entry shipped but delete blocked unless
  `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`. The success summary states the **30-day soft-delete** ("will be
  permanently removed after 30 days"), mirroring `deletePerson` and the spec's soft-delete semantics.

**Test scenarios:**
- create: required `name` enforced; body built with only provided fields; `prices`/`custom_fields`/`billing_frequency` forwarded; success returns created product JSON.
- update: `{ id, ...fields }` split; empty-update behavior; partial field forwarding; 404 path.
- delete: guard returns `DESTRUCTIVE_DISABLED` when env unset (assert no `fetch` call); with env set, calls `DELETE /products/{id}`, returns `{ id }`, and the summary mentions the 30-day soft-delete.
- `billing_frequency_cycles` > 208 rejected; invalid `billing_frequency` rejected.

### U3 — Product variations (list, add, update, delete)

**Files:**
- `src/schemas/products.ts` (edit): `ListProductVariationsSchema`, `AddProductVariationSchema`,
  `UpdateProductVariationSchema`, `DeleteProductVariationSchema`.
- `src/tools/products.ts` (edit): `listProductVariations`, `addProductVariation`,
  `updateProductVariation`, `deleteProductVariation` + entries.

**Decisions:**
- Paths: `GET/POST /products/{id}/variations`, `PATCH/DELETE /products/{id}/variations/{product_variation_id}`.
- `prices` entry shape mirrors U2 with optional `notes`.
- Delete gated by `destructiveOperationGuard()`.

**Test scenarios:** list pagination; add requires `name`; update path includes both ids; delete guard + path; prices array forwarding.

### U4 — Product followers (list, add, delete, changelog)

**Files:**
- `src/schemas/products.ts` (edit): `ListProductFollowersSchema`, `AddProductFollowerSchema`
  (`user_id` required), `DeleteProductFollowerSchema`, `ProductFollowersChangelogSchema`.
- `src/tools/products.ts` (edit): four handlers + entries.

**Decisions:**
- Paths: `GET/POST /products/{id}/followers`, `DELETE /products/{id}/followers/{follower_id}`,
  `GET /products/{id}/followers/changelog`. Delete gated.

**Test scenarios:** list pagination; add requires `user_id`; delete guard + path; changelog read shape.

### U5 — Product field reads (list product fields)

**Files:**
- `src/schemas/fields.ts` (edit): `ListProductFieldsSchema` (pagination). *Decision: place the schema
  in `src/schemas/fields.ts` and the handler in `src/tools/fields.ts`, keeping field-metadata concerns
  together with the existing `getField`.* Disjoint from `products.ts`, so U5 can land in parallel with U2–U4.
- `src/tools/fields.ts` (edit): `listProductFields` handler + `fieldTools` entry.

**Decisions:**
- `GET /productFields` (config metadata read, paginated). Read-only; field **writes** are R4.
- `/productFields` is served by **v2** (confirmed: `openapi-v2.yaml` defines `getProductFields` at line
  ~15282, and `src/tools/fields.ts` already calls `/productFields` with version `"v2"`). Call it on the
  v2 base; no v1 fallback. (Q1 resolved.)

**Test scenarios:** list pagination; success shape; failure → `mcpErrorResult`.

### U6 — Product images (multipart upload) — DEFERRABLE

**Files:**
- `src/client.ts` (edit): add `postMultipart<T>(endpoint, formData, version)` (or extend `post` to
  accept `FormData` and skip JSON `Content-Type`/`JSON.stringify`).
- `src/schemas/products.ts` (edit): `UploadProductImageSchema`, `Get/Update/DeleteProductImageSchema`.
- `src/tools/products.ts` (edit): image handlers + entries.

**Decisions:**
- **Only POST (upload) and PUT (update) are `multipart/form-data`.** Image **list** (`GET
  /products/{id}/images`) and **delete** (`DELETE /products/{id}/images/{id}`) are plain JSON and need
  **no** client change, so they can ship with U1–U5. Only the multipart upload/update require the
  `src/client.ts` enhancement and stay deferred.
- The multipart upload/update is the **highest-risk, lowest-priority** piece: it is the only part
  needing a client change, and file uploads from an STDIO MCP context are awkward (no real filesystem
  contract with the caller, so image bytes or a path must be passed in). **Recommendation: defer the
  multipart upload/update** out of the first Products PR train; ship U1–U5 (plus image list/delete)
  first, then decide whether upload support is worth the client surface-area increase. Flagged
  explicitly so it is not silently dropped.

**Test scenarios (if built):** multipart body assembled without JSON `Content-Type`; upload/get/update/delete paths; delete guard.

## Roadmap Phases (other four areas — expand into own plans before implementing)

Each phase is a future `/backlog` slice with its own detailed plan. Listed with target files
(disjoint from Products and largely from each other) and primary endpoints.

### R1 — Deal sub-resources
- Files: `src/schemas/deals.ts`, `src/tools/deals.ts` (additive).
- Endpoints: `/deals/{id}/followers`, `/deals/{id}/discounts`, `/deals/{id}/installments`,
  `/deals/{id}/products` (+ bulk), `/deals/archived`, deal→lead convert.
- Note: line-item products + installments are the meatiest; likely 2 sub-slices.

### R2 — Project sub-entities
- Files: `src/schemas/projects.ts`, `src/tools/projects.ts` (additive); possibly new `tasks`/`boards` files.
- Endpoints: `/tasks` CRUD, `/boards`, `/phases`, `/projectTemplates`, `/projectFields`,
  `/projects/archived`, `/projects/{id}/permittedUsers`, project changelog.

### R3 — Followers + picture (cross-entity)
- Files: `src/tools/deals.ts`, `src/tools/persons.ts`, `src/tools/organizations.ts` (additive).
- Endpoints: follower mgmt for deals/persons/orgs; person picture.
- **Multipart dependency unconfirmed:** a v2 person-picture **upload** endpoint has not been located in
  `docs/api/openapi-v2.yaml` (picture data may be read-only in v2). Before planning R3, verify whether a
  v2 upload endpoint exists. If it does and reuses multipart, sequence that piece after the U6 client
  helper lands; if it does not, R3 follower management carries **no** U6 dependency and can proceed
  independently.

### R4 — Config writes (with v2 field renames)
- Files: `src/schemas/fields.ts`, `src/tools/fields.ts`, `src/schemas/pipelines.ts`,
  `src/tools/pipelines.ts`, stages schema/tools (additive). **Includes the deferred product-field
  write ops** (`addProductField`/`updateProductField`/`deleteProductField` + options).
- Endpoints: pipelines/stages/fields create/update/delete.
- **v2 field renames (must apply):** `active→is_deleted`, `selected→is_selected`,
  `deal_probability→is_deal_probability_enabled`; stages `rotten_flag→is_deal_rot_enabled`,
  `rotten_days→days_to_rotten`. All writes gated by `destructiveOperationGuard()` for delete ops.

## Risks

- **R-1 (U6 client surface):** Multipart support expands `src/client.ts` and the upload UX is weak
  over STDIO. Mitigation: defer U6; ship U1–U5 without touching the client.
- **R-2 (resolved):** `/productFields` is confirmed v2 (spec line ~15282; `src/tools/fields.ts` already
  calls it on v2). No version risk and no v1 fallback (Q1 resolved).
- **R-3 (shared-file serialization):** U2–U4 all edit `products.ts`/`products` schema, so they cannot
  be parallelized cleanly; sequence them. U5 (fields.ts) and U6 (client.ts) touch disjoint files and can
  run in parallel with the U2–U4 train.
- **R-4 (scope creep into R1–R4):** Keep each Products unit a separate PR; do not let roadmap areas
  leak into the Products train.

## Test Strategy

- Per CLAUDE.md: unit tests for every new schema (`tests/unit/`), integration tests for every handler
  (`tests/integration/`) using `setupValidEnv()` + mocked `fetch`.
- Each unit asserts: param forwarding (present vs absent), pagination cursor surfacing, `isError` on
  API failure via `mcpErrorResult`, `visible_to` refine behavior, and (for deletes)
  `destructiveOperationGuard` blocking with **no** network call when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset.
- Full `npm run build` + `npm test` green gate after every unit before opening/advancing its PR.

## Sequencing

1. **U1** (read) — establishes the entity; smallest reviewable surface.
2. **U2** (write) — additive to U1's files.
3. **U3** (variations) → **U4** (followers) — additive, sequential (shared files).
4. **U5** (product-field read) — parallelizable (disjoint `fields.ts`).
5. **U6**: image list/delete ship with U1–U5 (JSON, no client change). Multipart upload/update is
   deferred; revisit after U1–U5 ship.
6. Then R1→R4 as their own planned slices. #51 closes when this work completes.

Recommended first PR: **U1 + U2** together (a coherent "Products CRUD + search" slice), then U3/U4,
then U5. This balances PR size against review coherence while keeping the entity shippable early.

## Open Questions (resolve at implementation, not blocking)

- **Q1 (resolved):** `/productFields` is served by **v2**: the spec defines `getProductFields` at line
  ~15282 and `src/tools/fields.ts` already calls it on the v2 base. Use v2; no v1 fallback.
- **Q2:** Should `deleteProduct`/variation/follower deletes be one combined gated path or individual?
  Default: individual handlers, each calling `destructiveOperationGuard()` (matches `deletePerson`).
- **Q3:** Ship the U6 **multipart upload/update** at all? Default: defer until U1–U5 (plus image
  list/delete, which need no client change) land and upload demand is confirmed.

## Confidence

**High** for U1–U5: greenfield entity, fully-specified shapes verified against the vendored spec, and a
direct 1:1 template (`persons.ts`/`persons` schema) to mirror. **Medium** for U6 (client change + weak
upload UX over STDIO) — hence the explicit defer recommendation. Roadmap phases R1–R4 are intentionally
low-resolution and must be re-planned before implementation.
