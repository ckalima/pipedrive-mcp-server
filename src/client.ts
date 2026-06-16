/**
 * Pipedrive API client wrapper
 * Handles both v1 and v2 API endpoints with proper authentication
 */

import { getConfig, BASE_URL_V1, BASE_URL_V2, type Config } from "./config.js";
import { handleApiError, createErrorResponse, formatErrorForMcp, redactSecrets, type ErrorResponse } from "./utils/errors.js";
import {
  classifyOutcome,
  computeBackoffMs,
  parseRetryAfterMs,
  breakerAllowsRequest,
  recordOutcome,
  getBreakerState,
  circuitOpenError,
  resilientSleep,
  RETRY_MAX_ATTEMPTS,
  RETRY_BUDGET_MS,
  RETRY_AFTER_CAP_MS,
  type BreakerState,
} from "./resilience.js";

export type ApiVersion = "v1" | "v2";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
  /**
   * Seam-internal HTTP status from the underlying fetch Response. Carried on the
   * client return shape (NOT on the rendered `ErrorResponse`) so the version-routing
   * seam can discriminate a retirement signal (410 / collection-root 404) from an
   * ordinary error. Absent on the network/timeout path — that statuslessness is what
   * keeps transient failures from ever looking like retirement (KTD4). Never rendered
   * to the model: only `error` and `data` reach tool output.
   */
  httpStatus?: number;
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
      next_start?: number;
    };
    next_cursor?: string;
  };
}

/** Request timeout in milliseconds (per-attempt cap; the initial attempt uses the full value). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Per-attempt timeout for pasted-key validation (KTD2). Shorter than the normal
 * request timeout because validation runs in front of an interactive prompt: a
 * stalled `/users/me` should surface a re-paste in seconds, not block the operator.
 */
const VALIDATION_TIMEOUT_MS = 10_000;

/**
 * Per-instance resilience overrides for the retry driver. Omitted fields fall
 * back to the module defaults (RETRY_MAX_ATTEMPTS / REQUEST_TIMEOUT_MS), so the
 * env-driven singleton and any caller that constructs a client without overrides
 * behave exactly as before. The validation seam (KTD2) uses this to opt OUT of the
 * full ~60s read-retry loop: a pasted-key check must fail fast on a slow/down
 * network rather than retry four times while the operator stares at a frozen prompt.
 */
export interface ResilienceOverrides {
  /** Total attempts per logical request (1 disables retries). Defaults to RETRY_MAX_ATTEMPTS. */
  maxAttempts?: number;
  /** Per-attempt timeout in ms. Defaults to REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** Shared empty Headers for the network/timeout path, where no response headers exist. */
const EMPTY_HEADERS = new Headers();

/**
 * Path-templates an endpoint for telemetry so no CRM-sourced record identifier can
 * reach operator stderr through a logged endpoint (R8). Any path segment that is a
 * record/conversion id — a numeric id or any segment containing a digit (UUIDs,
 * `conv-…` ids) — is replaced with `:id`; static path words in this API carry no
 * digits, so they survive (`/leads/{uuid}/convert/status/{id}` -> `/leads/:id/convert/status/:id`).
 * Anything after a `?`/`#` is dropped defensively. This complements (does not
 * replace) the token redaction in redactSecrets — the auth token never rides the
 * `endpoint` (it is applied to the URL), so this is purely about record ids.
 */
function sanitizeEndpointForLog(endpoint: string): string {
  const path = endpoint.split(/[?#]/)[0];
  return path
    .split("/")
    .map((segment) => (/\d/.test(segment) ? ":id" : segment))
    .join("/");
}

/**
 * Pipedrive API client with support for both v1 and v2 endpoints
 */
export class PipedriveClient {
  // Defer config loading to first use for better error handling
  private config: Config | null = null;
  /** Per-instance retry/timeout overrides (defaults apply when fields are unset). */
  private readonly resilience?: ResilienceOverrides;

  /**
   * @param seededConfig When supplied, the client uses this explicit config
   *   instead of ever calling getConfig()/reading process.env. This is the
   *   token-accepting validation seam (KTD2): the installer validates each
   *   pasted key by seeding a fresh instance with that key, so the key
   *   authenticates on the wire as itself and redaction keys off it — never the
   *   env-driven getClient() singleton, which caches the first key for the
   *   process lifetime and would re-validate every re-prompt against it. Omit it
   *   for the normal env-driven path (unchanged: deferred load on first use).
   * @param resilience Optional per-instance retry/timeout overrides. Omit for the
   *   default 4-attempt loop; the validation seam passes {maxAttempts:1} so a
   *   pasted-key check fails fast instead of riding the full ~60s read-retry path.
   */
  constructor(seededConfig?: Config, resilience?: ResilienceOverrides) {
    this.config = seededConfig ?? null;
    this.resilience = resilience;
  }

  /**
   * Ensures the client is properly configured and returns the loaded config
   */
  private ensureInitialized(): Config {
    if (!this.config) {
      this.config = getConfig();
    }
    return this.config;
  }

  /**
   * Gets the base URL for the specified API version
   */
  private getBaseUrl(config: Config, version: ApiVersion): string {
    return version === "v1" ? config.baseUrlV1 : config.baseUrlV2;
  }

  // ─── Shared request building blocks ─────────────────────────────────────────
  // Used by BOTH request() (JSON) and requestMultipart() (FormData) so the two
  // transports cannot drift. The only thing that differs between them is body
  // serialization and the Content-Type handling.

  /**
   * Builds the full request URL for an endpoint and API version (no auth applied)
   */
  private buildRequestUrl(config: Config, endpoint: string, version: ApiVersion): URL {
    return new URL(`${this.getBaseUrl(config, version)}${endpoint}`);
  }

  /**
   * Applies version-specific authentication. Single source of truth for auth:
   * v2 uses the x-api-token header; v1 uses the ?api_token= query param.
   */
  private applyAuth(
    config: Config,
    version: ApiVersion,
    url: URL,
    headers: Record<string, string>
  ): void {
    if (version === "v2") {
      headers["x-api-token"] = config.apiKey;
    } else {
      url.searchParams.set("api_token", config.apiKey);
    }
  }

  /**
   * Reads a fetch Response body and normalizes it into the ApiResponse envelope.
   *
   * The HTTP status is captured BEFORE the body is parsed, and a parse failure on a
   * NON-OK response (an empty or non-JSON body — exactly what a retired endpoint is
   * likely to return for a 410/404) still yields a status-bearing error instead of
   * being lost as a status-less network error (KTD4). A parse failure on an OK
   * response is rethrown so the caller's catch maps it to a network error, exactly
   * as before — the success path is unchanged.
   */
  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const status = response.status;

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch (parseError) {
      if (!response.ok) {
        return {
          success: false,
          httpStatus: status,
          error: handleApiError(status, {}),
        };
      }
      throw parseError;
    }

    if (!response.ok) {
      return {
        success: false,
        httpStatus: status,
        error: handleApiError(status, body),
      };
    }
    return {
      success: true,
      httpStatus: status,
      data: body.data as T,
      additional_data: body.additional_data as ApiResponse<T>["additional_data"],
    };
  }

  /**
   * Builds the standard network-error envelope (shared by the JSON and multipart paths)
   */
  private networkError<T>(error: unknown): ApiResponse<T> {
    const rawMessage = error instanceof Error ? error.message : "Unknown network error";
    // Redact the token before the message reaches stderr or the model. On v1 the
    // token rides in the request URL's `?api_token=` query string, so any error
    // whose message embeds the URL embeds the token (F1/KTD3). We never pass the
    // raw `error` object to console.error — it can carry the URL in its `cause`.
    const safeMessage = redactSecrets(rawMessage, this.config?.apiKey);
    // Log to stderr (not stdout) to avoid STDIO protocol corruption
    console.error(`[pipedrive-mcp] Network error: ${safeMessage}`);
    return {
      success: false,
      error: createErrorResponse(
        "NETWORK_ERROR",
        safeMessage,
        "Check your internet connection and try again"
      ),
    };
  }

  /**
   * Makes a GET request to the Pipedrive API
   */
  async get<T>(
    endpoint: string,
    params: URLSearchParams | undefined,
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", endpoint, params, undefined, version);
  }

  /**
   * Makes a POST request to the Pipedrive API.
   *
   * The body accepts either an object or a top-level array. A few v2 endpoints
   * (e.g. the field-options sub-verbs) take a JSON array as their request body.
   */
  async post<T>(
    endpoint: string,
    body: Record<string, unknown> | unknown[],
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    return this.request<T>("POST", endpoint, undefined, body, version);
  }

  /**
   * Makes a PATCH request to the Pipedrive API.
   *
   * The body accepts either an object or a top-level array. The field-options
   * bulk-update sub-verbs (`PATCH /{entity}Fields/{field_code}/options`) send a
   * top-level `[{ id, label }]` array.
   */
  async patch<T>(
    endpoint: string,
    body: Record<string, unknown> | unknown[],
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", endpoint, undefined, body, version);
  }

  /**
   * Makes a PUT request to the Pipedrive API
   */
  async put<T>(
    endpoint: string,
    body: Record<string, unknown>,
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", endpoint, undefined, body, version);
  }

  /**
   * Makes a DELETE request to the Pipedrive API.
   *
   * An optional request body may be supplied — the field-options bulk-delete
   * sub-verbs (`DELETE /{entity}Fields/{field_code}/options`) require a
   * top-level `[{ id }]` array body. Existing two-arg callers send no body.
   */
  async delete<T>(
    endpoint: string,
    version: ApiVersion,
    body?: Record<string, unknown> | unknown[]
  ): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", endpoint, undefined, body, version);
  }

  /**
   * Makes a multipart/form-data POST request to the Pipedrive API.
   * Use for file uploads (e.g. product images). The body is a FormData instance.
   */
  async postMultipart<T>(
    endpoint: string,
    formData: FormData,
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    return this.requestMultipart<T>("POST", endpoint, formData, version);
  }

  /**
   * Makes a multipart/form-data PUT request to the Pipedrive API.
   * Use for file updates (e.g. product images). The body is a FormData instance.
   */
  async putMultipart<T>(
    endpoint: string,
    formData: FormData,
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    return this.requestMultipart<T>("PUT", endpoint, formData, version);
  }

  /**
   * Core request method (JSON body). Builds the URL/auth/headers/body once, then
   * hands the request to the shared resilience driver (retry + circuit breaker).
   */
  private async request<T>(
    method: string,
    endpoint: string,
    params: URLSearchParams | undefined,
    body: Record<string, unknown> | unknown[] | undefined,
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    const config = this.ensureInitialized();

    const url = this.buildRequestUrl(config, endpoint, version);

    // Initialize headers early so auth header can be set before URL params
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    // Auth (v2 header / v1 query param) — shared with requestMultipart()
    this.applyAuth(config, version, url, headers);

    // Add additional query parameters
    if (params) {
      params.forEach((value, key) => {
        url.searchParams.set(key, value);
      });
    }

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    // The JSON body string is built once and re-sent verbatim on each retry.
    return this.sendWithResilience<T>(
      method,
      endpoint,
      url,
      headers,
      body ? JSON.stringify(body) : undefined,
      false,
    );
  }

  /**
   * Core request method for multipart/form-data bodies.
   *
   * Shares URL construction, auth, response parsing, retry/breaker handling, and
   * error handling with request() via the private helpers and the resilience
   * driver. The ONLY differences are the FormData body and the deliberate omission
   * of a manual Content-Type header. The same in-memory Blob-backed FormData
   * instance is re-sent on each retry (KTD8): it is re-readable, so undici
   * serializes it again and regenerates the boundary cleanly.
   */
  private async requestMultipart<T>(
    method: string,
    endpoint: string,
    formData: FormData,
    version: ApiVersion
  ): Promise<ApiResponse<T>> {
    const config = this.ensureInitialized();

    const url = this.buildRequestUrl(config, endpoint, version);

    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    // Auth (v2 header / v1 query param) — shared with request()
    this.applyAuth(config, version, url, headers);

    // CRITICAL: do NOT set Content-Type. When the body is a FormData instance,
    // fetch (Node.js 18+ undici) generates `multipart/form-data; boundary=…`
    // automatically. A manual Content-Type omits/overrides the boundary and
    // corrupts the request (silent 400 from the API). This holds on every re-send.

    return this.sendWithResilience<T>(method, endpoint, url, headers, formData, true);
  }

  /**
   * Shared resilience driver: drives the breaker gate and the retry loop for both
   * request() and requestMultipart(). It is the single place fetch is called.
   *
   * Per-attempt order (must be exact — see plan System-Wide Impact): consult the
   * breaker, attempt, classify + record the outcome, then decide whether to retry
   * within the attempt cap and the added-wall-clock budget. A half-open probe runs
   * exactly one attempt with retry disabled (KTD7). Non-transient responses (4xx
   * other than 429, and the retirement 410) return on the first attempt with their
   * httpStatus intact, so the version-routing seam's retirement detection stays
   * immediate (R5).
   */
  private async sendWithResilience<T>(
    method: string,
    endpoint: string,
    url: URL,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    multipart: boolean,
  ): Promise<ApiResponse<T>> {
    const overallStartMs = Date.now();
    // Resolve per-instance overrides (default to the module knobs). These let the
    // validation seam cap attempts to 1 with a short timeout; every other caller
    // keeps the full 4-attempt loop and 30s per-attempt timeout unchanged.
    const maxAttempts = this.resilience?.maxAttempts ?? RETRY_MAX_ATTEMPTS;
    const baseTimeoutMs = this.resilience?.timeoutMs ?? REQUEST_TIMEOUT_MS;
    // Added wall-clock (KTD3): retry-attempt durations plus inter-attempt waits.
    // The initial attempt is NOT debited here — it is bounded separately by
    // baseTimeoutMs, so the total is bounded at ~baseTimeoutMs + budget.
    let budgetUsedMs = 0;
    let lastFailure: ApiResponse<T> | null = null;

    // Telemetry uses a path-templated endpoint so no CRM-sourced record id can
    // reach operator stderr, even when a handler interpolated one into the path
    // (e.g. /leads/{uuid}). Composed once and reused for every attempt/transition log.
    const logEndpoint = sanitizeEndpointForLog(endpoint);

    for (let attemptIndex = 0; ; attemptIndex++) {
      // ── Breaker gate (consulted before every attempt) ──
      const stateBeforeGate = getBreakerState();
      const allowed = breakerAllowsRequest(Date.now());
      this.logBreakerTransition(stateBeforeGate, getBreakerState(), method, logEndpoint);
      if (!allowed) {
        this.logResilience(`${method} ${logEndpoint} circuit open — fast-failing without a request`);
        return { success: false, error: circuitOpenError() };
      }
      const isProbe = getBreakerState() === "HalfOpen";

      // ── Per-attempt timeout (KTD3): the initial attempt gets the full timeout;
      //    retries shrink as the total wall-clock nears baseTimeoutMs+budget. ──
      const remainingTotalMs = baseTimeoutMs + RETRY_BUDGET_MS - (Date.now() - overallStartMs);
      if (attemptIndex > 0 && remainingTotalMs <= 0 && lastFailure) {
        return lastFailure;
      }
      const attemptTimeoutMs = attemptIndex === 0
        ? baseTimeoutMs
        : Math.min(baseTimeoutMs, Math.max(1, remainingTotalMs));

      // ── Attempt ──
      this.logResilience(
        `${method} ${logEndpoint}${multipart ? " (multipart)" : ""} attempt ${attemptIndex + 1}/${maxAttempts}${isProbe ? " (breaker probe)" : ""}`,
      );
      const attemptStartMs = Date.now();
      let parsed: ApiResponse<T> | undefined;
      let isNetworkError = false;
      let responseHeaders: Headers | undefined;
      try {
        const response = await fetch(url.toString(), {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(attemptTimeoutMs),
        });
        responseHeaders = response.headers;
        parsed = await this.parseResponse<T>(response);
      } catch (error) {
        isNetworkError = true;
        lastFailure = this.networkError<T>(error);
      }
      if (attemptIndex > 0) {
        budgetUsedMs += Date.now() - attemptStartMs;
      }

      // ── Classify + record breaker outcome ──
      const httpStatus = parsed?.httpStatus;
      const isSuccess = parsed?.success === true;
      const { retryable, isTripSignal } = classifyOutcome({ method, httpStatus, isNetworkError });
      const stateBeforeRecord = getBreakerState();
      // Pass isProbe so a straggler that only settled during this request's probe
      // window cannot hijack the half-open verdict (owner-scoped breaker update).
      recordOutcome({ isSuccess, isTripSignal }, Date.now(), isProbe);
      this.logBreakerTransition(stateBeforeRecord, getBreakerState(), method, logEndpoint);

      if (isSuccess) {
        return parsed!;
      }
      if (!isNetworkError) {
        // Status-bearing failure (e.g. 410 / 4xx / 5xx): keep it to return on giving up.
        lastFailure = parsed!;
      }

      // A half-open probe is a single attempt with internal retry disabled (KTD7):
      // its outcome alone settled the breaker above; never loop.
      if (isProbe) {
        return lastFailure!;
      }

      // ── Retry decision ──
      if (!retryable) {
        return lastFailure!;
      }
      if (attemptIndex + 1 >= maxAttempts) {
        return lastFailure!;
      }

      // ── Compute the wait (KTD6 cap-then-bail order, else backoff + jitter) ──
      const budgetRemainingMs = RETRY_BUDGET_MS - budgetUsedMs;
      const hintMs = parseRetryAfterMs(responseHeaders ?? EMPTY_HEADERS, Date.now());
      let waitMs: number;
      if (hintMs !== null) {
        const cappedHint = Math.min(hintMs, RETRY_AFTER_CAP_MS);
        if (cappedHint > budgetRemainingMs) {
          // Surfacing now beats sleeping a truncated wait into a likely second 429.
          return lastFailure!;
        }
        waitMs = cappedHint;
      } else {
        const backoff = computeBackoffMs(attemptIndex);
        if (backoff > budgetRemainingMs) {
          return lastFailure!;
        }
        waitMs = backoff;
      }

      this.logResilience(
        `${method} ${logEndpoint} retrying in ${waitMs}ms after attempt ${attemptIndex + 1} (${httpStatus ? `status ${httpStatus}` : "network/timeout"})`,
      );
      budgetUsedMs += waitMs;
      await resilientSleep(waitMs);
    }
  }

  /**
   * Emits a resilience telemetry line to stderr (never stdout, which would corrupt
   * the STDIO protocol). The message is composed ONLY from the method, endpoint
   * path, attempt index, status, and breaker state — never `url.toString()` (the v1
   * `?api_token=` value rides the URL) and never a raw error object. It is routed
   * through redactSecrets for defense-in-depth, consistent with networkError() (R8).
   */
  private logResilience(message: string): void {
    console.error(redactSecrets(`[pipedrive-mcp] ${message}`, this.config?.apiKey));
  }

  /** Logs a breaker state transition (no-op when the state is unchanged). */
  private logBreakerTransition(
    before: BreakerState,
    after: BreakerState,
    method: string,
    endpoint: string,
  ): void {
    if (before === after) return;
    this.logResilience(`${method} ${endpoint} circuit breaker ${before} -> ${after}`);
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Use the users endpoint as a simple connectivity test
      const response = await this.get<unknown[]>("/users/me", undefined, "v1");
      if (response.success) {
        return { success: true, message: "Successfully connected to Pipedrive API" };
      }
      return {
        success: false,
        message: response.error ? formatErrorForMcp(response.error) : "Connection failed",
      };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Connection test failed";
      // Redact the token in case the error message embeds the request URL (F1).
      return {
        success: false,
        message: redactSecrets(rawMessage, this.config?.apiKey),
      };
    }
  }
}

// Singleton instance for reuse across tools
let clientInstance: PipedriveClient | null = null;

export function getClient(): PipedriveClient {
  if (!clientInstance) {
    clientInstance = new PipedriveClient();
  }
  return clientInstance;
}

/**
 * Builds a fresh client seeded with an explicit, caller-supplied key for one-off
 * validation of a pasted token (KTD2). It deliberately bypasses the env-driven
 * getClient() singleton so each pasted key authenticates on the wire as itself
 * (the singleton freezes the first key for the process lifetime). `mode` is
 * irrelevant to validation — it only gates destructive tools — so `read-only`
 * is the safe seed. Callers should issue `/users/me` (v1) directly on the
 * returned client, NOT through the version-routing seam: that seam treats a
 * `/users/me` 404 as a retirement signal, which validation traffic must not trip.
 *
 * Validation opts out of the full read-retry loop (maxAttempts:1) with a short
 * per-attempt timeout, so a pasted-key check fails fast on a slow/down network
 * instead of retrying for ~60s behind a frozen prompt. A genuine bad key (401)
 * returns on the first attempt regardless; the cap only bounds the network-stall
 * case, where re-pasting is the right recovery anyway.
 */
export function createValidationClient(apiKey: string): PipedriveClient {
  return new PipedriveClient(
    {
      apiKey,
      baseUrlV1: BASE_URL_V1,
      baseUrlV2: BASE_URL_V2,
      mode: "read-only",
    },
    { maxAttempts: 1, timeoutMs: VALIDATION_TIMEOUT_MS },
  );
}
