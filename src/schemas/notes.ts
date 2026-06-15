/**
 * Zod schemas for Note-related operations
 */

import { z } from "zod";
import {
  PaginationParamsV1Schema,
  IdParamSchema,
  BoundedTextSchema,
  BoundedQueryParamSchema,
} from "./common.js";

/**
 * List notes parameters
 */
export const ListNotesSchema = PaginationParamsV1Schema.extend({
  deal_id: z.number().int().positive().optional()
    .describe("Filter by linked deal ID"),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by linked organization ID"),
  lead_id: BoundedQueryParamSchema.optional()
    .describe("Filter by linked lead ID (UUID format)"),
  pinned_to_deal_flag: z.boolean().optional()
    .describe("Filter by pinned to deal status"),
  pinned_to_person_flag: z.boolean().optional()
    .describe("Filter by pinned to person status"),
  pinned_to_organization_flag: z.boolean().optional()
    .describe("Filter by pinned to organization status"),
  sort: z.enum(["id", "add_time", "update_time"]).optional()
    .describe("Field to sort by"),
  sort_direction: z.enum(["asc", "desc"]).optional()
    .describe("Sort direction"),
});

/**
 * Get note parameters
 */
export const GetNoteSchema = IdParamSchema;

/**
 * Create note parameters
 */
export const CreateNoteSchema = z.object({
  content: BoundedTextSchema.min(1)
    .describe("Note content (required, HTML supported)"),
  deal_id: z.number().int().positive().optional()
    .describe("Link to deal ID"),
  person_id: z.number().int().positive().optional()
    .describe("Link to person ID"),
  org_id: z.number().int().positive().optional()
    .describe("Link to organization ID"),
  lead_id: BoundedQueryParamSchema.optional()
    .describe("Link to lead ID (UUID format)"),
  pinned_to_deal_flag: z.boolean().optional()
    .describe("Pin note to deal"),
  pinned_to_person_flag: z.boolean().optional()
    .describe("Pin note to person"),
  pinned_to_organization_flag: z.boolean().optional()
    .describe("Pin note to organization"),
});

/**
 * Update note parameters
 */
export const UpdateNoteSchema = IdParamSchema.extend({
  content: BoundedTextSchema.min(1).optional()
    .describe("New note content (HTML supported)"),
  deal_id: z.number().int().positive().optional()
    .describe("New linked deal ID"),
  person_id: z.number().int().positive().optional()
    .describe("New linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("New linked organization ID"),
  lead_id: BoundedQueryParamSchema.optional()
    .describe("New linked lead ID (UUID format)"),
  pinned_to_deal_flag: z.boolean().optional()
    .describe("Pin note to deal"),
  pinned_to_person_flag: z.boolean().optional()
    .describe("Pin note to person"),
  pinned_to_organization_flag: z.boolean().optional()
    .describe("Pin note to organization"),
});

/**
 * Delete note parameters
 */
export const DeleteNoteSchema = IdParamSchema;

/**
 * Type exports
 */
export type ListNotesParams = z.infer<typeof ListNotesSchema>;
export type GetNoteParams = z.infer<typeof GetNoteSchema>;
export type CreateNoteParams = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteParams = z.infer<typeof UpdateNoteSchema>;
export type DeleteNoteParams = z.infer<typeof DeleteNoteSchema>;
