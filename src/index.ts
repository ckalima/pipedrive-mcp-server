#!/usr/bin/env node

/**
 * Pipedrive MCP Server
 *
 * An MCP server that provides tools for interacting with Pipedrive CRM.
 * Enables Claude Code to query, create, and update CRM data.
 *
 * Usage:
 *   npx -y @ckalima/pipedrive-mcp-server
 *
 * Environment:
 *   PIPEDRIVE_API_KEY - Your Pipedrive API key (required)
 */

import "dotenv/config";

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { validateConfig, getCachedApiToken } from "./config.js";
import { toolDefinitions, getToolHandler, getToolSchema, getTool } from "./tools/index.js";
import {
  resolveCapabilityMode,
  filterToolDefinitionsForMode,
  isToolAllowedInMode,
  capabilityModeStartupLines,
} from "./capability-modes.js";
import { mcpErrorFromCode, boundErrorMessage } from "./utils/errors.js";
import { MAX_TOOL_RESPONSE_CHARS, measureResultTextLength } from "./utils/formatting.js";

// Server metadata
const SERVER_NAME = "pipedrive-mcp-server";
// Exported so tests/unit/version-consistency.test.ts can assert it tracks package.json
// (this string is hand-maintained and the release workflow only checks package.json).
export const SERVER_VERSION = "2.1.0";

/**
 * Dispatcher for CallToolRequest — extracted so tests can import and invoke it directly
 * without booting the STDIO transport.
 */
export async function handleCallTool(request: { params: { name: string; arguments?: unknown } }) {
  const { name, arguments: args } = request.params;

  console.error(`[${SERVER_NAME}] Calling tool: ${name}`);

  // Get handler and schema
  const handler = getToolHandler(name);
  const schema = getToolSchema(name);
  const mode = resolveCapabilityMode();

  if (!handler) {
    console.error(`[${SERVER_NAME}] Unknown tool: ${name}`);
    // Scope the available-tools hint to the in-mode surface so a restricted-mode caller
    // cannot discover hidden tool names by probing an invalid one (R6a).
    const available = filterToolDefinitionsForMode(toolDefinitions, mode).map(t => t.name).join(", ");
    return mcpErrorFromCode(
      "VALIDATION_ERROR",
      `Unknown tool: ${name}`,
      `Available tools: ${available}`
    );
  }

  // Capability-mode backstop (R6): refuse an out-of-mode call before any handler runs,
  // so hiding tools from tools/list is never the only guard. A name whose handler exists
  // but is absent from the registry (e.g. a synthetic tool injected by a test that mocks
  // only getToolHandler/getToolSchema) is not mode-classifiable, so getTool returns
  // undefined and isToolAllowedInMode falls through to allowed (U1) — preserving the
  // existing schema/handler path for those cases.
  if (!isToolAllowedInMode(getTool(name), mode)) {
    console.error(`[${SERVER_NAME}] Tool ${name} blocked by capability mode: ${mode}`);
    return mcpErrorFromCode(
      "MODE_RESTRICTED",
      `Tool '${name}' is not available in capability mode '${mode}'`,
      "This is an operator policy set via PIPEDRIVE_MODE (read-only < safe-write < full) and cannot be changed by the agent mid-session; ask the operator to widen the mode. Call tools/list to see the tools available in the current mode."
    );
  }

  // Fail-closed: never dispatch to a handler with no attached schema. Every
  // registered tool attaches one (no-arg tools use `z.object({})`), so a missing
  // schema is a registration bug, not a no-arg tool — passing `args` through
  // unvalidated would let arbitrary input reach the handler (F7/KTD5). The
  // schema-presence invariant test in tests/unit/gen-docs.test.ts catches an
  // un-schema'd tool at build time, so this branch is unreachable in practice.
  if (!schema) {
    console.error(`[${SERVER_NAME}] No input schema registered for tool: ${name}`);
    return mcpErrorFromCode(
      "VALIDATION_ERROR",
      `No input schema registered for tool: ${name}`,
      "This tool cannot be invoked safely; report it as a server bug"
    );
  }

  try {
    // Validate arguments with the tool's Zod schema (guaranteed present above).
    const parseResult = schema.safeParse(args);
    if (!parseResult.success) {
      const errors = parseResult.error.issues
        .map(e => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      console.error(`[${SERVER_NAME}] Validation error: ${errors}`);
      return mcpErrorFromCode(
        "VALIDATION_ERROR",
        `Invalid arguments: ${errors}`,
        "Check the tool's inputSchema for required parameters"
      );
    }
    const validatedArgs = parseResult.data;

    // Execute handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handler(validatedArgs as any);

    // Universal size backstop (F5/KTD8): bound the text that crosses into the
    // model's context even for handlers not yet routed through
    // `formatToolResponse`. Skip results already marked isError so an error is
    // never double-wrapped, and return a well-formed structured error (never a
    // mid-string cut of serialized JSON) so the result stays parseable.
    if (!(result as { isError?: boolean })?.isError) {
      const size = measureResultTextLength(result);
      if (size > MAX_TOOL_RESPONSE_CHARS) {
        console.error(`[${SERVER_NAME}] Response from ${name} exceeded size cap (${size} chars)`);
        return mcpErrorFromCode(
          "RESPONSE_TOO_LARGE",
          `Tool response too large (${size} characters); it was withheld to protect the model's context window`,
          "Narrow the query or use pagination (cursor/limit) to retrieve the data in smaller pages"
        );
      }
    }

    return result;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error occurred";
    // A thrown error can embed the API token or a filesystem path. Redact and
    // length-bound it, and never pass the raw error object to console.error (its
    // stack/cause can carry the same secrets) (F1/KTD3).
    const safeMessage = boundErrorMessage(rawMessage, getCachedApiToken() ?? undefined);
    console.error(`[${SERVER_NAME}] Error executing ${name}: ${safeMessage}`);
    return mcpErrorFromCode(
      "API_ERROR",
      safeMessage,
      "Check your API key and network connection"
    );
  }
}

/**
 * Main server initialization
 */
async function main() {
  // Log to stderr to avoid STDIO protocol corruption
  console.error(`[${SERVER_NAME}] Starting server v${SERVER_VERSION}...`);

  // Validate configuration early, but don't fail - tools will report errors on use
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    console.error(`[${SERVER_NAME}] Warning: ${configValidation.error}`);
    console.error(`[${SERVER_NAME}] Tools will return configuration errors until API key is provided.`);
  } else {
    console.error(`[${SERVER_NAME}] Configuration validated successfully.`);
  }

  // Report the resolved capability mode once at startup, plus any deprecation/invalid-
  // value notice (R9, R3). All string logic lives in the pure helper.
  for (const line of capabilityModeStartupLines()) {
    console.error(`[${SERVER_NAME}] ${line}`);
  }

  // Create MCP server
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register list tools handler — expose only the tools reachable in the resolved mode
  // (R5). The exported registry is left intact; filtering is additive (R7).
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mode = resolveCapabilityMode();
    const tools = filterToolDefinitionsForMode(toolDefinitions, mode);
    console.error(`[${SERVER_NAME}] Listing ${tools.length} tools (mode: ${mode})`);
    return {
      tools,
    };
  });

  // Register call tool handler
  server.setRequestHandler(CallToolRequestSchema, handleCallTool);

  // Connect via STDIO transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[${SERVER_NAME}] Server running on STDIO`);
}

// Run server only when executed as the entrypoint (not when imported by tests)
function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return pathToFileURL(realpathSync(argv1)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().catch((error) => {
    // Redact and length-bound like the dispatcher above; never pass the raw error
    // object to console.error (its stack/cause can carry the token) (F1/KTD3).
    const rawMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const safeMessage = boundErrorMessage(rawMessage, getCachedApiToken() ?? undefined);
    console.error(`[${SERVER_NAME}] Fatal error: ${safeMessage}`);
    process.exit(1);
  });
}
