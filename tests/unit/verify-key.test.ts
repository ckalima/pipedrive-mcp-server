/**
 * Unit tests for pasted-key validation (U2).
 */

import { describe, it, expect, vi } from 'vitest';
import { verifyApiKey } from '../../src/cli/verify-key.js';
import { getConfig, isValidApiKeyFormat, API_KEY_LENGTH } from '../../src/config.js';
import { setupEnvWithApiKey } from '../helpers/mockEnv.js';
import {
  mockApiSuccess,
  mockApiError,
  mockFetch,
  mockFetchNetworkError,
} from '../helpers/mockFetch.js';

const KEY_A = 'a'.repeat(40);
const KEY_B = 'b'.repeat(40);

describe('verifyApiKey (U2)', () => {
  describe('format gate', () => {
    it('rejects a 39-char key without making a network call', async () => {
      const mockFn = mockApiSuccess({ name: 'x' });

      const result = await verifyApiKey('a'.repeat(39));

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/40-character/);
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('rejects a 41-char key without making a network call', async () => {
      const mockFn = mockApiSuccess({ name: 'x' });

      const result = await verifyApiKey('a'.repeat(41));

      expect(result.valid).toBe(false);
      expect(mockFn).not.toHaveBeenCalled();
    });
  });

  describe('live identity', () => {
    it('returns valid + parsed name/email on a 200', async () => {
      mockApiSuccess({ name: 'Jane Seller', email: 'jane@example.com' });

      const result = await verifyApiKey(KEY_A);

      expect(result.valid).toBe(true);
      expect(result.user).toEqual({ name: 'Jane Seller', email: 'jane@example.com' });
    });

    it('hits /users/me on v1', async () => {
      const mockFn = mockApiSuccess({ name: 'Jane' });

      await verifyApiKey(KEY_A);

      const [url] = mockFn.mock.calls[0];
      expect(String(url)).toContain('/v1/users/me');
    });

    it('returns a friendly, token-free message on a 401', async () => {
      mockApiError(401, 'unauthorized');

      const result = await verifyApiKey(KEY_A);

      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).not.toContain(KEY_A);
    });

    it('treats a /users/me 404 as a plain failure, NOT a retirement signal (bypasses version-routing)', async () => {
      mockApiError(404, 'not found');

      const result = await verifyApiKey(KEY_A);

      expect(result.valid).toBe(false);
      // The version-routing seam would render a "retired by Pipedrive" envelope; the
      // direct client call must not. A friendly not-found reason is returned instead.
      expect(result.error).not.toMatch(/retired/i);
    });
  });

  describe('token-accepting seam (KTD2 / R13)', () => {
    it('authenticates a re-prompt against the NEW key on the wire, not a cached first key', async () => {
      const mockFn = mockApiSuccess({ name: 'Jane' });

      await verifyApiKey(KEY_A);
      await verifyApiKey(KEY_B);

      // v1 auth rides the URL query (?api_token=). The second attempt must carry KEY_B.
      const [secondUrl] = mockFn.mock.calls[1];
      expect(String(secondUrl)).toContain(KEY_B);
      expect(String(secondUrl)).not.toContain(KEY_A);
    });

    it('fully redacts the pasted key on a first-attempt network error (no cached config)', async () => {
      mockFetchNetworkError(`connect ECONNREFUSED for ?api_token=${KEY_A}`);

      const result = await verifyApiKey(KEY_A);

      expect(result.valid).toBe(false);
      expect(result.error).not.toContain(KEY_A);
    });

    it('redacts the BARE 40-char key reflected in an error body (not just the query form)', async () => {
      // A backend message echoing the bare key — no ?api_token= wrapper — must still
      // be stripped, because redaction is keyed off the literal pasted value.
      mockFetch({ status: 400, ok: false, error: `rejected key ${KEY_A} for account` });

      const result = await verifyApiKey(KEY_A);

      expect(result.valid).toBe(false);
      expect(result.error).not.toContain(KEY_A);
    });
  });
});

describe('isValidApiKeyFormat shares getConfig()\'s predicate (U2)', () => {
  it('accepts exactly API_KEY_LENGTH chars and rejects off-by-one', () => {
    expect(isValidApiKeyFormat('a'.repeat(API_KEY_LENGTH))).toBe(true);
    expect(isValidApiKeyFormat('a'.repeat(API_KEY_LENGTH - 1))).toBe(false);
    expect(isValidApiKeyFormat('a'.repeat(API_KEY_LENGTH + 1))).toBe(false);
  });

  it('agrees with getConfig() on the same length boundary (parity)', () => {
    setupEnvWithApiKey('a'.repeat(API_KEY_LENGTH));
    expect(() => getConfig()).not.toThrow();
    expect(isValidApiKeyFormat('a'.repeat(API_KEY_LENGTH))).toBe(true);

    setupEnvWithApiKey('a'.repeat(API_KEY_LENGTH - 1));
    expect(() => getConfig()).toThrow(/40-character/);
    expect(isValidApiKeyFormat('a'.repeat(API_KEY_LENGTH - 1))).toBe(false);
  });
});
