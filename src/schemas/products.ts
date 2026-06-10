/**
 * Zod schemas for Product-related operations
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  IdParamSchema,
  SearchTermSchema,
  SortDirectionSchema,
  VisibilitySchema,
  CurrencyCodeSchema,
  CustomFieldValueSchema,
} from "./common.js";

// ─── U1: Read schemas ─────────────────────────────────────────────────────────

/**
 * List products parameters
 */
export const ListProductsSchema = PaginationParamsSchema.extend({
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  ids: z.string().optional()
    .describe("Comma-separated product IDs to fetch (max 100)"),
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  sort_by: z.enum(["id", "name", "add_time", "update_time"])
    .optional()
    .describe("Field to sort by (id, name, add_time, update_time)"),
  sort_direction: SortDirectionSchema,
  updated_since: z.string().optional()
    .describe("Filter products updated after this time (RFC3339 format)"),
  custom_fields: z.string().optional()
    .describe("Include custom fields in response (comma-separated field keys, max 15)"),
});

/**
 * Get product parameters
 */
export const GetProductSchema = IdParamSchema;

/**
 * Search products parameters
 */
export const SearchProductsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term for product name, code, or custom fields"),
  fields: z.enum(["code", "custom_fields", "name"]).optional()
    .describe("Field to search in (code, custom_fields, name). Defaults to all."),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  include_fields: z.enum(["product.price"]).optional()
    .describe("Extra fields to include in response (product.price)"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: z.string().optional()
    .describe("Cursor for pagination (from previous response)"),
});

// ─── U2: Write schemas ────────────────────────────────────────────────────────

/**
 * Billing frequency values
 */
export const BillingFrequencySchema = z.enum([
  "one-time",
  "annually",
  "semi-annually",
  "quarterly",
  "monthly",
  "weekly",
]).describe("Billing frequency");

/**
 * Price input for a product (per currency)
 */
export const PriceInputSchema = z.object({
  currency: CurrencyCodeSchema
    .describe("3-letter ISO currency code (e.g. USD, EUR, GBP)"),
  price: z.number()
    .describe("Price amount (required)"),
  cost: z.number().optional()
    .describe("Cost amount"),
  direct_cost: z.number().optional()
    .describe("Direct cost amount"),
});

/**
 * Create product parameters
 */
export const CreateProductSchema = z.object({
  name: z.string().min(1)
    .describe("Product name (required)"),
  code: z.string().optional()
    .describe("Product code"),
  description: z.string().optional()
    .describe("Product description"),
  unit: z.string().optional()
    .describe("Unit of measurement"),
  tax: z.number().optional()
    .describe("Tax percentage (default 0)"),
  category: z.number().optional()
    .describe("Product category ID"),
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID"),
  is_linkable: z.boolean().optional()
    .describe("Whether the product can be linked to deals (default true)"),
  visible_to: VisibilitySchema,
  prices: z.array(PriceInputSchema).optional()
    .describe("Array of price objects per currency"),
  custom_fields: z.record(z.string(), CustomFieldValueSchema).optional()
    .describe("Custom field values as object with field keys"),
  billing_frequency: BillingFrequencySchema.optional()
    .describe("Billing frequency (default one-time)"),
  billing_frequency_cycles: z.number().int().max(208).nullable().optional()
    .describe("Number of billing cycles (max 208, null = unlimited)"),
});

/**
 * Update product parameters
 */
export const UpdateProductSchema = IdParamSchema.extend({
  name: z.string().min(1).optional()
    .describe("Product name"),
  code: z.string().optional()
    .describe("Product code"),
  description: z.string().optional()
    .describe("Product description"),
  unit: z.string().optional()
    .describe("Unit of measurement"),
  tax: z.number().optional()
    .describe("Tax percentage"),
  category: z.number().optional()
    .describe("Product category ID"),
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID"),
  is_linkable: z.boolean().optional()
    .describe("Whether the product can be linked to deals"),
  visible_to: VisibilitySchema,
  prices: z.array(PriceInputSchema).optional()
    .describe("Array of price objects per currency"),
  custom_fields: z.record(z.string(), CustomFieldValueSchema).optional()
    .describe("Custom field values as object with field keys"),
  billing_frequency: BillingFrequencySchema.optional()
    .describe("Billing frequency"),
  billing_frequency_cycles: z.number().int().max(208).nullable().optional()
    .describe("Number of billing cycles (max 208, null = unlimited)"),
});

/**
 * Delete product parameters
 */
export const DeleteProductSchema = IdParamSchema;

// ─── U3: Product variation schemas ───────────────────────────────────────────

/**
 * Price input for a product variation (extends base price with notes)
 */
export const VariationPriceInputSchema = PriceInputSchema.extend({
  notes: z.string().optional().describe("Notes about this price"),
});

/**
 * List product variations parameters
 */
export const ListProductVariationsSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The product ID"),
});

/**
 * Add product variation parameters
 */
export const AddProductVariationSchema = IdParamSchema.extend({
  name: z.string().min(1).max(255).describe("Product variation name (required, max 255 chars)"),
  prices: z.array(VariationPriceInputSchema).optional()
    .describe("Array of price objects per currency"),
});

/**
 * Update product variation parameters
 */
export const UpdateProductVariationSchema = IdParamSchema.extend({
  product_variation_id: z.number().int().positive().describe("The product variation ID"),
  name: z.string().min(1).max(255).optional().describe("Product variation name (max 255 chars)"),
  prices: z.array(VariationPriceInputSchema).optional()
    .describe("Array of price objects per currency"),
});

/**
 * Delete product variation parameters
 */
export const DeleteProductVariationSchema = IdParamSchema.extend({
  product_variation_id: z.number().int().positive().describe("The product variation ID"),
});

// ─── U4: Product follower schemas ─────────────────────────────────────────────

/**
 * List product followers parameters
 */
export const ListProductFollowersSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The product ID"),
});

/**
 * Add product follower parameters
 */
export const AddProductFollowerSchema = IdParamSchema.extend({
  user_id: z.number().int().positive().describe("The ID of the user to add as a follower (required)"),
});

/**
 * Delete product follower parameters
 */
export const DeleteProductFollowerSchema = IdParamSchema.extend({
  follower_id: z.number().int().positive().describe("The ID of the follower (user) to remove"),
});

/**
 * Product followers changelog parameters
 */
export const ProductFollowersChangelogSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The product ID"),
});

// ─── U6: Product image schemas (get + delete) ─────────────────────────────────

/** Get product image parameters */
export const GetProductImageSchema = IdParamSchema;

/** Delete product image parameters */
export const DeleteProductImageSchema = IdParamSchema;

// ─── Product image upload/update schemas (#69 U5) ─────────────────────────────

/**
 * Upper bound on the base64 string length (~5 MB decoded). Bounds the synchronous
 * `Buffer.from(..., "base64")` allocation so an oversized/malicious input cannot
 * force a huge allocation (OOM). Tune once Pipedrive's real image-size limit is
 * confirmed.
 */
export const MAX_IMAGE_B64_LEN = 6_900_000;

/**
 * Upload product image parameters.
 *
 * Hybrid input: provide EITHER `file_path` (the server reads the bytes via
 * `fs.readFile` — use when the caller shares the server's filesystem) OR
 * `base64_data` (transport-safe over STDIO). Exactly one is required.
 */
export const UploadProductImageSchema = IdParamSchema.extend({
  file_path: z.string().min(1).optional()
    .describe("Path the SERVER reads via fs.readFile (use when the caller shares the server filesystem). Mutually exclusive with base64_data."),
  base64_data: z.string().min(1).max(MAX_IMAGE_B64_LEN).optional()
    .describe("Base64-encoded image bytes (transport-safe fallback). Mutually exclusive with file_path."),
  file_name: z.string().min(1).max(255)
    .refine((n) => !/[/\\\r\n\0]/.test(n), "file_name must not contain path separators or control characters")
    .describe("Original filename including extension (e.g. product.png)"),
  mime_type: z.string().regex(/^image\/(png|jpeg|gif|webp)$/).optional()
    .describe("MIME type (image/png, image/jpeg, image/gif, image/webp). Inferred from file_name if omitted."),
}).refine(
  (v) => (v.file_path == null) !== (v.base64_data == null),
  { message: "Provide exactly one of file_path or base64_data" },
);

/**
 * Update product image parameters (identical shape to upload).
 */
export const UpdateProductImageSchema = UploadProductImageSchema;

// ─── Type exports ─────────────────────────────────────────────────────────────

export type ListProductsParams = z.infer<typeof ListProductsSchema>;
export type GetProductParams = z.infer<typeof GetProductSchema>;
export type SearchProductsParams = z.infer<typeof SearchProductsSchema>;
export type CreateProductParams = z.infer<typeof CreateProductSchema>;
export type UpdateProductParams = z.infer<typeof UpdateProductSchema>;
export type DeleteProductParams = z.infer<typeof DeleteProductSchema>;
export type ListProductVariationsParams = z.infer<typeof ListProductVariationsSchema>;
export type AddProductVariationParams = z.infer<typeof AddProductVariationSchema>;
export type UpdateProductVariationParams = z.infer<typeof UpdateProductVariationSchema>;
export type DeleteProductVariationParams = z.infer<typeof DeleteProductVariationSchema>;
export type ListProductFollowersParams = z.infer<typeof ListProductFollowersSchema>;
export type AddProductFollowerParams = z.infer<typeof AddProductFollowerSchema>;
export type DeleteProductFollowerParams = z.infer<typeof DeleteProductFollowerSchema>;
export type ProductFollowersChangelogParams = z.infer<typeof ProductFollowersChangelogSchema>;
export type GetProductImageParams = z.infer<typeof GetProductImageSchema>;
export type DeleteProductImageParams = z.infer<typeof DeleteProductImageSchema>;
export type UploadProductImageParams = z.infer<typeof UploadProductImageSchema>;
export type UpdateProductImageParams = z.infer<typeof UpdateProductImageSchema>;
