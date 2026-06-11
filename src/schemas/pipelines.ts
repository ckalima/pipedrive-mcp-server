/**
 * Zod schemas for Pipeline and Stage operations
 */

import { z } from "zod";
import { IdParamSchema, PaginationParamsSchema } from "./common.js";

/**
 * List pipelines parameters (v2 cursor-based pagination)
 */
export const ListPipelinesSchema = PaginationParamsSchema;

/**
 * List stages parameters (v2 cursor-based pagination, optional pipeline filter)
 */
export const ListStagesSchema = PaginationParamsSchema.extend({
  pipeline_id: z.number().int().positive().optional()
    .describe("Filter by pipeline ID (if not provided, returns all stages)"),
});

/**
 * Get stage parameters
 */
export const GetStageSchema = IdParamSchema;

// ─── U1: Pipeline write schemas ───────────────────────────────────────────────
// v2 uses `is_deal_probability_enabled` (the v1 `deal_probability` pipeline flag
// was renamed). `is_deleted` (formerly `active`) is a read-only response field and
// is NOT accepted in any write body — `.strict()` rejects it rather than dropping it.

/**
 * Create pipeline parameters
 */
export const CreatePipelineSchema = z.object({
  name: z.string().min(1)
    .describe("The name of the pipeline (required)"),
  is_deal_probability_enabled: z.boolean().optional()
    .describe("Whether deal probability is enabled for this pipeline (default false)"),
}).strict();

/**
 * Update pipeline parameters. The v2 spec sets no minProperties, so an id-only
 * body is a valid no-op (not an API error); all updatable fields are optional.
 */
export const UpdatePipelineSchema = IdParamSchema.extend({
  name: z.string().min(1).optional()
    .describe("The new name of the pipeline"),
  is_deal_probability_enabled: z.boolean().optional()
    .describe("Whether deal probability is enabled for this pipeline"),
}).strict();

/**
 * Delete pipeline parameters
 */
export const DeletePipelineSchema = IdParamSchema;

// ─── U2: Stage write schemas ──────────────────────────────────────────────────
// v2 renames: `rotten_flag` → `is_deal_rot_enabled`, `rotten_days` → `days_to_rotten`.
// `deal_probability` here is the stage-level integer percentage (NOT the pipeline
// flag). `.strict()` rejects v1 names and the read-only `is_deleted`/`active`.

/**
 * Create stage parameters
 */
export const CreateStageSchema = z.object({
  name: z.string().min(1)
    .describe("The name of the stage (required)"),
  pipeline_id: z.number().int().positive()
    .describe("The ID of the pipeline to add the stage to (required)"),
  deal_probability: z.number().int().min(0).max(100).optional()
    .describe("The success probability percentage of deals in this stage (0-100)"),
  is_deal_rot_enabled: z.boolean().optional()
    .describe("Whether deals in this stage can become rotten"),
  days_to_rotten: z.number().int().nullable().optional()
    .describe("Days until a deal not updated in this stage becomes rotten (applies only when is_deal_rot_enabled is set)"),
}).strict();

/**
 * Update stage parameters. The v2 spec sets no minProperties, so an id-only body
 * is a valid no-op; all updatable fields are optional.
 */
export const UpdateStageSchema = IdParamSchema.extend({
  name: z.string().min(1).optional()
    .describe("The new name of the stage"),
  pipeline_id: z.number().int().positive().optional()
    .describe("Move the stage to this pipeline ID"),
  deal_probability: z.number().int().min(0).max(100).optional()
    .describe("The success probability percentage of deals in this stage (0-100)"),
  is_deal_rot_enabled: z.boolean().optional()
    .describe("Whether deals in this stage can become rotten"),
  days_to_rotten: z.number().int().nullable().optional()
    .describe("Days until a deal not updated in this stage becomes rotten (applies only when is_deal_rot_enabled is set)"),
}).strict();

/**
 * Delete stage parameters
 */
export const DeleteStageSchema = IdParamSchema;

/**
 * Type exports
 */
export type ListPipelinesParams = z.infer<typeof ListPipelinesSchema>;
export type ListStagesParams = z.infer<typeof ListStagesSchema>;
export type GetStageParams = z.infer<typeof GetStageSchema>;
export type CreatePipelineParams = z.infer<typeof CreatePipelineSchema>;
export type UpdatePipelineParams = z.infer<typeof UpdatePipelineSchema>;
export type DeletePipelineParams = z.infer<typeof DeletePipelineSchema>;
export type CreateStageParams = z.infer<typeof CreateStageSchema>;
export type UpdateStageParams = z.infer<typeof UpdateStageSchema>;
export type DeleteStageParams = z.infer<typeof DeleteStageSchema>;
