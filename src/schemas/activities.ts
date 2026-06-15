/**
 * Zod schemas for Activity-related operations
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  IdParamSchema,
  OptionalDateSchema,
  ActivityTypeSchema,
  SortDirectionSchema,
  BoundedNameSchema,
  BoundedTextSchema,
  BoundedQueryParamSchema,
  boundedArray,
} from "./common.js";

/**
 * Activity location (v2 structured object).
 * Defined locally per issue #45; do not move to common.ts.
 */
const LocationSchema = z.object({
  value: BoundedNameSchema.optional()
    .describe("The full address of the activity"),
  country: BoundedNameSchema.optional()
    .describe("Country of the activity"),
  admin_area_level_1: BoundedNameSchema.optional()
    .describe("Admin area level 1 (e.g. state)"),
  admin_area_level_2: BoundedNameSchema.optional()
    .describe("Admin area level 2 (e.g. county)"),
  locality: BoundedNameSchema.optional()
    .describe("Locality (e.g. city)"),
  sublocality: BoundedNameSchema.optional()
    .describe("Sublocality (e.g. neighborhood)"),
  route: BoundedNameSchema.optional()
    .describe("Route (e.g. street)"),
  street_number: BoundedNameSchema.optional()
    .describe("Street number"),
  subpremise: BoundedNameSchema.optional()
    .describe("Subpremise (e.g. apartment/suite number)"),
  postal_code: BoundedNameSchema.optional()
    .describe("Postal code"),
}).optional();

/**
 * List activities parameters
 */
export const ListActivitiesSchema = PaginationParamsSchema.extend({
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  ids: BoundedQueryParamSchema.optional()
    .describe("Comma-separated activity IDs to fetch (max 100)"),
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  deal_id: z.number().int().positive().optional()
    .describe("Filter by linked deal ID"),
  lead_id: BoundedQueryParamSchema.optional()
    .describe("Filter by linked lead ID (UUID format)"),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by linked organization ID"),
  done: z.boolean().optional()
    .describe("Filter by completion status (true=done, false=pending)"),
  updated_since: BoundedQueryParamSchema.optional()
    .describe("Filter activities updated after this time (RFC3339 format)"),
  updated_until: BoundedQueryParamSchema.optional()
    .describe("Filter activities updated before this time (RFC3339 format)"),
  sort_by: z.enum(["id", "update_time", "add_time", "due_date"])
    .optional()
    .describe("Field to sort by (id, update_time, add_time, due_date)"),
  sort_direction: SortDirectionSchema,
  include_fields: BoundedQueryParamSchema.optional()
    .describe("Include additional data in response"),
});

/**
 * Get activity parameters
 */
export const GetActivitySchema = IdParamSchema.extend({
  include_fields: BoundedQueryParamSchema.optional()
    .describe("Include additional data in response"),
});

/**
 * Create activity parameters
 */
export const CreateActivitySchema = z.object({
  subject: z.string().min(1).max(255)
    .describe("Activity subject/title (required)"),
  type: ActivityTypeSchema
    .describe("Activity type: call, meeting, task, deadline, email, lunch (required)"),
  due_date: OptionalDateSchema
    .describe("Due date (YYYY-MM-DD)"),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).optional()
    .describe("Due time (HH:MM in 24-hour format)"),
  duration: z.string().regex(/^\d{2}:\d{2}$/).optional()
    .describe("Duration (HH:MM format)"),
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID (defaults to API key owner)"),
  deal_id: z.number().int().positive().optional()
    .describe("Link to deal ID"),
  lead_id: BoundedQueryParamSchema.optional()
    .describe("Link to lead ID (UUID format)"),
  person_id: z.number().int().positive().optional()
    .describe("Link to person ID"),
  org_id: z.number().int().positive().optional()
    .describe("Link to organization ID"),
  project_id: z.number().int().positive().optional()
    .describe("Link to project ID"),
  note: BoundedTextSchema.optional()
    .describe("Activity notes/description (HTML supported)"),
  done: z.boolean().optional()
    .describe("Mark as completed"),
  busy: z.boolean().optional()
    .describe("Show as busy in calendar"),
  priority: z.number().int().optional()
    .describe("Activity priority (integer, use activityFields API to map values)"),
  participants: boundedArray(z.object({
    person_id: z.number().int().positive(),
    primary: z.boolean().optional(),
  })).optional()
    .describe("Activity participants (person IDs)"),
  attendees: boundedArray(z.object({
    email: z.email(),
    name: BoundedNameSchema.optional(),
  })).optional()
    .describe("External attendees (email addresses)"),
  location: LocationSchema
    .describe("Activity location (structured object)"),
  public_description: BoundedTextSchema.optional()
    .describe("Public description visible to guests"),
});

/**
 * Update activity parameters
 */
export const UpdateActivitySchema = IdParamSchema.extend({
  subject: z.string().min(1).max(255).optional()
    .describe("New activity subject"),
  type: ActivityTypeSchema.optional()
    .describe("New activity type"),
  due_date: OptionalDateSchema
    .describe("New due date (YYYY-MM-DD)"),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).optional()
    .describe("New due time (HH:MM)"),
  duration: z.string().regex(/^\d{2}:\d{2}$/).optional()
    .describe("New duration (HH:MM)"),
  owner_id: z.number().int().positive().optional()
    .describe("New owner user ID"),
  deal_id: z.number().int().positive().optional()
    .describe("New linked deal ID"),
  lead_id: BoundedQueryParamSchema.optional()
    .describe("New linked lead ID (UUID format)"),
  person_id: z.number().int().positive().optional()
    .describe("New linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("New linked organization ID"),
  project_id: z.number().int().positive().optional()
    .describe("New linked project ID"),
  note: BoundedTextSchema.optional()
    .describe("New notes/description"),
  done: z.boolean().optional()
    .describe("Mark as completed or pending"),
  busy: z.boolean().optional()
    .describe("Show as busy in calendar"),
  priority: z.number().int().optional()
    .describe("New activity priority (integer)"),
  participants: boundedArray(z.object({
    person_id: z.number().int().positive(),
    primary: z.boolean().optional(),
  })).optional()
    .describe("New activity participants"),
  attendees: boundedArray(z.object({
    email: z.email(),
    name: BoundedNameSchema.optional(),
  })).optional()
    .describe("New external attendees"),
  location: LocationSchema
    .describe("New location (structured object)"),
});

/**
 * Delete activity parameters
 */
export const DeleteActivitySchema = IdParamSchema;

/**
 * Type exports
 */
export type ListActivitiesParams = z.infer<typeof ListActivitiesSchema>;
export type GetActivityParams = z.infer<typeof GetActivitySchema>;
export type CreateActivityParams = z.infer<typeof CreateActivitySchema>;
export type UpdateActivityParams = z.infer<typeof UpdateActivitySchema>;
export type DeleteActivityParams = z.infer<typeof DeleteActivitySchema>;
