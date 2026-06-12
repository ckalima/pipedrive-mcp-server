# Plan: Generate README tool table + MCPB manifest from `allTools`, with CI drift check (#85)

Part of EPIC #83 (P0 sprint). Status: planning only — no implementation in this branch.

## 1. Problem & context

The docs misrepresent the product. Measured against the live source tree:

- **`allTools` contains exactly 155 tools** (verified: `node` count over `src/tools/*.ts` `name: "pipedrive_..."` literals = 155 unique). The "155" claim in the issue is accurate.
- **README documents 28 tools** in its `## Available Tools` section (`README.md:56-107`) — not the "13" the issue cites, but still only ~18% of the surface, and several listed tools are mislabeled by tier.
- **`bundle/manifest.json` lists 43 tools** (`bundle/manifest.json:36-80`) — ~28% of the surface.
- The README **API-version table is stale** (`README.md:173-179`): it says Fields, Pipelines, Stages are v1. In the current code these entities are split — pipelines/stages/users/mail/notes/leads are v1, but several field and other operations now run v2 — and the table needs to be reconciled to reality (see Open Questions for the exact per-entity verification step).
- **`PIPEDRIVE_ENABLE_DESTRUCTIVE` is undocumented** in the README despite gating 31 tools.
- **Build artifacts are committed**: `bundle/` is 107 tracked files / 956K of compiled `.js`/`.d.ts`/`.map` output plus `manifest.json`; the repo root also tracks `pipedrive-mcp-1.0.0.mcpb` (3.3M). Both are stale (43 of 155 tools) and actively mislead evaluators who inspect the bundle.

Root cause: the tool surface is the product's main asset, but every doc that lists tools is hand-maintained and drifts the moment a tool is added. The 155-tool count grew via the U1–U5 / EPIC-#83 expansions while docs stayed frozen.

**The fix**: a generator that derives both the README tool table and the MCPB `manifest.json` tool list from the single live `allTools` array, wired to `npm run gen:docs`, with a CI step that regenerates and fails on `git diff`. Untrack the compiled bundle + root `.mcpb` and rebuild the `.mcpb` from the regenerated manifest on release.

### Ground-truth facts the generator depends on

**Tool shape** (`src/tools/index.ts:24-56`, sample `src/tools/deals.ts:922-1415`): each entry is `{ name, description, inputSchema, handler, schema }`. `name` is `pipedrive_<verb>_<entity>`; `description` is a plain string; `inputSchema` is a hand-written JSON-Schema literal (`type: "object"`, `properties`, `required`). **There is no `destructive`, `entity`, or `plan` field on the tool object today.**

**Destructive is encoded in the handler body, not the tool def.** Every gated handler calls `destructiveOperationGuard()` (`src/utils/errors.ts:89-104`) as its **first statement, before `getClient()`** (verified for `deleteDeal`, `deleteTask`, `deleteProductImage`). A precise per-function scan (`/tmp/findguards.mjs`) finds **exactly 31 guarded handlers**:

```
convertDealToLead, deleteActivity, deleteBoard, deleteDeal, deleteDealDiscount,
deleteDealField, deleteDealFieldOptions, deleteDealFollower, deleteDealInstallment,
deleteDealProduct, deleteLead, deleteNote, deleteOrganization, deleteOrganizationField,
deleteOrganizationFieldOptions, deleteOrganizationFollower, deletePerson, deletePersonField,
deletePersonFieldOptions, deletePersonFollower, deletePhase, deletePipeline, deleteProduct,
deleteProductField, deleteProductFieldOptions, deleteProductFollower, deleteProductImage,
deleteProductVariation, deleteProject, deleteStage, deleteTask
```

**A name-prefix heuristic is WRONG.** 32 tools match a `delete_`/`convert_`/`archive_` name prefix, but `pipedrive_convert_lead_to_deal` and `pipedrive_archive_project` are **not** guarded, while `pipedrive_convert_deal_to_lead` **is** (it deletes the source deal). So "destructive" cannot be derived from the name and must not be a hand-maintained second list — it has to be tied to the guard itself.

**Plan-gated (Growth+)** is reliably present as the literal substring `Growth+` in the four installment tool descriptions (`pipedrive_list/add/update/delete_deal_installment`, `src/tools/deals.ts:1297-1347`). This is keyable directly from the def's `description` string.

**Entity grouping**: 14 source files, but `boards.ts` exports **both** `boardTools` and `phaseTools`, so grouping by source file conflates boards+phases. Tool counts per source file: deals 26, fields 26, products 18, projects 13, persons 11, organizations 10, boards(+phases) 10, leads 9, pipelines 9, activities 5, notes 5, tasks 5, mail 5, users 3 = 155.

**Module system**: ESM, `tsconfig` `module: NodeNext` (`tsconfig.json`). Scripts run via `tsx` and import from source with `.js` suffixes (`scripts/smoke-coverage.ts:3` imports `../src/index.js`; `scripts/measure-tools.ts:1` imports `../src/tools/index.js`). The generator follows the same pattern.

**MCPB bundle**: `bundle/` = `manifest.json` (`manifest_version: "0.3"`) + `server/` (compiled `dist`-equivalent JS + a 381-byte `package.json` + a 39.7K `package-lock.json`). There is **no `.mcpb` build script** in `package.json` and **no `mcpb` packer in the lockfile**; `npm view mcpb` 404s (the official packer is `@anthropic-ai/mcpb`, unconfirmed here — see Open Questions). The root `pipedrive-mcp-1.0.0.mcpb` is a committed zip of that bundle.

**CI**: single workflow `.github/workflows/ci.yml` (33 lines), one `ci` job, Node matrix `[20, 22]`, steps `npm ci → build → lint → test`. (Matches the branch-protection required checks `ci(20)`/`ci(22)` per project memory.)

## 2. Goals / non-goals

### Goals
- One generator (`scripts/gen-docs.ts`, run via `tsx`) is the single producer of (a) the README tool table and (b) the `manifest.json` `tools` array, both derived from `allTools`.
- README and manifest list **all 155 tools**, with destructive tools marked and Growth+ tools noted.
- CI regenerates and fails (`git diff --exit-code`) if a tool is added/renamed/removed without regenerating.
- README gains `PIPEDRIVE_ENABLE_DESTRUCTIVE` docs and a corrected API-version table.
- `bundle/` and the root `.mcpb` are untracked and gitignored, landing **in the same change** as the working generator + `.mcpb` build path, so an installable bundle always exists.

### Non-goals (owned by #84 or out of scope)
- The package **rename** to `@ckalima/pipedrive-mcp-server` and any npm-publish auth/provenance — #84 owns this. The generator must **read** the package name from `package.json` (not hardcode `pipedrive-mcp`/`pipedrive-mcp-server`) so it is correct whichever order the two issues merge.
- The GitHub **release workflow** itself (tag-triggered publish/release-create) — #84 owns the workflow; this plan only contributes the `.mcpb` **build command** it consumes and decides where the **attach** step lives (see §5).
- Refactoring tool handlers, schemas, or adding new tools.
- Per-tool input-schema documentation in the README (the table is name + description + markers only; full schemas stay in-code and in the manifest scope decision below).

## 3. Decisions

### D1 — Single source of truth: derive everything from `allTools`, detect destructive via the guard
The generator imports `allTools` from `../src/tools/index.js` and emits from it. For the three markers:

- **Destructive**: do **not** maintain a second list and do **not** use name prefixes. Detect by **probing the guard**: in the generator, ensure `process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE` is unset/not `"true"`, then call each `tool.handler({})` and treat the tool as destructive iff the result is the `DESTRUCTIVE_DISABLED` guard response. This is safe and offline because `destructiveOperationGuard()` returns **before** `getClient()` / any network call (verified). Detection key: `result.isError === true` **and** the text contains `DESTRUCTIVE_DISABLED` (match the error code from `src/utils/errors.ts:97`, not prose). This ties the doc marker to the exact runtime behavior — they cannot drift.
  - *Robustness note*: a non-destructive handler called with `{}` would instead try to run (and could throw on a missing client/env). The generator must `try/await` each probe and, on **anything other than** the `DESTRUCTIVE_DISABLED` result (thrown error, validation error, or a normal-looking result), classify the tool as **non-destructive** without performing network I/O. To guarantee no real API call leaks out, run the probe with `PIPEDRIVE_API_KEY` **unset** so `getClient()` itself fails fast if a non-guarded handler is reached. (Confirm `getClient()` throws synchronously on missing key — see Open Questions; if it does not, gate probing behind a stubbed `fetch` that throws.)
  - *Alternative considered (rejected for now)*: add an explicit `destructive: true` field to each guarded tool def and assert in a unit test that `(def.destructive === true) === handlerCallsGuard`. Cleaner to read but adds a 31-line hand-maintained surface and a second place to update per the project's "THREE places per param" pain. **Probing keeps it zero-maintenance.** Revisit if probing proves flaky.

- **Plan-gated (Growth+)**: mark a tool when its `description` contains the literal `Growth+`. Currently the 4 installment tools. Document this convention in `CONTRIBUTING.md` so new plan-gated tools keep the marker in their description.

- **Entity grouping**: derive an `entity` key from the tool name, not the source file (so boards/phases separate correctly and the grouping survives file moves). Use an explicit ordered map from name-substring → display group, e.g. Deals, Persons, Organizations, Activities, Notes, Leads, Projects, Products, Tasks, Boards & Phases, Mail, Fields, Pipelines & Stages, Users. Order is fixed in the generator (a `const GROUP_ORDER` array) to guarantee deterministic output. Within a group, preserve `allTools` order (which is already logical: list/get/create/update/search/delete/...).

### D2 — README ownership via sentinel markers
The generator owns **only** the region between HTML-comment sentinels and never touches the rest of the README:

```
<!-- BEGIN GENERATED TOOLS -->
... generated table(s) ...
<!-- END GENERATED TOOLS -->
```

These replace the current hand-written `## Available Tools` block (`README.md:56-107`). The generator reads the README, splices the region between the markers, and writes back — failing loudly if the markers are absent. The `PIPEDRIVE_ENABLE_DESTRUCTIVE` docs and the API-version table fix are **one-time manual edits** (outside the markers), not generated, because they are prose, not tool-derived. A short generated legend line (e.g. "🔒 = destructive, gated by `PIPEDRIVE_ENABLE_DESTRUCTIVE`; ⭑ = Growth+ plan") goes **inside** the markers so it stays consistent with the markers used in the table.

### D3 — `.mcpb` build + attach ownership (the #84 seam)
- **This issue (#85) owns**: the generator emits `bundle/manifest.json`, and adds a `bundle:mcpb` build command that compiles `src` into `bundle/server/` and packs `bundle/` into a `.mcpb`. The drift check covers `manifest.json`.
- **#84 owns**: the tag-triggered release workflow that calls `npm run bundle:mcpb` and **attaches** the resulting `.mcpb` to the GitHub Release. The seam: #85 delivers the build command + manifest as a dependency; #84 wires the attach. Document this explicitly in both issues. If #84 lands first, its release workflow references `npm run bundle:mcpb`, which #85 must provide; if #85 lands first, the command exists and #84 just calls it. To de-risk ordering, **#85 adds the `bundle:mcpb` script and a minimal CI build-validation step** (build the `.mcpb` in CI on PRs to prove it packs, without attaching), so the command is proven independent of #84.
- The manifest's `name` field (`bundle/manifest.json:3`, currently `pipedrive-mcp`) and `version` (`:5`) must be **sourced from `package.json`** by the generator, not hardcoded, so #84's rename flows through automatically. (MCPB `name` need not equal the npm name, but sourcing it from one place removes the second drift point; confirm MCPB name constraints — see Open Questions.)

### D4 — Ignore-then-generate ordering (no missing bundle)
Untracking `bundle/` and the root `.mcpb` **must land in the same PR** as the working generator and `bundle:mcpb` command. Sequence inside the implementation PR: (1) add generator + `bundle:mcpb` + CI build-validation, prove it produces a valid `.mcpb` locally and in CI; (2) `git rm -r --cached bundle/ pipedrive-mcp-1.0.0.mcpb`; (3) add both to `.gitignore`. Never untrack before the generator works, or there is a window with no installable artifact. The `manifest.json` is the one bundle file whose **content** the drift check guards; the compiled `server/` is rebuilt, not diffed.

### D5 — Drift-check scope
The CI drift gate runs `npm run gen:docs` then `git diff --exit-code -- README.md bundle/manifest.json`. It does **not** diff `bundle/server/**` (build output, now gitignored) — only the two generated, tracked text artifacts. Generator output must be **byte-deterministic** (fixed group order, fixed within-group order from `allTools`, stable JSON formatting matching the existing 2-space manifest style, trailing newline) so CI never flags spurious drift.

## 4. File-by-file change list

### NEW: `scripts/gen-docs.ts` (run via `tsx`)
- **Imports**: `allTools` from `../src/tools/index.js`; `readFileSync`/`writeFileSync`; package metadata from `../package.json` (name, version, description, author, repository, license) via `resolveJsonModule` or a read+parse.
- **Inputs**: the live `allTools` array; existing `README.md` (for marker splice); existing `bundle/manifest.json` non-tool fields (preserve `manifest_version`, `server`, `user_config`, `keywords`); `package.json`.
- **Core steps**:
  1. **Classify** each tool → `{ name, description, group, destructive: boolean, growthPlus: boolean }`. `destructive` via the guard-probe (D1); `growthPlus` via `description.includes("Growth+")`; `group` via the name→group map (D2).
  2. **Sanity assert**: `allTools.length === <generated rows>` and the probe found a plausible destructive count (e.g. fail if 0 destructive found — implies the probe broke). Print the totals.
  3. **Emit README region**: a legend line + one Markdown table per group (`| Tool | Description |`, destructive rows marked 🔒, Growth+ rows marked ⭑). Splice between `<!-- BEGIN GENERATED TOOLS -->` / `<!-- END GENERATED TOOLS -->`; error if markers missing.
  4. **Emit manifest**: rebuild the `tools` array as `{ name, description }` per tool (the MCPB 0.3 `tools` entries in the current file are name+description only — `bundle/manifest.json:37`). Set `name`/`version`/`description` from `package.json`. Preserve all other manifest fields verbatim. Write with 2-space indent + trailing newline to match the current file exactly (so the first regen produces zero diff except the added tools).
- **Outputs**: rewritten `README.md` (markers region only) and `bundle/manifest.json`.
- **Determinism**: no `Date.now()`, no map/object iteration without explicit ordering, sort nothing implicitly — rely on `allTools` order within groups and the fixed `GROUP_ORDER`.
- **Decision to confirm**: whether the manifest `tools` descriptions should be the **full** in-code descriptions (long, e.g. the conversion-status tool's multi-sentence string at `deals.ts:1403`) or a **truncated** first sentence. The current manifest uses short hand-written blurbs ("List and filter deals"); switching to full descriptions changes every row. **Recommendation**: emit the full in-code `description` (single source of truth; the hand-written blurbs are exactly the kind of second copy that drifts). Note in the PR that this enlarges the manifest.

### `package.json` (`scripts` block, `package.json:10-22`)
- Add `"gen:docs": "tsx scripts/gen-docs.ts"`.
- Add `"bundle:mcpb": "<build server/ + pack .mcpb>"` (D3). Exact packer TBD (see Open Questions); likely `tsc`-to-`bundle/server` + `@anthropic-ai/mcpb pack` or a zip step. Keep `gen:docs` and `bundle:mcpb` separate (docs drift check must not require packing a zip).
- Consider a `"gen:docs:check"` convenience that runs gen then `git diff --exit-code` for local use.

### `README.md`
- Replace the hand-written tool block (`README.md:56-107`) with the `<!-- BEGIN GENERATED TOOLS -->`…`<!-- END GENERATED TOOLS -->` sentinels (generator fills them).
- **Add `PIPEDRIVE_ENABLE_DESTRUCTIVE` docs** (one-time manual, near the config section `README.md:24-44`): explain it defaults to disabled, gates the 31 destructive tools, and how to enable. Reference the legend symbol used in the generated table.
- **Fix the API-version table** (`README.md:173-179`): reconcile to actual per-entity routing in the code (the current "v1: Mail, Fields, Pipelines, Stages, Users" line is wrong for fields). Do this as a manual edit after a per-entity `client.get(..., "v1"|"v2")` audit (Open Questions Q4). Keep it outside the markers.
- Optionally update the install snippet's package name — **but defer the rename to #84** to avoid a merge conflict; if #85 lands first, leave `pipedrive-mcp-server` and let #84 change it.

### `.github/workflows/ci.yml`
- Add a drift step to the existing `ci` job after `npm run build` (so `tsx` deps and a compiled tree are available), e.g.:
  ```yaml
  - run: npm run gen:docs
  - run: git diff --exit-code -- README.md bundle/manifest.json
  ```
  Failure message should hint "run `npm run gen:docs` and commit". Runs on both Node 20 and 22 (harmless; could be pinned to one matrix leg via `if` to save time — optional).
- Add a **`.mcpb` build-validation** step (D3) that runs `npm run bundle:mcpb` to prove the bundle packs on PRs (no attach). Keep attach in #84's release workflow.

### `.gitignore`
- Append `bundle/server/` (and `*.mcpb`) — but **keep `bundle/manifest.json` tracked** (it is a generated, drift-checked text artifact). So ignore `bundle/server/` and the root `*.mcpb`, NOT all of `bundle/`. (Re-scope the issue's "untrack `bundle/`" to "untrack the compiled `bundle/server/` + root `.mcpb`, keep the generated manifest tracked".)
- `git rm -r --cached bundle/server/ pipedrive-mcp-1.0.0.mcpb` in the same PR (D4). This drops 106 of the 107 tracked bundle files (everything under `server/`) plus the root artifact, while `bundle/manifest.json` stays tracked and generated.

### `CONTRIBUTING.md`
- Add a short "Updating docs" note: after adding/renaming a tool, run `npm run gen:docs` and commit; mark plan-gated tools by including `Growth+` in the description; destructive tools are detected automatically via the guard.

## 5. Sequencing & cross-issue coordination

1. **Untrack-with-generator (hard constraint, D4)**: the `git rm --cached` for the bundle and the `.mcpb` build command land in the **same PR** as the working generator. Order within the PR: generator+command proven (locally + CI build-validation) → `git rm --cached` → `.gitignore`.
2. **#84 release-attach seam (D3)**: #85 ships `npm run bundle:mcpb` + `bundle/manifest.json`; #84's release workflow calls it and attaches the `.mcpb` to the GitHub Release. Whichever merges second must not redefine the script/manifest the other relies on. Recommend #84's release workflow `run: npm run bundle:mcpb` exactly.
3. **README overlap with #84**: #85 owns the tool-table region (sentinels) + `PIPEDRIVE_ENABLE_DESTRUCTIVE` + version-table fix; #84 owns the install snippet **package name**. These are disjoint line regions (#85: 56-107 + 24-44 config + 173-179; #84: the `npx -y pipedrive-mcp-server` arg at `README.md:31`). To minimize conflict, #85 leaves the install snippet's package name untouched. Sequencing: land whichever is ready; rebase the second on the first. The only true coupling is the **package name**, which #85 reads from `package.json` (so the manifest auto-tracks #84's rename) and does not write into the install snippet.
4. **CI workflow overlap**: #85 adds steps to `ci.yml`; #84 adds a **new** `release.yml` (per its scope). Different files → low conflict. If #84 also edits `ci.yml`, sequence so both step-sets are additive.

## 6. Test / verification plan

- **"All 155 listed" (manifest)**: a unit test (`tests/unit/gen-docs.test.ts`, vitest) that imports `allTools` and the generator's classification function and asserts `classified.length === allTools.length === 155`, every `tool.name` appears in the generated manifest `tools` array, and the generated README region contains every `tool.name`. This catches a generator that silently drops tools.
- **Destructive classification correctness**: assert the probe-derived destructive set equals the known 31 (snapshot the sorted list in the test). This pins the guard→marker mapping and catches a future tool that adds/removes a guard. Also assert `convert_lead_to_deal` and `archive_project` are **not** marked (regression guard against the name-prefix trap).
- **Growth+ classification**: assert exactly the 4 installment tools are marked.
- **Determinism**: run the generator twice in the test and assert identical output (no nondeterministic ordering).
- **"CI red on drift" (end-to-end)**: manual/CI proof — add a throwaway tool to a tool file (or rename one), run `npm run gen:docs`, observe `git diff` is non-empty, then `git diff --exit-code` exits non-zero. Conversely, after committing the regen, the check is green. Document this in the PR description; optionally encode a lightweight version as a test that mutates an in-memory copy of `allTools` and asserts the generated output changes.
- **Manifest validity**: validate the emitted `manifest.json` parses as JSON and (if a schema is available) against MCPB `manifest_version 0.3`. At minimum assert required top-level fields (`manifest_version`, `name`, `version`, `server`, `tools`) are present and `tools` is non-empty.
- **`.mcpb` packs**: CI build-validation step (`npm run bundle:mcpb`) must exit 0 and produce a non-empty `.mcpb`.
- **Regression on existing suite**: `npm test` (1,698 tests) stays green; `npm run build` + `npm run lint` pass (the generator is `tsx`-run, excluded from `tsc` `src` build via `tsconfig` `include: ["src/**/*"]`, but should still typecheck cleanly under tsx).

## 7. Risks & mitigations

- **Generator nondeterminism → false CI drift**: fixed `GROUP_ORDER`, preserve `allTools` order within groups, stable JSON (2-space + trailing newline matching the current manifest byte-for-byte), no timestamps. Determinism test (§6).
- **Guard-probe leaks a real API call**: mitigated because the guard returns before `getClient()`; additionally run the probe with `PIPEDRIVE_API_KEY` **unset** (and optionally a throwing `fetch` stub) so any non-guarded handler reached during probing fails fast offline rather than hitting Pipedrive. Confirm `getClient()` throws synchronously on missing key (Q1).
- **Probe misclassifies if a future handler does work before the guard**: the convention is "guard first." Add a lint/test note in `CONTRIBUTING.md`; the destructive-set snapshot test (§6) catches drift either way.
- **Marker drift / missing markers**: generator hard-fails if `<!-- BEGIN/END GENERATED TOOLS -->` are absent, so a hand-edit that deletes them breaks the build loudly rather than silently.
- **Untracking before the generator works → no installable bundle**: enforced by D4 (same PR, generator-first ordering) and a CI `bundle:mcpb` build-validation step.
- **Manifest schema invalidity**: validate required fields in a test; preserve all non-tool manifest fields verbatim from the existing file rather than re-authoring them.
- **`.mcpb` packer choice unproven**: `mcpb` is not on npm; the official packer appears to be `@anthropic-ai/mcpb` (unconfirmed). Risk of picking the wrong tool. Mitigation: confirm the packer (Q3) before writing `bundle:mcpb`; fall back to a deterministic `zip` of `bundle/` if no official CLI is viable, matching how the current root `.mcpb` was produced.
- **Switching manifest descriptions to full in-code strings bloats the manifest**: acceptable (it is the single source of truth); flag the size delta in the PR. Revisit truncation only if a consumer rejects long descriptions.
- **Cross-issue merge conflict on README/CI**: mitigated by disjoint line regions and reading the package name from `package.json` (§5).

## 8. Open questions (need human decision)

1. **`getClient()` on missing key**: does `getClient()` throw synchronously when `PIPEDRIVE_API_KEY` is unset? (Determines whether the destructive-probe is fully safe without a `fetch` stub.) Needs a quick read of `src/client.ts`/`src/config.ts`.
2. **Destructive detection mechanism**: approve the **guard-probe** (D1, zero-maintenance) vs. an explicit `destructive: true` field on each tool def (more readable, but a 31-entry second surface). Probe is recommended.
3. **`.mcpb` packer**: which tool builds the `.mcpb`? Confirm `@anthropic-ai/mcpb` (or the current hand-zip process) and pin it as a devDependency so CI can pack reproducibly.
4. **API-version table ground truth**: confirm the exact v1/v2 split per entity by auditing `client.get/post/... "v1"|"v2"` call-sites, so the corrected README table (`README.md:173-179`) is accurate (the issue asserts "fields/pipelines/stages are v2 now" — verify against code; my scan shows mixed routing and this must be pinned before editing prose).
5. **Manifest `tools` description policy**: full in-code descriptions (recommended, single source) vs. truncated blurbs (smaller manifest). Approve before implementation, since it changes every manifest row.
6. **Manifest `name` field**: keep MCPB `name` as `pipedrive-mcp` or align it to the npm package name from `package.json` (which #84 will rename)? Recommendation: source from `package.json`. Confirm MCPB allows the scoped `@ckalima/...` form, or strip the scope for the manifest `name`.
7. **`.gitignore` scope**: confirm the re-scoping from "untrack all of `bundle/`" to "untrack `bundle/server/` + root `*.mcpb`, keep `bundle/manifest.json` tracked and drift-checked." (Keeping the manifest tracked is what makes the CI drift gate meaningful.)
