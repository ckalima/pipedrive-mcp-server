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
  type ListDealsParams,
  type GetDealParams,
  type CreateDealParams,
  type UpdateDealParams,
  type SearchDealsParams,
  type DeleteDealParams,
} from "../schemas/deals.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

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

  const response = await client.get<unknown[]>("/deals", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const deals = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("deal", deals.length, pagination.has_more),
        data: deals,
        pagination,
      }, null, 2),
    }],
  };
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
    queryParams.toString() ? queryParams : undefined
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Deal ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
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
  if (params.add_time) body.add_time = params.add_time;
  if (params.custom_fields) body.custom_fields = params.custom_fields;

  const response = await client.post<unknown>("/deals", body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Deal created",
        data: response.data,
      }, null, 2),
    }],
  };
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

  const response = await client.patch<unknown>(`/deals/${id}`, body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Deal ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
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

  const response = await client.get<{ items?: unknown[] }>("/deals/search", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Search results for "${params.term}"`,
        data: response.data,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Delete a deal
 */
export async function deleteDeal(params: DeleteDealParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/deals/${params.id}`);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Deal ${params.id} deleted (will be permanently removed after 30 days)`,
        data: response.data,
      }, null, 2),
    }],
  };
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
        include_fields: { type: "string", description: "Include additional data: deal_participants, products, followers, notes" },
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
        include_fields: { type: "string", description: "Include additional data: deal_participants, products, followers, notes" },
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
        add_time: { type: "string", description: "Creation time (RFC3339 format) - backdate the deal" },
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
    handler: deleteDeal,
    schema: DeleteDealSchema,
  },
];
