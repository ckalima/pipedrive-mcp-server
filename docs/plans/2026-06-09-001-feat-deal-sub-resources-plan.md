---
title: "feat: deal sub-resources (discounts, installments, line-item products, archived, convert-to-lead)"
status: active
date: 2026-06-09
issue: 67
branch: agent/67-deal-sub-resources
origin: gh issue #67
type: feat
scope: large
---

# feat: deal sub-resources

> **Revision (2026-06-10):** Incorporated ce-doc-review feedback - resolved the empty-body convert POST via the shipped `archiveProject` precedent (dropped the unimplementable `undefined` fallback); added a polling/terminal-status contract to U5; committed U4 to the schema alias and Sequencing to a single 4-slice order; corrected the stale #67/#69 merge ordering (#69 already shipped, #67 rebases onto `main`); plus minor hardening (discount UUID-keyed delete summary, installments `deal_ids` encoding verification, U3 dependency tightened to U1).
>
> **Revision 2 (2026-06-10, round-2 review):** Gated `convert_deal_to_lead` behind `destructiveOperationGuard()` -- a successful conversion marks the source deal as deleted per spec (openapi-v2.yaml:5910), so it is destructive; completed the U5 polling contract with a bounded poll budget + purge/404 handling; propagated R-2's UUID-keyed delete summary into the U2 body; and aligned the U5 status test assertion with the Approach summary. (Round 2 also changed the `deal_ids` encoding to repeated keys -- reverted in Revision 3 below.)
>
> **Revision 3 (2026-06-10, round-3 review):** Reverted the installments `deal_ids` encoding back to a single comma-joined value. The round-2 repeated-key form was unsendable through this client (`url.searchParams.set` at `src/client.ts:135` collapses repeated keys to the last value, so `deal_ids=1&deal_ids=2&deal_ids=3` would reduce to `deal_ids=3`) and contradicted the shipped array-filter convention (`listDeals` sets `ids` as a comma-joined string, `deals.ts:33`). Comma-join is the correct form for this client and is proven to work against the v2 API by the existing `ids` filter.

## Problem Frame

The existing `deals.ts` tool covers CRUD and search on the Deal entity itself, but the Pipedrive v2 API exposes several rich sub-resource endpoints that are not yet surfaced in the MCP server:

- **Line-item products** (`/deals/{id}/products`, `/deals/{id}/products/{id}`, `/deals/{id}/products/bulk`) - attaching, configuring, and removing products from deals, including bulk add.
- **Discounts** (`/deals/{id}/discounts`, `/deals/{id}/discounts/{id}`) - percentage and amount-based additional discounts applied to a deal.
- **Installments** (`/deals/installments` list, `/deals/{id}/installments` add, `/deals/{id}/installments/{id}` update/delete) - payment schedule entries on deals (Growth+ plan feature).
- **Archived deals** (`/deals/archived`) - a separate list endpoint parallel to the active-deals list.
- **Convert deal to lead** (`/deals/{id}/convert/lead` + `/deals/{id}/convert/status/{conversion_id}`) - async job-based conversion with status polling.

Without these tools, AI agents using the MCP server cannot manage product pricing on deals, apply discounts, set up installment schedules, retrieve historical archived deals, or convert deals to leads. Source of truth: `docs/api/openapi-v2.yaml` (lines 4025-5980, 2417-2549). Pattern authority: `src/tools/products.ts` (variations/followers sub-resources).

---

## Scope

### In scope

- All endpoints listed above under "Problem Frame" (v2 only, additive).
- Schemas in `src/schemas/deals.ts` (appended).
- Handlers in `src/tools/deals.ts` (appended to `dealTools` array).
- Unit tests in `tests/unit/schemas/deals.test.ts` (appended).
- Integration tests split across logically-named files under `tests/integration/tools/` (new files, see each U below).
- `PIPEDRIVE_ENABLE_DESTRUCTIVE` guard on delete operations (delete deal-product, delete discount, delete installment) **and on convert-deal-to-lead** (a successful conversion marks the source deal as deleted -- see U5).

### Out of scope

- **Deal followers** (`/deals/{id}/followers`) -- explicitly deferred to issue #69 (cross-entity followers). Do NOT implement in this branch. See Open Questions for ownership boundary.
- Any v1 endpoints. All new handlers call `"v2"`.
- `src/tools/index.ts` changes: `dealTools` is already spread into `allTools` (confirmed at line 24 of `src/tools/index.ts`).
- Multipart media operations (not present in these sub-resources).
- Non-deal entities (persons, orgs, projects).

---

## Requirements Traceability

| Issue checklist item | U-ID | Notes |
|---|---|---|
| `/deals/{id}/followers` | DEFERRED (#69) | Cross-entity follower ownership in #69 |
| `/deals/{id}/discounts` (list, add, update, delete) | U2 | Full CRUD |
| `/deals/{id}/installments` (add, update, delete) + `/deals/installments` (list) | U3 | Growth+ only |
| `/deals/{id}/products` (list, add, update, delete) | U1 | Per-deal line items |
| `/deals/{id}/products/bulk` (add many) | U1 | Bulk endpoint |
| `/deals/archived` (list) | U4 | Mirrors `listDeals` filter set |
| deal-to-lead convert (`/deals/{id}/convert/lead`) + status poll | U5 | Async job pattern |

---

## Research / Patterns to Follow

### Canonical pattern: Products sub-resources

The products entity (`src/tools/products.ts`, `src/schemas/products.ts`) is the definitive template. Key conventions observed:

- Section dividers in `tools/` file: `// ─── U3: Product variation handlers ──────────────────────────────────────────` (em-dash box-drawing `─` padded to ~80 chars, not hyphens, matching `src/tools/products.ts`)
- Schema blocks organized with `// ─── U3: Product variation schemas ───────────────────────────────────────────` headings in `schemas/` file.
- Each handler: `const client = getClient()` then build params/body, then `const response = await client.<verb>(..., "v2")`, then `if (!response.success || !response.data) return mcpErrorResult(response);`, then return `{ content: [{ type: "text" as const, text: JSON.stringify({ summary, data, pagination? }, null, 2) }] }`.
- List handlers always use `buildPaginationParamsV2(params.cursor, params.limit)` and `extractPaginationV2(response)`, and report `createListSummary(noun, count, pagination.has_more)`.
- Delete handlers always call `destructiveOperationGuard()` first; if it returns truthy, return it immediately (no network call).
- Tool entries in the `*Tools` array use hand-written `inputSchema` (JSON Schema, `type: "object" as const`), not generated from Zod.
- Schema files use `PaginationParamsSchema`, `IdParamSchema`, `SortDirectionSchema` from `src/schemas/common.ts`.

### Verified v2 shapes (from openapi-v2.yaml)

#### `/deals/{id}/products` (line 4025)

**GET** - list products attached to a deal
- Path param: `id` (integer, required)
- Query params: `cursor` (string, optional), `limit` (integer, optional, max 500 per spec note but `buildPaginationParamsV2` caps at 100), `sort_by` (enum: id, add_time, update_time, order_nr; default: id), `sort_direction` (asc/desc; default: asc)
- Response: `{ success, data: DealProduct[], additional_data: { next_cursor } }`
- DealProduct fields include: `id`, `sum`, `tax`, `deal_id`, `name`, `product_id`, `product_variation_id`, `order_nr`, `add_time`, `update_time`, `comments`, `currency`, `discount`, `discount_type`, `quantity`, `item_price`, `tax_method`, `is_enabled`, `billing_frequency`, `billing_frequency_cycles`, `billing_start_date`

**POST** (line 4247) - add single product to deal
- Path param: `id` (integer, required)
- Body required: `product_id` (integer), `item_price` (number), `quantity` (number)
- Body optional: `tax` (number, default 0), `comments` (string), `discount` (number, default 0), `is_enabled` (boolean, default true), `tax_method` (exclusive/inclusive/none), `discount_type` (percentage/amount, default percentage), `product_variation_id` (integer, nullable), `billing_frequency` (enum), `billing_frequency_cycles` (integer, nullable), `billing_start_date` (date string, nullable)
- Response: `{ success, data: DealProduct }` (HTTP 200)

#### `/deals/{id}/products/{product_attachment_id}` (line 4598)

**PATCH** - update attached product
- Path params: `id` (integer), `product_attachment_id` (integer)
- Body: all fields from POST body are optional for PATCH (no required fields in PATCH body)
- Response: `{ success, data: DealProduct }` (HTTP 200)

**DELETE** (line 4882) - delete attached product
- Path params: `id` (integer), `product_attachment_id` (integer)
- No body
- Response: `{ success, data: { id: integer } }` (HTTP 200)

#### `/deals/{id}/products/bulk` (line 4930)

**POST** - add multiple products to a deal
- Path param: `id` (integer, required)
- Body required: `data` (array of product objects, maxItems 100). Each item requires `product_id`, `item_price`, `quantity` (same optional fields as single add, plus `billing_frequency`, `billing_frequency_cycles`, `billing_start_date`)
- Response: `{ success, data: DealProduct[] }` (HTTP 201)
- Note: Distinct from single-add - returns 201 not 200, and envelope is `data: []` not `data: {}`.

#### `/deals/{id}/discounts` (line 5253)

**GET** - list discounts on deal
- Path param: `id` (integer, required)
- No query params (no pagination - the spec defines no cursor/limit for this endpoint)
- Response: `{ success, data: Discount[] }` where Discount has `id` (string/UUID), `type` (percentage/amount), `amount` (number), `description` (string), `deal_id`, `created_at`, `created_by`, `updated_at`, `updated_by`

**POST** (line 5334) - add discount
- Body required: `description` (string), `amount` (number, must be positive), `type` (percentage/amount)
- Response: `{ success, data: Discount }` (HTTP 201)
- Note: `discount_id` in this endpoint is a UUID string, not an integer.

#### `/deals/{id}/discounts/{discount_id}` (line 5433)

**PATCH** - update discount
- Path params: `id` (integer), `discount_id` (string, format: uuid)
- Body optional: `description`, `amount`, `type` (all optional for PATCH)
- Response: `{ success, data: Discount }` (HTTP 200)

**DELETE** (line 5536) - delete discount
- Path params: `id` (integer), `discount_id` (string, format: uuid)
- Response: `{ success, data: { id: integer } }` (HTTP 200)
- Spec curiosity: the delete response shows `id: integer` but the discount ID is a UUID string. This is as-spec; surface verbatim.

#### `/deals/installments` (line 5585) - NOTE: collection-level, not per-deal

**GET** - list installments for multiple deals
- This is NOT `/deals/{id}/installments` -- it's a flat collection endpoint.
- Query params: `deal_ids` (array of integers, required, max 100), `cursor` (string, optional), `limit` (integer, optional), `sort_by` (id/billing_date/deal_id; default: id), `sort_direction` (asc/desc; default: asc)
- Response: `{ success, data: Installment[], additional_data: { next_cursor } }` where Installment has `id`, `amount`, `billing_date`, `description`, `deal_id`
- Growth+ plan restriction.

#### `/deals/{id}/installments` (line 5683)

**POST** - add installment to a deal (no GET for single deal)
- Path param: `id` (integer, required)
- Body required: `description` (string), `amount` (number, must be positive), `billing_date` (string, YYYY-MM-DD format)
- Response: `{ success, data: Installment }` (HTTP 200)
- Growth+ plan restriction; requires at least one one-time product on the deal; incompatible with recurring products.

#### `/deals/{id}/installments/{installment_id}` (line 5767)

**PATCH** - update installment
- Path params: `id` (integer), `installment_id` (integer)
- Body optional: `description`, `amount`, `billing_date` (all optional for PATCH)
- Response: `{ success, data: Installment }` (HTTP 200)

**DELETE** (line 5850) - delete installment
- Path params: `id` (integer), `installment_id` (integer)
- Response: `{ success, data: { id: integer } }` (HTTP 200)

#### `/deals/archived` (line 2417)

**GET** - list archived deals
- All query params mirror `/deals` (active list): `filter_id`, `ids`, `owner_id`, `person_id`, `org_id`, `pipeline_id`, `stage_id`, `status` (open/won/lost/deleted), `updated_since`, `updated_until`, `sort_by` (id/update_time/add_time), `sort_direction`, `include_fields`, `custom_fields`, `cursor`, `limit`
- Response: `{ success, data: Deal[], additional_data: { next_cursor } }` -- same shape as active deals list

#### `/deals/{id}/convert/lead` (line 5901)

**POST** - convert deal to lead (async job)
- Path param: `id` (integer, required)
- No request body
- Response: `{ success, data: { conversion_id: string (UUID) }, additional_data: null }` (HTTP 200)
- The conversion is async; callers must poll the status endpoint.

#### `/deals/{id}/convert/status/{conversion_id}` (line 7490)

**GET** - get deal conversion status
- Path params: `id` (integer), `conversion_id` (string, UUID)
- Response: `{ success, data: { lead_id?: string, deal_id?: integer, conversion_id: string, status: "not_started"|"running"|"completed"|"failed"|"rejected" }, additional_data: null }` (HTTP 200)

---

## Implementation Units

### U1. Deal line-item products (list, add, update, delete, bulk-add)

**Goal:** Expose the full DealProducts sub-resource: list products on a deal, add a single product, update an attached product, delete an attached product, and bulk-add up to 100 products in one request.

**Requirements:**
- `pipedrive_list_deal_products` - GET `/deals/{id}/products` with cursor pagination and sort params.
- `pipedrive_add_deal_product` - POST `/deals/{id}/products`, required: `product_id`, `item_price`, `quantity`.
- `pipedrive_update_deal_product` - PATCH `/deals/{id}/products/{product_attachment_id}`, all body fields optional.
- `pipedrive_delete_deal_product` - DELETE `/deals/{id}/products/{product_attachment_id}`, gated by `destructiveOperationGuard()`.
- `pipedrive_bulk_add_deal_products` - POST `/deals/{id}/products/bulk`, required: `data` array (each item: `product_id`, `item_price`, `quantity`).

**Dependencies:** None (first unit; establishes sub-resource pattern in deals.ts).

**Files:**
- `src/schemas/deals.ts` (append U1 section)
- `src/tools/deals.ts` (append U1 handlers + tool entries to `dealTools`)
- `tests/unit/schemas/deals.test.ts` (append U1 schema tests)
- `tests/integration/tools/deals.products.test.ts` (new file)

**Approach:**
- Schema: `ListDealProductsSchema` extends `PaginationParamsSchema` + `IdParamSchema` with optional `sort_by` and `sort_direction`. `AddDealProductSchema` requires `id` (deal), `product_id`, `item_price`, `quantity` and accepts all optional fields including `billing_frequency`, `billing_frequency_cycles`, `billing_start_date`. `UpdateDealProductSchema` extends `IdParamSchema` with `product_attachment_id` (required) and all body fields optional. `DeleteDealProductSchema` has `id` + `product_attachment_id`. `BulkAddDealProductsSchema` has `id` + `data: z.array(AddDealProductItemSchema)` (max 100 items, each with same required/optional shape as single add).
- Handler list: builds `buildPaginationParamsV2(cursor, limit)` then appends `sort_by` / `sort_direction` conditionally. Returns `createListSummary("deal product", ...)`.
- Handler bulk-add: POSTs to `/deals/${params.id}/products/bulk` with body `{ data: params.data }`. Response is `data: []` array (HTTP 201 from spec, but the client always reads the parsed body regardless of status code -- no change needed to client).
- Handler delete: `destructiveOperationGuard()` first, then `client.delete<{ id: number }>`.

**Patterns to follow:** `listProductVariations` / `addProductVariation` / `updateProductVariation` / `deleteProductVariation` in `src/tools/products.ts`.

**Test scenarios (unit, schemas):**
- `ListDealProductsSchema` accepts `{}` (all optional); accepts full params set including `sort_by: "order_nr"`, `sort_direction: "desc"`.
- `AddDealProductSchema` rejects missing `product_id`; rejects missing `item_price`; rejects missing `quantity`; accepts with all optional fields present.
- `UpdateDealProductSchema` rejects missing `id`; rejects missing `product_attachment_id`; accepts body with only one field.
- `DeleteDealProductSchema` rejects missing `product_attachment_id`.
- `BulkAddDealProductsSchema` rejects empty `data` array; rejects items missing `product_id`; accepts array of 1-100 items.

**Test scenarios (integration):**
- `listDealProducts`: forwards `id`, cursor, limit, sort_by, sort_direction to fetch; returns `{ summary, data, pagination }` on success; returns `isError: true` on API failure.
- `addDealProduct`: posts required fields; optional fields absent from body when not provided; posts `billing_frequency` when supplied; returns `{ summary, data }`.
- `updateDealProduct`: patches correct path `/deals/1/products/42`; only supplied fields in body; returns `isError` on failure.
- `deleteDealProduct`: guard blocks with no fetch call when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset; calls DELETE on correct path when env set; returns `isError` on API failure.
- `bulkAddDealProducts`: posts to `/deals/1/products/bulk` with `{ data: [...] }`; returns array data on success; returns `isError` on failure.

**Verification:** `npm run build` + `npm test` green.

---

### U2. Deal discounts (list, add, update, delete)

**Goal:** Expose the Discounts sub-resource: list all discounts on a deal, add a new discount, update an existing discount, and delete a discount.

**Requirements:**
- `pipedrive_list_deal_discounts` - GET `/deals/{id}/discounts` (no pagination params - spec defines none).
- `pipedrive_add_deal_discount` - POST `/deals/{id}/discounts`, required: `description`, `amount`, `type`.
- `pipedrive_update_deal_discount` - PATCH `/deals/{id}/discounts/{discount_id}`, all fields optional.
- `pipedrive_delete_deal_discount` - DELETE `/deals/{id}/discounts/{discount_id}`, gated by `destructiveOperationGuard()`.

**Dependencies:** U1 (establishes sub-resource precedent; file already modified).

**Files:**
- `src/schemas/deals.ts` (append U2 section)
- `src/tools/deals.ts` (append U2 handlers + tool entries)
- `tests/unit/schemas/deals.test.ts` (append U2 schema tests)
- `tests/integration/tools/deals.discounts.test.ts` (new file)

**Approach:**
- Schema: `ListDealDiscountsSchema` is `IdParamSchema` only (no pagination). `AddDealDiscountSchema` extends `IdParamSchema` with required `description` (string), `amount` (number, positive), `type` (z.enum(["percentage", "amount"])). `UpdateDealDiscountSchema` extends `IdParamSchema` with required `discount_id` (string, UUID format) and all optional body fields. `DeleteDealDiscountSchema` is `IdParamSchema` + `discount_id` (string).
- Note: `discount_id` is a UUID string, not an integer. Schema should be `z.string().uuid()`.
- List handler: `client.get<unknown[]>(`/deals/${params.id}/discounts`, undefined, "v2")`. No pagination - the endpoint has no cursor. Return `createListSummary("discount", data.length, false)`.
- Add handler: POSTs body with `description`, `amount`, `type`. Returns `{ summary: "Discount added to deal", data }`.
- Update handler: builds optional body; PATCHes `/deals/${id}/discounts/${discount_id}`.
- Delete handler: `destructiveOperationGuard()` first. Return the spec response data verbatim, but build the `summary` from the UUID the caller passed -- `Discount ${discount_id} deleted from deal ${id}` -- NOT the integer `id` in the response (which is not a reusable discount identifier; see R-2). Add an inline comment noting the UUID/integer mismatch.

**Patterns to follow:** `addProductVariation` / `deleteProductVariation` in `src/tools/products.ts` for the mutation+delete shape. Note that the list handler here does NOT use `buildPaginationParamsV2` because the spec has no pagination for this endpoint.

**Test scenarios (unit, schemas):**
- `ListDealDiscountsSchema` requires `id`; rejects missing `id`.
- `AddDealDiscountSchema` rejects missing `description`; rejects missing `amount`; rejects missing `type`; rejects `type: "flat"` (not in enum); rejects negative `amount`.
- `UpdateDealDiscountSchema` requires `id` and `discount_id`; accepts all-optional body with just one field.
- `DeleteDealDiscountSchema` requires `discount_id` as string (not integer).

**Test scenarios (integration):**
- `listDealDiscounts`: calls GET `/deals/1/discounts`; returns summary + data array; returns `isError` on API failure.
- `addDealDiscount`: posts `description`, `amount`, `type`; returns created discount; returns `isError` on failure.
- `updateDealDiscount`: only supplied fields in body; patches correct path; UUID discount_id forwarded correctly.
- `deleteDealDiscount`: guard blocks with no fetch when env unset; deletes correct path; summary references the UUID passed (`Discount <uuid> deleted from deal <id>`), not the integer `id` in the response; `isError` on API failure.

**Verification:** `npm run build` + `npm test` green.

---

### U3. Deal installments (list-by-ids, add, update, delete)

**Goal:** Expose the Installments sub-resource. Note the split endpoint structure: the list endpoint is at the collection level (`/deals/installments` with `deal_ids` query array), while add/update/delete are per-deal. All installment operations are Growth+ plan-restricted.

**Requirements:**
- `pipedrive_list_deal_installments` - GET `/deals/installments` with required `deal_ids` array and optional cursor/limit/sort params.
- `pipedrive_add_deal_installment` - POST `/deals/{id}/installments`, required: `description`, `amount`, `billing_date`.
- `pipedrive_update_deal_installment` - PATCH `/deals/{id}/installments/{installment_id}`, all fields optional.
- `pipedrive_delete_deal_installment` - DELETE `/deals/{id}/installments/{installment_id}`, gated by `destructiveOperationGuard()`.

**Dependencies:** U1 (U3 has no semantic dependency on U2/discounts; it only needs U1 to have established the sub-resource pattern in deals.ts).

**Files:**
- `src/schemas/deals.ts` (append U3 section)
- `src/tools/deals.ts` (append U3 handlers + tool entries)
- `tests/unit/schemas/deals.test.ts` (append U3 schema tests)
- `tests/integration/tools/deals.installments.test.ts` (new file)

**Approach:**
- Schema: `ListDealInstallmentsSchema` extends `PaginationParamsSchema` (for cursor/limit) with required `deal_ids: z.array(z.number().int().positive()).min(1).max(100)` plus optional `sort_by` (id/billing_date/deal_id) and `sort_direction`. Note: no `id` path param since this is a collection endpoint. `AddDealInstallmentSchema` extends `IdParamSchema` with required `description` (string), `amount` (number, positive), `billing_date` (string, YYYY-MM-DD). `UpdateDealInstallmentSchema` extends `IdParamSchema` with required `installment_id` (integer) and all optional body fields. `DeleteDealInstallmentSchema` is `IdParamSchema` + `installment_id` (integer).
- List handler: `buildPaginationParamsV2(params.cursor, params.limit)` then set `deal_ids` as a **single comma-joined value** -- `queryParams.set("deal_ids", params.deal_ids.join(","))`, producing `deal_ids=1,2,3` -- plus optional sort params. Endpoint is `/deals/installments` (no `{id}` segment). **Encoding rationale:** this matches the established array-filter convention (`listDeals` sets `ids` as a comma-joined string via `queryParams.set("ids", params.ids)`, `src/tools/deals.ts:33`, documented "Comma-separated deal IDs"), which works against the same Pipedrive v2 API. Do NOT use repeated keys (`queryParams.append`): the client forwards query params via `url.searchParams.set(key, value)` (`src/client.ts:134-135`), and `.set` collapses repeated keys to the last value, so an `.append`-built `deal_ids=1&deal_ids=2&deal_ids=3` would be silently reduced to `deal_ids=3` and drop every deal but the last. The spec nominally declares `explode: true` for this param, but that is moot here: the client cannot emit repeated keys, and the shipped `ids` filter proves the v2 API accepts the comma-joined form. Because U3 cannot be exercised end-to-end without a Growth+ account, still do a one-time manual smoke test against a Growth+ sandbox before closing #67.
- Add handler: POSTs to `/deals/${params.id}/installments`. Descriptions in the tool entry should note Growth+ restriction.
- Delete handler: `destructiveOperationGuard()` first.
- Spec discrepancy with issue body: the issue lists this as `/deals/{id}/installments` (implying a per-deal list), but the spec's GET is at `/deals/installments` (collection-level, requires `deal_ids` array). The spec takes precedence. Plan accordingly.

**Patterns to follow:** `listProductVariations` for the list shape; `addProductVariation` / `deleteProductVariation` for mutation/delete.

**Test scenarios (unit, schemas):**
- `ListDealInstallmentsSchema` rejects missing `deal_ids`; rejects empty array; rejects array > 100 items; accepts single-item array; accepts with cursor + sort params.
- `AddDealInstallmentSchema` rejects missing `billing_date`; rejects non-positive `amount`; rejects missing `description`.
- `UpdateDealInstallmentSchema` requires `installment_id` integer; accepts with subset of fields.
- `DeleteDealInstallmentSchema` requires integer `installment_id` (not string).

**Test scenarios (integration):**
- `listDealInstallments`: sends `deal_ids` as a single comma-joined query value (`deal_ids=1,2,3`), matching the `listDeals` `ids` convention; forwards cursor and sort params when provided; returns `{ summary, data, pagination }`; `isError` on failure.
- `addDealInstallment`: posts to `/deals/1/installments` with all three required fields; optional fields absent when not provided; returns created installment.
- `updateDealInstallment`: patches `/deals/1/installments/7`; only supplied fields in body.
- `deleteDealInstallment`: guard blocks without fetch when env unset; deletes correct path; `isError` on failure.

**Verification:** `npm run build` + `npm test` green.

---

### U4. Archived deals list

**Goal:** Expose `/deals/archived` as a standalone list tool, mirroring the active-deals list filter surface.

**Requirements:**
- `pipedrive_list_archived_deals` - GET `/deals/archived` with the same optional filter, sort, and pagination params as `listDeals`.

**Dependencies:** U1 (file already extended; stable to append).

**Files:**
- `src/schemas/deals.ts` (add the `ListArchivedDealsSchema = ListDealsSchema` alias + type export)
- `src/tools/deals.ts` (append U4 handler + tool entry)
- `tests/unit/schemas/deals.test.ts` (no change -- the alias is covered by the existing `ListDealsSchema` tests)
- `tests/integration/tools/deals.archived.test.ts` (new file)

**Approach:**
- Schema: **reuse `ListDealsSchema` via an alias** -- `export const ListArchivedDealsSchema = ListDealsSchema` plus `export type ListArchivedDealsParams = z.infer<typeof ListArchivedDealsSchema>`. The spec filter set is byte-identical (openapi-v2.yaml lines 2431-2544), so a distinct `.extend({...})` block would be pure duplication. This is a committed decision, not an option for the implementer to weigh.
- Handler: nearly identical to `listDeals` but hits `/deals/archived`. Returns `createListSummary("archived deal", ...)`.
- No additional query params beyond what `ListDealsSchema` already captures (confirmed against spec at lines 2431-2544).

**Patterns to follow:** `listDeals` in `src/tools/deals.ts` -- copy the query-param forwarding block, change endpoint to `/deals/archived` and summary noun.

**Test scenarios (unit, schemas):**
- No separate unit tests needed: `ListArchivedDealsSchema` is an alias of `ListDealsSchema`, so the existing `ListDealsSchema` tests cover it.

**Test scenarios (integration):**
- `listArchivedDeals`: hits `/deals/archived` (not `/deals`); forwards all filter params when provided; cursor and limit forwarded; returns `{ summary: "X archived deals ...", data, pagination }`; `isError` on API failure; absent optional params not included in query string.

**Verification:** `npm run build` + `npm test` green.

---

### U5. Convert deal to lead (initiate + status poll)

**Goal:** Expose the async deal-to-lead conversion flow: trigger the conversion (POST, returns `conversion_id`) and poll the status (GET, returns `status` + optional `lead_id`).

**Requirements:**
- `pipedrive_convert_deal_to_lead` - POST `/deals/{id}/convert/lead`, no body. Returns `{ conversion_id }`. **Destructive: a successful conversion marks the source deal as deleted (spec, `openapi-v2.yaml:5910`), so this tool is gated by `destructiveOperationGuard()` exactly like the delete tools.** Tool description must state the deal-deletion side-effect AND tell the agent the conversion is async -- it must poll `pipedrive_get_deal_conversion_status` with the returned `conversion_id` until a terminal status.
- `pipedrive_get_deal_conversion_status` - GET `/deals/{id}/convert/status/{conversion_id}`. Returns `{ status, lead_id?, conversion_id }`. Tool description must enumerate the status contract so the agent knows when to stop: `completed` (terminal; carries `lead_id`), `failed`/`rejected` (terminal; stop polling, no lead produced), `not_started`/`running` (in-progress; re-poll). Only `completed` carries `lead_id`, and the spec notes conversion status is purged after a few days, so an agent that stops early or waits too long loses the `lead_id` permanently. The description must also give the agent a **bounded poll budget** (e.g. up to ~6 attempts with short backoff, not an unbounded loop) and state that a `NOT_FOUND`/404 returned after the conversion previously existed means the status was purged -- a terminal "stop polling" signal, not a transient error to retry.

**Dependencies:** U1 (file stable to append).

**Files:**
- `src/schemas/deals.ts` (append U5 section)
- `src/tools/deals.ts` (append U5 handlers + tool entries)
- `tests/unit/schemas/deals.test.ts` (append U5 schema tests)
- `tests/integration/tools/deals.convert.test.ts` (new file)

**Approach:**
- Schema: `ConvertDealToLeadSchema` is simply `IdParamSchema` (just `id`). `GetDealConversionStatusSchema` extends `IdParamSchema` with `conversion_id: z.string().uuid()`.
- Handler `convertDealToLead`: `client.post<{ conversion_id: string }>(`/deals/${params.id}/convert/lead`, {}, "v2")`. Returns `{ summary: "Deal conversion initiated; poll get_deal_conversion_status with conversion_id until a terminal status", data }` surfacing `conversion_id` prominently.
- Handler `getDealConversionStatus`: `client.get<{ status: string; lead_id?: string; conversion_id: string }>(`/deals/${params.id}/convert/status/${params.conversion_id}`, undefined, "v2")`. Build the summary from the status so the agent knows whether to keep polling: terminal `completed` -> `"Conversion completed; lead_id: <lead_id>"`; terminal `failed`/`rejected` -> `"Conversion <status>; no lead produced, stop polling"`; in-progress `not_started`/`running` -> `"Conversion <status>; re-poll"`. The `mcpErrorResult` path already surfaces a `NOT_FOUND` on a purged conversion; rely on the tool description (above) to tell the agent that a 404 after a prior valid status is a terminal "purged, stop polling" signal.
- `convertDealToLead` is gated by `destructiveOperationGuard()` (call it first; if it returns truthy, return that immediately with no network call) because a successful conversion marks the source deal as deleted (`openapi-v2.yaml:5910`). Mirror the delete-handler guard pattern from `deleteProductVariation`. `getDealConversionStatus` is read-only and ungated.
- No pagination needed.
- **Empty body is settled, not an open risk:** `convert/lead` takes no request body, so pass `{}` (an empty object) exactly as the shipped `archiveProject` handler does (`client.post(`/projects/${params.id}/archive`, {}, "v2")`, `src/tools/projects.ts:194-207`, integration-tested). `client.post`'s `body` param is non-optional (`Record<string, unknown>`, `src/client.ts:65`), so passing `undefined` is a type error -- `{}` is the correct and only call shape.

**Patterns to follow:** `getDeal` / `createDeal` in `src/tools/deals.ts` for the single-resource write+read pattern (no pagination).

**Test scenarios (unit, schemas):**
- `ConvertDealToLeadSchema` requires `id`; rejects non-integer `id`.
- `GetDealConversionStatusSchema` requires `id` and `conversion_id`; rejects `conversion_id` that is not a valid UUID string; rejects missing `id`.

**Test scenarios (integration):**
- `convertDealToLead`: guard blocks with no fetch when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset; when set, POSTs to `/deals/1/convert/lead` with empty body and returns `{ summary, data: { conversion_id } }` on success; `isError: true` on API failure (e.g., 404).
- `getDealConversionStatus`: GETs `/deals/1/convert/status/4b40248b-945a-4802-b996-60fdff8c5c69`; on success returns a status-derived summary matching the Approach (terminal `completed` -> `"Conversion completed; lead_id: <lead_id>"`); `isError` on failure; in-progress status `"running"` returns the `"Conversion running; re-poll"` summary.

**Verification:** `npm run build` + `npm test` green.

---

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Bulk endpoint returns HTTP 201 while single-add returns 200. The `PipedriveClient` parses the response body regardless of status code, so this is transparent -- but integration tests must assert on the returned `data` shape (array vs object). | Low | Low | Assert response shape in integration tests; do not assert HTTP status code (client abstracts it). |
| R-2 | Discount `discount_id` is a UUID string but the spec's delete response shows `{ id: integer }`. An agent that reads the returned integer `id` and tries to reuse it as a `discount_id` in a later PATCH/DELETE will fail, because those endpoints require the UUID. | Low | Low | Return the spec response data verbatim, but key the delete handler's `summary` on the UUID the caller passed (e.g. `Discount ${discount_id} deleted from deal ${id}`), and add an inline comment noting the returned integer `id` is not a reusable discount identifier. |
| R-3 | Installments are Growth+ only. A basic Pipedrive plan will receive a 402 or 403 for installment endpoints. The `mcpErrorResult` path handles this correctly, but tool descriptions should call out the plan restriction explicitly so AI agents understand the prerequisite. | Medium | Low | Add "Growth+ plan required" to all three installment tool descriptions. |
| R-4 | The installments list endpoint is at `/deals/installments` (not `/deals/{id}/installments`), requiring `deal_ids` as a required query array. This diverges from the pattern of all other sub-resources in this issue. Implementors unfamiliar with the spec may code the wrong path. | Medium | Medium | Note this explicitly in U3 Approach; the schema has no `id` path param for the list. |
| R-5 | `deals.ts` is a shared file with issue #69 (cross-entity followers). #69 has already shipped (PR #71, merged to `main`), so its follower block is already present in `src/tools/deals.ts` and `src/schemas/deals.ts`. | Resolved | Low | Branch #67 from / rebase onto current `main` (which already includes #69's followers). The only remaining conflict surface is the relative ordering of appended blocks -- mechanical. Do NOT re-add deal followers in #67. |
| R-6 | The `convert/lead` POST has no request body. `client.post`'s `body` param is non-optional (`src/client.ts:65`), so the handler must pass a value. | Resolved | Low | Pass `{}` -- the exact shape the shipped `archiveProject` handler uses for a bodyless v2 POST (`src/tools/projects.ts:197`, integration-tested), confirming the empty object is safe. Passing `undefined` is not an option (type error against the non-optional `body` param). |

---

## Test Strategy

- **Unit tests** for every new Zod schema, in `tests/unit/schemas/deals.test.ts` (append). Assert: valid minimal input parses; required fields reject when absent; enum values reject invalid values; integer fields reject floats where applicable; UUID fields reject non-UUID strings.
- **Integration tests** for every handler, in per-feature files (`deals.products.test.ts`, `deals.discounts.test.ts`, `deals.installments.test.ts`, `deals.archived.test.ts`, `deals.convert.test.ts`). Each test file uses `setupValidEnv()` from `tests/helpers/mockEnv.ts` and mocks `global.fetch`. Assert:
  - Correct URL and method in the mocked fetch call.
  - Query params forwarded when provided; absent params not present in URL.
  - Body fields forwarded; absent optional fields not in body.
  - Cursor/pagination surfaces in response `pagination` field.
  - `isError: true` returned when API returns `{ success: false }`.
  - Delete handlers: `destructiveOperationGuard` returns immediately with no fetch call when `PIPEDRIVE_ENABLE_DESTRUCTIVE` is unset (default).
  - Delete handlers: fetch IS called when `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`.
- **Build gate:** `npm run build` must pass before any PR is opened.
- **Full test suite:** `npm test` must be green (all 1037+ tests passing) before merging any unit.

---

## Sequencing

All units share `src/tools/deals.ts` and `src/schemas/deals.ts`, so they serialize (no parallel implementation within this issue).

**Committed PR order (single strategy -- 4 slices):**
1. **Slice 1 = U1** (line-item products) -- largest surface, establishes the sub-resource pattern in deals.ts.
2. **Slice 2 = U2 + U4** (discounts + archived deals) -- U4 is mostly a copy of `listDeals`; bundling keeps the PR coherent and small.
3. **Slice 3 = U3** (installments) -- additive, similar size to U2; kept isolated because it is Growth+ gated and carries the `deal_ids` encoding caveat.
4. **Slice 4 = U5** (convert-to-lead) -- two small handlers; ship last.

(An earlier draft floated an alternative two-slice bundling; it has been dropped in favor of the single committed order above so the implementer has no sequencing decision to make mid-execution.)

**Coordination with issue #69:** #69 (cross-entity followers) has already shipped (PR #71, merged to `main`). Branch #67 from / rebase onto current `main`, which already contains #69's follower block in `deals.ts`/`schemas/deals.ts`. The only conflict surface is the relative position of appended blocks -- mechanical. Do NOT re-add deal followers in #67.

---

## Open Questions

1. **Deal followers ownership boundary (#67 vs #69): RESOLVED.** #69 owns deal-follower management and has already shipped (PR #71, merged to `main`). Deal followers are out of scope for #67 and are NOT to be re-added here. #67 can close without follower tools.

2. **`client.post` with empty body: RESOLVED.** The shipped `archiveProject` handler (`src/tools/projects.ts:197`) already POSTs a bodyless v2 endpoint with `client.post(endpoint, {}, "v2")` and is integration-tested, confirming `{}` is accepted. `client.post`'s `body` is non-optional (`src/client.ts:65`), so `{}` is the correct call shape and `undefined` is not an option. No client change needed.

3. **Discounts list -- no pagination:** The spec defines no `cursor`/`limit` for GET `/deals/{id}/discounts`. This is inconsistent with all other list sub-resources in this issue. Confirm at implementation time by trying to pass a cursor; if the API ignores it gracefully, adding pagination params anyway is harmless but unnecessary. This plan omits them from the schema.

4. **Bulk-add response status code (201 vs 200): CONFIRMED.** `src/client.ts:154` parses the response body (`await response.json()`) before the `response.ok` branch, and any 2xx -- including 201 -- returns `{ success: true, data }` (client.ts:168-172). So the 201 bulk-add response is surfaced normally; no silent drop. (Note: a non-2xx response parses the body but returns `{ success: false, error }` without `data` -- which is the desired error path, asserted via `isError: true` in the integration tests.)

5. **UUID `discount_id` path param type:** Zod schema uses `z.string().uuid()`. The MCP tool `inputSchema` property should declare this as `{ type: "string", format: "uuid" }` or just `{ type: "string" }`. Use `{ type: "string" }` with a description noting UUID format, for widest compatibility with AI agents.

---

## Confidence

**High** for U1, U2, U4, U5: shapes fully verified in spec, clear precedent from products sub-resources, no client changes needed.

**Medium** for U3 (installments): the collection-level list path (`/deals/installments` with `deal_ids` array) is unusual; integration behavior with an actual Growth+ account is untested. The plan's approach is correct per spec, but Growth+ plan gating means CI/CD integration tests will need to mock the response and cannot test end-to-end on a free account.
