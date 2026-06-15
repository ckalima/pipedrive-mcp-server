/**
 * User MCP tools for Pipedrive
 */

import { usersV1 } from "../version-routing.js";
import {
  ListUsersSchema,
  GetUserSchema,
  GetCurrentUserSchema,
  type ListUsersParams,
  type GetUserParams,
  type GetCurrentUserParams,
} from "../schemas/users.js";
import { mcpErrorResult } from "../utils/errors.js";
import { formatToolResponse } from "../utils/formatting.js";

/**
 * List all users
 */
export async function listUsers(_params: ListUsersParams) {
  const response = await usersV1.get<unknown[]>(
    "/users",
    undefined,
  );

  // v1 returns { success: true, data: null } for an empty collection, so guard
  // on success only and coerce null -> [] (mirrors listNotes).
  if (!response.success) {
    return mcpErrorResult(response);
  }

  const users = response.data || [];

  return formatToolResponse({
    summary: `Found ${users.length} user${users.length !== 1 ? "s" : ""}.`,
    data: users,
  });
}

/**
 * Get a single user by ID
 */
export async function getUser(params: GetUserParams) {
  const response = await usersV1.get<unknown>(
    `/users/${params.id}`,
    undefined,
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `User ${params.id}`,
    data: response.data,
  });
}

/**
 * Get the current user (API key owner)
 */
export async function getCurrentUser(_params: GetCurrentUserParams) {
  const response = await usersV1.get<unknown>(
    "/users/me",
    undefined,
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Current user",
    data: response.data,
  });
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
