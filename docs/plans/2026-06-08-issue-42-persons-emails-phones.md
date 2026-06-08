# Issue #42 — Persons create/update sends scalar-keyed `email`/`phone` instead of v2 `emails`/`phones` arrays

## 1. Issue + one-line summary

`pipedrive_create_person` and `pipedrive_update_person` send the request-body keys `email` and `phone`, but the Pipedrive v2 `POST /persons` and `PATCH /persons/{id}` endpoints expect the keys `emails` and `phones`. v2 silently ignores the unknown `email`/`phone` keys, so all contact email/phone data submitted through these tools is dropped on the floor. The fix is a **key/field rename** (`email` -> `emails`, `phone` -> `phones`) across the persons schema, tool handler bodies, and tool `inputSchema` — the values are already correctly shaped as arrays.

This is a public-input-contract breaking change for the two tools, which is intended: the old keys never worked.

## 2. Root cause (file:line; what is sent vs what v2 wants)

Verified independently against the source on branch `review/v1-v2-migration`.

- **Schema field names are wrong.** `src/schemas/persons.ts`:
  - `EmailInputSchema` (lines 17-21) and `PhoneInputSchema` (lines 26-30) already model the values as **arrays** of `{ value, primary?, label? }`. The shapes are correct.
  - `CreatePersonSchema` binds them under the field names `email` (line 76) and `phone` (line 77).
  - `UpdatePersonSchema` binds them under the field names `email` (line 99) and `phone` (line 100).
- **Tool bodies forward the wrong keys.** `src/tools/persons.ts`:
  - `createPerson`: `if (params.email) body.email = params.email;` (line 105) and `if (params.phone) body.phone = params.phone;` (line 106).
  - `updatePerson`: `if (updateFields.email) body.email = updateFields.email;` (line 142) and `if (updateFields.phone) body.phone = updateFields.phone;` (line 143).
- **Tool `inputSchema` JSON-schema properties expose the wrong names.** `src/tools/persons.ts`:
  - `pipedrive_create_person` inputSchema: property `email` (lines 281-293, array of objects) and property `phone` (lines 294-306, array of objects).
  - `pipedrive_update_person` inputSchema: property `email` (lines 328-340) and property `phone` (lines 341-353).

**Sent today:** `{ name, email: [{value,primary?,label?}], phone: [{...}], ... }`
**v2 wants:** `{ name, emails: [{value,primary?,label?}], phones: [{...}], ... }`

This is NOT a scalar->array conversion. The values are already arrays. Only the **keys/field names** are wrong.

## 3. v2 target shape (quoted from `docs/api/openapi-v2.yaml`, v2.0.0)

### POST /persons request body (operationId `addPerson`, lines 7973-8002)

```yaml
                emails:
                  type: array
                  description: The emails of the person
                  items:
                    type: object
                    properties:
                      value:
                        type: string
                        description: The email address of the person
                      primary:
                        type: boolean
                        description: Whether the email is primary or not
                      label:
                        type: string
                        description: The email address classification label
                phones:
                  type: array
                  description: The phones of the person
                  items:
                    type: object
                    properties:
                      value:
                        type: string
                        description: The phone number of the person
                      primary:
                        type: boolean
                        description: Whether the phone number is primary or not
                      label:
                        type: string
                        description: The phone number classification label
```

### PATCH /persons/{id} request body (operationId `updatePerson`, lines 8577-8606)

Identical shape; keys `emails` / `phones`, each `type: array` of `{ value, primary, label }`:

```yaml
                emails:
                  type: array
                  description: The emails of the person
                  items:
                    type: object
                    properties:
                      value: { type: string }
                      primary: { type: boolean }
                      label: { type: string }
                phones:
                  type: array
                  ...
```

### Corroborating references in the same spec

- POST response body (lines 7973-8002 request; response at lines 8068-8097) uses `emails`/`phones`.
- PATCH response body (lines 8378-8407) uses `emails`/`phones`.
- Shared `Person` component schema (lines 22763-22792) uses `emails`/`phones`.
- POST success example (lines 8185-8198) shows `emails:`/`phones:` arrays of `{ value, primary, label }`.

The keys `email`/`phone` (singular) do **not** appear anywhere in the v2 persons request or response schemas. Confirmed.

## 4. Changes — file-by-file and precise

Only two source files change: `src/schemas/persons.ts` and `src/tools/persons.ts`. The `EmailInputSchema` / `PhoneInputSchema` definitions themselves do NOT change (their array-of-object shape is already correct and matches v2); only the **field names** that reference them change.

Write all Zod in **Zod 3.25 syntax** (current `main`). Do NOT pre-migrate to Zod 4 (that is pending #16 PR B, separate).

### 4a. `src/schemas/persons.ts`

`CreatePersonSchema` (currently lines 73-91): rename the two field keys.

```ts
// BEFORE (lines 76-77)
  email: EmailInputSchema,
  phone: PhoneInputSchema,

// AFTER
  emails: EmailInputSchema,
  phones: PhoneInputSchema,
```

`UpdatePersonSchema` (currently lines 96-112): rename the two field keys.

```ts
// BEFORE (lines 99-100)
  email: EmailInputSchema,
  phone: PhoneInputSchema,

// AFTER
  emails: EmailInputSchema,
  phones: PhoneInputSchema,
```

Notes:
- Do NOT rename the exported constants `EmailInputSchema` / `PhoneInputSchema`. They keep their names and definitions. Only the object keys that consume them change. (Keeping the constant names avoids touching the unit test imports at `tests/unit/schemas/persons.test.ts:13-14`, which test the schemas directly and remain valid.)
- The `.describe()` text inside `EmailInputSchema`/`PhoneInputSchema` ("List of email addresses" / "List of phone numbers") already reads as plural and needs no change.
- **Type exports are unaffected by name** but their inferred shape changes automatically: `CreatePersonParams` (line 142) and `UpdatePersonParams` (line 143) are `z.infer<...>` of the renamed schemas, so they will now carry `emails?`/`phones?` instead of `email?`/`phone?`. No edit to the `export type` lines themselves; just be aware downstream consumers (the tool handler) must use the new property names.

### 4b. `src/tools/persons.ts` — handler bodies

`createPerson` (currently lines 105-106):

```ts
// BEFORE
  if (params.email) body.email = params.email;
  if (params.phone) body.phone = params.phone;

// AFTER
  if (params.emails) body.emails = params.emails;
  if (params.phones) body.phones = params.phones;
```

`updatePerson` (currently lines 142-143):

```ts
// BEFORE
  if (updateFields.email) body.email = updateFields.email;
  if (updateFields.phone) body.phone = updateFields.phone;

// AFTER
  if (updateFields.emails) body.emails = updateFields.emails;
  if (updateFields.phones) body.phones = updateFields.phones;
```

Both the conditional guard property AND the assigned body key change. After the schema rename in 4a, `params.email` / `updateFields.email` would be a TypeScript error (property does not exist on the inferred type) under strict mode, so this edit is mandatory for the source to compile.

### 4c. `src/tools/persons.ts` — `inputSchema` JSON-schema properties

These are the tool's **public input contract** as advertised over MCP. Rename the property keys and update descriptions to plural. Item shape (`value`/`primary`/`label`, `required: ["value"]`) stays the same.

`pipedrive_create_person` inputSchema (currently lines 281-306):

```ts
// BEFORE: property key `email` (281-293)
        email: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string", description: "Email address" },
              primary: { type: "boolean", description: "Is primary email" },
              label: { type: "string", description: "Label (work, home, other)" },
            },
            required: ["value"],
          },
          description: "Email addresses",
        },
// AFTER: property key `emails`
        emails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string", description: "Email address" },
              primary: { type: "boolean", description: "Is primary email" },
              label: { type: "string", description: "Label (work, home, other)" },
            },
            required: ["value"],
          },
          description: "Email addresses (array of objects, e.g. [{ value, primary, label }])",
        },
```

```ts
// BEFORE: property key `phone` (294-306)
        phone: {
          ...
          description: "Phone numbers",
        },
// AFTER: property key `phones`
        phones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string", description: "Phone number" },
              primary: { type: "boolean", description: "Is primary phone" },
              label: { type: "string", description: "Label (work, home, mobile)" },
            },
            required: ["value"],
          },
          description: "Phone numbers (array of objects, e.g. [{ value, primary, label }])",
        },
```

`pipedrive_update_person` inputSchema (currently lines 328-353): same rename — `email` -> `emails` (328-340), `phone` -> `phones` (341-353). Keep their item shapes; update the `description` strings from `"New email addresses"` / `"New phone numbers"` to retain "New ..." wording (e.g. `"New email addresses (array of objects)"` / `"New phone numbers (array of objects)"`).

Minimal-description variant is acceptable: at minimum the property KEY must change from `email`->`emails` and `phone`->`phones`. Description wording is a nice-to-have but should be touched since the key changed.

### 4d. Anything else in source?

- `searchPersons` (lines 171-203) uses query params `search_by_email` / `search_by_phone` against the **v1 itemSearch** API. These are correct v1 param names and are **NOT** part of the create/update body. **Do NOT rename them.**
- `SearchPersonsSchema` fields `search_by_email` / `search_by_phone` (schema lines 122-125) and the search inputSchema props (tool lines 374-375): **leave unchanged** — unrelated to this issue.
- No other source file imports the persons schemas in a way that references the `email`/`phone` field names. Confirmed via grep: `EmailInputSchema`/`PhoneInputSchema` are referenced only in `src/schemas/persons.ts` and `tests/unit/schemas/persons.test.ts`.

## 5. Test changes — every false-green site to flip

These tests currently pass while the bug ships because they encode the v1 `email`/`phone` keys. Each must be corrected to the v2 `emails`/`phones` keys. Where a test exercises the request body, ADD an assertion that the body carries `emails`/`phones` and (defensively) NOT `email`/`phone`.

### 5a. Shared helpers (this issue is the SOLE owner of these files in batch #42-#46)

**`tests/helpers/mockFetch.ts`** — `fixtures.person` (lines 139-148), keys `email`/`phone` at lines 142-143:

```ts
// BEFORE
  person: {
    id: 1,
    name: 'John Doe',
    email: [{ value: 'john@example.com', primary: true }],
    phone: [{ value: '+1234567890', primary: true }],
    org_id: 1,
    ...
  },
// AFTER
  person: {
    id: 1,
    name: 'John Doe',
    emails: [{ value: 'john@example.com', primary: true }],
    phones: [{ value: '+1234567890', primary: true }],
    org_id: 1,
    ...
  },
```

Rationale: `fixtures.person` represents an API **response** object, and v2 responses use `emails`/`phones` (spec lines 8068-8097, 22763-22792). Aligning the fixture to v2 keeps it a faithful v2 response.

**`tests/helpers/fixtures.ts`** — `createPersonsFixture` (lines 25-32), key `email` at line 30:

```ts
// BEFORE
export function createPersonsFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.person,
    id: i + 1,
    name: `Test Person ${i + 1}`,
    email: [{ value: `person${i + 1}@example.com`, primary: true }],
  }));
}
// AFTER
export function createPersonsFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.person,
    id: i + 1,
    name: `Test Person ${i + 1}`,
    emails: [{ value: `person${i + 1}@example.com`, primary: true }],
  }));
}
```

Note: with the spread `...mockFixtures.person` (now carrying `emails`), the old line 30 `email: [...]` was adding an extra `email` key alongside; after both edits the object has only `emails`. Correct.

### 5b. `tests/integration/tools/persons.test.ts`

The `createPerson` "should pass all fields to API" test (lines 101-119) is the primary false-green for this bug. It passes `email`/`phone` as INPUT and asserts `body.email`. Flip both the input field names and the body assertion to v2, and add a negative assertion plus a `phones` assertion.

```ts
// BEFORE (lines 105-118)
      await createPerson({
        name: 'Jane Doe',
        email: [{ value: 'jane@example.com', primary: true }],
        phone: [{ value: '+1234567890', primary: true }],
        org_id: 5,
        visible_to: 7,
        marketing_status: 'subscribed',
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Jane Doe');
      expect(body.email).toEqual([{ value: 'jane@example.com', primary: true }]);
      expect(body.visible_to).toBe(7);

// AFTER
      await createPerson({
        name: 'Jane Doe',
        emails: [{ value: 'jane@example.com', primary: true }],
        phones: [{ value: '+1234567890', primary: true }],
        org_id: 5,
        visible_to: 7,
        marketing_status: 'subscribed',
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Jane Doe');
      // v2 contract: request body must use `emails`/`phones`, not `email`/`phone`
      expect(body.emails).toEqual([{ value: 'jane@example.com', primary: true }]);
      expect(body.phones).toEqual([{ value: '+1234567890', primary: true }]);
      expect(body.email).toBeUndefined();
      expect(body.phone).toBeUndefined();
      expect(body.visible_to).toBe(7);
```

ADD a new `updatePerson` test asserting the v2 body keys on PATCH (the existing update tests at lines 122-142 only check the summary and method, never the contact keys, which is why update was also silently broken). Add inside `describe('updatePerson', ...)`:

```ts
    it('should send emails/phones (not email/phone) in PATCH body', async () => {
      const mockFn = mockApiSuccess(fixtures.person);
      const { updatePerson } = await getPersonsTools();

      await updatePerson({
        id: 1,
        emails: [{ value: 'new@example.com', primary: true }],
        phones: [{ value: '+1999', primary: true }],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.emails).toEqual([{ value: 'new@example.com', primary: true }]);
      expect(body.phones).toEqual([{ value: '+1999', primary: true }]);
      expect(body.email).toBeUndefined();
      expect(body.phone).toBeUndefined();
    });
```

(Other persons integration tests — listPersons, getPerson, searchPersons, deletePerson — do not reference `email`/`phone` body keys and need no change. `getPerson` "should return single person" reads `fixtures.person` but only asserts `.name`, so the helper rename in 5a does not affect it.)

### 5c. `tests/unit/schemas/persons.test.ts`

The `EmailInputSchema` / `PhoneInputSchema` describe blocks (lines 18-65) test the schemas directly by their exported names and remain valid (we are not renaming the constants). **No change** to those blocks.

The `CreatePersonSchema` "should accept all optional fields" test (lines 135-155) passes `email`/`phone` and asserts `result.email` / `result.phone`. After the field rename these properties no longer exist; flip to `emails`/`phones`:

```ts
// BEFORE (lines 136-152, relevant lines)
      const params = {
        name: 'Jane Smith',
        email: [{ value: 'jane@example.com', primary: true }],
        phone: [{ value: '+1234567890', primary: true, label: 'mobile' }],
        ...
      };
      const result = CreatePersonSchema.parse(params);
      ...
      expect(result.email).toHaveLength(1);
      expect(result.phone).toHaveLength(1);

// AFTER
      const params = {
        name: 'Jane Smith',
        emails: [{ value: 'jane@example.com', primary: true }],
        phones: [{ value: '+1234567890', primary: true, label: 'mobile' }],
        ...
      };
      const result = CreatePersonSchema.parse(params);
      ...
      expect(result.emails).toHaveLength(1);
      expect(result.phones).toHaveLength(1);
```

The `UpdatePersonSchema` "should accept all updatable fields" test (lines 204-222) passes `email`/`phone` (lines 208-209). Flip the input keys to `emails`/`phones`:

```ts
// BEFORE (lines 208-209)
        email: [{ value: 'new@example.com', primary: true }],
        phone: [{ value: '+9876543210', primary: true }],
// AFTER
        emails: [{ value: 'new@example.com', primary: true }],
        phones: [{ value: '+9876543210', primary: true }],
```

(The update test does not currently assert `result.email`/`result.phone`; only `id`, `name`, `visible_to`. Optionally add `expect(result.emails).toHaveLength(1)` / `expect(result.phones).toHaveLength(1)` to lock the rename, but not required for green.)

The `SearchPersonsSchema` tests referencing `search_by_email` / `search_by_phone` (lines 256-257, 266-267, 273-274): **leave unchanged** — different feature, correct as-is.

### 5d. `tests/functional/crud-flows.test.ts` — see Risks/Notes; OUT of strict scope, flagged

The Person CRUD cycle test passes `email` to `createPerson` at line 82:

```ts
      let result = await createPerson({
        name: 'John Smith',
        email: [{ value: 'john.smith@example.com', primary: true }],   // line 82
      });
```

After the schema rename, `email` is no longer a recognized field. This test asserts only `parsed.summary === 'Person created'`, so it will keep passing whether or not the key is correct — i.e., it silently re-encodes the bug as a latent false-green. The correct one-line fix is `email` -> `emails` at line 82.

**However**, `tests/functional/crud-flows.test.ts` is a multi-entity functional file (deals + persons + activities) and is NOT a "persons file" nor a "shared helper", so it falls outside this issue's strict disjoint boundary (Section 6). It also will NOT break the build or any test if left untouched (see Risks: tsc excludes test files; vitest is transpile-only and tolerates the extra property). Recommendation: apply the single-line `email`->`emails` change at line 82 because it is unambiguously a person-create call and leaving it perpetuates the bug in a functional test. If the orchestrator enforces the file boundary strictly, defer it to a tiny follow-up issue and note it. **This site was not in the issue's "known false-green" list — surfaced during this plan's grep sweep (divergence, see final message).**

## 6. Out of scope / disjointness

Batch #42-#46 runs in parallel. Touch ONLY:
- `src/schemas/persons.ts`
- `src/tools/persons.ts`
- `tests/integration/tools/persons.test.ts`
- `tests/unit/schemas/persons.test.ts`
- `tests/helpers/mockFetch.ts`  ← this issue is the SOLE owner of this shared helper in this batch
- `tests/helpers/fixtures.ts`   ← this issue is the SOLE owner of this shared helper in this batch

Do **NOT** touch:
- `src/schemas/common.ts` (shared; `common.ts:46` `z.string().email()` is unrelated).
- `src/tools/index.ts` (tool registration).
- Any other entity's files: deals, organizations, **activities** (note: `src/schemas/activities.ts` and `src/tools/activities.ts` have an `attendees[].email` field — that is a different entity and a different shape; leave it alone), notes, mail, fields, pipelines, stages, users, leads, projects.
- `tests/integration/tools/activities.test.ts`, `tests/unit/schemas/activities.test.ts` (their `email` references belong to activities attendees).
- `tests/functional/crud-flows.test.ts` is OUTSIDE the strict boundary. See Section 5d for the recommended single-line exception and the constraint.

Do not rename the exported constants `EmailInputSchema` / `PhoneInputSchema`. Do not change `search_by_email` / `search_by_phone` anywhere.

## 7. Definition of Done

1. `npm run build` (tsc) is green. (Confirms `src/tools/persons.ts` compiles against the renamed `CreatePersonParams`/`UpdatePersonParams`; note tsc does not type-check test files per `tsconfig.json` `exclude: ["**/*.test.ts"]`.)
2. `npm test` (vitest) is green **after** the assertions/fixtures in Section 5 are corrected to the v2 `emails`/`phones` shape. (Before correcting them, the unit/integration tests that flip input field names would fail because `result.email` etc. is now `undefined`; the suite must be green only once they assert the v2 keys.)
3. The new integration assertions confirm the request body sent by `createPerson` and `updatePerson` contains keys `emails` and `phones`, and does NOT contain `email` or `phone`.
4. All `emails`/`phones` shapes asserted in tests match `docs/api/openapi-v2.yaml` request bodies (POST lines 7973-8002; PATCH lines 8577-8606): array of `{ value: string, primary?: boolean, label?: string }`.
5. Only the files listed in Section 6 are changed (plus, optionally and if the boundary permits, the single line `tests/functional/crud-flows.test.ts:82`). No source/test file for any other entity is modified.
6. `EmailInputSchema` / `PhoneInputSchema` constant names unchanged; `search_by_email` / `search_by_phone` unchanged.

## 8. Risks / notes

- **Breaking public input contract (intended).** Renaming the tool input properties `email`->`emails` and `phone`->`phones` changes the advertised MCP tool schema. Any caller currently sending `email`/`phone` will now have those silently ignored by Zod (extra keys) — but those callers were already getting their data dropped by v2, so behavior for them is no worse, and correct callers (using `emails`/`phones`) now actually work. This is the correct fix, not a regression.
- **Zod 3, not Zod 4.** `main` is on Zod 3.25. Write all schema edits in Zod 3.25 syntax. Do NOT adopt Zod 4 idioms; the Zod 4 migration is pending in #16 PR B and is handled separately.
- **tsc does not guard the tests.** `tsconfig.json` sets `rootDir: ./src`, `include: ["src/**/*"]`, and `exclude: ["**/*.test.ts"]`. The build never type-checks test files, and vitest runs via esbuild transpile-only (no type errors thrown). Consequence: stale `email`/`phone` keys left in any test file will NOT fail the build or crash at runtime — they become silent extra properties. This is exactly why the bug is currently false-green, and why `tests/functional/crud-flows.test.ts:82` must be deliberately flipped rather than relied upon to error.
- **Latent false-green outside scope** (`crud-flows.test.ts:82`): documented in Section 5d. Surfaced by this plan's grep; was not in the issue's known-sites list. Recommended one-line fix; deferrable if the file boundary is enforced strictly.
- **`fixtures.person` is shared** across many entity tests (deals/activities/notes reference `person` indirectly via `person_id`, and some read `fixtures.person`). The 5a rename changes only the `email`->`emails` / `phone`->`phones` keys on the person object; no consuming test asserts those specific keys except the persons tests being updated here, so the blast radius is contained. (Verified: only `getPerson` "should return single person" reads `fixtures.person` outside persons-create paths, and it asserts `.name` only.)
- **No scalar fallback needed.** Because values are already arrays, there is no migration/coercion logic to add — purely a key rename. Do not add scalar-to-array handling.
