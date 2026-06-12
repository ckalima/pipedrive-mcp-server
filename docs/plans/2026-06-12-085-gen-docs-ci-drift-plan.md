# Plan: Generate README tool table + MCPB manifest from `allTools`, with CI drift check (#85)

> **Revision (2026-06-12):** Incorporated ce-doc-review findings — reversed D1 to a declared `destructive` field (removes the P0 where the runtime probe fired live CRM writes), deferred the .mcpb build-validation to #84's release workflow, added bundle mixed-tracking clarity, a drift-gate determinism proof step, and closed Open Qs 1-2.

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

**Tool shape** (`src/tools/index.ts:24-56`, sample `src/tools/deals.ts:922-1415`): each entry is `{ name, description, inputSchema, handler, schema }`. `name` is `pipedrive_<verb>_<entity>`; `description` is a plain string; `inputSchema` is a hand-written JSON-Schema literal (`type: "object"`, `properties`, `required`). **There is no `destructive`, `entity`, or `plan` field on the tool object today** — this plan ADDS an optional `destructive?: true` marker (a small type addition; the chosen mechanism, see D1).

**Destructive is encoded in the handler body, not the tool def — today.** Every gated handler calls `destructiveOperationGuard()` (`src/utils/errors.ts:89-104`) as its **first statement, before `getClient()`** (verified for `deleteDeal`, `deleteTask`, `deleteProductImage`). A precise per-function scan (`/tmp/findguards.mjs`) finds **exactly 31 guarded handlers**:

```
convertDealToLead, deleteActivity, deleteBoard, deleteDeal, deleteDealDiscount,
deleteDealField, deleteDealFieldOptions, deleteDealFollower, deleteDealInstallment,
deleteDealProduct, deleteLead, deleteNote, deleteOrganization, deleteOrganizationField,
deleteOrganizationFieldOptions, deleteOrganizationFollower, deletePerson, deletePersonField,
deletePersonFieldOptions, deletePersonFollower, deletePhase, deletePipeline, deleteProduct,
deleteProductField, deleteProductFieldOptions, deleteProductFollower, deleteProductImage,
deleteProductVariation, deleteProject, deleteStage, deleteTask
```

**A name-prefix heuristic is WRONG.** 32 tools match a `delete_`/`convert_`/`archive_` name prefix, but `pipedrive_convert_lead_to_deal` and `pipedrive_archive_project` are **not** guarded, while `pipedrive_convert_deal_to_lead` **is** (it deletes the source deal). So "destructive" cannot be derived from the name. It is encoded by an explicit `destructive: true` field on each guarded tool def, kept honest by a static field↔guard invariant test (D1, §6) — not by a hand-maintained name list and not by executing handlers.

**A runtime guard-probe is UNSAFE (the reason D1 was reversed).** An earlier draft proposed detecting destructive tools by calling each `tool.handler({})` at doc-gen time and checking for the `DESTRUCTIVE_DISABLED` response. The review proved this fires live CRM writes: `getClient()` (`src/client.ts:332-337`) does **not** throw on a missing key — it just lazily constructs the singleton. Config validation (`getConfig()`, `src/config.ts:16-24`) throws only later, inside `ensureInitialized()` (`src/client.ts:37-42`), which runs on the **first request**, and only when the key is unset. The guard protects **only the 31 destructive handlers**; the other **124 handlers have no guard**, so when `PIPEDRIVE_API_KEY` is present in the env (the normal live-smoke state) probing those 124 would issue ~120 real `fetch()` calls — including `POST /deals` — creating garbage records in the live CRM. The declared-field mechanism (D1) runs **no production handler code** during doc generation and eliminates this surface entirely.

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
- The compiled `bundle/server/` and the root `.mcpb` are untracked and gitignored, while the generated `bundle/manifest.json` stays tracked (the drift gate needs a tracked text artifact). This re-scope lands **in the same change** as the working generator, so a buildable bundle always exists. The `.mcpb` **build-validation** is NOT in #85's per-PR CI — it lives in #84's release workflow (see D3).

### Non-goals (owned by #84 or out of scope)
- The package **rename** to `@ckalima/pipedrive-mcp-server` and any npm-publish auth/provenance — #84 owns this. The generator must **read** the package name from `package.json` (not hardcode `pipedrive-mcp`/`pipedrive-mcp-server`) so it is correct whichever order the two issues merge.
- The GitHub **release workflow** itself (tag-triggered publish/release-create) — #84 owns the workflow; this plan only contributes the `.mcpb` **build command** it consumes and decides where the **attach** step lives (see §5).
- Refactoring tool handlers, schemas, or adding new tools.
- Per-tool input-schema documentation in the README (the table is name + description + markers only; full schemas stay in-code and in the manifest scope decision below).

## 3. Decisions

### D1 — Single source of truth: derive everything from `allTools`, mark destructive via a declared field
The generator imports `allTools` from `../src/tools/index.js` and emits from it. It runs **no production handler code** at doc-gen time. For the three markers:

- **Destructive (declared field — the chosen mechanism)**: add an explicit `destructive: true` marker to each of the 31 guarded tool definitions. The field lives on the tool def where `allTools` entries are shaped (the per-entity `*Tools` arrays whose source files own the guarded handlers — e.g. `src/tools/deals.ts`, `src/tools/tasks.ts`, etc.; the aggregate is assembled in `src/tools/index.ts`). The current tool shape is `{ name, description, inputSchema, handler, schema }`; adding `destructive?: true` is a small, optional type addition (the field is simply absent on the 124 non-destructive tools). The generator's classify step is then a pure read: `destructive = tool.destructive === true` — **no `tool.handler()` call, no `try/await` probing, no `fetch` stub, no env manipulation.**
  - *Why this replaces the probe (D1 reversed)*: the runtime guard-probe fired real `fetch()` calls. `getClient()` does **not** throw on a missing key (it lazily constructs the singleton; `getConfig()` throws only later, inside the first request, and only when the key is unset). The guard protects only the 31 destructive tools, so probing the other 124 with a `PIPEDRIVE_API_KEY` present (the normal live-smoke env) would have issued ~120 real API calls including `POST /deals`, polluting the live CRM. Reading a declared field at doc-gen time **runs no production handler code at all**, so the entire network-leak surface is gone.
  - *Keeping the field honest*: a declared field could drift from the actual guard. That is the **only** new risk, and it is much smaller than a live-write probe. It is mitigated by a static field↔guard invariant test (§6) that asserts `(tool.destructive === true) === handlerInvokesGuard(tool)` for all 155 tools, where `handlerInvokesGuard` is decided by a **static source scan** (grep the handler's source for `destructiveOperationGuard(`) or the known guarded set — never by executing handlers. The test fails CI if a new guarded tool forgets the field, or a field is added to an unguarded tool.

- **Plan-gated (Growth+)**: mark a tool when its `description` contains the literal `Growth+`. Currently the 4 installment tools. *This is a fragile key* (a description reword could silently drop the marker) — the §6 test that asserts **exactly** the 4 installment tools are marked is the guard against that. Document the convention in `CONTRIBUTING.md` so new plan-gated tools keep `Growth+` in their description.

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
- **This issue (#85) owns**: the generator emits `bundle/manifest.json` (tracked, drift-checked), and #85 commits the `bundle:mcpb` **script** in `package.json`. The script compiles `src` into `bundle/server/` and packs `bundle/` into a `.mcpb`. The drift check covers only `manifest.json`. **#85 does NOT run `bundle:mcpb` in its per-PR CI.**
- **Packer is a blocking pre-implementation gate**: the `.mcpb` packer (`@anthropic-ai/mcpb`) is still **unconfirmed** (`npm view mcpb` 404s; the scoped package is unverified here). **Q3 must be resolved and the packer pinned as a devDependency BEFORE the `bundle:mcpb` script is written.** This is a hard gate, not a parallelizable detail.
- **The `.mcpb` build-validation is DEFERRED to #84's release workflow** (out of #85's per-PR CI). Rationale: if `bundle:mcpb` ran on every PR while the packer is unconfirmed (or even after — packing a zip on every PR is slow and brittle), it would **red every PR** until the packer resolves, and the packer is exactly the still-open Q3. So per the #84 seam: #84's tag-triggered release workflow calls `npm run bundle:mcpb`, validates the pack, and **attaches** the resulting `.mcpb` to the GitHub Release. #85 contributes the build **command** + the generated `manifest.json`; #84 owns invoking and attaching it. If #84 lands first, its release workflow references `npm run bundle:mcpb`, which #85 then provides; if #85 lands first, the script exists and #84 just calls it. Document this seam explicitly in both issues.
- The manifest's `name` field (`bundle/manifest.json:3`, currently `pipedrive-mcp`) and `version` (`:5`) must be **sourced from `package.json`** by the generator, not hardcoded, so #84's rename flows through automatically. (MCPB `name` need not equal the npm name, but sourcing it from one place removes the second drift point; confirm MCPB name constraints — see Open Questions.)

### D4 — Ignore-then-generate ordering (no missing bundle)
Untracking the compiled `bundle/server/` and the root `.mcpb` **must land in the same PR** as the working generator and `bundle:mcpb` script. Sequence inside the implementation PR: (1) add generator + `bundle:mcpb` script, prove the generator regenerates `manifest.json` deterministically and that the `bundle:mcpb` script packs a valid `.mcpb` **locally** (the per-PR CI does NOT run it — D3); (2) `git rm -r --cached bundle/server/ pipedrive-mcp-1.0.0.mcpb`; (3) add `bundle/server/` and root `*.mcpb` to `.gitignore`. Never untrack before the generator works, or there is a window with no buildable artifact. The `manifest.json` is the one bundle file whose **content** the drift check guards; the compiled `server/` is rebuilt, not diffed.

**Mixed-tracking clarity (don't leave a confusing half-tracked `bundle/`)**: keeping `bundle/manifest.json` tracked while ignoring `bundle/server/` creates a directory where some files are version-controlled and some are not. To make this legible (and never recommend deleting the manifest):
- Use a **negated** `.gitignore` rule so the manifest is explicitly re-included: `bundle/server/` ignored, root `*.mcpb` ignored, and `!bundle/manifest.json` so it stays tracked unambiguously.
- The generator writes a **provenance header** into the manifest — a top-level `"_generated": "by npm run gen:docs — do not edit"` field (or, if MCPB 0.3 rejects unknown top-level keys, a leading comment is not valid JSON, so prefer the `_generated` key and confirm the schema tolerates it; fall back to a `README` note only if it does not). This stops a contributor from hand-editing the generated file.
- Add a `CONTRIBUTING.md` note explaining the split: `bundle/manifest.json` is generated + tracked + drift-checked; `bundle/server/` and `*.mcpb` are build output and are gitignored.

### D5 — Drift-check scope (single Node leg, proven byte-stable)
The CI drift gate runs `npm run gen:docs` then `git diff --exit-code -- README.md bundle/manifest.json`. It does **not** diff `bundle/server/**` (build output, now gitignored) — only the two generated, tracked text artifacts. Generator output must be **byte-deterministic** (fixed group order, fixed within-group order from `allTools`, stable JSON formatting matching the existing 2-space manifest style, trailing newline) so CI never flags spurious drift.

- **Pin the drift gate to a SINGLE Node matrix leg** (e.g. run it only on Node 20, gated by an `if` on the matrix value), not on both 20 and 22. Running the serializer on two Node versions adds cross-version JSON/`JSON.stringify` serialization risk for zero added signal — one leg is sufficient to catch un-regenerated docs. (The rest of the `ci` job still runs on both 20 and 22.)
- **Determinism is an explicit acceptance step, not an assumption** (see §6): run `gen:docs` once with **no tool changes** and assert `git diff --exit-code` is empty — i.e. the serializer reproduces the existing `manifest.json` and README region **byte-for-byte**. If a full-file `JSON.parse → mutate → JSON.stringify` round-trip is **not** byte-stable against the existing manifest (key ordering, spacing, or the existing `_generated`/other fields shift), do **not** re-stringify the whole file: splice **only** the `tools` array textually into the existing file, leaving every other byte untouched. The acceptance step proves which approach is needed before merge.

## 4. File-by-file change list

### NEW: `scripts/gen-docs.ts` (run via `tsx`)
- **Imports**: `allTools` from `../src/tools/index.js`; `readFileSync`/`writeFileSync`; package metadata from `../package.json` (name, version, description, author, repository, license) via `resolveJsonModule` or a read+parse.
- **Inputs**: the live `allTools` array; existing `README.md` (for marker splice); existing `bundle/manifest.json` non-tool fields (preserve `manifest_version`, `server`, `user_config`, `keywords`); `package.json`.
- **Core steps**:
  1. **Classify** each tool → `{ name, description, group, destructive: boolean, growthPlus: boolean }`. `destructive = tool.destructive === true` (declared field, D1 — **no handler execution**); `growthPlus = description.includes("Growth+")`; `group` via the name→group map (D2). The generator reads only data already on the tool def; it never calls `tool.handler`.
  2. **Sanity assert**: `allTools.length === <generated rows>`, and a plausible destructive count (e.g. fail if 0 destructive found — implies the `destructive` field was lost). Print the totals.
  3. **Emit README region**: a legend line + one Markdown table per group (`| Tool | Description |`, destructive rows marked 🔒, Growth+ rows marked ⭑). Splice between `<!-- BEGIN GENERATED TOOLS -->` / `<!-- END GENERATED TOOLS -->`; error if markers missing.
  4. **Emit manifest**: rebuild the `tools` array as `{ name, description }` per tool (the MCPB 0.3 `tools` entries in the current file are name+description only — `bundle/manifest.json:37`). Set `name`/`version`/`description` from `package.json`. Write the `"_generated": "by npm run gen:docs — do not edit"` provenance field (D4). Preserve all other manifest fields verbatim. Write with 2-space indent + trailing newline to match the current file exactly. **Per the §6 determinism acceptance step**, prefer a textual splice of ONLY the `tools` array (and the `_generated`/`name`/`version`/`description` fields) into the existing file over a full `JSON.stringify` round-trip if the round-trip is not byte-stable, so the first regen produces zero diff except the intended changes.
- **Outputs**: rewritten `README.md` (markers region only) and `bundle/manifest.json`.
- **Determinism**: no `Date.now()`, no map/object iteration without explicit ordering, sort nothing implicitly — rely on `allTools` order within groups and the fixed `GROUP_ORDER`.
- **Decision to confirm**: whether the manifest `tools` descriptions should be the **full** in-code descriptions (long, e.g. the conversion-status tool's multi-sentence string at `deals.ts:1403`) or a **truncated** first sentence. The current manifest uses short hand-written blurbs ("List and filter deals"); switching to full descriptions changes every row. **Recommendation**: emit the full in-code `description` (single source of truth; the hand-written blurbs are exactly the kind of second copy that drifts). Note in the PR that this enlarges the manifest.

### `package.json` (`scripts` block, `package.json:10-22`)
- Add `"gen:docs": "tsx scripts/gen-docs.ts"`.
- Add `"bundle:mcpb": "<build server/ + pack .mcpb>"` (D3). Exact packer TBD and **blocking** (Q3); likely `tsc`-to-`bundle/server` + `@anthropic-ai/mcpb pack` or a zip step. Keep `gen:docs` and `bundle:mcpb` separate (docs drift check must not require packing a zip). **#85 commits this script but does NOT invoke it in per-PR CI** — it is consumed by #84's release workflow (D3).
- Consider a `"gen:docs:check"` convenience that runs gen then `git diff --exit-code` for local use.

### `README.md`
- Replace the hand-written tool block (`README.md:56-107`) with the `<!-- BEGIN GENERATED TOOLS -->`…`<!-- END GENERATED TOOLS -->` sentinels (generator fills them).
- **Add `PIPEDRIVE_ENABLE_DESTRUCTIVE` docs** (one-time manual, near the config section `README.md:24-44`): explain it defaults to disabled, gates the 31 destructive tools, and how to enable. Reference the legend symbol used in the generated table.
- **Fix the API-version table** (`README.md:173-179`): reconcile to actual per-entity routing in the code (the current "v1: Mail, Fields, Pipelines, Stages, Users" line is wrong for fields). Do this as a manual edit after a per-entity `client.get(..., "v1"|"v2")` audit (Open Questions Q2). Keep it outside the markers.
- Optionally update the install snippet's package name — **but defer the rename to #84** to avoid a merge conflict; if #85 lands first, leave `pipedrive-mcp-server` and let #84 change it.

### `.github/workflows/ci.yml`
- Add a drift step to the existing `ci` job after `npm run build` (so `tsx` deps and a compiled tree are available), **pinned to a single Node matrix leg** (D5) so cross-version serialization can't flag spurious drift, e.g.:
  ```yaml
  - run: npm run gen:docs
    if: matrix.node-version == 20
  - run: git diff --exit-code -- README.md bundle/manifest.json
    if: matrix.node-version == 20
  ```
  Failure message should hint "run `npm run gen:docs` and commit". (The `build`/`lint`/`test` steps still run on both 20 and 22; only the drift gate is single-leg.)
- **Do NOT add a `.mcpb` build-validation step to this per-PR CI** (reversed from the earlier draft). Running `npm run bundle:mcpb` on every PR would red every PR while the packer (Q3) is unconfirmed, and packing a zip per PR is slow/brittle. The `.mcpb` build/attach lives in **#84's release workflow** (D3). #85 only commits the `bundle:mcpb` script + the generated `manifest.json`.

### `.gitignore`
- Ignore the compiled `bundle/server/` and the root `*.mcpb`, but **keep `bundle/manifest.json` tracked** via an explicit **negated re-include** so the mixed-tracking is unambiguous (D4):
  ```gitignore
  bundle/server/
  *.mcpb
  !bundle/manifest.json
  ```
  (Re-scope the issue's literal "untrack `bundle/`" to "untrack the compiled `bundle/server/` + root `.mcpb`, keep the generated manifest tracked and drift-checked". This re-scope is **required** — the drift gate needs a tracked text artifact to diff — and the PR description must explain the deviation from the issue's literal wording.)
- `git rm -r --cached bundle/server/ pipedrive-mcp-1.0.0.mcpb` in the same PR (D4). This drops 106 of the 107 tracked bundle files (everything under `server/`) plus the root artifact, while `bundle/manifest.json` stays tracked and generated.

### `CONTRIBUTING.md`
- Add a short "Updating docs" note: after adding/renaming a tool, run `npm run gen:docs` and commit.
- **Destructive tools**: when adding a destructive tool, call `destructiveOperationGuard()` as the handler's first statement **AND** set `destructive: true` on its tool def; the field↔guard invariant test (§6) enforces that the two agree (CI fails if a guarded tool lacks the field or an unguarded tool has it).
- **Plan-gated tools**: mark by including the literal `Growth+` in the tool's `description` (fragile key — the §6 test that asserts exactly the 4 installment tools are marked is the backstop).
- **Bundle tracking**: `bundle/manifest.json` is generated + tracked + drift-checked; `bundle/server/` and `*.mcpb` are build output and are gitignored — do not hand-edit the manifest (it carries a `"_generated"` provenance field).

## 5. Sequencing & cross-issue coordination

1. **Untrack-with-generator (hard constraint, D4)**: the `git rm --cached` for the compiled `bundle/server/` + root `.mcpb` and the `bundle:mcpb` script land in the **same PR** as the working generator. Order within the PR: generator + `bundle:mcpb` script proven **locally** (the per-PR CI does not run the pack — D3) → `git rm --cached` → `.gitignore`.
2. **#84 release-attach seam (D3)**: #85 ships `npm run bundle:mcpb` + `bundle/manifest.json`; #84's release workflow calls it and attaches the `.mcpb` to the GitHub Release. Whichever merges second must not redefine the script/manifest the other relies on. Recommend #84's release workflow `run: npm run bundle:mcpb` exactly.
3. **README overlap with #84**: #85 owns the tool-table region (sentinels) + `PIPEDRIVE_ENABLE_DESTRUCTIVE` + version-table fix; #84 owns the install snippet **package name**. These are disjoint line regions (#85: 56-107 + 24-44 config + 173-179; #84: the `npx -y pipedrive-mcp-server` arg at `README.md:31`). To minimize conflict, #85 leaves the install snippet's package name untouched. Sequencing: land whichever is ready; rebase the second on the first. The only true coupling is the **package name**, which #85 reads from `package.json` (so the manifest auto-tracks #84's rename) and does not write into the install snippet.
4. **CI workflow overlap**: #85 adds steps to `ci.yml`; #84 adds a **new** `release.yml` (per its scope). Different files → low conflict. If #84 also edits `ci.yml`, sequence so both step-sets are additive.

## 6. Test / verification plan

- **"All 155 listed" (manifest)**: a unit test (`tests/unit/gen-docs.test.ts`, vitest) that imports `allTools` and the generator's classification function and asserts `classified.length === allTools.length === 155`, every `tool.name` appears in the generated manifest `tools` array, and the generated README region contains every `tool.name`. This catches a generator that silently drops tools.
- **Destructive field↔guard invariant (the central correctness test)**: for **all 155 tools**, assert `(tool.destructive === true) === handlerInvokesGuard(tool)`, where `handlerInvokesGuard` is computed by a **static source scan** — grep each handler's source for `destructiveOperationGuard(` (or compare against the known guarded set) — **never by executing `tool.handler`**. Also assert the set of tools with `destructive === true` equals **exactly the known 31** (snapshot the sorted list in the test). This catches a future tool that adds/removes a guard without updating the field (and vice versa). Specifically assert `convert_deal_to_lead` **is** marked while `convert_lead_to_deal` and `archive_project` are **not** (regression guard against the name-prefix trap).
- **Growth+ classification**: assert **exactly** the 4 installment tools are marked (the backstop for the fragile `description.includes("Growth+")` key).
- **Determinism (in-test)**: run the generator twice in the test and assert identical output (no nondeterministic ordering).
- **Determinism (acceptance, byte-stable, D5)**: as an explicit acceptance step, with **no tool changes**, run `npm run gen:docs` and assert `git diff --exit-code` is empty — proving the serializer reproduces the existing `manifest.json` + README region byte-for-byte. If it is not byte-stable, switch the manifest writer to a textual splice of only the `tools` array (D4/D5) and re-prove.
- **"CI red on drift" (end-to-end)**: manual/CI proof — add a throwaway tool to a tool file (or rename one), run `npm run gen:docs`, observe `git diff` is non-empty, then `git diff --exit-code` exits non-zero. Conversely, after committing the regen, the check is green. Document this in the PR description; optionally encode a lightweight version as a test that mutates an in-memory copy of `allTools` and asserts the generated output changes.
- **Manifest validity**: validate the emitted `manifest.json` parses as JSON and (if a schema is available) against MCPB `manifest_version 0.3`. At minimum assert required top-level fields (`manifest_version`, `name`, `version`, `server`, `tools`) are present and `tools` is non-empty.
- **`.mcpb` packs (LOCAL / #84 release, not #85 per-PR CI)**: `npm run bundle:mcpb` must exit 0 and produce a non-empty `.mcpb`. Prove this **locally** during #85 implementation (D4) and in **#84's release workflow** (D3); it is deliberately NOT a #85 per-PR CI gate.
- **Regression on existing suite**: `npm test` (1,698 tests) stays green; `npm run build` + `npm run lint` pass (the generator is `tsx`-run, excluded from `tsc` `src` build via `tsconfig` `include: ["src/**/*"]`, but should still typecheck cleanly under tsx).

## 7. Risks & mitigations

- **Generator nondeterminism → false CI drift**: fixed `GROUP_ORDER`, preserve `allTools` order within groups, stable JSON (2-space + trailing newline matching the current manifest byte-for-byte), no timestamps, drift gate pinned to a single Node leg (D5). Determinism in-test + byte-stable acceptance step (§6).
- **`destructive` field drifts from the actual guard** (the one new, small risk introduced by the declared-field mechanism — and far smaller than the live-write probe it replaces): a new guarded tool could forget `destructive: true`, or the field could linger on a tool whose guard was removed. Mitigated by the field↔guard invariant test (§6) that statically scans handler source for `destructiveOperationGuard(` and fails CI on any mismatch, plus the `CONTRIBUTING.md` note instructing contributors to set both together. **No production handler code runs at doc-gen time, so there is zero network-leak surface** (the probe risk is fully eliminated).
- **Marker drift / missing markers**: generator hard-fails if `<!-- BEGIN/END GENERATED TOOLS -->` are absent, so a hand-edit that deletes them breaks the build loudly rather than silently.
- **Untracking before the generator works → no buildable bundle**: enforced by D4 (same PR, generator-first ordering) and a **local** `bundle:mcpb` proof (the per-PR CI does not run the pack — D3).
- **Manifest schema invalidity**: validate required fields in a test; preserve all non-tool manifest fields verbatim from the existing file rather than re-authoring them.
- **`.mcpb` packer choice unproven (BLOCKING pre-implementation gate, Q3)**: `mcpb` is not on npm; the official packer appears to be `@anthropic-ai/mcpb` (unconfirmed). This is a **blocking** gate — the packer must be confirmed and pinned as a devDependency **before** the `bundle:mcpb` script is written. Because the `.mcpb` build is deferred to #84's release workflow (D3) and is **not** in #85's per-PR CI, an unresolved packer does **not** red #85's PRs — but the `bundle:mcpb` script #85 ships is unproven until Q3 closes. Mitigation: confirm the packer (Q3) first; fall back to a deterministic `zip` of `bundle/` if no official CLI is viable, matching how the current root `.mcpb` was produced.
- **Switching manifest descriptions to full in-code strings bloats the manifest**: acceptable (it is the single source of truth); flag the size delta in the PR. Revisit truncation only if a consumer rejects long descriptions.
- **Cross-issue merge conflict on README/CI**: mitigated by disjoint line regions and reading the package name from `package.json` (§5).

## 8. Open questions (need human decision)

**Resolved during review** (closed, no longer open): the former Q1 ("does `getClient()` throw synchronously on a missing key?") and Q2 ("guard-probe vs. declared field?") are **moot** — D1 was reversed to a declared `destructive` field, so there is no probe to make safe and no mechanism left to choose. Confirmed while closing them: `getClient()` (`src/client.ts:332-337`) does **not** throw on a missing key, which is precisely why the probe was unsafe.

1. **`.mcpb` packer (BLOCKING)**: which tool builds the `.mcpb`? Confirm `@anthropic-ai/mcpb` (or the current hand-zip process) and pin it as a devDependency. **This is a blocking pre-implementation gate** for the `bundle:mcpb` script (D3) — it must be resolved before that script is written. (It does not block #85's per-PR CI, since the `.mcpb` build is deferred to #84's release workflow.)
2. **API-version table ground truth**: confirm the exact v1/v2 split per entity by auditing `client.get/post/... "v1"|"v2"` call-sites, so the corrected README table (`README.md:173-179`) is accurate (the issue asserts "fields/pipelines/stages are v2 now" — verify against code; my scan shows mixed routing and this must be pinned before editing prose).
3. **Manifest `tools` description policy**: full in-code descriptions (recommended, single source) vs. truncated blurbs (smaller manifest). Approve before implementation, since it changes every manifest row.
4. **Manifest `name` field**: keep MCPB `name` as `pipedrive-mcp` or align it to the npm package name from `package.json` (which #84 will rename)? Recommendation: source from `package.json`. Confirm MCPB allows the scoped `@ckalima/...` form, or strip the scope for the manifest `name`.
5. **`.gitignore` scope**: confirm the re-scoping from "untrack all of `bundle/`" to "untrack `bundle/server/` + root `*.mcpb`, keep `bundle/manifest.json` tracked and drift-checked" (with the `!bundle/manifest.json` negated re-include). Keeping the manifest tracked is what makes the CI drift gate meaningful.
