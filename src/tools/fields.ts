/**
 * Field metadata MCP tools for Pipedrive
 * All entity types (deal/person/organization/product/activity/project) use v2 API with cursor pagination.
 */

import { getClient } from "../client.js";
import {
  ListOrganizationFieldsSchema,
  ListDealFieldsSchema,
  ListPersonFieldsSchema,
  ListProductFieldsSchema,
  ListProjectFieldsSchema,
  GetFieldSchema,
  CreateDealFieldSchema,
  UpdateDealFieldSchema,
  DeleteDealFieldSchema,
  UpdateDealFieldOptionsSchema,
  DeleteDealFieldOptionsSchema,
  CreatePersonFieldSchema,
  UpdatePersonFieldSchema,
  DeletePersonFieldSchema,
  UpdatePersonFieldOptionsSchema,
  DeletePersonFieldOptionsSchema,
  CreateOrganizationFieldSchema,
  UpdateOrganizationFieldSchema,
  DeleteOrganizationFieldSchema,
  UpdateOrganizationFieldOptionsSchema,
  DeleteOrganizationFieldOptionsSchema,
  CreateProductFieldSchema,
  UpdateProductFieldSchema,
  DeleteProductFieldSchema,
  UpdateProductFieldOptionsSchema,
  DeleteProductFieldOptionsSchema,
  type ListOrganizationFieldsParams,
  type ListDealFieldsParams,
  type ListPersonFieldsParams,
  type ListProductFieldsParams,
  type ListProjectFieldsParams,
  type GetFieldParams,
  type CreateDealFieldParams,
  type UpdateDealFieldParams,
  type DeleteDealFieldParams,
  type UpdateDealFieldOptionsParams,
  type DeleteDealFieldOptionsParams,
  type CreatePersonFieldParams,
  type UpdatePersonFieldParams,
  type DeletePersonFieldParams,
  type UpdatePersonFieldOptionsParams,
  type DeletePersonFieldOptionsParams,
  type CreateOrganizationFieldParams,
  type UpdateOrganizationFieldParams,
  type DeleteOrganizationFieldParams,
  type UpdateOrganizationFieldOptionsParams,
  type DeleteOrganizationFieldOptionsParams,
  type CreateProductFieldParams,
  type UpdateProductFieldParams,
  type DeleteProductFieldParams,
  type UpdateProductFieldOptionsParams,
  type DeleteProductFieldOptionsParams,
} from "../schemas/fields.js";
import {
  buildPaginationParamsV2,
  extractPaginationV2,
} from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

// ─── U3: Field write shared helpers ───────────────────────────────────────────

/** Loose shape of a field create body (per-entity params are structurally assignable). */
type FieldCreateInput = {
  field_name: string;
  field_type: string;
  options?: unknown;
  ui_visibility?: unknown;
  important_fields?: unknown;
  required_fields?: unknown;
  description?: unknown;
};

/** Loose shape of a field update body (field_code is threaded separately). */
type FieldUpdateInput = {
  field_name?: unknown;
  ui_visibility?: unknown;
  important_fields?: unknown;
  required_fields?: unknown;
  description?: unknown;
};

/** Builds the create request body, copying only the fields actually supplied. */
function buildFieldCreateBody(params: FieldCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    field_name: params.field_name,
    field_type: params.field_type,
  };
  if (params.options !== undefined) body.options = params.options;
  if (params.ui_visibility !== undefined) body.ui_visibility = params.ui_visibility;
  if (params.important_fields !== undefined) body.important_fields = params.important_fields;
  if (params.required_fields !== undefined) body.required_fields = params.required_fields;
  if (params.description !== undefined) body.description = params.description;
  return body;
}

/** Builds the update request body (sparse), copying only the fields actually supplied. */
function buildFieldUpdateBody(params: FieldUpdateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (params.field_name !== undefined) body.field_name = params.field_name;
  if (params.ui_visibility !== undefined) body.ui_visibility = params.ui_visibility;
  if (params.important_fields !== undefined) body.important_fields = params.important_fields;
  if (params.required_fields !== undefined) body.required_fields = params.required_fields;
  if (params.description !== undefined) body.description = params.description;
  return body;
}

/** Standard write-handler result envelope. */
function fieldWriteResult(summary: string, data: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ summary, data }, null, 2),
    }],
  };
}

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
 * List product fields
 */
export async function listProductFields(params: ListProductFieldsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);

  const response = await client.get<unknown[]>("/productFields", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const fields = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("product field", fields.length, pagination.has_more),
        data: fields,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * List project fields
 */
export async function listProjectFields(params: ListProjectFieldsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>("/projectFields", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const fields = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("project field", fields.length, pagination.has_more),
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

// ─── U3: Deal field write handlers ────────────────────────────────────────────

/** Create a deal custom field. Response data.field_code is the 40-char hash to keep for later updates. */
export async function createDealField(params: CreateDealFieldParams) {
  const client = getClient();
  const response = await client.post<unknown>("/dealFields", buildFieldCreateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult("Deal field created", response.data);
}

/** Update a deal custom field by field_code. */
export async function updateDealField(params: UpdateDealFieldParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/dealFields/${params.field_code}`, buildFieldUpdateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Deal field ${params.field_code} updated`, response.data);
}

/** Delete a deal custom field by field_code. */
export async function deleteDealField(params: DeleteDealFieldParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const response = await client.delete<unknown>(`/dealFields/${params.field_code}`, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Deal field ${params.field_code} deleted`, response.data);
}

/** Bulk-update option labels of a deal enum/set field. */
export async function updateDealFieldOptions(params: UpdateDealFieldOptionsParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/dealFields/${params.field_code}/options`, params.options, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Deal field ${params.field_code} options updated`, response.data);
}

/** Bulk-delete options of a deal enum/set field (atomic; fails if any ID is missing). */
export async function deleteDealFieldOptions(params: DeleteDealFieldOptionsParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const body = params.option_ids.map((id) => ({ id }));
  const response = await client.delete<unknown>(`/dealFields/${params.field_code}/options`, "v2", body);
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Deal field ${params.field_code} options deleted`, response.data);
}

// ─── U3: Person field write handlers ──────────────────────────────────────────

/** Create a person custom field. */
export async function createPersonField(params: CreatePersonFieldParams) {
  const client = getClient();
  const response = await client.post<unknown>("/personFields", buildFieldCreateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult("Person field created", response.data);
}

/** Update a person custom field by field_code. */
export async function updatePersonField(params: UpdatePersonFieldParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/personFields/${params.field_code}`, buildFieldUpdateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Person field ${params.field_code} updated`, response.data);
}

/** Delete a person custom field by field_code. */
export async function deletePersonField(params: DeletePersonFieldParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const response = await client.delete<unknown>(`/personFields/${params.field_code}`, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Person field ${params.field_code} deleted`, response.data);
}

/** Bulk-update option labels of a person enum/set field. */
export async function updatePersonFieldOptions(params: UpdatePersonFieldOptionsParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/personFields/${params.field_code}/options`, params.options, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Person field ${params.field_code} options updated`, response.data);
}

/** Bulk-delete options of a person enum/set field (atomic; fails if any ID is missing). */
export async function deletePersonFieldOptions(params: DeletePersonFieldOptionsParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const body = params.option_ids.map((id) => ({ id }));
  const response = await client.delete<unknown>(`/personFields/${params.field_code}/options`, "v2", body);
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Person field ${params.field_code} options deleted`, response.data);
}

// ─── U3: Organization field write handlers ────────────────────────────────────

/** Create an organization custom field. */
export async function createOrganizationField(params: CreateOrganizationFieldParams) {
  const client = getClient();
  const response = await client.post<unknown>("/organizationFields", buildFieldCreateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult("Organization field created", response.data);
}

/** Update an organization custom field by field_code. */
export async function updateOrganizationField(params: UpdateOrganizationFieldParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/organizationFields/${params.field_code}`, buildFieldUpdateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Organization field ${params.field_code} updated`, response.data);
}

/** Delete an organization custom field by field_code. */
export async function deleteOrganizationField(params: DeleteOrganizationFieldParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const response = await client.delete<unknown>(`/organizationFields/${params.field_code}`, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Organization field ${params.field_code} deleted`, response.data);
}

/** Bulk-update option labels of an organization enum/set field. */
export async function updateOrganizationFieldOptions(params: UpdateOrganizationFieldOptionsParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/organizationFields/${params.field_code}/options`, params.options, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Organization field ${params.field_code} options updated`, response.data);
}

/** Bulk-delete options of an organization enum/set field (atomic; fails if any ID is missing). */
export async function deleteOrganizationFieldOptions(params: DeleteOrganizationFieldOptionsParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const body = params.option_ids.map((id) => ({ id }));
  const response = await client.delete<unknown>(`/organizationFields/${params.field_code}/options`, "v2", body);
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Organization field ${params.field_code} options deleted`, response.data);
}

// ─── U4: Product field write handlers ─────────────────────────────────────────
// Product fields use the same handler shape as U3, but the narrower product
// schema (no description / important_fields / required_fields) is enforced at the
// Zod layer, so the shared body builders only ever copy product-valid keys.

/** Create a product custom field. */
export async function createProductField(params: CreateProductFieldParams) {
  const client = getClient();
  const response = await client.post<unknown>("/productFields", buildFieldCreateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult("Product field created", response.data);
}

/** Update a product custom field by field_code (only field_name and ui_visibility are accepted). */
export async function updateProductField(params: UpdateProductFieldParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/productFields/${params.field_code}`, buildFieldUpdateBody(params), "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Product field ${params.field_code} updated`, response.data);
}

/** Delete a product custom field by field_code. */
export async function deleteProductField(params: DeleteProductFieldParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const response = await client.delete<unknown>(`/productFields/${params.field_code}`, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Product field ${params.field_code} deleted`, response.data);
}

/** Bulk-update option labels of a product enum/set field. */
export async function updateProductFieldOptions(params: UpdateProductFieldOptionsParams) {
  const client = getClient();
  const response = await client.patch<unknown>(`/productFields/${params.field_code}/options`, params.options, "v2");
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Product field ${params.field_code} options updated`, response.data);
}

/** Bulk-delete options of a product enum/set field (atomic; fails if any ID is missing). */
export async function deleteProductFieldOptions(params: DeleteProductFieldOptionsParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;
  const client = getClient();
  const body = params.option_ids.map((id) => ({ id }));
  const response = await client.delete<unknown>(`/productFields/${params.field_code}/options`, "v2", body);
  if (!response.success || !response.data) return mcpErrorResult(response);
  return fieldWriteResult(`Product field ${params.field_code} options deleted`, response.data);
}

// ─── Shared inputSchema fragments for field write tools ───────────────────────

const FIELD_TYPE_PROP = {
  type: "string",
  enum: [
    "varchar", "text", "double", "phone", "date", "daterange", "time",
    "timerange", "set", "enum", "varchar_auto", "address", "monetary",
    "org", "people", "user",
  ],
  description: "Field type. Use 'enum' (single choice) or 'set' (multiple choice) for option fields.",
} as const;

const FIELD_OPTIONS_PROP = {
  type: "array",
  description: "Field options (required for enum and set field types)",
  items: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
} as const;

const FIELD_CODE_PROP = {
  type: "string",
  description: "The field_code (40-char hash for custom fields) from the field create/list response. NOT the human field name.",
} as const;

const OPTIONS_UPDATE_PROP = {
  type: "array",
  description: "Options to update (at least one). Atomic: the whole request fails if any option ID does not exist.",
  items: { type: "object", properties: { id: { type: "number" }, label: { type: "string" } }, required: ["id", "label"] },
} as const;

const OPTION_IDS_PROP = {
  type: "array",
  items: { type: "number" },
  description: "IDs of the options to delete (at least one). Atomic: the whole request fails if any ID does not exist.",
} as const;

const UI_VISIBILITY_DEAL = { type: "object", description: "UI visibility: add_visible_flag, details_visible_flag, projects_detail_visible_flag, show_in_pipelines{show_in_all, pipeline_ids}." } as const;
const UI_VISIBILITY_PERSON = { type: "object", description: "UI visibility: add_visible_flag, details_visible_flag, show_in_add_deal_dialog{show, order}." } as const;
const UI_VISIBILITY_ORG = { type: "object", description: "UI visibility: add_visible_flag, details_visible_flag, show_in_add_deal_dialog{show, order}, show_in_add_person_dialog{show, order}." } as const;
const UI_VISIBILITY_PRODUCT = { type: "object", description: "UI visibility (product fields use a simpler model): add_visible_flag, details_visible_flag." } as const;
const IMPORTANT_FIELDS_PROP = { type: "object", description: "Important-field highlighting: enabled, stage_ids (always references DEAL stages, even on person/org fields)." } as const;
const REQUIRED_FIELDS_DEAL = { type: "object", description: "Required-field config: enabled, stage_ids (deal stages), statuses (per-pipeline won/lost map)." } as const;
const REQUIRED_FIELDS_SIMPLE = { type: "object", description: "Required-field config: enabled (person/org fields support only this flag)." } as const;
const FIELD_DESCRIPTION_PROP = { type: "string", description: "Field description" } as const;

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
    name: "pipedrive_list_product_fields",
    description: "List all product field definitions, including custom fields.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100)" },
        include_fields: {
          type: "string",
          enum: ["ui_visibility"],
          description: "Additional data namespaces to include (ui_visibility)",
        },
      },
    },
    handler: listProductFields,
    schema: ListProductFieldsSchema,
  },
  {
    name: "pipedrive_list_project_fields",
    description: "List all project field definitions, including custom fields. (Projects add-on; Projects API in public beta.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
    },
    handler: listProjectFields,
    schema: ListProjectFieldsSchema,
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
  // ── U3: Deal field write tools ──
  {
    name: "pipedrive_create_deal_field",
    description: "Create a deal custom field. field_name and field_type are required. For enum/set types, options is required. The response data.field_code is the 40-char hash you must keep to update or delete the field later.",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_name: { type: "string", description: "Field name (required, 1-255 chars)" },
        field_type: FIELD_TYPE_PROP,
        options: FIELD_OPTIONS_PROP,
        ui_visibility: UI_VISIBILITY_DEAL,
        important_fields: IMPORTANT_FIELDS_PROP,
        required_fields: REQUIRED_FIELDS_DEAL,
        description: FIELD_DESCRIPTION_PROP,
      },
      required: ["field_name", "field_type"],
    },
    handler: createDealField,
    schema: CreateDealFieldSchema,
  },
  {
    name: "pipedrive_update_deal_field",
    description: "Update a deal custom field by field_code. field_type and field_code cannot be changed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_code: FIELD_CODE_PROP,
        field_name: { type: "string", description: "New field name (1-255 chars)" },
        ui_visibility: UI_VISIBILITY_DEAL,
        important_fields: IMPORTANT_FIELDS_PROP,
        required_fields: REQUIRED_FIELDS_DEAL,
        description: FIELD_DESCRIPTION_PROP,
      },
      required: ["field_code"],
    },
    handler: updateDealField,
    schema: UpdateDealFieldSchema,
  },
  {
    name: "pipedrive_delete_deal_field",
    description: "Delete a deal custom field by field_code. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP },
      required: ["field_code"],
    },
    handler: deleteDealField,
    schema: DeleteDealFieldSchema,
  },
  {
    name: "pipedrive_update_deal_field_options",
    description: "Bulk-update option labels of a deal enum/set field. Atomic: the whole request fails if any option ID does not exist.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, options: OPTIONS_UPDATE_PROP },
      required: ["field_code", "options"],
    },
    handler: updateDealFieldOptions,
    schema: UpdateDealFieldOptionsSchema,
  },
  {
    name: "pipedrive_delete_deal_field_options",
    description: "Bulk-delete options of a deal enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, option_ids: OPTION_IDS_PROP },
      required: ["field_code", "option_ids"],
    },
    handler: deleteDealFieldOptions,
    schema: DeleteDealFieldOptionsSchema,
  },
  // ── U3: Person field write tools ──
  {
    name: "pipedrive_create_person_field",
    description: "Create a person custom field. field_name and field_type are required. For enum/set types, options is required. The response data.field_code is the 40-char hash to keep for later updates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_name: { type: "string", description: "Field name (required, 1-255 chars)" },
        field_type: FIELD_TYPE_PROP,
        options: FIELD_OPTIONS_PROP,
        ui_visibility: UI_VISIBILITY_PERSON,
        important_fields: IMPORTANT_FIELDS_PROP,
        required_fields: REQUIRED_FIELDS_SIMPLE,
      },
      required: ["field_name", "field_type"],
    },
    handler: createPersonField,
    schema: CreatePersonFieldSchema,
  },
  {
    name: "pipedrive_update_person_field",
    description: "Update a person custom field by field_code. field_type and field_code cannot be changed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_code: FIELD_CODE_PROP,
        field_name: { type: "string", description: "New field name (1-255 chars)" },
        ui_visibility: UI_VISIBILITY_PERSON,
        important_fields: IMPORTANT_FIELDS_PROP,
        required_fields: REQUIRED_FIELDS_SIMPLE,
      },
      required: ["field_code"],
    },
    handler: updatePersonField,
    schema: UpdatePersonFieldSchema,
  },
  {
    name: "pipedrive_delete_person_field",
    description: "Delete a person custom field by field_code. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP },
      required: ["field_code"],
    },
    handler: deletePersonField,
    schema: DeletePersonFieldSchema,
  },
  {
    name: "pipedrive_update_person_field_options",
    description: "Bulk-update option labels of a person enum/set field. Atomic: the whole request fails if any option ID does not exist.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, options: OPTIONS_UPDATE_PROP },
      required: ["field_code", "options"],
    },
    handler: updatePersonFieldOptions,
    schema: UpdatePersonFieldOptionsSchema,
  },
  {
    name: "pipedrive_delete_person_field_options",
    description: "Bulk-delete options of a person enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, option_ids: OPTION_IDS_PROP },
      required: ["field_code", "option_ids"],
    },
    handler: deletePersonFieldOptions,
    schema: DeletePersonFieldOptionsSchema,
  },
  // ── U3: Organization field write tools ──
  {
    name: "pipedrive_create_organization_field",
    description: "Create an organization custom field. field_name and field_type are required. For enum/set types, options is required. The response data.field_code is the 40-char hash to keep for later updates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_name: { type: "string", description: "Field name (required, 1-255 chars)" },
        field_type: FIELD_TYPE_PROP,
        options: FIELD_OPTIONS_PROP,
        ui_visibility: UI_VISIBILITY_ORG,
        important_fields: IMPORTANT_FIELDS_PROP,
        required_fields: REQUIRED_FIELDS_SIMPLE,
      },
      required: ["field_name", "field_type"],
    },
    handler: createOrganizationField,
    schema: CreateOrganizationFieldSchema,
  },
  {
    name: "pipedrive_update_organization_field",
    description: "Update an organization custom field by field_code. field_type and field_code cannot be changed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_code: FIELD_CODE_PROP,
        field_name: { type: "string", description: "New field name (1-255 chars)" },
        ui_visibility: UI_VISIBILITY_ORG,
        important_fields: IMPORTANT_FIELDS_PROP,
        required_fields: REQUIRED_FIELDS_SIMPLE,
      },
      required: ["field_code"],
    },
    handler: updateOrganizationField,
    schema: UpdateOrganizationFieldSchema,
  },
  {
    name: "pipedrive_delete_organization_field",
    description: "Delete an organization custom field by field_code. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP },
      required: ["field_code"],
    },
    handler: deleteOrganizationField,
    schema: DeleteOrganizationFieldSchema,
  },
  {
    name: "pipedrive_update_organization_field_options",
    description: "Bulk-update option labels of an organization enum/set field. Atomic: the whole request fails if any option ID does not exist.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, options: OPTIONS_UPDATE_PROP },
      required: ["field_code", "options"],
    },
    handler: updateOrganizationFieldOptions,
    schema: UpdateOrganizationFieldOptionsSchema,
  },
  {
    name: "pipedrive_delete_organization_field_options",
    description: "Bulk-delete options of an organization enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, option_ids: OPTION_IDS_PROP },
      required: ["field_code", "option_ids"],
    },
    handler: deleteOrganizationFieldOptions,
    schema: DeleteOrganizationFieldOptionsSchema,
  },
  // ── U4: Product field write tools ──
  {
    name: "pipedrive_create_product_field",
    description: "Create a product custom field. field_name and field_type are required. For enum/set types, options is required. Product fields use a simpler model: no description, important_fields, or required_fields. The response data.field_code is the 40-char hash to keep for later updates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_name: { type: "string", description: "Field name (required, 1-255 chars)" },
        field_type: FIELD_TYPE_PROP,
        options: FIELD_OPTIONS_PROP,
        ui_visibility: UI_VISIBILITY_PRODUCT,
      },
      required: ["field_name", "field_type"],
    },
    handler: createProductField,
    schema: CreateProductFieldSchema,
  },
  {
    name: "pipedrive_update_product_field",
    description: "Update a product custom field by field_code. Only field_name and ui_visibility can be changed (product fields have no description/important_fields/required_fields).",
    inputSchema: {
      type: "object" as const,
      properties: {
        field_code: FIELD_CODE_PROP,
        field_name: { type: "string", description: "New field name (1-255 chars)" },
        ui_visibility: UI_VISIBILITY_PRODUCT,
      },
      required: ["field_code"],
    },
    handler: updateProductField,
    schema: UpdateProductFieldSchema,
  },
  {
    name: "pipedrive_delete_product_field",
    description: "Delete a product custom field by field_code. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP },
      required: ["field_code"],
    },
    handler: deleteProductField,
    schema: DeleteProductFieldSchema,
  },
  {
    name: "pipedrive_update_product_field_options",
    description: "Bulk-update option labels of a product enum/set field. Atomic: the whole request fails if any option ID does not exist.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, options: OPTIONS_UPDATE_PROP },
      required: ["field_code", "options"],
    },
    handler: updateProductFieldOptions,
    schema: UpdateProductFieldOptionsSchema,
  },
  {
    name: "pipedrive_delete_product_field_options",
    description: "Bulk-delete options of a product enum/set field. Atomic: fails if any ID does not exist. Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.",
    inputSchema: {
      type: "object" as const,
      properties: { field_code: FIELD_CODE_PROP, option_ids: OPTION_IDS_PROP },
      required: ["field_code", "option_ids"],
    },
    handler: deleteProductFieldOptions,
    schema: DeleteProductFieldOptionsSchema,
  },
];
