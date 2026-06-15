/**
 * Common Zod schemas shared across tools
 */

import { z } from "zod";

/**
 * Pagination parameters schema (v2 cursor-based)
 */
export const PaginationParamsSchema = z.object({
  // Opaque pagination cursor. Inline length cap (mirrors MAX_QUERY_PARAM_LENGTH,
  // which is declared later in this file) bounds the inherited base so entities
  // that do not override `cursor` (products, pipelines, boards, ...) still get a
  // bounded passthrough value (F3/U4).
  cursor: z.string().max(2_000).optional().describe("Cursor for pagination (from previous response)"),
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
  // Short type key in practice; inline cap (size constants are declared later in
  // this file) bounds the free-text passthrough (F3/U4).
  .max(255)
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
  // Defense-in-depth length cap (U4): real path segments are 40-char hashes,
  // short snake_case keys, or 36-char UUIDs. 255 is far above any legitimate
  // value while preventing a pathologically long (but allowlist-valid) segment
  // from being interpolated. Inline literal because the U4 size constants are
  // declared later in this file.
  .max(255)
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

// ─── U4: Input-size bounds ────────────────────────────────────────────────────
// Generous caps whose purpose is to stop a single call from driving resource
// exhaustion (unbounded free text, arrays, or deeply-nested records) — NOT to
// mirror Pipedrive's own field limits. They are set far above any legitimate CRM
// payload. Exact thresholds are an implementation detail recorded with the
// private finding (F3).

/** Cap for long free-text bodies (note content, descriptions, comments). */
export const MAX_TEXT_LENGTH = 50_000;
/** Cap for short free-text values (labels, names, reasons, address parts). */
export const MAX_NAME_LENGTH = 1_000;
/** Cap for opaque / comma-separated query passthrough strings. */
export const MAX_QUERY_PARAM_LENGTH = 2_000;
/** Cap for the element count of a bounded array. */
export const MAX_ARRAY_ITEMS = 1_000;
/** Cap for the key count of a custom_fields record. */
export const MAX_CUSTOM_FIELD_KEYS = 200;
/** Cap for the serialized size of a single custom_fields value. */
export const MAX_CUSTOM_FIELD_VALUE_LENGTH = 20_000;
/** Cap for the nesting depth of a custom_fields value (container levels). */
export const MAX_CUSTOM_FIELD_DEPTH = 6;

/** Long free-text body, length-bounded. */
export const BoundedTextSchema = z.string().max(MAX_TEXT_LENGTH);
/** Short free-text value, length-bounded. */
export const BoundedNameSchema = z.string().max(MAX_NAME_LENGTH);
/** Opaque / comma-separated query passthrough string, length-bounded. */
export const BoundedQueryParamSchema = z.string().max(MAX_QUERY_PARAM_LENGTH);

/** Wrap an element schema in a length-bounded array. */
export function boundedArray<T extends z.ZodTypeAny>(
  element: T,
  max: number = MAX_ARRAY_ITEMS,
) {
  return z.array(element).max(max);
}

/**
 * Returns true if `value` nests no deeper than `maxDepth` container levels.
 * Iterative (explicit stack) and early-exiting so a pathologically deep input
 * cannot overflow the call stack while it is being checked.
 */
function withinDepth(value: unknown, maxDepth: number): boolean {
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop() as { v: unknown; d: number };
    if (v === null || typeof v !== "object") continue;
    if (d >= maxDepth) return false;
    const children = Array.isArray(v)
      ? v
      : Object.values(v as Record<string, unknown>);
    for (const child of children) {
      stack.push({ v: child, d: d + 1 });
    }
  }
  return true;
}

/** True if every value in the record serializes within the per-value size cap. */
function valuesWithinSize(rec: Record<string, unknown>): boolean {
  return Object.values(rec).every((v) => {
    try {
      return JSON.stringify(v ?? null).length <= MAX_CUSTOM_FIELD_VALUE_LENGTH;
    } catch {
      return false; // non-serializable (e.g. circular) is rejected
    }
  });
}

/**
 * Bounded custom_fields record for entities whose values are unconstrained
 * (deal / person / organization use `z.record(z.string(), z.unknown())`). Bounds
 * the key count, each value's serialized size, AND nesting depth so a single call
 * cannot smuggle a huge or pathologically-nested object. Keeps the permissive
 * `unknown` value type so legitimate custom-field shapes still pass.
 */
export const BoundedCustomFieldsSchema = z.record(z.string(), z.unknown())
  .refine((rec) => Object.keys(rec).length <= MAX_CUSTOM_FIELD_KEYS, {
    message: `custom_fields may not exceed ${MAX_CUSTOM_FIELD_KEYS} keys`,
  })
  .refine((rec) => Object.values(rec).every((v) => withinDepth(v, MAX_CUSTOM_FIELD_DEPTH)), {
    message: `custom_fields values may not nest deeper than ${MAX_CUSTOM_FIELD_DEPTH} levels`,
  })
  .refine(valuesWithinSize, {
    message: `each custom_fields value may not exceed ${MAX_CUSTOM_FIELD_VALUE_LENGTH} serialized characters`,
  });

/**
 * Bounded custom_fields record for products, whose values are already the flat
 * scalar/array `CustomFieldValueSchema` (no nesting, so no depth cap is needed).
 * Bounds the key count AND each value's serialized size, so a single product
 * call cannot smuggle a huge string or array value past the value type (F3/U4).
 */
export const BoundedProductCustomFieldsSchema = z.record(z.string(), CustomFieldValueSchema)
  .refine((rec) => Object.keys(rec).length <= MAX_CUSTOM_FIELD_KEYS, {
    message: `custom_fields may not exceed ${MAX_CUSTOM_FIELD_KEYS} keys`,
  })
  .refine(valuesWithinSize, {
    message: `each custom_fields value may not exceed ${MAX_CUSTOM_FIELD_VALUE_LENGTH} serialized characters`,
  });

/**
 * Email object schema (Pipedrive stores emails as arrays of objects). The label
 * is length-bounded (U4); the value is format-bounded by `z.email()`. Defined
 * after the U4 primitives so it can reference `BoundedNameSchema`.
 */
export const EmailSchema = z.object({
  value: z.email(),
  primary: z.boolean().optional(),
  label: BoundedNameSchema.optional(),
});

/**
 * Phone object schema. Both value and label are length-bounded (U4).
 */
export const PhoneSchema = z.object({
  value: BoundedNameSchema,
  primary: z.boolean().optional(),
  label: BoundedNameSchema.optional(),
});
