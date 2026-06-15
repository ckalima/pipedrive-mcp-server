/**
 * Error handling utilities for Pipedrive MCP Server
 */

import { resolveCapabilityMode } from "../capability-modes.js";

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
  | "DESTRUCTIVE_DISABLED"
  | "RESPONSE_TOO_LARGE"
  | "CAPABILITY_RETIRED"
  // Local breaker fast-fail. Distinct from RATE_LIMITED (R11) so the model and
  // stderr telemetry can tell a local back-off apart from a fresh upstream 429.
  | "CIRCUIT_OPEN"
  // Tool blocked by the active capability tier (PIPEDRIVE_MODE). Distinct from
  // DESTRUCTIVE_DISABLED so the model and telemetry can tell "blocked by the active
  // mode" apart from "destructive specifically disabled" (KTD7).
  | "MODE_RESTRICTED";

export type McpToolErrorResult = { content: { type: "text"; text: string }[]; isError: true };

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

/** Placeholder substituted for any redacted secret. */
const REDACTED = "[REDACTED]";

/** Max length of a reflected/forwarded backend or exception message before truncation. */
export const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Redacts secrets and strips control characters from a string before it can reach
 * stderr or be returned to the model.
 *
 * The load-bearing control (KTD3) is removing the literal configured token value
 * (`knownSecret`) wherever it appears — bare, or embedded in a request URL's
 * `?api_token=` query string (v1 auth). Pattern-based redaction of the
 * `api_token=` query form and the `x-api-token` header form is a secondary net for
 * cases where the literal token is not in hand (e.g. a token surfaced by the
 * backend, or a future auth-scheme change).
 *
 * It also replaces ASCII control characters (including CR/LF) with spaces so a
 * CRM-sourced or backend-sourced error string cannot forge a new stderr log line
 * or smuggle terminal escape sequences.
 *
 * The token is passed as an argument (never imported from config) so this helper
 * stays unit-testable without env setup and adds no `errors.ts -> config.ts`
 * dependency.
 */
export function redactSecrets(value: string, knownSecret?: string): string {
  let out = value;

  // 1. Redact the literal configured token wherever it appears (bare or in a URL).
  //    This is the durable control; we do not rely on undici to omit the token.
  if (knownSecret && knownSecret.length > 0) {
    out = out.split(knownSecret).join(REDACTED);
  }

  // 2. Secondary net: redact the value of an `api_token=` query param even when the
  //    literal secret was not supplied. (`x-api-token` uses a hyphen, so this does
  //    not match the v2 header name.)
  out = out.replace(/(api_token=)[^&\s"'#]+/gi, `$1${REDACTED}`);

  // 3. Secondary net: redact the value following an `x-api-token` header (v2 auth),
  //    in case a headers/Request object is ever stringified into an error.
  out = out.replace(/(x-api-token["']?\s*[:=]\s*["']?)[^\s,&"'}\]]+/gi, `$1${REDACTED}`);

  // 4. Replace ASCII control characters (incl. newlines) with spaces so the string
  //    cannot forge a log line or inject terminal escapes.
  out = out.replace(/[\u0000-\u001F\u007F]/g, " ");

  return out;
}

/**
 * Redacts a message (via {@link redactSecrets}) and length-caps it with an explicit
 * truncation marker. Used wherever backend-authored or exception text is reflected
 * back to the model so disclosure is bounded and token-free (KTD3, KTD6).
 */
export function boundErrorMessage(value: string, knownSecret?: string): string {
  const redacted = redactSecrets(value, knownSecret);
  return redacted.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_MESSAGE_LENGTH)}… [truncated]`
    : redacted;
}

/**
 * Builds the clear, structured "retired by Pipedrive, no v2 equivalent" error
 * (R6) returned when a registered v1-only capability is detected as retired.
 *
 * Only the capability's static, server-authored display name (from the routing
 * registry) is interpolated — never the caller-supplied endpoint or any
 * CRM-/backend-sourced value — so no untrusted path segment can enter the
 * model-facing message (consistent with the untrusted-data posture elsewhere).
 * The message rides the existing {@link formatErrorForMcp} / {@link mcpErrorResult}
 * path like any other `ErrorResponse`.
 */
export function capabilityRetiredError(capabilityDisplayName: string): ErrorResponse {
  return createErrorResponse(
    "CAPABILITY_RETIRED",
    `The ${capabilityDisplayName} capability has been retired by Pipedrive. It relied on Pipedrive API v1, which has no v2 equivalent, so this tool can no longer be served.`,
    "This cannot be restored from the MCP server. Check the Pipedrive changelog for a v2 replacement: https://developers.pipedrive.com/changelog",
  );
}

/**
 * Maps HTTP status codes to error responses
 */
export function handleApiError(status: number, body: unknown): ErrorResponse {
  const bodyMessage = typeof body === "object" && body !== null && "error" in body
    ? String((body as { error: unknown }).error)
    : "Unknown error";

  // The 400 and default branches reflect Pipedrive's own error text back to the
  // model for debuggability. That text is backend-authored (untrusted) and can be
  // arbitrarily long or carry a token-like value, so bound and redact it before
  // it leaves this function. 401/403/404/429 use fixed strings and need no
  // treatment (F4/KTD6).
  const safeBodyMessage = boundErrorMessage(bodyMessage);

  switch (status) {
    case 400:
      return createErrorResponse(
        "VALIDATION_ERROR",
        `Invalid request: ${safeBodyMessage}`,
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
      // The client now auto-retries 429s with bounded backoff (resilience.ts), so
      // this surfaces only after retries were already exhausted. The suggestion is
      // softened accordingly — telling the model to "wait 60 seconds" would be
      // misleading now that the wait already happened.
      return createErrorResponse(
        "RATE_LIMITED",
        "Rate limit exceeded",
        "The request was retried automatically with backoff but is still rate limited. Pause before retrying and consider reducing batch size."
      );
    default:
      return createErrorResponse(
        "API_ERROR",
        `Pipedrive API error (${status}): ${safeBodyMessage}`
      );
  }
}

/**
 * Returns an MCP tool error response if destructive operations are disabled, null if allowed.
 *
 * Destructive ops are permitted iff the resolved capability mode is `full` (KTD5). This is
 * the innermost, defense-in-depth layer beneath the dispatcher backstop: sourcing the
 * decision from `resolveCapabilityMode()` (not the raw `PIPEDRIVE_ENABLE_DESTRUCTIVE`
 * flag) means the guard can never disagree with the dispatcher under `PIPEDRIVE_MODE=full`
 * with the legacy flag unset. The resolver is imported from `capability-modes.ts`, never
 * `config.ts`, preserving the no-`errors.ts → config.ts` dependency rule (see redactSecrets).
 */
export function destructiveOperationGuard(): McpToolErrorResult | null {
  if (resolveCapabilityMode() === "full") return null;

  return {
    content: [{
      type: "text" as const,
      text: formatErrorForMcp(createErrorResponse(
        "DESTRUCTIVE_DISABLED",
        "Destructive operations are disabled",
        "Set PIPEDRIVE_MODE=full (or, for back-compat, PIPEDRIVE_ENABLE_DESTRUCTIVE=true) in your environment to enable delete operations"
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
): McpToolErrorResult {
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
export function mcpErrorResult(response: { error?: ErrorResponse }): McpToolErrorResult {
  return {
    content: [{
      type: "text" as const,
      text: formatErrorForMcp(getErrorResponse(response)),
    }],
    isError: true,
  };
}
