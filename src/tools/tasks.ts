/**
 * Task-related MCP tools for Pipedrive (Projects API - public beta)
 */

import { getClient } from "../client.js";
import {
  ListTasksSchema,
  GetTaskSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  DeleteTaskSchema,
  type ListTasksParams,
  type GetTaskParams,
  type CreateTaskParams,
  type UpdateTaskParams,
  type DeleteTaskParams,
} from "../schemas/tasks.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

// ─── U1: Read handlers ────────────────────────────────────────────────────────

/**
 * General task query across all projects, with optional filters.
 * Use for anything beyond a single project's full task list.
 * For a project you already have the ID for, consider pipedrive_list_project_tasks.
 */
export async function listTasks(params: ListTasksParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.is_done !== undefined) queryParams.set("is_done", String(params.is_done));
  if (params.is_milestone !== undefined) queryParams.set("is_milestone", String(params.is_milestone));
  if (params.assignee_id !== undefined) queryParams.set("assignee_id", String(params.assignee_id));
  if (params.project_id !== undefined) queryParams.set("project_id", String(params.project_id));
  if (params.parent_task_id !== undefined) queryParams.set("parent_task_id", params.parent_task_id);

  const response = await client.get<unknown[]>("/tasks", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const tasks = response.data;
  const pagination = extractPaginationV2(response);

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
 * Get a single task by ID.
 */
export async function getTask(params: GetTaskParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/tasks/${params.id}`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Task ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

// ─── U2: Write handlers ───────────────────────────────────────────────────────

/**
 * Create a new task. title and project_id are required.
 * Write fields are boolean is_done/is_milestone, same as the GET response.
 * The spec-documented done/milestone int 0|1 fields are silently ignored by
 * the live v2 API (issue #81).
 */
export async function createTask(params: CreateTaskParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    title: params.title,
    project_id: params.project_id,
  };

  if (params.parent_task_id !== undefined) body.parent_task_id = params.parent_task_id;
  if (params.description !== undefined) body.description = params.description;
  if (params.is_done !== undefined) body.is_done = params.is_done;
  if (params.is_milestone !== undefined) body.is_milestone = params.is_milestone;
  if (params.due_date !== undefined) body.due_date = params.due_date;
  if (params.start_date !== undefined) body.start_date = params.start_date;
  if (params.assignee_id !== undefined) body.assignee_id = params.assignee_id;
  if (params.assignee_ids !== undefined) body.assignee_ids = params.assignee_ids;
  if (params.priority !== undefined) body.priority = params.priority;

  const response = await client.post<unknown>("/tasks", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Task created",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Update an existing task. Only id is required; all other fields are optional.
 * Write fields are boolean is_done/is_milestone, same as the GET response.
 * The spec-documented done/milestone int 0|1 fields are silently ignored by
 * the live v2 API (issue #81).
 */
export async function updateTask(params: UpdateTaskParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.title !== undefined) body.title = updateFields.title;
  if (updateFields.project_id !== undefined) body.project_id = updateFields.project_id;
  if (updateFields.parent_task_id !== undefined) body.parent_task_id = updateFields.parent_task_id;
  if (updateFields.description !== undefined) body.description = updateFields.description;
  if (updateFields.is_done !== undefined) body.is_done = updateFields.is_done;
  if (updateFields.is_milestone !== undefined) body.is_milestone = updateFields.is_milestone;
  if (updateFields.due_date !== undefined) body.due_date = updateFields.due_date;
  if (updateFields.start_date !== undefined) body.start_date = updateFields.start_date;
  if (updateFields.assignee_id !== undefined) body.assignee_id = updateFields.assignee_id;
  if (updateFields.assignee_ids !== undefined) body.assignee_ids = updateFields.assignee_ids;
  if (updateFields.priority !== undefined) body.priority = updateFields.priority;

  const response = await client.patch<unknown>(`/tasks/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Task ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Delete a task. If the task has subtasks, those will also be deleted.
 * Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.
 */
export async function deleteTask(params: DeleteTaskParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/tasks/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Task ${params.id} deleted (subtasks also deleted)`,
        data: response.data,
      }, null, 2),
    }],
  };
}

// ─── Tool definitions for MCP registration ───────────────────────────────────

export const taskTools = [
  // U1: Read tools
  {
    name: "pipedrive_list_tasks",
    description: "General task query across all projects, with optional project_id, assignee_id, done/milestone, and parent filters. Use for anything beyond a single project's full task list. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100, default 50)" },
        is_done: { type: "boolean", description: "Filter by done status" },
        is_milestone: { type: "boolean", description: "Filter by milestone status" },
        assignee_id: { type: "number", description: "Filter by assignee user ID" },
        project_id: { type: "number", description: "Filter by project ID" },
        parent_task_id: { type: "string", description: "Filter by parent task ID. Use the literal string \"null\" to return only root-level tasks." },
      },
    },
    handler: listTasks,
    schema: ListTasksSchema,
  },
  {
    name: "pipedrive_get_task",
    description: "Get detailed information about a specific task by ID. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The task ID" },
      },
      required: ["id"],
    },
    handler: getTask,
    schema: GetTaskSchema,
  },
  // U2: Write tools
  {
    name: "pipedrive_create_task",
    description: "Create a new task in a project. title and project_id are required. Use boolean is_done/is_milestone (same field names as the GET response); a milestone task must have a due_date. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title (required, 1-255 chars)" },
        project_id: { type: "number", description: "ID of the project this task belongs to (required)" },
        parent_task_id: { type: "number", description: "ID of the parent task (null for root-level)" },
        description: { type: "string", description: "Task description" },
        is_done: { type: "boolean", description: "Mark as done (true/false)" },
        is_milestone: { type: "boolean", description: "Mark as milestone (true/false); a milestone task must have a due_date" },
        due_date: { type: "string", description: "Task due date (YYYY-MM-DD)" },
        start_date: { type: "string", description: "Task start date (YYYY-MM-DD)" },
        assignee_id: { type: "number", description: "Assignee user ID" },
        assignee_ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of assignee user IDs (max 10)",
        },
        priority: { type: "number", description: "Task priority (integer >= 0, or null to unset)" },
      },
      required: ["title", "project_id"],
    },
    handler: createTask,
    schema: CreateTaskSchema,
  },
  {
    name: "pipedrive_update_task",
    description: "Update an existing task. Only id is required; all other fields are optional. Use boolean is_done/is_milestone (same field names as the GET response); a milestone task must have a due_date. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The task ID to update" },
        title: { type: "string", description: "Task title (1-255 chars)" },
        project_id: { type: "number", description: "ID of the project this task belongs to" },
        parent_task_id: { type: "number", description: "ID of the parent task (null to make root-level)" },
        description: { type: "string", description: "Task description" },
        is_done: { type: "boolean", description: "Mark as done (true/false)" },
        is_milestone: { type: "boolean", description: "Mark as milestone (true/false); a milestone task must have a due_date" },
        due_date: { type: "string", description: "Task due date (YYYY-MM-DD)" },
        start_date: { type: "string", description: "Task start date (YYYY-MM-DD)" },
        assignee_id: { type: "number", description: "Assignee user ID" },
        assignee_ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of assignee user IDs (max 10)",
        },
        priority: { type: "number", description: "Task priority (integer >= 0, or null to unset)" },
      },
      required: ["id"],
    },
    handler: updateTask,
    schema: UpdateTaskSchema,
  },
  {
    name: "pipedrive_delete_task",
    description: "Delete a task. If the task has subtasks, those will also be deleted. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The task ID to delete" },
      },
      required: ["id"],
    },
    handler: deleteTask,
    schema: DeleteTaskSchema,
  },
];
