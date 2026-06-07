/**
 * Pipeline and Stage MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListPipelinesSchema,
  ListStagesSchema,
  GetStageSchema,
  type ListPipelinesParams,
  type ListStagesParams,
  type GetStageParams,
} from "../schemas/pipelines.js";
import { mcpErrorResult } from "../utils/errors.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { createListSummary } from "../utils/formatting.js";

/**
 * List all pipelines
 */
export async function listPipelines(params: ListPipelinesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  // Uses v2 API for pipelines
  const response = await client.get<unknown[]>("/pipelines", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pipelines = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("pipeline", pipelines.length, pagination.has_more),
        data: pipelines,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * List stages, optionally filtered by pipeline
 */
export async function listStages(params: ListStagesParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  if (params.pipeline_id) {
    queryParams.set("pipeline_id", String(params.pipeline_id));
  }

  // Uses v1 API for stages
  const response = await client.get<unknown[]>(
    "/stages",
    queryParams.toString() ? queryParams : undefined,
    "v1"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const stages = response.data;

  const summary = params.pipeline_id
    ? `Found ${stages.length} stage${stages.length !== 1 ? "s" : ""} in pipeline ${params.pipeline_id}.`
    : `Found ${stages.length} stage${stages.length !== 1 ? "s" : ""}.`;

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary,
        data: stages,
      }, null, 2),
    }],
  };
}

/**
 * Get a single stage by ID
 */
export async function getStage(params: GetStageParams) {
  const client = getClient();

  const response = await client.get<unknown>(
    `/stages/${params.id}`,
    undefined,
    "v1"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Stage ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const pipelineTools = [
  {
    name: "pipedrive_list_pipelines",
    description: "List sales pipelines in Pipedrive with cursor pagination. Pipelines contain stages that deals move through.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
      },
    },
    handler: listPipelines,
    schema: ListPipelinesSchema,
  },
  {
    name: "pipedrive_list_stages",
    description: "List all stages, optionally filtered by pipeline. Stages represent steps in the sales process.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pipeline_id: { type: "number", description: "Filter by pipeline ID (returns all stages if not specified)" },
      },
    },
    handler: listStages,
    schema: ListStagesSchema,
  },
  {
    name: "pipedrive_get_stage",
    description: "Get details of a specific stage by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Stage ID" },
      },
      required: ["id"],
    },
    handler: getStage,
    schema: GetStageSchema,
  },
];
