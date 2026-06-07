---
title: "refactor: extract McpToolErrorResult type alias for duplicated return type"
status: active
date: 2026-06-07
type: refactor
issue: 27
depth: lightweight
---

# refactor: extract `McpToolErrorResult` type alias for duplicated return type

## Summary

Extract a single named type alias, `McpToolErrorResult`, for the MCP tool error-response shape that is currently written inline and verbatim across three function signatures in `src/utils/errors.ts`. Apply it to all three signatures. This is a pure type-level refactor with no runtime or behavioral change: the emitted objects are untouched, only the type annotations are deduplicated.

## Problem Frame

The return type `{ content: { type: "text"; text: string }[]; isError: true }` is duplicated verbatim across three function signatures in `src/utils/errors.ts`:

- `destructiveOperationGuard()` (line 87) — returns the type **or `null`**: `{ ... } | null`
- `mcpErrorFromCode()` (return annotation, line 134)
- `mcpErrorResult()` (line 147)

Triplicated structural types invite silent drift: if the MCP SDK changes the content shape (e.g., adds a content variant), three sites must be edited in lockstep and nothing enforces consistency. A single named alias makes the contract explicit and gives one edit point. Flagged by the kieran-typescript and maintainability reviewers (confidence 100) in code review run `20260505-212042-6cdd1db6`, finding #5.

## Requirements

- R1. Introduce a single exported type alias `McpToolErrorResult` describing `{ content: { type: "text"; text: string }[]; isError: true }`.
- R2. Use the alias in all three signatures, preserving the `| null` union on `destructiveOperationGuard`.
- R3. No change to any runtime value, control flow, or emitted object — type-level only.
- R4. `npm run build` (tsc) passes and the existing `tests/unit/utils/errors.test.ts` suite stays green.

## Key Technical Decisions

- **Alias placement:** Define `McpToolErrorResult` near the top of `src/utils/errors.ts`, alongside the existing type declarations (e.g., next to `ErrorResponse`), so all three consumers see it. Export it so future tool handlers and tests can reference the canonical shape rather than re-inlining it.
- **`| null` stays at the call site, not in the alias:** The alias describes the success-shape of an error result. `destructiveOperationGuard` annotates as `McpToolErrorResult | null`, keeping the nullability explicit where it is meaningful rather than baking it into the alias (which the other two callers do not want).
- **Scope discipline:** Only the three signatures in `errors.ts` carry this exact type today (verified: no other file inlines it). Do not hunt for loosely-similar shapes elsewhere — that is out of scope and risks behavior drift.

## Implementation Units

### U1. Extract and apply `McpToolErrorResult`

- **Goal:** Replace the three inline return-type literals in `src/utils/errors.ts` with a single exported `McpToolErrorResult` alias.
- **Requirements:** R1, R2, R3
- **Dependencies:** none
- **Files:**
  - `src/utils/errors.ts` (modify) — add the alias; update the three signatures
  - `tests/unit/utils/errors.test.ts` (verify / extend) — existing coverage of the three helpers must stay green; optionally add a compile-level assertion that each helper's return is assignable to `McpToolErrorResult`
- **Approach:**
  1. Declare `export type McpToolErrorResult = { content: { type: "text"; text: string }[]; isError: true };` near the existing type declarations.
  2. Change `destructiveOperationGuard()` return annotation to `McpToolErrorResult | null`.
  3. Change `mcpErrorFromCode()` return annotation to `McpToolErrorResult`.
  4. Change `mcpErrorResult()` return annotation to `McpToolErrorResult`.
  5. Leave every function **body** untouched — the objects returned already satisfy the alias.
- **Patterns to follow:** Mirror the existing exported-type style in `src/utils/errors.ts` (e.g., `ErrorResponse`) and the project convention that tool results are `{ content: [{ type: "text", text: string }] }` with optional `isError: true`.
- **Test scenarios:**
  - The existing `errors.test.ts` cases for `destructiveOperationGuard`, `mcpErrorFromCode`, and `mcpErrorResult` continue to pass unchanged (behavior is identical).
  - `Covers R3.` Returned objects are byte-for-byte the same as before — assert the existing tests' expected shapes are unmodified.
  - (Optional, type-level) A `satisfies McpToolErrorResult` / assignment check confirms each helper's return conforms to the alias, so future drift fails the build.
- **Verification:** `npm run build` compiles with no new type errors; `npm test` shows the `errors.test.ts` suite green; a `grep` for the inline literal `content: { type: "text"; text: string }[]; isError: true` finds only the single alias definition.

## Scope Boundaries

**In scope:** the three signatures in `src/utils/errors.ts` and the alias definition.

### Deferred to Follow-Up Work

- Broader audit of other MCP result shapes (success results, list summaries) for similar aliasing — not requested here, and #28 (`mcpErrorFromCode` dispatcher integration tests) is the related open item for error-path coverage.

## Verification

The change is complete when:
1. `src/utils/errors.ts` declares exactly one `McpToolErrorResult` alias and all three helpers reference it (`destructiveOperationGuard` as `McpToolErrorResult | null`).
2. No inline copy of the structural type remains in the file.
3. `npm run build` and `npm test` both pass with no behavioral diffs.

---
*Planned by [Menehune](https://github.com/ckalima/menehune) via `/backlog:plan` (orchestration pilot)*
