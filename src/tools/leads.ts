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
  ConvertLeadToDealSchema,
  GetLeadConversionStatusSchema,
  type ListLeadsParams,
  type ListArchivedLeadsParams,
  type GetLeadParams,
  type CreateLeadParams,
  type UpdateLeadParams,
  type DeleteLeadParams,
  type SearchLeadsParams,
  type ConvertLeadToDealParams,
  type GetLeadConversionStatusParams,
} from "../schemas/leads.js";
import { PathSegmentSchema } from "../schemas/common.js";
import { buildPaginationParamsV1, extractPaginationV1, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, mcpErrorFromCode, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

/**
 * Exponential backoff schedule for polling the async lead-to-deal conversion.
 * One sleep is performed BEFORE each status poll. The sum (~31.5s) enforces the
 * ~30 second cap from issue #13: once these delays are exhausted we stop polling.
 */
export const BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16000];

/** Sleep helper, injectable so tests can supply a no-op (zero real delay). */
export type SleepFn = (ms: number) => Promise<void>;
const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  return formatToolResponse({
    summary: createListSummary("lead", leads.length, pagination.has_more),
    data: leads,
    pagination,
  });
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

  return formatToolResponse({
    summary: createListSummary("lead", leads.length, pagination.has_more),
    data: leads,
    pagination,
  });
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

  return formatToolResponse({
    summary: `Lead ${params.id}`,
    data: response.data,
  });
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

  return formatToolResponse({
    summary: "Lead created",
    data: response.data,
  });
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

  return formatToolResponse({
    summary: `Lead ${id} updated`,
    data: response.data,
  });
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

  return formatToolResponse({
    summary: `Lead ${params.id} deleted`,
    data: response.data,
  });
}

/**
 * Search leads using the v2 search endpoint
 */
export async function searchLeads(params: SearchLeadsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.organization_id) queryParams.set("organization_id", String(params.organization_id));
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/leads/search", queryParams, "v2");

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
 * Convert a lead to a deal (v2). The conversion is asynchronous:
 *  1. POST /leads/{id}/convert/deal returns a { conversion_id }
 *  2. Poll GET /leads/{id}/convert/status/{conversion_id} with exponential
 *     backoff until status is "completed" or "failed".
 * On success returns the created deal id. On failure returns an error result.
 * If still running after the ~30s backoff cap is exhausted, returns the
 * conversion_id + last status (non-error) so the caller can check later.
 *
 * The `sleep` parameter is injectable purely for testing (defaults to a real timer).
 */
export async function convertLeadToDeal(
  params: ConvertLeadToDealParams,
  sleep: SleepFn = realSleep,
) {
  const client = getClient();

  const convertBody: Record<string, unknown> = {};
  if (params.stage_id) convertBody.stage_id = params.stage_id;
  if (params.pipeline_id) convertBody.pipeline_id = params.pipeline_id;

  // 1. Kick off the async conversion.
  const startResponse = await client.post<{ conversion_id?: string }>(
    `/leads/${params.id}/convert/deal`,
    convertBody,
    "v2",
  );

  if (!startResponse.success || !startResponse.data) {
    return mcpErrorResult(startResponse);
  }

  const conversionId = startResponse.data.conversion_id;
  if (!conversionId) {
    return mcpErrorFromCode(
      "API_ERROR",
      "Conversion did not return a conversion_id",
      "Retry the conversion or check the lead in Pipedrive",
    );
  }

  // The conversion_id is API-response-sourced and is interpolated into the status
  // polling path below. Validate it against the path-safe allowlist before it can
  // shape a URL, so a malformed or hostile value returned by the backend cannot
  // redirect the request to a different endpoint (F2/KTD4).
  const conversionIdCheck = PathSegmentSchema.safeParse(conversionId);
  if (!conversionIdCheck.success) {
    return mcpErrorFromCode(
      "API_ERROR",
      "Conversion returned a malformed conversion_id",
      "Retry the conversion or check the lead in Pipedrive",
    );
  }
  const safeConversionId = conversionIdCheck.data;

  // 2. Poll for completion with exponential backoff.
  let lastStatus = "not_started";
  let lastData: Record<string, unknown> | undefined;

  for (const delay of BACKOFF_DELAYS_MS) {
    await sleep(delay);

    const statusResponse = await client.get<Record<string, unknown>>(
      `/leads/${params.id}/convert/status/${safeConversionId}`,
      undefined,
      "v2",
    );

    if (!statusResponse.success || !statusResponse.data) {
      return mcpErrorResult(statusResponse);
    }

    lastData = statusResponse.data;
    lastStatus = String(statusResponse.data.status ?? lastStatus);

    if (lastStatus === "completed") {
      const dealId = lastData.deal_id;
      return formatToolResponse({
        summary: `Lead ${params.id} converted to deal ${dealId}`,
        data: {
          lead_id: params.id,
          deal_id: dealId,
          conversion_id: conversionId,
          status: lastStatus,
        },
      });
    }

    if (lastStatus === "failed" || lastStatus === "rejected") {
      return mcpErrorFromCode(
        "API_ERROR",
        `Lead conversion ${conversionId} ${lastStatus}`,
        "Check the lead's data in Pipedrive and retry the conversion",
      );
    }
    // Otherwise status is pending/running/not_started: loop and back off again.
  }

  // 3. Timeout: still running after the backoff cap was exhausted.
  return formatToolResponse({
    summary: `Lead ${params.id} conversion still in progress after timeout`,
    data: {
      lead_id: params.id,
      conversion_id: conversionId,
      status: lastStatus,
      note: "Conversion did not complete within the polling window. Use the conversion_id to check status later.",
    },
  });
}

/**
 * Get the status of an async lead-to-deal conversion (v2).
 */
export async function getLeadConversionStatus(params: GetLeadConversionStatusParams) {
  const client = getClient();
  const response = await client.get<Record<string, unknown>>(
    `/leads/${params.id}/convert/status/${params.conversion_id}`,
    undefined,
    "v2",
  );
  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }
  return formatToolResponse({
    summary: `Conversion ${params.conversion_id} status: ${String(response.data.status ?? "unknown")}`,
    data: response.data,
  });
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
        fields: { type: "string", description: "Comma-separated fields to search (title, notes, custom_fields). Defaults to all." },
        person_id: { type: "number", description: "Filter by linked person ID" },
        organization_id: { type: "number", description: "Filter by linked organization ID" },
        include_fields: { type: "string", enum: ["lead.was_seen"], description: "Optional extra field: only 'lead.was_seen'" },
        exact_match: { type: "boolean", description: "Use exact match instead of fuzzy search" },
        limit: { type: "number", description: "Number of results (1-500, default 50)" },
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
    destructive: true,
    handler: deleteLead,
    schema: DeleteLeadSchema,
  },
  {
    name: "pipedrive_convert_lead_to_deal",
    description: "Convert a lead into a deal (Pipedrive v2). The conversion runs asynchronously; this tool polls until it completes (typically under 5s) and returns the new deal ID. If it is still running after ~30s, it returns the conversion_id and status for manual follow-up.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Lead UUID to convert" },
        stage_id: { type: "number", description: "Stage ID for the created deal (pipeline inferred from stage)" },
        pipeline_id: { type: "number", description: "Pipeline ID for the created deal (ignored if stage_id is given)" },
      },
      required: ["id"],
    },
    handler: convertLeadToDeal,
    schema: ConvertLeadToDealSchema,
  },
  {
    name: "pipedrive_get_lead_conversion_status",
    description: "Get the status of an async lead-to-deal conversion by conversion ID (Pipedrive v2 GET /leads/{id}/convert/status/{conversion_id}).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Lead UUID" },
        conversion_id: { type: "string", description: "Conversion job UUID returned by the convert call" },
      },
      required: ["id", "conversion_id"],
    },
    handler: getLeadConversionStatus,
    schema: GetLeadConversionStatusSchema,
  },
];
