/**
 * Zod schemas for Field metadata operations (v2 API for deal/person/organization)
 */

import { z } from "zod";
import { PaginationParamsSchema } from "./common.js";

/**
 * Field entity types
 */
export const FieldEntityTypeSchema = z.enum(["organization", "deal", "person", "product", "activity", "project"])
  .describe("Entity type to get fields for");

/**
 * List organization fields parameters
 */
export const ListOrganizationFieldsSchema = PaginationParamsSchema;

/**
 * List deal fields parameters
 */
export const ListDealFieldsSchema = PaginationParamsSchema;

/**
 * List person fields parameters
 */
export const ListPersonFieldsSchema = PaginationParamsSchema;

/**
 * List product fields parameters
 */
export const ListProductFieldsSchema = PaginationParamsSchema.extend({
  include_fields: z.enum(["ui_visibility"]).optional()
    .describe("Additional data namespaces to include (ui_visibility)"),
});

/**
 * List project fields parameters
 */
export const ListProjectFieldsSchema = PaginationParamsSchema;

/**
 * Get field by key parameters
 */
export const GetFieldSchema = z.object({
  entity_type: FieldEntityTypeSchema
    .describe("Entity type (organization, deal, person, etc.)"),
  key: z.string()
    .describe("Field key (40-character hash for custom fields, or standard field name)"),
});

/**
 * Type exports
 */
export type ListOrganizationFieldsParams = z.infer<typeof ListOrganizationFieldsSchema>;
export type ListDealFieldsParams = z.infer<typeof ListDealFieldsSchema>;
export type ListPersonFieldsParams = z.infer<typeof ListPersonFieldsSchema>;
export type ListProductFieldsParams = z.infer<typeof ListProductFieldsSchema>;
export type ListProjectFieldsParams = z.infer<typeof ListProjectFieldsSchema>;
export type GetFieldParams = z.infer<typeof GetFieldSchema>;
