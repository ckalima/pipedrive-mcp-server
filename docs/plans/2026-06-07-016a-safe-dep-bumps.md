# Plan: Issue #16 — PR A of 2 — Safe Dependency Bumps (everything EXCEPT Zod)

**Branch:** `agent/16a-safe-dep-bumps` (off `origin/main` @ da157dc)
**Scope:** The LOWER-RISK dependency bumps. **Zod stays at `^3.25.0`** (Zod 3→4 is a separate PR B — explicitly NOT in scope here).
**Baseline:** GREEN — `npm run build` clean; `npm test` = **769 passing across 32 files**; `npm run lint` clean.

---

## 0. Headline finding (read first)

**Vitest 4 dropped Node 18.** `vitest@4.1.8` declares `engines.node = "^20.0.0 || ^22.0.0 || >=24.0.0"`. The repo's `package.json` `engines` is `node >=18.0.0` and **CI runs the matrix `[18, 20, 22]`**. This is the single biggest risk in this PR. See §7 (BLOCKER) for the required CI/engines decision — it must be resolved before this PR can go green. Everything else (TypeScript 6, MCP SDK, dotenv, @types/node) is low-to-moderate risk and self-contained.

---

## 1. Exact final `package.json` dependency lines

```jsonc
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.29.0",
  "dotenv": "^17.4.2",
  "zod": "^3.25.0"                          // UNCHANGED — Zod 4 is PR B
},
"devDependencies": {
  "@types/node": "^22.19.20",              // was ^20 — see decision §5
  "@vitest/coverage-v8": "^4.1.8",         // lockstep with vitest
  "eslint": "^9.39.4",                      // UNCHANGED
  "tsx": "^4.0.0",                          // UNCHANGED
  "typescript": "^6.0.3",                   // was ^5
  "typescript-eslint": "^8.60.1",          // was ^8.59.2 — minor bump, see §5
  "vitest": "^4.1.8"                        // was ^1
}
```

(Note: the current file pins these as `^1.0.0`/`^5.0.0`/`^20.0.0` ranges with newer versions installed. We pin to the explicit target floors above so the intent is unambiguous and the lockfile resolves deterministically.)

### Decisions returned to orchestrator
- **`@types/node` → `^22.19.20` (latest 22.x).** Rationale: CI ceiling is Node 22; 22.x typings are a safe superset for the Node 18 runtime floor and do NOT expose Node-25-only APIs (which is exactly the compile-valid/runtime-broken hazard the issue warns about). Do NOT use 25. (20.x would also be safe but 22 matches the CI ceiling and is the conventional "track your highest supported runtime" choice.)
- **`typescript-eslint` → `^8.60.1`.** CONFIRMED from npm: `typescript-eslint@8.60.1` peer is `typescript: ">=4.8.4 <6.1.0"` — **TS 6.0.3 IS supported by the v8 line.** No major bump to a v9/v10 prerelease is required. We are NOT forced to move, but bumping `8.59.2 → 8.60.1` is the minimal prudent step to stay on the latest patched v8 with TS6 in its supported window. eslint stays `^9.39.4` (peer `^8.57.0 || ^9.0.0 || ^10.0.0` — satisfied).

---

## 2. Bump order (risk-ascending) and install commands

Order, low → high risk: **dotenv → MCP SDK → @types/node → typescript(+typescript-eslint) → vitest(+coverage-v8)**.

**Recommendation: ONE combined install.** This repo intentionally commits `package-lock.json` for this issue, and a single resolution avoids intermediate lockfile churn / partial-upgrade states. Run from the worktree root:

```bash
npm install \
  @modelcontextprotocol/sdk@^1.29.0 \
  dotenv@^17.4.2 \
  --save-exact=false

npm install --save-dev \
  @types/node@^22.19.20 \
  typescript@^6.0.3 \
  typescript-eslint@^8.60.1 \
  vitest@^4.1.8 \
  @vitest/coverage-v8@^4.1.8 \
  --save-exact=false
```

(Two `npm install` lines only to separate prod vs dev `--save`/`--save-dev`; functionally one combined resolution. A single `npm install` after hand-editing `package.json` to the §1 lines is equally acceptable and produces the same lockfile.) **`npm install` WILL rewrite `package-lock.json` — that is intentional and in scope** (the PR denylist has an EXCEPTION for `package.json`/`package-lock.json` for issue #16). If a key bump turns out to be a blocker (Vitest/Node 18, §7), fall back to the **staged** approach: install everything except vitest/coverage-v8 first, prove green, then handle vitest separately so the diff for the risky piece is isolated.

---

## 3. Per-dependency expected changes

### 3a. dotenv 17.2.3 → 17.4.2 — **CONFIRMED trivial**
- Patch/minor within 17.x. `engines.node >=12`. The only usage is `import "dotenv/config";` in `src/index.ts:16`.
- **Expected code/config edits: NONE.** (One TS6 interaction with this import is covered in 3d.)

### 3b. MCP SDK 1.25.3 → 1.29.0 — **CONFIRMED safe** (verified changelogs v1.26→v1.29)
- The repo uses `Server` (`@modelcontextprotocol/sdk/server/index.js`), `StdioServerTransport` (`server/stdio.js`), `server.setRequestHandler`, and `CallToolRequestSchema` / `ListToolsRequestSchema` (`types.js`).
- Changelogs for 1.26–1.29 are **security fixes, OAuth/auth backports, task-streaming additions, and type-export additions** — no signature or import-path changes to any of the four surfaces this repo touches. `engines.node = ">=18"` (safe).
- Notable non-breaking adds: v1.29 "Add typings exports" / "add missing types to package.json" (additive), v1.28 "reject plain JSON Schema objects passed as inputSchema" (this repo passes Zod-derived/`inputSchema` objects through tool definitions — LIKELY unaffected since tools are registered via `toolDefinitions`, but verify the tool list still serializes at runtime).
- **Expected code/config edits: NONE.** Mark the inputSchema note as **LIKELY** (verify `npm test` dispatcher/list-tools paths still pass).

### 3c. @types/node ^20 → ^22 — **LIKELY trivial**
- 22.x is a superset of 20.x for the APIs in use (`process`, `setTimeout`, global `fetch`, `node:fs` `realpathSync`, `node:url` `pathToFileURL`/`URL`, `URLSearchParams`). No removals affect this code.
- **Expected code edits: NONE.** Any surprise would surface as a `tsc` error and be fixed minimally.

### 3d. TypeScript 5.9.3 → 6.0.3 — **moderate; tsconfig edit CONFIRMED required**

TS 6.0 default changes that matter here (verified against the official TS 6.0 announcement & handbook):

1. **`types` now defaults to `[]`** (was: auto-enumerate `node_modules/@types`). **CONFIRMED.** This repo's `tsconfig.json` has **no `types` key**, and `src/` relies on `@types/node` **global** ambient types: `process.*` (config.ts, errors.ts, index.ts), `setTimeout` (leads.ts), global `fetch` (client.ts). Under TS6 these become `Cannot find name 'process'` / `'fetch'` / `'setTimeout'` errors unless we opt in.
   - **REQUIRED EDIT — `tsconfig.json` `compilerOptions`:**
     ```jsonc
     // ADD:
     "types": ["node"],
     ```
   - **Before:** (no `types` key) → **After:** `"types": ["node"]`. This is the one near-certain code/config change in this whole PR.

2. **`rootDir` default → `.`** — **already mitigated.** tsconfig already sets `"rootDir": "./src"` explicitly. **No edit needed.**

3. **`lib`/`target` floating default → es2025** — **does NOT apply.** tsconfig pins `"target": "ES2022"` explicitly, which also fixes the default `lib`. **No edit needed.**

4. **`esModuleInterop`/`allowSyntheticDefaultImports` can no longer be `false`** — **N/A.** Repo sets `esModuleInterop: true`. **No edit needed.**

5. **`noUncheckedSideEffectImports` now `true` by default** — **LIKELY safe, watch one spot.** The only side-effect import is `import "dotenv/config";` (src/index.ts:16). Unlike a CSS import, `dotenv/config` resolves to a **real module that ships type declarations**, so TS6 should resolve it and NOT error. **LIKELY no edit.** *Contingency if it errors at implement-time:* add `"noUncheckedSideEffectImports": false` to `tsconfig.json` (preferred minimal fix) — do NOT rewrite the import.

6. **"strict by default" / sloppy-mode reserved-word changes** — **N/A.** Repo is already `strict: true`; no use of `await`/`static`/`private`/`public` as plain identifiers.

7. **`moduleResolution: classic` / `--outFile` removed; `node10` deprecated** — **N/A.** Repo uses `NodeNext`.

- **typescript-eslint interaction:** lint runs separately (`npm run lint` → `eslint src/` with flat config `tseslint.configs.recommended`). With `typescript-eslint@^8.60.1` (peer allows TS `<6.1.0`), lint stays green. If left at 8.59.2, npm may emit a peer-range warning but 8.59.2's peer was also `<6.1.0` so it still functions; we bump to 8.60.1 to be clean. **No eslint.config.js edit expected.**

  **Mark §3d item 1 (`types: ["node"]`) as CONFIRMED-required. Items 5 as LIKELY. All others N/A.**

### 3e. Vitest 1.6.1 → 4.1.8 (+ @vitest/coverage-v8 4.1.8) — **highest risk; crosses v2/v3/v4**

`@vitest/coverage-v8` MUST move in **exact lockstep** (its peer is `vitest: "4.1.8"` — exact pin). Verified.

Config keys in this repo's `vitest.config.ts` and their v4 status (verified against the official migration guide):

| Key in repo | v4 status | Action |
|---|---|---|
| `globals: true` | unchanged | none |
| `environment: 'node'` | unchanged | none |
| `setupFiles: ['./tests/setup.ts']` | unchanged | none |
| `include: ['tests/**/*.test.ts']` | unchanged | none |
| `exclude: ['node_modules','dist']` | **default exclude list shrank** in v4 (now only `node_modules`/`.git`); but this repo sets `exclude` **explicitly** AND `include` is a tight allowlist, so behavior is pinned. **none** | none |
| `coverage.provider: 'v8'` | unchanged (engine internally rewritten to AST-based remapping) | none — but see coverage-number note |
| `coverage.reporter: ['text','json','html']` | unchanged | none |
| `coverage.include: ['src/**/*.ts']` | **now REQUIRED in v4** (v4 removed `coverage.all`; you must define `include`). Repo **already sets it.** | none |
| `coverage.exclude: [...]` | unchanged shape | none |
| `coverage.thresholds.{lines,functions,branches,statements}` | **shape unchanged** (the `thresholds` object form is current; the legacy flat `coverage.lines` form is what was removed long ago — repo already uses the nested form) | none |
| `testTimeout: 10000` | unchanged | none |
| `hookTimeout: 10000` | unchanged | none |

`vi.*` API audit (what the suite actually uses): `vi.unstubAllGlobals` (×35), `vi.stubGlobal` (×3), `vi.fn` (×3), `vi.mock` (×2, incl. `importOriginal` in dispatcher.test.ts), `vi.spyOn` (×1), `vi.mocked` (×1), `vi.clearAllMocks` (×1), `vi.restoreAllMocks` (×1). Mock-return helpers: `.mockResolvedValue` (×1), `.mockImplementation` (×1).
- All of these remain present in v4. **One behavior change to watch (LIKELY-safe here):** v4 `vi.restoreAllMocks` "now only restores **manual spies**, not automocks." The repo's `tests/setup.ts` calls `vi.restoreAllMocks()` in `afterEach`, but the suite's globals are managed via `vi.stubGlobal`/`vi.unstubAllGlobals` (each suite calls `vi.unstubAllGlobals()` in its own `beforeEach`), and the lone `vi.spyOn` is a manual spy — so the restore-semantics change should not affect results. **LIKELY no edit.**
- `vi.mock(..., async (importOriginal) => { const actual = await importOriginal<...>(); ... })` in `dispatcher.test.ts` — the `importOriginal` factory pattern is **still supported** in v4. **LIKELY no edit.**
- `tests/setup.ts` patterns (`beforeEach`/`afterEach`/`vi.clearAllMocks`) — unchanged. **none.**

**Coverage NUMBERS may shift:** v4's V8 provider uses new AST-based remapping, so reported line/branch/function/statement percentages can change vs v1. The default `npm test` is `vitest run` (NO coverage), so the **769-test count is unaffected**. Coverage thresholds only gate `npm run test:coverage` / `test:ci`, which **CI does not run** (CI runs `npm test`). So a coverage% drift will NOT fail CI for this PR. *Flag for verify gate:* if anyone runs `test:coverage` locally, branches (threshold 65) is the most likely to wobble; do NOT lower thresholds in this PR unless a real regression is proven — that would be an out-of-scope change.

- **Expected config edits to `vitest.config.ts`: NONE predicted (CONFIRMED for every key the repo sets).** Marked LIKELY-no-change for the `vi.restoreAllMocks`/`importOriginal` behavior items; the implement stage proves it by running `npm test`.

---

## 4. Implement-stage discovery loop (allowed)

The implement stage **MAY run `npm run build` and `npm test` iteratively** to discover real breakages after the install, and `npm run lint` to confirm the typescript-eslint/TS6 interaction. Use that loop to confirm/deny the LIKELY items above. **Keep the final diff minimal:** make ONLY the edits the bumps actually force (predicted: `package.json`, `package-lock.json`, and `tsconfig.json` `types: ["node"]`). **No opportunistic refactors, no reformatting, no threshold tweaks, no unrelated lint fixes.** If an unpredicted error appears, apply the smallest change that resolves it and note it in the PR description.

---

## 5. Verification (the gate)

1. `npm run build` → must be clean (`tsc` exit 0). Watch for TS6 `Cannot find name 'process'/'fetch'` (→ confirms `types: ["node"]` needed) and any `dotenv/config` side-effect-import error (→ `noUncheckedSideEffectImports: false` contingency).
2. `npm test` (`vitest run`, no coverage) → expect **769 passing / 32 files, unchanged**. The intentional `console.error` stderr lines in the error-path tests are expected noise, not failures. **If the count changes, that is a real signal — investigate before proceeding; do not rubber-stamp.**
3. `npm run lint` (`eslint src/`) → clean. typescript-eslint 8.60.1 supports TS 6.0.3 (peer `<6.1.0`), so no lint breakage expected.
4. **Node-version sanity (BLOCKER check, §7):** with vitest 4 requiring Node ≥20, confirm the local dev runtime is ≥20 (this worktree is on Node v23.6.0 → fine) AND resolve the CI Node-18 matrix question before merge.
5. Optional: `npm run test:coverage` only to eyeball drift — informational, not a gate for this PR.

---

## 6. Footprint & risk note (files expected to change)

| File | Change | Confidence |
|---|---|---|
| `package.json` | dependency version lines per §1 | CONFIRMED |
| `package-lock.json` | rewritten by `npm install` (intentional; denylist exception applies) | CONFIRMED |
| `tsconfig.json` | add `"types": ["node"]` | CONFIRMED (TS6 `types: []` default) |
| `tsconfig.json` | possibly add `"noUncheckedSideEffectImports": false` | CONTINGENCY (only if `dotenv/config` errors) |
| `vitest.config.ts` | none predicted | (would be LIKELY if any vitest key surprises) |
| `src/**` / `tests/**` | none predicted | (only if `tsc`/`vitest` surface a real break) |
| `.github/workflows/ci.yml` | see §7 — may need Node-matrix decision | DECISION REQUIRED, see §7 |

`node_modules/` stays **untracked** (confirmed gitignored). The committed `package-lock.json` is expected to change and IS in scope for this issue.

---

## 7. BLOCKER to surface at review: Vitest 4 vs CI Node 18

- **Fact:** `vitest@4.1.8` engines = `^20.0.0 || ^22.0.0 || >=24.0.0`. CI matrix = `[18, 20, 22]`, repo `engines.node = ">=18.0.0"`.
- **Consequence:** On the **Node 18** CI leg, `npm ci` will emit `EBADENGINE` warnings for vitest/coverage-v8 (npm engines are advisory unless `engine-strict`, so install itself likely still completes), but **Vitest 4 may use Node ≥20 runtime APIs at test time**, so `npm test` on Node 18 is at real risk of crashing. This is a genuine cross-cutting decision, not a code fix.
- **Options (pick at review; OUT OF SCOPE to implement silently here):**
  1. **Drop Node 18 from the CI matrix** (`[20, 22]`) and bump `package.json` `engines.node` to `">=20.0.0"`. Cleanest; aligns the project's support floor with its own dev tooling. This is an editorial/policy change beyond a pure dep bump and should be called out explicitly in the PR.
  2. **Keep Node 18 support** → then **Vitest 4 is not viable**; the safe ceiling is **Vitest 3.2.6** (`dist-tag V3`), which still supports Node 18. The issue text says the user "chose latest 4.x, NOT 3.x," so this option contradicts the stated target and should only be taken if the team decides to keep an 18 floor.
- **Recommendation:** Go with Option 1 (drop 18, set `engines.node >=20`) to honor the "latest 4.x" choice, and flag the CI/engines edit prominently in the PR body so the reviewer ratifies the support-floor change. If the reviewer wants to keep Node 18, fall back to Vitest 3.2.6 and re-pin `@vitest/coverage-v8@^3.2.6`.

---

## Appendix — authoritative version facts gathered (npm registry / official docs, June 2026)
- `vitest@4.1.8` engines `^20.0.0 || ^22.0.0 || >=24.0.0`; dist-tags latest=4.1.8, V3=3.2.6.
- `@vitest/coverage-v8@4.1.8` peer `vitest: "4.1.8"` (exact lockstep).
- `typescript` dist-tag latest=6.0.3.
- `typescript-eslint@8.60.1` peer `typescript: ">=4.8.4 <6.1.0"`, `eslint: "^8.57.0 || ^9.0.0 || ^10.0.0"` → TS6 + eslint9 OK.
- `@modelcontextprotocol/sdk@1.29.0` engines `>=18`; no API-surface breaking changes 1.26→1.29 to Server/StdioServerTransport/setRequestHandler/types.js schemas.
- `dotenv@17.4.2` engines `>=12`.
- `@types/node` latest 22.x = 22.19.20.
- TS 6.0 confirmed defaults: `types` → `[]`; `rootDir` → `.`; floating `lib`/`target` → es2025; `noUncheckedSideEffectImports` → true; `esModuleInterop`/`allowSyntheticDefaultImports` can't be false; `moduleResolution: classic` & `--outFile` removed; `node10` deprecated.
