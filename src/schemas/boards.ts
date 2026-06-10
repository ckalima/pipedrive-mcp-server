/**
 * Zod schemas for Board and Phase operations (Projects API - public beta)
 *
 * Boards: GET /boards has no pagination or filters — it returns all boards in one response.
 * Phases: GET /phases requires board_id and has no pagination — returns all phases for a board.
 */

import { z } from "zod";
import { IdParamSchema } from "./common.js";

// ─── Board schemas ─────────────────────────────────────────────────────────────

/**
 * List boards — no parameters (the API returns all boards with no pagination)
 */
export const ListBoardsSchema = z.object({});

/**
 * Get a single board by ID
 */
export const GetBoardSchema = IdParamSchema;

/**
 * Create a new board
 */
export const CreateBoardSchema = z.object({
  name: z.string().min(1)
    .describe("Board name (required, must not be empty)"),
  order_nr: z.number().int().min(1).optional()
    .describe("Board order number (integer >= 1)"),
});

/**
 * Update an existing board. Only id is required.
 */
export const UpdateBoardSchema = IdParamSchema.extend({
  name: z.string().min(1).optional()
    .describe("Board name"),
  order_nr: z.number().int().min(1).optional()
    .describe("Board order number (integer >= 1)"),
});

/**
 * Delete a board (requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true)
 */
export const DeleteBoardSchema = IdParamSchema;

// ─── Phase schemas ─────────────────────────────────────────────────────────────

/**
 * List phases — board_id is REQUIRED per spec (no pagination)
 */
export const ListPhasesSchema = z.object({
  board_id: z.number().int().positive()
    .describe("ID of the board to list phases for (required)"),
});

/**
 * Get a single phase by ID
 */
export const GetPhaseSchema = IdParamSchema;

/**
 * Create a new phase
 */
export const CreatePhaseSchema = z.object({
  name: z.string().min(1)
    .describe("Phase name (required, must not be empty)"),
  board_id: z.number().int().positive()
    .describe("ID of the board this phase belongs to (required)"),
  order_nr: z.number().int().min(1).optional()
    .describe("Phase order number (integer >= 1)"),
});

/**
 * Update an existing phase. Only id is required.
 * board_id can be used to move a phase to a different board.
 */
export const UpdatePhaseSchema = IdParamSchema.extend({
  name: z.string().min(1).optional()
    .describe("Phase name"),
  board_id: z.number().int().positive().optional()
    .describe("ID of the board (set to move this phase to a different board)"),
  order_nr: z.number().int().min(1).optional()
    .describe("Phase order number (integer >= 1)"),
});

/**
 * Delete a phase (requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true)
 */
export const DeletePhaseSchema = IdParamSchema;

// ─── Type exports ─────────────────────────────────────────────────────────────

export type ListBoardsParams = z.infer<typeof ListBoardsSchema>;
export type GetBoardParams = z.infer<typeof GetBoardSchema>;
export type CreateBoardParams = z.infer<typeof CreateBoardSchema>;
export type UpdateBoardParams = z.infer<typeof UpdateBoardSchema>;
export type DeleteBoardParams = z.infer<typeof DeleteBoardSchema>;

export type ListPhasesParams = z.infer<typeof ListPhasesSchema>;
export type GetPhaseParams = z.infer<typeof GetPhaseSchema>;
export type CreatePhaseParams = z.infer<typeof CreatePhaseSchema>;
export type UpdatePhaseParams = z.infer<typeof UpdatePhaseSchema>;
export type DeletePhaseParams = z.infer<typeof DeletePhaseSchema>;
