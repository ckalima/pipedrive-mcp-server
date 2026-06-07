/**
 * Pipedrive API client wrapper
 * Handles both v1 and v2 API endpoints with proper authentication
 */

import { getConfig, type Config } from "./config.js";
import { handleApiError, createErrorResponse, formatErrorForMcp, type ErrorResponse } from "./utils/errors.js";

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

  /**
   * Makes a GET request to the Pipedrive API
   */
  async get<T>(
    endpoint: string,
    params?: URLSearchParams,
    version: ApiVersion = "v2"
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", endpoint, params, undefined, version);
  }

  /**
   * Makes a POST request to the Pipedrive API
   */
  async post<T>(
    endpoint: string,
    body: Record<string, unknown>,
    version: ApiVersion = "v2"
  ): Promise<ApiResponse<T>> {
    return this.request<T>("POST", endpoint, undefined, body, version);
  }

  /**
   * Makes a PATCH request to the Pipedrive API
   */
  async patch<T>(
    endpoint: string,
    body: Record<string, unknown>,
    version: ApiVersion = "v2"
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", endpoint, undefined, body, version);
  }

  /**
   * Makes a PUT request to the Pipedrive API
   */
  async put<T>(
    endpoint: string,
    body: Record<string, unknown>,
    version: ApiVersion = "v2"
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", endpoint, undefined, body, version);
  }

  /**
   * Makes a DELETE request to the Pipedrive API
   */
  async delete<T>(
    endpoint: string,
    version: ApiVersion = "v2"
  ): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", endpoint, undefined, undefined, version);
  }

  /**
   * Core request method
   */
  private async request<T>(
    method: string,
    endpoint: string,
    params?: URLSearchParams,
    body?: Record<string, unknown>,
    version: ApiVersion = "v2"
  ): Promise<ApiResponse<T>> {
    const config = this.ensureInitialized();

    const baseUrl = this.getBaseUrl(config, version);
    const url = new URL(`${baseUrl}${endpoint}`);

    // Initialize headers early so auth header can be set before URL params
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    // v2 uses x-api-token header; v1 uses ?api_token= query param
    if (version === "v2") {
      headers["x-api-token"] = config.apiKey;
    } else {
      url.searchParams.set("api_token", config.apiKey);
    }

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

      if (!response.ok) {
        return {
          success: false,
          error: handleApiError(response.status, responseData),
        };
      }

      // Pipedrive API wraps data differently in v1 vs v2
      // v1: { success: true, data: [...] }
      // v2: { success: true, data: [...] }
      // Both use similar structure but v2 may have different pagination

      return {
        success: true,
        data: responseData.data as T,
        additional_data: responseData.additional_data as ApiResponse<T>["additional_data"],
      };
    } catch (error) {
      console.error(`[pipedrive-mcp] Network error: ${error}`);
      return {
        success: false,
        error: createErrorResponse(
          "NETWORK_ERROR",
          error instanceof Error ? error.message : "Unknown network error",
          "Check your internet connection and try again"
        ),
      };
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
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
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
