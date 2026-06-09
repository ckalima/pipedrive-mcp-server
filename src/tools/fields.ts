/**
 * Field metadata MCP tools for Pipedrive
 * All entity types (deal/person/organization/product/activity/project) use v2 API with cursor pagination.
 */

import { getClient } from "../client.js";
import {
  ListOrganizationFieldsSchema,
  ListDealFieldsSchema,
  ListPersonFieldsSchema,
  GetFieldSchema,
  type ListOrganizationFieldsParams,
  type ListDealFieldsParams,
  type ListPersonFieldsParams,
  type GetFieldParams,
} from "../schemas/fields.js";
import {
  buildPaginationParamsV2,
  extractPaginationV2,
} from "../utils/pagination.js";
import { mcpErrorResult } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

/**
 * List organization fields
 */
export async function listOrganizationFields(params: ListOrganizationFieldsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>("/organizationFields", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const fields = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("organization field", fields.length, pagination.has_more),
        data: fields,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * List deal fields
 */
export async function listDealFields(params: ListDealFieldsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>("/dealFields", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const fields = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("deal field", fields.length, pagination.has_more),
        data: fields,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * List person fields
 */
export async function listPersonFields(params: ListPersonFieldsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>("/personFields", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const fields = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("person field", fields.length, pagination.has_more),
        data: fields,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Get a single field by key — paginates v2 field pages to find the field.
 * v2 field-list responses key each field on `field_code` (not `key`), so we
 * match on `field_code` first and fall back to the legacy `key` for safety (#60).
 * All entity types use the v2 endpoint.
 */
export async function getField(params: GetFieldParams) {
  const client = getClient();

  // Map entity type to endpoint
  const endpointMap: Record<string, string> = {
    organization: "/organizationFields",
    deal: "/dealFields",
    person: "/personFields",
    product: "/productFields",
    activity: "/activityFields",
    project: "/projectFields",
  };

  const endpoint = endpointMap[params.entity_type];
  if (!endpoint) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: Unknown entity type "${params.entity_type}". Valid types: organization, deal, person, product, activity, project`,
      }],
    };
  }

  // Paginate through all pages (v2 cursor) until the field is found or pages are exhausted.
  let cursor: string | undefined;
  let field: { field_code?: string; key?: string; [k: string]: unknown } | undefined;

  do {
    const queryParams = buildPaginationParamsV2(cursor);

    const response = await client.get<Array<{ field_code?: string; key?: string; [k: string]: unknown }>>(
      endpoint,
      queryParams,
      "v2"
    );

    if (!response.success || !response.data) {
      return mcpErrorResult(response);
    }

    // v2 keys each field on `field_code`; fall back to legacy `key` for safety (#60).
    field = response.data.find(f => f.field_code === params.key || f.key === params.key);

    const pagination = extractPaginationV2(response);
    cursor = pagination.has_more ? pagination.next_cursor : undefined;
  } while (!field && cursor);

  if (!field) {
    return {
      content: [{
        type: "text" as const,
        text: `Field not found: ${params.key} in ${params.entity_type} fields`,
      }],
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Field: ${params.key}`,
        data: field,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const fieldTools = [
  {
    name: "pipedrive_list_organization_fields",
    description: "List all organization field definitions, including custom fields. Use this to map 40-character field keys to human-readable names.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
    },
    handler: listOrganizationFields,
    schema: ListOrganizationFieldsSchema,
  },
  {
    name: "pipedrive_list_deal_fields",
    description: "List all deal field definitions, including custom fields. Essential for understanding deal data structure.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
    },
    handler: listDealFields,
    schema: ListDealFieldsSchema,
  },
  {
    name: "pipedrive_list_person_fields",
    description: "List all person field definitions, including custom fields. Use to understand contact data structure.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
    },
    handler: listPersonFields,
    schema: ListPersonFieldsSchema,
  },
  {
    name: "pipedrive_get_field",
    description: "Get details of a specific field by its key. Useful for looking up what a 40-character hash field key means.",
    inputSchema: {
      type: "object" as const,
      properties: {
        entity_type: {
          type: "string",
          enum: ["organization", "deal", "person", "product", "activity", "project"],
          description: "Entity type the field belongs to",
        },
        key: { type: "string", description: "Field key (40-char hash for custom fields)" },
      },
      required: ["entity_type", "key"],
    },
    handler: getField,
    schema: GetFieldSchema,
  },
];
