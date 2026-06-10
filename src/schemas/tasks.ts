/**
 * Zod schemas for Task-related operations (Projects API - public beta)
 */

import { z } from "zod";
import { PaginationParamsSchema, IdParamSchema } from "./common.js";

// ─── U1: Read schemas ─────────────────────────────────────────────────────────

/**
 * List tasks parameters
 */
export const ListTasksSchema = PaginationParamsSchema.extend({
  is_done: z.boolean().optional()
    .describe("Filter by done status"),
  is_milestone: z.boolean().optional()
    .describe("Filter by milestone status"),
  assignee_id: z.number().int().positive().optional()
    .describe("Filter by assignee user ID"),
  project_id: z.number().int().positive().optional()
    .describe("Filter by project ID"),
  // The API accepts a string: an integer-string for subtask filtering, or the
  // literal "null" to return only root-level tasks (no parent).
  parent_task_id: z.string().optional()
    .describe("Filter by parent task ID. Use the literal string \"null\" to return only root-level tasks."),
});

/**
 * Get task parameters
 */
export const GetTaskSchema = IdParamSchema;

// ─── U2: Write schemas ────────────────────────────────────────────────────────

/**
 * Helper: coerces boolean true/false to int 1/0, preserves 0/1, rejects other values.
 * Used for the done/milestone fields which are int 0|1 in the API (not boolean).
 */
const DoneOrMilestoneSchema = z.preprocess(
  (val) => {
    if (val === true) return 1;
    if (val === false) return 0;
    return val;
  },
  z.union([z.literal(0), z.literal(1)])
).optional();

/**
 * Create task parameters
 */
export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255)
    .describe("Task title (required, 1-255 chars)"),
  project_id: z.number().int().positive()
    .describe("ID of the project this task belongs to (required)"),
  parent_task_id: z.number().int().positive().nullable().optional()
    .describe("ID of the parent task (null for root-level task)"),
  description: z.string().nullable().optional()
    .describe("Task description"),
  done: DoneOrMilestoneSchema
    .describe("Mark task as done: use 0 (not done) or 1 (done). Note: the GET response returns is_done (boolean), but this write field uses integer 0/1."),
  milestone: DoneOrMilestoneSchema
    .describe("Mark task as milestone: use 0 (no) or 1 (yes). Note: the GET response returns is_milestone (boolean), but this write field uses integer 0/1."),
  due_date: z.string().nullable().optional()
    .describe("Task due date (YYYY-MM-DD format)"),
  start_date: z.string().nullable().optional()
    .describe("Task start date (YYYY-MM-DD format)"),
  assignee_id: z.number().int().positive().nullable().optional()
    .describe("Assignee user ID"),
  assignee_ids: z.array(z.number().int().positive()).max(10).optional()
    .describe("Array of assignee user IDs (max 10)"),
  priority: z.number().int().min(0).nullable().optional()
    .describe("Task priority (integer >= 0, or null to unset)"),
});

/**
 * Update task parameters
 */
export const UpdateTaskSchema = IdParamSchema.extend({
  title: z.string().min(1).max(255).optional()
    .describe("Task title (1-255 chars)"),
  project_id: z.number().int().positive().optional()
    .describe("ID of the project this task belongs to"),
  parent_task_id: z.number().int().positive().nullable().optional()
    .describe("ID of the parent task (null to make root-level)"),
  description: z.string().nullable().optional()
    .describe("Task description"),
  done: DoneOrMilestoneSchema
    .describe("Mark task as done: use 0 (not done) or 1 (done). Note: the GET response returns is_done (boolean), but this write field uses integer 0/1."),
  milestone: DoneOrMilestoneSchema
    .describe("Mark task as milestone: use 0 (no) or 1 (yes). Note: the GET response returns is_milestone (boolean), but this write field uses integer 0/1."),
  due_date: z.string().nullable().optional()
    .describe("Task due date (YYYY-MM-DD format)"),
  start_date: z.string().nullable().optional()
    .describe("Task start date (YYYY-MM-DD format)"),
  assignee_id: z.number().int().positive().nullable().optional()
    .describe("Assignee user ID"),
  assignee_ids: z.array(z.number().int().positive()).max(10).optional()
    .describe("Array of assignee user IDs (max 10)"),
  priority: z.number().int().min(0).nullable().optional()
    .describe("Task priority (integer >= 0, or null to unset)"),
});

/**
 * Delete task parameters
 */
export const DeleteTaskSchema = IdParamSchema;

// ─── Type exports ─────────────────────────────────────────────────────────────

export type ListTasksParams = z.infer<typeof ListTasksSchema>;
export type GetTaskParams = z.infer<typeof GetTaskSchema>;
export type CreateTaskParams = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskParams = z.infer<typeof UpdateTaskSchema>;
export type DeleteTaskParams = z.infer<typeof DeleteTaskSchema>;
