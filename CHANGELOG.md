# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The server now names the Pipedrive account it is connected to.** A token silently resolves
  to exactly one company, and nothing in the server's output said which one. When the same
  server is registered in two client scopes (for example a project-scoped entry and a
  local-scoped one that reads a stale `.env`), the entry that wins precedence is invisible, and
  the symptom is data from the wrong company with no error anywhere.

  - **Startup banner.** One stderr line after the transport is up:
    `Connected as you@example.com -> company "Example Corp" (id 12345)`. If the check fails the
    line says the account could not be verified rather than the server starting silently; if the
    API key is missing or malformed it reports that the account was not checked, because no
    request was made.
  - **One-shot connection notice.** The first tool response after the boot check settles carries
    a `connection` block naming the same company, so the agent knows which account the data came
    from without being asked and without spending a tool call. The check runs in the background,
    so a tool call that finishes while it is still in flight is returned unchanged and the block
    lands on a later response instead. Every other response is byte-identical to before. The
    block is emitted once per **server run**, not once per conversation: a host that keeps one
    server process across several conversations gives it to the first one only, and the notice
    says so and points at `pipedrive_get_current_user` for checking on demand.

  The check is a single `GET /v1/users/me` at boot, bounded to one attempt with a 10-second
  timeout. It never blocks startup and never fails a tool call. `verified: true` means the token
  resolved to *an* account, not to the expected one; there is no expected-company setting yet.

  Only `company_id` and `verified` are asserted by the server, and they sit at the top level of
  the block. Every string the server does *not* assert is nested one level down under
  `untrusted_display`: `company_name` and `user_email` on the verified variant, `reason` on the
  unverified one. Those are CRM- or upstream-sourced, and are stripped of control and
  invisible-format characters, length-capped, and labeled untrusted in-band by the notice. The
  `notice` text itself is a fixed string with nothing interpolated into it, so a company name
  cannot place text inside the server's own instruction to the model.
  See [SECURITY.md](SECURITY.md#prompt-injection-untrusted-crm-content).

### Changed

- **`pipedrive_get_current_user` now describes what it actually returns.** The handler always
  returned the connected company's name, id, and domain, but the description mentioned only the
  user, so neither an agent nor a human could tell the tool answered "which company is this
  token on?". Description only; behavior and payload are unchanged.

## [2.5.0] - 2026-07-22

### Changed

- **`pipedrive_convert_lead_to_deal` now requires `PIPEDRIVE_MODE=full`.** The endpoint marks
  the source lead as deleted, so it is a destructive operation and is now gated and marked as
  one — matching `pipedrive_convert_deal_to_lead`, which was already gated for the same reason.
  Previously it ran under the default `safe-write` mode while advertising
  `destructiveHint: false`, which was untrue.

  **Migration:** if you call this tool, set `PIPEDRIVE_MODE=full`. Be aware that `full` also
  exposes every other destructive tool (deletes), so weigh it against your setup. The default
  `safe-write` tool count drops from 124 to 123, and the destructive count rises from 31 to 32.

  This is shipped as a **minor** per the versioning policy in `docs/RELEASE.md`: explicitly
  configured `full` setups keep working and the change fails safe. A stricter reading would
  call it major.

- **Minimum Node.js is now `>=22.9.0`** (was `>=22.0.0`). Required by the
  `--env-file-if-exists` flag the npm scripts use for local development. Node 22.x LTS begins
  at 22.11, so supported-LTS users are unaffected; only 22.0-22.8 installs will see
  `EBADENGINE`.

### Added

- **`pipedrive_update_deal` accepts `visible_to`.** `create_deal` accepted it and every sibling
  update tool (person, organization, product) accepted it, so a deal's visibility could be set
  at creation but never changed afterward.

### Fixed

- **Circuit breaker can no longer wedge HalfOpen for the process lifetime.** The retry loop's
  elapsed-budget bail now runs before the breaker gate, so a budget-exhausted retry can never
  claim the half-open probe slot on its way out, and a `finally` backstop settles an
  unrecorded probe as a failure. Previously, a request whose retries outlived the breaker
  cooldown (breaker opened by concurrent traffic mid-request plus a long stall) could claim
  the probe slot and return without recording an outcome, leaving every later request
  fast-failing `CIRCUIT_OPEN` until restart.
- **The server no longer auto-loads `.env` from its working directory.** MCP hosts set the
  server's CWD to the open (possibly untrusted) project, so a planted `.env` could inject
  policy env vars (`PIPEDRIVE_MODE`, `PIPEDRIVE_ENABLE_DESTRUCTIVE`) or a substitute API key
  beneath the operator's host config. Configuration now comes only from the environment the
  host passes in; local development loads the repo `.env` via the npm scripts'
  `--env-file-if-exists=.env` flag. The `dotenv` runtime dependency is removed.
- **Tool responses are serialized compactly on the wire.** `formatToolResponse` pretty-printed
  its payload while the size caps measured compact JSON, so a structure-heavy response that
  passed the builder cap could inflate past the dispatcher's size backstop and be withheld
  entirely. Compact output also trims response token overhead.
- **`tools/call` with `arguments` omitted is now accepted.** Hosts may omit `arguments` for
  tools whose parameters are all optional; the dispatcher treats absence as `{}` instead of
  returning a validation error.
- **A v1 capability can no longer be wrongly retired by transient 404s.** The seam that detects
  v1 endpoint retirement now requires three *consecutive* 404s on an *unfiltered* collection
  read before inferring a surface is gone, and write verbs never count toward it — previously a
  single 404, including one caused by a caller-supplied id for a since-deleted parent record,
  could retire notes/mail/users/leads for the rest of the process. Concurrent traffic is
  handled too: a batch containing any success cannot latch, in either settlement order, since a
  200 proves the surface was live. A `410 Gone` still latches immediately, as that is the
  server stating fact rather than an inference. The inferred-retirement message now reads as a
  likelihood and names the restart that re-probes.
- **A half-open circuit-breaker probe no longer re-opens the breaker on a benign failure.** The
  probe now distinguishes upstream ill health (429/503/5xx/network/timeout) from an ordinary
  status-bearing rejection (400/403/404/410): a probe that gets a clean `404 Not Found` proves
  the upstream is answering, so the breaker closes instead of starting another cooldown.
- **`pipedrive_search_projects` returns pagination.** It was the lone search tool that dropped
  it, so callers could not page past the first batch of results.
- **`getField` lookups are bounded.** The internal field-definition cursor loop now stops after
  a page cap and detects a repeated cursor, so a malformed or looping upstream pagination
  response cannot spin indefinitely.
- **Nullable parameters are advertised correctly.** 27 parameters across 8 tool files accept
  `null` to clear a field in their Zod schema, but their published JSON Schema declared only
  the non-null type, so a schema-validating MCP client would reject the call before it reached
  the server and the documented clear-a-field behavior was unreachable. The two are now checked
  against each other in both directions by a registry-walking invariant test.
- **`extractPaginationV1` tolerates both v1 pagination shapes.** It reads the wrapped
  `additional_data.pagination` form and the flat `additional_data` form, preferring the wrapped
  one when both are present. This is defensive hardening, not a fix for an observed break: a
  live probe confirmed `/leads` returns the wrapped shape despite the published spec
  documenting the flat one for that endpoint.

## [2.4.0] - 2026-06-16

### Added

- **The `.mcpb` desktop bundle is now released automatically.** Each `v*` tag push attaches
  the one-click `.mcpb` bundle (plus a `.sha256`) to the GitHub Release, and the MCP registry
  entry now advertises a second `registryType: "mcpb"` package pointing at that asset so
  desktop/registry clients can discover it. The registry entry (npm and mcpb packages) is
  published in CI via OIDC instead of a manual step, with the mcpb `fileSha256` injected from
  the exact attached bundle (the committed value is an all-zeros sentinel). Adds
  `npm run registry:publish` as a back-publish/recovery fallback. No change to the server's
  tools or runtime behavior. (#137)

## [2.3.1] - 2026-06-16

### Fixed

- **Circuit breaker hardened against concurrent load and wall-clock steps.** Two
  internal fixes to the per-process circuit breaker that protects the shared Pipedrive
  rate limit; no configuration, API, or tool-surface change.
  - The Closed-state trip count is now a **sliding window** (the threshold of 5 trip
    signals must fall within 30s) rather than a consecutive counter, so a success from an
    interleaved concurrent request can no longer reset progress toward tripping mid-storm
    (#134).
  - The breaker's window/cooldown arithmetic — and the retry budget/timeout arithmetic —
    now key on a **monotonic clock** (`performance.now()`) instead of `Date.now()`, so an
    NTP/VM wall-clock step can no longer evict an in-progress window's signals or mis-time
    the Open→HalfOpen cooldown (#135).

## [2.3.0] - 2026-06-16

### Changed

- **Minimum supported Node.js is now 22** (was 20). Node 20 ("Iron") reached
  end-of-life in April 2026; Node 22 ("Jod") is the oldest LTS still receiving
  support. `engines.node` is advisory (npm only warns), so existing installs on
  older Node keep working, but 22+ is what we test and support. CI now runs the
  Node 22 (floor) and 24 (current LTS) lines; `@types/node` is aligned to the 22
  floor so the build typechecks against the API surface we actually support, and
  a `.nvmrc` pins local development to 22.

## [2.2.0] - 2026-06-16

### Added

- **Guided installer (`npx @ckalima/pipedrive-mcp-server init`).** A one-command
  interactive setup that opens the Pipedrive API-settings page, validates a
  pasted key against the live API, and writes a working MCP config for the chosen
  host (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf). It is a CLI
  subcommand; the STDIO server path is unchanged.
  - The pasted key is **masked** as you type (never echoed to the terminal or
    scrollback).
  - Config writes are **non-destructive**: an existing file is read, merged, and
    backed up before an atomic `0600` write, with symlink/TOCTOU-safe handling.
  - For committed or shared targets (e.g. a project-scoped `.mcp.json`), the
    server entry uses an environment-variable indirection so a literal key never
    lands in a shared file; the key is shown inline only under `--print-only`.
  - Flags: `--host`, `--scope`, and `--print-only`. Unrecognized flags warn and
    continue; a missing or flag-shaped value fails closed before any I/O. A
    closed stdin (non-interactive/CI) cancels cleanly instead of hanging.



### Added

- **Server-enforced capability modes (`PIPEDRIVE_MODE`).** A new safety tier —
  `read-only`, `safe-write`, or `full` — governs which tools an agent can reach.
  Out-of-mode tools are hidden from `tools/list` and independently refused by a
  dispatcher backstop before any handler runs, surfaced as a distinct
  `MODE_RESTRICTED` error. Tiers derive from existing per-tool metadata, so no
  new per-tool data is introduced. See "Capability modes" in the README.
  - Recommended for first-time setup and agent evaluation: `read-only`.
- **Automatic request resilience.** Reads retry transient failures
  (429/503/5xx/network) and writes retry 429s, using full-jitter backoff and a
  per-process circuit breaker. A new `CIRCUIT_OPEN` error distinguishes a local
  fast-fail from a fresh upstream 429.
- **v1 sunset safety.** The four v1-only capabilities (notes, mail, users, leads
  CRUD) route through a dedicated seam with lazy sunset/retirement detection; a
  retired capability returns a clear `CAPABILITY_RETIRED` error pointing to the
  Pipedrive changelog rather than failing opaquely.

### Changed

- **Destructive operations are now gated by `PIPEDRIVE_MODE=full`.** The default
  mode is `safe-write`, so out-of-box execution is unchanged (destructive tools
  were already disabled). The one observable change at the default: the 31
  destructive tools are now also hidden from `tools/list` rather than
  listed-then-refused, so the listed surface is 124, not 155.
- **`RATE_LIMITED` guidance softened**, because 429s are now retried
  automatically with backoff before the error can surface.

### Deprecated

- **`PIPEDRIVE_ENABLE_DESTRUCTIVE` is superseded by `PIPEDRIVE_MODE`.** It is
  still honored: when `PIPEDRIVE_MODE` is unset, `true` maps to `full` and
  anything else to `safe-write`. Prefer `PIPEDRIVE_MODE=full`.

### Security

- **Product-image `file_path` reads are now opt-in and confined.** The
  `pipedrive_upload_product_image` and `pipedrive_update_product_image` tools
  previously read any caller-supplied `file_path` the server process could
  reach. Filesystem reads are now disabled by default; an operator must set
  `PIPEDRIVE_IMAGE_BASE_DIR` to an allowed directory, and a `file_path` must
  resolve within it. Reads are size-capped, and read failures no longer reflect
  the resolved path or raw filesystem error back to the model.
  - **Migration:** if you relied on `file_path`, set `PIPEDRIVE_IMAGE_BASE_DIR`
    to the directory holding your images and pass paths under it. Callers that
    cannot share the server's filesystem should use `base64_data` instead. When
    a `file_path` call is rejected solely because reads are disabled, the server
    logs a stderr hint naming the variable to set.
- **Untrusted CRM/backend data is labeled and bounded before it reaches the
  model.** Tool responses carry an untrusted-data marker, backend-authored error
  text is redacted (secrets/tokens) and length-capped, and an oversized response
  is withheld behind a `RESPONSE_TOO_LARGE` error rather than flooding the
  model's context window.

### Backward compatibility

- `PIPEDRIVE_MODE` is authoritative when set to a recognized value. A blank value
  (e.g. an MCPB host substituting an empty string for an untouched optional
  install field) is treated as unset and resolves to the `safe-write` default; an
  unrecognized value falls back to `read-only`. Existing installs keep their
  execution behavior on upgrade.

## [2.0.0] - 2026-06-12

First public release under the scoped name `@ckalima/pipedrive-mcp-server`,
published from GitHub Actions with build provenance.

> **No public 1.x exists under the scoped name.** The line starts at `2.0.0`
> to disambiguate from the unrelated unscoped `pipedrive-mcp-server` package
> (owned by another author) and from pre-scope internal `1.0.0` artifacts. The
> version jump is disambiguation, not a feature-count or maturity signal.

### Added

- **Scoped, provenance-signed npm package.** Install with
  `npx -y @ckalima/pipedrive-mcp-server`; the npm page shows a provenance badge
  linking back to the GitHub Actions build.
- **155 MCP tools** across deals, persons, organizations, activities, notes,
  leads, projects, products, tasks, boards, phases, mail, fields, pipelines,
  and users.
- **v2-first API coverage** (deals, persons, organizations, activities) with v1
  fallback for notes, mail, fields, pipelines, and users.
- **Destructive operations gated** behind the `PIPEDRIVE_ENABLE_DESTRUCTIVE=true`
  environment variable (disabled by default).

[2.5.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.5.0
[2.4.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.4.0
[2.3.1]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.3.1
[2.3.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.3.0
[2.2.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.2.0
[2.1.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.1.0
[2.0.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.0.0
