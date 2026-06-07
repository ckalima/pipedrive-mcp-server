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
 * List stages parameters
 */
export const ListStagesSchema = z.object({
  pipeline_id: z.number().int().positive().optional()
    .describe("Filter by pipeline ID (if not provided, returns all stages)"),
});

/**
 * Get stage parameters
 */
export const GetStageSchema = IdParamSchema;

/**
 * Type exports
 */
export type ListPipelinesParams = z.infer<typeof ListPipelinesSchema>;
export type ListStagesParams = z.infer<typeof ListStagesSchema>;
export type GetStageParams = z.infer<typeof GetStageSchema>;
