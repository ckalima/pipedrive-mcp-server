# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
