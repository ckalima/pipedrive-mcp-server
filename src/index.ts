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

import { validateConfig } from "./config.js";
import { toolDefinitions, getToolHandler, getToolSchema } from "./tools/index.js";
import { mcpErrorFromCode } from "./utils/errors.js";

// Server metadata
const SERVER_NAME = "pipedrive-mcp-server";
const SERVER_VERSION = "2.0.0";

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

  if (!handler) {
    console.error(`[${SERVER_NAME}] Unknown tool: ${name}`);
    return mcpErrorFromCode(
      "VALIDATION_ERROR",
      `Unknown tool: ${name}`,
      `Available tools: ${toolDefinitions.map(t => t.name).join(", ")}`
    );
  }

  try {
    // Validate arguments with Zod schema
    let validatedArgs = args || {};
    if (schema) {
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
      validatedArgs = parseResult.data;
    }

    // Execute handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handler(validatedArgs as any);
    return result;
  } catch (error) {
    console.error(`[${SERVER_NAME}] Error executing ${name}:`, error);
    return mcpErrorFromCode(
      "API_ERROR",
      error instanceof Error ? error.message : "Unknown error occurred",
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

  // Register list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error(`[${SERVER_NAME}] Listing ${toolDefinitions.length} tools`);
    return {
      tools: toolDefinitions,
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
    console.error(`[${SERVER_NAME}] Fatal error:`, error);
    process.exit(1);
  });
}
