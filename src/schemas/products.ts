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

// ─── Type exports ─────────────────────────────────────────────────────────────

export type ListProductsParams = z.infer<typeof ListProductsSchema>;
export type GetProductParams = z.infer<typeof GetProductSchema>;
export type SearchProductsParams = z.infer<typeof SearchProductsSchema>;
export type CreateProductParams = z.infer<typeof CreateProductSchema>;
export type UpdateProductParams = z.infer<typeof UpdateProductSchema>;
export type DeleteProductParams = z.infer<typeof DeleteProductSchema>;
