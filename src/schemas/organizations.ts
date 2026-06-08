/**
 * Zod schemas for Organization-related operations
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  IdParamSchema,
  SearchTermSchema,
  SortDirectionSchema,
  VisibilitySchema,
} from "./common.js";

/**
 * List organizations parameters
 */
export const ListOrganizationsSchema = PaginationParamsSchema.extend({
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  ids: z.string().optional()
    .describe("Comma-separated organization IDs to fetch (max 100)"),
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  first_char: z.string().length(1).optional()
    .describe("Filter by first character of name"),
  updated_since: z.string().optional()
    .describe("Filter organizations updated after this time (RFC3339 format)"),
  updated_until: z.string().optional()
    .describe("Filter organizations updated before this time (RFC3339 format)"),
  sort_by: z.enum(["id", "update_time", "add_time"])
    .optional()
    .describe("Field to sort by (id, update_time, add_time)"),
  sort_direction: SortDirectionSchema,
  include_fields: z.string().optional()
    .describe("Include additional data in response"),
  custom_fields: z.string().optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Get organization parameters
 */
export const GetOrganizationSchema = IdParamSchema.extend({
  include_fields: z.string().optional()
    .describe("Include additional data in response"),
  custom_fields: z.string().optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Create organization parameters
 */
export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255)
    .describe("Organization name (required)"),
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID (defaults to API key owner)"),
  visible_to: VisibilitySchema,
  address: z.string().optional()
    .describe("Full address"),
  label_ids: z.array(z.number()).optional()
    .describe("Label IDs to attach to organization"),
  add_time: z.string().optional()
    .describe("Creation time (RFC3339 format) - backdate the organization"),
  custom_fields: z.record(z.string(), z.unknown()).optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Update organization parameters
 */
export const UpdateOrganizationSchema = IdParamSchema.extend({
  name: z.string().min(1).max(255).optional()
    .describe("New organization name"),
  owner_id: z.number().int().positive().optional()
    .describe("New owner user ID"),
  visible_to: VisibilitySchema,
  address: z.string().optional()
    .describe("New address"),
  label_ids: z.array(z.number()).optional()
    .describe("Label IDs to set on organization"),
  custom_fields: z.record(z.string(), z.unknown()).optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Search organizations parameters
 */
export const SearchOrganizationsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for organization name or address"),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
});

/**
 * Delete organization parameters
 */
export const DeleteOrganizationSchema = IdParamSchema;

/**
 * Type exports
 */
export type ListOrganizationsParams = z.infer<typeof ListOrganizationsSchema>;
export type GetOrganizationParams = z.infer<typeof GetOrganizationSchema>;
export type CreateOrganizationParams = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationParams = z.infer<typeof UpdateOrganizationSchema>;
export type SearchOrganizationsParams = z.infer<typeof SearchOrganizationsSchema>;
export type DeleteOrganizationParams = z.infer<typeof DeleteOrganizationSchema>;
