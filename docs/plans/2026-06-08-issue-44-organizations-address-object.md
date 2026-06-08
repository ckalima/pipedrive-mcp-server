# Issue #44 — Organizations `address` sent as string but v2 requires an address object

**Status:** Planned (implementation pending — separate agent)
**Date:** 2026-06-08
**Scope:** organizations entity only (parallel batch #42–#46; disjoint files)
**Zod version:** 3.25 (Zod 3 syntax — do NOT pre-migrate to Zod 4; #16 PR B handles that later)

---

## 1. Issue + one-line summary

The organizations create/update tools send `address` as a plain **string**, but the Pipedrive **v2** API expects `address` to be an **object** (`OrganizationItemAddress`). Sending a string drops the address (or fails validation). Fix: model `address` as a local Zod object schema in `src/schemas/organizations.ts`, update the tool `inputSchema` to a typed object property, and flip the false-green tests that assert the old string shape.

---

## 2. Root cause (file:line — what is sent vs what v2 wants)

Verified independently against the current tree:

| Location | Current code | Problem |
| --- | --- | --- |
| `src/schemas/organizations.ts:59` | `address: z.string().optional().describe("Full address")` in `CreateOrganizationSchema` | Validates/accepts a string |
| `src/schemas/organizations.ts:78` | `address: z.string().optional().describe("New address")` in `UpdateOrganizationSchema` | Validates/accepts a string |
| `src/tools/organizations.ts:106` | `if (params.address) body.address = params.address;` (create) | Passes the string straight through to the v2 POST body |
| `src/tools/organizations.ts:140` | `if (updateFields.address) body.address = updateFields.address;` (update) | Passes the string straight through to the v2 PATCH body |
| `src/tools/organizations.ts:272` | `address: { type: "string", description: "Full address" }` (create `inputSchema`) | Advertises a string contract to MCP clients |
| `src/tools/organizations.ts:292` | `address: { type: "string", description: "New address" }` (update `inputSchema`) | Advertises a string contract to MCP clients |

**What is sent today:** `"address": "123 Business Ave"` (string).
**What v2 wants:** `"address": { "value": "123 Business Ave", ... }` (object).

The body passthrough at lines 106/140 is correct as-is: once the schema yields an object, `body.address = params.address` will assign the object. **No change to the passthrough logic is required** — only the schema and the `inputSchema` need to change. (The `if (params.address)` truthiness guard remains valid: an object is truthy, an absent/`undefined` address is falsy.)

---

## 3. v2 target shape (quoted from `docs/api/openapi-v2.yaml`)

The `POST /organizations` request body (operationId `addOrganization`, starts line 10741) and the `PATCH /organizations/{id}` request body share the same `address` definition. `OrganizationItemAddress` is defined at **lines 10780–10814**:

```yaml
# docs/api/openapi-v2.yaml:10780-10814
                address:
                  description: The address of the organization
                  type: object
                  title: OrganizationItemAddress
                  properties:
                    value:
                      type: string
                      description: The full address of the organization
                    country:
                      type: string
                      description: Country of the organization
                    admin_area_level_1:
                      type: string
                      description: Admin area level 1 (e.g. state) of the organization
                    admin_area_level_2:
                      type: string
                      description: Admin area level 2 (e.g. county) of the organization
                    locality:
                      type: string
                      description: Locality (e.g. city) of the organization
                    sublocality:
                      type: string
                      description: Sublocality (e.g. neighborhood) of the organization
                    route:
                      type: string
                      description: Route (e.g. street) of the organization
                    street_number:
                      type: string
                      description: Street number of the organization
                    subpremise:
                      type: string
                      description: Subpremise (e.g. apartment/suite number) of the organization
                    postal_code:
                      type: string
                      description: Postal code of the organization
```

**Key facts confirmed in the spec:**
- `address` itself is **optional** (it is NOT in the `required` list — the POST body only requires `title`; note the spec quirk that the documented required field is `title` while the actual writable name field is `name`, which is out of scope for #44).
- Every subfield is `type: string` and **all subfields are optional** (no `required` array inside the object).
- There are exactly **10 subfields**: `value`, `country`, `admin_area_level_1`, `admin_area_level_2`, `locality`, `sublocality`, `route`, `street_number`, `subpremise`, `postal_code`.

The GET/list response also returns this same object shape (see the example at `docs/api/openapi-v2.yaml:10730-10731`, which shows `subpremise: 123A` / `postal_code: '94085'` nested under `address`), confirming the object is symmetric across read and write.

---

## 4. Changes — file by file (precise)

### 4.1 `src/schemas/organizations.ts`

**(a) Add a LOCAL `AddressSchema` near the top of the file**, after the imports (around line 13, before `ListOrganizationsSchema`). Define it locally in THIS file. **Do NOT add it to `common.ts`** (common.ts is owned by issue #46 in this parallel batch).

```ts
/**
 * Organization address object (v2 OrganizationItemAddress).
 * All subfields are optional strings. The whole object is optional.
 * Defined locally per issue #44 disjointness — do NOT move to common.ts.
 */
export const AddressSchema = z
  .object({
    value: z.string().optional()
      .describe("The full address of the organization"),
    country: z.string().optional()
      .describe("Country of the organization"),
    admin_area_level_1: z.string().optional()
      .describe("Admin area level 1 (e.g. state) of the organization"),
    admin_area_level_2: z.string().optional()
      .describe("Admin area level 2 (e.g. county) of the organization"),
    locality: z.string().optional()
      .describe("Locality (e.g. city) of the organization"),
    sublocality: z.string().optional()
      .describe("Sublocality (e.g. neighborhood) of the organization"),
    route: z.string().optional()
      .describe("Route (e.g. street) of the organization"),
    street_number: z.string().optional()
      .describe("Street number of the organization"),
    subpremise: z.string().optional()
      .describe("Subpremise (e.g. apartment/suite number) of the organization"),
    postal_code: z.string().optional()
      .describe("Postal code of the organization"),
  })
  .describe("Organization address as a structured object (v2). Provide at least 'value' for the full address.");
```

Notes:
- Use plain `.optional()` on the object at the usage site (see below). The schema definition above is the bare `z.object({...})`; the `.optional()` is applied where it is referenced in Create/Update so both call sites read consistently.
- All 10 subfields are `z.string().optional()` — matches the spec exactly (every subfield is an optional string).
- Exporting `AddressSchema` is fine (the unit test will import it; see §5). It stays in this file.

**(b) Replace the `address` field in `CreateOrganizationSchema`** (current line 59):

```ts
// BEFORE (line 59)
  address: z.string().optional()
    .describe("Full address"),

// AFTER
  address: AddressSchema.optional()
    .describe("Full address as a structured object (v2). Provide 'value' for the full address."),
```

**(c) Replace the `address` field in `UpdateOrganizationSchema`** (current line 78):

```ts
// BEFORE (line 78)
  address: z.string().optional()
    .describe("New address"),

// AFTER
  address: AddressSchema.optional()
    .describe("New address as a structured object (v2). Provide 'value' for the full address."),
```

**(d) Type exports** (lines 106–111): No change to the export statements themselves. `CreateOrganizationParams` and `UpdateOrganizationParams` are derived via `z.infer<>`, so `address` automatically becomes the inferred object type (`{ value?: string; country?: string; ... } | undefined`) instead of `string | undefined`. Optionally add a convenience export `export type OrganizationAddress = z.infer<typeof AddressSchema>;` — **optional, low value; include only if it reads cleanly.** Not required for the fix.

### 4.2 `src/tools/organizations.ts`

**(a) Body passthrough — NO logic change.** Lines 106 (`if (params.address) body.address = params.address;`) and 140 (`if (updateFields.address) body.address = updateFields.address;`) stay exactly as written. They now assign the validated object. Leave them untouched.

**(b) Update the create `inputSchema` `address` property** (current line 272). Replace the single string property with a typed object property mirroring the 10 subfields:

```ts
// BEFORE (line 272)
        address: { type: "string", description: "Full address" },

// AFTER
        address: {
          type: "object",
          description: "Organization address as a structured object (v2). Provide 'value' for the full address.",
          properties: {
            value: { type: "string", description: "The full address" },
            country: { type: "string", description: "Country" },
            admin_area_level_1: { type: "string", description: "Admin area level 1 (e.g. state)" },
            admin_area_level_2: { type: "string", description: "Admin area level 2 (e.g. county)" },
            locality: { type: "string", description: "Locality (e.g. city)" },
            sublocality: { type: "string", description: "Sublocality (e.g. neighborhood)" },
            route: { type: "string", description: "Route (e.g. street)" },
            street_number: { type: "string", description: "Street number" },
            subpremise: { type: "string", description: "Subpremise (e.g. apartment/suite number)" },
            postal_code: { type: "string", description: "Postal code" },
          },
        },
```

**(c) Update the update `inputSchema` `address` property** (current line 292). Same object shape (description says "New address"):

```ts
// BEFORE (line 292)
        address: { type: "string", description: "New address" },

// AFTER
        address: {
          type: "object",
          description: "New organization address as a structured object (v2). Provide 'value' for the full address.",
          properties: {
            value: { type: "string", description: "The full address" },
            country: { type: "string", description: "Country" },
            admin_area_level_1: { type: "string", description: "Admin area level 1 (e.g. state)" },
            admin_area_level_2: { type: "string", description: "Admin area level 2 (e.g. county)" },
            locality: { type: "string", description: "Locality (e.g. city)" },
            sublocality: { type: "string", description: "Sublocality (e.g. neighborhood)" },
            route: { type: "string", description: "Route (e.g. street)" },
            street_number: { type: "string", description: "Street number" },
            subpremise: { type: "string", description: "Subpremise (e.g. apartment/suite number)" },
            postal_code: { type: "string", description: "Postal code" },
          },
        },
```

`inputSchema` is a hand-written JSON-Schema literal (not generated from Zod), so both the Zod schema (§4.1) and this JSON Schema must be edited in lockstep. There is no codegen linking them.

### 4.3 `value`-only convenience — decision (DOCUMENTED)

**Decision: do NOT add a string|object union. Keep `address` strictly an object.**

Rationale:
- The v2 API only accepts an object. A union (`z.union([z.string(), AddressSchema])`) would reintroduce the bug surface (a bare string would still be dropped/rejected by v2 unless we transform it).
- The "convenience" path is already covered by the object form `{ value: "123 Business Ave" }` — a single key. This is the minimal, spec-correct way to send a full address without breaking each component out.
- A `.transform()` that wraps a bare string into `{ value: string }` is explicitly **rejected** for this issue: it hides the contract change, complicates the `inputSchema` (which cannot express the transform), and is the kind of implicit coercion the codebase avoids. If a string-coercion convenience is ever wanted, it should be a separate, deliberate issue.

So the convenience story is: callers send `{ "address": { "value": "123 Business Ave, Suite 500" } }`. Document this in the field `.describe()` text (done above: "Provide 'value' for the full address").

---

## 5. Test changes — every false-green assertion to flip

These tests currently pass **because they assert the v1 string shape** while the bug ships. Each must be updated to the v2 object shape. Touch ONLY the two organizations test files.

### 5.1 `tests/integration/tools/organizations.test.ts`

**(a) `createOrganization` → "should pass all fields to API"** (lines 99–116). The issue cites ~line 108 (the input) and line 114 (`expect(body.address).toBe('123 Business Ave')`).

- **Line 107 (input):** change `address: '123 Business Ave',` to an object:
  ```ts
  address: { value: '123 Business Ave' },
  ```
- **Line 114 (assertion) — FALSE-GREEN, FLIP IT:** change
  ```ts
  expect(body.address).toBe('123 Business Ave');
  ```
  to assert the object reaches the POST body unchanged:
  ```ts
  expect(body.address).toEqual({ value: '123 Business Ave' });
  ```
  (Optionally also assert a multi-field address in the same or an added case, e.g. input `address: { value: '123 Business Ave', locality: 'Springfield', postal_code: '94085' }` and `expect(body.address).toEqual({ value: '123 Business Ave', locality: 'Springfield', postal_code: '94085' })` — confirms all subfields pass through. Recommended but optional.)

**(b) `updateOrganization` → "should send PATCH request"** (lines 130–138). Line 134 passes a string address as input:
- **Line 134 (input):** change `await updateOrganization({ id: 1, address: 'New Address' });` to:
  ```ts
  await updateOrganization({ id: 1, address: { value: 'New Address' } });
  ```
  This test only asserts `options.method === 'PATCH'` (line 137), so there is no string assertion to flip here — but the **input must change to an object** or the call will fail Zod validation once the schema is an object. Without this edit the test would go red for the wrong reason.
  - **Recommended hardening (optional):** add `const body = JSON.parse(options.body); expect(body.address).toEqual({ value: 'New Address' });` to prove the object reaches the PATCH body.

**(c) Response-fixture note (do NOT edit the shared helper).** Several tests use `fixtures.organization` (from `tests/helpers/mockFetch.ts`), whose `address: '123 Main St'` is a **response** stub. The brief says this is harmless and the shared helper is OFF-LIMITS. No org integration test currently asserts `parsed.data.address`, so the string response stub does not cause a failure. **Do not change `mockFetch.ts`.** If any new test needs an object-shaped *response* address, construct that response object **locally inside `organizations.test.ts`** (e.g. `mockApiSuccess({ ...fixtures.organization, address: { value: '123 Main St' } })`) rather than editing the helper. This is optional and only if a response-shape assertion is added.

### 5.2 `tests/unit/schemas/organizations.test.ts`

**(a) `CreateOrganizationSchema` → "should accept all optional fields"** (lines 86–101).
- **Line 91 (input):** change `address: '123 Business Ave, Suite 500',` to an object:
  ```ts
  address: { value: '123 Business Ave, Suite 500' },
  ```
- **Line 99 (assertion) — FALSE-GREEN, FLIP IT:** change
  ```ts
  expect(result.address).toBe('123 Business Ave, Suite 500');
  ```
  to:
  ```ts
  expect(result.address).toEqual({ value: '123 Business Ave, Suite 500' });
  ```

**(b) `UpdateOrganizationSchema` → "should accept all updatable fields"** (lines 135–149).
- **Line 141 (input):** change `address: 'New Address',` to:
  ```ts
  address: { value: 'New Address' },
  ```
- This case asserts `result.name` and `result.visible_to` (lines 147–148), not `result.address`, so there is no string assertion to flip — but the **input must become an object** or Zod parse will throw. **Recommended (optional):** add `expect(result.address).toEqual({ value: 'New Address' });`.

**(c) NEW unit coverage for `AddressSchema` (recommended, add to this file).** Add a `describe('AddressSchema', ...)` (import `AddressSchema` from the schema module) covering:
- Accepts an object with all 10 subfields and round-trips them (`toEqual`).
- Accepts `{ value: '...' }` alone.
- Accepts `{}` (empty object — all subfields optional).
- **Rejects a bare string** to lock in the contract: `expect(() => CreateOrganizationSchema.parse({ name: 'X', address: '123 Main St' as any })).toThrow();` (this is the regression guard for the bug — it would have caught #44).
- (Subfield type guard, optional) rejects a non-string subfield, e.g. `{ postal_code: 94085 as any }` → `toThrow()`.

> Validation count: there are exactly **two** integration-test sites (5.1a line 114 string assertion + 5.1b line 134 string input) and **two** unit-test sites (5.2a line 99 string assertion + 5.2b line 141 string input) that reference the string address. The only hard *false-green assertions* (assertions that pass on the buggy shape) are **5.1a (line 114)** and **5.2a (line 99)**; the other two (5.1b, 5.2b) are string *inputs* that must change to objects to keep the tests valid. All four must be edited; the AddressSchema unit block is the new regression guard.

---

## 6. Out of scope / disjointness

**Files this plan MAY change (organizations only):**
- `src/schemas/organizations.ts`
- `src/tools/organizations.ts`
- `tests/integration/tools/organizations.test.ts`
- `tests/unit/schemas/organizations.test.ts`

**Do NOT touch (owned by other parallel issues / shared):**
- `src/schemas/common.ts` — owned by issue **#46** in this batch. `AddressSchema` MUST stay **local** to `organizations.ts`. Do not add it to `common.ts`, do not import an address schema from common.
- `tests/helpers/mockFetch.ts` and `tests/helpers/fixtures.ts` — shared helpers. The org response stub `address: '123 Main St'` (mockFetch.ts:152) stays as-is (harmless response stub). Construct any object-address *response* locally in the org test file if needed.
- `src/tools/index.ts` — tool registration; no change (the org tools array is spread there but its members are edited in place).
- `src/schemas/activities.ts` / `src/tools/activities.ts` — issue **#45** (parallel) handles the activities `location` object separately. Do not touch them even though the shape is analogous.
- Any other entity files (persons, deals, notes, etc.).

**Behavior explicitly NOT changed:** the `name`/`title` spec discrepancy, list/get/search/delete handlers, pagination, the `if (...)` truthiness guards around body assignment.

---

## 7. Definition of Done

1. `npm run build` is green (TypeScript compiles; `z.infer` for `CreateOrganizationParams`/`UpdateOrganizationParams` now types `address` as the object union and there are no type errors at the body passthrough).
2. `npm test` is green **after** the false-green assertions in §5 are corrected to the v2 object shape. (Before correcting them, the suite is expected to fail on the string-input cases because the schema now rejects strings — that is the intended signal, not a regression.)
3. Every assertion in §5 has been flipped/updated and verified against `docs/api/openapi-v2.yaml:10780-10814`:
   - integration: `expect(body.address).toEqual({ value: '123 Business Ave' })` (was `.toBe('123 Business Ave')`).
   - unit: `expect(result.address).toEqual({ value: '...' })` (was `.toBe('...')`).
   - new `AddressSchema` block rejects a bare string (regression guard for #44).
4. `AddressSchema` is defined **locally** in `src/schemas/organizations.ts` and is NOT present in `common.ts`.
5. The create and update tool `inputSchema.address` properties are `type: "object"` with the 10 subfield `properties` and descriptions, matching the Zod schema field-for-field.
6. Only the four organizations files listed in §6 are modified. `git status` shows no changes to `common.ts`, the shared test helpers, `index.ts`, or other entities.
7. The body passthrough lines (`tools/organizations.ts:106`, `:140`) are unchanged.

---

## 8. Risks / notes

- **Breaking input contract (intended).** This changes the MCP tool input for `address` from `string` to `object` on `pipedrive_create_organization` and `pipedrive_update_organization`. The issue confirms this is intended and correct — v2 requires the object. MCP clients/agents that previously sent a bare string will now get a Zod validation error and must send `{ "value": "..." }`. The field `.describe()` and `inputSchema` descriptions call this out so the surfaced tool schema guides callers to the object form.
- **Zod 3, not Zod 4.** Write the schema in Zod 3.25 syntax (`z.object({...}).optional()`, `z.string().optional()`, `.describe(...)`). Do NOT use Zod 4-only patterns. The #16 PR B migration to Zod 4 happens later and will sweep this file along with the rest.
- **Minor duplication with activities #45 (acceptable).** Activities currently models `location` as `z.string().optional()` (`src/schemas/activities.ts:107` create, `:157` update) and #45 will introduce an analogous nested location object. There will be a structurally similar local object schema in two entity files. This duplication is **acceptable for now** and explicitly in-scope-to-leave: a later refactor (#48) may DRY the address/location object schemas into a shared helper. Do NOT pre-emptively share them now — that would collide with #45/#46 in this parallel batch.
- **Response shape vs request shape.** This fix is about the **request** body (POST/PATCH). The handlers pass API responses through untouched (`data: response.data`), so the v2 object response renders fine without changes. The only response-side artifact is the harmless string stub in the shared fixture, left alone per §6.
- **Truthiness guard is safe.** `if (params.address)` correctly treats a present object as truthy and `undefined` as falsy. An empty object `{}` would be truthy and sent as `address: {}` — acceptable and consistent with current behavior (an explicitly provided empty address). No special-casing needed.
