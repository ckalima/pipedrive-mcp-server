/**
 * Board and Phase MCP tools for Pipedrive (Projects API - public beta)
 *
 * Boards: GET /boards returns all boards with no pagination.
 * Phases: GET /phases?board_id= returns all phases for a board with no pagination.
 * Both list responses deliberately omit the "pagination" key in output (R-2).
 */

import { getClient } from "../client.js";
import {
  ListBoardsSchema,
  GetBoardSchema,
  CreateBoardSchema,
  UpdateBoardSchema,
  DeleteBoardSchema,
  ListPhasesSchema,
  GetPhaseSchema,
  CreatePhaseSchema,
  UpdatePhaseSchema,
  DeletePhaseSchema,
  type ListBoardsParams,
  type GetBoardParams,
  type CreateBoardParams,
  type UpdateBoardParams,
  type DeleteBoardParams,
  type ListPhasesParams,
  type GetPhaseParams,
  type CreatePhaseParams,
  type UpdatePhaseParams,
  type DeletePhaseParams,
} from "../schemas/boards.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

// ─── Board handlers ───────────────────────────────────────────────────────────

/**
 * List all project boards. Returns the complete list with no pagination
 * (the GET /boards endpoint has no cursor/limit params).
 */
export async function listBoards(_params: ListBoardsParams) {
  const client = getClient();

  // No pagination params — boards endpoint returns all boards in one response.
  const response = await client.get<unknown[]>("/boards", undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const boards = response.data;

  // Deliberately no "pagination" key — this endpoint has no cursor pagination (R-2).
  return formatToolResponse({
    summary: createListSummary("project board", boards.length, false),
    data: boards,
  });
}

/**
 * Get a single project board by ID.
 */
export async function getBoard(params: GetBoardParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/boards/${params.id}`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project board ${params.id}`,
    data: response.data,
  });
}

/**
 * Create a new project board.
 */
export async function createBoard(params: CreateBoardParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    name: params.name,
  };

  if (params.order_nr !== undefined) body.order_nr = params.order_nr;

  const response = await client.post<unknown>("/boards", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Project board created",
    data: response.data,
  });
}

/**
 * Update an existing project board. Only id is required.
 */
export async function updateBoard(params: UpdateBoardParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.name !== undefined) body.name = updateFields.name;
  if (updateFields.order_nr !== undefined) body.order_nr = updateFields.order_nr;

  const response = await client.patch<unknown>(`/boards/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project board ${id} updated`,
    data: response.data,
  });
}

/**
 * Delete a project board. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true).
 */
export async function deleteBoard(params: DeleteBoardParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/boards/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project board ${params.id} deleted`,
    data: response.data,
  });
}

// ─── Phase handlers ───────────────────────────────────────────────────────────

/**
 * List all phases for a board. board_id is required (spec: required query param).
 * Returns the complete list with no pagination (R-2, R-3).
 */
export async function listPhases(params: ListPhasesParams) {
  const client = getClient();

  // board_id is required by the API — no cursor/limit params for this endpoint.
  const queryParams = new URLSearchParams();
  queryParams.set("board_id", String(params.board_id));

  const response = await client.get<unknown[]>("/phases", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const phases = response.data;

  // Deliberately no "pagination" key — this endpoint has no cursor pagination (R-2).
  return formatToolResponse({
    summary: createListSummary("project phase", phases.length, false),
    data: phases,
  });
}

/**
 * Get a single project phase by ID.
 */
export async function getPhase(params: GetPhaseParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/phases/${params.id}`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project phase ${params.id}`,
    data: response.data,
  });
}

/**
 * Create a new project phase. name and board_id are required.
 */
export async function createPhase(params: CreatePhaseParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    name: params.name,
    board_id: params.board_id,
  };

  if (params.order_nr !== undefined) body.order_nr = params.order_nr;

  const response = await client.post<unknown>("/phases", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Project phase created",
    data: response.data,
  });
}

/**
 * Update an existing project phase. Only id is required.
 * Set board_id to move this phase to a different board.
 */
export async function updatePhase(params: UpdatePhaseParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.name !== undefined) body.name = updateFields.name;
  if (updateFields.board_id !== undefined) body.board_id = updateFields.board_id;
  if (updateFields.order_nr !== undefined) body.order_nr = updateFields.order_nr;

  const response = await client.patch<unknown>(`/phases/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project phase ${id} updated`,
    data: response.data,
  });
}

/**
 * Delete a project phase. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true).
 */
export async function deletePhase(params: DeletePhaseParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/phases/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project phase ${params.id} deleted`,
    data: response.data,
  });
}

// ─── Tool definitions for MCP registration ───────────────────────────────────

export const boardTools = [
  {
    name: "pipedrive_list_boards",
    description: "List all project boards. Returns the complete list (no pagination — the boards endpoint returns all records at once). (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    handler: listBoards,
    schema: ListBoardsSchema,
  },
  {
    name: "pipedrive_get_board",
    description: "Get detailed information about a specific project board by ID. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The board ID" },
      },
      required: ["id"],
    },
    handler: getBoard,
    schema: GetBoardSchema,
  },
  {
    name: "pipedrive_create_board",
    description: "Create a new project board. name is required. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Board name (required, must not be empty)" },
        order_nr: { type: "number", description: "Board order number (integer >= 1)" },
      },
      required: ["name"],
    },
    handler: createBoard,
    schema: CreateBoardSchema,
  },
  {
    name: "pipedrive_update_board",
    description: "Update an existing project board. Only id is required; all other fields are optional. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The board ID to update" },
        name: { type: "string", description: "Board name" },
        order_nr: { type: "number", description: "Board order number (integer >= 1)" },
      },
      required: ["id"],
    },
    handler: updateBoard,
    schema: UpdateBoardSchema,
  },
  {
    name: "pipedrive_delete_board",
    description: "Delete a project board. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The board ID to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deleteBoard,
    schema: DeleteBoardSchema,
  },
];

export const phaseTools = [
  {
    name: "pipedrive_list_phases",
    description: "List all phases for a project board. board_id is required. Returns the complete list (no pagination — the phases endpoint returns all records for a board at once). (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        board_id: { type: "number", description: "ID of the board to list phases for (required)" },
      },
      required: ["board_id"],
    },
    handler: listPhases,
    schema: ListPhasesSchema,
  },
  {
    name: "pipedrive_get_phase",
    description: "Get detailed information about a specific project phase by ID. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The phase ID" },
      },
      required: ["id"],
    },
    handler: getPhase,
    schema: GetPhaseSchema,
  },
  {
    name: "pipedrive_create_phase",
    description: "Create a new project phase. name and board_id are required. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Phase name (required, must not be empty)" },
        board_id: { type: "number", description: "ID of the board this phase belongs to (required)" },
        order_nr: { type: "number", description: "Phase order number (integer >= 1)" },
      },
      required: ["name", "board_id"],
    },
    handler: createPhase,
    schema: CreatePhaseSchema,
  },
  {
    name: "pipedrive_update_phase",
    description: "Update an existing project phase. Only id is required; all other fields are optional. Set board_id to move this phase to a different board. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The phase ID to update" },
        name: { type: "string", description: "Phase name" },
        board_id: { type: "number", description: "ID of the board (set to move this phase to a different board)" },
        order_nr: { type: "number", description: "Phase order number (integer >= 1)" },
      },
      required: ["id"],
    },
    handler: updatePhase,
    schema: UpdatePhaseSchema,
  },
  {
    name: "pipedrive_delete_phase",
    description: "Delete a project phase. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The phase ID to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deletePhase,
    schema: DeletePhaseSchema,
  },
];
