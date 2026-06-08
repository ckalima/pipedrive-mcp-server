# Issue #45 — Activities `location` (string→object) and `done` (1/0→boolean) v2 schema fixes

## 1. Issue + one-line summary

**Issue #45**: The activities entity sends two fields in shapes that violate the Pipedrive v2 API contract.

- **Bug 1 (`location`)**: The schema models `location` as `z.string()` and the tool sends a bare string, but v2 expects a structured **object** (`{ value, country, admin_area_level_1, ... }`).
- **Bug 2 (`done`)**: The schema has `.default(false)` on create (so `done` is *always* emitted even when the caller never set it) and the tool serializes the boolean as integer `1`/`0` (body) and string `"1"`/`"0"` (list filter), but v2 types `done` as a plain **boolean** and rejects `1`/`0` under stricter validation.

Scope is strictly `location` + `done`. The suite is currently **false-green**: tests pass while these bugs ship because integration/unit assertions assert the wrong (string/integer) shapes, and one assertion explicitly hedges `/done=(false|0)/`.

---

## 2. Root cause (per bug, file:line — sent vs. v2-wanted)

### Bug 1: `location` modeled and sent as a string

| Location | Current code | Problem |
|---|---|---|
| `src/schemas/activities.ts:106-107` | `location: z.string().optional().describe("Activity location")` (in `CreateActivitySchema`) | Types location as a flat string. |
| `src/schemas/activities.ts:156-157` | `location: z.string().optional().describe("New location")` (in `UpdateActivitySchema`) | Same. |
| `src/tools/activities.ts:124` | `if (params.location) body.location = params.location;` (create) | Passes the string straight through to the v2 body. |
| `src/tools/activities.ts:170` | `if (updateFields.location) body.location = updateFields.location;` (update) | Same. |
| `src/tools/activities.ts:308` | `location: { type: "string", description: "Activity location" }` (create inputSchema) | MCP tool schema advertises a string. |
| `src/tools/activities.ts:362` | `location: { type: "string", description: "New location" }` (update inputSchema) | Same. |

**Sent:** `"location": "Office"` (string).
**v2 wants:** `"location": { "value": "...", "country": "...", ... }` (object of optional strings). See §3.

### Bug 2: `done` defaulted-on and serialized as integer / string-integer

| Location | Current code | Problem |
|---|---|---|
| `src/schemas/activities.ts:90-91` | `done: z.boolean().optional().default(false).describe("Mark as completed")` (create) | `.default(false)` means `params.done` is **never `undefined`** after parse, so the create tool's `if (params.done !== undefined)` guard is *always* true and `done` is emitted on every create, even when the caller omitted it. |
| `src/tools/activities.ts:119` | `if (params.done !== undefined) body.done = params.done ? 1 : 0;` (create) | Serializes boolean → integer `1`/`0`. v2 rejects integers for a boolean field under stricter validation. |
| `src/tools/activities.ts:165` | `if (updateFields.done !== undefined) body.done = updateFields.done ? 1 : 0;` (update) | Same integer coercion. |
| `src/tools/activities.ts:39` | `if (params.done !== undefined) queryParams.set("done", params.done ? "1" : "0");` (list filter) | Serializes boolean → string `"1"`/`"0"` in the query string. v2 `done` query param is a boolean; should be `"true"`/`"false"`. |

**Sent:** body `"done": 1` / `"done": 0`; query `done=1` / `done=0`; and `done` always present on create.
**v2 wants:** body `"done": true` / `"done": false` (boolean); query `done=true` / `done=false`; and `done` only present when the caller set it.

**Note (already correct, do NOT change):**
- `ListActivitiesSchema.done` (`src/schemas/activities.ts:36`) is already a plain `z.boolean().optional()` — only the *serialization* at `tools/activities.ts:39` is wrong.
- `UpdateActivitySchema.done` (`src/schemas/activities.ts:140`) is already `z.boolean().optional()` with **no** `.default` — leave the schema as-is; only the tool integer-coercion at line 165 changes.

---

## 3. v2 target shapes (quoted from `docs/api/openapi-v2.yaml`)

The activity **request body** for both `addActivity` (operationId at line 414) and `updateActivity` (operationId at line 1046) use the identical `done` boolean and `location` object shapes. The create-request block is at lines 463-499; the update-request block is the identical shape at lines 1102-1138 (verified).

### `done` — boolean (create request body, `openapi-v2.yaml` lines 463-465)

```yaml
                done:
                  type: boolean
                  description: Whether the activity is marked as done or not
```

### `location` — object with optional string subfields (create request body, `openapi-v2.yaml` lines 466-499)

```yaml
                location:
                  type: object
                  description: Location of the activity
                  properties:
                    value:
                      type: string
                      description: The full address of the activity
                    country:
                      type: string
                      description: Country of the activity
                    admin_area_level_1:
                      type: string
                      description: Admin area level 1 (e.g. state) of the activity
                    admin_area_level_2:
                      type: string
                      description: Admin area level 2 (e.g. county) of the activity
                    locality:
                      type: string
                      description: Locality (e.g. city) of the activity
                    sublocality:
                      type: string
                      description: Sublocality (e.g. neighborhood) of the activity
                    route:
                      type: string
                      description: Route (e.g. street) of the activity
                    street_number:
                      type: string
                      description: Street number of the activity
                    subpremise:
                      type: string
                      description: Subpremise (e.g. apartment/suite number) of the activity
                    postal_code:
                      type: string
                      description: Postal code of the activity
```

The 10 location subfields, all optional strings: `value`, `country`, `admin_area_level_1`, `admin_area_level_2`, `locality`, `sublocality`, `route`, `street_number`, `subpremise`, `postal_code`. The whole `location` object is itself optional.

> Note on the spec: line 1595 (`description: Physical location where the activity takes place`) belongs to `getActivityFields` (a fields-metadata endpoint), NOT the activity request body. Do not use it as the target shape. The authoritative request-body shapes are lines 463-499 (create) and 1102-1138 (update). The spec has **zero `readOnly` markers** for activities.

---

## 4. Changes — file-by-file, precise

### 4a. `src/schemas/activities.ts`

**(i) Add a LOCAL `LocationSchema`** near the top of the file, after the imports (around line 13, before `ListActivitiesSchema`). Define it LOCALLY in this file — do NOT add it to `common.ts` (owned by issue #46 in this parallel batch). Zod 3 syntax (the repo is on Zod 3.25; do NOT pre-migrate to Zod 4):

```ts
/**
 * Activity location (v2 structured object).
 * Defined locally per issue #45; do not move to common.ts.
 */
const LocationSchema = z.object({
  value: z.string().optional()
    .describe("The full address of the activity"),
  country: z.string().optional()
    .describe("Country of the activity"),
  admin_area_level_1: z.string().optional()
    .describe("Admin area level 1 (e.g. state)"),
  admin_area_level_2: z.string().optional()
    .describe("Admin area level 2 (e.g. county)"),
  locality: z.string().optional()
    .describe("Locality (e.g. city)"),
  sublocality: z.string().optional()
    .describe("Sublocality (e.g. neighborhood)"),
  route: z.string().optional()
    .describe("Route (e.g. street)"),
  street_number: z.string().optional()
    .describe("Street number"),
  subpremise: z.string().optional()
    .describe("Subpremise (e.g. apartment/suite number)"),
  postal_code: z.string().optional()
    .describe("Postal code"),
}).optional();
```

Keep `LocationSchema` **un-exported** (it is an internal detail of this file). If the implementer prefers, it may be exported, but it MUST remain defined in `activities.ts` and MUST NOT be added to `common.ts`.

**(ii) `CreateActivitySchema` — replace string `location` (lines 106-107):**

```ts
// before
  location: z.string().optional()
    .describe("Activity location"),
// after
  location: LocationSchema
    .describe("Activity location (structured object)"),
```

> Implementation note: `.describe()` returns a new schema and works on the already-`.optional()` `LocationSchema`. Equivalently the implementer may attach the `.describe(...)` inside the `LocationSchema` definition and reference `location: LocationSchema` directly. Either is acceptable; the field must end up optional.

**(iii) `CreateActivitySchema` — remove `.default(false)` from `done` (lines 90-91):**

```ts
// before
  done: z.boolean().optional().default(false)
    .describe("Mark as completed"),
// after
  done: z.boolean().optional()
    .describe("Mark as completed"),
```

This ensures `done` is `undefined` when the caller omits it, so the tool's `if (params.done !== undefined)` guard correctly suppresses it.

**(iv) `UpdateActivitySchema` — replace string `location` (lines 156-157):**

```ts
// before
  location: z.string().optional()
    .describe("New location"),
// after
  location: LocationSchema
    .describe("New location (structured object)"),
```

**(v) `UpdateActivitySchema.done` (line 140): NO CHANGE** — already `z.boolean().optional()` with no default.

**(vi) Type exports (lines 168-172): NO source change needed.** `CreateActivityParams` / `UpdateActivityParams` are `z.infer<>` of the schemas and will automatically pick up the new `location` object type. Verify they still compile.

### 4b. `src/tools/activities.ts`

**(i) List filter serialization — `done` boolean → `"true"`/`"false"` (line 39):**

```ts
// before
  if (params.done !== undefined) queryParams.set("done", params.done ? "1" : "0");
// after
  if (params.done !== undefined) queryParams.set("done", String(params.done));
```

`String(true) === "true"`, `String(false) === "false"`.

**(ii) Create body — `done` boolean direct (line 119):**

```ts
// before
  if (params.done !== undefined) body.done = params.done ? 1 : 0;
// after
  if (params.done !== undefined) body.done = params.done;
```

**(iii) Create body — `location` object pass-through (line 124): NO functional change required.** The line `if (params.location) body.location = params.location;` already passes whatever `params.location` is; now it is a validated object. Keep the line as-is. (The `if (params.location)` truthiness guard is fine: an absent location is `undefined` → falsy → skipped; a present object is truthy.)

**(iv) Update body — `done` boolean direct (line 165):**

```ts
// before
  if (updateFields.done !== undefined) body.done = updateFields.done ? 1 : 0;
// after
  if (updateFields.done !== undefined) body.done = updateFields.done;
```

**(v) Update body — `location` object pass-through (line 170): NO functional change required.** Same reasoning as (iii).

**(vi) Create inputSchema `location` property (line 308) — string → object:**

```ts
// before
        location: { type: "string", description: "Activity location" },
// after
        location: {
          type: "object",
          description: "Activity location (structured object)",
          properties: {
            value: { type: "string", description: "The full address" },
            country: { type: "string", description: "Country" },
            admin_area_level_1: { type: "string", description: "Admin area level 1 (e.g. state)" },
            admin_area_level_2: { type: "string", description: "Admin area level 2 (e.g. county)" },
            locality: { type: "string", description: "Locality (e.g. city)" },
            sublocality: { type: "string", description: "Sublocality (e.g. neighborhood)" },
            route: { type: "string", description: "Route (e.g. street)" },
            street_number: { type: "string", description: "Street number" },
            subpremise: { type: "string", description: "Subpremise (e.g. apartment/suite)" },
            postal_code: { type: "string", description: "Postal code" },
          },
        },
```

**(vii) Update inputSchema `location` property (line 362) — string → object:** apply the identical `type: "object"` block as (vi), with description `"New location (structured object)"`.

> Optional DRY: the implementer MAY hoist the location JSON-Schema object literal into a local `const locationInputSchema = { ... }` inside `tools/activities.ts` and reference it in both inputSchemas. This is local-only and acceptable, but not required.

---

## 5. Test changes — every false-green assertion to flip + new assertions

Touch ONLY `tests/integration/tools/activities.test.ts` and `tests/unit/schemas/activities.test.ts`. Do NOT edit shared helpers (`tests/helpers/mockFetch.ts`, `tests/helpers/fixtures.ts`): the shared `activity` *response* fixture already has `done: false` (boolean) and no `location`, so no shared edit is needed. Keep any fixture additions local to the test files.

### 5a. `tests/integration/tools/activities.test.ts`

**FALSE-GREEN #1 — `listActivities` `done` filter hedge (lines 59-60).** Tighten the hedged regex to the exact v2 string and assert it is NOT the integer form:

```ts
// before
      // Boolean is passed as 0/1 or true/false depending on implementation
      expect(url).toMatch(/done=(false|0)/);
// after
      expect(url).toContain('done=false');
      expect(url).not.toContain('done=0');
```

(The test calls `listActivities({ ..., done: false })` at line 50, so the expected serialized value is `done=false`.) Consider also adding a `done: true` variant in this or a new test asserting `url` contains `done=true` and not `done=1`.

**FALSE-GREEN #2 — `createActivity` "should pass all fields to API" (lines 120-149).** This test currently sends `done: false` and `location: 'Office'` (a string) and never asserts their serialized body shape, so it silently passes with the buggy integer/string output. Update it:

1. Change the input `location: 'Office'` (line 137) to the v2 object, e.g.:
   ```ts
   location: { value: '123 Main St', locality: 'Springfield', postal_code: '12345' },
   ```
2. Add body assertions (after the existing `expect(body.attendees)` at line 148):
   ```ts
   // done must be a boolean, NOT integer 1/0
   expect(body.done).toBe(false);
   expect(typeof body.done).toBe('boolean');
   // location must be the structured object, NOT a string
   expect(body.location).toEqual({ value: '123 Main St', locality: 'Springfield', postal_code: '12345' });
   expect(typeof body.location).toBe('object');
   ```

**NEW — create with `done: true` serializes boolean.** Add a focused test:
```ts
it('should send done as boolean true (not integer 1)', async () => {
  const mockFn = mockApiSuccess(fixtures.activity);
  const { createActivity } = await getActivitiesTools();
  await createActivity({ subject: 'Done call', type: 'call', done: true });
  const [, options] = mockFn.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(body.done).toBe(true);
});
```

**NEW — create omits `done` when caller omits it** (guards the `.default(false)` removal). Add:
```ts
it('should omit done when not provided', async () => {
  const mockFn = mockApiSuccess(fixtures.activity);
  const { createActivity } = await getActivitiesTools();
  await createActivity({ subject: 'No done flag', type: 'call' });
  const [, options] = mockFn.mock.calls[0];
  const body = JSON.parse(options.body);
  expect('done' in body).toBe(false);
});
```
(Before the fix, `.default(false)` made `body.done === 0` always present, so this test would fail — it locks in the fix.)

**FALSE-GREEN #3 — `updateActivity` `done` serialization.** The existing "should update activity" (lines 162-170) calls `updateActivity({ id: 1, done: true })` but only asserts the summary. Add a body assertion (either extend that test or add a new one):
```ts
it('should send done as boolean on update (not integer)', async () => {
  const mockFn = mockApiSuccess(fixtures.activity);
  const { updateActivity } = await getActivitiesTools();
  await updateActivity({ id: 1, done: true });
  const [, options] = mockFn.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(body.done).toBe(true);
});
```

**NEW — update sends `location` object.** Add:
```ts
it('should send location as structured object on update', async () => {
  const mockFn = mockApiSuccess(fixtures.activity);
  const { updateActivity } = await getActivitiesTools();
  await updateActivity({ id: 1, location: { value: '456 Oak Ave', country: 'US' } });
  const [, options] = mockFn.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(body.location).toEqual({ value: '456 Oak Ave', country: 'US' });
});
```

> Do NOT change the existing `participants`/`attendees` assertions (lines 147-148, 182-196) — those fields are correct per the spec and out of scope.

### 5b. `tests/unit/schemas/activities.test.ts`

**FALSE-GREEN #4 — `CreateActivitySchema` `done` default (line 109).** After removing `.default(false)`, `done` is `undefined` when omitted:
```ts
// before (in "should accept minimal required params", line 109)
      expect(result.done).toBe(false); // default
// after
      expect(result.done).toBeUndefined();
```

**FALSE-GREEN #5 — `CreateActivitySchema` location string (lines 136, 146).** In "should accept all optional fields":
- Change input `location: '123 Main St, Suite 100'` (line 136) to:
  ```ts
  location: { value: '123 Main St, Suite 100', locality: 'Springfield' },
  ```
- Change the assertion (line 146):
  ```ts
  // before
        expect(result.location).toBe('123 Main St, Suite 100');
  // after
        expect(result.location).toEqual({ value: '123 Main St, Suite 100', locality: 'Springfield' });
  ```
- The `done: false` input at line 126 stays (explicitly provided, so `result.done === false` is still valid — no assertion on it in this test, so nothing else to change here).

**FALSE-GREEN #6 — `UpdateActivitySchema` location string (line 339).** In "should accept all updatable fields", change input `location: 'New Location'` (line 339) to:
```ts
location: { value: 'New Location', country: 'US' },
```
(There is no `expect(result.location)` assertion in that test, so only the input must be a valid object or `.parse()` will throw under the new object schema. Optionally add `expect(result.location).toEqual({ value: 'New Location', country: 'US' });`.)

**NEW — schema accepts a partial location object and rejects a bare string.** Add to the `CreateActivitySchema` describe block:
```ts
it('should accept a partial location object', () => {
  const result = CreateActivitySchema.parse({
    subject: 'Test', type: 'meeting',
    location: { locality: 'Springfield' },
  });
  expect(result.location).toEqual({ locality: 'Springfield' });
});

it('should reject a string location', () => {
  expect(() => CreateActivitySchema.parse({
    subject: 'Test', type: 'meeting',
    location: 'plain string',
  })).toThrow();
});
```

**NEW — schema accepts omitted done.** Optionally add an explicit test mirroring §5a (omit `done`, assert `result.done` is `undefined`) — partially covered by the edited line 109.

> Existing tests that assert `result.done` after explicitly passing `done` (lines 50, 345, 368) stay unchanged — they pass an explicit boolean, which is still valid.

---

## 6. Out of scope / disjointness

**Files this issue MAY touch (and ONLY these):**
- `src/schemas/activities.ts`
- `src/tools/activities.ts`
- `tests/integration/tools/activities.test.ts`
- `tests/unit/schemas/activities.test.ts`

**MUST NOT touch:**
- `src/schemas/common.ts` — owned by issue #46 in this parallel batch. `LocationSchema` MUST be defined **locally** in `src/schemas/activities.ts`, NOT added to `common.ts`.
- `tests/helpers/mockFetch.ts`, `tests/helpers/fixtures.ts`, or any shared helper — the activity response fixture already has `done: false` (boolean) and no `location`; no shared edit is needed.
- `src/tools/index.ts` and any other entity's files.
- `src/schemas/organizations.ts` / `src/tools/organizations.ts` (issue #44, address object) — even though it has a structurally similar address object, do NOT touch it or try to share code now.

**Out of scope (do NOT change — these are already correct per the spec):**
- `person_id` is a **writable** v2 body field; keep it.
- `participants: [{ person_id, primary }]` is supported; keep the schema and assertions.
- `attendees`, `busy`, `priority`, `note`, all date/time fields — unchanged.
- The spec has **zero `readOnly` markers** for activities, so no field needs to be dropped on that basis.

---

## 7. Definition of Done

1. `npm run build` (tsc) is green — the new `location` object type flows through `z.infer<>` exports with no type errors.
2. `npm test` (vitest) is green **after** the false-green assertions in §5 are corrected to the v2 shapes (boolean `done`, object `location`, `done=true`/`false` query, `done` omitted when not provided).
3. Every assertion that asserts a serialized request shape for `done`/`location` is verified to match `docs/api/openapi-v2.yaml` (boolean at lines 463-465 / 1102-1104; object at lines 466-499 / 1105-1138).
4. `LocationSchema` is defined **locally** in `src/schemas/activities.ts`; `git diff` shows **no** change to `src/schemas/common.ts`.
5. Only the four activities files (§6) are changed; no other source/test/helper files in the diff.
6. New positive/negative tests exist for: create `done` boolean, create `done` omitted, create/update `location` object, schema rejects string location.

---

## 8. Risks / notes

- **Zod version**: write all schema code in **Zod 3** syntax (repo is on Zod 3.25). A pending #16 PR B will migrate to Zod 4 later — do NOT pre-migrate (e.g., do not change `z.object({...}).optional()` patterns to Zod-4-isms). The plain `z.object({ ...optional strings }).optional()` used here is identical in both versions, so this is low risk.
- **`.optional()` placement**: making the whole `LocationSchema` end in `.optional()` and then calling `.describe()` is fine — `.describe()` preserves optionality. If the implementer references `location: LocationSchema` directly without an extra `.describe()`, that is also fine; the field must remain optional in both Create and Update schemas.
- **Truthiness guards in the tool** (`if (params.location)`, `if (params.done !== undefined)`): unchanged and correct. `location` uses a truthiness check (an absent object is `undefined` → skipped); `done` uses an explicit `!== undefined` check so `false` is still sent when the caller passes `done: false`. After removing `.default(false)`, an omitted `done` is `undefined` and correctly suppressed.
- **Duplication with issue #44 (org address object)**: the activity `location` object and the org `address` object are structurally similar. Duplicating the shape locally now is **acceptable and intended** for batch disjointness; a later issue (#48) may DRY them into `common.ts`. Do NOT attempt that consolidation here.
- **Spec red herring**: `openapi-v2.yaml:1595` ("Physical location where the activity takes place") is in `getActivityFields`, not the request body — do not treat it as the target shape. Authoritative shapes are lines 463-499 (create) and 1102-1138 (update).
- **Integration test fixture coupling**: `createActivity`/`updateActivity` integration tests mock the API *response* with `fixtures.activity` (which has no `location`); the assertions in §5 read the **request body** (`options.body`), not the response, so they are unaffected by the response fixture lacking `location`.
