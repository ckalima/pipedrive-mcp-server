---
id: "004"
title: "Fix error guard throw path, migrate index.ts inline errors, strengthen tests"
status: active
created: 2026-05-05
issues: [23, 24, 25]
depth: lightweight
---

# Fix Error Guard Throw Path, Migrate Index.ts Inline Errors, Strengthen Tests

## Problem

Three residual findings from code review run `20260505-170259-9d037560`:

1. **P1 bug (#23)**: `destructiveOperationGuard()` calls `getConfig()` which throws when `PIPEDRIVE_API_KEY` is missing. The guard should always return a structured MCP error, never throw.
2. **P2 improvement (#24)**: `src/index.ts` has 3 inline `formatErrorForMcp(createErrorResponse(...))` blocks that should use a helper for consistency.
3. **P2 improvement (#25)**: Test suite lacks mutation isolation proof and guard throw-path coverage.

## Scope Boundaries

- Only touch `src/utils/errors.ts`, `src/index.ts`, and `tests/unit/utils/errors.test.ts`
- Do not change `src/config.ts` or its `getConfig()` behavior
- Do not change the MCP error shape or any tool handler signatures

## Key Technical Decisions

**D1: Read `process.env` directly in the guard instead of calling `getConfig()`.**
The guard only needs `PIPEDRIVE_ENABLE_DESTRUCTIVE`. Reading it from `process.env` avoids the API key validation that `getConfig()` performs. This is the simplest fix and matches the guard's single responsibility: check if destructive ops are enabled.

**D2: Add `mcpErrorFromCode(code, message, suggestion?)` helper to `errors.ts`.**
The 3 inline blocks in `index.ts` construct errors from codes, not from `ApiResponse` objects. A new helper bridges this gap. `mcpErrorResult` stays unchanged for tool-file use.

**D3: Test mutation by mutating a returned object and verifying the next call is unaffected.**
The existing test proves `a !== b` (identity). The fix adds actual mutation to prove isolation.

## Implementation Units

### U1: Fix destructiveOperationGuard to read process.env directly

**Goal:** Remove `getConfig()` dependency so the guard never throws.

**Files:**
- Modify: `src/utils/errors.ts`

**Approach:** Replace `getConfig().enableDestructive` with `process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE === "true"`. Remove the `getConfig` import if no longer used.

**Test scenarios:**
- Guard returns null when `PIPEDRIVE_ENABLE_DESTRUCTIVE=true` (existing)
- Guard returns MCP error when env var is unset (existing)
- Guard returns MCP error when API key is missing (new, was the bug)

**Verification:** `npm test` passes. Guard no longer imports `getConfig`.

### U2: Add mcpErrorFromCode helper and migrate index.ts

**Goal:** Replace 3 inline error blocks in `index.ts` with the new helper.

**Files:**
- Modify: `src/utils/errors.ts` (add `mcpErrorFromCode`)
- Modify: `src/index.ts` (use the helper, remove `createErrorResponse`/`formatErrorForMcp` imports if unused)

**Approach:** Add `mcpErrorFromCode(code, message, suggestion?)` that composes `formatErrorForMcp(createErrorResponse(...))` and returns the MCP error shape. Update the 3 call sites in `index.ts`.

**Patterns to follow:** Same return type as `mcpErrorResult`: `{ content: [{ type: "text"; text: string }]; isError: true }`.

**Test scenarios:**
- `mcpErrorFromCode` returns correct MCP shape with code and message
- `mcpErrorFromCode` includes suggestion when provided
- `mcpErrorFromCode` omits suggestion line when not provided

**Verification:** `npm test` passes. `index.ts` no longer has inline `{ content: [{ type: "text", text: formatErrorForMcp(...) }], isError: true }` blocks.

### U3: Strengthen error tests

**Goal:** Add mutation isolation proof and guard throw-path coverage.

**Files:**
- Modify: `tests/unit/utils/errors.test.ts`

**Approach:**
1. In the existing "should return independent copies" test, mutate `a.code` and verify `b.code` is unaffected.
2. Add a new test for guard behavior when `PIPEDRIVE_API_KEY` is missing: delete both env vars, call `destructiveOperationGuard()`, assert it returns the `DESTRUCTIVE_DISABLED` MCP error (not throw).
3. Add tests for `mcpErrorFromCode`.

**Dependencies:** U1 must land first (guard behavior change), U2 must land first (new helper).

**Test scenarios:**
- Mutation of one `getErrorResponse` result does not affect subsequent calls
- Guard returns structured error when API key is absent
- `mcpErrorFromCode` basic and suggestion tests

**Verification:** `npm test` passes with new assertions.
