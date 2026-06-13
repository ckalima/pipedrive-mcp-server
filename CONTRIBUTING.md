# Contributing to Pipedrive MCP Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/pipedrive-mcp-server.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development Setup

1. Copy `.env.example` to `.env` and add your Pipedrive API key
2. Run in development mode: `npm run dev`
3. Build: `npm run build`
4. Test with MCP Inspector: `npx @modelcontextprotocol/inspector node dist/index.js`

## Code Style

- Use TypeScript with strict mode
- Follow existing patterns in the codebase
- Use Zod for schema validation
- Log to stderr (not stdout) to avoid STDIO protocol corruption
- Include JSDoc comments for public functions

## Adding New Tools

1. Create schema in `src/schemas/` following existing patterns
2. Implement handler in `src/tools/` following existing patterns
3. Register tool in `src/tools/index.ts`
4. Run `npm run gen:docs` to refresh the generated docs (see [Generated Documentation](#generated-documentation)). Do NOT hand-edit the tool table in README.md or `bundle/manifest.json`.

### Tool Structure

```typescript
export const myTools = [
  {
    name: "pipedrive_my_tool",
    description: "Clear description of what the tool does",
    inputSchema: {
      type: "object",
      properties: {
        // Define parameters
      },
      required: ["required_param"],
    },
    handler: myToolHandler,
    schema: MyToolSchema,
  },
];
```

### Destructive and Growth+ tools

Two markers in the README table are driven by tool metadata, so keep them honest:

- **Destructive tools** (deletes, irreversible conversions) are gated by the
  `PIPEDRIVE_ENABLE_DESTRUCTIVE` env var. A destructive tool must do BOTH:
  1. Call `destructiveOperationGuard()` as the first statement of its handler (the
     runtime gate), and
  2. Declare `destructive: true` on its tool def (the doc marker, rendered as 🔒).

  A unit test (`tests/unit/gen-docs.test.ts`) statically scans handler source for the
  guard and fails if the declared field disagrees. Never classify a handler by running
  it: handlers can issue live Pipedrive writes.

- **Growth+ tools** (require a Pipedrive Growth+ plan) are flagged ⭑ by including the
  literal string `Growth+` in the tool description.

## Generated Documentation

The README tool table and the MCPB `bundle/manifest.json` `tools` array are generated
from the live tool registry by `npm run gen:docs` (`scripts/gen-docs.ts`). The
generator never executes handler code. CI runs the generator and fails on any diff, so
regenerate and commit after changing tools:

```bash
npm run gen:docs
```

Bundle tracking:

- `bundle/manifest.json` is generated and committed.
- `bundle/server/` (compiled output) and `*.mcpb` (the packed bundle) are gitignored.
  Rebuild the distributable bundle with `npm run bundle:mcpb` (a release-time step, not
  part of per-PR CI).

## Testing

- Test tools using MCP Inspector before submitting
- Verify error handling with missing/invalid API keys
- Test pagination for list endpoints
- Test with real Pipedrive data when possible

## Submitting Changes

1. Ensure code builds without errors: `npm run build`
2. Update documentation if adding/changing features
3. Commit with clear, descriptive messages
4. Push to your fork
5. Create a Pull Request with:
   - Clear description of changes
   - Any related issues
   - Screenshots/examples if relevant

## Reporting Issues

When reporting issues, please include:

- Node.js version
- npm version
- Error messages (from stderr)
- Steps to reproduce
- Expected vs actual behavior

## Questions?

Open an issue for questions or join the discussion in existing issues.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
