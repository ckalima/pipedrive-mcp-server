/**
 * Error handling utilities for Pipedrive MCP Server
 */

export interface ErrorResponse {
  code: string;
  message: string;
  suggestion?: string;
}

export type ErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_API_KEY"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "PERMISSION_DENIED"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "DESTRUCTIVE_DISABLED";

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  suggestion?: string
): ErrorResponse {
  return {
    code,
    message,
    suggestion,
  };
}

/**
 * Maps HTTP status codes to error responses
 */
export function handleApiError(status: number, body: unknown): ErrorResponse {
  const bodyMessage = typeof body === "object" && body !== null && "error" in body
    ? String((body as { error: unknown }).error)
    : "Unknown error";

  switch (status) {
    case 400:
      return createErrorResponse(
        "VALIDATION_ERROR",
        `Invalid request: ${bodyMessage}`,
        "Check your request parameters"
      );
    case 401:
      return createErrorResponse(
        "INVALID_API_KEY",
        "API key is invalid or expired",
        "Verify your API key at Pipedrive Settings > Personal preferences > API"
      );
    case 403:
      return createErrorResponse(
        "PERMISSION_DENIED",
        "Access denied to this resource",
        "Check your Pipedrive permissions or subscription plan"
      );
    case 404:
      return createErrorResponse(
        "NOT_FOUND",
        "Resource not found",
        "Verify the ID exists in your Pipedrive account"
      );
    case 429:
      return createErrorResponse(
        "RATE_LIMITED",
        "Rate limit exceeded",
        "Wait 60 seconds before retrying or reduce batch size"
      );
    default:
      return createErrorResponse(
        "API_ERROR",
        `Pipedrive API error (${status}): ${bodyMessage}`
      );
  }
}

/**
 * Returns an MCP tool error response if destructive operations are disabled, null if allowed.
 */
export function destructiveOperationGuard(): { content: { type: "text"; text: string }[]; isError: true } | null {
  const enabled = process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE === "true";
  if (enabled) return null;

  return {
    content: [{
      type: "text" as const,
      text: formatErrorForMcp(createErrorResponse(
        "DESTRUCTIVE_DISABLED",
        "Destructive operations are disabled",
        "Set PIPEDRIVE_ENABLE_DESTRUCTIVE=true in your environment to enable delete operations"
      )),
    }],
    isError: true,
  };
}

const DEFAULT_API_ERROR = {
  code: "API_ERROR",
  message: "Unknown API error",
  suggestion: "Check your API key and network connection",
} as const satisfies ErrorResponse;

export function getErrorResponse(response: { error?: ErrorResponse }): ErrorResponse {
  return response.error ?? { ...DEFAULT_API_ERROR };
}

/**
 * Formats an error for MCP tool response
 */
export function formatErrorForMcp(error: ErrorResponse): string {
  const parts = [
    `Error [${error.code}]: ${error.message}`,
  ];
  if (error.suggestion) {
    parts.push(`Suggestion: ${error.suggestion}`);
  }
  return parts.join("\n");
}

/**
 * Builds an MCP tool error result from an error code, message, and optional suggestion.
 */
export function mcpErrorFromCode(
  code: ErrorCode,
  message: string,
  suggestion?: string,
): { content: { type: "text"; text: string }[]; isError: true } {
  return {
    content: [{
      type: "text" as const,
      text: formatErrorForMcp(createErrorResponse(code, message, suggestion)),
    }],
    isError: true,
  };
}

/**
 * Wraps a failed API response as a complete MCP tool error result.
 */
export function mcpErrorResult(response: { error?: ErrorResponse }): { content: { type: "text"; text: string }[]; isError: true } {
  return {
    content: [{
      type: "text" as const,
      text: formatErrorForMcp(getErrorResponse(response)),
    }],
    isError: true,
  };
}
