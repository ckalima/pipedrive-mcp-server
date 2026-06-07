---
title: "feat: migrate v2 auth from query param to x-api-token header"
status: active
date: 2026-06-07
type: feat
issue: 7
depth: standard
---

# feat: migrate v2 auth from query param to x-api-token header

## Summary

Currently all Pipedrive API calls authenticate by appending `?api_token=<key>` as a URL query parameter. This plan migrates v2 calls (deals, persons, organizations, activities) to instead use the `x-api-token` HTTP header, which is the correct auth mechanism for the v2 API. v1 calls (notes, mail, fields, pipelines, users) keep the `?api_token=` query param unchanged. The change is contained entirely within `src/client.ts` and does not touch any tool handlers.

This is a prerequisite for Phase 2B entity migrations (pipelines, stages, fields) and must land before the v1 sunset deadline of July 31, 2026.

## Problem Frame

- `src/client.ts` line 124 unconditionally calls `url.searchParams.set("api_token", this.config.apiKey)` for every request regardless of version.
- Pipedrive's v2 API documents `x-api-token` as the required header-based auth. Query param auth currently still works for v2 but will eventually be dropped.
- The `version` parameter is already threaded through the entire call chain (`get`, `post`, `patch`, `put`, `delete` all pass it to `request()`), so branching inside `request()` is the minimal and correct fix.
- Leaking the API key into query strings increases the surface area for accidental exposure in logs, proxy traces, and browser history.

## Requirements

- **R1**: v2 calls MUST NOT include `?api_token=` in the URL.
- **R2**: v2 calls MUST include the `x-api-token` header with the API key value.
- **R3**: v1 calls MUST continue to include `?api_token=` as a query param (no header added for v1 calls).
- **R4**: No changes to tool handler files, schema files, or config.
- **R5**: All existing tests must pass without modification (except the one assertion in `client.test.ts` that currently checks `api_token` appears in the URL for v2 GET requests - that assertion must be updated to the new behavior).
- **R6**: New test assertions must verify the header path for v2 and the query-param path for v1.
- **R7**: The API key MUST NOT appear in the `url.toString()` passed to `fetch()` for v2 calls.

## Key Technical Decisions

1. **Branch on `version` inside `request()`, not at call sites.** The version is already available as a parameter. A single `if (version === "v2")` block in `request()` handles all HTTP methods without touching any caller.

2. **Remove the unconditional `url.searchParams.set("api_token", ...)` line and replace it with a version-conditional block.** For v2: add `headers["x-api-token"] = this.config.apiKey`. For v1: `url.searchParams.set("api_token", this.config.apiKey)`. This is the minimal diff.

3. **Do not add `x-api-token` to v1 calls.** The v1 API does not document header auth; adding it unnecessarily would be noise. Only v1's query param form is kept.

4. **Existing test infrastructure is sufficient.** The `mockFetch` helper captures both `url` (string) and `options` (RequestInit) on each call. Tests assert `url` for query params and `options.headers` for the header. No new helpers needed.

5. **The `console.error` log line logs `method` and `endpoint` only (not the full URL), so the API key is not currently in logs and this change does not affect that.**

## Implementation Units

### U1: Update `request()` in `src/client.ts`

**Goal**: Branch on `version` to set auth via header (v2) or query param (v1).

**Requirements**: R1, R2, R3, R4, R7

**Dependencies**: None (self-contained change to one file).

**Files**:
- `src/client.ts` (modify `request()` method, lines 111-181)

**Approach**:

Replace the single unconditional line:
```
url.searchParams.set("api_token", this.config.apiKey);
```
with a version-conditional block placed in the same position (after building the URL, before setting additional params):
```
if (version === "v2") {
  headers["x-api-token"] = this.config.apiKey;
} else {
  url.searchParams.set("api_token", this.config.apiKey);
}
```

Because `headers` is declared a few lines lower (after the params block), the header assignment must either be moved above the conditional, or the `headers` object must be initialized before the conditional. The cleanest approach: initialize `headers` before the version branch, then do the conditional assignment, then set `Content-Type` conditionally on `body`. The current order is:

1. Build `url`
2. `url.searchParams.set("api_token", ...)` (line 124)
3. Append additional `params` (lines 127-130)
4. Declare `headers` object (lines 132-135)
5. Conditionally add `Content-Type` (lines 137-139)
6. `fetch(url.toString(), { method, headers, body })` (lines 145-149)

Revised order:
1. Build `url`
2. Declare `headers` object (move up from line 132)
3. Version branch: if v2 set `headers["x-api-token"]`, else `url.searchParams.set("api_token", ...)`
4. Append additional `params`
5. Conditionally add `Content-Type`
6. `fetch(...)` (unchanged)

**Patterns to follow**: Follow the existing `if/else` style used throughout the file; keep the token assignment adjacent to the URL construction for readability.

**Test scenarios**: See U2.

**Verification**: `npm run build` must succeed with no TypeScript errors. The change is type-safe because `headers` is `Record<string, string>` and `this.config.apiKey` is a `string`.

---

### U2: Update integration tests in `tests/integration/client.test.ts`

**Goal**: Update the one existing v2 assertion that checks for `api_token` in the URL, and add new assertions that cover both auth paths.

**Requirements**: R5, R6

**Dependencies**: U1 (tests are written against the new behavior)

**Files**:
- `tests/integration/client.test.ts` (modify existing test; add new describe block)

**Approach**:

**Existing test to update** (around line 42-53, "should make GET request with correct URL and headers"):

Current assertion:
```
expect(url).toContain(`api_token=${VALID_API_KEY}`);
```
Replace with:
```
expect(url).not.toContain('api_token');
expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
```

**New describe block** - add after the existing `GET requests` block (or as a sub-section within it):

```
describe('authentication', () => {
  it('v2 calls: sets x-api-token header, not query param', async () => {
    const mockFn = mockApiSuccess([fixtures.deal]);
    const client = new PipedriveClient();

    await client.get('/deals'); // default version = "v2"

    const [url, options] = mockFn.mock.calls[0];
    expect(url).not.toContain('api_token');
    expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
  });

  it('v1 calls: sets api_token query param, not header', async () => {
    const mockFn = mockApiSuccess([]);
    const client = new PipedriveClient();

    await client.get('/users', undefined, 'v1');

    const [url, options] = mockFn.mock.calls[0];
    expect(url).toContain(`api_token=${VALID_API_KEY}`);
    expect(options.headers['x-api-token']).toBeUndefined();
  });

  it('v2 POST calls: sets x-api-token header', async () => {
    const mockFn = mockApiSuccess(fixtures.deal);
    const client = new PipedriveClient();

    await client.post('/deals', { title: 'New' }); // default version = "v2"

    const [url, options] = mockFn.mock.calls[0];
    expect(url).not.toContain('api_token');
    expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
  });

  it('v2 PATCH calls: sets x-api-token header', async () => {
    const mockFn = mockApiSuccess(fixtures.deal);
    const client = new PipedriveClient();

    await client.patch('/deals/1', { title: 'Updated' }); // default version = "v2"

    const [url, options] = mockFn.mock.calls[0];
    expect(url).not.toContain('api_token');
    expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
  });

  it('v2 DELETE calls: sets x-api-token header', async () => {
    const mockFn = mockApiSuccess({ id: 1 });
    const client = new PipedriveClient();

    await client.delete('/deals/1'); // default version = "v2"

    const [url, options] = mockFn.mock.calls[0];
    expect(url).not.toContain('api_token');
    expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
  });

  it('testConnection (v1): uses query param auth', async () => {
    const mockFn = mockApiSuccess({ id: 1, name: 'Test User' });
    const client = new PipedriveClient();

    await client.testConnection();

    const [url, options] = mockFn.mock.calls[0];
    expect(url).toContain(`api_token=${VALID_API_KEY}`);
    expect(options.headers['x-api-token']).toBeUndefined();
  });
});
```

**Patterns to follow**: Existing tests use `mockFn.mock.calls[0]` destructured as `[url, options]`. The `options.headers` object is asserted with direct property access (e.g., `options.headers['Content-Type']`). Follow the same style.

**Test scenarios** (summary):
- v2 GET: header set, query param absent
- v1 GET: query param set, header absent
- v2 POST: header set, query param absent
- v2 PATCH: header set, query param absent
- v2 DELETE: header set, query param absent
- `testConnection` (v1): query param set, header absent

**Verification**: `npm test` must pass with all new scenarios green and no regressions.

---

## Scope Boundaries

**In scope**:
- `src/client.ts` `request()` method only
- `tests/integration/client.test.ts` for the updated and new assertions

**Out of scope**:
- No changes to any tool handler files under `src/tools/`
- No changes to `src/config.ts`, `src/schemas/`, or `src/utils/`
- No changes to `tests/integration/tools/*.test.ts` (tool tests mock fetch at a higher level and do not assert auth headers directly)
- No changes to `tests/unit/` files
- No migration of additional entities (that is Phase 2B and follows this PR)
- No changes to logging format in `console.error`

## Verification

After implementation:

1. `npm run build` - TypeScript compiles with no errors.
2. `npm test` - All existing tests pass; new auth tests pass.
3. Manual smoke test (optional): run `npm start` with a valid `PIPEDRIVE_API_KEY` and call a v2 tool (e.g., `list_deals`). Observe that the outbound request URL in stderr logs does not contain `api_token=` (the log only shows `endpoint`, not the full URL, so this is already satisfied by design).
4. Confirm the test for `testConnection` still asserts `/v1/users/me` URL and now also confirms query param auth.

---

*Planned by [Menehune](https://github.com/ckalima/menehune) via /backlog:plan (fan-out)*
