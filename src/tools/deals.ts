/**
 * Deal-related MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListDealsSchema,
  GetDealSchema,
  CreateDealSchema,
  UpdateDealSchema,
  SearchDealsSchema,
  DeleteDealSchema,
  ListDealFollowersSchema,
  AddDealFollowerSchema,
  DeleteDealFollowerSchema,
  DealFollowersChangelogSchema,
  ListDealProductsSchema,
  AddDealProductSchema,
  UpdateDealProductSchema,
  DeleteDealProductSchema,
  BulkAddDealProductsSchema,
  ListDealDiscountsSchema,
  AddDealDiscountSchema,
  UpdateDealDiscountSchema,
  DeleteDealDiscountSchema,
  ListDealInstallmentsSchema,
  AddDealInstallmentSchema,
  UpdateDealInstallmentSchema,
  DeleteDealInstallmentSchema,
  ListArchivedDealsSchema,
  ConvertDealToLeadSchema,
  GetDealConversionStatusSchema,
  type ListDealsParams,
  type GetDealParams,
  type CreateDealParams,
  type UpdateDealParams,
  type SearchDealsParams,
  type DeleteDealParams,
  type ListDealFollowersParams,
  type AddDealFollowerParams,
  type DeleteDealFollowerParams,
  type DealFollowersChangelogParams,
  type ListDealProductsParams,
  type AddDealProductParams,
  type UpdateDealProductParams,
  type DeleteDealProductParams,
  type BulkAddDealProductsParams,
  type ListDealDiscountsParams,
  type AddDealDiscountParams,
  type UpdateDealDiscountParams,
  type DeleteDealDiscountParams,
  type ListDealInstallmentsParams,
  type AddDealInstallmentParams,
  type UpdateDealInstallmentParams,
  type DeleteDealInstallmentParams,
  type ListArchivedDealsParams,
  type ConvertDealToLeadParams,
  type GetDealConversionStatusParams,
} from "../schemas/deals.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

/**
 * List deals with optional filtering
 */
export async function listDeals(params: ListDealsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.ids) queryParams.set("ids", params.ids);
  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.org_id) queryParams.set("org_id", String(params.org_id));
  if (params.pipeline_id) queryParams.set("pipeline_id", String(params.pipeline_id));
  if (params.stage_id) queryParams.set("stage_id", String(params.stage_id));
  if (params.status) queryParams.set("status", params.status);
  if (params.updated_since) queryParams.set("updated_since", params.updated_since);
  if (params.updated_until) queryParams.set("updated_until", params.updated_until);
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown[]>("/deals", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const deals = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("deal", deals.length, pagination.has_more),
    data: deals,
    pagination,
  });
}

/**
 * Get a single deal by ID
 */
export async function getDeal(params: GetDealParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown>(
    `/deals/${params.id}`,
    queryParams.toString() ? queryParams : undefined,
    "v2"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Deal ${params.id}`,
    data: response.data,
  });
}

/**
 * Create a new deal
 */
export async function createDeal(params: CreateDealParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    title: params.title,
  };

  if (params.value !== undefined) body.value = params.value;
  if (params.currency) body.currency = params.currency;
  if (params.owner_id) body.owner_id = params.owner_id;
  if (params.person_id) body.person_id = params.person_id;
  if (params.org_id) body.org_id = params.org_id;
  if (params.pipeline_id) body.pipeline_id = params.pipeline_id;
  if (params.stage_id) body.stage_id = params.stage_id;
  if (params.status) body.status = params.status;
  if (params.expected_close_date) body.expected_close_date = params.expected_close_date;
  if (params.probability !== undefined) body.probability = params.probability;
  if (params.visible_to) body.visible_to = params.visible_to;
  if (params.label_ids) body.label_ids = params.label_ids;
  if (params.custom_fields) body.custom_fields = params.custom_fields;

  const response = await client.post<unknown>("/deals", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Deal created",
    data: response.data,
  });
}

/**
 * Update an existing deal
 */
export async function updateDeal(params: UpdateDealParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.title) body.title = updateFields.title;
  if (updateFields.value !== undefined) body.value = updateFields.value;
  if (updateFields.currency) body.currency = updateFields.currency;
  if (updateFields.owner_id) body.owner_id = updateFields.owner_id;
  if (updateFields.person_id) body.person_id = updateFields.person_id;
  if (updateFields.org_id) body.org_id = updateFields.org_id;
  if (updateFields.pipeline_id) body.pipeline_id = updateFields.pipeline_id;
  if (updateFields.stage_id) body.stage_id = updateFields.stage_id;
  if (updateFields.status) body.status = updateFields.status;
  if (updateFields.expected_close_date) body.expected_close_date = updateFields.expected_close_date;
  if (updateFields.probability !== undefined) body.probability = updateFields.probability;
  if (updateFields.won_time) body.won_time = updateFields.won_time;
  if (updateFields.lost_time) body.lost_time = updateFields.lost_time;
  if (updateFields.lost_reason) body.lost_reason = updateFields.lost_reason;
  if (updateFields.label_ids) body.label_ids = updateFields.label_ids;
  if (updateFields.custom_fields) body.custom_fields = updateFields.custom_fields;

  const response = await client.patch<unknown>(`/deals/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Deal ${id} updated`,
    data: response.data,
  });
}

/**
 * Search deals by term
 */
export async function searchDeals(params: SearchDealsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.org_id) queryParams.set("organization_id", String(params.org_id));
  if (params.status) queryParams.set("status", params.status);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/deals/search", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: `Search results for "${params.term}"`,
    data: response.data,
    pagination,
  });
}

/**
 * Delete a deal
 */
export async function deleteDeal(params: DeleteDealParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/deals/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Deal ${params.id} deleted (will be permanently removed after 30 days)`,
    data: response.data,
  });
}

// ─── Follower handlers (U1, #69) ──────────────────────────────────────────────

/**
 * List followers for a deal
 */
export async function listDealFollowers(params: ListDealFollowersParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/deals/${params.id}/followers`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("follower", data.length, pagination.has_more),
    data,
    pagination,
  });
}

/**
 * Add a follower to a deal
 */
export async function addDealFollower(params: AddDealFollowerParams) {
  const client = getClient();

  const body = { user_id: params.user_id };

  const response = await client.post<unknown>(`/deals/${params.id}/followers`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Follower added to deal",
    data: response.data,
  });
}

/**
 * Get the followers changelog for a deal
 */
export async function getDealFollowersChangelog(params: DealFollowersChangelogParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/deals/${params.id}/followers/changelog`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: `Followers changelog for deal ${params.id}`,
    data,
    pagination,
  });
}

/**
 * Delete a deal follower
 */
export async function deleteDealFollower(params: DeleteDealFollowerParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ user_id: number }>(`/deals/${params.id}/followers/${params.follower_id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Follower ${params.follower_id} removed from deal ${params.id}`,
    data: response.data,
  });
}

// ─── U1: Deal line-item product handlers ──────────────────────────────────────

/**
 * List line-item products attached to a deal
 */
export async function listDealProducts(params: ListDealProductsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);

  const response = await client.get<unknown[]>(`/deals/${params.id}/products`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("deal product", data.length, pagination.has_more),
    data,
    pagination,
  });
}

/**
 * Add a single line-item product to a deal
 */
export async function addDealProduct(params: AddDealProductParams) {
  const client = getClient();

  const { id, ...fields } = params;
  const body: Record<string, unknown> = {
    product_id: fields.product_id,
    item_price: fields.item_price,
    quantity: fields.quantity,
  };

  if (fields.tax !== undefined) body.tax = fields.tax;
  if (fields.comments !== undefined) body.comments = fields.comments;
  if (fields.discount !== undefined) body.discount = fields.discount;
  if (fields.is_enabled !== undefined) body.is_enabled = fields.is_enabled;
  if (fields.tax_method !== undefined) body.tax_method = fields.tax_method;
  if (fields.discount_type !== undefined) body.discount_type = fields.discount_type;
  if (fields.product_variation_id !== undefined) body.product_variation_id = fields.product_variation_id;
  if (fields.billing_frequency !== undefined) body.billing_frequency = fields.billing_frequency;
  if (fields.billing_frequency_cycles !== undefined) body.billing_frequency_cycles = fields.billing_frequency_cycles;
  if (fields.billing_start_date !== undefined) body.billing_start_date = fields.billing_start_date;

  const response = await client.post<unknown>(`/deals/${id}/products`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Product added to deal",
    data: response.data,
  });
}

/**
 * Update a line-item product attached to a deal (all body fields optional)
 */
export async function updateDealProduct(params: UpdateDealProductParams) {
  const client = getClient();

  const { id, product_attachment_id, ...fields } = params;
  const body: Record<string, unknown> = {};

  if (fields.product_id !== undefined) body.product_id = fields.product_id;
  if (fields.item_price !== undefined) body.item_price = fields.item_price;
  if (fields.quantity !== undefined) body.quantity = fields.quantity;
  if (fields.tax !== undefined) body.tax = fields.tax;
  if (fields.comments !== undefined) body.comments = fields.comments;
  if (fields.discount !== undefined) body.discount = fields.discount;
  if (fields.is_enabled !== undefined) body.is_enabled = fields.is_enabled;
  if (fields.tax_method !== undefined) body.tax_method = fields.tax_method;
  if (fields.discount_type !== undefined) body.discount_type = fields.discount_type;
  if (fields.product_variation_id !== undefined) body.product_variation_id = fields.product_variation_id;
  if (fields.billing_frequency !== undefined) body.billing_frequency = fields.billing_frequency;
  if (fields.billing_frequency_cycles !== undefined) body.billing_frequency_cycles = fields.billing_frequency_cycles;
  if (fields.billing_start_date !== undefined) body.billing_start_date = fields.billing_start_date;

  const response = await client.patch<unknown>(`/deals/${id}/products/${product_attachment_id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Deal product ${product_attachment_id} updated`,
    data: response.data,
  });
}

/**
 * Delete a line-item product from a deal
 */
export async function deleteDealProduct(params: DeleteDealProductParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/deals/${params.id}/products/${params.product_attachment_id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Product ${params.product_attachment_id} removed from deal ${params.id}`,
    data: response.data,
  });
}

/**
 * Bulk-add up to 100 line-item products to a deal in one request
 */
export async function bulkAddDealProducts(params: BulkAddDealProductsParams) {
  const client = getClient();

  const response = await client.post<unknown[]>(`/deals/${params.id}/products/bulk`, { data: params.data }, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;

  return formatToolResponse({
    summary: `Added ${data.length} product${data.length !== 1 ? "s" : ""} to deal ${params.id}`,
    data,
  });
}

// ─── U2: Deal discount handlers ───────────────────────────────────────────────

/**
 * List discounts on a deal (no pagination -- the v2 endpoint defines none)
 */
export async function listDealDiscounts(params: ListDealDiscountsParams) {
  const client = getClient();

  const response = await client.get<unknown[]>(`/deals/${params.id}/discounts`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;

  return formatToolResponse({
    summary: createListSummary("discount", data.length, false),
    data,
  });
}

/**
 * Add a discount to a deal
 */
export async function addDealDiscount(params: AddDealDiscountParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    description: params.description,
    amount: params.amount,
    type: params.type,
  };

  const response = await client.post<unknown>(`/deals/${params.id}/discounts`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Discount added to deal",
    data: response.data,
  });
}

/**
 * Update a discount on a deal (all body fields optional)
 */
export async function updateDealDiscount(params: UpdateDealDiscountParams) {
  const client = getClient();

  const { id, discount_id, ...fields } = params;
  const body: Record<string, unknown> = {};

  if (fields.description !== undefined) body.description = fields.description;
  if (fields.amount !== undefined) body.amount = fields.amount;
  if (fields.type !== undefined) body.type = fields.type;

  const response = await client.patch<unknown>(`/deals/${id}/discounts/${discount_id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Discount ${discount_id} updated on deal ${id}`,
    data: response.data,
  });
}

/**
 * Delete a discount from a deal
 */
export async function deleteDealDiscount(params: DeleteDealDiscountParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  // NOTE: the spec's delete response carries an integer `id`, but the reusable
  // discount identifier is the UUID `discount_id` the caller passed. Key the
  // summary on the UUID; the returned integer `id` is not a reusable discount ID.
  const response = await client.delete<{ id: number }>(`/deals/${params.id}/discounts/${params.discount_id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Discount ${params.discount_id} deleted from deal ${params.id}`,
    data: response.data,
  });
}

// ─── U3: Deal installment handlers (Growth+ plan) ─────────────────────────────

/**
 * List installments across one or more deals. NOTE: collection-level endpoint
 * (/deals/installments), so deal_ids is a required query array.
 */
export async function listDealInstallments(params: ListDealInstallmentsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
  // Comma-joined single value (NOT repeated keys): the client forwards query
  // params via url.searchParams.set, which collapses repeated keys to the last.
  // Matches the listDeals `ids` filter convention, proven against the v2 API.
  queryParams.set("deal_ids", params.deal_ids.join(","));
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);

  const response = await client.get<unknown[]>("/deals/installments", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("installment", data.length, pagination.has_more),
    data,
    pagination,
  });
}

/**
 * Add an installment to a deal (Growth+ plan required)
 */
export async function addDealInstallment(params: AddDealInstallmentParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    description: params.description,
    amount: params.amount,
    billing_date: params.billing_date,
  };

  const response = await client.post<unknown>(`/deals/${params.id}/installments`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Installment added to deal",
    data: response.data,
  });
}

/**
 * Update an installment on a deal (Growth+ plan required; all body fields optional)
 */
export async function updateDealInstallment(params: UpdateDealInstallmentParams) {
  const client = getClient();

  const { id, installment_id, ...fields } = params;
  const body: Record<string, unknown> = {};

  if (fields.description !== undefined) body.description = fields.description;
  if (fields.amount !== undefined) body.amount = fields.amount;
  if (fields.billing_date !== undefined) body.billing_date = fields.billing_date;

  const response = await client.patch<unknown>(`/deals/${id}/installments/${installment_id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Installment ${installment_id} updated on deal ${id}`,
    data: response.data,
  });
}

/**
 * Delete an installment from a deal (Growth+ plan required)
 */
export async function deleteDealInstallment(params: DeleteDealInstallmentParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/deals/${params.id}/installments/${params.installment_id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Installment ${params.installment_id} deleted from deal ${params.id}`,
    data: response.data,
  });
}

// ─── U4: Archived deals handler ───────────────────────────────────────────────

/**
 * List archived deals (mirrors listDeals filter surface, hits /deals/archived)
 */
export async function listArchivedDeals(params: ListArchivedDealsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.ids) queryParams.set("ids", params.ids);
  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.org_id) queryParams.set("org_id", String(params.org_id));
  if (params.pipeline_id) queryParams.set("pipeline_id", String(params.pipeline_id));
  if (params.stage_id) queryParams.set("stage_id", String(params.stage_id));
  if (params.status) queryParams.set("status", params.status);
  if (params.updated_since) queryParams.set("updated_since", params.updated_since);
  if (params.updated_until) queryParams.set("updated_until", params.updated_until);
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown[]>("/deals/archived", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const deals = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("archived deal", deals.length, pagination.has_more),
    data: deals,
    pagination,
  });
}

// ─── U5: Convert-deal-to-lead handlers ────────────────────────────────────────

/**
 * Convert a deal to a lead (async job). Destructive: a successful conversion
 * marks the source deal as deleted (openapi-v2.yaml:5910), so it is gated.
 */
export async function convertDealToLead(params: ConvertDealToLeadParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  // Empty body {} -- convert/lead takes no request body. Mirrors the shipped
  // archiveProject bodyless v2 POST (client.post body is non-optional).
  const response = await client.post<{ conversion_id: string }>(`/deals/${params.id}/convert/lead`, {}, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Deal conversion initiated; poll get_deal_conversion_status with conversion_id until a terminal status",
    data: response.data,
  });
}

/**
 * Get the status of a deal-to-lead conversion job. Read-only (ungated).
 */
export async function getDealConversionStatus(params: GetDealConversionStatusParams) {
  const client = getClient();

  const response = await client.get<{ status: string; lead_id?: string; conversion_id: string }>(
    `/deals/${params.id}/convert/status/${params.conversion_id}`,
    undefined,
    "v2"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  let summary: string;
  switch (data.status) {
    case "completed":
      summary = `Conversion completed; lead_id: ${data.lead_id ?? "(missing)"}`;
      break;
    case "failed":
    case "rejected":
      summary = `Conversion ${data.status}; no lead produced, stop polling`;
      break;
    default:
      // not_started | running -- still in progress
      summary = `Conversion ${data.status}; re-poll`;
      break;
  }

  return formatToolResponse({
    summary,
    data,
  });
}

/**
 * Tool definitions for MCP registration
 */
export const dealTools = [
  {
    name: "pipedrive_list_deals",
    description: "List deals from Pipedrive with optional filtering by owner, person, organization, pipeline, stage, or status. Returns paginated results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        ids: { type: "string", description: "Comma-separated deal IDs to fetch (max 100)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        person_id: { type: "number", description: "Filter by linked person ID" },
        org_id: { type: "number", description: "Filter by linked organization ID" },
        pipeline_id: { type: "number", description: "Filter by pipeline ID" },
        stage_id: { type: "number", description: "Filter by stage ID" },
        status: { type: "string", enum: ["open", "won", "lost", "deleted"], description: "Filter by deal status (omit to return all non-deleted deals)" },
        updated_since: { type: "string", description: "Filter deals updated after this time (RFC3339 format, e.g. 2024-01-01T00:00:00Z)" },
        updated_until: { type: "string", description: "Filter deals updated before this time (RFC3339 format)" },
        sort_by: { type: "string", enum: ["id", "update_time", "add_time"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction (default: desc)" },
        include_fields: { type: "string", description: "Comma-separated extra fields (v2 enum, e.g. next_activity_id, last_activity_id, products_count, files_count, notes_count, followers_count)" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys or 'all')" },
      },
    },
    handler: listDeals,
    schema: ListDealsSchema,
  },
  {
    name: "pipedrive_get_deal",
    description: "Get detailed information about a specific deal by ID, including all standard and custom fields.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        include_fields: { type: "string", description: "Comma-separated extra fields (v2 enum, e.g. next_activity_id, last_activity_id, products_count, files_count, notes_count, followers_count)" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys or 'all')" },
      },
      required: ["id"],
    },
    handler: getDeal,
    schema: GetDealSchema,
  },
  {
    name: "pipedrive_create_deal",
    description: "Create a new deal in Pipedrive. Only title is required; all other fields are optional.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Deal title (required)" },
        value: { type: "number", description: "Deal monetary value" },
        currency: { type: "string", description: "3-letter currency code (e.g., USD, EUR)" },
        owner_id: { type: "number", description: "Owner user ID" },
        person_id: { type: "number", description: "ID of person to link to deal" },
        org_id: { type: "number", description: "ID of organization to link to deal" },
        pipeline_id: { type: "number", description: "Pipeline ID" },
        stage_id: { type: "number", description: "Stage ID" },
        status: { type: "string", enum: ["open", "won", "lost"], description: "Deal status" },
        expected_close_date: { type: "string", description: "Expected close date (YYYY-MM-DD)" },
        probability: { type: "number", description: "Success probability (0-100)" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "Visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to attach to deal" },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
      },
      required: ["title"],
    },
    handler: createDeal,
    schema: CreateDealSchema,
  },
  {
    name: "pipedrive_update_deal",
    description: "Update an existing deal in Pipedrive. Specify the deal ID and any fields to update.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Deal ID to update" },
        title: { type: "string", description: "New deal title" },
        value: { type: "number", description: "New deal value" },
        currency: { type: "string", description: "New currency code" },
        owner_id: { type: "number", description: "New owner user ID" },
        person_id: { type: "number", description: "New linked person ID" },
        org_id: { type: "number", description: "New linked organization ID" },
        pipeline_id: { type: "number", description: "New pipeline ID" },
        stage_id: { type: "number", description: "New stage ID" },
        status: { type: "string", enum: ["open", "won", "lost"], description: "New deal status" },
        expected_close_date: { type: "string", description: "New expected close date (YYYY-MM-DD)" },
        probability: { type: "number", description: "New success probability (0-100)" },
        won_time: { type: "string", description: "Won time (when status is 'won')" },
        lost_time: { type: "string", description: "Lost time (when status is 'lost')" },
        lost_reason: { type: "string", description: "Lost reason (when status is 'lost')" },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to set on deal" },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
      },
      required: ["id"],
    },
    handler: updateDeal,
    schema: UpdateDealSchema,
  },
  {
    name: "pipedrive_search_deals",
    description: "Search for deals by text in title. Supports fuzzy matching by default.",
    inputSchema: {
      type: "object" as const,
      properties: {
        term: { type: "string", description: "Search term" },
        fields: { type: "string", description: "Comma-separated fields to search (title, notes, custom_fields). Defaults to all." },
        person_id: { type: "number", description: "Filter by linked person" },
        org_id: { type: "number", description: "Filter by linked organization" },
        status: { type: "string", enum: ["open", "won", "lost", "deleted"], description: "Filter by status (omit to return all non-deleted deals)" },
        exact_match: { type: "boolean", description: "Use exact match instead of fuzzy" },
        limit: { type: "number", description: "Number of results (1-100)" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
      },
      required: ["term"],
    },
    handler: searchDeals,
    schema: SearchDealsSchema,
  },
  {
    name: "pipedrive_delete_deal",
    description: "Delete a deal. The deal will be marked as deleted and permanently removed after 30 days.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Deal ID to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deleteDeal,
    schema: DeleteDealSchema,
  },
  // Follower tools (U1, #69)
  {
    name: "pipedrive_list_deal_followers",
    description: "List all followers for a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
      required: ["id"],
    },
    handler: listDealFollowers,
    schema: ListDealFollowersSchema,
  },
  {
    name: "pipedrive_add_deal_follower",
    description: "Add a follower to a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        user_id: { type: "number", description: "The ID of the user to add as a follower (required)" },
      },
      required: ["id", "user_id"],
    },
    handler: addDealFollower,
    schema: AddDealFollowerSchema,
  },
  {
    name: "pipedrive_delete_deal_follower",
    description: "Remove a follower from a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        follower_id: { type: "number", description: "The ID of the follower (user) to remove" },
      },
      required: ["id", "follower_id"],
    },
    destructive: true,
    handler: deleteDealFollower,
    schema: DeleteDealFollowerSchema,
  },
  {
    name: "pipedrive_get_deal_followers_changelog",
    description: "Get the followers changelog for a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
      required: ["id"],
    },
    handler: getDealFollowersChangelog,
    schema: DealFollowersChangelogSchema,
  },
  // U1: Deal line-item product tools
  {
    name: "pipedrive_list_deal_products",
    description: "List line-item products attached to a deal. Returns paginated results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
        sort_by: { type: "string", enum: ["id", "add_time", "update_time", "order_nr"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
      },
      required: ["id"],
    },
    handler: listDealProducts,
    schema: ListDealProductsSchema,
  },
  {
    name: "pipedrive_add_deal_product",
    description: "Attach a single product as a line item to a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        product_id: { type: "number", description: "The product ID to attach (required)" },
        item_price: { type: "number", description: "Price of one unit (required)" },
        quantity: { type: "number", description: "Quantity of the product (required)" },
        tax: { type: "number", description: "Tax percentage (default 0)" },
        comments: { type: "string", description: "Free-text comments for this line item" },
        discount: { type: "number", description: "Discount applied to the line item (default 0)" },
        is_enabled: { type: "boolean", description: "Whether the product is enabled on the deal (default true)" },
        tax_method: { type: "string", enum: ["exclusive", "inclusive", "none"], description: "How tax is applied" },
        discount_type: { type: "string", enum: ["percentage", "amount"], description: "Whether discount is a percentage or fixed amount (default percentage)" },
        product_variation_id: { type: "number", description: "Product variation ID (null to clear)" },
        billing_frequency: { type: "string", enum: ["one-time", "annually", "semi-annually", "quarterly", "monthly", "weekly"], description: "Billing frequency for recurring products" },
        billing_frequency_cycles: { type: "number", description: "Number of billing cycles (null = unlimited)" },
        billing_start_date: { type: "string", description: "Billing start date (YYYY-MM-DD)" },
      },
      required: ["id", "product_id", "item_price", "quantity"],
    },
    handler: addDealProduct,
    schema: AddDealProductSchema,
  },
  {
    name: "pipedrive_update_deal_product",
    description: "Update a line-item product attached to a deal. All body fields optional.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        product_attachment_id: { type: "number", description: "The product-attachment ID (the line item's own ID on the deal)" },
        product_id: { type: "number", description: "The product ID to attach" },
        item_price: { type: "number", description: "Price of one unit" },
        quantity: { type: "number", description: "Quantity of the product" },
        tax: { type: "number", description: "Tax percentage" },
        comments: { type: "string", description: "Free-text comments for this line item" },
        discount: { type: "number", description: "Discount applied to the line item" },
        is_enabled: { type: "boolean", description: "Whether the product is enabled on the deal" },
        tax_method: { type: "string", enum: ["exclusive", "inclusive", "none"], description: "How tax is applied" },
        discount_type: { type: "string", enum: ["percentage", "amount"], description: "Whether discount is a percentage or fixed amount" },
        product_variation_id: { type: "number", description: "Product variation ID (null to clear)" },
        billing_frequency: { type: "string", enum: ["one-time", "annually", "semi-annually", "quarterly", "monthly", "weekly"], description: "Billing frequency for recurring products" },
        billing_frequency_cycles: { type: "number", description: "Number of billing cycles (null = unlimited)" },
        billing_start_date: { type: "string", description: "Billing start date (YYYY-MM-DD)" },
      },
      required: ["id", "product_attachment_id"],
    },
    handler: updateDealProduct,
    schema: UpdateDealProductSchema,
  },
  {
    name: "pipedrive_delete_deal_product",
    description: "Remove a line-item product from a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        product_attachment_id: { type: "number", description: "The product-attachment ID (the line item's own ID on the deal)" },
      },
      required: ["id", "product_attachment_id"],
    },
    destructive: true,
    handler: deleteDealProduct,
    schema: DeleteDealProductSchema,
  },
  {
    name: "pipedrive_bulk_add_deal_products",
    description: "Bulk-add up to 100 line-item products to a deal in one request.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        data: {
          type: "array",
          description: "Array of 1-100 line-item products to add",
          items: {
            type: "object",
            properties: {
              product_id: { type: "number", description: "The product ID to attach (required)" },
              item_price: { type: "number", description: "Price of one unit (required)" },
              quantity: { type: "number", description: "Quantity of the product (required)" },
              tax: { type: "number", description: "Tax percentage (default 0)" },
              comments: { type: "string", description: "Free-text comments for this line item" },
              discount: { type: "number", description: "Discount applied to the line item (default 0)" },
              is_enabled: { type: "boolean", description: "Whether the product is enabled on the deal (default true)" },
              tax_method: { type: "string", enum: ["exclusive", "inclusive", "none"], description: "How tax is applied" },
              discount_type: { type: "string", enum: ["percentage", "amount"], description: "Whether discount is a percentage or fixed amount" },
              product_variation_id: { type: "number", description: "Product variation ID" },
              billing_frequency: { type: "string", enum: ["one-time", "annually", "semi-annually", "quarterly", "monthly", "weekly"], description: "Billing frequency for recurring products" },
              billing_frequency_cycles: { type: "number", description: "Number of billing cycles (null = unlimited)" },
              billing_start_date: { type: "string", description: "Billing start date (YYYY-MM-DD)" },
            },
            required: ["product_id", "item_price", "quantity"],
          },
        },
      },
      required: ["id", "data"],
    },
    handler: bulkAddDealProducts,
    schema: BulkAddDealProductsSchema,
  },
  // U2: Deal discount tools
  {
    name: "pipedrive_list_deal_discounts",
    description: "List all additional discounts applied to a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
      },
      required: ["id"],
    },
    handler: listDealDiscounts,
    schema: ListDealDiscountsSchema,
  },
  {
    name: "pipedrive_add_deal_discount",
    description: "Add an additional discount to a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        description: { type: "string", description: "Discount description (required)" },
        amount: { type: "number", description: "Discount amount, must be positive (required)" },
        type: { type: "string", enum: ["percentage", "amount"], description: "Whether amount is a percentage or fixed amount (required)" },
      },
      required: ["id", "description", "amount", "type"],
    },
    handler: addDealDiscount,
    schema: AddDealDiscountSchema,
  },
  {
    name: "pipedrive_update_deal_discount",
    description: "Update an additional discount on a deal. All fields except IDs are optional.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        discount_id: { type: "string", description: "The discount UUID" },
        description: { type: "string", description: "Discount description" },
        amount: { type: "number", description: "Discount amount, must be positive" },
        type: { type: "string", enum: ["percentage", "amount"], description: "Whether amount is a percentage or fixed amount" },
      },
      required: ["id", "discount_id"],
    },
    handler: updateDealDiscount,
    schema: UpdateDealDiscountSchema,
  },
  {
    name: "pipedrive_delete_deal_discount",
    description: "Delete an additional discount from a deal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        discount_id: { type: "string", description: "The discount UUID" },
      },
      required: ["id", "discount_id"],
    },
    destructive: true,
    handler: deleteDealDiscount,
    schema: DeleteDealDiscountSchema,
  },
  // U3: Deal installment tools (Growth+ plan required)
  {
    name: "pipedrive_list_deal_installments",
    description: "List installments across one or more deals. Requires deal_ids. Growth+ plan required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        deal_ids: { type: "array", items: { type: "number" }, description: "Deal IDs to fetch installments for (1-100, required)" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
        sort_by: { type: "string", enum: ["id", "billing_date", "deal_id"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
      },
      required: ["deal_ids"],
    },
    handler: listDealInstallments,
    schema: ListDealInstallmentsSchema,
  },
  {
    name: "pipedrive_add_deal_installment",
    description: "Add an installment (payment schedule entry) to a deal. Growth+ plan required; the deal must have at least one one-time product and no recurring products.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        description: { type: "string", description: "Installment description (required)" },
        amount: { type: "number", description: "Installment amount, must be positive (required)" },
        billing_date: { type: "string", description: "Billing date in YYYY-MM-DD format (required)" },
      },
      required: ["id", "description", "amount", "billing_date"],
    },
    handler: addDealInstallment,
    schema: AddDealInstallmentSchema,
  },
  {
    name: "pipedrive_update_deal_installment",
    description: "Update an installment on a deal. Growth+ plan required; all body fields optional.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        installment_id: { type: "number", description: "The installment ID" },
        description: { type: "string", description: "Installment description" },
        amount: { type: "number", description: "Installment amount, must be positive" },
        billing_date: { type: "string", description: "Billing date in YYYY-MM-DD format" },
      },
      required: ["id", "installment_id"],
    },
    handler: updateDealInstallment,
    schema: UpdateDealInstallmentSchema,
  },
  {
    name: "pipedrive_delete_deal_installment",
    description: "Delete an installment from a deal. Growth+ plan required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID" },
        installment_id: { type: "number", description: "The installment ID" },
      },
      required: ["id", "installment_id"],
    },
    destructive: true,
    handler: deleteDealInstallment,
    schema: DeleteDealInstallmentSchema,
  },
  // U4: Archived deals tool
  {
    name: "pipedrive_list_archived_deals",
    description: "List archived deals with the same filtering as the active deals list (owner, person, organization, pipeline, stage, status). Returns paginated results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        ids: { type: "string", description: "Comma-separated deal IDs to fetch (max 100)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        person_id: { type: "number", description: "Filter by linked person ID" },
        org_id: { type: "number", description: "Filter by linked organization ID" },
        pipeline_id: { type: "number", description: "Filter by pipeline ID" },
        stage_id: { type: "number", description: "Filter by stage ID" },
        status: { type: "string", enum: ["open", "won", "lost", "deleted"], description: "Filter by deal status (omit to return all non-deleted deals)" },
        updated_since: { type: "string", description: "Filter deals updated after this time (RFC3339 format, e.g. 2024-01-01T00:00:00Z)" },
        updated_until: { type: "string", description: "Filter deals updated before this time (RFC3339 format)" },
        sort_by: { type: "string", enum: ["id", "update_time", "add_time"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction (default: desc)" },
        include_fields: { type: "string", description: "Comma-separated extra fields (v2 enum, e.g. next_activity_id, last_activity_id, products_count, files_count, notes_count, followers_count)" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys or 'all')" },
      },
    },
    handler: listArchivedDeals,
    schema: ListArchivedDealsSchema,
  },
  // U5: Convert-deal-to-lead tools
  {
    name: "pipedrive_convert_deal_to_lead",
    description: "Convert a deal to a lead (async job). DESTRUCTIVE: a successful conversion marks the source deal as deleted. Returns a conversion_id; the conversion runs asynchronously, so you MUST poll pipedrive_get_deal_conversion_status with the conversion_id until a terminal status. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID to convert" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: convertDealToLead,
    schema: ConvertDealToLeadSchema,
  },
  {
    name: "pipedrive_get_deal_conversion_status",
    description: "Get the status of a deal-to-lead conversion job. Status contract: 'completed' (terminal, carries lead_id), 'failed'/'rejected' (terminal, stop polling, no lead produced), 'not_started'/'running' (in-progress, re-poll). Only 'completed' carries lead_id, and conversion status is purged after a few days, so a 404 returned after a prior valid status means the status was purged (terminal stop-polling signal, not a transient error). Use a bounded poll budget (e.g. up to ~6 attempts with short backoff), not an unbounded loop.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The deal ID that was converted" },
        conversion_id: { type: "string", description: "Conversion job UUID returned by the convert call" },
      },
      required: ["id", "conversion_id"],
    },
    handler: getDealConversionStatus,
    schema: GetDealConversionStatusSchema,
  },
];
