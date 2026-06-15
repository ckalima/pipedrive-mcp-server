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
  BoundedNameSchema,
  BoundedQueryParamSchema,
  BoundedCustomFieldsSchema,
  boundedArray,
} from "./common.js";

/**
 * Organization address object (v2 OrganizationItemAddress).
 * All subfields are optional strings. The whole object is optional.
 * Defined locally per issue #44 disjointness — do NOT move to common.ts.
 */
export const AddressSchema = z
  .object({
    value: BoundedNameSchema.optional()
      .describe("The full address of the organization"),
    country: BoundedNameSchema.optional()
      .describe("Country of the organization"),
    admin_area_level_1: BoundedNameSchema.optional()
      .describe("Admin area level 1 (e.g. state) of the organization"),
    admin_area_level_2: BoundedNameSchema.optional()
      .describe("Admin area level 2 (e.g. county) of the organization"),
    locality: BoundedNameSchema.optional()
      .describe("Locality (e.g. city) of the organization"),
    sublocality: BoundedNameSchema.optional()
      .describe("Sublocality (e.g. neighborhood) of the organization"),
    route: BoundedNameSchema.optional()
      .describe("Route (e.g. street) of the organization"),
    street_number: BoundedNameSchema.optional()
      .describe("Street number of the organization"),
    subpremise: BoundedNameSchema.optional()
      .describe("Subpremise (e.g. apartment/suite number) of the organization"),
    postal_code: BoundedNameSchema.optional()
      .describe("Postal code of the organization"),
  })
  .describe("Organization address as a structured object (v2). Provide at least 'value' for the full address.");

/**
 * List organizations parameters
 */
export const ListOrganizationsSchema = PaginationParamsSchema.extend({
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  ids: BoundedQueryParamSchema.optional()
    .describe("Comma-separated organization IDs to fetch (max 100)"),
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  updated_since: BoundedQueryParamSchema.optional()
    .describe("Filter organizations updated after this time (RFC3339 format)"),
  updated_until: BoundedQueryParamSchema.optional()
    .describe("Filter organizations updated before this time (RFC3339 format)"),
  sort_by: z.enum(["id", "update_time", "add_time"])
    .optional()
    .describe("Field to sort by (id, update_time, add_time)"),
  sort_direction: SortDirectionSchema,
  include_fields: BoundedQueryParamSchema.optional()
    .describe("Include additional data in response"),
  custom_fields: BoundedQueryParamSchema.optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Get organization parameters
 */
export const GetOrganizationSchema = IdParamSchema.extend({
  include_fields: BoundedQueryParamSchema.optional()
    .describe("Include additional data in response"),
  custom_fields: BoundedQueryParamSchema.optional()
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
  address: AddressSchema.optional()
    .describe("Full address as a structured object (v2). Provide 'value' for the full address."),
  label_ids: boundedArray(z.number()).optional()
    .describe("Label IDs to attach to organization"),
  add_time: BoundedNameSchema.optional()
    .describe("Creation time (RFC3339 format) - backdate the organization"),
  custom_fields: BoundedCustomFieldsSchema.optional()
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
  address: AddressSchema.optional()
    .describe("New address as a structured object (v2). Provide 'value' for the full address."),
  label_ids: boundedArray(z.number()).optional()
    .describe("Label IDs to set on organization"),
  custom_fields: BoundedCustomFieldsSchema.optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Search organizations parameters
 */
export const SearchOrganizationsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for organization name or address"),
  fields: BoundedQueryParamSchema.optional()
    .describe("Comma-separated fields to search (allowed: name, address, notes, custom_fields). Defaults to all."),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: BoundedQueryParamSchema.optional()
    .describe("Cursor for pagination (from previous response)"),
});

/**
 * Delete organization parameters
 */
export const DeleteOrganizationSchema = IdParamSchema;

// ─── Follower schemas (U3, #69) ───────────────────────────────────────────────

/**
 * List organization followers parameters
 */
export const ListOrganizationFollowersSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The organization ID"),
});

/**
 * Add organization follower parameters
 */
export const AddOrganizationFollowerSchema = IdParamSchema.extend({
  user_id: z.number().int().positive().describe("The ID of the user to add as a follower (required)"),
});

/**
 * Delete organization follower parameters
 */
export const DeleteOrganizationFollowerSchema = IdParamSchema.extend({
  follower_id: z.number().int().positive().describe("The ID of the follower (user) to remove"),
});

/**
 * Organization followers changelog parameters
 */
export const OrganizationFollowersChangelogSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The organization ID"),
});

/**
 * Type exports
 */
export type ListOrganizationsParams = z.infer<typeof ListOrganizationsSchema>;
export type GetOrganizationParams = z.infer<typeof GetOrganizationSchema>;
export type CreateOrganizationParams = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationParams = z.infer<typeof UpdateOrganizationSchema>;
export type SearchOrganizationsParams = z.infer<typeof SearchOrganizationsSchema>;
export type DeleteOrganizationParams = z.infer<typeof DeleteOrganizationSchema>;
export type ListOrganizationFollowersParams = z.infer<typeof ListOrganizationFollowersSchema>;
export type AddOrganizationFollowerParams = z.infer<typeof AddOrganizationFollowerSchema>;
export type DeleteOrganizationFollowerParams = z.infer<typeof DeleteOrganizationFollowerSchema>;
export type OrganizationFollowersChangelogParams = z.infer<typeof OrganizationFollowersChangelogSchema>;
