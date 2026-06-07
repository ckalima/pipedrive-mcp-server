# Implementation Plan: Code-review fixes (Issue #15)

> Firewalled-pipeline plan artifact. The implement agent executes this verbatim.
> All five items localized. Match style: 2-space indent, double quotes in `src/`, `.js` ESM suffixes.
> The #1 risk is test-assertion breakage — the Test Impact section is mandatory.

## Item 1 — Remove `null as unknown as Config` type hole (`src/client.ts`)

Make `config` truly nullable, drop the `initialized` boolean and the empty constructor, and have `ensureInitialized()` return a non-null `Config`.

**Before (class head, lines ~27–52):**
```ts
export class PipedriveClient {
  private config: Config;
  private initialized: boolean = false;

  constructor() {
    // Defer config loading to first use for better error handling
    this.config = null as unknown as Config;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.config = getConfig();
      this.initialized = true;
    }
  }

  private getBaseUrl(version: ApiVersion): string {
    this.ensureInitialized();
    return version === "v1" ? this.config.baseUrlV1 : this.config.baseUrlV2;
  }
```
**After:**
```ts
export class PipedriveClient {
  private config: Config | null = null;

  /**
   * Ensures the client is properly configured and returns the loaded config
   */
  private ensureInitialized(): Config {
    if (!this.config) {
      this.config = getConfig();
    }
    return this.config;
  }

  /**
   * Gets the base URL for the specified API version
   */
  private getBaseUrl(config: Config, version: ApiVersion): string {
    return version === "v1" ? config.baseUrlV1 : config.baseUrlV2;
  }
```
(Keep the existing JSDoc comments on `ensureInitialized`/`getBaseUrl`; the empty `constructor()` is removed — the field initializer replaces it, preserving "defer config loading to first use".)

**Update `request()` (lines ~118–133):**
```ts
    const config = this.ensureInitialized();

    const baseUrl = this.getBaseUrl(config, version);
    const url = new URL(`${baseUrl}${endpoint}`);

    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    if (version === "v2") {
      headers["x-api-token"] = config.apiKey;
    } else {
      url.searchParams.set("api_token", config.apiKey);
    }
```
(Replace the three `this.config.*` reads + `this.getBaseUrl(version)` with the local `config`.) `get/post/patch/put/delete` are unchanged.

## Item 2 — Stop leaking API key length (`src/config.ts`)

**Before (lines ~26–31):**
```ts
  if (apiKey.length !== 40) {
    throw new Error(
      `Invalid PIPEDRIVE_API_KEY format: expected 40 characters, got ${apiKey.length}. ` +
      "Verify your API key at Pipedrive Settings > Personal preferences > API"
    );
  }
```
**After:**
```ts
  if (apiKey.length !== 40) {
    throw new Error(
      "Invalid PIPEDRIVE_API_KEY format: expected a 40-character key. " +
      "Verify your API key at Pipedrive Settings > Personal preferences > API"
    );
  }
```
New message contains `40-character` but NOT the old substring `expected 40 characters` and NOT `got <n>`.

## Item 3 — Add fetch timeout (`src/client.ts`)

Add a module-level const (after the `ApiResponse` interface, before the class):
```ts
/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30_000;
```
**Before (fetch call, lines ~150–154):**
```ts
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
```
**After:**
```ts
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
```
On timeout, `fetch` rejects with a `TimeoutError` (an `Error`), caught by the existing `try/catch` → returns `NETWORK_ERROR` with `error.message` only (no URL/token). Desired behavior.

## Item 4 — Remove `.default("desc")` from `SortDirectionSchema` (`src/schemas/common.ts`)

**Before (line ~63):**
```ts
export const SortDirectionSchema = z.enum(["asc", "desc"]).optional().default("desc");
```
**After:**
```ts
export const SortDirectionSchema = z.enum(["asc", "desc"]).optional();
```
Consumers (`deals`, `persons`, `organizations`, `activities` schemas/handlers) all guard with `if (params.sort_direction) queryParams.set(...)`, so explicit values are unchanged; only the implicit default (`desc`) goes away — `sort_direction` is no longer sent when omitted. `notes` uses its OWN inline `z.enum(["asc","desc"]).optional()` (not `SortDirectionSchema`) and is unaffected.

## Item 5 — Verify error logging doesn't leak API key (`src/index.ts`) — NO-OP

Conclusion: **no code change.** The only `?api_token=` URL is the local `const url` in `client.ts request()` (v1 path); it is never attached to a thrown/returned error. v2 uses the `x-api-token` header (never query). `request()` returns `{ success:false, error }` (sanitized) rather than throwing, so `index.ts`'s CallTool `catch` never receives a URL-bearing client error. The logged object at the catch cannot contain the token. Leave the line as-is (an optional one-line clarifying comment is acceptable but not required). Treat as a verified no-op.

---

# TEST IMPACT (mandatory — missing a broken assertion is the failure mode we guard against)

## Tests that WILL BREAK — update

### A. `tests/unit/config.test.ts` (Item 2) — assert the new wording
1. "should throw error when API key is too short" — change `toThrow(/expected 40 characters, got 6/)` → `toThrow(/expected a 40-character key/)`.
2. "should throw error when API key is too long" — change `toThrow(/expected 40 characters, got 50/)` → `toThrow(/expected a 40-character key/)`.
3. "should return valid: false ... wrong length" — change `toContain('expected 40 characters')` → `toContain('expected a 40-character key')`.
> Match whatever final wording is used; it must NOT contain `got` + the key length.

### B. `tests/unit/schemas/common.test.ts` (Item 4) — `SortDirectionSchema` default test
Replace:
```ts
    it('should default to "desc"', () => {
      const result = SortDirectionSchema.parse(undefined);
      expect(result).toBe('desc');
    });
```
with:
```ts
    it('should be undefined when omitted', () => {
      const result = SortDirectionSchema.parse(undefined);
      expect(result).toBeUndefined();
    });
```
The `accept "asc"`/`accept "desc"`/`reject invalid` cases stay.

### C. Per-schema "minimal params" tests (Item 4) — flip `'desc'` → `undefined`
4. `tests/unit/schemas/deals.test.ts` — `expect(result.sort_direction).toBe('desc')` → `.toBeUndefined()`
5. `tests/unit/schemas/organizations.test.ts` — same
6. `tests/unit/schemas/persons.test.ts` — same
7. `tests/unit/schemas/activities.test.ts` — same
(Keep the `limit` default assertions on those cases.)

## NOT affected (verified)
- Tests passing `sort_direction: 'asc'` explicitly (deals/persons/orgs/activities/notes unit + deals/orgs integration URL asserts) — explicit values flow unchanged.
- No test asserts `sort_direction=desc` in a URL by default.
- `tests/integration/client.test.ts` init tests (construction-no-throw, first-use-throws `PIPEDRIVE_API_KEY`) hold with Item 1.
- `tests/integration/client.test.ts` network-error test holds with Item 3 (mock ignores `_init`).
- Item 5: no test changes.

## NEW tests to add (minimal)
1. `tests/unit/config.test.ts` — does not leak length:
```ts
   it('should not reveal the provided key length in the error', () => {
     // set env to a short key (reuse the file's helper / testApiKeys.tooShort, length 6)
     expect(() => getConfig()).not.toThrow(/got \d/);
   });
```
   (Use the file's existing env-setup helper + short-key fixture; adapt names to what the file already uses.)
2. `tests/integration/client.test.ts` — request carries an abort signal:
```ts
   it('should set an abort signal with a timeout on requests', async () => {
     const mockFn = mockApiSuccess([fixtures.deal]);
     const client = new PipedriveClient();
     await client.get('/deals');
     const [, options] = mockFn.mock.calls[0];
     expect(options.signal).toBeInstanceOf(AbortSignal);
   });
```
   (Adapt imports/fixtures to the file's existing patterns.)

## Verification (done by separate VERIFY agent, not the implementer)
`npm run build` + `npm test` must pass.
