/**
 * Zod schemas for Lead-related operations
 */

import { z } from "zod";
import {
  PaginationParamsV1Schema,
  SearchTermSchema,
  VisibilitySchema,
  DateStringSchema,
} from "./common.js";

/**
 * Lead monetary value schema
 */
export const LeadValueSchema = z.object({
  amount: z.number().nonnegative().describe("Monetary amount (must be >= 0)"),
  currency: z.string().length(3).toUpperCase().optional()
    .describe("3-letter currency code (e.g., USD, EUR, GBP)"),
}).describe("Lead monetary value");

/**
 * Lead ID schema - leads use UUID strings (not integer IDs)
 */
export const LeadIdSchema = z.object({
  id: z.uuid().describe("Lead UUID"),
});

/**
 * List leads parameters (non-archived)
 */
export const ListLeadsSchema = PaginationParamsV1Schema.extend({
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person ID"),
  organization_id: z.number().int().positive().optional()
    .describe("Filter by linked organization ID"),
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  sort: z.string().optional()
    .describe("Sort field and direction (e.g. 'id ASC')"),
});

/**
 * List archived leads parameters - same shape as ListLeadsSchema
 */
export const ListArchivedLeadsSchema = ListLeadsSchema;

/**
 * Get lead parameters
 */
export const GetLeadSchema = LeadIdSchema;

/**
 * Create lead parameters
 */
export const CreateLeadSchema = z.object({
  title: z.string().min(1).max(255)
    .describe("Lead title (required)"),
  person_id: z.number().int().positive().optional()
    .describe("Link to person ID (at least one of person_id or organization_id required)"),
  organization_id: z.number().int().positive().optional()
    .describe("Link to organization ID (at least one of person_id or organization_id required)"),
  value: LeadValueSchema.optional()
    .describe("Monetary value of the lead"),
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID (defaults to API key owner)"),
  label_ids: z.array(z.uuid()).optional()
    .describe("Lead label UUIDs to attach to lead"),
  expected_close_date: DateStringSchema.optional()
    .describe("Expected close date (YYYY-MM-DD format)"),
  visible_to: VisibilitySchema,
});

/**
 * Update lead parameters
 */
export const UpdateLeadSchema = LeadIdSchema.extend({
  title: z.string().min(1).max(255).optional()
    .describe("New lead title"),
  person_id: z.number().int().positive().optional()
    .describe("New linked person ID"),
  organization_id: z.number().int().positive().optional()
    .describe("New linked organization ID"),
  value: LeadValueSchema.optional()
    .describe("New monetary value"),
  owner_id: z.number().int().positive().optional()
    .describe("New owner user ID"),
  label_ids: z.array(z.uuid()).optional()
    .describe("New lead label UUIDs"),
  expected_close_date: DateStringSchema.optional()
    .describe("New expected close date (YYYY-MM-DD format)"),
  visible_to: VisibilitySchema,
  is_archived: z.boolean().optional()
    .describe("Archive or unarchive the lead"),
});

/**
 * Delete lead parameters
 */
export const DeleteLeadSchema = LeadIdSchema;

/**
 * Convert lead to deal parameters (v2 POST /leads/{id}/convert/deal).
 * stage_id/pipeline_id are the only body fields the v2 convert endpoint accepts
 * (openapi-v2.yaml:16556-16568, additionalProperties:false). Per spec, if both are
 * sent pipeline_id is ignored in favor of stage_id; we forward whatever is provided.
 */
export const ConvertLeadToDealSchema = LeadIdSchema.extend({
  stage_id: z.number().int().positive().optional()
    .describe("Stage ID for the created deal (a pipeline is inferred from the stage)"),
  pipeline_id: z.number().int().positive().optional()
    .describe("Pipeline ID for the created deal (ignored if stage_id is also given)"),
});

/**
 * Get lead conversion status (v2 GET /leads/{id}/convert/status/{conversion_id}).
 */
export const GetLeadConversionStatusSchema = LeadIdSchema.extend({
  conversion_id: z.uuid().describe("Conversion job UUID returned by the convert call"),
});

/**
 * Search leads parameters (v2 endpoint)
 */
export const SearchLeadsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for lead title, notes, or custom fields"),
  fields: z.string().optional()
    .describe("Comma-separated fields to search (allowed: title, notes, custom_fields). Defaults to all."),
  person_id: z.number().int().positive().optional()
    .describe("Filter leads by linked person ID"),
  organization_id: z.number().int().positive().optional()
    .describe("Filter leads by linked organization ID"),
  include_fields: z.enum(["lead.was_seen"]).optional()
    .describe("Optional extra fields to include (v2: only 'lead.was_seen')"),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(500).optional().default(50)
    .describe("Number of results to return (1-500, default 50)"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});

/**
 * Type exports
 */
export type LeadValue = z.infer<typeof LeadValueSchema>;
export type ListLeadsParams = z.infer<typeof ListLeadsSchema>;
export type ListArchivedLeadsParams = z.infer<typeof ListArchivedLeadsSchema>;
export type GetLeadParams = z.infer<typeof GetLeadSchema>;
export type CreateLeadParams = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadParams = z.infer<typeof UpdateLeadSchema>;
export type DeleteLeadParams = z.infer<typeof DeleteLeadSchema>;
export type ConvertLeadToDealParams = z.infer<typeof ConvertLeadToDealSchema>;
export type GetLeadConversionStatusParams = z.infer<typeof GetLeadConversionStatusSchema>;
export type SearchLeadsParams = z.infer<typeof SearchLeadsSchema>;
