/**
 * Note-related MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListNotesSchema,
  GetNoteSchema,
  CreateNoteSchema,
  UpdateNoteSchema,
  DeleteNoteSchema,
  type ListNotesParams,
  type GetNoteParams,
  type CreateNoteParams,
  type UpdateNoteParams,
  type DeleteNoteParams,
} from "../schemas/notes.js";
import { buildPaginationParamsV1, extractPaginationV1 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

/**
 * List notes with optional filtering
 */
export async function listNotes(params: ListNotesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV1(params.start, params.limit);

  if (params.deal_id) queryParams.set("deal_id", String(params.deal_id));
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.org_id) queryParams.set("org_id", String(params.org_id));
  if (params.lead_id) queryParams.set("lead_id", params.lead_id);
  if (params.pinned_to_deal_flag !== undefined) {
    queryParams.set("pinned_to_deal_flag", params.pinned_to_deal_flag ? "1" : "0");
  }
  if (params.pinned_to_person_flag !== undefined) {
    queryParams.set("pinned_to_person_flag", params.pinned_to_person_flag ? "1" : "0");
  }
  if (params.pinned_to_organization_flag !== undefined) {
    queryParams.set("pinned_to_organization_flag", params.pinned_to_organization_flag ? "1" : "0");
  }
  if (params.sort) queryParams.set("sort", params.sort);
  if (params.sort_direction) {
    // Pipedrive v1 API uses sort field with direction suffix
    const currentSort = queryParams.get("sort") || "id";
    queryParams.set("sort", `${currentSort} ${params.sort_direction.toUpperCase()}`);
  }

  const response = await client.get<unknown[]>("/notes", queryParams, "v1");

  if (!response.success) {
    return mcpErrorResult(response);
  }

  const notes = response.data || [];
  const pagination = extractPaginationV1(response);

  return formatToolResponse({
    summary: createListSummary("note", notes.length, pagination.has_more),
    data: notes,
    pagination,
  });
}

/**
 * Get a single note by ID
 */
export async function getNote(params: GetNoteParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/notes/${params.id}`, undefined, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Note ${params.id}`,
    data: response.data,
  });
}

/**
 * Create a new note
 */
export async function createNote(params: CreateNoteParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    content: params.content,
  };

  if (params.deal_id) body.deal_id = params.deal_id;
  if (params.person_id) body.person_id = params.person_id;
  if (params.org_id) body.org_id = params.org_id;
  if (params.lead_id) body.lead_id = params.lead_id;
  if (params.pinned_to_deal_flag !== undefined) {
    body.pinned_to_deal_flag = params.pinned_to_deal_flag ? 1 : 0;
  }
  if (params.pinned_to_person_flag !== undefined) {
    body.pinned_to_person_flag = params.pinned_to_person_flag ? 1 : 0;
  }
  if (params.pinned_to_organization_flag !== undefined) {
    body.pinned_to_organization_flag = params.pinned_to_organization_flag ? 1 : 0;
  }

  const response = await client.post<unknown>("/notes", body, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Note created",
    data: response.data,
  });
}

/**
 * Update an existing note
 */
export async function updateNote(params: UpdateNoteParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.content) body.content = updateFields.content;
  if (updateFields.deal_id) body.deal_id = updateFields.deal_id;
  if (updateFields.person_id) body.person_id = updateFields.person_id;
  if (updateFields.org_id) body.org_id = updateFields.org_id;
  if (updateFields.lead_id) body.lead_id = updateFields.lead_id;
  if (updateFields.pinned_to_deal_flag !== undefined) {
    body.pinned_to_deal_flag = updateFields.pinned_to_deal_flag ? 1 : 0;
  }
  if (updateFields.pinned_to_person_flag !== undefined) {
    body.pinned_to_person_flag = updateFields.pinned_to_person_flag ? 1 : 0;
  }
  if (updateFields.pinned_to_organization_flag !== undefined) {
    body.pinned_to_organization_flag = updateFields.pinned_to_organization_flag ? 1 : 0;
  }

  const response = await client.put<unknown>(`/notes/${id}`, body, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Note ${id} updated`,
    data: response.data,
  });
}

/**
 * Delete a note
 */
export async function deleteNote(params: DeleteNoteParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/notes/${params.id}`, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Note ${params.id} deleted`,
    data: response.data,
  });
}

/**
 * Tool definitions for MCP registration
 */
export const noteTools = [
  {
    name: "pipedrive_list_notes",
    description: "List notes from Pipedrive with optional filtering by deal, person, organization, or lead.",
    inputSchema: {
      type: "object" as const,
      properties: {
        start: { type: "number", description: "Pagination offset (0-based)" },
        limit: { type: "number", description: "Number of items (1-500)" },
        deal_id: { type: "number", description: "Filter by deal ID" },
        person_id: { type: "number", description: "Filter by person ID" },
        org_id: { type: "number", description: "Filter by organization ID" },
        lead_id: { type: "string", description: "Filter by lead ID (UUID format)" },
        pinned_to_deal_flag: { type: "boolean", description: "Filter by pinned to deal" },
        pinned_to_person_flag: { type: "boolean", description: "Filter by pinned to person" },
        pinned_to_organization_flag: { type: "boolean", description: "Filter by pinned to organization" },
        sort: { type: "string", enum: ["id", "add_time", "update_time"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
      },
    },
    handler: listNotes,
    schema: ListNotesSchema,
  },
  {
    name: "pipedrive_get_note",
    description: "Get detailed information about a specific note by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The note ID" },
      },
      required: ["id"],
    },
    handler: getNote,
    schema: GetNoteSchema,
  },
  {
    name: "pipedrive_create_note",
    description: "Create a new note in Pipedrive. Content is required. Link to a deal, person, organization, or lead.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Note content (required, HTML supported)" },
        deal_id: { type: "number", description: "Link to deal ID" },
        person_id: { type: "number", description: "Link to person ID" },
        org_id: { type: "number", description: "Link to organization ID" },
        lead_id: { type: "string", description: "Link to lead ID (UUID format)" },
        pinned_to_deal_flag: { type: "boolean", description: "Pin note to deal" },
        pinned_to_person_flag: { type: "boolean", description: "Pin note to person" },
        pinned_to_organization_flag: { type: "boolean", description: "Pin note to organization" },
      },
      required: ["content"],
    },
    handler: createNote,
    schema: CreateNoteSchema,
  },
  {
    name: "pipedrive_update_note",
    description: "Update an existing note in Pipedrive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Note ID to update" },
        content: { type: "string", description: "New note content (HTML supported)" },
        deal_id: { type: "number", description: "New linked deal ID" },
        person_id: { type: "number", description: "New linked person ID" },
        org_id: { type: "number", description: "New linked organization ID" },
        lead_id: { type: "string", description: "New linked lead ID (UUID format)" },
        pinned_to_deal_flag: { type: "boolean", description: "Pin note to deal" },
        pinned_to_person_flag: { type: "boolean", description: "Pin note to person" },
        pinned_to_organization_flag: { type: "boolean", description: "Pin note to organization" },
      },
      required: ["id"],
    },
    handler: updateNote,
    schema: UpdateNoteSchema,
  },
  {
    name: "pipedrive_delete_note",
    description: "Delete a note.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Note ID to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deleteNote,
    schema: DeleteNoteSchema,
  },
];
