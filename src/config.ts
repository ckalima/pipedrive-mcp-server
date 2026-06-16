/**
 * Configuration and environment handling for Pipedrive MCP Server
 */

import { resolve } from "node:path";

import { resolveCapabilityMode, type CapabilityMode } from "./capability-modes.js";

export interface Config {
  apiKey: string;
  baseUrlV1: string;
  baseUrlV2: string;
  /** The resolved capability tier (read-only / safe-write / full). See capability-modes.ts. */
  mode: CapabilityMode;
}

/** The environment variable carrying the Pipedrive API token. */
export const ENV_VAR_NAME = "PIPEDRIVE_API_KEY";

/** Exact length of a Pipedrive personal API token. */
export const API_KEY_LENGTH = 40;

/** Pipedrive API base URLs. Single source of truth shared by getConfig() and the
 *  installer's validation client (src/cli/verify-key.ts), so they cannot drift. */
export const BASE_URL_V1 = "https://api.pipedrive.com/v1";
export const BASE_URL_V2 = "https://api.pipedrive.com/api/v2";

/**
 * True iff `key` has the exact API-token length. This is the single format
 * predicate both {@link getConfig} and the installer's `verifyApiKey` enforce,
 * so the env path and the paste path cannot drift on what "valid format" means.
 */
export function isValidApiKeyFormat(key: string): boolean {
  return key.length === API_KEY_LENGTH;
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

  if (!isValidApiKeyFormat(apiKey)) {
    throw new Error(
      `Invalid PIPEDRIVE_API_KEY format: expected a ${API_KEY_LENGTH}-character key. ` +
      "Verify your API key at Pipedrive Settings > Personal preferences > API"
    );
  }

  // Cache the validated token for redaction-only use (see getCachedApiToken()).
  cachedApiToken = apiKey;

  // The resolved capability tier is the single source of truth for destructive access
  // (allowed iff `full`); the runtime gates read resolveCapabilityMode() directly rather
  // than a cached Config field, so there is no second field that could disagree (KTD5).
  const mode = resolveCapabilityMode();

  return {
    apiKey,
    baseUrlV1: BASE_URL_V1,
    baseUrlV2: BASE_URL_V2,
    mode,
  };
}

/**
 * Resolves the operator-configured base directory for product-image `file_path`
 * reads, or null when filesystem reads are disabled (the default).
 *
 * Tool-argument-driven filesystem access is dangerous by default (KTD10): over a
 * local STDIO transport a manipulated agent can name any path the process can
 * read. Reads are therefore deny-by-default and confined to a single operator-
 * chosen directory. Setting `PIPEDRIVE_IMAGE_BASE_DIR` opts in and names the
 * allowlisted root; callers may only read files that resolve under it. Returns
 * the lexically resolved absolute base path, or null when the var is unset/blank.
 *
 * This mirrors the `PIPEDRIVE_ENABLE_DESTRUCTIVE` opt-in posture: a sensitive
 * capability stays off until the operator deliberately enables it.
 */
export function getImageReadBaseDir(): string | null {
  const raw = process.env.PIPEDRIVE_IMAGE_BASE_DIR;
  if (!raw || raw.trim().length === 0) return null;
  return resolve(raw.trim());
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
