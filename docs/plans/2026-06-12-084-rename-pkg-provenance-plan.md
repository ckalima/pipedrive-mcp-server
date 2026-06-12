# Plan — #84: Rename package to `@ckalima/pipedrive-mcp-server`, publish with provenance

> **Revision (2026-06-12):** Incorporated ce-doc-review findings — SHA-pinned actions + per-job permissions, a hard dist-in-tarball publish gate, OQ1 resolved-before-implement, provenance-via-token preconditions, dropped the stale-.mcpb attach step (real bug), named #89 as a dependency + added #84-owned discoverability, a concrete tag/version guard, NPM_TOKEN hygiene + tag protection, and minor corrections.

_Part of #83 (P0 sprint). Blocks the registry blitz and launch comms._

## 1. Problem & context

`package.json` declares the **unscoped** name `pipedrive-mcp-server` at `version: 1.0.0`. That name is **owned by `willdent`** on npm (confirmed live: registry returns `200`, `dist-tags.latest = 1.0.2`, `maintainers: [willdent]`, `will@dent.ly`). We literally cannot publish under it, and every `npx -y pipedrive-mcp-server` instruction we ship installs his stale read-only competitor instead of our 155-tool server.

The scoped target `@ckalima/pipedrive-mcp-server` is **available** (registry `GET /@ckalima%2Fpipedrive-mcp-server` → `404`, i.e. first publish, never used). `publishConfig.access` is already `"public"`, which is required for a public scoped package.

State found in the worktree (`agent/84-rename-pkg-provenance`):

- **`package.json`** — `name: pipedrive-mcp-server`, `version: 1.0.0`. Already has `description` and a `keywords` array (`mcp`, `pipedrive`, `crm`, `claude`, `ai`, `model-context-protocol`) and `repository` (`https://github.com/ckalima/pipedrive-mcp-server`) but **no `bugs` and no `homepage` field**. `bin` maps the unscoped name `pipedrive-mcp-server` → `./dist/index.js`. `publishConfig.access: public`. `files: ["dist","README.md","LICENSE"]` (no `.npmignore`). `prepublishOnly: npm run build`. `engines.node: >=20`.
- **`src/index.ts`** — line **33** `const SERVER_NAME = "pipedrive-mcp-server"` and line **34** `const SERVER_VERSION = "1.0.0"` are **hardcoded** (line 32 is the `// Server metadata` comment). Used in the MCP `Server({ name, version })` handshake and in `console.error` startup logs. The version is duplicated from `package.json` and will drift if only one is bumped.
- **CI** — single workflow `.github/workflows/ci.yml`: triggers on push/PR to `main`, matrix `node-version: [20, 22]`, steps `npm ci → build → lint → test`, using `actions/checkout@v4` + `actions/setup-node@v4` (current pins are **floating major tags**, not SHAs — relevant context for the SHA-pinning decision below). This is the `ci(20)`/`ci(22)` branch-protection contexts referenced in memory. **No release/publish workflow exists.**
- **No `CHANGELOG.md`.** **Zero git tags** (`git tag -l` empty). **Zero GitHub releases** (a maturity signal evaluators check).
- **`bundle/`** (the MCPB working tree) is **tracked** — 107 files under `git ls-files bundle/`, including a stale hand-written `bundle/manifest.json` (`name: pipedrive-mcp`, `version: 1.0.0`, only 43 tools listed vs. the real 155) and compiled `bundle/server/*.js`. The compiled `bundle/server/index.js:9` and `bundle/server/index.d.ts:9` carry the `npx pipedrive-mcp-server` usage comment.
- **Root `.mcpb` artifact `pipedrive-mcp-1.0.0.mcpb` (3.3 MB) is tracked** in git. **This is a stale `1.0.0`-named bundle (see real-bug note in §4/§5).**
- **`dist/` is gitignored** and is produced only by `npm run build`. A `npm pack` with no prior build yields a **3-file tarball (LICENSE, README, package.json) and ZERO server code** — the dist-in-tarball gate in §4/§6 exists to make this failure loud.
- **155 tools, ~90k tokens** (`npx tsx scripts/measure-tools.ts`: `tools: 155`, `definition bytes: 361424`).

### Install-snippet / name references found (exact)
| File:line | Current text | Needs change in #84? |
|---|---|---|
| `package.json:2` | `"name": "pipedrive-mcp-server"` | **Yes** → scoped name |
| `package.json:8` (`bin`) | `"pipedrive-mcp-server": "./dist/index.js"` | **Decision** (keep unscoped bin command vs. scoped) — see §3 |
| `package.json:3` | `"version": "1.0.0"` | **Yes** → 2.0.0 |
| `README.md:31` | `"args": ["-y", "pipedrive-mcp-server"]` | **Yes** → scoped name |
| `README.md:147-148` | `git clone .../pipedrive-mcp-server.git` / `cd pipedrive-mcp-server` | No (these are the **repo** name/URL, unchanged) |
| `README.md:214` | Report-issues link to repo | No (repo URL) |
| `src/index.ts:10` (comment) | `*   npx pipedrive-mcp-server` | **Yes** (cosmetic, keep accurate) |
| `src/index.ts:33` | `SERVER_NAME = "pipedrive-mcp-server"` | **Decision** — MCP server id; keep stable or rename (see §3) |
| `src/index.ts:34` | `SERVER_VERSION = "1.0.0"` | **Yes** → 2.0.0 (or derive — see §4) |
| `bundle/manifest.json:3` | `"name": "pipedrive-mcp"` | **#85's file** — leave to #85 (flag, do not edit) |
| `bundle/server/index.js:9`, `index.d.ts:9` | `npx pipedrive-mcp-server` | **#85's territory** (generated/compiled bundle) — leave to #85 |
| `CONTRIBUTING.md:8` | fork clone URL | No (repo URL, and it's `YOUR_USERNAME`) |
| `docs/api/README.md:5-6` | issue links | No (repo URL) |

## 2. Goals / non-goals

### Goals
1. `package.json` published-ready under `@ckalima/pipedrive-mcp-server` at `2.0.0`, with `repository`/`bugs`/`homepage` complete and discoverability metadata (`description` + `keywords`, already present) intact.
2. A **release workflow** that publishes to npm **with provenance** via GitHub Actions OIDC on a version tag, with **SHA-pinned third-party actions**, **per-job least-privilege permissions**, and a **hard dist-in-tarball publish gate**.
3. Every **first-party install snippet we control** (README `npx` arg, `src/index.ts` usage comment + `SERVER_VERSION`) uses the scoped name / new version.
4. **`CHANGELOG.md`** seeded at `2.0.0` (Keep a Changelog format), highlights-only backfill, with an explicit note that there is **no public 1.x under the scoped name**.
5. **GitHub Release** per tag with notes (close the "zero releases" gap), with the notes step gated so a notes failure does **not** block the npm publish.
6. Provable acceptance: cold `npx -y @ckalima/pipedrive-mcp-server` boots the server; `npm view … --json` carries provenance/attestation metadata; npm page shows the provenance badge.

### Non-goals (explicitly out of scope — belongs to siblings)
- **#85**: `scripts/gen-docs.ts` generator, regenerating `bundle/manifest.json` from `allTools`, **untracking `bundle/` and the root `.mcpb`**, generating a **fresh in-sync `.mcpb` in CI**, **and attaching that fresh `.mcpb` to the GitHub Release** (moved out of #84 — see §4/§5 real-bug note), and the CI **drift gate**. #84 must **not** edit `bundle/manifest.json` or the compiled `bundle/server/*` files, and must **not** change the `bundle/`/`.mcpb` git-tracking state. (See §5 for the ordering dependencies.)
- **#86** and other sprint issues: not touched here.
- **#89 (launch comms)** — the config-migration message that tells users to switch to the scoped name. #84 is independently mergeable but its *product value* depends on #89 (see §5 cross-issue).
- **#93 (Dependabot)** — owns keeping the `github-actions` ecosystem SHAs current; #84 pins them, #93 maintains them (see §4).
- Renaming the **GitHub repo** or any repo-URL references (the repo stays `ckalima/pipedrive-mcp-server`; only the **npm package name** is scoped).
- Reducing the 155-tool / 90k-token footprint (tracked elsewhere).

## 3. Decisions (with recommendations)

### D1 — Version number: **2.0.0** ✅ recommended
The package was **never published under `@ckalima/...`**, so by strict semver a first publish could be `1.0.0`. Recommend **2.0.0** anyway, purely for **disambiguation**:
- The unscoped `pipedrive-mcp-server@1.0.x` (willdent's) and our internal `1.0.0` create a collision of meaning. Starting the scoped line at `2.0.0` cleanly disambiguates "the 155-tool server" from both willdent's package and our own pre-scope `1.0.0` artifacts (the tracked `pipedrive-mcp-1.0.0.mcpb`, the `bundle/manifest.json` `1.0.0`).
- Cost is zero: no existing scoped consumers to break.
- _Alternative considered_: `1.0.0` (technically "correct" first-publish) — rejected because it maximizes confusion against the two other `1.0.0` artifacts in our own tree and willdent's `1.0.x`.
- _Note (CHANGELOG):_ the `2.0.0` entry must include a line stating **there is no public 1.x under the scoped name** — the version jump is disambiguation, not a feature-count or maturity signal.

**Single source of truth:** bump `package.json` → `2.0.0` and `src/index.ts` `SERVER_VERSION` → `2.0.0` together. See §4/D5 for optionally deriving `SERVER_VERSION` from `package.json` to prevent future drift (recommend the manual bump for #84 to keep the diff small, and **note** the drift risk as a follow-up).

### D2 — `bin` command name: **keep `pipedrive-mcp-server` (unscoped key)** ✅ recommended
The `bin` **key** is the CLI command name, independent of the package name. Recommend keeping `bin: { "pipedrive-mcp-server": "./dist/index.js" }`:
- `npx -y @ckalima/pipedrive-mcp-server` resolves the bin by the package's single bin entry regardless of its key, so the acceptance command works either way.
- Keeping the short command name avoids an awkward `npx @ckalima/pipedrive-mcp-server pipedrive-mcp-server`-style invocation and matches the existing `SERVER_NAME`.
- _Accepted trade-off:_ the unscoped `bin` key **collides with willdent's identically-named `bin`** on **global installs** (`npm i -g`). This is accepted because the **supported entrypoint is the package-scoped** `npx -y @ckalima/pipedrive-mcp-server`, which is unambiguous; we do not document or support a global install.
- _Alternative_: rename bin to the scoped string — rejected (scopes aren't valid as a bare shell command and add no value).

### D3 — `SERVER_NAME` (MCP server identity): **keep `"pipedrive-mcp-server"`** ✅ recommended
This is the MCP protocol server name in the initialize handshake, not an npm identifier. Clients may key config/telemetry off it. Renaming it is a silent breaking change to anyone who matched on it. Keep it stable; only fix the **comment** at `src/index.ts:10`.

### D4 — Provenance auth: **RESOLVED (2026-06-12) → token-bootstrap-then-OIDC** ✅
**Gate answered (see OQ1):** npm does **not** allow pre-registering a trusted publisher for a never-published package, so the first publish **cannot** use OIDC. **Committed path:** `release.yml` ships the `NPM_TOKEN` bootstrap (granular token + `id-token: write` + `npm publish --provenance --access public`) for the first `v2.0.0`; after the package exists, register the trusted publisher and switch to OIDC, then revoke the token (§9).

npm supports OIDC **trusted publishing**: configure `@ckalima/pipedrive-mcp-server` on npmjs.com to trust this repo + workflow, then the publish job needs only `permissions: id-token: write` and runs `npm publish` (provenance is automatic — the `--provenance` flag is no longer needed) with **no `NPM_TOKEN` secret**. This is the most secure steady-state path (no long-lived token to leak/rotate) and yields the provenance badge — but it is reachable **only after** the token-bootstrapped first publish.

**The first `2.0.0` publish is immutable.** We do **not** ship a "commented-out runtime branch" that hedges both auth paths. Instead, OQ1 is a **pre-implementation gate** that must be resolved *before* the release workflow is written:

- **Pre-implementation step (blocking):** empirically confirm on npmjs.com whether a **trusted publisher can be pre-registered for the never-published `@ckalima/pipedrive-mcp-server`** (npm's "pending"/"new package" trusted-publisher setup).
  - **If yes →** commit to **OIDC-first**. The workflow ships with **no token**, `permissions: { contents: write, id-token: write }` on the publish job only, and `npm publish --provenance --access public`.
  - **If no →** make **`NPM_TOKEN` the EXPLICIT bootstrap path** for the *first* publish (a real, wired step — not a commented branch), then **switch to OIDC** for subsequent releases once the package exists and the trusted publisher can be registered. The token is then **revoked** (see §9).
- The plan **does not assert "it's both."** Exactly one path is live at any time; the choice is made by the pre-implementation probe, recorded in the PR, and reflected in the committed `release.yml`.

#### D4-fallback — `NPM_TOKEN` (granular automation token), preconditions
When the fallback path is selected for the bootstrap publish, **all** of the following are mandatory:
- **`permissions: id-token: write` MUST remain present even with `NPM_TOKEN`.** Provenance is generated from the GitHub Actions **OIDC id-token**, independent of the publish *auth*. Dropping `id-token: write` silently disables provenance even though publish still succeeds.
- The token MUST be a **granular-access automation token**, **not** a classic token, scoped to **publish** for the single package (see §9 for scope/rotation).
- `npm publish --provenance --access public` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` on the publish step only.
- **Post-publish assertion (job-failing):** `npm view @ckalima/pipedrive-mcp-server --json` MUST contain attestation/provenance metadata; if absent, **fail the job** (a successful-but-unsigned publish is a defect, not a pass).

### D5 — Release trigger: **push of a `v*` tag** ✅ recommended
Trigger the publish workflow on `push: tags: ['v*.*.*']`. Rationale:
- Tag push is the conventional, auditable trigger; the tag is the immutable release coordinate.
- The same workflow can **create the GitHub Release** from the tag (e.g. `softprops/action-gh-release` pinned to a SHA, or `gh release create`), so "tag → npm publish + GitHub Release" is one flow.
- Add `workflow_dispatch` for manual **dry-runs only** (publish-skipping). The tag/version guard and `gh release create "$TAG"` steps are gated so a dispatch run (where `GITHUB_REF_NAME` is a *branch*, not a tag) does **not** mis-fire (see §4 guard).
- _Alternative_: trigger on `release: published`. Rejected as primary because it splits release creation from publish and is easier to fire accidentally; fine as a variant if the human prefers UI-driven releases. **Open question OQ3.**

## 4. File-by-file change list

### Edit — `package.json`
- `name`: `"pipedrive-mcp-server"` → `"@ckalima/pipedrive-mcp-server"` (line 2).
- `version`: `"1.0.0"` → `"2.0.0"` (line 3).
- Add `"bugs": { "url": "https://github.com/ckalima/pipedrive-mcp-server/issues" }`.
- Add `"homepage": "https://github.com/ckalima/pipedrive-mcp-server#readme"`.
- **Discoverability (#84-owned):** keep the existing `description` and `keywords` array; ensure the `description` clearly identifies this as the scoped 155-tool Pipedrive MCP server (so a user who lands on the unscoped/stale package or an old snippet can find `@ckalima/...` via npm search). No new dependency on #89 — this is metadata #84 ships itself.
- **Do NOT** normalize `repository.url` to the `git+…/.git` form. Per scope-guardian this is a low-value cosmetic change in a publish-critical diff and adds review surface for no functional gain; leave `repository.url` as-is.
- Leave `bin` key as-is (D2), `publishConfig.access: public` as-is, `files` allowlist as-is.
- _Verify_ `files` still produces a valid tarball (see §6) — it ships `dist`, `README.md`, `LICENSE` only; `bundle/` and the root `.mcpb` are **not** in `files`, so they won't bloat the npm tarball (good; leave to #85 to untrack from git). **Note:** because `dist/` is gitignored and build-produced, the tarball is empty of server code unless `npm run build` ran first — enforced by the §4 release-workflow gate, not left to chance.

### Edit — `src/index.ts`
- Line 10 comment: `*   npx pipedrive-mcp-server` → `*   npx -y @ckalima/pipedrive-mcp-server`.
- Line 34: `SERVER_VERSION = "1.0.0"` → `"2.0.0"`.
- Line 33 `SERVER_NAME`: **no change** (D3). _(Line 32 is the `// Server metadata` comment, not a code line.)_
- _Optional, recommended as a note not a hard requirement:_ derive `SERVER_VERSION` from `package.json` (e.g. `import pkg from "../package.json" assert { type: "json" }`) to kill the duplication. **Caveat:** requires `resolveJsonModule`/import-assertions support and a `tsconfig`/`files` review (the JSON must resolve at runtime from `dist`). Given #84 should ship small and low-risk, recommend the **manual bump** now and file a follow-up for the derive. Flag in OQ2.

### Edit — `README.md`
- Line 31: `"args": ["-y", "pipedrive-mcp-server"]` → `"args": ["-y", "@ckalima/pipedrive-mcp-server"]`.
- Add a short "Install" note near Quick Start: `npx -y @ckalima/pipedrive-mcp-server` (the canonical command), and optionally an MCPB/Desktop install line.
- **Discoverability note (#84-owned):** add one short sentence near Quick Start that the supported package is the **scoped** `@ckalima/pipedrive-mcp-server`, so a reader who arrived from the unscoped/stale package or an old snippet is redirected to the correct one. (This is the README-level complement to the `package.json` metadata; the *full* migration message lives in #89.)
- **Do NOT** change the `git clone`/`cd` lines (147-148) or issue links (these are repo URLs, unchanged).
- **README overlap with #85** — see §5. Keep #84's README edits confined to the **install-command** block to minimize conflict surface with #85's tool-table regeneration.

### New file — `.github/workflows/release.yml`
Separate workflow from `ci.yml` (do **not** fold publish into CI). Shape:

**Triggers & permissions**
- `on: push: tags: ['v*.*.*']` plus `workflow_dispatch` (D5, dispatch = dry-run only).
- **Workflow-wide default permissions are restrictive:** `permissions: {}` (or `contents: read`) at the **top level**. Do **not** grant `id-token: write` or `contents: write` workflow-wide.
- **Per-job least privilege:** declare `permissions: { contents: write, id-token: write }` **only inside the `publish` job**. _Rationale:_ this is the repo's highest-privilege workflow; a future test/attach/lint job in the same file must **not** inherit `id-token: write` (which can mint OIDC tokens) or `contents: write`. Scoping at the job level contains the blast radius.

**Third-party action pinning (P1 security)**
- **Every third-party action MUST be pinned to an immutable commit SHA**, with a human-readable tag in a trailing comment, e.g.:
  - `actions/checkout@<sha>  # v4.x.x`
  - `actions/setup-node@<sha>  # v4.x.x`
  - `softprops/action-gh-release@<sha>  # v2.x.x`
- Floating major tags (`@v4`, `@v2`) are **not** acceptable in this `contents: write` + `id-token: write` workflow — a moved tag would run unreviewed code with publish + token-minting rights.
- **Coordinate with #93 (Dependabot `github-actions` ecosystem):** Dependabot keeps these SHAs current with reviewed PRs, so pinning does not freeze them at stale/insecure versions. (The existing `ci.yml` still uses floating `@v4` tags; whether to retro-pin `ci.yml` is #93's call, not #84's — #84 only pins the new `release.yml`.)

**Job `publish` on `ubuntu-latest`, steps:**
- `actions/checkout@<sha>`
- `actions/setup-node@<sha>` with `node-version: 22`, `registry-url: 'https://registry.npmjs.org'`, `cache: npm`
- `npm ci`
- `npm run build` (also covered by `prepublishOnly`, but an explicit build keeps the tarball deterministic and guarantees `dist/` exists for the gate below)
- **Tag/version guard (tag-push path only):** assert the pushed tag matches `package.json` version. Concrete shell:
  ```sh
  PKG=$(node -p "require('./package.json').version")
  TAG=${GITHUB_REF_NAME#v}
  if [ "$PKG" != "$TAG" ]; then
    echo "tag $TAG != package.json $PKG"; exit 1
  fi
  ```
  This step (and `gh release create "$TAG"`) MUST be gated with `if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')` so a `workflow_dispatch` run — where `GITHUB_REF_NAME` is a **branch** — does **not** mis-fire the guard or attempt a release. Dispatch is **publish-skipping / dry-run only**.
- **Hard dist-in-tarball gate (P1 feasibility — publish-blocking, AFTER build, BEFORE publish):** assert the staged tarball actually contains the server code, so an empty/`dist`-less tarball can never be published:
  ```sh
  test -f dist/index.js
  # Cross-check the *staged tarball* (not just the working tree):
  FILES=$(npm pack --dry-run --json | jq '.[0].files | length')
  npm pack --dry-run --json | jq -e '.[0].files[] | select(.path == "dist/index.js")' >/dev/null \
    || { echo "tarball is missing dist/index.js (dist not built?)"; exit 1; }
  echo "tarball file count: $FILES"
  # Sanity floor: a real tarball is many files, not the 3-file (LICENSE/README/package.json) empty case.
  [ "$FILES" -gt 3 ] || { echo "tarball has only $FILES files — dist appears empty"; exit 1; }
  ```
  (Verified ground truth: with no `dist/`, `npm pack` yields exactly LICENSE + README + package.json = 3 files and zero server code; `dist/` is gitignored.)
- **`npm publish`** with the auth path chosen by the D4 pre-implementation probe:
  - **OIDC-first:** `npm publish --provenance --access public` (no `NODE_AUTH_TOKEN`).
  - **Bootstrap fallback:** `npm publish --provenance --access public` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` **and** `id-token: write` still present (D4-fallback preconditions).
  - Set `NPM_CONFIG_LOGLEVEL: warn` on the publish step to avoid token-in-log exposure. **Never `cat`/print `.npmrc`.**
- **Post-publish provenance assertion (job-failing):** `npm view @ckalima/pipedrive-mcp-server --json` must contain attestation/provenance metadata; fail the job otherwise (catches a silent un-signed publish under either auth path).
- **GitHub Release step (gated, non-blocking):** `softprops/action-gh-release@<sha>` (or `gh release create "$TAG" --notes-file …`) creating the release for the pushed tag with notes sourced from the matching `CHANGELOG.md` section. **Gate this step so a notes/release failure does NOT block or fail the npm publish** (the publish is the irreversible step and must be treated as the success criterion; the GitHub Release is recoverable and can be retried/created manually). Use `continue-on-error: true` on the release step (or run it in a dependent job that does not gate publish) so a release hiccup can't fail an already-published version.
- **`.mcpb` attach — REMOVED from #84 (real bug, see §5).** Do **not** add an attach step in #84. Leave a placeholder comment in `release.yml`:
  ```yaml
  # TODO(#85): attach .mcpb once gen-docs produces it in CI
  ```

### New file — `CHANGELOG.md`
- Keep a Changelog format, starting at `## [2.0.0] - 2026-06-12`.
- Highlights-only backfill: scoped-name first publish; 155 tools across deals/persons/orgs/activities/notes/leads/projects/products/tasks/boards/phases/mail/fields/pipelines/users; provenance-signed; destructive ops gated by `PIPEDRIVE_ENABLE_DESTRUCTIVE`; v2-first with v1 fallback.
- **Include an explicit line: "No public 1.x exists under the scoped name `@ckalima/pipedrive-mcp-server`; the line starts at 2.0.0 to disambiguate from the unrelated unscoped `pipedrive-mcp-server` package and pre-scope internal artifacts."**
- **Do not** fabricate a granular pre-2.0.0 history; a single `2.0.0` entry summarizing the surface is sufficient and honest (no prior published versions existed under this name).

### No-edit (flag for #85, do not touch in #84)
- `bundle/manifest.json` (name `pipedrive-mcp`, stale 43-tool list, version 1.0.0) — **#85 regenerates** from `allTools`.
- `bundle/server/index.js` / `index.d.ts` usage comments — compiled output, #85's generator territory.
- Root `pipedrive-mcp-1.0.0.mcpb` tracked artifact — **#85 untracks** `bundle/` + `.mcpb` and produces a fresh in-sync `.mcpb`. **#84 must not reference or attach this stale artifact** (see §5 real-bug note).

## 5. Sequencing & cross-issue coordination

### Internal order of operations for #84 (implement phase)
0. **Pre-implementation (blocking, out-of-band):** run the D4/OQ1 probe on npmjs.com — can a trusted publisher be pre-registered for the never-published scoped package? Record the answer; it determines whether `release.yml` ships OIDC-first or with the explicit `NPM_TOKEN` bootstrap step.
1. `package.json` (name, version 2.0.0, bugs, homepage; keep description/keywords; **no** repository normalization).
2. `src/index.ts` (`SERVER_VERSION` → 2.0.0, line-10 comment; `SERVER_NAME` unchanged).
3. `README.md` install-command edit (scoped name) + scoped-package discoverability sentence.
4. `CHANGELOG.md` (new, 2.0.0 entry incl. the "no public 1.x" line).
5. `.github/workflows/release.yml` (new — SHA-pinned actions, top-level `permissions: {}`, per-job perms, tag/version guard, **hard dist gate**, post-publish provenance assertion, gated non-blocking GitHub Release, `# TODO(#85)` .mcpb placeholder).
6. **Out-of-band (human/registry config):** per the step-0 result, either configure the npm trusted publisher (OIDC-first) **or** create the granular automation `NPM_TOKEN` (bootstrap) **and** create the GitHub tag-protection ruleset (see §9) — all **before** the first tag push.
7. Tag `v2.0.0` → workflow publishes (provenance-asserted) + creates GitHub Release.

### Real bug fixed by review: drop the stale-`.mcpb` attach from #84
The previously-proposed attach step guarded by `if: hashFiles('*.mcpb') != ''` is **wrong**: that glob would **MATCH the stale tracked `pipedrive-mcp-1.0.0.mcpb`** and attach the **wrong (1.0.0) bundle** to the **2.0.0** GitHub Release. So #84 **omits the `.mcpb` attach entirely** and leaves a `# TODO(#85): attach .mcpb once gen-docs produces it in CI` placeholder. The `.mcpb` attach becomes **#85's** concern, sequenced **after** #85 untracks the stale `1.0.0` artifact and generates a fresh, in-sync bundle in CI. This also removes the guarded-glob and dead-conditional complexity from #84's workflow.

### Cross-issue: #89 (launch comms) — named dependency
#84 publishes the scoped package, but its **product value** — users actually reaching the 155-tool server instead of willdent's unscoped competitor — is only **realized once #89 ships the config-migration message** (telling existing/prospective users to switch their `.mcp.json` / Desktop config to `@ckalima/pipedrive-mcp-server`). Recording the coupling:
- **#84 remains independently mergeable** (publishing the package does not require #89).
- **#84 owns its own discoverability** even before #89: the `package.json` `description`/`keywords` and the README scoped-package note (above) help a user who lands on the wrong/stale package find `@ckalima/...` through npm search or the repo, without waiting on launch comms.
- **#89 owns the active push:** the announcement, the migration snippet, and steering users off the old unscoped snippet. Mark #89 as the dependency that converts #84's publish into adoption.

### Cross-issue: #93 (Dependabot) — SHA maintenance
#84 pins `release.yml`'s third-party actions to SHAs; **#93 keeps them current** via the `github-actions` Dependabot ecosystem. Coordinate so #93's config covers `.github/workflows/release.yml`.

### Cross-issue: overlapping files with #85 (sequence to avoid merge conflicts)
Two shared concerns:
- **`README.md`** — #84 edits **only** the install-command block (line ~31 `npx` arg + a Quick Start install/discoverability note). #85 (per its brief) regenerates the **tool tables** ("Available Tools" section, lines ~58-130). These are **disjoint sections**; conflict risk is low **if** both stay in their lane. **Recommendation:** land #84's README edit first (smaller, install-only); #85 rebases its tool-table regeneration on top. If #85 lands first, #84's one-line `npx` change rebases trivially.
- **CI / release surface** — #84 adds a **new** `release.yml` (does **not** edit `ci.yml`). #85 adds a **drift-gate** step/job. If #85 edits `ci.yml` (or adds its own workflow) and #84 only adds `release.yml`, **there is no overlap** (different files). **Recommendation:** keep #84 strictly additive (`release.yml` only). The **`.mcpb` attach now lives entirely in #85** (see real-bug note), so #85's `release.yml` touch — if any — is the *only* place the attach step appears; coordinate there. Flag to the implementer: confirm whether #85 adds its attach/drift logic to the shared `release.yml` or its own workflow. (OQ5.)

## 6. Test / verification plan

The package is **not yet published**, so acceptance splits into pre-publish (local, in CI) and post-publish (live) gates.

### Pre-publish (must pass before tagging)
- `npm run build` clean; `npm test` green (~1,698 vitest tests) — `SERVER_VERSION`/`SERVER_NAME` changes must not break the handshake or any test asserting them. **Grep tests for `1.0.0`/`SERVER_VERSION`/`pipedrive-mcp-server`** to catch assertions that pin the old values before bumping.
- **Hard dist-in-tarball assertion (CI, not advisory):** the release workflow's gate (§4) — `test -f dist/index.js` plus `npm pack --dry-run --json | jq` confirming `dist/index.js` is in the staged tarball and file-count `> 3` — is a **publish-blocking** step. (Reframed from the old advisory `npm pack --dry-run` check: an empty `dist`-less tarball must **fail CI**, not merely be eyeballed.) Confirm `package.json` resolves to `@ckalima/pipedrive-mcp-server@2.0.0` and `bin` resolves to `dist/index.js`.
- `npm publish --dry-run --provenance --access public` locally (will warn provenance only works in CI, but validates the manifest, scope, and access).
- **Tag/version guard** in the workflow (see §4) verified by intentionally mismatching once in a dispatch dry-run (dispatch is publish-skipping, so this is safe).

### Post-publish (live acceptance — issue's Definition of Done)
- **Cold `npx`:** on a clean machine / fresh npm cache (`npm cache clean --force` or a container), run `PIPEDRIVE_API_KEY=… npx -y @ckalima/pipedrive-mcp-server` and confirm it boots (STDIO server starts, `[pipedrive-mcp-server] Starting server v2.0.0…` on stderr) and lists 155 tools.
- **Claude Desktop / Code:** drop the scoped `npx` config (README block) into `.mcp.json` / Desktop config with a real `PIPEDRIVE_API_KEY`; confirm tools load and a read call (e.g. list deals) returns.
- **Provenance (asserted in CI + verified live):** the workflow's post-publish `npm view @ckalima/pipedrive-mcp-server --json` provenance/attestation check must have passed (job would have failed otherwise); additionally visit `https://www.npmjs.com/package/@ckalima/pipedrive-mcp-server` and confirm the **"Provenance"** section/badge renders with the GitHub Actions build link.
- **GitHub Release:** confirm a release exists for `v2.0.0` with CHANGELOG-sourced notes. (The `.mcpb` asset is **#85's** deliverable — verify it there, once #85 untracks the stale `1.0.0` artifact and attaches a fresh bundle.)

## 7. Risks & mitigations
- **Publishing a broken / empty-tarball / unsigned 2.0.0 (immutable):** npm versions can't be overwritten; a bad publish wastes the version. _Mitigation:_ the **hard dist-in-tarball gate** (fails the job if `dist/index.js` is absent or the tarball is the 3-file empty case), the **tag/version guard**, the **post-publish provenance assertion** (fails on a silent un-signed publish), plus `npm pack/publish --dry-run` + full green CI **before** tagging.
- **OIDC / trusted-publishing misconfig (first publish fails or unsigned):** provenance silently absent or `403`. _Mitigation:_ resolve OQ1 **before** implementing (D4 pre-implementation probe) so the workflow ships the *correct single* auth path, not a hedged dual branch; keep `permissions: id-token: write` present **even on the token fallback** (provenance depends on it); verify via the post-publish assertion and the live badge.
- **Highest-privilege workflow runs unreviewed third-party code:** `contents: write` + `id-token: write` on a workflow using floating action tags is a supply-chain risk (a moved tag mints tokens / writes releases). _Mitigation:_ **SHA-pin every third-party action** in `release.yml`; **scope `id-token: write`/`contents: write` to the `publish` job only** (top-level `permissions: {}`); **#93/Dependabot** keeps SHAs current.
- **`workflow_dispatch` mis-firing the tag guard / release step:** on dispatch, `GITHUB_REF_NAME` is a branch, not `v*`. _Mitigation:_ gate the guard and `gh release create` steps with `if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')`; dispatch is dry-run/publish-skipping.
- **Attaching the wrong (stale 1.0.0) `.mcpb`:** the `hashFiles('*.mcpb')` glob would match the tracked `pipedrive-mcp-1.0.0.mcpb`. _Mitigation:_ **#84 ships no attach step**; it's deferred to #85 (after the stale artifact is untracked) — see §5.
- **NPM_TOKEN leakage / over-scope:** a classic or `@ckalima/*`-wide token in a public-ish workflow log is a real exposure. _Mitigation:_ granular automation token scoped to the **single package**, `NPM_CONFIG_LOGLEVEL: warn`, never print `.npmrc`, **revoke once OIDC is confirmed** (see §9).
- **Version drift between `package.json` and `src/index.ts` `SERVER_VERSION`:** two hardcoded sources. _Mitigation:_ bump both in the same commit; the tag/version guard catches a `package.json`↔tag mismatch; file the "derive from package.json" follow-up (OQ2).
- **Breaking unscoped consumers:** no real risk — we were never publishable as `pipedrive-mcp-server` (willdent owns it). Anyone currently running `npx pipedrive-mcp-server` is running **his** server, not ours; moving to the scoped name is the fix, not a break. _Action:_ **#89** launch comms must tell users to switch their config to the scoped name (the old snippet was always wrong-target).
- **README/CI merge conflict with #85:** _Mitigation:_ §5 lane-separation (install-block only; `release.yml` additive only; `.mcpb` attach owned by #85).
- **GitHub-Release-notes failure blocking publish:** _Mitigation:_ the release-notes step is **gated/non-blocking** (`continue-on-error` or a dependent job), so a notes hiccup can't fail an already-published immutable version.

## 8. Open questions (need human decision)
- **OQ1 — RESOLVED (2026-06-12).** npm does **not** allow pre-registering a trusted publisher for a never-published package (unlike PyPI; per [npm docs](https://docs.npmjs.com/trusted-publishers/) — *"It's not possible to publish the initial version of a package using OIDC; it needs to be published manually or using a token"*). **Committed single path:** the first `v2.0.0` publish runs in `release.yml` via a **granular `NPM_TOKEN`** + `permissions: id-token: write` + `npm publish --provenance --access public` — token-based provenance is supported (the attestation comes from the Actions OIDC id-token, not the publish auth; [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements/)), so 2.0.0 ships **signed**. **After** the package exists: register the trusted publisher on npmjs.com (user `ckalima`, repo `pipedrive-mcp-server`, workflow filename `release.yml`, allowed action `npm publish`), switch the workflow to OIDC (drop `NODE_AUTH_TOKEN` and the now-redundant `--provenance` flag), and **revoke** the `NPM_TOKEN` (§9).
- **OQ2 — Derive `SERVER_VERSION` from `package.json` now, or follow-up?** (Default: manual bump in #84, follow-up issue for the derive to keep this diff small.)
- **OQ3 — Release trigger: `v*` tag push (default) vs. `release: published`?** UI-driven release creation vs. tag-driven. (Default: tag push, workflow creates the GH Release.)
- **OQ4 — CHANGELOG backfill depth.** Single honest `2.0.0` entry incl. the "no public 1.x" line (recommended), or a richer backfilled history of pre-scope internal milestones? (Default: single 2.0.0 entry — nothing was published under this name before.)
- **OQ5 — Does #85 edit `ci.yml`, add its own workflow, or touch `release.yml` for the drift gate / `.mcpb` attach?** Confirms the CI-surface overlap and where the (now #85-owned) `.mcpb` attach lands. (Default assumption: #84 is additive-only via `release.yml`; the attach step is #85's.)

## 9. Prerequisites & secret hygiene (out-of-band, human/registry config)
These are **not** code edits in #84 but are gating prerequisites recorded here so implement-phase doesn't miss them.

- **npm trusted publisher (OIDC) OR `NPM_TOKEN` (per the OQ1 probe):**
  - **OIDC-first:** register the trusted publisher for `@ckalima/pipedrive-mcp-server` → repo `ckalima/pipedrive-mcp-server` + workflow `release.yml`, before the first tag push.
  - **NPM_TOKEN bootstrap:** create a **granular-access automation** token scoped to **publish** for the **single package** `@ckalima/pipedrive-mcp-server` (**not** `@ckalima/*`, **not** a classic token). Store as repo secret `NPM_TOKEN`. **Revoke it once OIDC trusted publishing is confirmed working.** Document the rotation procedure (who rotates, on what cadence until revoked).
- **GitHub tag-protection ruleset (prerequisite):** add a ruleset restricting creation of `v*.*.*` tags to **admins**, so a release can't be triggered by an unauthorized tag push. This is a **second layer**; the in-workflow tag/version guard (§4) is **not** the only protection. The guard prevents *mismatched* tags; the ruleset prevents *unauthorized* ones.
- **`@ckalima` scope ownership:** confirm the publishing identity owns/controls the `@ckalima` scope before tagging (scoped first-publish needs `--access public`, already set, **and** scope ownership).
