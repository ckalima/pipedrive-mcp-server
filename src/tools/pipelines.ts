/**
 * Pipeline and Stage MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListPipelinesSchema,
  ListStagesSchema,
  GetStageSchema,
  CreatePipelineSchema,
  UpdatePipelineSchema,
  DeletePipelineSchema,
  CreateStageSchema,
  UpdateStageSchema,
  DeleteStageSchema,
  type ListPipelinesParams,
  type ListStagesParams,
  type GetStageParams,
  type CreatePipelineParams,
  type UpdatePipelineParams,
  type DeletePipelineParams,
  type CreateStageParams,
  type UpdateStageParams,
  type DeleteStageParams,
} from "../schemas/pipelines.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

/**
 * List all pipelines
 */
export async function listPipelines(params: ListPipelinesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  // Uses v2 API for pipelines
  const response = await client.get<unknown[]>("/pipelines", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pipelines = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("pipeline", pipelines.length, pagination.has_more),
    data: pipelines,
    pagination,
  });
}

/**
 * List stages, optionally filtered by pipeline
 */
export async function listStages(params: ListStagesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);
  if (params.pipeline_id) {
    queryParams.set("pipeline_id", String(params.pipeline_id));
  }

  // Uses v2 API for stages
  const response = await client.get<unknown[]>("/stages", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const stages = response.data;
  const pagination = extractPaginationV2(response);

  const additionalInfo = params.pipeline_id
    ? `pipeline ${params.pipeline_id}`
    : undefined;

  return formatToolResponse({
    summary: createListSummary("stage", stages.length, pagination.has_more, additionalInfo),
    data: stages,
    pagination,
  });
}

/**
 * Get a single stage by ID
 */
export async function getStage(params: GetStageParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/stages/${params.id}`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Stage ${params.id}`,
    data: response.data,
  });
}

// ─── U1: Pipeline write handlers ──────────────────────────────────────────────

/**
 * Create a new pipeline
 */
export async function createPipeline(params: CreatePipelineParams) {
  const client = getClient();

  const body: Record<string, unknown> = { name: params.name };
  if (params.is_deal_probability_enabled !== undefined) {
    body.is_deal_probability_enabled = params.is_deal_probability_enabled;
  }

  const response = await client.post<unknown>("/pipelines", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Pipeline created",
    data: response.data,
  });
}

/**
 * Update an existing pipeline
 */
export async function updatePipeline(params: UpdatePipelineParams) {
  const client = getClient();

  const { id, ...fields } = params;
  const body: Record<string, unknown> = {};

  if (fields.name !== undefined) body.name = fields.name;
  if (fields.is_deal_probability_enabled !== undefined) {
    body.is_deal_probability_enabled = fields.is_deal_probability_enabled;
  }

  const response = await client.patch<unknown>(`/pipelines/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Pipeline ${id} updated`,
    data: response.data,
  });
}

/**
 * Delete a pipeline (marks it as deleted)
 */
export async function deletePipeline(params: DeletePipelineParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/pipelines/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Pipeline ${params.id} deleted`,
    data: response.data,
  });
}

// ─── U2: Stage write handlers ─────────────────────────────────────────────────

/**
 * Create a new stage
 */
export async function createStage(params: CreateStageParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    name: params.name,
    pipeline_id: params.pipeline_id,
  };
  if (params.deal_probability !== undefined) body.deal_probability = params.deal_probability;
  if (params.is_deal_rot_enabled !== undefined) body.is_deal_rot_enabled = params.is_deal_rot_enabled;
  if (params.days_to_rotten !== undefined) body.days_to_rotten = params.days_to_rotten;

  const response = await client.post<unknown>("/stages", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Stage created",
    data: response.data,
  });
}

/**
 * Update an existing stage
 */
export async function updateStage(params: UpdateStageParams) {
  const client = getClient();

  const { id, ...fields } = params;
  const body: Record<string, unknown> = {};

  if (fields.name !== undefined) body.name = fields.name;
  if (fields.pipeline_id !== undefined) body.pipeline_id = fields.pipeline_id;
  if (fields.deal_probability !== undefined) body.deal_probability = fields.deal_probability;
  if (fields.is_deal_rot_enabled !== undefined) body.is_deal_rot_enabled = fields.is_deal_rot_enabled;
  if (fields.days_to_rotten !== undefined) body.days_to_rotten = fields.days_to_rotten;

  const response = await client.patch<unknown>(`/stages/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Stage ${id} updated`,
    data: response.data,
  });
}

/**
 * Delete a stage (marks it as deleted)
 */
export async function deleteStage(params: DeleteStageParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/stages/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Stage ${params.id} deleted`,
    data: response.data,
  });
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
    description: "List stages with cursor pagination, optionally filtered by pipeline. Stages represent steps in the sales process.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
        limit: { type: "number", description: "Number of items to return (1-100, default 50)" },
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
  // U1: Pipeline write tools
  {
    name: "pipedrive_create_pipeline",
    description: "Create a new sales pipeline. Only name is required. Set is_deal_probability_enabled to turn on weighted deal probability for the pipeline.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "The name of the pipeline (required)" },
        is_deal_probability_enabled: { type: "boolean", description: "Whether deal probability is enabled for this pipeline (default false)" },
      },
      required: ["name"],
    },
    handler: createPipeline,
    schema: CreatePipelineSchema,
  },
  {
    name: "pipedrive_update_pipeline",
    description: "Update an existing pipeline. Provide the pipeline id and any fields to change.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The ID of the pipeline to update" },
        name: { type: "string", description: "The new name of the pipeline" },
        is_deal_probability_enabled: { type: "boolean", description: "Whether deal probability is enabled for this pipeline" },
      },
      required: ["id"],
    },
    handler: updatePipeline,
    schema: UpdatePipelineSchema,
  },
  {
    name: "pipedrive_delete_pipeline",
    description: "Delete a pipeline. Marks the pipeline as deleted. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The ID of the pipeline to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deletePipeline,
    schema: DeletePipelineSchema,
  },
  // U2: Stage write tools
  {
    name: "pipedrive_create_stage",
    description: "Create a new stage in a pipeline. name and pipeline_id are required. Use is_deal_rot_enabled and days_to_rotten to configure deal rotting.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "The name of the stage (required)" },
        pipeline_id: { type: "number", description: "The ID of the pipeline to add the stage to (required)" },
        deal_probability: { type: "number", description: "The success probability percentage of deals in this stage (0-100)" },
        is_deal_rot_enabled: { type: "boolean", description: "Whether deals in this stage can become rotten" },
        days_to_rotten: { type: "number", description: "Days until a deal not updated in this stage becomes rotten (applies only when is_deal_rot_enabled is set)" },
      },
      required: ["name", "pipeline_id"],
    },
    handler: createStage,
    schema: CreateStageSchema,
  },
  {
    name: "pipedrive_update_stage",
    description: "Update an existing stage. Provide the stage id and any fields to change. Set pipeline_id to move the stage to another pipeline.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The ID of the stage to update" },
        name: { type: "string", description: "The new name of the stage" },
        pipeline_id: { type: "number", description: "Move the stage to this pipeline ID" },
        deal_probability: { type: "number", description: "The success probability percentage of deals in this stage (0-100)" },
        is_deal_rot_enabled: { type: "boolean", description: "Whether deals in this stage can become rotten" },
        days_to_rotten: { type: "number", description: "Days until a deal not updated in this stage becomes rotten (applies only when is_deal_rot_enabled is set)" },
      },
      required: ["id"],
    },
    handler: updateStage,
    schema: UpdateStageSchema,
  },
  {
    name: "pipedrive_delete_stage",
    description: "Delete a stage. Marks the stage as deleted. Requires PIPEDRIVE_MODE=full (back-compat: PIPEDRIVE_ENABLE_DESTRUCTIVE=true).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The ID of the stage to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deleteStage,
    schema: DeleteStageSchema,
  },
];
