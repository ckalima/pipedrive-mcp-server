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
  ListProjectTemplatesSchema,
  GetProjectTemplateSchema,
  ListArchivedProjectsSchema,
  GetProjectPermittedUsersSchema,
  GetProjectChangelogSchema,
  type ListProjectsParams,
  type GetProjectParams,
  type CreateProjectParams,
  type UpdateProjectParams,
  type DeleteProjectParams,
  type ArchiveProjectParams,
  type SearchProjectsParams,
  type ListProjectTasksParams,
  type ListProjectTemplatesParams,
  type GetProjectTemplateParams,
  type ListArchivedProjectsParams,
  type GetProjectPermittedUsersParams,
  type GetProjectChangelogParams,
} from "../schemas/projects.js";
import {
  buildPaginationParamsV2,
  extractPaginationV2,
} from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

/**
 * List projects with optional filtering
 */
export async function listProjects(params: ListProjectsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.phase_id) queryParams.set("phase_id", String(params.phase_id));
  if (params.status) queryParams.set("status", params.status);

  const response = await client.get<unknown[]>("/projects", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const projects = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("project", projects.length, pagination.has_more),
    data: projects,
    pagination,
  });
}

/**
 * Get a single project by ID
 */
export async function getProject(params: GetProjectParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/projects/${params.id}`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project ${params.id}`,
    data: response.data,
  });
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

  const response = await client.post<unknown>("/projects", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Project created",
    data: response.data,
  });
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

  const response = await client.patch<unknown>(`/projects/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project ${id} updated`,
    data: response.data,
  });
}

/**
 * Delete a project (requires PIPEDRIVE_MODE=full)
 */
export async function deleteProject(params: DeleteProjectParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/projects/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project ${params.id} deleted`,
    data: response.data,
  });
}

/**
 * Archive a project via the dedicated v2 POST /projects/{id}/archive endpoint (no body).
 */
export async function archiveProject(params: ArchiveProjectParams) {
  const client = getClient();

  const response = await client.post<unknown>(`/projects/${params.id}/archive`, {}, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project ${params.id} archived`,
    data: response.data,
  });
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

  const response = await client.get<unknown>("/projects/search", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Search results for "${params.term}"`,
    data: response.data,
  });
}

/**
 * List tasks belonging to a project via v2 GET /tasks?project_id={id} (cursor pagination).
 */
export async function listProjectTasks(params: ListProjectTasksParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
  queryParams.set("project_id", String(params.id));

  const response = await client.get<unknown[]>("/tasks", queryParams, "v2");

  if (!response.success) {
    return mcpErrorResult(response);
  }

  const tasks = response.data || [];
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("task", tasks.length, pagination.has_more),
    data: tasks,
    pagination,
  });
}

/**
 * List project templates (paginated)
 */
export async function listProjectTemplates(params: ListProjectTemplatesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>("/projectTemplates", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const templates = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("project template", templates.length, pagination.has_more),
    data: templates,
    pagination,
  });
}

/**
 * Get a single project template by ID
 */
export async function getProjectTemplate(params: GetProjectTemplateParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/projectTemplates/${params.id}`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Project template ${params.id}`,
    data: response.data,
  });
}

/**
 * List archived projects with optional filtering
 */
export async function listArchivedProjects(params: ListArchivedProjectsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.phase_id) queryParams.set("phase_id", String(params.phase_id));
  if (params.status) queryParams.set("status", params.status);

  const response = await client.get<unknown[]>("/projects/archived", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const projects = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("archived project", projects.length, pagination.has_more),
    data: projects,
    pagination,
  });
}

/**
 * Get permitted users for a project.
 * Response data is an array of integer user IDs (not objects) with no pagination.
 */
export async function getProjectPermittedUsers(params: GetProjectPermittedUsersParams) {
  const client = getClient();

  const response = await client.get<number[]>(`/projects/${params.id}/permittedUsers`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;

  return formatToolResponse({
    summary: `${data.length} permitted user(s) for project ${params.id}`,
    data,
  });
}

/**
 * Get project changelog (cursor paginated)
 */
export async function getProjectChangelog(params: GetProjectChangelogParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/projects/${params.id}/changelog`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const entries = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("changelog entry", entries.length, pagination.has_more),
    data: entries,
    pagination,
  });
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
    description: "Delete a project. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true). (Requires the Projects add-on; Projects API is in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Project ID to delete" },
      },
      required: ["id"],
    },
    destructive: true,
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
    description: "List tasks for a project you already have the ID for — pass only `id` (the project ID). For broader task queries use pipedrive_list_tasks. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Project ID" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100, default 50)" },
      },
      required: ["id"],
    },
    handler: listProjectTasks,
    schema: ListProjectTasksSchema,
  },
  {
    name: "pipedrive_list_project_templates",
    description: "List all project templates available in Pipedrive. Returns paginated results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
      },
    },
    handler: listProjectTemplates,
    schema: ListProjectTemplatesSchema,
  },
  {
    name: "pipedrive_get_project_template",
    description: "Get detailed information about a specific project template by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The project template ID" },
      },
      required: ["id"],
    },
    handler: getProjectTemplate,
    schema: GetProjectTemplateSchema,
  },
  {
    name: "pipedrive_list_archived_projects",
    description: "List archived projects from Pipedrive with optional filtering by filter, phase, or status. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        phase_id: { type: "number", description: "Filter by phase ID" },
        status: { type: "string", description: "Filter by project status (e.g. open, completed, canceled)" },
      },
    },
    handler: listArchivedProjects,
    schema: ListArchivedProjectsSchema,
  },
  {
    name: "pipedrive_get_project_permitted_users",
    description: "Get the list of user IDs that have permission to access a project. Returns an array of integer user IDs. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The project ID" },
      },
      required: ["id"],
    },
    handler: getProjectPermittedUsers,
    schema: GetProjectPermittedUsersSchema,
  },
  {
    name: "pipedrive_get_project_changelog",
    description: "Get the changelog for a project, showing what changed, when, and by whom. Returns paginated entries with actor_user_id, new_values, and old_values. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The project ID" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
      },
      required: ["id"],
    },
    handler: getProjectChangelog,
    schema: GetProjectChangelogSchema,
  },
];
