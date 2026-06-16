# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-06-15

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

[2.1.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.1.0
[2.0.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.0.0
