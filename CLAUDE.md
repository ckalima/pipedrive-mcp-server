# Pipedrive MCP Server

MCP server providing Pipedrive CRM tools over STDIO transport. TypeScript, Node.js.

## Commands

```bash
npm run build          # TypeScript compile (tsc)
npm test               # Run all tests (vitest)
npm run dev            # Dev mode with tsx
npm start              # Run compiled server
npm run test:coverage  # Coverage report
```

## Architecture

```
src/
  index.ts          # MCP server entry point (STDIO transport)
  client.ts         # Singleton PipedriveClient (lazy init, API calls)
  config.ts         # Environment validation (PIPEDRIVE_API_KEY, PIPEDRIVE_ENABLE_DESTRUCTIVE)
  tools/            # MCP tool handlers (one file per entity)
    index.ts        # Tool registration, allTools array, getToolHandler/getToolSchema
  schemas/          # Zod input validation (one file per entity, common.ts for shared)
  utils/
    errors.ts       # Error types, getErrorResponse, destructiveOperationGuard
    formatting.ts   # createListSummary
    pagination.ts   # v1 (offset) and v2 (cursor) pagination helpers
```

## API Versions

- **v2** (default): deals, persons, organizations, activities, products, projects, tasks, boards & phases, fields, pipelines & stages, leads search (`https://api.pipedrive.com/api/v2`)
- **v1**: notes, mail, users, leads CRUD (`https://api.pipedrive.com/v1`)
- Auth: `api_token` query parameter for both versions

v1 full sunset: 2026-07-31 (working horizon — per Pipedrive integration partners Make/Zapier; Pipedrive's own docs state only "grace period ≥ 1 year"; re-verify before committing). Official first-party date: 2025-12-31 applies only to selected endpoints with v2 equivalents — it does NOT cover notes, mail, users, or leads CRUD. See `docs/v1-only-capabilities.md`.

## Docs: public vs. private

Engineering docs are **public** and live in this repo. The menehune backlog pipeline
reads and writes plans here, so they must be tracked (not gitignored):

- `docs/plans/` — implementation plans (`/backlog:plan` writes these)
- `docs/brainstorms/` — feature/requirements RFCs
- `docs/residual-review-findings/` — code-review follow-ups

Keep the following **out** of this public repo — put them in `docs/private/` (gitignored)
and back them up in the private repo `ckalima/pipedrive-mcp-internal`:

- Competitive / market strategy (competitor names, positioning, moat analysis)
- Session handoffs that carry account identifiers or PII (trial account IDs, real emails)

Never commit Pipedrive account IDs, API tokens, or real customer data. Test fixtures use
`@example.com` addresses.

## Conventions

- Every tool handler returns `{ content: [{ type: "text", text: string }] }` with optional `isError: true`
- Error responses use `getErrorResponse(response)` from `utils/errors.ts`, never inline fallbacks
- Delete tools are gated by `PIPEDRIVE_ENABLE_DESTRUCTIVE=true` env var (default: disabled)
- Destructive tools must both call `destructiveOperationGuard()` as the handler's first statement AND declare `destructive: true` on the tool def (drives the README/manifest 🔒 marker; enforced by the field-guard invariant test in `tests/unit/gen-docs.test.ts`)
- Schemas use Zod. `visible_to` is always `z.number().int()` with `.refine()`, never string enum
- Tool files export a `*Tools` array and individual handler functions
- Tests: unit tests in `tests/unit/`, integration tests in `tests/integration/`
- Integration tests use `setupValidEnv()` from `tests/helpers/mockEnv.ts` and mock fetch

## Adding a New Entity

1. Create schema in `src/schemas/<entity>.ts` extending common schemas
2. Create tool handlers in `src/tools/<entity>.ts` following existing patterns
3. Add to `allTools` spread in `src/tools/index.ts`
4. Add unit tests for schemas, integration tests for tools
5. Run `npm run gen:docs` to regenerate the README tool table and `bundle/manifest.json` (CI fails on drift)
