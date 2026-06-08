/**
 * Zod schemas for Person-related operations
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
 * Email input schema for creating/updating persons
 */
export const EmailInputSchema = z.array(z.object({
  value: z.email().describe("Email address"),
  primary: z.boolean().optional().describe("Whether this is the primary email"),
  label: z.string().optional().describe("Label (work, home, other)"),
})).optional().describe("List of email addresses");

/**
 * Phone input schema for creating/updating persons
 */
export const PhoneInputSchema = z.array(z.object({
  value: z.string().describe("Phone number"),
  primary: z.boolean().optional().describe("Whether this is the primary phone"),
  label: z.string().optional().describe("Label (work, home, mobile, other)"),
})).optional().describe("List of phone numbers");

/**
 * List persons parameters
 */
export const ListPersonsSchema = PaginationParamsSchema.extend({
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  ids: z.string().optional()
    .describe("Comma-separated person IDs to fetch (max 100)"),
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by organization ID"),
  first_char: z.string().length(1).optional()
    .describe("Filter by first character of name"),
  updated_since: z.string().optional()
    .describe("Filter persons updated after this time (RFC3339 format)"),
  updated_until: z.string().optional()
    .describe("Filter persons updated before this time (RFC3339 format)"),
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
 * Get person parameters
 */
export const GetPersonSchema = IdParamSchema.extend({
  include_fields: z.string().optional()
    .describe("Include additional data in response"),
  custom_fields: z.string().optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Create person parameters
 */
export const CreatePersonSchema = z.object({
  name: z.string().min(1).max(255)
    .describe("Person name (required)"),
  emails: EmailInputSchema,
  phones: PhoneInputSchema,
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID (defaults to API key owner)"),
  org_id: z.number().int().positive().optional()
    .describe("Organization ID to link person to"),
  visible_to: VisibilitySchema,
  marketing_status: z.enum(["no_consent", "unsubscribed", "subscribed", "archived"]).optional()
    .describe("Marketing email consent status"),
  label_ids: z.array(z.number()).optional()
    .describe("Label IDs to attach to person"),
  add_time: z.string().optional()
    .describe("Creation time (RFC3339 format) - backdate the person"),
  custom_fields: z.record(z.string(), z.unknown()).optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Update person parameters
 */
export const UpdatePersonSchema = IdParamSchema.extend({
  name: z.string().min(1).max(255).optional()
    .describe("New person name"),
  emails: EmailInputSchema,
  phones: PhoneInputSchema,
  owner_id: z.number().int().positive().optional()
    .describe("New owner user ID"),
  org_id: z.number().int().positive().optional()
    .describe("New organization ID"),
  visible_to: VisibilitySchema,
  marketing_status: z.enum(["no_consent", "unsubscribed", "subscribed", "archived"]).optional()
    .describe("New marketing status"),
  label_ids: z.array(z.number()).optional()
    .describe("Label IDs to set on person"),
  custom_fields: z.record(z.string(), z.unknown()).optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Search persons parameters
 */
export const SearchPersonsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for name, email, phone, or notes"),
  fields: z.string().optional()
    .describe("Comma-separated fields to search (allowed: name, email, phone, notes, custom_fields). Defaults to all."),
  org_id: z.number().int().positive().optional()
    .describe("Filter by organization"),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});

/**
 * Delete person parameters
 */
export const DeletePersonSchema = IdParamSchema;

/**
 * Type exports
 */
export type ListPersonsParams = z.infer<typeof ListPersonsSchema>;
export type GetPersonParams = z.infer<typeof GetPersonSchema>;
export type CreatePersonParams = z.infer<typeof CreatePersonSchema>;
export type UpdatePersonParams = z.infer<typeof UpdatePersonSchema>;
export type SearchPersonsParams = z.infer<typeof SearchPersonsSchema>;
export type DeletePersonParams = z.infer<typeof DeletePersonSchema>;
