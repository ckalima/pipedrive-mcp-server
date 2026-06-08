# Plan: Issue #28 — Dispatcher integration tests for `mcpErrorFromCode` call sites

## Context / Gap

`src/utils/errors.ts::mcpErrorFromCode` is already unit-tested in isolation
(`tests/unit/utils/errors.test.ts`). The GAP is dispatcher-level coverage: the
three `mcpErrorFromCode` call sites inside the `CallToolRequestSchema` handler in
`src/index.ts` (lines 71-120) are never exercised end-to-end. Those three paths:

1. **Unknown tool name** -> `VALIDATION_ERROR`, message `Unknown tool: <name>`,
   suggestion lists available tools.
2. **Invalid arguments (Zod `safeParse` failure)** -> `VALIDATION_ERROR`, message
   `Invalid arguments: <path>: <msg>; ...`, suggestion
   `Check the tool's inputSchema for required parameters`.
3. **Handler throws** -> `API_ERROR`, message = thrown `Error.message`, suggestion
   `Check your API key and network connection`.

The blocker: the handler is an inline closure inside `async function main()`, and
the module auto-runs `main().catch(... process.exit(1))` at import time and connects
a real `StdioServerTransport`. A test cannot import and invoke the real dispatcher
today without booting the whole STDIO server.

## 1. Chosen approach: (A) Extract an exported, side-effect-free `handleCallTool`

**Decision: Option A.** Extract the body of the `CallToolRequestSchema` closure into a
top-level exported async function `export async function handleCallTool(request)` in
`src/index.ts`, have `main()` register it
(`server.setRequestHandler(CallToolRequestSchema, handleCallTool)`), and guard the
auto-run so importing the module does not boot STDIO. Tests import `handleCallTool`
directly and assert on its return value. This is the smallest change that exercises
the REAL dispatcher logic (the same function the server registers), produces directly
assertable structured results, and matches the codebase's existing testing style
(direct function calls + `vi.stubGlobal('fetch', ...)`), with no new MCP SDK
in-memory-transport machinery.

**Rejected:**
- **(B) `createServer()` factory + in-memory linked transport + Client:** faithful but
  adds an SDK client/transport harness with no precedent in this repo (all tests call
  handlers directly); larger surface, more moving parts, harder assertions, no added
  confidence for these three branches.
- **(C) Replicate the handler in the test:** rejected — it would assert against a copy,
  not the shipped dispatcher, so the branches in `src/index.ts` stay uncovered and can
  silently diverge from the test.

## 2. Exact `src/` changes (description only — NOT applied)

File: `src/index.ts` (the only `src/` file touched).

a. **Extract the handler.** Move the entire closure body currently passed as the second
   argument to `server.setRequestHandler(CallToolRequestSchema, ...)` (current lines
   72-119) into a new module-level export:

   `export async function handleCallTool(request: <same param type as the inline closure received>): Promise<...> { ...body unchanged... }`

   Body is copied verbatim — no logic changes. It already references only module-level
   bindings (`getToolHandler`, `getToolSchema`, `toolDefinitions`, `mcpErrorFromCode`,
   `SERVER_NAME`), so nothing else needs to move. Preserve the `console.error` stderr
   logging and the exact message/suggestion strings.

   For the parameter type, reuse what the closure already infers from the SDK
   (`request` whose `.params` has `name` and `arguments`). Simplest faithful typing:
   `request: { params: { name: string; arguments?: unknown } }` (a structural subset of
   the SDK's `CallToolRequest`), or import the SDK request type. Keep it minimal and
   typecheck-clean under `strict`.

b. **Register it in `main()`.** Replace the inline closure with the function reference:
   `server.setRequestHandler(CallToolRequestSchema, handleCallTool);`
   Runtime behavior is identical (same function, same registration).

c. **Guard the auto-run** so `import`ing the module for tests does NOT run `main()` /
   connect STDIO / call `process.exit`. Replace the bare bottom-of-file
   `main().catch((error) => { ...; process.exit(1); });` with an entrypoint check.
   Two acceptable, equally minimal forms — implementer picks whichever typechecks
   cleanest under NodeNext ESM:

   - ESM entrypoint check:
     ``if (import.meta.url === `file://${process.argv[1]}`) { main().catch(...) }``
     (or the `pathToFileURL(process.argv[1]).href` variant for robustness across
     path encodings).
   - Or move `main()` + auto-run into a thin bin wrapper and keep `index.ts` export-only.
     This is heavier (new file) — prefer the inline `import.meta.url` guard to keep the
     footprint to a single file and zero new runtime files.

   The shipped binary still auto-runs because when executed via `node dist/index.js` /
   the `bin` entry, `import.meta.url` equals the `process.argv[1]` file URL, so the
   guard is true and `main()` runs exactly as before. When imported by vitest, the
   guard is false, so no STDIO boot and no `process.exit`.

   Note: `src/index.ts` is already excluded from coverage thresholds
   (`vitest.config.ts` `coverage.exclude`), so this change does not perturb coverage
   gates; the new tests still execute the real extracted function.

## 3. New test file + per-test outline

Path: `tests/integration/dispatcher.test.ts` (sits alongside `client.test.ts`; the
unit under test is the dispatcher in `src/index.ts`, which is integration-level).

Top matter (match existing conventions):
- `import { describe, it, expect, beforeEach, vi } from 'vitest';`
- `import { setupValidEnv } from '../helpers/mockEnv.js';`
- `import { handleCallTool } from '../../src/index.js';`
- `beforeEach(() => { setupValidEnv(); vi.unstubAllGlobals(); });`
- Helper to invoke: `handleCallTool({ params: { name, arguments: args } })`.

Exact returned shape for all three (from `mcpErrorFromCode` /
`formatErrorForMcp`): `{ isError: true, content: [{ type: 'text', text: '...' }] }`
where `text` is `Error [<CODE>]: <message>\nSuggestion: <suggestion>`.

### Test 1 — Unknown tool name (VALIDATION_ERROR)
- Arrange: valid env; no fetch needed.
- Act: `const result = await handleCallTool({ params: { name: 'pipedrive_not_a_tool', arguments: {} } });`
- Assert:
  - `result.isError === true`
  - `result.content[0].type === 'text'`
  - `result.content[0].text` contains `Error [VALIDATION_ERROR]:`
  - `result.content[0].text` contains `Unknown tool: pipedrive_not_a_tool`
  - `result.content[0].text` contains `Suggestion: Available tools:`
  - sanity: contains a known real tool name, e.g. `pipedrive_list_pipelines`
    (confirms the available-tools list is interpolated).

### Test 2 — Invalid arguments / Zod failure (VALIDATION_ERROR)
- Arrange: valid env; no fetch needed (parse fails before any handler call).
- Act: call a REAL tool with a type-violating argument that triggers a clean
  `safeParse` failure (see section 4 for the exact tool + payload):
  `const result = await handleCallTool({ params: { name: 'pipedrive_get_stage', arguments: { id: 'not-a-number' } } });`
- Assert:
  - `result.isError === true`
  - `result.content[0].text` contains `Error [VALIDATION_ERROR]:`
  - `result.content[0].text` contains `Invalid arguments:`
  - `result.content[0].text` contains `id:` (the failing Zod path)
  - `result.content[0].text` contains `Suggestion: Check the tool's inputSchema for required parameters`
- Optional second case to lock the `<path>: <msg>; ...` join format: pass
  `{ id: 'x', limit: 999 }`-style multi-error payload on a tool whose schema has two
  failing fields and assert the text contains `; ` between two `path: msg` segments
  (keep this only if a single tool yields two clean errors; otherwise omit to stay
  precise).

### Test 3 — Handler throws (API_ERROR)
- Arrange: valid env. Force a REAL registered handler to throw (see section 4):
  spy/replace so the dispatcher's `getToolHandler(name)` returns a handler that rejects
  with `new Error('boom from handler')`, while schema validation passes (use a tool
  whose schema accepts the given args, or a tool with no schema / empty args).
- Act: `const result = await handleCallTool({ params: { name: '<tool>', arguments: {<valid args>} } });`
- Assert:
  - `result.isError === true`
  - `result.content[0].text` contains `Error [API_ERROR]:`
  - `result.content[0].text` contains `boom from handler` (thrown message passes through)
  - `result.content[0].text` contains `Suggestion: Check your API key and network connection`
- Edge assertion (covers the `error instanceof Error ? ... : 'Unknown error occurred'`
  branch): a second test rejecting with a non-Error (e.g. `throw 'string failure'`)
  asserts `text` contains `Unknown error occurred`.

## 4. How paths 2 and 3 are triggered concretely

**Path 2 (Zod failure) — real tool: `pipedrive_get_stage`.**
Its schema is `GetStageSchema = IdParamSchema = z.object({ id: z.number().int().positive() })`
(`src/schemas/common.ts:26-28`, `src/schemas/pipelines.ts:24`). Passing
`{ id: 'not-a-number' }` makes `schema.safeParse(args)` fail with a single clean error
whose `path` is `['id']` and message `Expected number, received string`. The dispatcher
joins it as `id: Expected number, received string`, yielding
`Invalid arguments: id: Expected number, received string`. No fetch is hit because the
parse fails before the handler runs. (Alternative real tools with a required numeric id
work identically, e.g. any `pipedrive_get_*`/`pipedrive_delete_*` using `IdParamSchema`.)

**Path 3 (handler throws) — mechanism: replace the registered handler with a throwing
double via the tool registry, NOT a re-implemented dispatcher.**
A real Pipedrive handler will essentially never throw: `PipedriveClient.request` wraps
fetch in try/catch and returns `{ success:false, error: NETWORK_ERROR }`, and handlers
turn that into `mcpErrorResult` (`isError:true`) — they RETURN, they don't throw. So
mocking `fetch` to reject does NOT exercise the dispatcher's catch. To hit path 3 we
make `getToolHandler(name)` return a handler that throws, which is a legitimate
collaborator stub — the unit under test (the dispatcher catch block) stays 100% real.
Concrete mechanism, matching repo style:

  `vi.mock('../../src/tools/index.js', async (importOriginal) => {`
  `  const actual = await importOriginal<typeof import('../../src/tools/index.js')>();`
  `  return { ...actual, getToolHandler: (name: string) =>`
  `    name === 'pipedrive_throwing_tool'`
  `      ? async () => { throw new Error('boom from handler'); }`
  `      : actual.getToolHandler(name),`
  `    getToolSchema: (name: string) =>`
  `      name === 'pipedrive_throwing_tool' ? undefined : actual.getToolSchema(name),`
  `  };`
  `});`

Because `src/index.ts` imports `getToolHandler`/`getToolSchema`/`toolDefinitions` from
`./tools/index.js`, hoisted `vi.mock` of that module makes the dispatcher resolve the
throwing handler with `schema === undefined` (so validation is skipped and the handler
runs and throws), driving the real `catch` -> `mcpErrorFromCode('API_ERROR', ...)`.
`toolDefinitions` is spread from `actual`, so Test 1's available-tools assertion still
sees the real list. Keep the mock scoped to this file. (If the implementer prefers no
`vi.mock` of `tools/index.js`, an equivalent is `vi.spyOn(toolsIndex, 'getToolHandler')`
imported as a namespace — but `vi.mock` with `importOriginal` is the cleanest given the
named-import binding in `index.ts`; the implementer should verify ESM named-import
interception works and fall back to `vi.spyOn` on the namespace if not.)

The non-Error edge case throws a primitive (`throw 'string failure'`) from the same
stubbed handler to cover the `: "Unknown error occurred"` branch.

## 5. Verification commands

Run inside the worktree:
```bash
npm run build      # tsc: confirms the extracted export + entrypoint guard typecheck under strict/NodeNext
npm test           # vitest run
```
Expected: all existing tests still pass (baseline ~765 per issue; local `grep` of
`it(`/`test(` counts 761 lines, exact runner count may differ slightly) PLUS the new
dispatcher tests (3 core paths + 2 edge cases = ~5 new). The auto-run guard means
importing `src/index.ts` in the test does not boot STDIO or call `process.exit`, so the
suite exits cleanly. `node_modules` is a symlink — do NOT run `npm ci`/`npm install`.

Manual smoke (optional, not required): `npm start` (or `node dist/index.js`) should
still boot the STDIO server exactly as before, proving the entrypoint guard preserves
runtime behavior.

## 6. Risk / footprint note

- **Files modified (IMPLEMENT stage):** `src/index.ts` (extract + export
  `handleCallTool`, register it, guard auto-run with `import.meta.url` check).
- **Files created (IMPLEMENT stage):** `tests/integration/dispatcher.test.ts`.
- **Runtime behavior unchanged:** the shipped server registers the same function and
  still auto-runs `main()` when executed as the entrypoint (`bin`/`node dist/index.js`),
  because `import.meta.url === file://${process.argv[1]}` holds there. Only the import
  path (vitest) is affected, where the guard is intentionally false.
- **Risks to watch at verify/review:**
  1. **Entrypoint-guard correctness under ESM/NodeNext + the `#!/usr/bin/env node`
     shebang + the `bin` mapping.** Confirm `import.meta.url` vs `process.argv[1]`
     comparison is true when launched via the bin and via `node dist/index.js`
     (path-encoding edge cases on macOS; prefer `pathToFileURL(process.argv[1]).href`
     if a raw string compare is brittle). If the guard is wrong, the server silently
     stops auto-starting — must be smoke-tested.
  2. **`vi.mock` interception of the named imports in `src/index.ts`.** ESM named-import
     bindings can be tricky; verify the throwing handler is actually resolved by the
     dispatcher. Fallback: `vi.spyOn` on a namespace import of `src/tools/index.js`.
  3. **Exact Zod message string** (`Expected number, received string`) is
     zod-version-dependent (`zod ^3.25`). Tests assert on the path token `id:` and
     `Invalid arguments:` substrings (stable) rather than the full zod message to avoid
     brittleness; if the full message is asserted, pin it to the installed zod version.
  4. **`handleCallTool` param typing** must satisfy the SDK's `setRequestHandler`
     overload after extraction; if the structural type causes a typecheck error, import
     the SDK `CallToolRequest` type instead.
