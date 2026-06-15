# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[2.0.0]: https://github.com/ckalima/pipedrive-mcp-server/releases/tag/v2.0.0
