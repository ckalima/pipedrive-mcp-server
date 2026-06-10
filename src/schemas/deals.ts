/**
 * Zod schemas for Deal-related operations
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  IdParamSchema,
  DealStatusSchema,
  CurrencyCodeSchema,
  OptionalDateSchema,
  SearchTermSchema,
  SortDirectionSchema,
  VisibilitySchema,
} from "./common.js";

/**
 * List deals parameters
 */
export const ListDealsSchema = PaginationParamsSchema.extend({
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  ids: z.string().optional()
    .describe("Comma-separated deal IDs to fetch (max 100)"),
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by linked organization ID"),
  pipeline_id: z.number().int().positive().optional()
    .describe("Filter by pipeline ID"),
  stage_id: z.number().int().positive().optional()
    .describe("Filter by stage ID"),
  status: DealStatusSchema.optional()
    .describe("Filter by deal status (open, won, lost)"),
  updated_since: z.string().optional()
    .describe("Filter deals updated after this time (RFC3339 format, e.g. 2024-01-01T00:00:00Z)"),
  updated_until: z.string().optional()
    .describe("Filter deals updated before this time (RFC3339 format)"),
  sort_by: z.enum(["id", "update_time", "add_time"])
    .optional()
    .describe("Field to sort by (id, update_time, add_time)"),
  sort_direction: SortDirectionSchema,
  include_fields: z.string().optional()
    .describe("Comma-separated extra fields (v2 enum, e.g. next_activity_id, last_activity_id, products_count, files_count, notes_count, followers_count)"),
  custom_fields: z.string().optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Get deal parameters
 */
export const GetDealSchema = IdParamSchema.extend({
  include_fields: z.string().optional()
    .describe("Comma-separated extra fields (v2 enum, e.g. next_activity_id, last_activity_id, products_count, files_count, notes_count, followers_count)"),
  custom_fields: z.string().optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Create deal parameters
 */
export const CreateDealSchema = z.object({
  title: z.string().min(1).max(255)
    .describe("Deal title (required)"),
  value: z.number().min(0).optional()
    .describe("Deal monetary value"),
  currency: CurrencyCodeSchema,
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID (defaults to API key owner)"),
  person_id: z.number().int().positive().optional()
    .describe("ID of person to link to deal"),
  org_id: z.number().int().positive().optional()
    .describe("ID of organization to link to deal"),
  pipeline_id: z.number().int().positive().optional()
    .describe("Pipeline ID (defaults to first pipeline)"),
  stage_id: z.number().int().positive().optional()
    .describe("Stage ID (defaults to first stage in pipeline)"),
  status: z.enum(["open", "won", "lost"]).optional()
    .describe("Deal status"),
  expected_close_date: OptionalDateSchema
    .describe("Expected close date (YYYY-MM-DD)"),
  probability: z.number().min(0).max(100).optional()
    .describe("Deal success probability (0-100)"),
  visible_to: VisibilitySchema,
  label_ids: z.array(z.number()).optional()
    .describe("Label IDs to attach to deal"),
  custom_fields: z.record(z.string(), z.unknown()).optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Update deal parameters
 */
export const UpdateDealSchema = IdParamSchema.extend({
  title: z.string().min(1).max(255).optional()
    .describe("New deal title"),
  value: z.number().min(0).optional()
    .describe("New deal value"),
  currency: CurrencyCodeSchema,
  owner_id: z.number().int().positive().optional()
    .describe("New owner user ID"),
  person_id: z.number().int().positive().optional()
    .describe("New linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("New linked organization ID"),
  pipeline_id: z.number().int().positive().optional()
    .describe("New pipeline ID"),
  stage_id: z.number().int().positive().optional()
    .describe("New stage ID"),
  status: z.enum(["open", "won", "lost"]).optional()
    .describe("New deal status"),
  expected_close_date: OptionalDateSchema
    .describe("New expected close date (YYYY-MM-DD)"),
  probability: z.number().min(0).max(100).optional()
    .describe("New success probability (0-100)"),
  won_time: z.string().optional()
    .describe("Won time (required when setting status to 'won')"),
  lost_time: z.string().optional()
    .describe("Lost time (required when setting status to 'lost')"),
  lost_reason: z.string().optional()
    .describe("Lost reason (when status is 'lost')"),
  label_ids: z.array(z.number()).optional()
    .describe("Label IDs to set on deal"),
  custom_fields: z.record(z.string(), z.unknown()).optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Search deals parameters
 */
export const SearchDealsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term to find in deal title, notes, and custom fields"),
  fields: z.string().optional()
    .describe("Comma-separated fields to search (allowed: title, notes, custom_fields). Defaults to all."),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by linked organization"),
  status: DealStatusSchema.optional(),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});

/**
 * Delete deal parameters
 */
export const DeleteDealSchema = IdParamSchema;

// ─── Follower schemas (U1, #69) ───────────────────────────────────────────────

/**
 * List deal followers parameters
 */
export const ListDealFollowersSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The deal ID"),
});

/**
 * Add deal follower parameters
 */
export const AddDealFollowerSchema = IdParamSchema.extend({
  user_id: z.number().int().positive().describe("The ID of the user to add as a follower (required)"),
});

/**
 * Delete deal follower parameters
 */
export const DeleteDealFollowerSchema = IdParamSchema.extend({
  follower_id: z.number().int().positive().describe("The ID of the follower (user) to remove"),
});

/**
 * Deal followers changelog parameters
 */
export const DealFollowersChangelogSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The deal ID"),
});

/**
 * Type exports for use in tool implementations
 */
export type ListDealsParams = z.infer<typeof ListDealsSchema>;
export type GetDealParams = z.infer<typeof GetDealSchema>;
export type CreateDealParams = z.infer<typeof CreateDealSchema>;
export type UpdateDealParams = z.infer<typeof UpdateDealSchema>;
export type SearchDealsParams = z.infer<typeof SearchDealsSchema>;
export type DeleteDealParams = z.infer<typeof DeleteDealSchema>;
export type ListDealFollowersParams = z.infer<typeof ListDealFollowersSchema>;
export type AddDealFollowerParams = z.infer<typeof AddDealFollowerSchema>;
export type DeleteDealFollowerParams = z.infer<typeof DeleteDealFollowerSchema>;
export type DealFollowersChangelogParams = z.infer<typeof DealFollowersChangelogSchema>;
