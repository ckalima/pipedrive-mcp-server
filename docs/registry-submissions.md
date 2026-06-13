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
| 1 | Official MCP registry | `mcp-publisher` CLI + `server.json` | ☐ Not submitted |
| 2 | Glama | Web listing refresh (re-index/claim) | ☐ Stale (shows 38 tools) |
| 3 | Smithery | Publisher CLI / GitHub connect + `smithery.yaml` | ☐ Not submitted |
| 4 | mcp.so | Self-registration form | ☐ Not submitted |
| 5 | PulseMCP | Submission form | ☐ Not submitted |
| 6 | awesome-mcp-servers (punkpeye) | PR | ☐ Not submitted |

Update this table as each listing goes live.

---

## 1. Official MCP registry

The official registry feeds client-side discovery (Claude Desktop, Cursor, VS Code). It hosts
**metadata only** — the package itself lives on npm.

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
# or: brew install mcp-publisher

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

The existing Glama listing shows **38 tools** (Quality A rating worth preserving) and predates the
scoped npm rename. Glama auto-indexes from GitHub, so a re-index usually picks up the corrected
tool count and the scoped package once `server.json` + the updated README are on `main`.

1. Sign in at https://glama.ai/mcp/servers with the GitHub account that owns the repo.
2. Find the existing `pipedrive-mcp-server` listing and **claim / refresh** it.
3. Trigger a re-index (Glama re-reads the repo). Confirm:
   - Tool count reads **155**, not 38.
   - Package shows the scoped `@ckalima/pipedrive-mcp-server`.
   - Description matches the canonical pack above.
4. Keep the existing Quality A rating; do not create a duplicate listing.

---

## 3. Smithery

`smithery.yaml` (committed at repo root) declares a stdio server launched via
`npx -y @ckalima/pipedrive-mcp-server` with an API-key config schema.

1. Sign in at https://smithery.ai with GitHub and connect the repository.
2. Smithery reads `smithery.yaml` from the default branch. Confirm the deploy/listing shows the
   scoped package, stdio transport, and the `pipedriveApiKey` config field.
3. Alternatively use the CLI: `npx -y @smithery/cli@latest` and follow its publish prompts.

---

## 4. mcp.so

Self-registration form (no CLI).

1. Go to https://mcp.so and open the "Submit" / "Add server" form.
2. Fill from the canonical pack: name **Pipedrive CRM**, repo URL, npm package, the <160-char
   description, stdio transport, MIT license, and the example config snippet.

---

## 5. PulseMCP

Submission form (no CLI).

1. Go to https://www.pulsemcp.com and open the server submission form.
2. Fill from the canonical pack (name, repo, npm package, description, 155 tools, stdio, MIT).

---

## 6. awesome-mcp-servers (punkpeye)

Open a PR against https://github.com/punkpeye/awesome-mcp-servers.

- **Section:** `Customer Data Platforms` (👤) — the closest fit for a CRM. If a maintainer prefers,
  `Other Tools and Integrations` is the common fallback for CRM servers.
- **Order:** insert alphabetically by repo owner within the section.
- **Legend:** 📇 (TypeScript) ☁️ (Cloud Service). Do **not** use 🎖️ — that marks vendor-official
  servers, and this is a third-party Pipedrive integration.

Exact entry line to add:

```markdown
- [ckalima/pipedrive-mcp-server](https://github.com/ckalima/pipedrive-mcp-server) 📇 ☁️ - MCP server for [Pipedrive CRM](https://www.pipedrive.com). 155 tools covering deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields. stdio transport, API-key auth, delete tools gated behind an env flag. Published on npm as `@ckalima/pipedrive-mcp-server`. MIT.
```

Follow the repo's `CONTRIBUTING.md`: keep alphabetical order, one entry per line, match the
existing punctuation/capitalization.

---

## Acceptance (issue #86)

All six list the **scoped** package with an accurate **155**-tool count and the canonical
description; the Glama listing no longer says 38 tools.
