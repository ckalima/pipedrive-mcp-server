/**
 * Lead-related MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListLeadsSchema,
  ListArchivedLeadsSchema,
  GetLeadSchema,
  CreateLeadSchema,
  UpdateLeadSchema,
  DeleteLeadSchema,
  SearchLeadsSchema,
  type ListLeadsParams,
  type ListArchivedLeadsParams,
  type GetLeadParams,
  type CreateLeadParams,
  type UpdateLeadParams,
  type DeleteLeadParams,
  type SearchLeadsParams,
} from "../schemas/leads.js";
import { buildPaginationParamsV1, extractPaginationV1 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

/**
 * List active (non-archived) leads with optional filtering
 */
export async function listLeads(params: ListLeadsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV1(params.start, params.limit);
  queryParams.set("archived_flag", "false");

  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.organization_id) queryParams.set("organization_id", String(params.organization_id));
  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.sort) queryParams.set("sort", params.sort);

  const response = await client.get<unknown[]>("/leads", queryParams, "v1");

  if (!response.success) {
    return mcpErrorResult(response);
  }

  const leads = response.data || [];
  const pagination = extractPaginationV1(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("lead", leads.length, pagination.has_more),
        data: leads,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * List archived leads with optional filtering
 */
export async function listArchivedLeads(params: ListArchivedLeadsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV1(params.start, params.limit);
  queryParams.set("archived_flag", "true");

  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.organization_id) queryParams.set("organization_id", String(params.organization_id));
  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.sort) queryParams.set("sort", params.sort);

  const response = await client.get<unknown[]>("/leads", queryParams, "v1");

  if (!response.success) {
    return mcpErrorResult(response);
  }

  const leads = response.data || [];
  const pagination = extractPaginationV1(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("lead", leads.length, pagination.has_more),
        data: leads,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Get a single lead by UUID
 */
export async function getLead(params: GetLeadParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/leads/${params.id}`, undefined, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Lead ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Create a new lead
 */
export async function createLead(params: CreateLeadParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    title: params.title,
  };

  if (params.person_id) body.person_id = params.person_id;
  if (params.organization_id) body.organization_id = params.organization_id;
  if (params.value) body.value = params.value;
  if (params.owner_id) body.owner_id = params.owner_id;
  if (params.label_ids) body.label_ids = params.label_ids;
  if (params.expected_close_date) body.expected_close_date = params.expected_close_date;
  if (params.visible_to) body.visible_to = params.visible_to;

  const response = await client.post<unknown>("/leads", body, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Lead created",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Update an existing lead
 */
export async function updateLead(params: UpdateLeadParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.title) body.title = updateFields.title;
  if (updateFields.person_id) body.person_id = updateFields.person_id;
  if (updateFields.organization_id) body.organization_id = updateFields.organization_id;
  if (updateFields.value) body.value = updateFields.value;
  if (updateFields.owner_id) body.owner_id = updateFields.owner_id;
  if (updateFields.label_ids) body.label_ids = updateFields.label_ids;
  if (updateFields.expected_close_date) body.expected_close_date = updateFields.expected_close_date;
  if (updateFields.visible_to) body.visible_to = updateFields.visible_to;
  if (updateFields.is_archived !== undefined) body.is_archived = updateFields.is_archived;

  const response = await client.patch<unknown>(`/leads/${id}`, body, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Lead ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Delete a lead (requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true)
 */
export async function deleteLead(params: DeleteLeadParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: string }>(`/leads/${params.id}`, "v1");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Lead ${params.id} deleted`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Search leads using the v2 search endpoint
 */
export async function searchLeads(params: SearchLeadsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);

  const response = await client.get<unknown>("/leads/search", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Search results for "${params.term}"`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const leadsTools = [
  {
    name: "pipedrive_list_leads",
    description: "List active (non-archived) leads from Pipedrive with optional filtering by owner, person, or organization.",
    inputSchema: {
      type: "object" as const,
      properties: {
        start: { type: "number", description: "Pagination offset (0-based)" },
        limit: { type: "number", description: "Number of items (1-500, default 50)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        person_id: { type: "number", description: "Filter by linked person ID" },
        organization_id: { type: "number", description: "Filter by linked organization ID" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        sort: { type: "string", description: "Sort field and direction (e.g. 'id ASC')" },
      },
    },
    handler: listLeads,
    schema: ListLeadsSchema,
  },
  {
    name: "pipedrive_list_archived_leads",
    description: "List archived leads from Pipedrive with optional filtering by owner, person, or organization.",
    inputSchema: {
      type: "object" as const,
      properties: {
        start: { type: "number", description: "Pagination offset (0-based)" },
        limit: { type: "number", description: "Number of items (1-500, default 50)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        person_id: { type: "number", description: "Filter by linked person ID" },
        organization_id: { type: "number", description: "Filter by linked organization ID" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        sort: { type: "string", description: "Sort field and direction (e.g. 'id ASC')" },
      },
    },
    handler: listArchivedLeads,
    schema: ListArchivedLeadsSchema,
  },
  {
    name: "pipedrive_get_lead",
    description: "Get detailed information about a specific lead by UUID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Lead UUID" },
      },
      required: ["id"],
    },
    handler: getLead,
    schema: GetLeadSchema,
  },
  {
    name: "pipedrive_create_lead",
    description: "Create a new lead in Pipedrive. Title is required; link to at least one of person_id or organization_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Lead title (required)" },
        person_id: { type: "number", description: "Link to person ID" },
        organization_id: { type: "number", description: "Link to organization ID" },
        value: {
          type: "object",
          properties: {
            amount: { type: "number", description: "Monetary amount (>= 0)" },
            currency: { type: "string", description: "3-letter currency code (e.g., USD)" },
          },
          required: ["amount"],
          description: "Monetary value of the lead",
        },
        owner_id: { type: "number", description: "Owner user ID" },
        label_ids: { type: "array", items: { type: "string" }, description: "Lead label UUIDs" },
        expected_close_date: { type: "string", description: "Expected close date (YYYY-MM-DD)" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "Visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
      },
      required: ["title"],
    },
    handler: createLead,
    schema: CreateLeadSchema,
  },
  {
    name: "pipedrive_update_lead",
    description: "Update an existing lead in Pipedrive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Lead UUID to update" },
        title: { type: "string", description: "New lead title" },
        person_id: { type: "number", description: "New linked person ID" },
        organization_id: { type: "number", description: "New linked organization ID" },
        value: {
          type: "object",
          properties: {
            amount: { type: "number", description: "Monetary amount (>= 0)" },
            currency: { type: "string", description: "3-letter currency code (e.g., USD)" },
          },
          required: ["amount"],
          description: "New monetary value",
        },
        owner_id: { type: "number", description: "New owner user ID" },
        label_ids: { type: "array", items: { type: "string" }, description: "New lead label UUIDs" },
        expected_close_date: { type: "string", description: "New expected close date (YYYY-MM-DD)" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "New visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        is_archived: { type: "boolean", description: "Archive or unarchive the lead" },
      },
      required: ["id"],
    },
    handler: updateLead,
    schema: UpdateLeadSchema,
  },
  {
    name: "pipedrive_search_leads",
    description: "Search for leads in Pipedrive by title or associated contacts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        term: { type: "string", description: "Search term (required)" },
        include_fields: { type: "string", description: "Comma-separated additional fields to include" },
        exact_match: { type: "boolean", description: "Use exact match instead of fuzzy search" },
        limit: { type: "number", description: "Number of results (1-100, default 50)" },
        cursor: { type: "string", description: "Cursor for pagination" },
      },
      required: ["term"],
    },
    handler: searchLeads,
    schema: SearchLeadsSchema,
  },
  {
    name: "pipedrive_delete_lead",
    description: "Delete a lead. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true environment variable.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Lead UUID to delete" },
      },
      required: ["id"],
    },
    handler: deleteLead,
    schema: DeleteLeadSchema,
  },
];
