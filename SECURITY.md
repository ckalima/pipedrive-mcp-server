# Security Policy

This document describes the security model of the Pipedrive MCP Server: how data and
credentials flow, what the server does and does not trust, its known limitations, and how
to report a vulnerability.

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories:
[**Report a vulnerability**](https://github.com/ckalima/pipedrive-mcp-server/security/advisories/new)
(repository **Security** tab → *Report a vulnerability*).

Do **not** open a public issue for a suspected vulnerability. We aim to acknowledge reports
within a few days and will coordinate a fix and disclosure timeline with you.

## Data flows

- **Transport is STDIO only.** The server runs as a local child process of your MCP client
  (Claude Code / Claude Desktop) and communicates over stdin/stdout. It opens **no network
  listener** and accepts no inbound connections, so there is no remotely reachable surface.
- **Outbound traffic goes only to Pipedrive.** Every API call targets `api.pipedrive.com`
  — `https://api.pipedrive.com/api/v2` for v2 entities and `https://api.pipedrive.com/v1`
  for the v1-only capabilities (notes, mail, users, leads CRUD). The server makes no
  telemetry, analytics, or other third-party requests.
- **Your credential stays local.** The API token is read from the `PIPEDRIVE_API_KEY`
  environment variable and is sent only to Pipedrive over TLS.

## Credential handling

- **Source.** The token is read **only** from the `PIPEDRIVE_API_KEY` environment variable
  (validated as a 40-character key at startup). It is never read from disk or arguments.
- **Transport to Pipedrive.** v2 requests send the token as the `x-api-token` request
  header; v1 requests send it as the `api_token` query parameter (Pipedrive's documented
  schemes). Because the v1 scheme puts the token in the URL, it can appear in intermediary
  or server-side request logs **on Pipedrive's side**; the v2 header scheme avoids this, and
  v1 is being retired.
- **Logging.** All server logs go to **stderr** (never stdout, to avoid corrupting the
  STDIO protocol). Request logs record only the HTTP method and endpoint **path**; neither
  the API token nor request bodies are written to this server's logs.
- **Packaging.** The MCPB bundle marks the API key as a `sensitive` user config field, so
  desktop clients store and display it as a secret.
- **Least privilege (recommended).** The token inherits the full permissions of the
  Pipedrive user that owns it. Create a **dedicated Pipedrive user** with a scoped
  permission set for this integration rather than using a full-admin account's token.

## Trust model

- **Destructive operations are gated by default.** Deletes, conversions, and other
  irreversible writes (marked 🔒 in the README tool table) are **disabled** unless you set
  `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`. Out of the box the server is read-and-create only.
  Every tool also exposes MCP annotations (`readOnlyHint` / `destructiveHint` /
  `idempotentHint`) so policy-aware clients can distinguish reads from writes from deletes.
- **Input validation.** Every tool call is validated against a Zod schema before any API
  request is made; malformed input is rejected with a structured error.
- **Request timeouts.** Every Pipedrive request carries a 30-second timeout
  (`AbortSignal.timeout`) so a hung upstream cannot block the server indefinitely.
- **No built-in rate limiting.** The server does not itself throttle or cap calls; a
  runaway agent loop can consume your Pipedrive API quota (and, on metered plans, cost).
  It relies on Pipedrive's own rate limiting and surfaces upstream `429` responses as
  structured errors rather than masking them.
- **Compromised client.** The MCP client is inside the trust boundary: a malicious or
  compromised client can invoke any *enabled* tool with the token's full permissions.
  Destructive-op gating and a least-privilege Pipedrive user (see *Credential handling*
  above) are the controls that bound the blast radius if that happens.

## Prompt injection (untrusted CRM content)

**CRM data is untrusted input to the LLM.** Field values that this server returns — person
and organization names, deal titles, note bodies, email content, custom fields — can be
written by anyone with access to your Pipedrive account, including external parties whose
emails or form submissions land in the CRM. A malicious record can therefore contain text
that attempts to manipulate the agent reading it (prompt injection).

**What the server does.** Tool results are returned as a structured envelope that keeps
server-authored text (`summary`) separate from CRM-sourced, third-party-writable content
(`data`), and attaches a server-authored `untrusted` notice (carrying a per-response token)
that names `data` as untrusted. Response sizes are bounded so a single record cannot flood
the model's context.

**Residual risk, stated plainly.** This labeling is *advisory*. It makes untrusted content
structurally distinguishable for a host that parses the envelope and binds the `data` field
to a lower trust level. It binds nothing for a host that simply feeds the raw response text
to the model, and it cannot eliminate prompt injection. The server does **not** sanitize CRM
content for prompt-injection payloads, and it cannot: the data is the product. Treat all
tool output as untrusted, and rely on:

- **Destructive-op gating** (above) so a successful injection cannot delete or convert data
  unless you have explicitly opted in.
- **Human-in-the-loop confirmation** for write actions in your MCP client.
- A **read-only deployment** (keep `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset) for
  analysis-only use cases.
- **Context isolation** so a successful injection has no exfiltration channel (see
  *Operator best practices* below).

## AI/agent attack surface

This server is an agent tool surface, so its threat model includes AI-specific risks
beyond classic code vulnerabilities. The table below classifies each surface, maps it to
the OWASP Top 10 for LLM Applications (2025), and states the cheap server-side mitigation
that is in place. It is a classification, not a how-to: it carries no exploit detail.

The "Not applicable" rows are deliberate. They state, honestly, where a commonly cited
attack does not reach this server, either because it is out of the STDIO transport's scope
or because the design is structurally immune, rather than implying an unmitigated gap.

| Attack surface | OWASP LLM (2025) map | Classification | Server mitigation |
|----------------|----------------------|----------------|-------------------|
| Indirect prompt injection via CRM tool output | LLM01 Prompt Injection | Server-mitigated, host-enforced (residual risk documented above) | Field-separate and notice-label untrusted CRM data; advisory to a host that parses the envelope, with no guarantee if the host feeds raw text to the model; cannot eliminate injection |
| Data exfiltration via tool chaining | LLM02 Sensitive Info Disclosure | Operator/host-managed (trifecta leg removal); server bounds blast radius | Output size cap; destructive-off default |
| Tool-argument-driven filesystem read (product-image `file_path`) | LLM02 Sensitive Info Disclosure | Server-mitigated + operator-managed | Disabled by default; opt-in via an allowlisted base directory; read size capped; path and filesystem errors are not reflected back to the model |
| Excessive agency (write/delete) | LLM06 Excessive Agency | Server-defaulted + host-enforced | Destructive-off default; human-in-the-loop documented as the host's job |
| Context flooding / exfil volume / cost | LLM10 Unbounded Consumption | Server-fixable | Per-tool output cap plus a universal dispatcher backstop; bounded inputs |
| Token leak via errors/logs | LLM02; query-string exposure | Server-fixable | Central redaction; never log URL or Request objects; v2 header auth |
| Broad-token blast radius / token misuse | Scope minimization | Operator-managed (Pipedrive: restricted user) | Destructive-off default; restricted-user minting documented |
| Confused deputy (OAuth proxy variant) | MCP confused-deputy | Not applicable (no OAuth proxy; STDIO) | Out of transport scope |
| Token passthrough | MCP token-passthrough | Not applicable (server never accepts client tokens) | Structurally immune (positive) |
| Transport / network / SSRF / session | MCP SSRF and session | Not applicable (STDIO, no listener) | Out of transport scope |
| Regex denial of service (ReDoS) | LLM10 Unbounded Consumption | Not applicable (validators are anchored, linear, no nested quantifiers) | Structurally immune |

## Operator best practices

These are the levers you control. Each one shrinks the blast radius if the agent reading
your CRM is manipulated or the client is compromised.

- **Mint the token from a dedicated, least-privilege Pipedrive user.** Personal API tokens
  carry no token-level scopes, so the owning user's permission set and visibility groups are
  the only lever. Create a user whose permissions and visibility are the minimum this
  integration needs, rather than using a full-admin account's token.
- **Keep destructive operations disabled** (leave `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset)
  unless you actively need writes that delete or convert data, and re-disable when done.
- **Treat all CRM data as untrusted** model input, per the prompt-injection guidance above.
- **Isolate the agent's context** so a successful injection has no channel to exfiltrate
  data: break a leg of the "lethal trifecta" (untrusted input, sensitive data, an outbound
  channel). For example, do not pair this server in the same agent with tools that can post
  to arbitrary external destinations.
- **Require human-in-the-loop confirmation** for sensitive or irreversible calls in your
  MCP client.
- **Run the server from a trusted working directory.** Prefer real environment variables
  over a `.env` file when the working directory is shared or agent-writable, because
  `dotenv` loads `.env` from the current directory.
- **Restrict the filesystem-read base path.** Reading product images from a server-side
  file path is **disabled by default**. Enable it only if you need it, by setting
  `PIPEDRIVE_IMAGE_BASE_DIR` to the narrowest directory that holds your images; any
  `file_path` must resolve within it. Callers that cannot share the server's filesystem
  should pass image bytes as `base64_data` instead.

## Known limitations

- **API-key auth only.** Authentication is a single Pipedrive API token; there is no
  per-user identity or OAuth, and the token carries its owning user's full permissions.
  This matches the local / self-hosted tier this server targets.
- **No invocation audit log yet.** Beyond local stderr request logs, the server does not
  persist an audit trail of tool calls.
- **STDIO only.** There is no network-exposed transport today (a Streamable HTTP flag is on
  the roadmap). This is also a security property: nothing is listening on a port.
- **Dependency supply chain.** The runtime trusts its npm dependency tree — `@modelcontextprotocol/sdk`,
  `zod`, and `dotenv` (HTTP uses Node's built-in `fetch`, so there is no separate HTTP-client
  dependency). They are version-constrained in `package.json` and the server is published
  with npm provenance, but a compromised upstream dependency would run with this server's
  privileges, including access to your token.

## Supported versions

Security fixes are applied to the latest released version on the `main` branch. Please
upgrade to the latest `@ckalima/pipedrive-mcp-server` release before reporting an issue.
