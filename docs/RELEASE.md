# Release process

How a new version of `@ckalima/pipedrive-mcp-server` ships. This is a living
runbook: when a release teaches us something, update it here.

## What publishes, and where

| Target | How | Trigger |
|--------|-----|---------|
| npm (`@ckalima/pipedrive-mcp-server`, with provenance) | `.github/workflows/release.yml` via OIDC trusted publishing (no token) | Pushing a `v*.*.*` tag (admin-only ruleset) |
| GitHub Release | same workflow, notes pulled from the matching `## [x.y.z]` CHANGELOG section | same tag push |
| `.mcpb` bundle + `.sha256`, attached to the GitHub Release | `release.yml` builds it (`npm run bundle:mcpb`) and attaches it | same tag push |
| Official MCP registry (npm **and** mcpb packages) | `release.yml` `registry` job: `mcp-publisher` via OIDC; the real `fileSha256` is injected from the attached bundle by `scripts/registry-inject.ts` | same tag push (after `publish` succeeds) |

The `publish` job is the only thing that touches npm, and it is the irreversible
step. It hard-checks that the pushed tag equals `package.json`'s version and that
the tarball actually contains `dist/index.js` before publishing.

The `registry` job runs only after `publish` succeeds. It publishes the registry entry (both
the npm and mcpb packages) via OIDC, with the mcpb `fileSha256` injected from the exact `.mcpb`
the `publish` job attached — so the registry never advertises a hash that disagrees with the
downloadable bundle. The registry does **not** validate that hash itself; MCP clients do, at
install time, which is why getting it from the attached artifact (never hand-typed) matters.

## Version is single-sourced to package.json

`package.json` `version` is canonical. These must agree with it on the commit the
tag points at; `tests/unit/version-consistency.test.ts` and
`tests/unit/gen-docs.test.ts` fail the build if any drifts:

| Source | How it's set | Guarded by |
|--------|--------------|-----------|
| `package.json` | edit by hand | release workflow (tag == version) |
| `src/index.ts` `SERVER_VERSION` | edit by hand | `version-consistency.test.ts` |
| `server.json` (root version, both package `version`s, and the mcpb download URL) | edit by hand | `version-consistency.test.ts` |
| `bundle/manifest.json` `version` | **do not hand-edit** - `npm run gen:docs` derives it from `package.json` | `gen-docs.test.ts` |

## Versioning policy (semver)

This project follows semver. Judgment calls that have come up:

- Tightening a default that disables a previously-on capability (e.g. the
  `file_path` reads hardening, or capability modes hiding destructive tools from
  `tools/list` by default) has been shipped as a **minor** with prominent
  CHANGELOG migration notes, on the grounds that explicitly-configured setups
  keep working and the change fails safe. A stricter reading would call these
  **major**. Decide per release and say so in the CHANGELOG.

## Pre-release checklist

1. All intended work is merged to `main` (branch-protected: PRs + `ci(20)`/`ci(22)`).
2. `CHANGELOG.md` `[Unreleased]` captures **everything since the last tag**, not
   just the latest feature. Cross-check with `git log --no-merges vX.Y.Z..main`.
3. Decide the version number (see policy above).
4. `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run gen:docs` are all
   clean with no drift.

## Release steps

1. **Bump the version** in `package.json`, `src/index.ts` (`SERVER_VERSION`), and
   `server.json` (both `version` fields). Then `npm run gen:docs` to refresh
   `bundle/manifest.json`.
2. **Finalize the CHANGELOG**: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`,
   leave a fresh empty `## [Unreleased]` above it, and add the
   `[X.Y.Z]: https://github.com/.../releases/tag/vX.Y.Z` link line.
3. **Run the full gate locally**: `npm test` (includes the version-consistency and
   gen-docs drift tests), `npx tsc --noEmit`, `npm run lint`. Optionally
   `workflow_dispatch` the Release workflow from `main` for a publish-skipping
   dry-run that still builds and validates the tarball.
4. **Merge** the release commit to `main` (via PR).
5. **Tag and push**: `git tag vX.Y.Z && git push origin vX.Y.Z` (admin). The
   workflow publishes to npm with provenance and cuts the GitHub Release.
6. **Verify**: npm shows the version with a provenance badge; the GitHub Release
   exists with the CHANGELOG notes.

## Post-release (now automated by the workflow)

Both used to be manual; the Release workflow now does them on the tag push:

- **`.mcpb` bundle**: the `publish` job builds it (`npm run bundle:mcpb` from a fresh build;
  `bundle/server/` is gitignored and rebuilt at pack time) and attaches the `.mcpb` plus a
  `.sha256` sidecar to the GitHub Release.
- **MCP registry**: the `registry` job publishes the bumped `server.json` (npm + mcpb packages)
  via `mcp-publisher login github-oidc`, after injecting the attached bundle's real hash. Keep
  `server.json`'s `environmentVariables` accurate (currently `PIPEDRIVE_API_KEY`,
  `PIPEDRIVE_MODE`, `PIPEDRIVE_ENABLE_DESTRUCTIVE`, `PIPEDRIVE_IMAGE_BASE_DIR`).

### Manual fallback / back-publishing a missed version

If the `registry` job did not run (e.g. it predates a release) or you need to publish a version
whose entry was never created, run the local fallback. The registry version is immutable, so the
published `fileSha256` MUST match the bytes clients download — fetch the target release's `.mcpb`
asset and pass its path so the hash comes from that exact file (never a rebuild, never hand-typed):

```
gh release download vX.Y.Z --pattern '*.mcpb'      # the durable asset for that version
npm run registry:publish -- ./pipedrive-mcp-server-X.Y.Z.mcpb
git checkout server.json                           # restore the committed sentinel hash
```

`registry:publish` authenticates with `gh auth token` and runs `mcp-publisher validate && publish`.
A version published with the WRONG hash is unrecoverable (immutable) — you would have to cut a new
version.

## Known improvements / TODO

- `SERVER_VERSION`, `server.json`'s versions, and the mcpb download URL are hand-maintained;
  they are drift-tested (`version-consistency.test.ts`) but could be derived from
  `package.json` at build time to remove the manual step entirely.
- The committed mcpb `fileSha256` is an all-zeros sentinel that CI overwrites at publish. The
  OIDC → `io.github.ckalima` namespace mapping is proven only on a real tag push;
  `npm run registry:publish` (GitHub-token auth) is the fallback if it ever needs troubleshooting.
