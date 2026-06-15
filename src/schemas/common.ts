/**
 * Common Zod schemas shared across tools
 */

import { z } from "zod";

/**
 * Pagination parameters schema (v2 cursor-based)
 */
export const PaginationParamsSchema = z.object({
  cursor: z.string().optional().describe("Cursor for pagination (from previous response)"),
  limit: z.number().min(1).max(100).optional().default(50).describe("Number of items to return (1-100, default 50)"),
});

/**
 * V1 pagination parameters schema (offset-based)
 */
export const PaginationParamsV1Schema = z.object({
  start: z.number().min(0).optional().describe("Pagination offset (0-based)"),
  limit: z.number().min(1).max(500).optional().default(50).describe("Number of items to return (1-500, default 50)"),
});

/**
 * Common ID parameter
 */
export const IdParamSchema = z.object({
  id: z.number().int().positive().describe("The unique ID of the resource"),
});

/**
 * Date string format (YYYY-MM-DD)
 */
export const DateStringSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .describe("Date in YYYY-MM-DD format");

/**
 * Optional date string
 */
export const OptionalDateSchema = DateStringSchema.optional();

/**
 * Email object schema (Pipedrive stores emails as arrays of objects)
 */
export const EmailSchema = z.object({
  value: z.email(),
  primary: z.boolean().optional(),
  label: z.string().optional(),
});

/**
 * Phone object schema
 */
export const PhoneSchema = z.object({
  value: z.string(),
  primary: z.boolean().optional(),
  label: z.string().optional(),
});

/**
 * Sort direction
 */
export const SortDirectionSchema = z.enum(["asc", "desc"]).optional();

/**
 * Deal status
 */
export const DealStatusSchema = z.enum(["open", "won", "lost", "deleted"])
  .describe("Deal status filter (omit to return all non-deleted deals)");

/**
 * Activity type (Pipedrive built-in types)
 */
export const ActivityTypeSchema = z.string()
  .describe("Activity type (e.g., 'call', 'meeting', 'task', 'deadline', 'email', 'lunch')");

/**
 * Visibility settings (integer values)
 */
export const VisibilitySchema = z.number().int()
  .refine((v) => [1, 3, 5, 7].includes(v), "Visibility must be 1, 3, 5, or 7")
  .optional()
  .describe("Visibility: 1=Owner only, 3=Owner's group, 5=Owner's group + subgroups, 7=Entire company");

/**
 * Currency code (3-letter ISO)
 */
export const CurrencyCodeSchema = z.string()
  .length(3)
  .toUpperCase()
  .optional()
  .describe("3-letter currency code (e.g., USD, EUR, GBP)");

/**
 * Search term validation
 */
export const SearchTermSchema = z.string()
  .min(1)
  .max(500)
  .describe("Search term (1-500 characters)");

/**
 * Path-segment allowlist primitive (single source of truth for the path-safe
 * character class).
 *
 * Any value interpolated into a request *path* (not a query param) must be
 * restricted to a strict allowlist so it cannot redirect the request to another
 * endpoint. A blocklist of just `/` is NOT sufficient: `new URL()` normalizes
 * backslashes to `/`, collapses `..` dot-segments, and truncates the path at
 * `?`/`#`, so values like `..`, `a\b`, or `abc?x=1` would still mangle the
 * resolved path. The allowlist `[A-Za-z0-9_-]` admits 40-char hex hashes,
 * snake_case keys, and UUIDs (hyphenated hex) while excluding every
 * URL-significant character. The regex is anchored, linear, and has no nested
 * quantifiers (no ReDoS surface).
 *
 * Entity schemas that constrain a path segment (e.g. `FieldCodeSchema`) build on
 * this; runtime guards for API-response-sourced segments call `.safeParse()`.
 */
export const PathSegmentSchema = z.string().min(1)
  .regex(/^[A-Za-z0-9_-]+$/, "value may only contain letters, digits, '_' and '-'")
  .describe("A path-safe segment: letters, digits, '_' and '-' only");

/**
 * Custom field value (can be various types)
 */
export const CustomFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.array(z.number()),
]);
