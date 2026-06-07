/**
 * Zod schemas for Project-related operations (Projects add-on, PUBLIC BETA)
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  PaginationParamsV1Schema,
  IdParamSchema,
  SearchTermSchema,
  DateStringSchema,
} from "./common.js";

/**
 * List projects parameters (v2)
 */
export const ListProjectsSchema = PaginationParamsSchema.extend({
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  phase_id: z.number().int().positive().optional()
    .describe("Filter by phase ID"),
  status: z.string().optional()
    .describe("Filter by project status (e.g. open, completed, canceled, deleted)"),
  board_id: z.number().int().positive().optional()
    .describe("Filter by board ID"),
  include_fields: z.string().optional()
    .describe("Comma-separated additional fields to include"),
});

/**
 * Get project parameters
 */
export const GetProjectSchema = IdParamSchema;

/**
 * Create project parameters
 */
export const CreateProjectSchema = z.object({
  title: z.string().min(1).max(255)
    .describe("Project title (required)"),
  board_id: z.number().int().positive()
    .describe("Board ID the project belongs to (required)"),
  phase_id: z.number().int().positive()
    .describe("Phase ID within the board (required)"),
  description: z.string().optional() // guess
    .describe("Project description"),
  status: z.string().optional() // guess
    .describe("Project status"),
  owner_id: z.number().int().positive().optional() // guess
    .describe("Owner user ID"),
  start_date: DateStringSchema.optional() // guess
    .describe("Project start date (YYYY-MM-DD format)"),
  end_date: DateStringSchema.optional() // guess
    .describe("Project end date (YYYY-MM-DD format)"),
  deal_ids: z.array(z.number().int().positive()).optional() // guess
    .describe("Deal IDs linked to the project"),
  org_id: z.number().int().positive().optional() // guess
    .describe("Linked organization ID"),
  person_id: z.number().int().positive().optional() // guess
    .describe("Linked person ID"),
  labels: z.array(z.number().int().positive()).optional() // guess
    .describe("Label IDs to attach to the project"),
});

/**
 * Update project parameters - all fields optional
 */
export const UpdateProjectSchema = IdParamSchema.extend({
  title: z.string().min(1).max(255).optional()
    .describe("New project title"),
  board_id: z.number().int().positive().optional()
    .describe("New board ID the project belongs to"),
  phase_id: z.number().int().positive().optional()
    .describe("New phase ID within the board"),
  description: z.string().optional() // guess
    .describe("New project description"),
  status: z.string().optional() // guess
    .describe("New project status"),
  owner_id: z.number().int().positive().optional() // guess
    .describe("New owner user ID"),
  start_date: DateStringSchema.optional() // guess
    .describe("New project start date (YYYY-MM-DD format)"),
  end_date: DateStringSchema.optional() // guess
    .describe("New project end date (YYYY-MM-DD format)"),
  deal_ids: z.array(z.number().int().positive()).optional() // guess
    .describe("New deal IDs linked to the project"),
  org_id: z.number().int().positive().optional() // guess
    .describe("New linked organization ID"),
  person_id: z.number().int().positive().optional() // guess
    .describe("New linked person ID"),
  labels: z.array(z.number().int().positive()).optional() // guess
    .describe("New label IDs to attach to the project"),
});

/**
 * Delete project parameters
 */
export const DeleteProjectSchema = IdParamSchema;

/**
 * Archive project parameters
 */
export const ArchiveProjectSchema = IdParamSchema;

/**
 * Search projects parameters (v2 endpoint)
 */
export const SearchProjectsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for project title"),
  include_fields: z.string().optional()
    .describe("Comma-separated additional fields to include in response"),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return (1-100, default 50)"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});

/**
 * List project tasks parameters (v1 endpoint)
 */
export const ListProjectTasksSchema = PaginationParamsV1Schema.extend({
  id: z.number().int().positive().describe("Project ID"),
});

/**
 * Type exports
 */
export type ListProjectsParams = z.infer<typeof ListProjectsSchema>;
export type GetProjectParams = z.infer<typeof GetProjectSchema>;
export type CreateProjectParams = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectParams = z.infer<typeof UpdateProjectSchema>;
export type DeleteProjectParams = z.infer<typeof DeleteProjectSchema>;
export type ArchiveProjectParams = z.infer<typeof ArchiveProjectSchema>;
export type SearchProjectsParams = z.infer<typeof SearchProjectsSchema>;
export type ListProjectTasksParams = z.infer<typeof ListProjectTasksSchema>;
