# Release process

How a new version of `@ckalima/pipedrive-mcp-server` ships. This is a living
runbook: when a release teaches us something, update it here.

## What publishes, and where

| Target | How | Trigger |
|--------|-----|---------|
| npm (`@ckalima/pipedrive-mcp-server`, with provenance) | `.github/workflows/release.yml` via OIDC trusted publishing (no token) | Pushing a `v*.*.*` tag (admin-only ruleset) |
| GitHub Release | same workflow, notes pulled from the matching `## [x.y.z]` CHANGELOG section | same tag push |
| Official MCP registry | `mcp-publisher` CLI against `server.json` | manual, after npm publish |
| `.mcpb` bundle (optional) | `npm run bundle:mcpb` (`scripts/build-mcpb.ts`) | manual |

The workflow is the only thing that touches npm, and it is the irreversible
step. It hard-checks that the pushed tag equals `package.json`'s version and that
the tarball actually contains `dist/index.js` before publishing.

## Version is single-sourced to package.json

`package.json` `version` is canonical. These must agree with it on the commit the
tag points at; `tests/unit/version-consistency.test.ts` and
`tests/unit/gen-docs.test.ts` fail the build if any drifts:

| Source | How it's set | Guarded by |
|--------|--------------|-----------|
| `package.json` | edit by hand | release workflow (tag == version) |
| `src/index.ts` `SERVER_VERSION` | edit by hand | `version-consistency.test.ts` |
| `server.json` (root + `packages[0].version`) | edit by hand | `version-consistency.test.ts` |
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

## Post-release (separate from the workflow)

- **MCP registry**: publish the bumped `server.json` with `mcp-publisher`. Auth is
  non-interactive - the saved registry JWT (`~/.config/mcp-publisher/token.json`)
  expires after a few days, so re-login each release using your existing GitHub
  token (`gh auth token`) rather than the browser device flow:

  ```
  mcp-publisher validate server.json
  mcp-publisher login github -token "$(gh auth token)"
  mcp-publisher publish
  ```

  Keep `server.json`'s `environmentVariables` accurate (currently `PIPEDRIVE_API_KEY`,
  `PIPEDRIVE_MODE`, `PIPEDRIVE_ENABLE_DESTRUCTIVE`, `PIPEDRIVE_IMAGE_BASE_DIR`).
- **`.mcpb`**: `npm run bundle:mcpb` from a fresh `npm run build`. `bundle/server/`
  is gitignored and rebuilt at pack time, so always pack from a clean build; a
  stale local `bundle/server/` is not a shipping risk but must not be packed.

## Known improvements / TODO

- The Release workflow attaches no `.mcpb` asset yet (TODO(#85) in `release.yml`).
- `SERVER_VERSION` and `server.json` are hand-maintained; they are now drift-tested
  but could instead be derived from `package.json` at build time to remove the
  manual step entirely.
- npm publish and the MCP-registry publish are separate actions; the registry step
  is easy to forget. Non-interactive auth is confirmed working (via a GitHub token),
  so this could be folded into the Release workflow using
  `mcp-publisher login github-oidc` on the tag-push job.
