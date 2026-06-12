/**
 * User MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListUsersSchema,
  GetUserSchema,
  GetCurrentUserSchema,
  type ListUsersParams,
  type GetUserParams,
  type GetCurrentUserParams,
} from "../schemas/users.js";
import { mcpErrorResult } from "../utils/errors.js";

/**
 * List all users
 */
export async function listUsers(_params: ListUsersParams) {
  const client = getClient();

  const response = await client.get<unknown[]>(
    "/users",
    undefined,
    "v1"
  );

  // v1 returns { success: true, data: null } for an empty collection, so guard
  // on success only and coerce null -> [] (mirrors listNotes).
  if (!response.success) {
    return mcpErrorResult(response);
  }

  const users = response.data || [];

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Found ${users.length} user${users.length !== 1 ? "s" : ""}.`,
        data: users,
      }, null, 2),
    }],
  };
}

/**
 * Get a single user by ID
 */
export async function getUser(params: GetUserParams) {
  const client = getClient();

  const response = await client.get<unknown>(
    `/users/${params.id}`,
    undefined,
    "v1"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `User ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Get the current user (API key owner)
 */
export async function getCurrentUser(_params: GetCurrentUserParams) {
  const client = getClient();

  const response = await client.get<unknown>(
    "/users/me",
    undefined,
    "v1"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Current user",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const userTools = [
  {
    name: "pipedrive_list_users",
    description: "List all users in the Pipedrive account. Useful for finding owner IDs when creating or filtering records.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    handler: listUsers,
    schema: ListUsersSchema,
  },
  {
    name: "pipedrive_get_user",
    description: "Get details of a specific user by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "User ID" },
      },
      required: ["id"],
    },
    handler: getUser,
    schema: GetUserSchema,
  },
  {
    name: "pipedrive_get_current_user",
    description: "Get details of the current user (API key owner). Useful for verifying connection and getting your user ID.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    handler: getCurrentUser,
    schema: GetCurrentUserSchema,
  },
];
