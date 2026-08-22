# Release process

How a new version of `@ckalima/pipedrive-mcp-server` ships. This is a living runbook: when a release teaches us something, update it here.

## What publishes, and where

| Target | How | Trigger |
|--------|-----|---------|
| npm (`@ckalima/pipedrive-mcp-server`, with provenance) | `.github/workflows/release.yml` via OIDC trusted publishing (no token) | Pushing a `v*.*.*` tag (admin-only ruleset) |
| GitHub Release | same workflow, notes pulled from the matching `## [x.y.z]` CHANGELOG section | same tag push |
| `.mcpb` bundle + `.sha256`, attached to the GitHub Release | `release.yml` builds it (`npm run bundle:mcpb`) and attaches it | same tag push |
| Official MCP registry (npm **and** mcpb packages) | `release.yml` `registry` job: `mcp-publisher` via OIDC; the real `fileSha256` is injected from the attached bundle by `scripts/registry-inject.ts` | same tag push (after `publish` succeeds) |

The `publish` job is the only thing that touches npm, and it is the irreversible step. It hard-checks that the pushed tag equals `package.json`'s version and that the tarball actually contains `dist/index.js` before publishing.

The `registry` job runs only after `publish` succeeds. It publishes the registry entry (both the npm and mcpb packages) via OIDC, with the mcpb `fileSha256` injected from the exact `.mcpb` the `publish` job attached — so the registry never advertises a hash that disagrees with the downloadable bundle. The registry does **not** validate that hash itself; MCP clients do, at install time, which is why getting it from the attached artifact (never hand-typed) matters.

## Version is single-sourced to package.json

`package.json` `version` is canonical. These must agree with it on the commit the tag points at; `tests/unit/version-consistency.test.ts` and `tests/unit/gen-docs.test.ts` fail the build if any drifts:

| Source | How it's set | Guarded by |
|--------|--------------|-----------|
| `package.json` | edit by hand | release workflow (tag == version) |
| `src/index.ts` `SERVER_VERSION` | edit by hand | `version-consistency.test.ts` |
| `server.json` (root version, both package `version`s, and the mcpb download URL) | edit by hand | `version-consistency.test.ts` |
| `package-lock.json` (root `version` and the `""` package entry) | edit by hand - see the warning in step 1 | nothing; `npm ci` is the only signal |
| `bundle/manifest.json` `version` | **do not hand-edit** - `npm run gen:docs` derives it from `package.json` | `gen-docs.test.ts` |

## Versioning policy (semver)

This project follows semver. Judgment calls that have come up:

- Tightening a default that disables a previously-on capability (e.g. the `file_path` reads hardening, capability modes hiding destructive tools from `tools/list` by default, or 2.5.0 gating `convert_lead_to_deal` behind `PIPEDRIVE_MODE=full`) has been shipped as a **minor** with prominent CHANGELOG migration notes, on the grounds that explicitly-configured setups keep working and the change fails safe. A stricter reading would call these **major**. Decide per release and say so in the CHANGELOG.
- Raising the `engines.node` floor has ridden along with a **minor** (2.5.0 moved it to `>=22.9.0`). It is called out in the CHANGELOG because installs below the floor get `EBADENGINE`, but the floor tracks oldest-supported-LTS, so in practice only users already off supported LTS are affected.

## Pre-release checklist

1. All intended work is merged to `main` (branch-protected: PRs + `ci(22)`/`ci(24)`).
2. `CHANGELOG.md` `[Unreleased]` captures **everything since the last tag**, not just the latest feature. Cross-check with `git log --no-merges vX.Y.Z..main`.
3. Decide the version number (see policy above).
4. `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run gen:docs` are all clean with no drift.

## Release steps

1. **Bump the version** in `package.json`, `src/index.ts` (`SERVER_VERSION`), `server.json` (both `version` fields **and** the mcpb download URL), and `package-lock.json`. Then `npm run gen:docs` to refresh `bundle/manifest.json`.

   > **Edit `package-lock.json` by hand: two `version` fields, nothing else.** Do not run `npm install --package-lock-only` to do it. On 2.5.0 that command bumped the version but also stripped `libc` metadata (`glibc`/`musl`) from optional native dependencies, because the local npm differed from the one that generated the lockfile. That metadata drives platform resolution, so shipping it would have changed which native binaries `npm ci` installs in CI. Nothing guards this file, so confirm with `npm ci --dry-run` before opening the release PR. Releases before 2.5.0 skipped the lockfile entirely and let a later dependabot bump re-sync it.
2. **Finalize the CHANGELOG**: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, leave a fresh empty `## [Unreleased]` above it, and add the `[X.Y.Z]: https://github.com/.../releases/tag/vX.Y.Z` link line.
3. **Run the full gate locally**: `npm test` (includes the version-consistency and gen-docs drift tests), `npm run typecheck`, `npm run lint`, `npm ci --dry-run` (the only check on the hand-edited lockfile). Use `npm run typecheck`, not `npx tsc --noEmit`: the latter reads `tsconfig.json`, whose `include` is `src/**/*`, so it silently skips `tests/` and `scripts/` - the exact gap `tsconfig.check.json` was added to close. Optionally `workflow_dispatch` the Release workflow from `main` for a publish-skipping dry-run that still builds and validates the tarball.
4. **Merge** the release commit to `main` (via PR).
5. **Tag and push**: `git tag vX.Y.Z && git push origin vX.Y.Z` (admin). The workflow publishes to npm with provenance and cuts the GitHub Release.
6. **Verify all four targets**, using the commands in [Verifying a release](#verifying-a-release). A green workflow is necessary but not sufficient - the registry hash in particular can publish successfully and still be wrong.

## Post-release (now automated by the workflow)

Both used to be manual; the Release workflow now does them on the tag push:

- **`.mcpb` bundle**: the `publish` job builds it (`npm run bundle:mcpb` from a fresh build; `bundle/server/` is gitignored and rebuilt at pack time) and attaches the `.mcpb` plus a `.sha256` sidecar to the GitHub Release.
- **MCP registry**: the `registry` job publishes the bumped `server.json` (npm + mcpb packages) via `mcp-publisher login github-oidc`, after injecting the attached bundle's real hash. Immediately before publishing, it downloads the bundle from the very URL it is about to advertise and re-hashes it, so a Release step that soft-failed reds the registry job instead of permanently advertising a 404. That step is `continue-on-error` on purpose (npm publish is the irreversible one) and it is also what uploads the bundle, so without this precondition a missing asset would sail straight into an immutable entry. Keep `server.json`'s `environmentVariables` accurate (currently `PIPEDRIVE_API_KEY`, `PIPEDRIVE_MODE`, `PIPEDRIVE_ENABLE_DESTRUCTIVE`, `PIPEDRIVE_IMAGE_BASE_DIR`).

### Verifying a release

The workflow going green means each job exited 0, not that what it published is correct. Two failure modes survive a green run: npm can accept a publish that carries no provenance attestation, and the registry accepts any `fileSha256` at all, because it never checks the hash itself - only MCP clients do, at install time. Since registry versions are immutable, a wrong hash there is unrecoverable and costs a whole new version to fix. So verify the artifacts, not the run.

```bash
V=X.Y.Z

# 1. npm: right version, tagged latest, and carrying a real provenance attestation
npm view @ckalima/pipedrive-mcp-server version dist-tags
npm view @ckalima/pipedrive-mcp-server@"$V" --json | jq '.dist.attestations'

# 2. GitHub Release: published (not draft) and carrying both bundle assets
gh release view "v$V" --json isDraft,assets \
  --jq '{draft: .isDraft, assets: [.assets[].name]}'

# 3. MCP registry: active and flagged latest
curl -sS "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.ckalima/pipedrive-mcp-server&version=latest" \
  | jq '.servers[] | {version: .server.version,
                      status: ._meta["io.modelcontextprotocol.registry/official"].status,
                      isLatest: ._meta["io.modelcontextprotocol.registry/official"].isLatest,
                      mcpb: (.server.packages[] | select(.registryType=="mcpb") | {identifier, fileSha256})}'

# 4. The check that actually matters: do the bytes clients download match the
#    hash the registry advertises? Re-download from the registry's own identifier
#    URL - not a local rebuild, and not CI's .sha256 sidecar, which shares a
#    source with the injected hash and so agrees even when the bundle would not.
curl -sSL "https://github.com/ckalima/pipedrive-mcp-server/releases/download/v$V/pipedrive-mcp-server-$V.mcpb" -o /tmp/verify.mcpb
shasum -a 256 /tmp/verify.mcpb
```

Step 3's `jq` path is fussier than it looks, and getting it wrong produces a confident-looking wrong answer rather than an error. The entry is nested at `.servers[].server`, so `.servers[].version` is `undefined` for every row - while `._meta["io.modelcontextprotocol.registry/official"].status` sits at the level you probably guessed and happily prints `active`. Read both fields from the paths above, or dump one entry's keys first.

### Manual fallback / back-publishing a missed version

If the `registry` job did not run (e.g. it predates a release), failed its Release-asset precondition, or you need to publish a version whose entry was never created, run the local fallback. The registry version is immutable, so the published `fileSha256` MUST match the bytes clients download — fetch the target release's `.mcpb` asset and pass its path so the hash comes from that exact file (never a rebuild, never hand-typed):

```
gh release download vX.Y.Z --pattern '*.mcpb'      # the durable asset for that version
npm run registry:publish -- ./pipedrive-mcp-server-X.Y.Z.mcpb
git checkout server.json                           # restore the committed sentinel hash
```

If the job failed specifically on **Verify the Release asset is live**, the sequence matters: npm already published (immutable, fine), but the GitHub Release or its `.mcpb` upload did not land. Repair that first - create the Release from `CHANGELOG.md`, then `gh release upload vX.Y.Z pipedrive-mcp-server-X.Y.Z.mcpb pipedrive-mcp-server-X.Y.Z.mcpb.sha256` - and only then back-publish the registry entry. Do not reach for a workaround that publishes anyway; an immutable entry pointing at a missing asset is exactly the outcome the check exists to prevent.

`registry:publish` authenticates with `gh auth token` and runs `mcp-publisher validate && publish`. A version published with the WRONG hash is unrecoverable (immutable) — you would have to cut a new version.

## Known improvements / TODO

- `SERVER_VERSION`, `server.json`'s versions, and the mcpb download URL are hand-maintained; they are drift-tested (`version-consistency.test.ts`) but could be derived from `package.json` at build time to remove the manual step entirely.
- `package-lock.json`'s version is hand-maintained and, unlike the others, **not** drift-tested, so a stale one only surfaces as an `npm ci` failure, or not at all. Extending `version-consistency.test.ts` to cover it would close the gap and is cheaper than the build-time derivation above.
- The committed mcpb `fileSha256` is an all-zeros sentinel that CI overwrites at publish. The OIDC → `io.github.ckalima` namespace mapping is proven only on a real tag push; `npm run registry:publish` (GitHub-token auth) is the fallback if it ever needs troubleshooting.
