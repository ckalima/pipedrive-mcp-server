/**
 * Pipedrive API client wrapper
 * Handles both v1 and v2 API endpoints with proper authentication
 */

import { getConfig, type Config } from "./config.js";
import { handleApiError, createErrorResponse, formatErrorForMcp, redactSecrets, type ErrorResponse } from "./utils/errors.js";

export type ApiVersion = "v1" | "v2";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
      next_start?: number;
    };
    next_cursor?: string;
  };
}

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Pipedrive API client with support for both v1 and v2 endpoints
 */
export class PipedriveClient {
  // Defer config loading to first use for better error handling
  private config: Config | null = null;

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
   * Normalizes a fetch Response plus its parsed JSON body into the ApiResponse envelope
   */
  private parseResponse<T>(
    response: Response,
    body: Record<string, unknown>
  ): ApiResponse<T> {
    if (!response.ok) {
      return {
        success: false,
        error: handleApiError(response.status, body),
      };
    }
    return {
      success: true,
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
   * Core request method (JSON body)
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

    try {
      // Log to stderr (not stdout) to avoid STDIO protocol corruption
      console.error(`[pipedrive-mcp] ${method} ${endpoint}`);

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const responseData = await response.json() as Record<string, unknown>;

      return this.parseResponse<T>(response, responseData);
    } catch (error) {
      return this.networkError<T>(error);
    }
  }

  /**
   * Core request method for multipart/form-data bodies.
   *
   * Shares URL construction, auth, response parsing, and error handling with
   * request() via the private helpers. The ONLY differences are the FormData
   * body and the deliberate omission of a manual Content-Type header.
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
    // corrupts the request (silent 400 from the API).

    try {
      // Log to stderr (not stdout) to avoid STDIO protocol corruption
      console.error(`[pipedrive-mcp] ${method} ${endpoint} (multipart)`);

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: formData,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const responseData = await response.json() as Record<string, unknown>;

      return this.parseResponse<T>(response, responseData);
    } catch (error) {
      return this.networkError<T>(error);
    }
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
