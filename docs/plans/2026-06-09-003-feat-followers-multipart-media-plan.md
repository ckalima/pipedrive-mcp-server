---
title: "feat: cross-entity followers + multipart media (deal/person/org followers, product image upload/update)"
status: active
date: 2026-06-09
issue: 69
branch: agent/69-followers-multipart-media
origin: gh issue #69
type: feat
scope: large
---

# feat: cross-entity followers + multipart media

**Issue:** #69 | **Parent epic:** #51 | **Branch:** `agent/69-followers-multipart-media`

> **Revision (2026-06-09):** Incorporated ce-doc-review findings (5-persona review, all 4 open findings resolved as Apply).
> - **Safe-auto fixes:** corrected the test-helper path to `tests/helpers/mockFetch.ts`; bounded `base64_data` with `.max(MAX_IMAGE_B64_LEN)`, sanitized `file_name` (reject path separators / control chars, 255-char cap), added an `mime_type` allowlist.
> - **#1 (P1) Hybrid upload:** U5 now accepts **either** `file_path` (server reads via `fs.readFile`, no context cost) **or** `base64_data` (transport-safe), exactly one required — removes the base64-only context-bloat risk (Decision 2 + U5).
> - **#2 (P2) Merge-order enforced:** R1 hardened with a tracked heads-up on #67 + an implementer pre-check, not just "coordinate."
> - **#3 (P2) Shared client helpers required:** U4 now requires extracting URL-build/auth/parse helpers shared by `request()` and `requestMultipart()` (no copy-paste), with an acceptance criterion.
> - **#4 (P2) Real-boundary test added:** U4 adds a `undici` `MockAgent` test asserting the outgoing `Content-Type` starts with `multipart/form-data; boundary=`.
>
> **Note:** existing `src/tools/products.ts` carries `// U4`/`// U6` comments from #50 — this plan's U4/U5 are unrelated; ignore the old in-file numbering when implementing.

---

## Problem Frame

Three related capability gaps exist in the MCP server after #50 (Products entity) shipped:

1. **Follower management is missing for deals, persons, and organizations.** Pipedrive v2 exposes identical follower CRUD (list, add, delete, changelog) for all three entities. The product-follower pattern from #50 is the direct template.

2. **Product image upload and update are unimplemented.** `GET /products/{id}/images` and `DELETE /products/{id}/images` shipped in PR #66. The `POST` (upload) and `PUT` (update) endpoints require `multipart/form-data`, which the current `src/client.ts` does not support - it always sets `Content-Type: application/json` and calls `JSON.stringify()` on the body.

3. **The STDIO transport creates a UX puzzle for file upload.** The MCP server communicates over STDIO. There is no shared filesystem contract between the MCP client (e.g., Claude Desktop) and the server process. Image bytes or a file path must be conveyed through the JSON message payload.

Both the multipart client gap and the STDIO upload UX question were explicitly deferred from #50. Grouping them here is correct because both product image upload/update require the same `src/client.ts` change.

**Person-picture write is confirmed out of scope.** Inspection of `docs/api/openapi-v2.yaml` at line 9098 confirms that `/persons/{id}/picture` exposes **only** a `get` operation (`operationId: getPersonPicture`). There is no `post`, `put`, or `patch`. Person-picture write is not implementable in v2 and is therefore excluded from this issue.

---

## Scope

### In Scope

- **Deal followers:** list, add, delete (gated), changelog - new handlers in `src/tools/deals.ts` + schemas in `src/schemas/deals.ts`
- **Person followers:** list, add, delete (gated), changelog - new handlers in `src/tools/persons.ts` + schemas in `src/schemas/persons.ts`
- **Organization followers:** list, add, delete (gated), changelog - new handlers in `src/tools/organizations.ts` + schemas in `src/schemas/organizations.ts`
- **`src/client.ts` multipart helper:** new `postMultipart<T>` and `putMultipart<T>` public methods (see Key Technical Decisions)
- **Product image upload:** `POST /products/{id}/images` - new handler `uploadProductImage` in `src/tools/products.ts` + `UploadProductImageSchema` in `src/schemas/products.ts`
- **Product image update:** `PUT /products/{id}/images` - new handler `updateProductImage` in `src/tools/products.ts` + `UpdateProductImageSchema` in `src/schemas/products.ts`
- **Person picture read (optional - recommended):** `GET /persons/{id}/picture` - low-cost read tool `pipedrive_get_person_picture` with no dependencies; see recommendation in U2

### Out of Scope

- **Person-picture write:** No v2 upload endpoint exists. This is not deferred - it is impossible in v2. Confirmed at `docs/api/openapi-v2.yaml` line 9098 (single `get` operation only).
- **Deal sub-resources beyond followers:** discounts, installments, line-item products, deal-to-lead conversion - those belong to #67.
- **Product image GET and DELETE:** already shipped in PR #66 (`pipedrive_get_product_image`, `pipedrive_delete_product_image`). Do not re-implement.
- **Person/org picture write:** No v2 endpoints exist for either.
- **Config writes (pipelines, stages, fields):** belongs to #70.

### Scope Boundary Note - #69 Owns All Follower Management

Deal followers appear in both the #67 roadmap description and #69. **#69 owns follower management for deals, persons, and organizations.** This is the correct grouping because all three follow the identical pattern and touch disjoint files from #67's primary work (discounts, installments, line-item products). Issue #67 implementors must treat deal follower handlers as already landed from #69 and must not add them again.

---

## Requirements Traceability

| Requirement | Source | Implementation Unit |
|-------------|--------|---------------------|
| Deal follower list/add/delete/changelog | `openapi-v2.yaml` lines 3320-3557; #69 scope | U1 |
| Person follower list/add/delete/changelog | `openapi-v2.yaml` lines 8832-9052; #69 scope | U2 |
| Person picture read (optional) | `openapi-v2.yaml` lines 9098-9166; low-cost addendum | U2 |
| Organization follower list/add/delete/changelog | `openapi-v2.yaml` lines 11401-11640; #69 scope | U3 |
| `src/client.ts` multipart helper | Required by product image upload/update; client currently JSON-only | U4 |
| Product image upload (`POST /products/{id}/images`) | `openapi-v2.yaml` lines 15113-15180 | U5 |
| Product image update (`PUT /products/{id}/images`) | `openapi-v2.yaml` lines 15181-15248 | U5 |
| STDIO upload UX decision | Deferred from #50 U6; must be resolved before U5 | Key Technical Decisions |
| No person-picture write | v2 API does not expose endpoint; confirmed at line 9098 | N/A - excluded |

---

## Research / Patterns to Follow

### Verified v2 Shapes

All shapes below are confirmed against `docs/api/openapi-v2.yaml`.

#### Deal Followers (`docs/api/openapi-v2.yaml` lines 3320-3557)

**`GET /deals/{id}/followers`** (line 3320, operationId: `getDealFollowers`)
- Path param: `id` (integer)
- Query params: `limit` (integer, max 500, default 100), `cursor` (string, optional)
- Response: `{ success, data: [{ user_id: integer, add_time: string }], additional_data: { next_cursor: string } }`

**`POST /deals/{id}/followers`** (line 3399, operationId: `addDealFollower`)
- Path param: `id` (integer)
- Request body: `{ user_id: integer }` (required)
- Response 201: `{ success, data: { user_id: integer, add_time: string } }`

**`GET /deals/{id}/followers/changelog`** (line 3457, operationId: `getDealFollowersChangelog`)
- Path param: `id` (integer)
- Query params: `limit`, `cursor`
- Response: `{ success, data: [{ action: string, actor_user_id: integer, follower_user_id: integer, time: string }], additional_data: { next_cursor: string } }`

**`DELETE /deals/{id}/followers/{follower_id}`** (line 3542, operationId: `deleteDealFollower`)
- Path params: `id` (integer), `follower_id` (integer)
- Response 200: `{ success, data: { user_id: integer } }`

All four deal follower endpoints carry `x-tool-description` fields (lines 3329, 3404, 3461, 3546). Person and organization follower endpoints lack `x-tool-description` fields - write descriptions following the deal follower wording.

#### Person Followers (`docs/api/openapi-v2.yaml` lines 8832-9052)

**`GET /persons/{id}/followers`** (line 8832, operationId: `getPersonFollowers`) - identical shape to deal followers list
**`POST /persons/{id}/followers`** (line 8894, operationId: `addPersonFollower`) - identical shape to deal add-follower
**`GET /persons/{id}/followers/changelog`** (line 8945, operationId: `getPersonFollowersChangelog`) - identical changelog shape
**`DELETE /persons/{id}/followers/{follower_id}`** (line 9025, operationId: `deletePersonFollower`) - identical delete shape

#### Person Picture (READ ONLY) (`docs/api/openapi-v2.yaml` lines 9098-9166)

**`GET /persons/{id}/picture`** (line 9098, operationId: `getPersonPicture`)
- Path param: `id` (integer)
- Response: `{ success, data: { id, item_type, item_id, added_by_user_id, active_flag, file_size, pictures: { '128': string, '512': string } } }`
- Returns 404 if the person has no picture
- **No POST, PUT, or PATCH exists.** Person-picture write is not available in v2.

#### Organization Followers (`docs/api/openapi-v2.yaml` lines 11401-11640)

**`GET /organizations/{id}/followers`** (line 11401, operationId: `getOrganizationFollowers`) - identical shape to deal followers list
**`POST /organizations/{id}/followers`** (line 11463, operationId: `addOrganizationFollower`) - identical shape
**`GET /organizations/{id}/followers/changelog`** (line 11517, operationId: `getOrganizationFollowersChangelog`) - identical changelog shape
**`DELETE /organizations/{id}/followers/{follower_id}`** (line 11600, operationId: `deleteOrganizationFollower`) - identical delete shape

#### Product Images (`docs/api/openapi-v2.yaml` lines 15045-15420)

**`GET /products/{id}/images`** (line 15045, operationId: `getProductImage`) - **already shipped** in PR #66. Do not re-plan.

**`POST /products/{id}/images`** (line 15113, operationId: `uploadProductImage`)
- Path param: `id` (integer)
- Request body: `multipart/form-data`
  - Schema title: `AddProductImageRequestBody`
  - **Required field: `data`** (type: string, format: binary) - the image file bytes
  - No crop/coordinate fields in the spec. The only multipart field is `data`.
- Response 201: `{ success, data: { id, product_id, company_id, add_time } }`

**`PUT /products/{id}/images`** (line 15181, operationId: `updateProductImage`)
- Path param: `id` (integer)
- Request body: `multipart/form-data`
  - Schema title: `UpdateProductImageRequestBody`
  - **Required field: `data`** (type: string, format: binary) - same shape as POST
  - No additional fields
- Response 200: `{ success, data: { id, product_id, company_id, add_time } }`

**Confirmed: a `PUT` (update) endpoint exists** at line 15181. Both POST and PUT share the identical single-field multipart schema (`data` = binary file).

**`DELETE /products/{id}/images`** (line 15250, operationId: `deleteProductImage`) - **already shipped** in PR #66.

### Existing Pattern to Mirror

Product follower handlers in `src/tools/products.ts` (lines 366-475) are the canonical template:
- `listProductFollowers` (line 371): `buildPaginationParamsV2` + `client.get` + `extractPaginationV2` + `createListSummary`
- `addProductFollower` (line 400): `client.post` + `{ user_id }` body
- `getProductFollowersChangelog` (line 425): paginated `client.get` on `/changelog` sub-path
- `deleteProductFollower` (line 454): `destructiveOperationGuard()` guard + `client.delete`

Product follower schemas in `src/schemas/products.ts` (lines 198-227) are the canonical schema template:
- `ListProductFollowersSchema = PaginationParamsSchema.extend({ id: z.number().int().positive() })`
- `AddProductFollowerSchema = IdParamSchema.extend({ user_id: z.number().int().positive() })`
- `DeleteProductFollowerSchema = IdParamSchema.extend({ follower_id: z.number().int().positive() })`
- `ProductFollowersChangelogSchema = PaginationParamsSchema.extend({ id: z.number().int().positive() })`

---

## Key Technical Decisions

### Decision 1: Multipart Client Approach

**Choice: Add two new public methods `postMultipart<T>` and `putMultipart<T>` to `PipedriveClient`.**

Rationale:
- The existing `post()` and `put()` methods have the signature `(endpoint, body: Record<string, unknown>, version)`. Changing them to accept `FormData | Record<string, unknown>` would require runtime `instanceof FormData` branching inside `request()`, muddying the single JSON-only path that currently works correctly across all 12+ entities.
- Separate methods make the type contract explicit: `postMultipart` accepts `FormData`, never `Record<string, unknown>`. No overloading or union types in the common path.
- Two methods is a small surface increase (two functions, ~20 lines total). The alternative refactor of `request()` would add branching to the hot path for all requests.
- Callers in `src/tools/products.ts` call `client.postMultipart(...)` or `client.putMultipart(...)` - the different name signals the different transport to the reader immediately.

**REQUIRED — no boilerplate duplication (review finding, 2026-06-09).** `requestMultipart` must NOT copy-paste the URL construction, auth branching, or response/error parsing from `request()`. Extract the shared steps into private helpers that BOTH `request()` and `requestMultipart()` call, so the two paths cannot drift if auth logic ever changes. The only thing that differs between the JSON and multipart paths is body serialization + the `Content-Type` handling. Acceptance: a reviewer can confirm there is exactly one implementation of the URL-build and auth-header logic in `src/client.ts`, shared by both methods (see U4 acceptance criterion).

**Directional implementation sketch (not normative code):**

```
// In PipedriveClient — extract the shared steps first:
private buildRequestUrl(config: Config, endpoint: string, version: ApiVersion): URL { /* baseUrl + endpoint */ }
private applyAuth(config: Config, version: ApiVersion, url: URL, headers: Record<string,string>): void {
  // v2 = x-api-token header; v1 = api_token query param. Single source of truth.
}
private parseResponse<T>(response: Response, body: Record<string, unknown>): ApiResponse<T> { /* ok/error envelope */ }

// request() (JSON) and requestMultipart() (FormData) BOTH call the three helpers above.
async postMultipart<T>(endpoint: string, formData: FormData, version: ApiVersion): Promise<ApiResponse<T>> {
  return this.requestMultipart<T>("POST", endpoint, formData, version);
}
async putMultipart<T>(endpoint: string, formData: FormData, version: ApiVersion): Promise<ApiResponse<T>> {
  return this.requestMultipart<T>("PUT", endpoint, formData, version);
}

private async requestMultipart<T>(method, endpoint, formData: FormData, version): Promise<ApiResponse<T>> {
  const config = this.ensureInitialized();
  const headers: Record<string, string> = { "Accept": "application/json" };
  const url = this.buildRequestUrl(config, endpoint, version);
  this.applyAuth(config, version, url, headers);

  // CRITICAL: DO NOT set Content-Type. fetch/undici sets multipart/form-data;
  //           boundary=… automatically when body is FormData.
  try {
    console.error(`[pipedrive-mcp] ${method} ${endpoint} (multipart)`);
    const response = await fetch(url.toString(), {
      method, headers, body: formData, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const responseData = await response.json() as Record<string, unknown>;
    return this.parseResponse<T>(response, responseData);
  } catch (error) {
    console.error(`[pipedrive-mcp] Network error: ${error}`);
    return { success: false, error: createErrorResponse("NETWORK_ERROR", error instanceof Error ? error.message : "Unknown network error", "Check your internet connection and try again") };
  }
}
```

The key invariant: `Content-Type` must NOT be set manually. When `body` is a `FormData` instance, the `fetch` global (Node.js 18+ undici) automatically generates a `multipart/form-data; boundary=<generated>` header. Any manual `Content-Type` set before the fetch call will conflict with or override the boundary, causing a malformed request.

**Alternative rejected:** Branching inside the existing `request()` method on `body instanceof FormData` — a union type (`Record<string, unknown> | FormData`) in the shared signature plus `instanceof` checks on the hot JSON path. The chosen approach keeps separate public methods (explicit type contract) while still sharing the boilerplate via private helpers, which is strictly better than either copy-paste or union-branching.

### Decision 2: STDIO Upload UX - How Image Bytes Reach the Tool

**Choice (revised 2026-06-09 per review finding): HYBRID — accept either `file_path` OR `base64_data` (exactly one required).** The handler prefers `file_path` when present (reads the bytes server-side), otherwise decodes `base64_data`. This removes the base64-only context-bloat risk for callers that DO share a filesystem, while keeping a transport-safe fallback for those that don't.

Why neither single option is sufficient alone:

**`file_path` alone** — The tool accepts a local filesystem path; the handler does `await fs.readFile(params.file_path)`.
- Pro: No message-size inflation; the image never enters the MCP/STDIO message or the model context.
- Con: Assumes the MCP server process and the caller share a filesystem. In Claude Desktop / remote MCP deployments this frequently fails — the server runs in a different cwd/container.

**`base64_data` alone** — The caller base64-encodes the bytes and passes them as a string.
- Pro: Transport-safe over STDIO; works in all MCP client configurations including remote.
- Con: Base64 inflates ~33% AND the entire image rides inside the STDIO message → it lands in the model context (a ~500 KB JPEG ≈ ~170K tokens), which can exhaust the context window. Bounded by `.max()` but the context cost remains.

**Hybrid resolution:** Expose both as optional params with a Zod `.refine()` requiring **exactly one** of `file_path` / `base64_data`. Filesystem-adjacent callers (CLI, local agents) pass `file_path` (no context cost); sandboxed/remote callers (Claude Desktop) pass `base64_data` (transport-safe). The handler normalizes both into a `Buffer` before building the `Blob`/`FormData`, so U5's downstream path is identical regardless of input mode.

**Schema for upload/update tools:**
- `id`: number (product ID, required)
- `file_path`: string (optional — absolute/relative path the SERVER reads via `fs.readFile`; use when caller shares the server's filesystem). Mutually exclusive with `base64_data`.
- `base64_data`: string (optional — base64-encoded image bytes; transport-safe fallback). **Bounded** by `.max(MAX_IMAGE_B64_LEN)` ≈ 5 MB decoded so an oversized input cannot force a huge synchronous `Buffer.from` allocation / OOM. Mutually exclusive with `file_path`.
- Exactly one of `file_path` / `base64_data` is required (Zod `.refine()`).
- `file_name`: string (original filename including extension, required - sets the `filename` in the multipart part's `Content-Disposition`, e.g. `product.png`; **sanitized** to reject path separators / control characters, capped at 255 chars). Note: `file_name` is the multipart part name, distinct from `file_path` (the source location); when `file_path` is used, `file_name` may default to its basename.
- `mime_type`: string (optional, e.g. `image/png`, `image/jpeg` - inferred from `file_name` if not provided; **allowlisted** to `image/(png|jpeg|gif|webp)`)

**Handler approach:** resolve bytes → `const buffer = params.file_path ? await fs.readFile(params.file_path) : Buffer.from(params.base64_data, 'base64')` → `new Blob([buffer], { type: mimeType })` → `formData.append('data', blob, params.file_name)`. The `fs.readFile` path must guard against read errors (missing/permission-denied file) and return `mcpErrorResult`-shaped failures, not throw.

---

## Implementation Units

### U1 - Deal Followers (list, add, delete, changelog)

**Goal:** Add four deal-follower tools to `src/tools/deals.ts` mirroring the product-follower pattern.

**Requirements:**
- `pipedrive_list_deal_followers`: GET `/deals/{id}/followers`, paginated (cursor/limit), v2
- `pipedrive_add_deal_follower`: POST `/deals/{id}/followers`, body `{ user_id }`, v2
- `pipedrive_get_deal_followers_changelog`: GET `/deals/{id}/followers/changelog`, paginated, v2
- `pipedrive_delete_deal_follower`: DELETE `/deals/{id}/followers/{follower_id}`, v2, gated by `destructiveOperationGuard()`

**Dependencies:** None. No client change required. Purely additive.

**Files:**
- `src/schemas/deals.ts` - add 4 schemas + type exports (append after `DeleteDealSchema`)
- `src/tools/deals.ts` - add 4 handler functions + 4 entries in `dealTools` array
- `tests/unit/schemas/deals.test.ts` - add schema unit tests
- `tests/integration/tools/deals.followers.test.ts` - new integration test file (parallel to `products.followers.test.ts`)

**Approach:** Direct 1:1 port of product-follower handlers. Replace `/products/${id}` with `/deals/${id}`. The `dealTools` array in `src/tools/deals.ts` currently ends at `pipedrive_delete_deal` (line 379). Append the four follower tool entries after it.

**Patterns:**
- List: `buildPaginationParamsV2(params.cursor, params.limit)` + `client.get(...)` + `extractPaginationV2` + `createListSummary("follower", ...)`
- Add: `client.post(..., { user_id: params.user_id }, "v2")`
- Changelog: `client.get(`.../followers/changelog`, ...)` + `createListSummary` with "changelog" in summary
- Delete: `destructiveOperationGuard()` first, then `client.delete(...)`

**Test scenarios:**
- List: hits correct v2 URL, forwards cursor param, surfaces `has_more`/`next_cursor`, summary contains "follower" + count, isError on failure, no `api_token` in URL
- Add: correct URL + method, `user_id` in request body, summary "Follower added to deal"
- Changelog: correct URL, pagination in response, summary contains "changelog"
- Delete: blocks when `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset, no fetch call when blocked, DELETE to `/deals/{id}/followers/{follower_id}` when enabled

**Verification:** `npm test` green; all four tools appear in `allTools` via `dealTools` spread.

---

### U2 - Person Followers + Optional Person Picture Read

**Goal:** Add four person-follower tools to `src/tools/persons.ts`. Optionally add `pipedrive_get_person_picture` (read tool, low cost, no dependencies).

**Requirements:**
- `pipedrive_list_person_followers`: GET `/persons/{id}/followers`, v2, paginated
- `pipedrive_add_person_follower`: POST `/persons/{id}/followers`, body `{ user_id }`, v2
- `pipedrive_get_person_followers_changelog`: GET `/persons/{id}/followers/changelog`, v2, paginated
- `pipedrive_delete_person_follower`: DELETE `/persons/{id}/followers/{follower_id}`, v2, gated
- **Recommended:** `pipedrive_get_person_picture`: GET `/persons/{id}/picture`, v2, read-only, returns `{ id, item_type, item_id, added_by_user_id, active_flag, file_size, pictures: { '128': string, '512': string } }`

**Person picture write is explicitly OUT OF SCOPE.** The v2 API exposes only a `get` at `/persons/{id}/picture`. No upload endpoint exists. Do not plan or note it as "future" - it is impossible in v2 without a new API endpoint from Pipedrive.

**Recommendation on picture read tool:** Include it. It is a GET-only, zero-dependency tool (no schema complexity, no client change, 15 lines of handler code). It fills a gap callers will actually encounter when working with person contacts. The `GetPersonPictureSchema = IdParamSchema` schema is trivial. Include it in U2 to minimize future churn.

**Dependencies:** None for followers. None for picture read. No client change required.

**Files:**
- `src/schemas/persons.ts` - add 4 follower schemas + 1 picture schema (optional) + type exports
- `src/tools/persons.ts` - add 4-5 handler functions + 4-5 entries in `personTools` array
- `tests/unit/schemas/persons.test.ts` - add schema unit tests
- `tests/integration/tools/persons.followers.test.ts` - new integration test file

**Approach:** Same as U1. Replace `/deals/` with `/persons/`. For the picture tool: `client.get<unknown>(`/persons/${params.id}/picture`, undefined, "v2")` - single GET, no pagination.

**Test scenarios (followers):** Same pattern as U1 but for persons.
**Test scenarios (picture read):** hits `/api/v2/persons/{id}/picture`, returns `pictures['128']` and `pictures['512']` in data, isError when 404.

**Verification:** `npm test` green.

---

### U3 - Organization Followers

**Goal:** Add four organization-follower tools to `src/tools/organizations.ts`.

**Requirements:**
- `pipedrive_list_organization_followers`: GET `/organizations/{id}/followers`, v2, paginated
- `pipedrive_add_organization_follower`: POST `/organizations/{id}/followers`, body `{ user_id }`, v2
- `pipedrive_get_organization_followers_changelog`: GET `/organizations/{id}/followers/changelog`, v2, paginated
- `pipedrive_delete_organization_follower`: DELETE `/organizations/{id}/followers/{follower_id}`, v2, gated

**Dependencies:** None. No client change required.

**Files:**
- `src/schemas/organizations.ts` - add 4 schemas + type exports
- `src/tools/organizations.ts` - add 4 handler functions + 4 entries in `organizationTools` array
- `tests/unit/schemas/organizations.test.ts` - add schema unit tests
- `tests/integration/tools/organizations.followers.test.ts` - new integration test file

**Approach:** Same as U1/U2. Replace entity prefix with `/organizations/`.

**Test scenarios:** Same pattern as U1.

**Verification:** `npm test` green.

---

### U4 - `postMultipart` / `putMultipart` Client Helper

**Goal:** Add two public multipart methods to `PipedriveClient` in `src/client.ts` that accept `FormData` without setting `Content-Type`, enabling the product image upload/update tools.

**Requirements:**
- `async postMultipart<T>(endpoint: string, formData: FormData, version: ApiVersion): Promise<ApiResponse<T>>`
- `async putMultipart<T>(endpoint: string, formData: FormData, version: ApiVersion): Promise<ApiResponse<T>>`
- Both must NOT set `Content-Type` header manually (let fetch set multipart boundary)
- **REQUIRED — shared boilerplate, no copy-paste:** the URL-build, auth (v2 `x-api-token` header / v1 `api_token` query param), and response/error parsing must live in private helpers called by BOTH `request()` and `requestMultipart()`. `requestMultipart` must NOT duplicate that logic inline. **Acceptance criterion:** `src/client.ts` contains exactly one implementation of the URL-build and auth-header logic, shared by the JSON and multipart paths; a reviewer reverting the auth logic in the shared helper breaks both paths' tests.
- Both must use the same error handling (`handleApiError`, `createErrorResponse`) and timeout (`REQUEST_TIMEOUT_MS`)
- Both must log to stderr (not stdout) to avoid STDIO protocol corruption

**Dependencies:** None (self-contained client change). U5 depends on U4.

**Files:**
- `src/client.ts` - extract shared private helpers (e.g. `buildRequestUrl`, `applyAuth`, `parseResponse`) and refactor `request()` to use them; add `postMultipart`, `putMultipart`, private `requestMultipart`
- `tests/unit/client.test.ts` - add multipart routing tests

**Approach:** See the directional sketch + the **REQUIRED — no boilerplate duplication** note in Key Technical Decisions / Decision 1. First extract the shared helpers and point the existing `request()` at them (behavior-neutral; existing client tests must stay green), THEN add the multipart methods on top.

**Test scenarios:**
- `postMultipart` with v2 sends `x-api-token` header and does NOT include `api_token` query param
- `postMultipart` does NOT set `Content-Type: application/json` (app-side omission guard)
- `postMultipart` sends `FormData` as the request body directly (not `JSON.stringify`'d)
- `putMultipart` uses method `PUT`
- Network error returns `{ success: false, error: { code: 'NETWORK_ERROR' } }`
- HTTP error response (e.g., 413 Payload Too Large) returns `{ success: false, error: ... }`
- **Real-boundary test (review finding 2026-06-09):** the "no `Content-Type: application/json`" assertion only proves the app side. Add a test that exercises the REAL fetch path — use `undici`'s `MockAgent`/`setGlobalDispatcher` (or an in-process `http` server) to capture the actual outbound request — and assert its `Content-Type` header **starts with** `multipart/form-data; boundary=`. This proves the boundary is genuinely generated, not merely that we didn't override it.
- Shared-helper regression: a test that confirms `request()` (JSON path) and `postMultipart` (multipart path) both emit the same v2 `x-api-token` auth (so the extraction didn't fork auth behavior).

**Verification:** `npm test` green. Existing client tests pass unchanged after the helper extraction (proves behavior-neutral refactor).

---

### U5 - Product Image Upload + Update

**Goal:** Add `pipedrive_upload_product_image` and `pipedrive_update_product_image` tools to `src/tools/products.ts`, using the `postMultipart`/`putMultipart` methods from U4.

**Requirements:**
- `pipedrive_upload_product_image`: POST `/products/{id}/images`, `multipart/form-data`, field `data` = image bytes
- `pipedrive_update_product_image`: PUT `/products/{id}/images`, `multipart/form-data`, field `data` = image bytes
- Both accept **either** `file_path` **or** `base64_data` (exactly one required, hybrid — see Decision 2), plus `file_name` (string, required) and optional `mime_type`
- Both accept optional `mime_type` (string) parameter; infer from `file_name` extension if absent
- Neither is a destructive operation (upload/update are not deletes; no `destructiveOperationGuard()`)
- Response 201/200: return `{ summary, data: { id, product_id, company_id, add_time } }`

**Dependencies:** U4 (`postMultipart`, `putMultipart` must exist in `src/client.ts`).

**Files:**
- `src/schemas/products.ts` - add `UploadProductImageSchema`, `UpdateProductImageSchema` + type exports
- `src/tools/products.ts` - add `uploadProductImage`, `updateProductImage` handler functions + 2 entries in `productTools` array (append after `pipedrive_delete_product_image`); import `fs/promises` for the `file_path` branch
- `tests/unit/schemas/products.images.test.ts` - extend with upload/update schema tests (incl. the exactly-one-of refine)
- `tests/integration/tools/products.images.test.ts` - extend with upload/update integration tests

**Approach:**

Handler outline for `uploadProductImage`:
1. Resolve bytes by input mode: `const buffer = params.file_path ? await fs.readFile(params.file_path) : Buffer.from(params.base64_data!, 'base64')`. Wrap the `fs.readFile` in try/catch and return an `mcpErrorResult`-shaped failure (NOT a throw) on missing/unreadable file.
2. Infer `mimeType` from `params.mime_type` or from `file_name` extension mapping (`.png` -> `image/png`, `.jpg`/`.jpeg` -> `image/jpeg`, `.gif` -> `image/gif`, `.webp` -> `image/webp`; default fallback: `application/octet-stream`)
3. `const blob = new Blob([buffer], { type: mimeType })`
4. `const formData = new FormData(); formData.append('data', blob, params.file_name)`
5. `const response = await client.postMultipart<unknown>(`/products/${params.id}/images`, formData, "v2")`
6. Standard error check + return

`updateProductImage` is identical but calls `client.putMultipart(...)`.

**Zod schemas:**
```
// MAX_IMAGE_B64_LEN ≈ 6_900_000 chars (~5 MB decoded). Bound the base64 string so an
// oversized/malicious input cannot force a huge synchronous Buffer.from allocation (OOM).
// Tune once Pipedrive's real image-size limit is confirmed (Open Question 1).
UploadProductImageSchema = IdParamSchema.extend({
  file_path: z.string().min(1).optional()
    .describe("Path the SERVER reads via fs.readFile (use when caller shares the server filesystem). Mutually exclusive with base64_data."),
  base64_data: z.string().min(1).max(MAX_IMAGE_B64_LEN).optional()
    .describe("Base64-encoded image bytes (transport-safe fallback). Mutually exclusive with file_path."),
  file_name: z.string().min(1).max(255)
    .refine((n) => !/[\/\\\r\n\0]/.test(n), "file_name must not contain path separators or control characters")
    .describe("Original filename including extension (e.g. product.png)"),
  mime_type: z.string().regex(/^image\/(png|jpeg|gif|webp)$/).optional()
    .describe("MIME type (e.g. image/png). Inferred from file_name if omitted."),
}).refine(
  (v) => (v.file_path == null) !== (v.base64_data == null),
  { message: "Provide exactly one of file_path or base64_data" },
)
UpdateProductImageSchema = UploadProductImageSchema  // identical shape; alias or duplicate
```

**Test scenarios:**
- Schema: accepts `{ id, base64_data, file_name }`; accepts `{ id, file_path, file_name }`; **rejects** when BOTH `file_path` and `base64_data` are present; **rejects** when NEITHER is present; rejects missing `id`/`file_name`; accepts optional `mime_type`; rejects `mime_type` outside the image allowlist; rejects `file_name` with a path separator
- Integration (upload, base64 mode): mock fetch captures `FormData` body; assert method `POST`; URL `/api/v2/products/{id}/images`; no `Content-Type: application/json`; summary contains "uploaded"; field name is `data`
- Integration (upload, file_path mode): stub `fs.readFile` to return a small buffer; assert the same `FormData`/method/URL; assert the image bytes never appear as a base64 param
- Integration (file_path error): `fs.readFile` rejects (ENOENT) → handler returns `isError: true` via `mcpErrorResult`, no fetch call
- Integration (update): method `PUT`; summary contains "updated"

**Verification:** `npm test` green. Upload and update tools appear in `productTools` array.

---

## Risks

### R1 - `deals.ts` File Conflict with #67

`src/tools/deals.ts` is edited by both #69 (follower handlers) and #67 (discounts, installments, line-item products). These issues **cannot be implemented in parallel** if they both branch from the same base. The sequencing requirement is: **#69 (U1 deal followers) must merge first**, then #67 must rebase onto the merged #69 commit before editing `deals.ts`. The same applies to `src/schemas/deals.ts`.

Similarly: `src/tools/persons.ts` and `src/tools/organizations.ts` may be touched by other issues in #51 epic. Verify no open PRs touch these files before starting U2/U3.

**Mitigation (hardened 2026-06-09 per review finding — enforced, not just social):**
1. **Tracked dependency:** a heads-up comment is posted on issue **#67** stating that #69 U1 adds deal-follower handlers to `src/tools/deals.ts` / `src/schemas/deals.ts`, that **#69 owns deal followers** (so #67 must NOT add them), and that #67 must branch from / rebase onto the merged #69 commit before editing those files.
2. **Merge-order rule:** #69 U1 (deal followers) is the gating change. If #67 nonetheless opens first, the second PR to merge owns the rebase; the conflict is confined to the follower block appended at the end of `dealTools` + the four schemas, so the rebase is mechanical.
3. **Implementer check:** before starting U1/U2/U3, run `gh pr list --search "deals.ts OR persons.ts OR organizations.ts"` (or inspect open PRs) to confirm no in-flight PR touches these files.

### R2 - `Content-Type` Boundary Corruption

If any code path sets `Content-Type: application/json` (or any `Content-Type`) before the `fetch` call in `requestMultipart`, the multipart boundary will be absent or overridden, causing a 400 from Pipedrive. This is a silent failure mode (the request is sent, the server rejects it).

**Mitigation:** Unit test in `tests/unit/client.test.ts` that explicitly asserts `Content-Type` is NOT set to `application/json` for multipart requests. The test must inspect the `headers` object passed to the mocked `fetch`.

### R3 - Base64 Payload Size Over STDIO

For large images (e.g., a 5 MB product image), the base64-encoded string in the MCP STDIO message will be ~6.7 MB. Some MCP clients may impose message size limits or exhibit performance degradation.

**Mitigation:** Document the base64 approach in the tool description. Note that the Pipedrive API likely enforces its own image size limit (not currently documented in `openapi-v2.yaml`; implementors should validate empirically). Keep tool description focused on practical image sizes (product thumbnails).

### R4 - `Buffer` Global in Node.js ESM Context

`Buffer.from(...)` is a Node.js global, available in Node.js 18+ but not in browser or Deno environments. The MCP server targets Node.js, so this is safe - but it is worth noting for any future test environments that might run in a browser-like context.

**Mitigation:** No action needed. Server is Node.js only.

### R5 - FormData Global Availability

`FormData` and `Blob` are Web API globals available in Node.js 18.0+ (undici-based). The project targets Node.js (verify `engines` field in `package.json` if needed). No polyfill required.

---

## Test Strategy

### Unit Tests (`tests/unit/`)

| File | New tests |
|------|-----------|
| `tests/unit/schemas/deals.test.ts` | 4 follower schemas: valid acceptance, missing id, missing follower_id/user_id |
| `tests/unit/schemas/persons.test.ts` | 4 follower schemas + 1 picture schema (optional) |
| `tests/unit/schemas/organizations.test.ts` | 4 follower schemas |
| `tests/unit/schemas/products.images.test.ts` | Extend: `UploadProductImageSchema`, `UpdateProductImageSchema` - valid, missing required fields |
| `tests/unit/client.test.ts` | `postMultipart` sends FormData, no Content-Type header; `putMultipart` uses PUT; auth header present; error handling |

### Integration Tests (`tests/integration/tools/`)

| File | Scope |
|------|-------|
| `tests/integration/tools/deals.followers.test.ts` | New file; 4 follower tools; ~15-20 tests mirroring `products.followers.test.ts` |
| `tests/integration/tools/persons.followers.test.ts` | New file; 4 follower tools + optional picture tool |
| `tests/integration/tools/organizations.followers.test.ts` | New file; 4 follower tools |
| `tests/integration/tools/products.images.test.ts` | Extend existing file; upload POST + update PUT scenarios |

All integration tests follow the established pattern: `setupValidEnv()` + `vi.unstubAllGlobals()` in `beforeEach`, dynamic import of the tool module, `mockApiSuccess`/`mockApiError`/`mockFetch` helpers from `tests/helpers/mockFetch.ts` (imported as `../../helpers/mockFetch.js` from files under `tests/integration/tools/`; `setupValidEnv` comes from `tests/helpers/mockEnv.ts`). **Note:** `mockApiSuccess` does not expose the captured `fetch` `init`, so the multipart body/header assertions in U4/U5 must use a raw `vi.stubGlobal('fetch', mockFn)` that captures `init` directly.

For multipart integration tests: mock `fetch` via `vi.stubGlobal('fetch', mockFn)` where `mockFn` captures the `init` argument. Assert `init.body instanceof FormData`, method is correct, URL contains `/api/v2/products/{id}/images`, and headers do not contain `Content-Type: application/json`.

---

## Sequencing

```
Phase 1 (no client dependency - can ship as one PR or as individual slices):
  U1 - Deal followers     → src/tools/deals.ts, src/schemas/deals.ts
  U2 - Person followers   → src/tools/persons.ts, src/schemas/persons.ts
  U3 - Org followers      → src/tools/organizations.ts, src/schemas/organizations.ts

Phase 2 (client change - depends on nothing from Phase 1):
  U4 - postMultipart/putMultipart client helper → src/client.ts

Phase 3 (depends on U4):
  U5 - Product image upload/update → src/tools/products.ts, src/schemas/products.ts
```

**U1-U3 are fully independent of each other and of U4/U5.** They can be developed and merged in any order or as a single combined PR.

**U4 is independent of U1-U3.** It can be developed concurrently but must merge before U5 starts.

**U5 depends on U4.** Do not start U5 until U4 is merged.

**File conflict alert:** U1 edits `src/tools/deals.ts` and `src/schemas/deals.ts`. Issue #67 also edits these files. U1 must merge before #67 opens, or #67 must rebase on the U1 commit. Coordinate before starting implementation.

**Recommended PR structure:**
- PR A: U1 + U2 + U3 (all follower management, ~200-250 lines of new code + tests, closes the cross-entity followers part of #69)
- PR B: U4 + U5 (multipart client + product image upload/update, closes the multipart media part of #69)

---

## Open Questions

1. **Pipedrive image size limit:** The openapi spec does not document a maximum image size for `POST /products/{id}/images`. Implementors should test empirically during U5 to confirm the base64 payload ceiling. If Pipedrive enforces a limit (e.g., 5 MB), document it in the tool description.

2. **MIME type inference completeness:** The plan calls for inferring MIME type from file extension in U5. If `file_name` has an unrecognized extension, the handler defaults to `application/octet-stream`. Confirm whether Pipedrive rejects non-image MIME types with a useful error message or silently accepts any binary.

3. **`deleteProductFollower` classification:** This was implemented in #50 as a destructive (gated) operation. The same gating applies to all `delete_*_follower` tools here. Confirm with the team that follower removals should remain gated behind `PIPEDRIVE_ENABLE_DESTRUCTIVE=true` (the product precedent suggests yes).

4. **Person picture read tool name:** If included, recommend `pipedrive_get_person_picture` (consistent with `pipedrive_get_product_image`). Confirm no naming collision with existing tools via `src/tools/index.ts` `allTools` array.

---

## Confidence

**U1-U3 (follower management): High.** The v2 shapes are confirmed at every anchor. The product-follower template is a clean 1:1 copy-and-adapt. No client changes. No design decisions. Estimated implementation time: 2-3 hours per unit.

**U4 (multipart client): Medium-High.** The FormData/fetch boundary behavior is well-understood. The risk is the `Content-Type` omission invariant, which is mitigated by the unit test. The implementation is small (~30-40 lines). Estimated: 1-2 hours.

**U5 (product image upload/update): Medium.** Depends on U4. The base64 UX decision is settled. The main uncertainty is Pipedrive's actual behavior with `multipart/form-data` over the v2 API (no integration tests can run against the live API in CI). The mock-based test coverage is solid; live validation requires a dev/sandbox API key. Estimated: 2-3 hours.

**Overall issue #69: High confidence** that the follower tools (U1-U3) will ship cleanly. Medium-High confidence on multipart (U4-U5) given the settled UX decision and small surface area.
