/**
 * Zod schemas for Mail/Email-related operations (v1 API)
 */

import { z } from "zod";
import {
  PaginationParamsV1Schema,
  IdParamSchema,
} from "./common.js";

/**
 * Mail folder types
 */
export const MailFolderSchema = z.enum(["inbox", "drafts", "sent", "archive"])
  .describe("Mail folder to list threads from");

/**
 * Get person emails parameters
 */
export const GetPersonEmailsSchema = IdParamSchema.extend(PaginationParamsV1Schema.shape)
  .describe("Get mail messages for a person");

/**
 * Get deal emails parameters
 */
export const GetDealEmailsSchema = IdParamSchema.extend(PaginationParamsV1Schema.shape)
  .describe("Get mail messages for a deal");

/**
 * List mail threads parameters
 */
export const ListMailThreadsSchema = PaginationParamsV1Schema.extend({
  folder: MailFolderSchema.optional().default("inbox")
    .describe("Mail folder to list threads from"),
});

/**
 * Get mail thread parameters
 */
export const GetMailThreadSchema = IdParamSchema;

/**
 * Get mail message parameters
 */
export const GetMailMessageSchema = IdParamSchema.extend({
  include_body: z.boolean().optional().default(false)
    .describe("Include full email body in response (default: false)"),
});

/**
 * Type exports
 */
export type GetPersonEmailsParams = z.infer<typeof GetPersonEmailsSchema>;
export type GetDealEmailsParams = z.infer<typeof GetDealEmailsSchema>;
export type ListMailThreadsParams = z.infer<typeof ListMailThreadsSchema>;
export type GetMailThreadParams = z.infer<typeof GetMailThreadSchema>;
export type GetMailMessageParams = z.infer<typeof GetMailMessageSchema>;
