# Registry Submissions

One metadata pack, submitted to six registries. This doc is the single source of truth for
how the Pipedrive MCP server is described everywhere it is listed, plus the exact steps to
submit or refresh each listing.

Tracks issue [#86](https://github.com/ckalima/pipedrive-mcp-server/issues/86) (registry blitz).

> **What is committed to this repo vs. what you run by hand**
>
> This repo carries the machine-readable descriptors: [`server.json`](../server.json) (official
> MCP registry), [`smithery.yaml`](../smithery.yaml) (Smithery), and the `mcpName` field in
> `package.json` (npm-ownership proof for the official registry). The actual submissions below
> are outward-facing actions that publish publicly and require your accounts/credentials. Run
> them yourself using the commands and payloads in this doc.

---

## Canonical metadata pack

Reuse these values verbatim across every registry so the listings stay consistent.

| Field | Value |
|---|---|
| **Name (display)** | Pipedrive CRM |
| **Official registry name** | `io.github.ckalima/pipedrive-mcp-server` |
| **npm package** | `@ckalima/pipedrive-mcp-server` |
| **Description (<160 chars)** | MCP server for Pipedrive CRM. 155 tools spanning deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields. |
| **Transport** | stdio |
| **Auth** | API key via `PIPEDRIVE_API_KEY` env var (40-char Pipedrive token) |
| **Optional env** | `PIPEDRIVE_ENABLE_DESTRUCTIVE=true` to expose delete tools (off by default) |
| **Tool count** | **155** (authoritative; matches the generated `bundle/manifest.json` and README table) |
| **License** | MIT |
| **Repository** | https://github.com/ckalima/pipedrive-mcp-server |
| **Language / scope (awesome legend)** | 📇 TypeScript · ☁️ Cloud Service |

> **Official-registry exception (100-char description cap).** The official MCP registry schema
> caps `server.json`'s `description` at **100 characters**, so [`server.json`](../server.json)
> carries a shortened 96-char variant: _"MCP server for Pipedrive CRM. 155 tools for deals,
> persons, organizations, activities, and more."_ Every other surface (npm, comms, registries 2-6
> below) uses the 151-char description above. Re-confirm `server.json` passes the registry schema
> any time with `mcp-publisher validate` (no auth required).

### Tool profile (155 total, grouped by primary entity)

| Entity | Tools | | Entity | Tools |
|---|---|---|---|---|
| Deals | 34 | | Boards & phases | 10 |
| Products | 24 | | Leads | 8 |
| Persons | 18 | | Pipelines & stages | 9 |
| Organizations | 16 | | Notes | 5 |
| Projects | 14 | | Tasks | 5 |
| Activities | 5 | | Mail | 3 |
| Users | 3 | | Fields | 1 |

Counts are grouped by the primary entity in each tool name and sum to 155.

### Example client config snippet

```json
{
  "mcpServers": {
    "pipedrive": {
      "command": "npx",
      "args": ["-y", "@ckalima/pipedrive-mcp-server"],
      "env": {
        "PIPEDRIVE_API_KEY": "your-40-character-api-key"
      }
    }
  }
}
```

---

## Submission status

| # | Registry | Mechanism | Status |
|---|---|---|---|
| 1 | Official MCP registry | `mcp-publisher` + `server.json`, **auto-published on tag push** (npm **and** mcpb packages) | ✅ **Live** (2026-06-13, status `active`) |
| 2 | Glama | Web listing refresh (re-index/claim) | ✅ **Live** (2026-06-14; claimed, scoped pkg, 155 tools, ratings A/A/A) |
| 3 | Smithery | `.mcpb` bundle / hosted URL (model changed) | ⏸️ **Deferred** (MCPB vs. Smithery schema conflict; see §3) |
| 4 | mcp.so | Self-registration form | ✅ **Live** (2026-06-14, [`/server/pipedrive-crm`](https://mcp.so/server/pipedrive-crm)) |
| 5 | PulseMCP | Auto-imported from the official registry | ✅ **Live** (2026-06-14; no form needed) |
| 6 | awesome-mcp-servers (punkpeye) | PR | ⏳ **PR open** ([#8065](https://github.com/punkpeye/awesome-mcp-servers/pull/8065)) |

Update this table as each listing goes live.

> **The official registry seeds downstream catalogs.** Publishing to the official MCP registry (#1)
> propagated automatically: **PulseMCP (#5)** imported the listing with no form submission, and
> **LobeHub** (outside the original six, at https://lobehub.com/mcp/ckalima-pipedrive-mcp-server)
> also lists it. mcp.so (#4) had a pre-existing auto-crawled entry as well. Net effect: once #1 was
> live, several catalogs needed little or no manual work.

---

## 1. Official MCP registry

> ✅ **Submitted and live (2026-06-13).** Published via `mcp-publisher publish`; the registry
> reports `io.github.ckalima/pipedrive-mcp-server` version `2.0.0`, status `active`, `isLatest:
> true`. Verify with the `curl` below.

The official registry feeds client-side discovery (Claude Desktop, Cursor, VS Code). It hosts
**metadata only** — the package itself lives on npm (and, for the mcpb package, as a `.mcpb`
asset on the GitHub Release).

> **Now automated.** As of the `.mcpb` release-automation change, the `registry` job in
> `.github/workflows/release.yml` publishes this entry on every `v*` tag push (after the npm
> publish succeeds). `server.json` carries two packages — the npm package and a `registryType:
> "mcpb"` package pointing at the Release's `.mcpb` asset; CI injects the asset's real
> `fileSha256` (committed as an all-zeros sentinel) before publishing. See `docs/RELEASE.md`.

**Prerequisite — already met (no patch release needed).** The registry verifies ownership by
fetching the published package's `package.json` and checking that `mcpName` matches
`server.json`'s `name`. The published **`2.0.0` tarball already carries**
`mcpName: io.github.ckalima/pipedrive-mcp-server`, which matches `server.json`, so ownership
verifies against `2.0.0` directly. Confirm any time:

```bash
npm view @ckalima/pipedrive-mcp-server mcpName    # -> io.github.ckalima/pipedrive-mcp-server
```

> Historical note: an earlier draft of this runbook assumed `2.0.0` had shipped without
> `mcpName` and told you to publish a `2.0.1` first. That was wrong — `2.0.0` was never published
> until the field was already in `package.json`, so the patch-release dance is unnecessary.

Install the publisher CLI and publish the registry entry:

```bash
# Install mcp-publisher (macOS/Linux)
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
# or: brew install mcp-publisher   (it's in homebrew-core)
#   Homebrew 6.0+ note: if `brew install` aborts with "Refusing to load formula ... from
#   untrusted tap", that's brew's mandatory tap-trust gate tripping on unrelated third-party
#   taps, not on mcp-publisher. Trust the taps you use (`brew trust <user>/<tap> ...`) or
#   untap ones you don't, then re-run. mcp-publisher itself is core and always trusted.

# Pre-flight: validate server.json against the live registry schema (no auth needed).
# Catches schema errors (e.g. the 100-char description cap) before you log in.
mcp-publisher validate          # expect: "✅ server.json is valid"

# Authenticate. GitHub auth grants the io.github.ckalima/* namespace — log in as the
# GitHub user "ckalima".
mcp-publisher login github      # device flow: open https://github.com/login/device, enter the code

# Publish (run from repo root, where server.json lives)
mcp-publisher publish
```

Verify:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ckalima/pipedrive-mcp-server"
```

> Consider automating future republishes with the official "Publish MCP Server" GitHub Action
> so the registry entry tracks each npm release.

---

## 2. Glama (refresh the stale listing)

> ✅ **Done (2026-06-14).** Listing claimed and re-indexed. Now shows the scoped
> `@ckalima/pipedrive-mcp-server`, **155 tools**, current version, ratings License A / Quality A /
> Maintenance A (Maintenance improved from B), no duplicate. The steps below are retained for
> reference and future refreshes.

Existing listing: **https://glama.ai/mcp/servers/@ckalima/pipedrive-mcp-server**

Verified stale state (2026-06-13): shows ~40 tools, install command points at the **unscoped**
`npx -y pipedrive-mcp-server` (a *different* owner's package, not ours), version `1.0.0`, and the
old generic description. Ratings are License A / Quality A / Maintenance B, worth preserving.
Glama auto-indexes from GitHub, so a re-index picks up the corrected tool count, the scoped
package, and `2.0.0` now that the rename + 155-tool README are on `main`.

1. Sign in at https://glama.ai with the GitHub account that owns the repo (`ckalima`).
2. Open the listing above and **claim / refresh** it.
3. Trigger a re-index (Glama re-reads the repo). Confirm:
   - Tool count reads **155** (not ~40).
   - Install command shows the scoped `@ckalima/pipedrive-mcp-server` (not the unscoped name).
   - Version reads **2.0.0**; description matches the canonical pack above.
4. Keep the existing Quality A rating; do not create a duplicate listing.

---

## 3. Smithery (deferred)

> ⏸️ **Deferred (2026-06-14).** Smithery changed its model and no longer fits this server cleanly.
> Revisit if its tooling stabilizes.

`smithery.yaml` (committed at repo root) is still correct: it declares a stdio server launched via
`npx -y @ckalima/pipedrive-mcp-server` with an API-key config schema. The blocker is on Smithery's
side, not in our descriptor.

**What changed.** Smithery dropped the old "connect a GitHub repo with `smithery.yaml`" path for
stdio servers. The submit flow now requires **either**:

1. a **hosted HTTP server URL**, which we decline on purpose (a CRM connector should not centralize
   every user's Pipedrive API key behind a shared endpoint), or
2. a **local `.mcpb` bundle**, published via
   `npx -y @smithery/cli@latest mcp publish <bundle.mcpb> -n <namespace>`.

**Why the bundle path fails.** We can build a valid `.mcpb` (`npm run bundle:mcpb`), but
`smithery mcp publish` returns a 400 with one "expected object, received undefined" per tool (155
of them): Smithery validates a per-tool **`inputSchema`** in the bundle manifest. The MCPB manifest
standard does **not** carry `inputSchema` on tool entries, and enriching it makes `mcpb validate` /
`mcpb pack` reject the manifest ("Unrecognized key(s): inputSchema"). The two schemas are mutually
exclusive, so a single bundle cannot satisfy both; a Smithery listing would need a hand-zipped,
non-standard bundle maintained outside our `gen:docs` discipline. Smithery's publish endpoint also
has open bugs (smithery-ai/cli #770) at the time of writing.

**To revisit later:** re-check whether Smithery accepts a standard MCPB bundle (no per-tool
`inputSchema`), or whether the MCPB manifest spec adds an `inputSchema` field. Either change removes
the conflict.

---

## 4. mcp.so

> ✅ **Live (2026-06-14)** at **https://mcp.so/server/pipedrive-crm**. Submitted via the "Edit
> Server" form with the scoped package, canonical description, and 155 tools. **No duplicate of
> ours:** mcp.so keys listings by name + author (`/server/<name>/<author>`), so the
> `/server/pipedrive-mcp-server` slug is a disambiguation page for two *unrelated* third-party
> servers of the same name (`binarapps`, `WillDent`), not this one. Naming ours "Pipedrive CRM" /
> `pipedrive-crm` sidesteps that collision. mcp.so 403s automated reads, so verify by eye.

Self-registration form (no CLI).

1. Go to https://mcp.so and open the "Submit" / "Add server" form.
2. Fill from the canonical pack. Ready-to-paste payload (field names may vary slightly on the form):

   | Form field | Value |
   |---|---|
   | Name | `Pipedrive CRM` |
   | Repository URL | `https://github.com/ckalima/pipedrive-mcp-server` |
   | npm package | `@ckalima/pipedrive-mcp-server` |
   | Description | `MCP server for Pipedrive CRM. 155 tools spanning deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields.` |
   | Transport | `stdio` |
   | License | `MIT` |
   | Config snippet | the example block under "Canonical metadata pack" above |

---

## 5. PulseMCP

> ✅ **Live (2026-06-14)** at **https://www.pulsemcp.com/servers/ckalima-pipedrive**, with no form
> submission. PulseMCP **auto-imported** the listing from the official registry (#1): it shows
> `io.github.ckalima/pipedrive-mcp-server`, 155 tools, and the correct repo. The manual form below
> was not required.

Submission form (no CLI).

1. Go to https://www.pulsemcp.com and open the server submission form.
2. Fill from the canonical pack. Ready-to-paste payload:

   | Form field | Value |
   |---|---|
   | Name | `Pipedrive CRM` |
   | Repository URL | `https://github.com/ckalima/pipedrive-mcp-server` |
   | npm package | `@ckalima/pipedrive-mcp-server` |
   | Description | `MCP server for Pipedrive CRM. 155 tools spanning deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields.` |
   | Tool count | `155` |
   | Transport | `stdio` |
   | License | `MIT` |

---

## 6. awesome-mcp-servers (punkpeye)

> ⏳ **PR open (2026-06-14):** [punkpeye/awesome-mcp-servers#8065](https://github.com/punkpeye/awesome-mcp-servers/pull/8065)
> — one line added to **Customer Data Platforms**, including the Glama score badge. Awaiting
> maintainer merge. (`CONTRIBUTING.md` offers an agent fast-track: append `🤖🤖🤖` to the PR title.)

Open a PR against https://github.com/punkpeye/awesome-mcp-servers.

- **Section:** `Customer Data Platforms` (👤) — the closest fit for a CRM. If a maintainer prefers,
  `Other Tools and Integrations` is the common fallback for CRM servers.
- **Placement (verified 2026-06-13 against `main`):** there is **no existing pipedrive entry** in
  the file, so this is a fresh line (no duplicate). Insert in alphabetical position by repo owner:
  `ckalima` (c) goes **after the `a*` entries** (`antv/mcp-server-chart`, `azmartone67/...`) and
  **before** the `embeddedlayers`/`hustcc` entries. The section isn't strictly sorted in practice,
  so a maintainer mainly checks that `c` sits sensibly after `a`.
- **Legend:** 📇 (TypeScript) ☁️ (Cloud Service). ☁️ is **correct** despite the local stdio process:
  punkpeye's own legend note defines cloud as "talking to remote APIs" (their example: a weather
  API), and this server talks to the remote Pipedrive REST API. Do **not** use 🎖️; that marks
  vendor-official servers, and this is a third-party Pipedrive integration.

Exact entry line submitted (legend + formatting verified against neighboring entries; includes the
Glama score badge, matching peers in the section):

```markdown
- [ckalima/pipedrive-mcp-server](https://github.com/ckalima/pipedrive-mcp-server) [![ckalima/pipedrive-mcp-server MCP server](https://glama.ai/mcp/servers/ckalima/pipedrive-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/ckalima/pipedrive-mcp-server) 📇 ☁️ - MCP server for [Pipedrive CRM](https://www.pipedrive.com). 155 tools covering deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields. stdio transport, API-key auth, delete tools gated behind an env flag. Published on npm as `@ckalima/pipedrive-mcp-server`. MIT.
```

Follow the repo's `CONTRIBUTING.md` (verified: it requires alphabetical order within a category,
one entry per line, and consistent punctuation/capitalization, all satisfied above).

---

## Acceptance (issue #86)

Target: each listing carries the **scoped** package, an accurate **155**-tool count, and the
canonical description. Status as of 2026-06-14: **#1 Official, #2 Glama, #4 mcp.so, and #5 PulseMCP
are live and correct** (Glama no longer says 38 tools); **#6 awesome-mcp-servers** is an open PR
([#8065](https://github.com/punkpeye/awesome-mcp-servers/pull/8065)) pending maintainer merge; **#3
Smithery is deferred** (see §3) because its current submission model conflicts with the MCPB bundle
standard. Five of six covered, with Smithery the documented exception.
