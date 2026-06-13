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

This server does **not** sanitize CRM content for prompt-injection payloads, and it cannot:
the data is the product. Treat all tool output as untrusted, and rely on:

- **Destructive-op gating** (above) so a successful injection cannot delete or convert data
  unless you have explicitly opted in.
- **Human-in-the-loop confirmation** for write actions in your MCP client.
- A **read-only deployment** (keep `PIPEDRIVE_ENABLE_DESTRUCTIVE` unset) for
  analysis-only use cases.

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
