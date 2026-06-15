/**
 * Zod schemas for Deal-related operations
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  IdParamSchema,
  DealStatusSchema,
  CurrencyCodeSchema,
  OptionalDateSchema,
  DateStringSchema,
  SearchTermSchema,
  SortDirectionSchema,
  VisibilitySchema,
  BoundedTextSchema,
  BoundedNameSchema,
  BoundedQueryParamSchema,
  BoundedCustomFieldsSchema,
  boundedArray,
} from "./common.js";

/**
 * List deals parameters
 */
export const ListDealsSchema = PaginationParamsSchema.extend({
  filter_id: z.number().int().positive().optional()
    .describe("Filter by saved filter ID"),
  ids: BoundedQueryParamSchema.optional()
    .describe("Comma-separated deal IDs to fetch (max 100)"),
  owner_id: z.number().int().positive().optional()
    .describe("Filter by owner user ID"),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by linked organization ID"),
  pipeline_id: z.number().int().positive().optional()
    .describe("Filter by pipeline ID"),
  stage_id: z.number().int().positive().optional()
    .describe("Filter by stage ID"),
  status: DealStatusSchema.optional()
    .describe("Filter by deal status (open, won, lost)"),
  updated_since: BoundedQueryParamSchema.optional()
    .describe("Filter deals updated after this time (RFC3339 format, e.g. 2024-01-01T00:00:00Z)"),
  updated_until: BoundedQueryParamSchema.optional()
    .describe("Filter deals updated before this time (RFC3339 format)"),
  sort_by: z.enum(["id", "update_time", "add_time"])
    .optional()
    .describe("Field to sort by (id, update_time, add_time)"),
  sort_direction: SortDirectionSchema,
  include_fields: BoundedQueryParamSchema.optional()
    .describe("Comma-separated extra fields (v2 enum, e.g. next_activity_id, last_activity_id, products_count, files_count, notes_count, followers_count)"),
  custom_fields: BoundedQueryParamSchema.optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Get deal parameters
 */
export const GetDealSchema = IdParamSchema.extend({
  include_fields: BoundedQueryParamSchema.optional()
    .describe("Comma-separated extra fields (v2 enum, e.g. next_activity_id, last_activity_id, products_count, files_count, notes_count, followers_count)"),
  custom_fields: BoundedQueryParamSchema.optional()
    .describe("Include custom fields in response (comma-separated field keys or 'all')"),
});

/**
 * Create deal parameters
 */
export const CreateDealSchema = z.object({
  title: z.string().min(1).max(255)
    .describe("Deal title (required)"),
  value: z.number().min(0).optional()
    .describe("Deal monetary value"),
  currency: CurrencyCodeSchema,
  owner_id: z.number().int().positive().optional()
    .describe("Owner user ID (defaults to API key owner)"),
  person_id: z.number().int().positive().optional()
    .describe("ID of person to link to deal"),
  org_id: z.number().int().positive().optional()
    .describe("ID of organization to link to deal"),
  pipeline_id: z.number().int().positive().optional()
    .describe("Pipeline ID (defaults to first pipeline)"),
  stage_id: z.number().int().positive().optional()
    .describe("Stage ID (defaults to first stage in pipeline)"),
  status: z.enum(["open", "won", "lost"]).optional()
    .describe("Deal status"),
  expected_close_date: OptionalDateSchema
    .describe("Expected close date (YYYY-MM-DD)"),
  probability: z.number().min(0).max(100).optional()
    .describe("Deal success probability (0-100)"),
  visible_to: VisibilitySchema,
  label_ids: boundedArray(z.number()).optional()
    .describe("Label IDs to attach to deal"),
  custom_fields: BoundedCustomFieldsSchema.optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Update deal parameters
 */
export const UpdateDealSchema = IdParamSchema.extend({
  title: z.string().min(1).max(255).optional()
    .describe("New deal title"),
  value: z.number().min(0).optional()
    .describe("New deal value"),
  currency: CurrencyCodeSchema,
  owner_id: z.number().int().positive().optional()
    .describe("New owner user ID"),
  person_id: z.number().int().positive().optional()
    .describe("New linked person ID"),
  org_id: z.number().int().positive().optional()
    .describe("New linked organization ID"),
  pipeline_id: z.number().int().positive().optional()
    .describe("New pipeline ID"),
  stage_id: z.number().int().positive().optional()
    .describe("New stage ID"),
  status: z.enum(["open", "won", "lost"]).optional()
    .describe("New deal status"),
  expected_close_date: OptionalDateSchema
    .describe("New expected close date (YYYY-MM-DD)"),
  probability: z.number().min(0).max(100).optional()
    .describe("New success probability (0-100)"),
  won_time: BoundedNameSchema.optional()
    .describe("Won time (required when setting status to 'won')"),
  lost_time: BoundedNameSchema.optional()
    .describe("Lost time (required when setting status to 'lost')"),
  lost_reason: BoundedNameSchema.optional()
    .describe("Lost reason (when status is 'lost')"),
  label_ids: boundedArray(z.number()).optional()
    .describe("Label IDs to set on deal"),
  custom_fields: BoundedCustomFieldsSchema.optional()
    .describe("Custom field values as object with field keys"),
});

/**
 * Search deals parameters
 */
export const SearchDealsSchema = z.object({
  term: SearchTermSchema
    .describe("Search term to find in deal title, notes, and custom fields"),
  fields: BoundedQueryParamSchema.optional()
    .describe("Comma-separated fields to search (allowed: title, notes, custom_fields). Defaults to all."),
  person_id: z.number().int().positive().optional()
    .describe("Filter by linked person"),
  org_id: z.number().int().positive().optional()
    .describe("Filter by linked organization"),
  status: DealStatusSchema.optional(),
  exact_match: z.boolean().optional().default(false)
    .describe("Use exact match instead of fuzzy search"),
  limit: z.number().min(1).max(100).optional().default(50)
    .describe("Number of results to return"),
  cursor: BoundedQueryParamSchema.optional()
    .describe("Cursor for pagination (from previous response)"),
});

/**
 * Delete deal parameters
 */
export const DeleteDealSchema = IdParamSchema;

// ─── Follower schemas (U1, #69) ───────────────────────────────────────────────

/**
 * List deal followers parameters
 */
export const ListDealFollowersSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The deal ID"),
});

/**
 * Add deal follower parameters
 */
export const AddDealFollowerSchema = IdParamSchema.extend({
  user_id: z.number().int().positive().describe("The ID of the user to add as a follower (required)"),
});

/**
 * Delete deal follower parameters
 */
export const DeleteDealFollowerSchema = IdParamSchema.extend({
  follower_id: z.number().int().positive().describe("The ID of the follower (user) to remove"),
});

/**
 * Deal followers changelog parameters
 */
export const DealFollowersChangelogSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The deal ID"),
});

// ─── U1: Deal line-item product schemas ──────────────────────────────────────

/**
 * Optional fields shared by add (single + bulk item) and update of a deal
 * line-item product. PATCH makes everything optional; on add these accompany
 * the required product_id/item_price/quantity.
 */
const dealProductOptionalFields = {
  tax: z.number().optional()
    .describe("Tax percentage applied to the line item (default 0)"),
  comments: BoundedTextSchema.optional()
    .describe("Free-text comments for this line item"),
  discount: z.number().optional()
    .describe("Discount applied to the line item (default 0)"),
  is_enabled: z.boolean().optional()
    .describe("Whether the product is enabled on the deal (default true)"),
  tax_method: z.enum(["exclusive", "inclusive", "none"]).optional()
    .describe("How tax is applied (exclusive, inclusive, none)"),
  discount_type: z.enum(["percentage", "amount"]).optional()
    .describe("Whether discount is a percentage or a fixed amount (default percentage)"),
  product_variation_id: z.number().int().positive().nullable().optional()
    .describe("Product variation ID (null to clear)"),
  billing_frequency: z.enum([
    "one-time", "annually", "semi-annually", "quarterly", "monthly", "weekly",
  ]).optional()
    .describe("Billing frequency for recurring products"),
  billing_frequency_cycles: z.number().int().nullable().optional()
    .describe("Number of billing cycles (null = unlimited)"),
  billing_start_date: DateStringSchema.nullable().optional()
    .describe("Billing start date (YYYY-MM-DD, null to clear)"),
};

/**
 * A single line-item product entry (used by add and by each item of bulk-add).
 */
const dealProductItemFields = {
  product_id: z.number().int().positive()
    .describe("The product ID to attach (required)"),
  item_price: z.number()
    .describe("Price of one unit of the product (required)"),
  quantity: z.number()
    .describe("Quantity of the product (required)"),
  ...dealProductOptionalFields,
};

export const DealProductItemSchema = z.object(dealProductItemFields);

/**
 * List deal products parameters
 */
export const ListDealProductsSchema = PaginationParamsSchema.extend({
  id: z.number().int().positive().describe("The deal ID"),
  sort_by: z.enum(["id", "add_time", "update_time", "order_nr"]).optional()
    .describe("Field to sort by (id, add_time, update_time, order_nr)"),
  sort_direction: SortDirectionSchema,
});

/**
 * Add deal product parameters (single)
 */
export const AddDealProductSchema = IdParamSchema.extend(dealProductItemFields);

/**
 * Update deal product parameters (all body fields optional)
 */
export const UpdateDealProductSchema = IdParamSchema.extend({
  product_attachment_id: z.number().int().positive()
    .describe("The product-attachment ID (the line item's own ID on the deal)"),
  product_id: z.number().int().positive().optional()
    .describe("The product ID to attach"),
  item_price: z.number().optional()
    .describe("Price of one unit of the product"),
  quantity: z.number().optional()
    .describe("Quantity of the product"),
  ...dealProductOptionalFields,
});

/**
 * Delete deal product parameters
 */
export const DeleteDealProductSchema = IdParamSchema.extend({
  product_attachment_id: z.number().int().positive()
    .describe("The product-attachment ID (the line item's own ID on the deal)"),
});

/**
 * Bulk-add deal products parameters (up to 100 line items in one request)
 */
export const BulkAddDealProductsSchema = IdParamSchema.extend({
  data: z.array(DealProductItemSchema).min(1).max(100)
    .describe("Array of 1-100 line-item products to add to the deal"),
});

// ─── U2: Deal discount schemas ────────────────────────────────────────────────

/**
 * List deal discounts parameters (no pagination -- the v2 endpoint defines none)
 */
export const ListDealDiscountsSchema = IdParamSchema;

/**
 * Add deal discount parameters
 */
export const AddDealDiscountSchema = IdParamSchema.extend({
  description: BoundedTextSchema.min(1).describe("Discount description (required)"),
  amount: z.number().positive().describe("Discount amount, must be positive (required)"),
  type: z.enum(["percentage", "amount"]).describe("Whether amount is a percentage or fixed amount (required)"),
});

/**
 * Update deal discount parameters (all body fields optional).
 * discount_id is a UUID string, not an integer.
 */
export const UpdateDealDiscountSchema = IdParamSchema.extend({
  discount_id: z.uuid().describe("The discount UUID"),
  description: BoundedTextSchema.min(1).optional().describe("Discount description"),
  amount: z.number().positive().optional().describe("Discount amount, must be positive"),
  type: z.enum(["percentage", "amount"]).optional().describe("Whether amount is a percentage or fixed amount"),
});

/**
 * Delete deal discount parameters. discount_id is a UUID string.
 */
export const DeleteDealDiscountSchema = IdParamSchema.extend({
  discount_id: z.uuid().describe("The discount UUID"),
});

// ─── U3: Deal installment schemas (Growth+ plan) ──────────────────────────────

/**
 * List deal installments parameters. NOTE: this is a collection-level endpoint
 * (/deals/installments), not per-deal, so it takes a required deal_ids array
 * rather than a single deal id path param.
 */
export const ListDealInstallmentsSchema = PaginationParamsSchema.extend({
  deal_ids: z.array(z.number().int().positive()).min(1).max(100)
    .describe("Deal IDs to fetch installments for (1-100, required)"),
  sort_by: z.enum(["id", "billing_date", "deal_id"]).optional()
    .describe("Field to sort by (id, billing_date, deal_id)"),
  sort_direction: SortDirectionSchema,
});

/**
 * Add deal installment parameters
 */
export const AddDealInstallmentSchema = IdParamSchema.extend({
  description: BoundedTextSchema.min(1).describe("Installment description (required)"),
  amount: z.number().positive().describe("Installment amount, must be positive (required)"),
  billing_date: DateStringSchema.describe("Billing date in YYYY-MM-DD format (required)"),
});

/**
 * Update deal installment parameters (all body fields optional)
 */
export const UpdateDealInstallmentSchema = IdParamSchema.extend({
  installment_id: z.number().int().positive().describe("The installment ID"),
  description: BoundedTextSchema.min(1).optional().describe("Installment description"),
  amount: z.number().positive().optional().describe("Installment amount, must be positive"),
  billing_date: DateStringSchema.optional().describe("Billing date in YYYY-MM-DD format"),
});

/**
 * Delete deal installment parameters
 */
export const DeleteDealInstallmentSchema = IdParamSchema.extend({
  installment_id: z.number().int().positive().describe("The installment ID"),
});

// ─── U4: Archived deals list schema ───────────────────────────────────────────

/**
 * List archived deals parameters. The /deals/archived filter set is identical
 * to the active /deals list, so this is a direct alias of ListDealsSchema.
 */
export const ListArchivedDealsSchema = ListDealsSchema;

// ─── U5: Convert-deal-to-lead schemas ─────────────────────────────────────────

/**
 * Convert deal to lead parameters
 */
export const ConvertDealToLeadSchema = IdParamSchema;

/**
 * Get deal conversion status parameters
 */
export const GetDealConversionStatusSchema = IdParamSchema.extend({
  conversion_id: z.uuid().describe("Conversion job UUID returned by the convert call"),
});

/**
 * Type exports for use in tool implementations
 */
export type ListDealsParams = z.infer<typeof ListDealsSchema>;
export type GetDealParams = z.infer<typeof GetDealSchema>;
export type CreateDealParams = z.infer<typeof CreateDealSchema>;
export type UpdateDealParams = z.infer<typeof UpdateDealSchema>;
export type SearchDealsParams = z.infer<typeof SearchDealsSchema>;
export type DeleteDealParams = z.infer<typeof DeleteDealSchema>;
export type ListDealFollowersParams = z.infer<typeof ListDealFollowersSchema>;
export type AddDealFollowerParams = z.infer<typeof AddDealFollowerSchema>;
export type DeleteDealFollowerParams = z.infer<typeof DeleteDealFollowerSchema>;
export type DealFollowersChangelogParams = z.infer<typeof DealFollowersChangelogSchema>;
// U1: deal line-item products
export type ListDealProductsParams = z.infer<typeof ListDealProductsSchema>;
export type AddDealProductParams = z.infer<typeof AddDealProductSchema>;
export type UpdateDealProductParams = z.infer<typeof UpdateDealProductSchema>;
export type DeleteDealProductParams = z.infer<typeof DeleteDealProductSchema>;
export type BulkAddDealProductsParams = z.infer<typeof BulkAddDealProductsSchema>;
// U2: deal discounts
export type ListDealDiscountsParams = z.infer<typeof ListDealDiscountsSchema>;
export type AddDealDiscountParams = z.infer<typeof AddDealDiscountSchema>;
export type UpdateDealDiscountParams = z.infer<typeof UpdateDealDiscountSchema>;
export type DeleteDealDiscountParams = z.infer<typeof DeleteDealDiscountSchema>;
// U3: deal installments
export type ListDealInstallmentsParams = z.infer<typeof ListDealInstallmentsSchema>;
export type AddDealInstallmentParams = z.infer<typeof AddDealInstallmentSchema>;
export type UpdateDealInstallmentParams = z.infer<typeof UpdateDealInstallmentSchema>;
export type DeleteDealInstallmentParams = z.infer<typeof DeleteDealInstallmentSchema>;
// U4: archived deals
export type ListArchivedDealsParams = z.infer<typeof ListArchivedDealsSchema>;
// U5: convert deal to lead
export type ConvertDealToLeadParams = z.infer<typeof ConvertDealToLeadSchema>;
export type GetDealConversionStatusParams = z.infer<typeof GetDealConversionStatusSchema>;
