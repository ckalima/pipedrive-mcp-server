# Plan — #84: Rename package to `@ckalima/pipedrive-mcp-server`, publish with provenance

_Part of #83 (P0 sprint). Blocks the registry blitz and launch comms._

## 1. Problem & context

`package.json` declares the **unscoped** name `pipedrive-mcp-server` at `version: 1.0.0`. That name is **owned by `willdent`** on npm (confirmed live: registry returns `200`, `dist-tags.latest = 1.0.2`, `maintainers: [willdent]`, `will@dent.ly`). We literally cannot publish under it, and every `npx -y pipedrive-mcp-server` instruction we ship installs his stale read-only competitor instead of our 155-tool server.

The scoped target `@ckalima/pipedrive-mcp-server` is **available** (registry `GET /@ckalima%2Fpipedrive-mcp-server` → `404`, i.e. first publish, never used). `publishConfig.access` is already `"public"`, which is required for a public scoped package.

State found in the worktree (`agent/84-rename-pkg-provenance`):

- **`package.json`** — `name: pipedrive-mcp-server`, `version: 1.0.0`. Has `repository` (`https://github.com/ckalima/pipedrive-mcp-server`) but **no `bugs` and no `homepage` field**. `bin` maps the unscoped name `pipedrive-mcp-server` → `./dist/index.js`. `publishConfig.access: public`. `files: ["dist","README.md","LICENSE"]` (no `.npmignore`). `prepublishOnly: npm run build`. `engines.node: >=20`.
- **`src/index.ts:32-34`** — `const SERVER_NAME = "pipedrive-mcp-server"` and `const SERVER_VERSION = "1.0.0"` are **hardcoded**. Used in the MCP `Server({ name, version })` handshake and in `console.error` startup logs (`src/index.ts:96`). The version is duplicated from `package.json` and will drift if only one is bumped.
- **CI** — single workflow `.github/workflows/ci.yml`: triggers on push/PR to `main`, matrix `node-version: [20, 22]`, steps `npm ci → build → lint → test`. This is the `ci(20)`/`ci(22)` branch-protection contexts referenced in memory. **No release/publish workflow exists.**
- **No `CHANGELOG.md`.** **Zero git tags** (`git tag -l` empty). **Zero GitHub releases** (a maturity signal evaluators check).
- **`bundle/`** (the MCPB working tree) is **tracked** — 107 files under `git ls-files bundle/`, including a stale hand-written `bundle/manifest.json` (`name: pipedrive-mcp`, `version: 1.0.0`, only 43 tools listed vs. the real 155) and compiled `bundle/server/*.js`. The compiled `bundle/server/index.js:9` and `bundle/server/index.d.ts:9` carry the `npx pipedrive-mcp-server` usage comment.
- **Root `.mcpb` artifact `pipedrive-mcp-1.0.0.mcpb` (3.3 MB) is tracked** in git.
- **155 tools, ~90k tokens** (`npx tsx scripts/measure-tools.ts`: `tools: 155`, `definition bytes: 361424`).

### Install-snippet / name references found (exact)
| File:line | Current text | Needs change in #84? |
|---|---|---|
| `package.json:2` | `"name": "pipedrive-mcp-server"` | **Yes** → scoped name |
| `package.json:7` (`bin`) | `"pipedrive-mcp-server": "./dist/index.js"` | **Decision** (keep unscoped bin command vs. scoped) — see §3 |
| `package.json:3` | `"version": "1.0.0"` | **Yes** → 2.0.0 |
| `README.md:31` | `"args": ["-y", "pipedrive-mcp-server"]` | **Yes** → scoped name |
| `README.md:147-148` | `git clone .../pipedrive-mcp-server.git` / `cd pipedrive-mcp-server` | No (these are the **repo** name/URL, unchanged) |
| `README.md:214` | Report-issues link to repo | No (repo URL) |
| `src/index.ts:10` (comment) | `*   npx pipedrive-mcp-server` | **Yes** (cosmetic, keep accurate) |
| `src/index.ts:32` | `SERVER_NAME = "pipedrive-mcp-server"` | **Decision** — MCP server id; keep stable or rename (see §3) |
| `src/index.ts:34` | `SERVER_VERSION = "1.0.0"` | **Yes** → 2.0.0 (or derive — see §4) |
| `bundle/manifest.json:3` | `"name": "pipedrive-mcp"` | **#85's file** — leave to #85 (flag, do not edit) |
| `bundle/server/index.js:9`, `index.d.ts:9` | `npx pipedrive-mcp-server` | **#85's territory** (generated/compiled bundle) — leave to #85 |
| `CONTRIBUTING.md:8` | fork clone URL | No (repo URL, and it's `YOUR_USERNAME`) |
| `docs/api/README.md:5-6` | issue links | No (repo URL) |

## 2. Goals / non-goals

### Goals
1. `package.json` published-ready under `@ckalima/pipedrive-mcp-server` at `2.0.0`, with `repository`/`bugs`/`homepage` complete.
2. A **release workflow** that publishes to npm **with provenance** via GitHub Actions OIDC on a version tag.
3. Every **first-party install snippet we control** (README `npx` arg, `src/index.ts` usage comment + `SERVER_VERSION`) uses the scoped name / new version.
4. **`CHANGELOG.md`** seeded at `2.0.0` (Keep a Changelog format), highlights-only backfill.
5. **GitHub Release** per tag with notes (close the "zero releases" gap).
6. Provable acceptance: cold `npx -y @ckalima/pipedrive-mcp-server` boots the server; npm page shows the provenance badge.

### Non-goals (explicitly out of scope — belongs to siblings)
- **#85**: `scripts/gen-docs.ts` generator, regenerating `bundle/manifest.json` from `allTools`, **untracking `bundle/` and the root `.mcpb`**, and the CI **drift gate**. #84 must **not** edit `bundle/manifest.json` or the compiled `bundle/server/*` files, and must **not** change the `bundle/`/`.mcpb` git-tracking state. (See §5 for the one ordering dependency.)
- **#86** and other sprint issues: not touched here.
- Renaming the **GitHub repo** or any repo-URL references (the repo stays `ckalima/pipedrive-mcp-server`; only the **npm package name** is scoped).
- Reducing the 155-tool / 90k-token footprint (tracked elsewhere).

## 3. Decisions (with recommendations)

### D1 — Version number: **2.0.0** ✅ recommended
The package was **never published under `@ckalima/...`**, so by strict semver a first publish could be `1.0.0`. Recommend **2.0.0** anyway:
- The unscoped `pipedrive-mcp-server@1.0.x` (willdent's) and our internal `1.0.0` create a collision of meaning. Starting the scoped line at `2.0.0` cleanly disambiguates "the 155-tool server" from both willdent's package and our own pre-scope `1.0.0` artifacts (the tracked `pipedrive-mcp-1.0.0.mcpb`, the `bundle/manifest.json` `1.0.0`).
- It signals the real surface (155 tools vs. willdent's handful, and vs. the 43 tools the stale manifest advertises).
- Cost is zero: no existing scoped consumers to break.
- _Alternative considered_: `1.0.0` (technically "correct" first-publish) — rejected because it maximizes confusion against the two other `1.0.0` artifacts in our own tree and willdent's `1.0.x`.

**Single source of truth:** bump `package.json` → `2.0.0` and `src/index.ts` `SERVER_VERSION` → `2.0.0` together. See §4/D5 for optionally deriving `SERVER_VERSION` from `package.json` to prevent future drift (recommend the manual bump for #84 to keep the diff small, and **note** the drift risk as a follow-up).

### D2 — `bin` command name: **keep `pipedrive-mcp-server` (unscoped key)** ✅ recommended
The `bin` **key** is the CLI command name, independent of the package name. Recommend keeping `bin: { "pipedrive-mcp-server": "./dist/index.js" }`:
- `npx -y @ckalima/pipedrive-mcp-server` resolves the bin by the package's single bin entry regardless of its key, so the acceptance command works either way.
- Keeping the short command name avoids an awkward `npx @ckalima/pipedrive-mcp-server pipedrive-mcp-server`-style invocation and matches the existing `SERVER_NAME`.
- _Alternative_: rename bin to the scoped string — rejected (scopes aren't valid as a bare shell command and add no value).

### D3 — `SERVER_NAME` (MCP server identity): **keep `"pipedrive-mcp-server"`** ✅ recommended
This is the MCP protocol server name in the initialize handshake, not an npm identifier. Clients may key config/telemetry off it. Renaming it is a silent breaking change to anyone who matched on it. Keep it stable; only fix the **comment** at `src/index.ts:10`.

### D4 — Provenance auth: **npm Trusted Publishing (OIDC, no token)** ✅ recommended
npm supports OIDC **trusted publishing**: configure `@ckalima/pipedrive-mcp-server` on npmjs.com to trust this repo + workflow, then the release job needs only `permissions: id-token: write` and runs `npm publish --provenance --access public` with **no `NPM_TOKEN` secret**. This is the most secure path (no long-lived token to leak/rotate) and yields the provenance badge.
- **Bootstrap caveat (critical):** trusted publishing can only be configured **after the package name exists** on the registry, OR via npm's "pending publisher"/"new package" trusted-publisher setup. Practically, the **first** `2.0.0` publish is the highest-friction step. Recommended sequence: (a) configure the trusted publisher on npmjs.com pointing at `ckalima/pipedrive-mcp-server` + the release workflow filename **before** first run (npm allows pre-registering a publisher for a not-yet-existing package); (b) let the workflow do the first publish. If npm's UI refuses to pre-register for a non-existent scoped package, fall back to **D4-fallback** for the first publish only, then switch to OIDC.
- **D4-fallback — `NPM_TOKEN` (granular automation token):** create a granular-access automation token scoped to **publish** for `@ckalima/*`, store as repo secret `NPM_TOKEN`, and `npm publish --provenance --access public` with `NODE_AUTH_TOKEN` set. Provenance **still works** with a token as long as the job runs in GitHub Actions with `id-token: write` and the workflow is OIDC-attested. Use this if trusted-publishing bootstrap blocks the first release. Document both paths in the workflow comments.

### D5 — Release trigger: **push of a `v*` tag** ✅ recommended
Trigger the publish workflow on `push: tags: ['v*.*.*']`. Rationale:
- Tag push is the conventional, auditable trigger; the tag is the immutable release coordinate.
- The same workflow can **create the GitHub Release** from the tag (e.g. `softprops/action-gh-release` or `gh release create`), so "tag → npm publish + GitHub Release + (later) .mcpb attach" is one atomic flow.
- _Alternative_: trigger on `release: published` (create the GH Release in the UI first, workflow reacts). Rejected as primary because it splits release creation from publish and is easier to fire accidentally; but it's a fine variant if the human prefers UI-driven releases. **Open question OQ3.**
- Add `workflow_dispatch` for manual re-runs/dry-runs.

## 4. File-by-file change list

### Edit — `package.json`
- `name`: `"pipedrive-mcp-server"` → `"@ckalima/pipedrive-mcp-server"` (line 2).
- `version`: `"1.0.0"` → `"2.0.0"` (line 3).
- Add `"bugs": { "url": "https://github.com/ckalima/pipedrive-mcp-server/issues" }`.
- Add `"homepage": "https://github.com/ckalima/pipedrive-mcp-server#readme"`.
- Normalize `repository.url` to the canonical `git+https://github.com/ckalima/pipedrive-mcp-server.git` form (npm prefers the `git+` prefix and `.git` suffix; current value lacks both). Low-risk cosmetic.
- Leave `bin` key as-is (D2), `publishConfig.access: public` as-is, `files` allowlist as-is.
- _Verify_ `files` still produces a valid tarball (see §6) — it ships `dist`, `README.md`, `LICENSE` only; `bundle/` and the root `.mcpb` are **not** in `files`, so they won't bloat the npm tarball (good; leave to #85 to untrack from git).

### Edit — `src/index.ts`
- Line 10 comment: `*   npx pipedrive-mcp-server` → `*   npx -y @ckalima/pipedrive-mcp-server`.
- Line 34: `SERVER_VERSION = "1.0.0"` → `"2.0.0"`.
- Line 32 `SERVER_NAME`: **no change** (D3).
- _Optional, recommended as a note not a hard requirement:_ derive `SERVER_VERSION` from `package.json` (e.g. `import pkg from "../package.json" assert { type: "json" }`) to kill the duplication. **Caveat:** requires `resolveJsonModule`/import-assertions support and a `tsconfig`/`files` review (the JSON must resolve at runtime from `dist`). Given #84 should ship small and low-risk, recommend the **manual bump** now and file a follow-up for the derive. Flag in OQ2.

### Edit — `README.md`
- Line 31: `"args": ["-y", "pipedrive-mcp-server"]` → `"args": ["-y", "@ckalima/pipedrive-mcp-server"]`.
- Add a short "Install" note near Quick Start: `npx -y @ckalima/pipedrive-mcp-server` (the canonical command), and optionally an MCPB/Desktop install line.
- **Do NOT** change the `git clone`/`cd` lines (147-148) or issue links (these are repo URLs, unchanged).
- **README overlap with #85** — see §5. Keep #84's README edits confined to the **install-command** block to minimize conflict surface with #85's tool-table regeneration.

### New file — `.github/workflows/release.yml`
Separate workflow from `ci.yml` (do **not** fold publish into CI). Shape:
- `on: push: tags: ['v*.*.*']` plus `workflow_dispatch` (D5).
- `permissions: { contents: write, id-token: write }` (`contents: write` for the GitHub Release step; `id-token: write` for OIDC provenance).
- Job `publish` on `ubuntu-latest`:
  - `actions/checkout@v4`
  - `actions/setup-node@v4` with `node-version: 22`, `registry-url: 'https://registry.npmjs.org'`, `cache: npm`
  - `npm ci`
  - `npm run build` (also covered by `prepublishOnly`, but explicit build keeps the tarball deterministic)
  - **Guard:** assert the tag matches `package.json` version (fail fast if `v2.0.0` tag ≠ `2.0.0` in package.json) to prevent mis-tagged publishes.
  - `npm publish --provenance --access public` (no `NODE_AUTH_TOKEN` under D4 trusted publishing; with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` under D4-fallback — include both, comment one out).
  - **GitHub Release step:** `softprops/action-gh-release@v2` (or `gh release create "$TAG" --notes-file ...`) creating the release for the pushed tag with notes sourced from the matching `CHANGELOG.md` section.
  - **`.mcpb` attach step — GATED on #85 (see §5):** add as a **conditional/last step** that attaches `*.mcpb` to the GitHub Release **only if** the CI-built artifact exists. Until #85 lands its generator, either (a) omit the step, or (b) make it `if: hashFiles('*.mcpb') != ''` so it no-ops gracefully. Recommend shipping #84 with the attach step **present but guarded** so #85 just has to produce the artifact.

### New file — `CHANGELOG.md`
- Keep a Changelog format, starting at `## [2.0.0] - 2026-06-12`.
- Highlights-only backfill: scoped-name first publish; 155 tools across deals/persons/orgs/activities/notes/leads/projects/products/tasks/boards/phases/mail/fields/pipelines/users; provenance-signed; destructive ops gated by `PIPEDRIVE_ENABLE_DESTRUCTIVE`; v2-first with v1 fallback. **Do not** fabricate a granular pre-2.0.0 history; a single `2.0.0` entry summarizing the surface is sufficient and honest (no prior published versions existed under this name).

### No-edit (flag for #85, do not touch in #84)
- `bundle/manifest.json` (name `pipedrive-mcp`, stale 43-tool list, version 1.0.0) — **#85 regenerates** from `allTools`.
- `bundle/server/index.js` / `index.d.ts` usage comments — compiled output, #85's generator territory.
- Root `pipedrive-mcp-1.0.0.mcpb` tracked artifact — **#85 untracks** `bundle/` + `.mcpb`.

## 5. Sequencing & cross-issue coordination

### Internal order of operations for #84 (implement phase)
1. `package.json` (name, version 2.0.0, bugs, homepage, repository normalization).
2. `src/index.ts` (`SERVER_VERSION` → 2.0.0, comment).
3. `README.md` install-command edit (scoped name).
4. `CHANGELOG.md` (new, 2.0.0 entry).
5. `.github/workflows/release.yml` (new).
6. **Out-of-band (human/registry config):** configure npm trusted publisher (D4) before the first tag push.
7. Tag `v2.0.0` → workflow publishes + creates GitHub Release.

### Cross-issue: #85 dependency (the `.mcpb` attach)
- The release workflow's **"attach .mcpb to the GitHub Release"** step **depends on #85's generator** existing (it produces a fresh, in-sync `.mcpb` in CI). **Ship #84 independently** by making the attach step **conditional** (`if: hashFiles('*.mcpb') != ''`) so the release succeeds with or without the artifact. When #85 lands, the artifact appears and the step activates — no #84 rework needed.
- Do **not** block #84's merge on #85.

### Cross-issue: overlapping files with #85 (sequence to avoid merge conflicts)
Two shared files. Identify exact sections so implement-phase can sequence:
- **`README.md`** — #84 edits **only** the install-command block (line ~31 `npx` arg + a Quick Start install note). #85 (per its brief) regenerates the **tool tables** ("Available Tools" section, lines ~58-130). These are **disjoint sections**; conflict risk is low **if** both stay in their lane. **Recommendation:** land #84's README edit first (smaller, install-only); #85 rebases its tool-table regeneration on top. If #85 lands first, #84's one-line `npx` change rebases trivially.
- **CI workflow** — #84 adds a **new** `release.yml` (does **not** edit `ci.yml`). #85 adds a **drift-gate** step/job — confirm whether #85 edits `ci.yml` or adds its own workflow. If #85 edits `ci.yml` and #84 only adds `release.yml`, **there is no overlap** (different files). **Recommendation:** keep #84 strictly additive (`release.yml` only) so the CI surfaces never collide. Flag to the implementer: if #85 instead chooses to add its drift gate into a shared `release.yml`, coordinate — but the default plan keeps them in separate files.

## 6. Test / verification plan

The package is **not yet published**, so acceptance splits into pre-publish (local, in CI) and post-publish (live) gates.

### Pre-publish (must pass before tagging)
- `npm run build` clean; `npm test` green (~1,698 vitest tests) — `SERVER_VERSION`/`SERVER_NAME` changes must not break the handshake or any test asserting them. **Grep tests for `1.0.0`/`SERVER_VERSION`/`pipedrive-mcp-server`** to catch assertions that pin the old values before bumping.
- `npm pack --dry-run` — confirm the tarball contains **only** `dist/**`, `README.md`, `LICENSE` (the `files` allowlist), and that `package.json` resolves to `@ckalima/pipedrive-mcp-server@2.0.0`. Confirm `bin` resolves to `dist/index.js`.
- `npm publish --dry-run --provenance --access public` locally (will warn provenance only works in CI, but validates the manifest, scope, and access).
- **Tag/version guard** in the workflow (see §4) verified by intentionally mismatching once in a dispatch dry-run.

### Post-publish (live acceptance — issue's Definition of Done)
- **Cold `npx`:** on a clean machine / fresh npm cache (`npm cache clean --force` or a container), run `PIPEDRIVE_API_KEY=… npx -y @ckalima/pipedrive-mcp-server` and confirm it boots (STDIO server starts, `[pipedrive-mcp-server] Starting server v2.0.0...` on stderr) and lists 155 tools.
- **Claude Desktop / Code:** drop the scoped `npx` config (README block) into `.mcp.json` / Desktop config with a real `PIPEDRIVE_API_KEY`; confirm tools load and a read call (e.g. list deals) returns.
- **Provenance badge:** visit `https://www.npmjs.com/package/@ckalima/pipedrive-mcp-server` and confirm the **"Provenance"** section/badge renders with the GitHub Actions build link. (`npm view @ckalima/pipedrive-mcp-server --json` should include provenance/attestation metadata.)
- **GitHub Release:** confirm a release exists for `v2.0.0` with CHANGELOG-sourced notes; once #85 lands, confirm the `.mcpb` asset is attached.

## 7. Risks & mitigations
- **Publishing a broken 2.0.0 (immutable):** npm versions can't be overwritten; a bad publish wastes the version. _Mitigation:_ `npm pack --dry-run` + `npm publish --dry-run` + full green CI gate **before** tagging; tag/version guard in the workflow.
- **OIDC / trusted-publishing misconfig (first publish fails or unsigned):** provenance silently absent or `403`. _Mitigation:_ pre-configure the trusted publisher (D4); keep `NPM_TOKEN` fallback (D4-fallback) wired-but-commented for the bootstrap publish; verify the badge post-publish; ensure `permissions: id-token: write` is present (a common omission).
- **Scoped first-publish 404 / "scope not found":** publishing a scoped package the first time needs `--access public` (have it) and the npm account/org to own the `@ckalima` scope. _Mitigation:_ confirm `@ckalima` scope exists under the publishing identity before tagging; `publishConfig.access: public` already set.
- **Version drift between `package.json` and `src/index.ts` `SERVER_VERSION`:** two hardcoded sources. _Mitigation:_ bump both in the same commit; add the tag/version guard; file the "derive from package.json" follow-up (OQ2).
- **Breaking unscoped consumers:** no real risk — we were never publishable as `pipedrive-mcp-server` (willdent owns it). Anyone currently running `npx pipedrive-mcp-server` is running **his** server, not ours; moving to the scoped name is the fix, not a break. _Action:_ launch comms must tell users to switch their config to the scoped name (the old snippet was always wrong-target).
- **README/CI merge conflict with #85:** _Mitigation:_ §5 lane-separation (install-block only; `release.yml` additive only).
- **`.mcpb` attach references a non-existent artifact before #85:** _Mitigation:_ `if: hashFiles('*.mcpb') != ''` guard — step no-ops gracefully.

## 8. Open questions (need human decision)
- **OQ1 — Trusted publishing vs. NPM_TOKEN for the bootstrap publish.** Can we pre-register an npm trusted publisher for the not-yet-existing `@ckalima/pipedrive-mcp-server`? If npm's UI blocks pre-registration for a non-existent scoped package, do we accept the `NPM_TOKEN` fallback for the **first** publish only, then switch to OIDC? (Default plan: try OIDC first, fallback ready.)
- **OQ2 — Derive `SERVER_VERSION` from `package.json` now, or follow-up?** (Default: manual bump in #84, follow-up issue for the derive to keep this diff small.)
- **OQ3 — Release trigger: `v*` tag push (default) vs. `release: published`?** UI-driven release creation vs. tag-driven. (Default: tag push, workflow creates the GH Release.)
- **OQ4 — CHANGELOG backfill depth.** Single honest `2.0.0` entry (recommended), or a richer backfilled history of the pre-scope internal milestones? (Default: single 2.0.0 entry — nothing was published under this name before.)
- **OQ5 — Does #85 edit `ci.yml` or add its own workflow for the drift gate?** Confirms whether the CI surface truly overlaps. (Default assumption: #84 is additive-only via `release.yml`, so no overlap.)
