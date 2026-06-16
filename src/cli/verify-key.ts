/**
 * Pasted-key validation for the guided installer (U2).
 *
 * Validates an arbitrary pasted key — not the env value — by checking its format
 * with the shared {@link isValidApiKeyFormat} predicate and then confirming it
 * live against `GET /users/me` (v1) through a token-accepting client seam (KTD2).
 * Every returned message is redacted against the *currently pasted* key (R13), so
 * a rejected, malformed, or network-failed key never echoes to the terminal or
 * logs — and a re-prompt with a corrected key validates against the new key on
 * the wire, not a frozen first key.
 */

import { createValidationClient } from "../client.js";
import { API_KEY_LENGTH, isValidApiKeyFormat } from "../config.js";
import { redactSecrets } from "../utils/errors.js";

/** The owning user's identity, shown so the operator can confirm the right account. */
export interface VerifiedUser {
  name?: string;
  email?: string;
}

export interface VerifyKeyResult {
  valid: boolean;
  /** Present only on success. */
  user?: VerifiedUser;
  /** Present only on failure — friendly, token-redacted reason. */
  error?: string;
}

/** The `/users/me` (v1) success payload fields the installer surfaces. */
interface UsersMeData {
  name?: string;
  email?: string;
}

/**
 * Validates a pasted key's format and live identity. Returns `{ valid: true,
 * user }` with the owning user's name/email on success, or `{ valid: false,
 * error }` with a token-free reason otherwise. Never throws — a network failure
 * is reported as a redacted `error`.
 */
export async function verifyApiKey(key: string): Promise<VerifyKeyResult> {
  // Format check first, so a malformed paste never reaches the network.
  if (!isValidApiKeyFormat(key)) {
    return {
      valid: false,
      error: `Invalid API key format: expected a ${API_KEY_LENGTH}-character key.`,
    };
  }

  // Seed a fresh client with THIS key (KTD2). Call /users/me directly on the
  // client, bypassing the version-routing seam whose /users/me 404 would be
  // mistaken for a retirement signal.
  const client = createValidationClient(key);

  try {
    const response = await client.get<UsersMeData>("/users/me", undefined, "v1");
    if (response.success) {
      const data = response.data ?? {};
      return { valid: true, user: { name: data.name, email: data.email } };
    }
    // Status-bearing failure (401/403/404/4xx/5xx): surface a friendly reason,
    // re-redacted against the pasted key as defense-in-depth (R13).
    const reason = response.error?.message ?? "Key validation failed.";
    return { valid: false, error: redactSecrets(reason, key) };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error during key validation.";
    return { valid: false, error: redactSecrets(rawMessage, key) };
  }
}
