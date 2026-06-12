# Session Handoff: comprehensive live smoke COMPLETE on Growth+ (A+B+C all green); task is_done/is_milestone bug (#81) found via Section C and fixed

Last updated: 2026-06-12 (second session). Repo: `main` + PR for `fix/81-task-is-done-is-milestone`. Build green (`tsc`), **1698 tests green**, `eslint src/` clean.

## This session (2026-06-12, Growth+ trial) — Section C run + #81

- **PR #80 merged** (the #79 v1 empty-list fix + `scripts/smoke-coverage.ts`); main @ `536301b`.
- **Confirmed the `.env` token is the Growth+ trial** (user 25299317, chris+mcp@saltandwind.com, account created 2026-06-11): `/v1/users/me` 200 and the plan-gated `/api/v2/deals/installments` probe returned 200 (the below-Growth sandbox returned 403).
- **Ran the FULL smoke (A+B+C) live against Growth+.** First run: 106 PASS / 5 FAIL / 0 BLOCKED. All previously plan-BLOCKED surfaces (projects suite, installments) now exercised. The 5 FAILs decomposed into one real bug (#81) and one harness-design issue (followers, below).
- **FOUND + FIXED issue #81 (real bug, the bad kind — silent).** The live v2 API does NOT recognize the spec-documented `done`/`milestone` int 0|1 task write fields; the real write fields are **`is_done`/`is_milestone` BOOLEANS** (same names/types as the GET response). Worst mode: `PATCH {done:1, title:"x"}` returns 200 and silently drops the done-flag. `POST` silently ignores both. Verified live with a full matrix (see #81). Both the vendored AND Pipedrive's currently-published OpenAPI spec still document the int form, and the spec is internally inconsistent (GET params/responses use `is_*` booleans). Activities are NOT affected (`done: boolean` round-trips fine, verified live).
  - Fix: schemas renamed to `is_done`/`is_milestone` (boolean, tolerant 0|1→bool preprocess), `.strict()` on Create/UpdateTaskSchema so the legacy keys REJECT loudly (the #70 v2-rename pattern), handler forwards + hand-written inputSchema literals + descriptions updated (the THREE-places gotcha), unit REJECT tests + integration wire-shape tests updated, smoke harness updated.
- **Fixed the harness follower flow.** The creating user auto-follows every entity they create, so on a single-user account `add_*_follower` always failed with "already following" (correct error mapping, wrong test design). `followerRoundTrip` now does: delete auto-follower → add (genuine) → list → delete. All four entities (deal/person/org/product) PASS.
- **Hardened the update_task smoke check**: it now asserts `data.is_done === true` in the response, not just a 200 — a bare 200 is exactly what masked #81.
- **Re-ran the full smoke after the fix: 116 PASS / 0 FAIL / 0 BLOCKED / 15 SKIP** (SKIPs = "get first item" probes on empty collections in the fresh trial account). Every exercised surface is live-verified.

**▶ NEXT SESSION:** Nothing queued. The comprehensive-live-smoke plan (docs/plans/2026-06-11-comprehensive-live-smoke-plan.md) is COMPLETE: Sections A/B/C all ran green against a Growth+ trial. Backlog is empty once the #81 PR merges. Optional ideas: report the spec discrepancy to Pipedrive; consider an `is_done`-flip assertion pattern for other write smokes.

## Durable gotchas (carried + new — still apply to any future work)

- **NEW (#81): the live v2 API can contradict its own published OpenAPI spec.** Task writes need boolean `is_done`/`is_milestone`; the spec's `done`/`milestone` int 0|1 fields are silently ignored (200, no-op) when combined with any recognized field. For write smokes, assert the FIELD VALUE CHANGED in the response — a 200 alone proves nothing. A milestone task must have a `due_date` (domain rule, enforced with a clear 400).
- **NEW: creators auto-follow.** Every entity you create auto-adds you as a follower; on a single-user account, `add_*_follower(self)` fails with "already following" unless you remove the auto-follow first.
- **Pipedrive v1 returns `{success:true,data:null}` (HTTP 200) for an EMPTY collection** — list handlers must coerce `data||[]`, never treat null as an error (#79).
- **A Pipedrive DEVELOPER SANDBOX is NOT Growth+ by default** (installments 403 + GROWTH upsell badge); verify plan entitlement before smoke-testing plan-gated features. Quick probe: `GET /api/v2/deals/installments?deal_ids=1` → 200 on Growth+, 403 below.
- **Path interpolation needs an allowlist** regex, NOT a `/`-only blocklist — `new URL()` normalizes `\`, `..`, `?`, `#` (#70 P1).
- **MERGE-GATE GOTCHA** (worktree-held branches only): `gh pr merge --squash` WITHOUT `--delete-branch`, then manual worktree/branch/remote cleanup. N/A for normal branches.
- **MERGE-DIVERGENCE GOTCHA**: never rebase a PR branch onto a local `main` that is ahead of `origin/main`; after squash-merge, `git reset --hard origin/main` if local diverged at the shared base.
- **Adding a param means editing THREE places:** the Zod schema, the hand-written `inputSchema` JSON literal (NOT generated from Zod), and the handler's query/body/path forward line.
- **`git checkout <ref> -- src/` does NOT delete files absent from `<ref>`** — for a complete revert-proof, `rm` new files explicitly first.
- **Verify LLM-facing tool-description text against the actual Zod INPUT schema**, not the API query key.
- **Auth reality (supersedes CLAUDE.md prose):** v2 uses the **`x-api-token` HEADER** (`src/client.ts` `applyAuth`); `api_token` query param is v1-only (though the live API tolerates it on v2 too).
- **`.env` is auto-loaded by anything importing `src/index.ts`** (`import "dotenv/config"`); scripts importing only `client.ts` do NOT get it — source `.env` in the shell for standalone probes. Live-write scripts must keep the `--confirm-sandbox` + masked-token-tail guard pattern.
- **Lint IS a CI gate** (`eslint src/`; test files NOT linted).
- **Zod 4.4.3** (NOT Zod 3): `z.email()`/`z.uuid()`, `z.record(z.string(), z.unknown())`, `.extend(...shape)`, `error.issues`; `.refine({path})` wants a MUTABLE `PropertyKey[]` (no `as const`).
- **`createListSummary` naively appends "s"** — assert summaries with `toContain`, not exact `toBe`.
- **False-green hazard:** `tsconfig` excludes tests (never type-checked) and per-entity tests call handlers DIRECTLY (bypass dispatcher Zod). Real guards = unit schema tests (`.strict()` REJECT tests) + integration wire-shape tests + `tests/contract/`.
- **Contract harness** (#75): `assertArrayBodyConformsToSpec` for top-level array bodies; `allOf`-merge in `requestBodyProps`. The body-shape check can't prove a narrower schema (Zod `.strict()`'s job). NOTE: contract tests do NOT cover task bodies; if they ever do, the vendored spec's `done`/`milestone` lines contradict the live API (#81) — patch or except them.
- **Test layout:** unit in `tests/unit/schemas/`, integration in `tests/integration/tools/`; `setupValidEnv()` sets `PIPEDRIVE_ENABLE_DESTRUCTIVE='true'` in `beforeEach` — "guard blocks" tests must `delete` it explicitly.
- **v1 sunset:** working horizon 2026-07-31 (partner-sourced); first-party 2025-12-31 covers only selected endpoints, NOT notes/mail/users/leads CRUD. See `docs/v1-only-capabilities.md`.

## Prior sessions (context only — all shipped & closed)

- **#79 + comprehensive smoke harness** → PR #80 (`536301b`). v1 empty-list `data:null` fix (mail + users) + 4 regression tests + `scripts/smoke-coverage.ts`. #60 `field_code` confirmed field_code-ONLY on the live wire.
- **#76 installments smoke** → PR #78. `scripts/smoke-installments.ts` (`npm run smoke:installments`); verified live on Growth trial 2026-06-11; comma-joined `deal_ids` resolves server-side.
- **#75 contract-harness coverage** → PR #77 (`f5bb9de`). 18 contract tests: Products params/bodies + #70 config-field writes.
- **Epic #51 (v1→v2 migration) CLOSED**: #42–#50, #60, #67 (PR #72), #68 (PR #73), #69 (PR #71), #70 (PR #74).
