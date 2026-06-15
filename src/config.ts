/**
 * Configuration and environment handling for Pipedrive MCP Server
 */

export interface Config {
  apiKey: string;
  baseUrlV1: string;
  baseUrlV2: string;
  enableDestructive: boolean;
}

/**
 * Last successfully loaded API token, cached for redaction-only use. Populated by
 * getConfig() on a successful load. See getCachedApiToken().
 */
let cachedApiToken: string | null = null;

/**
 * Non-throwing accessor for the configured API token, for SECRET REDACTION ONLY.
 *
 * Returns the token last loaded by getConfig(), falling back to the current
 * environment value, or null if neither is available. Unlike getConfig() it never
 * throws and does not validate length — its sole purpose is to give redaction code
 * that has no Config in hand (notably the dispatcher catch block in index.ts) the
 * literal secret value to strip from error/log strings. Never use it to gate
 * behavior or as a substitute for getConfig().
 */
export function getCachedApiToken(): string | null {
  return cachedApiToken ?? (process.env.PIPEDRIVE_API_KEY || null);
}

/**
 * Validates and returns the configuration from environment variables
 * @throws Error if required configuration is missing or invalid
 */
export function getConfig(): Config {
  const apiKey = process.env.PIPEDRIVE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "PIPEDRIVE_API_KEY environment variable is required. " +
      "Get your API key from Pipedrive Settings > Personal preferences > API"
    );
  }

  if (apiKey.length !== 40) {
    throw new Error(
      "Invalid PIPEDRIVE_API_KEY format: expected a 40-character key. " +
      "Verify your API key at Pipedrive Settings > Personal preferences > API"
    );
  }

  // Cache the validated token for redaction-only use (see getCachedApiToken()).
  cachedApiToken = apiKey;

  return {
    apiKey,
    baseUrlV1: "https://api.pipedrive.com/v1",
    baseUrlV2: "https://api.pipedrive.com/api/v2",
    enableDestructive: process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE === "true",
  };
}

/**
 * Validates config without throwing - returns validation result
 */
export function validateConfig(): { valid: boolean; error?: string } {
  try {
    getConfig();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown configuration error",
    };
  }
}
