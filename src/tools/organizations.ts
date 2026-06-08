/**
 * Organization-related MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListOrganizationsSchema,
  GetOrganizationSchema,
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  SearchOrganizationsSchema,
  DeleteOrganizationSchema,
  type ListOrganizationsParams,
  type GetOrganizationParams,
  type CreateOrganizationParams,
  type UpdateOrganizationParams,
  type SearchOrganizationsParams,
  type DeleteOrganizationParams,
} from "../schemas/organizations.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

/**
 * List organizations with optional filtering
 */
export async function listOrganizations(params: ListOrganizationsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.ids) queryParams.set("ids", params.ids);
  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.first_char) queryParams.set("first_char", params.first_char);
  if (params.updated_since) queryParams.set("updated_since", params.updated_since);
  if (params.updated_until) queryParams.set("updated_until", params.updated_until);
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown[]>("/organizations", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const orgs = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("organization", orgs.length, pagination.has_more),
        data: orgs,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Get a single organization by ID
 */
export async function getOrganization(params: GetOrganizationParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown>(
    `/organizations/${params.id}`,
    queryParams.toString() ? queryParams : undefined
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Organization ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Create a new organization
 */
export async function createOrganization(params: CreateOrganizationParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    name: params.name,
  };

  if (params.owner_id) body.owner_id = params.owner_id;
  if (params.visible_to) body.visible_to = params.visible_to;
  if (params.address) body.address = params.address;
  if (params.label_ids) body.label_ids = params.label_ids;
  if (params.add_time) body.add_time = params.add_time;
  if (params.custom_fields) body.custom_fields = params.custom_fields;

  const response = await client.post<unknown>("/organizations", body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Organization created",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Update an existing organization
 */
export async function updateOrganization(params: UpdateOrganizationParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.name) body.name = updateFields.name;
  if (updateFields.owner_id) body.owner_id = updateFields.owner_id;
  if (updateFields.visible_to) body.visible_to = updateFields.visible_to;
  if (updateFields.address) body.address = updateFields.address;
  if (updateFields.label_ids) body.label_ids = updateFields.label_ids;
  if (updateFields.custom_fields) body.custom_fields = updateFields.custom_fields;

  const response = await client.patch<unknown>(`/organizations/${id}`, body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Organization ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Search organizations by name
 */
export async function searchOrganizations(params: SearchOrganizationsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/organizations/search", queryParams);

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
 * Delete an organization
 */
export async function deleteOrganization(params: DeleteOrganizationParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/organizations/${params.id}`);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Organization ${params.id} deleted (will be permanently removed after 30 days)`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const organizationTools = [
  {
    name: "pipedrive_list_organizations",
    description: "List organizations from Pipedrive with optional filtering by owner or first letter of name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        ids: { type: "string", description: "Comma-separated organization IDs to fetch (max 100)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        first_char: { type: "string", description: "Filter by first character of name" },
        updated_since: { type: "string", description: "Filter organizations updated after this time (RFC3339 format)" },
        updated_until: { type: "string", description: "Filter organizations updated before this time (RFC3339 format)" },
        sort_by: { type: "string", enum: ["id", "update_time", "add_time"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        include_fields: { type: "string", description: "Include additional data in response" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys or 'all')" },
      },
    },
    handler: listOrganizations,
    schema: ListOrganizationsSchema,
  },
  {
    name: "pipedrive_get_organization",
    description: "Get detailed information about a specific organization by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The organization ID" },
        include_fields: { type: "string", description: "Include additional data in response" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys or 'all')" },
      },
      required: ["id"],
    },
    handler: getOrganization,
    schema: GetOrganizationSchema,
  },
  {
    name: "pipedrive_create_organization",
    description: "Create a new organization in Pipedrive. Only name is required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Organization name (required)" },
        owner_id: { type: "number", description: "Owner user ID" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "Visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        address: {
          type: "object",
          description: "Organization address as a structured object (v2). Provide 'value' for the full address.",
          properties: {
            value: { type: "string", description: "The full address" },
            country: { type: "string", description: "Country" },
            admin_area_level_1: { type: "string", description: "Admin area level 1 (e.g. state)" },
            admin_area_level_2: { type: "string", description: "Admin area level 2 (e.g. county)" },
            locality: { type: "string", description: "Locality (e.g. city)" },
            sublocality: { type: "string", description: "Sublocality (e.g. neighborhood)" },
            route: { type: "string", description: "Route (e.g. street)" },
            street_number: { type: "string", description: "Street number" },
            subpremise: { type: "string", description: "Subpremise (e.g. apartment/suite number)" },
            postal_code: { type: "string", description: "Postal code" },
          },
        },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to attach to organization" },
        add_time: { type: "string", description: "Creation time (RFC3339 format) - backdate the organization" },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
      },
      required: ["name"],
    },
    handler: createOrganization,
    schema: CreateOrganizationSchema,
  },
  {
    name: "pipedrive_update_organization",
    description: "Update an existing organization in Pipedrive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Organization ID to update" },
        name: { type: "string", description: "New name" },
        owner_id: { type: "number", description: "New owner user ID" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "New visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        address: {
          type: "object",
          description: "New organization address as a structured object (v2). Provide 'value' for the full address.",
          properties: {
            value: { type: "string", description: "The full address" },
            country: { type: "string", description: "Country" },
            admin_area_level_1: { type: "string", description: "Admin area level 1 (e.g. state)" },
            admin_area_level_2: { type: "string", description: "Admin area level 2 (e.g. county)" },
            locality: { type: "string", description: "Locality (e.g. city)" },
            sublocality: { type: "string", description: "Sublocality (e.g. neighborhood)" },
            route: { type: "string", description: "Route (e.g. street)" },
            street_number: { type: "string", description: "Street number" },
            subpremise: { type: "string", description: "Subpremise (e.g. apartment/suite number)" },
            postal_code: { type: "string", description: "Postal code" },
          },
        },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to set on organization" },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
      },
      required: ["id"],
    },
    handler: updateOrganization,
    schema: UpdateOrganizationSchema,
  },
  {
    name: "pipedrive_search_organizations",
    description: "Search for organizations by name or address.",
    inputSchema: {
      type: "object" as const,
      properties: {
        term: { type: "string", description: "Search term" },
        fields: { type: "string", description: "Comma-separated fields to search (name, address, notes, custom_fields). Defaults to all." },
        exact_match: { type: "boolean", description: "Use exact match" },
        limit: { type: "number", description: "Number of results (1-100)" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
      },
      required: ["term"],
    },
    handler: searchOrganizations,
    schema: SearchOrganizationsSchema,
  },
  {
    name: "pipedrive_delete_organization",
    description: "Delete an organization. The organization will be marked as deleted and permanently removed after 30 days.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Organization ID to delete" },
      },
      required: ["id"],
    },
    handler: deleteOrganization,
    schema: DeleteOrganizationSchema,
  },
];
