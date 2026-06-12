# Becoming the Best Pipedrive MCP Server - Market Strategy

**Date:** 2026-06-12
**Status:** Draft for review
**Inputs:** devcommunity.pipedrive.com thread 20195 ("Pipedrive MCP Server"), pipedrive/client-nodejs v33.4.3 analysis, full local tool inventory (155 tools), MCP market landscape research (June 2026), measured tool-definition footprint.

---

## 1. Executive summary

There is **no official Pipedrive MCP server** as of June 2026. Every top-tier CRM competitor (HubSpot, Attio, Salesforce, Close, Monday, Zoho, Dynamics) has shipped one; an April 2026 CRM-MCP comparison explicitly calls out Pipedrive's absence. The vacuum is filled by ~14 community servers, none dominant. The community thread that prompted this exercise contains, in post #2, what amounts to a buyer's evaluation rubric: license, API version, maturity, destructive-op safety, and platform reach.

**We already win on most of that rubric** (MIT license, v2-first, destructive gating, 1,692 tests with an OpenAPI contract harness). But we have three serious problems:

1. **We are invisible.** The npm name `pipedrive-mcp-server` in our package.json is owned by a competitor (WillDent, stale since 2025-03). `npx pipedrive-mcp-server` installs *his* server. Our README documents 13 of 155 tools, the MCPB bundle manifest lists ~40, and the Glama listing shows 38. Nobody can discover what we actually built.
2. **We are the heaviest server in the market.** 155 tools = ~364 KB = **~91k tokens of tool definitions**, roughly 45% of a 200k context window on eager-loading clients. The market's #1 complaint in 2025-2026 is context bloat; GitHub's MCP server was pilloried at ~55k tokens. Winners are shipping *fewer, leaner* tools (GitHub cut 40→13 and improved benchmarks; Block cut 30+→2).
3. **We are API-key-only, stdio-only.** The enterprise wave (HubSpot, Attio) is hosted + OAuth with per-user identity and audit trails. That is a different product tier; we must decide whether to compete there or own the local/developer tier decisively.

**Strategy in one line:** keep the broad surface as our parity asset, but ship it behind *profiles* (lean default, opt-in groups, read-only mode), fix discoverability now, and differentiate on the things only we have: contract-tested correctness, safety engineering, and agent ergonomics.

---

## 2. Market landscape

### 2.1 The thread as a demand signal (devcommunity 20195)

| Post | Author | Signal |
|---|---|---|
| 1 (2026-03-26) | Gareth | Announces GarethWright/PipeDrive-MCP-Server, built on the official Node.js client. Use case cited: "management getting summary data out of Pipedrive." |
| 2 (2026-04-16) | rfeineis | **The evaluation rubric.** Praises 100 tools (94 API + 6 analytics) vs Zapier's connector. Criticizes: CC BY-NC-SA license blocks commercial use; 2 stars / 11 commits = bus-factor risk; stdio-only = no claude.ai web; built on deprecated v1 API; destructive ops exposed without approval gating. |
| 3 (2026-04-30) | miguel-escribano | n8n workflow alternative, 45 operations; "easily disable those dangerous delete nodes" - safety gating is a recurring buyer concern. |
| 5 (2026-06-01) | Gareth | Concedes the points: will refactor for v2, may relicense, positions stdio as deliberate (avoids hosting/GDPR/cost). |

Read post #2 as the market's scorecard. Scored against it today:

| Criterion (from post #2) | Gareth | Us |
|---|---|---|
| Commercial-friendly license | ✗ CC BY-NC-SA | ✓ MIT |
| Modern API version | ✗ v1 | ✓ v2-first (v1 only where no v2 exists) |
| Maturity / bus factor | ✗ 2 stars, 11 commits | ◐ deep test suite, but single maintainer |
| Destructive-op safety | ✗ ungated deletes | ✓ `PIPEDRIVE_ENABLE_DESTRUCTIVE` gate |
| Platform reach (web clients) | ✗ stdio only | ✗ stdio only |
| Analytics value-add | ✓ 6 analytics tools | ✗ none |

### 2.2 The official SDK (pipedrive/client-nodejs) - what "parity" means

- npm `pipedrive` v33.4.3 (2026-06-09), MIT, OpenAPI-generated, very active (9 releases May-June 2026), 233 stars. **Zero MCP code** - it is not a competitor, it is the parity yardstick and a build dependency for competitors (Gareth built on it).
- Surface: **v1 = 41 resource groups / ~210 operations; v2 = 24 groups / ~182 operations; ~392 total.**
- Full OAuth2 authorization-code flow with refresh - the reference implementation if we ever add OAuth.
- Its release cadence is our **parity early-warning system**: new v2 resources appear here first (e.g. `deal-installments`, `deal-products` as standalone v2 groups; a v2 `beta` group for projects/tasks).

### 2.3 Competitors

| Server | Tools | Auth | Differentiator | Weakness |
|---|---|---|---|---|
| **Us (ckalima)** | 155 actual (38 on stale Glama listing, Quality A) | API key | v2-first, contract-tested, destructive gating | Invisible; 91k-token footprint; no OAuth |
| iamsamuelfraga | 100+ | API key | Only clean npm package; rate limiting, caching, retries | Low adoption |
| GarethWright | ~100 | API key | 6 analytics tools; forum mindshare (started the thread) | v1, NC license, ungated deletes, 2 stars |
| WillDent | small | API key | **Owns the `pipedrive-mcp-server` npm name** | Read-only, stale since 2025-03 |
| bratland / osherai / others | 20-30 | API key | Read-only focus | Narrow, variably maintained |
| Zapier / Composio / Pipedream / Merge | n/a | hosted | Zero-install, multi-app | Generic, shallow per-app coverage, paid platform lock-in |
| CData | n/a | commercial | Enterprise sales channel | Read-only free tier; paid CRUD |

### 2.4 What "official-grade" looks like (CRM MCP benchmarks)

- **HubSpot** (mcp.hubspot.com, GA 2026-04): hosted streamable HTTP, OAuth, only **9 tools**, free on all tiers. Criticized for: no custom objects, no write-approval step, no caching.
- **Attio** (mcp.attio.com): hosted, OAuth, **reads auto-approved / writes require confirmation** - the emerging best-practice UX.
- **Salesforce**: local CLI-auth, 60+ tools but **dynamic toolsets** ("keeps agent context focused").
- **Close**: three-tier permission model.

Pattern: official servers are *small, hosted, OAuth, permission-tiered*. Community servers are *broad, local, API-key*. The unclaimed middle: **broad coverage with official-grade safety and context discipline**. That middle is our play.

---

## 3. Where we stand - honest scorecard

### Strengths (defensible, hard to copy)
- **v2-first** across deals, persons, orgs, activities, products, projects, pipelines, fields - completed migration epic #51. Most competitors are v1 or mixed.
- **Correctness engineering no competitor has**: 1,692 tests; contract harness validating request wire-format against vendored OpenAPI specs (`docs/api/openapi-v1.yaml`, `openapi-v2.yaml`); live smoke harnesses (`smoke:installments`, `smoke-coverage.ts` in flight); plan-entitlement knowledge (Growth+ gating of installments) baked into tool descriptions.
- **Safety posture**: destructive gate, Zod validation on every call, 9-code error taxonomy, key never logged, 30s timeouts.
- **MIT license**, the exact thing post #2 demanded.
- Depth competitors lack: installments, discounts, variations, followers, changelogs, field-options management, async lead/deal conversion with polling, multipart image upload.

### Weaknesses
| Weakness | Severity | Evidence |
|---|---|---|
| Not actually installable under our own name | **Critical** | npm `pipedrive-mcp-server` = WillDent's package (v1.0.2, 2025-03) |
| Docs lie about the product | **Critical** | README: 13/155 tools; MCPB manifest: ~40/155; Glama: 38/155 |
| Context footprint | **High** | 155 tools, 364 KB, ~91k tokens; heaviest single tools >10 KB (`update_product` 10.6 KB, `create_activity` 10.5 KB) |
| No read-only mode | High | Write/create tools cannot be disabled (only deletes are gated) |
| No registry presence | High | No server.json, smithery.yaml, or official-registry entry; Glama listing stale |
| API-key only | Medium | Locks out enterprise/audit buyers; fine for local tier today |
| No retry/backoff on 429 | Medium | Client returns RATE_LIMITED with advice; no automatic handling |
| Path-interpolation allowlist not implemented | Medium | Known risk (memory: `new URL()` normalization defeats blocklists) |
| Parity gaps (below) | Medium | itemSearch, files, webhooks, participants, etc. |
| No analytics/summary tools | Medium | The thread's #1 stated use case is "summary data for management" |

### Parity gaps vs the ~392-operation API surface

**v2 endpoints with no tool (cheap wins):** `/itemSearch` + `/itemSearch/field` (global cross-entity search - the single most agent-valuable missing endpoint), `/deals/{id}/participants`, `/deals/{id}/merge`, `/products/{id}/duplicate`, entity `/files` sub-resources, `/users/{id}/followers`.

**v1-only areas with zero coverage:** Files (upload/download), Webhooks, Filters (saved-filter CRUD - note: *using* filters in list calls matters more than managing them), Goals, Call logs, Activity types, Lead labels/sources/fields, Note comments, Organization relationships, Currencies, Recents (poll-for-changes), Deal summary/timeline/duplicate, Roles/Permission sets/Teams, User settings/permissions, Channels, Mailbox write ops, Meetings, Billing.

Not all gaps are equal - see §5.2 for tiering. Roughly 60 of the ~210 v1 operations are admin-console operations an agent will rarely need.

---

## 4. What end users value - three lenses

### 4.1 The AI agent (and the human prompting it)

The agent is the *primary user* of an MCP server; the human experiences the server only through the agent's success rate. What the agent needs:

1. **Find the right tool fast** - few, well-named, well-described tools beat exhaustive coverage. Every tool the agent can see costs tokens and decision quality.
2. **Token-cheap responses** - list responses should summarize (we have `createListSummary`), support field selection, and never dump raw 50-item JSON payloads into context.
3. **Custom-field legibility** - Pipedrive's 40-char hash custom-field keys (`dcf558aac1ae4e8c4f849ba5e668430d8df9be12`) are agent-hostile. A server that resolves hash↔label transparently wins every real-world deployment, because real accounts live on custom fields.
4. **Search-first workflows** - agents start tasks with "find X". Global `/itemSearch` is the natural entry point; we don't have it.
5. **Recoverable errors** - structured error codes with *next-step advice* (we do this well: "Wait 60 seconds...", Growth+ plan hints).
6. **Pagination the agent can drive** - cursor handling that doesn't require the agent to understand v1-offset vs v2-cursor differences (we abstract this; keep it).

### 4.2 The senior software developer (evaluating/deploying)

1. **Install in under a minute** - `npx`/one-click MCPB, copy-paste config for Claude Desktop, Claude Code, Cursor, VS Code.
2. **Trustworthy docs** - the README must match the binary. Today it documents 8% of the surface; that reads as abandonment even though the opposite is true.
3. **License, tests, maintenance signals** - MIT ✓, 1,692 tests ✓ (but not advertised!), commit cadence ✓.
4. **Configurability** - tool-group selection, read-only mode, destructive gate, custom API host (sandbox support).
5. **Observability** - stderr logging that doesn't corrupt STDIO ✓; structured audit option ✗.

### 4.3 The security analyst (approving for an org)

1. **Least privilege by default** - default-deny destructive ✓; want default read-only profile, write opt-in, per-group enablement.
2. **Credential hygiene** - env-var key, never logged ✓; MCPB marks key `sensitive` ✓; document scoped-API-token guidance (Pipedrive permission sets apply to the token's user).
3. **Injection surface** - (a) path interpolation: implement the allowlist regex on every ID/key interpolated into URLs; (b) prompt injection via CRM data: tool results contain attacker-controllable text (contact names, note bodies); wrap untrusted fields and document the risk honestly - almost no MCP server does, and security-literate buyers notice.
4. **Auditability** - optional structured audit log (tool name, args hash, timestamp, outcome) to a file; table stakes for enterprise, trivial for us to add.
5. **Supply chain** - pinned deps, provenance (npm `--provenance`), signed releases, SBOM nice-to-have.
6. **Spec-compliance signals** - MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so *clients* can enforce policy too.

---

## 5. Strategy - five pillars

### P0. Truth and visibility (the "stop being invisible" sprint)

The cheapest, highest-leverage work in the entire plan. None of it is feature work.

1. **Fix the npm identity.** We cannot have `pipedrive-mcp-server` (WillDent owns it). Pick a scoped name (`@ckalima/pipedrive-mcp-server`) or a distinct brand, publish with `--provenance`, and update every doc. Until this ships, every install instruction we publish hands users a competitor's stale read-only server.
2. **Generate docs from code.** A script that emits the README tool table and the MCPB manifest from the live `allTools` array, with a CI check that fails on drift. 155 tools is a *marketing asset* currently hidden by docs claiming 13.
3. **Registry blitz.** One metadata pack (name, <160-char description, transport, auth, tool list, license, config snippet) submitted to: official MCP registry (server.json), Glama (refresh the stale 38-tool listing), Smithery, mcp.so, PulseMCP, awesome-mcp-servers PR.
4. **Rebuild the MCPB bundle** (one-click Claude Desktop install) from the generator in #2.
5. **Advertise the moat.** README badges and a short "why this one" section: 1,692 tests, OpenAPI contract harness, live-smoke verified, v2-first, MIT, destructive gating. Post #2 proves evaluators look for exactly these.
6. **Prepare (don't yet fire) launch comms.** Decision 2026-06-12: ship first, then run a coordinated comms push across channels - devcommunity 20195 reply positioned against rfeineis's rubric, Reddit (r/ClaudeAI, r/sales, r/Pipedrive if active), and registry announcement copy. Draft the pack during P0; execute only once the npm rename, regenerated docs, and registry listings are live, so every link lands on a product that matches its claims.

### P1. Context discipline (turn 155 tools from liability into asset)

Target: **default profile ~37 tools** (~20-25k tokens pre-slimming, ~12-15k after; vs 91k today), full surface still available.

1. **Preset profiles** via `PIPEDRIVE_TOOL_PROFILE` (decided 2026-06-12):
   - `readonly` (~15): reads/searches only - the management-summary and security-reviewer posture.
   - `core` (**default**, ~37): the *funnel-complete* set - validated against four concrete sales scenarios (SDR lead capture, qualify-and-convert, AE post-call hygiene, manager pipeline review). Contents: leads (list/get/search/create/update/convert_to_deal/conversion_status), deals + persons + orgs (list/get/search/create/update each), activities + notes (list/get/create/update each), reference (list_pipelines, list_stages, list_users, get_current_user), field reads (list_deal/person/org_fields for custom-field legibility). **Leads are in the default**: the SDR capture scenario fails entirely without them, and lead→deal conversion is the canonical funnel motion. Products and mail stay opt-in (segment-specific, token-heavy). `itemSearch` joins the default once built and later absorbs the per-entity searches (~34 tools). Activity-types read joins once built (agents need valid `type` values).
   - `extended` (~70): core + products, deal products/discounts, mail reads, changelogs, installments.
   - `all` (155): current behavior.
2. **Composable groups** (`PIPEDRIVE_TOOL_GROUPS=core,products,mail`) for fine-tuning, and **`PIPEDRIVE_READ_ONLY=true`** as an orthogonal modifier that strips writes from *any* profile - presets for humans, groups for power users, read-only as a composable posture. This is Salesforce's praised "dynamic toolsets" pattern, implemented as config.
3. **Slim the fat schemas.** Top offenders >10 KB each (`update_product`, `create_activity`...). Move enum exhaustiveness and prose guidance out of descriptions; keep constraints in Zod (validation still enforced server-side even if the advertised schema is leaner). Realistic win: 30-40% footprint cut with zero capability loss.
4. **MCP tool annotations** (`readOnlyHint`/`destructiveHint`/`idempotentHint`) - cheap, spec-aligned, lets lazy-loading and policy-aware clients (Claude Code tool search, etc.) do the right thing.
5. **Response-side efficiency**: `fields` selection param on list/get tools; summary-first list responses (count + key fields + "use pipedrive_get_deal for full record").

### P2. Parity where it pays (not parity for its own sake)

The market evidence says raw endpoint count doesn't win; *capability* coverage does. Tier the ~90 missing operations:

- **Tier 1 - agent-critical, build next:**
  - `/itemSearch` + `/itemSearch/field` (v2) - the missing front door for nearly every agent task.
  - **Files** (v1): list/get/download-link/upload on deals/persons/orgs - "attach the proposal to the deal" is a daily ask.
  - **Deal participants** (v2 path exists) and **deal merge**.
  - **Activity types** list (read-only) - agents need valid `type` values to create activities correctly.
  - **Currencies** list (read-only) - same legibility argument.
- **Tier 2 - workflow completers:** Webhooks CRUD (enables "notify me when..." setups), saved Filters (list + use in list calls; full CRUD later), Call logs, Goals (read), Lead labels/sources, Deal summary + timeline (these power the analytics story in P4), Recents (cheap change-feed for sync use cases), Note comments.
- **Tier 3 - explicit non-goals (document why):** Roles/permission sets/teams, user settings, billing, channels/messaging, legacy teams, org relationships. Admin-console territory; an agent misusing them is pure downside. Saying "deliberately excluded for safety" converts a gap into a security feature.
- **v1 sunset discipline:** every new v1-backed tool (files, webhooks, filters...) gets built behind our existing client abstraction so the 2026-07-31 (working date) v1 sunset is a base-URL swap, not a rewrite. `client-nodejs` release notes are the watch-signal for v2 equivalents appearing.

### P3. Security leadership (the analyst-approved server)

1. **Path-interpolation allowlist** - already designed (memory note): regex-validate every value interpolated into request paths. Small, closes a real class.
2. **Audit log option** - `PIPEDRIVE_AUDIT_LOG=/path` writes JSONL (timestamp, tool, args-hash, outcome). ~50 lines of code; unlocks the enterprise conversation.
3. **Retry/backoff on 429** with jitter, honoring `Retry-After` - reliability is a security property when agents retry blindly.
4. **Prompt-injection honesty** - document that CRM field values are untrusted input to the model; optionally delimit free-text fields in responses. Being the first Pipedrive server to *address* this is a differentiator with the exact audience that writes evaluation posts like #2.
5. **SECURITY.md + threat model** - one page: data flows, what the server can/cannot do, key handling, gating model. Nobody else in this market has one.
6. **OAuth: positioned, not rushed.** OAuth only matters with a remote/hosted variant (P5). When we go there, `client-nodejs`'s OAuth2Configuration is the reference. Until then, API-key + read-only + audit log is a coherent local-tier security story.

### P4. Differentiators (what makes us *best*, not just *complete*)

1. **Custom-field intelligence** - resolve hash keys ↔ labels in both directions automatically (cache field metadata per session; we already paginate field lookups by key). This is the single biggest real-world usability gap in every Pipedrive integration, and our deep fields coverage (26 tools) is the foundation. No competitor does it.
2. **Analytics meta-tools** *(deferred until P0/P1 land - decision 2026-06-12)* - the thread's originating use case ("summary data for management") and Gareth's only real edge (6 analytics tools). Build: `pipedrive_pipeline_report` (conversion/velocity per stage), `pipedrive_deal_forecast` (weighted pipeline by close date), `pipedrive_activity_leaderboard`. Composed from existing endpoints + deal timeline/summary (Tier 2). Server-side aggregation = massive token savings vs the agent paging through deals.
3. **Write-confirmation pattern (Attio-style)** - optional `PIPEDRIVE_CONFIRM_WRITES=true`: mutating tools return a preview diff first and require a confirmation call. Bridges the gap to official-server UX without hosting anything.
4. **MCP resources & prompts** - expose pipelines/stages/fields/users as MCP *resources* (reference data clients can pin without tool calls); ship 3-4 MCP *prompts* for canned workflows ("weekly pipeline review", "log a call and schedule follow-up"). Almost no CRM server uses these spec features; cheap differentiation.
5. **Sandbox/eval story** - document the developer-sandbox path (we know its plan-gating quirks firsthand), ship the live-smoke harness as a user-facing verification tool: "run `npm run smoke` against your own account before trusting any agent with it." Turns our test culture into a user-visible feature.

### P5. Platform reach (the stdio ceiling)

stdio-only excludes claude.ai web, mobile, and hosted agent platforms - the same limitation post #2 dinged Gareth for. Options, in order of cost:

1. **Now (free):** document remote-proxy patterns (`mcp-remote`, Cloudflare Workers MCP proxy) for users who need web access with their own key.
2. **Next (low):** ship Streamable HTTP transport in-repo behind a flag (`--http :8808`) for self-hosters - keys stay theirs, no GDPR exposure for us, works with claude.ai custom connectors.
3. **Later (strategic decision):** a hosted multi-tenant endpoint with OAuth. Real cost, real liability, real enterprise unlock - and the strongest possible position if Pipedrive ever wants to bless/acquire a community server rather than build their own. Decide only after P0-P2 land and we can see adoption data.

---

## 6. Roadmap

| Horizon | Items | Effort |
|---|---|---|
| **Now (1-2 weeks)** | npm rename to `@ckalima/pipedrive-mcp-server` + publish with provenance; docs/MCPB generated from `allTools` + CI drift check; registry blitz (official registry, Glama refresh, Smithery, mcp.so, PulseMCP, awesome-mcp PR); draft launch-comms pack (fire post-P0); README "why this one" section; tool annotations | S-M each, all independent |
| **Next (2-6 weeks)** | Tool profiles + read-only mode; schema slimming (top-10 heaviest first); itemSearch tools; files tools; deal participants/merge; activity-types + currencies (read); path allowlist; 429 retry/backoff; audit log; SECURITY.md | M total; profiles and itemSearch first |
| **Later (quarter)** | Custom-field intelligence; analytics meta-tools; write-confirmation mode; MCP resources/prompts; Tier-2 parity (webhooks, filters, call logs, goals, recents, summary/timeline); Streamable HTTP flag; hosted/OAuth decision gate | L; sequence by adoption feedback |

Suggested sequencing logic: P0 is pure leverage and unblocks everything (no point building features nobody can find). P1's profiles change the *architecture conversation* from "bloated 155-tool server" to "configurable surface" before any reviewer writes that critique. P2 Tier 1 + P4.1 (custom fields) are the two biggest agent-success-rate movers.

---

## 7. Risks and watch items

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pipedrive ships an official MCP server | Medium (every peer has; their SDK team is highly active) | Be the obvious best when it happens: either they bless/adopt community work, or their v1 will be small (HubSpot: 9 tools) and we remain the power-user choice. P0 visibility makes us the reference implementation they must measure against. |
| v1 sunset breaks v1-backed tools (notes, mail, users, leads CRUD, plus planned files/webhooks/filters) | High by 2026-07-31 (working date; re-verify) | Client abstraction already isolates versions; watch client-nodejs releases for v2 equivalents; keep `docs/v1-only-capabilities.md` current. |
| Context-bloat backlash names us | Medium (we are likely the largest Pipedrive server by definition size) | P1 profiles + slimming before visibility peaks; lead the narrative ("configurable surface") rather than respond to it. |
| npm rename loses what little brand exists | Low | Old name was never ours; Glama/GitHub identity carries over; registries updated in the same sprint. |
| Single-maintainer bus factor (post #2 explicitly scores this) | Ongoing | CONTRIBUTING.md, good-first-issues from Tier-2 parity list, the generated-docs CI making drive-by PRs safe. |
| Aggregators (Zapier/Composio) commoditize basic CRUD | Medium | They can't match depth (installments, discounts, contract tests) or local-key privacy; compete on power-user and security narratives. |

---

## 8. Decisions (maintainer review, 2026-06-12)

All five open questions were resolved with the maintainer:

1. **npm identity: `@ckalima/pipedrive-mcp-server`.** Scoped publish with provenance; no new brand, no name dispute with WillDent. Unblocks P0 immediately.
2. **Default profile: funnel-complete `core` (~37 tools), leads included**, validated against four sales-team scenarios (SDR capture, qualify-and-convert, AE post-call hygiene, manager review - see P1). Shipped as a preset ladder: `readonly` (~15) / `core` (default, ~37) / `extended` (~70) / `all` (155), plus composable `PIPEDRIVE_TOOL_GROUPS` and a `PIPEDRIVE_READ_ONLY` modifier that strips writes from any profile.
3. **Platform reach: local-first + Streamable HTTP flag** for self-hosters. Hosted OAuth endpoint deferred until adoption data exists post-P0/P1; revisit then.
4. **Analytics meta-tools: deferred until P0/P1 land.** Agreed in principle (the thread's stated demand), sequenced after visibility and context discipline to avoid scope creep.
5. **Community engagement: ship first, communicate second.** No thread reply until the npm rename, regenerated docs, and registry listings are live. Then a coordinated launch push: devcommunity 20195 reply (positioned against the post-#2 rubric), Reddit, and other channels identified at launch time.
