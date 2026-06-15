/**
 * Mail/Email-related MCP tools for Pipedrive (v1 API)
 * These tools provide access to email communication for analyzing customer engagement.
 */

import { getClient } from "../client.js";
import {
  GetPersonEmailsSchema,
  GetDealEmailsSchema,
  ListMailThreadsSchema,
  GetMailThreadSchema,
  GetMailMessageSchema,
  type GetPersonEmailsParams,
  type GetDealEmailsParams,
  type ListMailThreadsParams,
  type GetMailThreadParams,
  type GetMailMessageParams,
} from "../schemas/mail.js";
import { buildPaginationParamsV1, extractPaginationV1 } from "../utils/pagination.js";
import { mcpErrorResult } from "../utils/errors.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

/**
 * Get mail messages for a person
 */
export async function getPersonEmails(params: GetPersonEmailsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV1(params.start, params.limit);

  const response = await client.get<unknown[]>(
    `/persons/${params.id}/mailMessages`,
    queryParams,
    "v1"
  );

  // v1 returns { success: true, data: null } for an empty collection, so guard
  // on success only and coerce null -> [] (mirrors listNotes). Treating null as
  // an error here surfaced a bogus "Unknown API error" for an empty mailbox.
  if (!response.success) {
    return mcpErrorResult(response);
  }

  const messages = response.data || [];
  const pagination = extractPaginationV1(response);

  return formatToolResponse({
    summary: createListSummary("email", messages.length, pagination.has_more, `for person ${params.id}`),
    data: messages,
    pagination,
  });
}

/**
 * Get mail messages for a deal
 */
export async function getDealEmails(params: GetDealEmailsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV1(params.start, params.limit);

  const response = await client.get<unknown[]>(
    `/deals/${params.id}/mailMessages`,
    queryParams,
    "v1"
  );

  // v1 returns { success: true, data: null } for an empty collection, so guard
  // on success only and coerce null -> [] (mirrors listNotes). Treating null as
  // an error here surfaced a bogus "Unknown API error" for an empty mailbox.
  if (!response.success) {
    return mcpErrorResult(response);
  }

  const messages = response.data || [];
  const pagination = extractPaginationV1(response);

  return formatToolResponse({
    summary: createListSummary("email", messages.length, pagination.has_more, `for deal ${params.id}`),
    data: messages,
    pagination,
  });
}

/**
 * List mail threads by folder
 */
export async function listMailThreads(params: ListMailThreadsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV1(params.start, params.limit);
  queryParams.set("folder", params.folder || "inbox");

  const response = await client.get<unknown[]>(
    "/mailbox/mailThreads",
    queryParams,
    "v1"
  );

  // v1 returns { success: true, data: null } for an empty folder, so guard on
  // success only and coerce null -> [] (mirrors listNotes), rather than turning
  // an empty inbox into a bogus "Unknown API error".
  if (!response.success) {
    return mcpErrorResult(response);
  }

  const threads = response.data || [];
  const pagination = extractPaginationV1(response);

  return formatToolResponse({
    summary: createListSummary("mail thread", threads.length, pagination.has_more, `in ${params.folder || "inbox"}`),
    data: threads,
    pagination,
  });
}

/**
 * Get a mail thread with its messages
 */
export async function getMailThread(params: GetMailThreadParams) {
  const client = getClient();

  const response = await client.get<unknown>(
    `/mailbox/mailThreads/${params.id}`,
    undefined,
    "v1"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Mail thread ${params.id}`,
    data: response.data,
  });
}

/**
 * Get a single mail message with full body
 */
export async function getMailMessage(params: GetMailMessageParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  if (params.include_body) {
    queryParams.set("include_body", "1");
  }

  const response = await client.get<unknown>(
    `/mailbox/mailMessages/${params.id}`,
    queryParams,
    "v1"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Mail message ${params.id}`,
    data: response.data,
  });
}

/**
 * Tool definitions for MCP registration
 */
export const mailTools = [
  {
    name: "pipedrive_get_person_emails",
    description: "Get email messages linked to a person (company-wide, all users' emails). Returns metadata for emails from any user's mailbox that are linked to this person. Note: To get full message body, use pipedrive_get_mail_message, but only for emails in YOUR mailbox.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Person ID" },
        start: { type: "number", description: "Pagination offset (0-based)" },
        limit: { type: "number", description: "Number of items (1-500)" },
      },
      required: ["id"],
    },
    handler: getPersonEmails,
    schema: GetPersonEmailsSchema,
  },
  {
    name: "pipedrive_get_deal_emails",
    description: "Get email messages linked to a deal (company-wide, all users' emails). Returns metadata for emails from any user's mailbox that are linked to this deal. Note: To get full message body, use pipedrive_get_mail_message, but only for emails in YOUR mailbox.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Deal ID" },
        start: { type: "number", description: "Pagination offset (0-based)" },
        limit: { type: "number", description: "Number of items (1-500)" },
      },
      required: ["id"],
    },
    handler: getDealEmails,
    schema: GetDealEmailsSchema,
  },
  {
    name: "pipedrive_list_mail_threads",
    description: "List mail threads from YOUR mailbox only (authenticated user). Other users' threads are not accessible. Use folder parameter to filter by inbox, drafts, sent, or archive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folder: { type: "string", enum: ["inbox", "drafts", "sent", "archive"], description: "Mail folder (default: inbox)" },
        start: { type: "number", description: "Pagination offset" },
        limit: { type: "number", description: "Number of items" },
      },
    },
    handler: listMailThreads,
    schema: ListMailThreadsSchema,
  },
  {
    name: "pipedrive_get_mail_thread",
    description: "Get a mail thread with messages. Access depends on visibility settings - threads visible within deals/persons you can access should work. Returns 404 if the thread isn't accessible to you.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Mail thread ID" },
      },
      required: ["id"],
    },
    handler: getMailThread,
    schema: GetMailThreadSchema,
  },
  {
    name: "pipedrive_get_mail_message",
    description: "Get full email message with body. Access depends on visibility settings - messages linked to deals/persons you can access should work, even if sent by other users.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Mail message ID" },
        include_body: { type: "boolean", description: "Include full email body (default: false)" },
      },
      required: ["id"],
    },
    handler: getMailMessage,
    schema: GetMailMessageSchema,
  },
];
