/**
 * Project-related MCP tools for Pipedrive (Projects add-on, PUBLIC BETA)
 */

import { getClient } from "../client.js";
import {
  ListProjectsSchema,
  GetProjectSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  DeleteProjectSchema,
  ArchiveProjectSchema,
  SearchProjectsSchema,
  ListProjectTasksSchema,
  type ListProjectsParams,
  type GetProjectParams,
  type CreateProjectParams,
  type UpdateProjectParams,
  type DeleteProjectParams,
  type ArchiveProjectParams,
  type SearchProjectsParams,
  type ListProjectTasksParams,
} from "../schemas/projects.js";
import {
  buildPaginationParamsV2,
  extractPaginationV2,
  buildPaginationParamsV1,
  extractPaginationV1,
} from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

/**
 * List projects with optional filtering
 */
export async function listProjects(params: ListProjectsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.phase_id) queryParams.set("phase_id", String(params.phase_id));
  if (params.status) queryParams.set("status", params.status);
  if (params.board_id) queryParams.set("board_id", String(params.board_id));
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);

  const response = await client.get<unknown[]>("/projects", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const projects = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("project", projects.length, pagination.has_more),
        data: projects,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Get a single project by ID
 */
export async function getProject(params: GetProjectParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/projects/${params.id}`);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Project ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Create a new project
 */
export async function createProject(params: CreateProjectParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    title: params.title,
    board_id: params.board_id,
    phase_id: params.phase_id,
  };

  if (params.description) body.description = params.description;
  if (params.status) body.status = params.status;
  if (params.owner_id) body.owner_id = params.owner_id;
  if (params.start_date) body.start_date = params.start_date;
  if (params.end_date) body.end_date = params.end_date;
  if (params.deal_ids) body.deal_ids = params.deal_ids;
  if (params.person_ids) body.person_ids = params.person_ids;
  if (params.org_ids) body.org_ids = params.org_ids;
  if (params.label_ids) body.label_ids = params.label_ids;

  const response = await client.post<unknown>("/projects", body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Project created",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Update an existing project
 */
export async function updateProject(params: UpdateProjectParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.title) body.title = updateFields.title;
  if (updateFields.board_id) body.board_id = updateFields.board_id;
  if (updateFields.phase_id) body.phase_id = updateFields.phase_id;
  if (updateFields.description) body.description = updateFields.description;
  if (updateFields.status) body.status = updateFields.status;
  if (updateFields.owner_id) body.owner_id = updateFields.owner_id;
  if (updateFields.start_date) body.start_date = updateFields.start_date;
  if (updateFields.end_date) body.end_date = updateFields.end_date;
  if (updateFields.deal_ids) body.deal_ids = updateFields.deal_ids;
  if (updateFields.person_ids) body.person_ids = updateFields.person_ids;
  if (updateFields.org_ids) body.org_ids = updateFields.org_ids;
  if (updateFields.label_ids) body.label_ids = updateFields.label_ids;

  const response = await client.patch<unknown>(`/projects/${id}`, body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Project ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Delete a project (requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true)
 */
export async function deleteProject(params: DeleteProjectParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/projects/${params.id}`);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Project ${params.id} deleted`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Archive a project by setting status to 'archived' via PATCH.
 * (Archive endpoint semantics assumed; see issue #14.)
 */
export async function archiveProject(params: ArchiveProjectParams) {
  const client = getClient();

  const response = await client.patch<unknown>(`/projects/${params.id}`, { status: "archived" });

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Project ${params.id} archived`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Search projects using the v2 search endpoint
 */
export async function searchProjects(params: SearchProjectsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);

  const response = await client.get<unknown>("/projects/search", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Search results for "${params.term}"`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * List tasks belonging to a project (v1 endpoint)
 */
export async function listProjectTasks(params: ListProjectTasksParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV1(params.start, params.limit);

  const response = await client.get<unknown[]>(`/projects/${params.id}/tasks`, queryParams, "v1");

  if (!response.success) {
    return mcpErrorResult(response);
  }

  const tasks = response.data || [];
  const pagination = extractPaginationV1(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("task", tasks.length, pagination.has_more),
        data: tasks,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const projectTools = [
  {
    name: "pipedrive_list_projects",
    description: "List projects from Pipedrive with optional filtering by board, phase, or status. Returns paginated results. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        phase_id: { type: "number", description: "Filter by phase ID" },
        status: { type: "string", description: "Filter by project status (e.g. open, completed, canceled, deleted)" },
        board_id: { type: "number", description: "Filter by board ID" },
        include_fields: { type: "string", description: "Comma-separated additional fields to include" },
      },
    },
    handler: listProjects,
    schema: ListProjectsSchema,
  },
  {
    name: "pipedrive_get_project",
    description: "Get detailed information about a specific project by ID. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The project ID" },
      },
      required: ["id"],
    },
    handler: getProject,
    schema: GetProjectSchema,
  },
  {
    name: "pipedrive_create_project",
    description: "Create a new project in Pipedrive. Requires title, board_id, and phase_id. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Project title (required)" },
        board_id: { type: "number", description: "Board ID the project belongs to (required)" },
        phase_id: { type: "number", description: "Phase ID within the board (required)" },
        description: { type: "string", description: "Project description" },
        status: { type: "string", description: "Project status" },
        owner_id: { type: "number", description: "Owner user ID" },
        start_date: { type: "string", description: "Project start date (YYYY-MM-DD)" },
        end_date: { type: "string", description: "Project end date (YYYY-MM-DD)" },
        deal_ids: { type: "array", items: { type: "number" }, description: "Deal IDs linked to the project" },
        person_ids: { type: "array", items: { type: "number" }, description: "Person IDs linked to the project" },
        org_ids: { type: "array", items: { type: "number" }, description: "Organization IDs linked to the project" },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to attach to the project" },
      },
      required: ["title", "board_id", "phase_id"],
    },
    handler: createProject,
    schema: CreateProjectSchema,
  },
  {
    name: "pipedrive_update_project",
    description: "Update an existing project in Pipedrive. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Project ID to update" },
        title: { type: "string", description: "New project title" },
        board_id: { type: "number", description: "New board ID the project belongs to" },
        phase_id: { type: "number", description: "New phase ID within the board" },
        description: { type: "string", description: "New project description" },
        status: { type: "string", description: "New project status" },
        owner_id: { type: "number", description: "New owner user ID" },
        start_date: { type: "string", description: "New project start date (YYYY-MM-DD)" },
        end_date: { type: "string", description: "New project end date (YYYY-MM-DD)" },
        deal_ids: { type: "array", items: { type: "number" }, description: "New deal IDs linked to the project" },
        person_ids: { type: "array", items: { type: "number" }, description: "New person IDs linked to the project" },
        org_ids: { type: "array", items: { type: "number" }, description: "New organization IDs linked to the project" },
        label_ids: { type: "array", items: { type: "number" }, description: "New label IDs to attach to the project" },
      },
      required: ["id"],
    },
    handler: updateProject,
    schema: UpdateProjectSchema,
  },
  {
    name: "pipedrive_delete_project",
    description: "Delete a project. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true environment variable. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Project ID to delete" },
      },
      required: ["id"],
    },
    handler: deleteProject,
    schema: DeleteProjectSchema,
  },
  {
    name: "pipedrive_search_projects",
    description: "Search for projects in Pipedrive by title. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        term: { type: "string", description: "Search term (required)" },
        include_fields: { type: "string", description: "Comma-separated additional fields to include" },
        exact_match: { type: "boolean", description: "Use exact match instead of fuzzy search" },
        limit: { type: "number", description: "Number of results (1-100, default 50)" },
        cursor: { type: "string", description: "Cursor for pagination" },
      },
      required: ["term"],
    },
    handler: searchProjects,
    schema: SearchProjectsSchema,
  },
  {
    name: "pipedrive_archive_project",
    description: "Archive a project by setting its status to archived. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Project ID to archive" },
      },
      required: ["id"],
    },
    handler: archiveProject,
    schema: ArchiveProjectSchema,
  },
  {
    name: "pipedrive_list_project_tasks",
    description: "List tasks belonging to a project. (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Project ID" },
        start: { type: "number", description: "Pagination offset (0-based)" },
        limit: { type: "number", description: "Number of items (1-500, default 50)" },
      },
      required: ["id"],
    },
    handler: listProjectTasks,
    schema: ListProjectTasksSchema,
  },
];
