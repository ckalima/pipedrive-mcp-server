# Launch Comms Pack

Reviewed, ready-to-send copy for the v2.0.0 launch, plus the go/no-go gate that controls
when any of it goes out. Tracks issue [#89](https://github.com/ckalima/pipedrive-mcp-server/issues/89)
(part of the [#83](https://github.com/ckalima/pipedrive-mcp-server/issues/83) P0 sprint).

This file is a **drafting and review artifact**. Drafting is unblocked and done here; **sending
is a separate, human-only step** gated by the checklist below. Nothing in this pack should be
posted until every gate item is green, so that every link lands on a product matching its claims.

## Decision context

Ship first, communicate second. No thread reply or public post goes out until the npm rename,
regenerated docs, and registry listings are live. Tone is factual: state what the server is and
how it is verified, and let the properties stand on their own. No competitor comparisons or
naming in any public copy.

---

## Go / No-Go gate

Do **not** send any item below until all of these are true. Each maps to a blocking issue.

| Gate | Tied to | Check it's done by |
|---|---|---|
| ✅ Package published to npm as `@ckalima/pipedrive-mcp-server` with provenance, installable via `npx -y @ckalima/pipedrive-mcp-server` | [#84](https://github.com/ckalima/pipedrive-mcp-server/issues/84) | `npm view @ckalima/pipedrive-mcp-server version` returns the released version |
| ✅ README tool table + `bundle/manifest.json` regenerated and on `main` (155 tools, no CI drift) | [#85](https://github.com/ckalima/pipedrive-mcp-server/issues/85) | CI green on `main`; README shows **155 tools** |
| ✅ Core registry listings live and accurate (scoped package, 155-tool count; Glama no longer shows 38). Smithery is deferred by design and awesome-mcp-servers is an open PR; neither blocks comms, since the copy links to the repo and npm, not to individual registries. | [#86](https://github.com/ckalima/pipedrive-mcp-server/issues/86) | `docs/registry-submissions.md`: #1 Official, #2 Glama, #4 mcp.so, #5 PulseMCP all live (see §3 for the Smithery deferral) |

**Send order once green:** (1) Pipedrive devcommunity reply → (2) r/ClaudeAI → (3) r/sales →
(4) any newsletter/HN item, individually, only if it still reads well on the day. Stagger, don't
blast: post one, watch for replies, then proceed.

---

## Canonical one-liner + descriptions

Reuse verbatim. The **description (<160 chars)** is shared character-for-character with the
metadata pack in [`docs/registry-submissions.md`](registry-submissions.md) so every surface says
the same thing; the one-liner below is for comms surfaces only.

- **One-liner:** Open-source MCP server for Pipedrive CRM: 155 tools, v2-first, MIT licensed.
- **Description (<160 chars):**
  `MCP server for Pipedrive CRM. 155 tools spanning deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields.`
- **npm:** `@ckalima/pipedrive-mcp-server`
- **Repo:** https://github.com/ckalima/pipedrive-mcp-server

### The rubric (factual claims, all independently checkable)

Every public draft draws only from this list. Nothing here is comparative.

- **MIT licensed**, published to npm with build provenance.
- **API v2-first.** Every entity uses Pipedrive's v2 REST API where it exists; v1 is used only
  for capabilities with no v2 equivalent (notes, mail, users, leads CRUD).
- **Destructive ops gated by default.** Deletes/conversions are disabled until you set
  `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`; read-and-create only out of the box. Tools also carry MCP
  `readOnlyHint`/`destructiveHint`/`idempotentHint` annotations.
- **Contract-tested against the real OpenAPI spec.** Params, request bodies, and response shapes
  are checked against the vendored Pipedrive OpenAPI v2 definition, so v2 tools can't silently
  drift from the documented API.
- **Live-smoke verified** against a real account, including plan-gated endpoints (Growth+ deal
  installments). Write smokes assert the field value actually changed on the wire, not just a 200.
- **1,700+ tests passing** (1,741 at time of writing) across unit, integration, and contract suites.
- **Honest limits:** STDIO transport only today (no remote/HTTP transport); auth is a Pipedrive
  API key (matches the local/self-hosted tier this targets); no hosted OAuth.

---

## Draft 1: Pipedrive devcommunity thread (#20195) reply

> **Reviewer note before sending:** read thread 20195 in full and tailor the opening sentence to
> the actual question asked. The body below is written to stand on factual merits against a neutral
> rubric; do not add competitor names or comparisons. Keep it to one post.

---

For anyone evaluating an MCP server to drive Pipedrive from an AI assistant, here's a concrete
rubric worth applying to any option you look at, and where this open-source one lands on each:

- **License:** MIT, published to npm with build provenance, as `@ckalima/pipedrive-mcp-server`.
- **API version:** v2-first. Every entity uses Pipedrive's v2 REST API where it exists; v1 is
  used only where there's no v2 equivalent (notes, mail, users, leads CRUD).
- **Coverage:** 155 tools across deals, persons, organizations, activities, products, projects,
  tasks, leads, notes, mail, and fields.
- **Safety on writes:** destructive operations (deletes/conversions) are disabled by default and
  only enabled behind an explicit env flag, so it's read-and-create until you opt in. Every tool
  also exposes MCP read/destructive/idempotent hints for policy-aware clients.
- **Correctness:** the v2 tools are contract-tested against Pipedrive's published OpenAPI v2
  spec, and the surface is live-smoke verified against a real account (including Growth+ deal
  installments). 1,700+ tests in CI.

STDIO transport today, API-key auth. Repo and full tool table:
https://github.com/ckalima/pipedrive-mcp-server

Happy to answer questions about specific endpoints or the v1→v2 migration coverage.

---

## Draft 2: r/ClaudeAI

**Title:** Open-source Pipedrive MCP server: 155 tools, v2-first, MIT

I've published an MCP server that lets Claude (Code or Desktop) work directly against Pipedrive
CRM: query, create, and update deals, persons, organizations, activities, products, projects,
tasks, leads, notes, mail, and fields. 155 tools total.

A few things I cared about building it:

- **v2-first.** Uses Pipedrive's v2 REST API everywhere it exists; v1 only for the handful of
  capabilities without a v2 equivalent.
- **Safe by default.** Deletes and other irreversible writes are gated behind an env flag, so out
  of the box it's read-and-create only. Tools carry MCP read/destructive/idempotent hints.
- **Verified, not vibes.** The v2 tools are contract-tested against Pipedrive's OpenAPI spec, and
  the surface is smoke-tested against a real account. 1,700+ tests in CI. MIT licensed, npm
  provenance.

Config is a standard `.mcp.json` block with an API key:

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

Repo: https://github.com/ckalima/pipedrive-mcp-server. Feedback and issues welcome.

---

## Draft 3: r/sales

**Title:** Built an open-source way to run Pipedrive from an AI assistant (Claude): sharing it free

If you live in Pipedrive and use an AI assistant, this connects the two. Once it's set up you can
ask things like "show me open deals over $10k," "create a deal for Acme at $50k," or "what custom
fields are on deals," and it acts on your actual Pipedrive data.

It's free and open-source (MIT). Notes for the sales-ops minded:

- Covers the day-to-day surface: deals, contacts, organizations, activities, products, leads,
  notes, and email threads (155 tools).
- **It won't delete anything unless you explicitly turn that on.** Default mode is read-and-create
  only, which is the safe setting for a live CRM.
- Setup is an API key from Pipedrive (Settings → Personal preferences → API) dropped into a config
  file. No third-party service in the middle; it runs locally.

Repo + setup steps: https://github.com/ckalima/pipedrive-mcp-server

Not selling anything. Happy to answer setup questions in the comments.

---

## Other channels (list only; do not commit without a separate decision)

- **Hacker News "Show HN":** plausible fit ("Show HN: Open-source Pipedrive MCP server for
  Claude"). High variance; only worth it on a day someone can babysit the thread for the first few
  hours. Title must be plain and factual.
- **MCP newsletters / roundups:** several MCP-focused newsletters and "this week in MCP" roundups
  exist; the registry listings (#86) feed these automatically once live. Confirmed at launch: the
  official-registry publish auto-listed this server on PulseMCP and LobeHub with no manual step, so a
  manual newsletter submission is usually redundant. The awesome-mcp-servers PR may also surface it.
- **r/pipedrive (or other Pipedrive-specific sub):** unverified activity level as of this writing:
  **check member count and recent post cadence before committing.** A dead sub isn't worth a post;
  if it's active and allows tool shares, reuse the r/sales draft with a Pipedrive-native framing.
- **MCP Discord / community servers:** a single factual share in the relevant channel, only where
  self-promotion is permitted by that server's rules.

---

## Acceptance (issue #89)

- [x] devcommunity reply drafted (factual, rubric-based, no competitor naming)
- [x] Reddit drafts for r/ClaudeAI and r/sales; Pipedrive sub listed as to-verify
- [x] Launch one-liner + <160-char description (shared verbatim with the #86 metadata pack)
- [x] Other channels identified as a list, not committed
- [x] Explicit go/no-go checklist tied to #84 / #85 / #86 completion
