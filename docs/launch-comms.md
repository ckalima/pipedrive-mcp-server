# Launch Comms Pack

Reviewed, ready-to-send copy for the v2.0.0 launch, plus the go/no-go gate that controls
when any of it goes out. Tracks issue [#89](https://github.com/ckalima/pipedrive-mcp-server/issues/89)
(part of the [#83](https://github.com/ckalima/pipedrive-mcp-server/issues/83) P0 sprint).

This file is a **drafting and review artifact**. Drafting is done here; **sending is a
separate, human-only step** gated by the checklist below. Nothing fresh is posted until every
gate item is green, so that every link lands on a product matching its claims.

## Execution status (2026-06-15)

Comms are mid-flight. The go/no-go gate is fully green (#84/#85/#86 done, core registries live).
All copy below is the **humanized, postable version** with a client-origin framing ("built for
a client, open-sourced for anyone") and verified factual claims. The devcommunity show-and-tell and
the r/mcp show-and-tell are both live; **r/ClaudeAI is next** (same copy, for reach), after watching
r/mcp for replies.

| Item | Channel | Status |
|---|---|---|
| 1 | Pipedrive devcommunity, own show-and-tell topic in **App Development** | ✅ **Live** at https://devcommunity.pipedrive.com/t/open-source-pipedrive-mcp-server-155-tools-v2-first-mit/20392 |
| 2 | r/mcp, fresh top-level show-and-tell (Draft 2) — primary targeted post | ✅ **Posted** at https://www.reddit.com/r/mcp/comments/1u6q2js/pipedrive_has_no_official_mcp_server_so_we/ |
| 3 | r/ClaudeAI (Draft 2, same copy) — reach | Next to fire, after watching r/mcp for replies (stagger) |
| 4 | r/sales (Draft 3) — sales-ops / Salt & Wind angle | Staged; holds behind r/ClaudeAI (stagger) |
| 5 | r/mcp, author-update on the stale Glama bot listing (Draft 4) | ✅ Posted 2026-06-14 (correction to an existing listing; ran independently of the stagger) |

Items 1, 2, and 5 are done. Watching r/mcp for replies before firing r/ClaudeAI (Draft 2, same
copy), then r/sales (Draft 3), staggered.

## Decision context

Ship first, communicate second. No fresh post goes out until the npm rename, regenerated docs,
and registry listings are live. Tone is factual: state what the server is and how it is verified,
and let the properties stand on their own. No competitor comparisons or naming in any public copy.

---

## Go / No-Go gate

All three rows are satisfied as of 2026-06-14.

| Gate | Tied to | Check it's done by |
|---|---|---|
| ✅ Package published to npm as `@ckalima/pipedrive-mcp-server` with provenance, installable via `npx -y @ckalima/pipedrive-mcp-server` | [#84](https://github.com/ckalima/pipedrive-mcp-server/issues/84) | `npm view @ckalima/pipedrive-mcp-server version` returns the released version |
| ✅ README tool table + `bundle/manifest.json` regenerated and on `main` (155 tools, no CI drift) | [#85](https://github.com/ckalima/pipedrive-mcp-server/issues/85) | CI green on `main`; README shows **155 tools** |
| ✅ Core registry listings live and accurate (scoped package, 155-tool count; Glama no longer shows 38). Smithery is deferred by design and awesome-mcp-servers is an open PR; neither blocks comms, since the copy links to the repo and npm, not to individual registries. | [#86](https://github.com/ckalima/pipedrive-mcp-server/issues/86) | `docs/registry-submissions.md`: #1 Official, #2 Glama, #4 mcp.so, #5 PulseMCP all live (see §3 for the Smithery deferral) |

**Send order once green:** (1) Pipedrive devcommunity show-and-tell ✅ → (2) r/mcp show-and-tell
(Draft 2, primary targeted venue) → (3) r/ClaudeAI (Draft 2, same copy, for reach) → (4) r/sales
(Draft 3) → (5) any newsletter/HN item, individually, only if it still reads well on the day. The
r/mcp author-update on the old Glama bot listing (Draft 4) was a correction to an existing post and
already ran independently. Stagger, don't blast: post one, watch for replies, then proceed.

---

## Canonical one-liner + descriptions

Reuse verbatim. The **description (<160 chars)** is shared character-for-character with the
metadata pack in [`docs/registry-submissions.md`](registry-submissions.md) so every surface says
the same thing; the one-liner below is for comms surfaces only.

- **One-liner:** Open-source MCP server for Pipedrive CRM: 155 tools, v2-first, MIT licensed.
- **Description (<160 chars):**
  `MCP server for Pipedrive CRM. 155 tools spanning deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields.`
- **npm:** `@ckalima/pipedrive-mcp-server` (https://www.npmjs.com/package/@ckalima/pipedrive-mcp-server)
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

## Draft 1: Pipedrive devcommunity show-and-tell (App Development)

> **Venue decision (2026-06-14):** the original plan was to *reply* in devcommunity thread
> [#20195](https://devcommunity.pipedrive.com/t/pipedrive-mcp-server/20195). On reading it in full,
> #20195 turned out to be another author's (Gareth's) announcement of *his own* Pipedrive MCP server,
> sitting in the **Feedback** category, where a commenter had already critiqued his tool on license,
> v1 usage, and ungated destructive ops, the exact axes where ours differs. Dropping our rubric into
> his thread would read as an implicit takedown, against this pack's "no competitor comparisons"
> principle. So we posted our **own standalone show-and-tell topic in App Development** instead. Live
> URL: https://devcommunity.pipedrive.com/t/open-source-pipedrive-mcp-server-155-tools-v2-first-mit/20392

**Title:** `Open-source Pipedrive MCP server: 155 tools, v2-first, MIT`

I originally built this for a client who wanted their team to work Pipedrive through an AI assistant instead of clicking through the UI all day. It turned out general enough that there was no reason to keep it locked up, so I've open-sourced it under MIT for anyone who wants the same thing.

It's an MCP server for Pipedrive: point Claude (Code or Desktop), or any MCP client, at it and you can query, create, and update deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields. 155 tools in total.

A few things I cared about getting right, which are probably worth checking in any Pipedrive MCP server:

- **License:** MIT, including commercial use, published to npm with build provenance as `@ckalima/pipedrive-mcp-server`.
- **v2-first:** every entity uses Pipedrive's v2 REST API where it exists. I only fall back to v1 for the handful of things that have no v2 equivalent yet (notes, mail, users, leads CRUD).
- **Safe by default:** deletes and conversions are off until you explicitly set an env flag, so out of the box it can only read and create. Nothing irreversible happens unless you opt in. Every tool also carries MCP read/destructive/idempotent hints so policy-aware clients can reason about it.
- **Verified, not vibes:** the v2 tools are contract-tested against Pipedrive's published OpenAPI v2 spec, and I've live-smoke tested the whole surface against a real account (including Growth+ deal installments). Over 1,700 tests run in CI (1,741 currently).

Honest about the limits: it's STDIO transport today (no remote or HTTP transport yet), and auth is a Pipedrive API key rather than hosted OAuth. That matches the local, self-hosted way it's meant to run.

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

Repo and the full tool table: https://github.com/ckalima/pipedrive-mcp-server
On npm (MIT, published with build provenance): https://www.npmjs.com/package/@ckalima/pipedrive-mcp-server

Happy to answer questions about specific endpoints or the v1 to v2 migration coverage.

---

## Draft 2: r/mcp and r/ClaudeAI show-and-tell (same copy, posted to each, staggered)

Primary targeted venue is **r/mcp** (the dedicated MCP community). Post it with the **`showcase`**
flair — that is r/mcp's required tag for authors demonstrating their own work (rule 4), and it also
satisfies the subreddit's self-promo disclosure rule (rule 3). The copy already discloses authorship
in plain text. **r/ClaudeAI** runs the same copy for reach but is high-volume with short shelf life,
so it goes second. This is a fresh top-level submission, distinct from Draft 4 (the author-comment
correction on the old Glama bot listing) — don't cross-link the two. No config block here; the repo
link carries setup. Salt & Wind is left unnamed in this post (the named usage story lives in Draft 3).

**Title:** `Pipedrive has no official MCP server, so we open-sourced ours — 155 tools, v2-first, MIT`

Pipedrive doesn't have an official MCP server, so the options today are community-built servers or a hosted connector. Ours is one of the community ones — but we built it for real work first, then open-sourced it under MIT once it was solid.

It started on a client engagement. A sales team that basically lives in Pipedrive wanted to do their reporting and deal analysis by asking Claude instead of clicking through the UI and exporting spreadsheets all day. Once it was working it was obviously useful beyond that one account, so we cleaned it up and put it out there.

It covers most of the CRM surface, 155 tools: deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, fields. In practice we use it read-heavy — stuff like "show me open deals over $10k by stage," "which deals slipped this month," "what's the activity history on this org" all just work.

A few things we were deliberate about, mostly because pointing an AI at a live CRM made us nervous:

- It's v2-first. Everything uses Pipedrive's newer REST API v2 where it exists, and only falls back to the old v1 for the few things that still have no v2 equivalent (notes, mail, users, leads CRUD).
- Nothing destructive happens by default. Deletes and other irreversible writes stay off until you flip an env flag, so out of the box it can only read and create. Each tool also reports MCP read/destructive/idempotent hints, so the client knows what a call is about to do before it does it.
- We didn't want to trust it blindly. The v2 tools are contract-tested against Pipedrive's published OpenAPI spec, and the whole thing is smoke-tested against a real account (including Growth+ deal installments) — the write tests check the field actually changed on the wire, not just that the API said 200. Around 1,700 tests run in CI, and it's on npm with build provenance.

Repo and setup: https://github.com/ckalima/pipedrive-mcp-server
npm: https://www.npmjs.com/package/@ckalima/pipedrive-mcp-server

Feedback welcome, especially if you've built against the Pipedrive API and have opinions on what's missing.

---

## Draft 3: r/sales

**Title:** `Built a free, open-source way to run Pipedrive from an AI assistant (Claude)`

I originally built this for a client whose sales team basically lives in Pipedrive and wanted to stop clicking through screens all day. It worked well enough that I cleaned it up and made it free and open-source, so I'm sharing it here in case it's useful to anyone else.

If you use Pipedrive and an AI assistant like Claude, this connects the two. Once it's set up you can just ask things like:

- "show me open deals over $10k"
- "create a deal for Acme at $50k"
- "what custom fields do we have on deals"

and it acts on your actual Pipedrive data.

A few notes for the sales-ops minded:

- It covers the day-to-day surface: deals, contacts, organizations, activities, products, leads, notes, and email threads. 155 tools in total.
- **It will not delete anything unless you explicitly turn that on.** Out of the box it can only read and create, which is the safe setting for a live CRM you actually rely on.
- Setup is an API key from Pipedrive (Settings → Personal preferences → API) dropped into a config file. It runs locally on your own machine, with no third-party service sitting in the middle of your data.

Repo and setup steps: https://github.com/ckalima/pipedrive-mcp-server

Not selling anything, it's genuinely free (MIT licensed). Happy to answer setup questions in the comments.

---

## Draft 4: r/mcp, update the stale Glama bot listing

The Glama directory bot (`u/modelcontextprotocol`) auto-posted this server to
[r/mcp](https://www.reddit.com/r/mcp/comments/1s2bqw7/) ~3 months ago, when it had been crawled at
an early **38-tool** stage. This is our own listing, so an author update keeps the record accurate
for anyone who finds it via search. It is a correction to an existing post, not a fresh
announcement, so it runs independently of the stagger. Expect low traffic (old post, score 1); the
value is accuracy and discoverability, not a spike.

> **Reply as the author:**

Author here. This was indexed early, so the numbers are out of date. Quick update on where it's at now:

- **155 tools** (up from the 38 in this listing), covering deals, persons, organizations, activities, products, projects, tasks, leads, notes, mail, and fields.
- **v2-first.** Everything uses Pipedrive's v2 REST API where it exists; v1 only for the few capabilities with no v2 equivalent (notes, mail, users, leads CRUD).
- **Safe by default.** Deletes and other irreversible writes are gated behind an env flag, so out of the box it's read-and-create only. Every tool also carries MCP read/destructive/idempotent hints.
- **Verified, not vibes.** The v2 tools are contract-tested against Pipedrive's published OpenAPI spec, and the whole surface is live-smoke tested against a real account (including Growth+ deal installments). Over 1,700 tests in CI. MIT licensed, now on npm with build provenance.

Repo: https://github.com/ckalima/pipedrive-mcp-server
npm: https://www.npmjs.com/package/@ckalima/pipedrive-mcp-server

Happy to answer questions about specific endpoints or the v1 to v2 migration coverage.

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

- [x] devcommunity show-and-tell drafted (humanized, factual, no competitor naming) and posted (in moderation)
- [x] Reddit drafts for r/ClaudeAI and r/sales (humanized); Pipedrive sub listed as to-verify
- [x] r/mcp author update for the stale Glama bot listing drafted
- [x] Launch one-liner + <160-char description (shared verbatim with the #86 metadata pack)
- [x] Other channels identified as a list, not committed
- [x] Explicit go/no-go checklist tied to #84 / #85 / #86 completion (all green)
