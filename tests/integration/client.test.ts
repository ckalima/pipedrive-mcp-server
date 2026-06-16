/**
 * Integration tests for client.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipedriveClient, getClient } from '../../src/client.js';
import { leadsV1 } from '../../src/version-routing.js';
import {
  getBreakerState,
  setResilienceSleepForTests,
  RETRY_MAX_ATTEMPTS,
  RETRY_BUDGET_MS,
  RETRY_AFTER_CAP_MS,
  BREAKER_COOLDOWN_MS,
} from '../../src/resilience.js';
import { setupValidEnv, clearApiKey, VALID_API_KEY } from '../helpers/mockEnv.js';
import {
  mockFetch,
  mockFetchNetworkError,
  mockApiSuccess,
  mockApiError,
  fixtures,
  paginationFixtures,
} from '../helpers/mockFetch.js';

describe('PipedriveClient', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should defer config loading until first use', () => {
      clearApiKey();
      // Client creation should not throw
      const client = new PipedriveClient();
      expect(client).toBeDefined();
    });

    it('should throw error on first use if API key is missing', async () => {
      clearApiKey();
      const client = new PipedriveClient();
      mockFetch({ data: [] });

      await expect(client.get('/deals', undefined, 'v2')).rejects.toThrow('PIPEDRIVE_API_KEY');
    });
  });

  describe('GET requests', () => {
    it('should make GET request with correct URL and headers', async () => {
      const mockFn = mockApiSuccess([fixtures.deal]);
      const client = new PipedriveClient();

      await client.get('/deals', undefined, 'v2');

      expect(mockFn).toHaveBeenCalledTimes(1);
      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals');
      expect(url).not.toContain('api_token');
      expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
      expect(options.method).toBe('GET');
      expect(options.headers.Accept).toBe('application/json');
    });

    it('should set an abort signal with a timeout on requests', async () => {
      const mockFn = mockApiSuccess([fixtures.deal]);
      const client = new PipedriveClient();

      await client.get('/deals', undefined, 'v2');

      const [, options] = mockFn.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should include query parameters', async () => {
      const mockFn = mockApiSuccess([]);
      const client = new PipedriveClient();
      const params = new URLSearchParams();
      params.set('status', 'open');
      params.set('limit', '50');

      await client.get('/deals', params, 'v2');

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('status=open');
      expect(url).toContain('limit=50');
    });

    it('should use v1 API when specified', async () => {
      const mockFn = mockApiSuccess([]);
      const client = new PipedriveClient();

      await client.get('/users', undefined, 'v1');

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/users');
      expect(url).not.toContain('/api/v2');
    });

    it('should use v2 API by default', async () => {
      const mockFn = mockApiSuccess([]);
      const client = new PipedriveClient();

      await client.get('/deals', undefined, 'v2');

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals');
    });

    it('should return data on success', async () => {
      mockApiSuccess([fixtures.deal, fixtures.deal]);
      const client = new PipedriveClient();

      const response = await client.get<typeof fixtures.deal[]>('/deals', undefined, 'v2');

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
    });

    it('should return pagination data for v2', async () => {
      mockFetch({
        data: [fixtures.deal],
        additional_data: paginationFixtures.v2WithMore,
      });
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(true);
      expect(response.additional_data?.next_cursor).toBe('cursor_abc123');
    });
  });

  describe('authentication', () => {
    it('v2 calls: sets x-api-token header, not query param', async () => {
      const mockFn = mockApiSuccess([fixtures.deal]);
      const client = new PipedriveClient();

      await client.get('/deals', undefined, 'v2');

      const [url, options] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
      expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
    });

    it('v1 calls: sets api_token query param, not header', async () => {
      const mockFn = mockApiSuccess([]);
      const client = new PipedriveClient();

      await client.get('/users', undefined, 'v1');

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain(`api_token=${VALID_API_KEY}`);
      expect(options.headers['x-api-token']).toBeUndefined();
    });

    it('v2 POST calls: sets x-api-token header', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);
      const client = new PipedriveClient();

      await client.post('/deals', { title: 'New' }, 'v2');

      const [url, options] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
      expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
    });

    it('v2 PATCH calls: sets x-api-token header', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);
      const client = new PipedriveClient();

      await client.patch('/deals/1', { title: 'Updated' }, 'v2');

      const [url, options] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
      expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
    });

    it('v2 DELETE calls: sets x-api-token header', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const client = new PipedriveClient();

      await client.delete('/deals/1', 'v2');

      const [url, options] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
      expect(options.headers['x-api-token']).toBe(VALID_API_KEY);
    });

    it('testConnection (v1): uses query param auth', async () => {
      const mockFn = mockApiSuccess({ id: 1, name: 'Test User' });
      const client = new PipedriveClient();

      await client.testConnection();

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain(`api_token=${VALID_API_KEY}`);
      expect(options.headers['x-api-token']).toBeUndefined();
    });
  });

  describe('POST requests', () => {
    it('should make POST request with JSON body', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);
      const client = new PipedriveClient();

      await client.post('/deals', { title: 'New Deal', value: 10000 }, 'v2');

      const [url, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ title: 'New Deal', value: 10000 });
    });

    it('should return created data', async () => {
      mockApiSuccess(fixtures.deal);
      const client = new PipedriveClient();

      const response = await client.post('/deals', { title: 'Test' }, 'v2');

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
  });

  describe('PATCH requests', () => {
    it('should make PATCH request', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);
      const client = new PipedriveClient();

      await client.patch('/deals/1', { title: 'Updated' }, 'v2');

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);
      const client = new PipedriveClient();

      await client.put('/deals/1', { title: 'Replaced' }, 'v2');

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PUT');
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const client = new PipedriveClient();

      await client.delete('/deals/1', 'v2');

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('DELETE');
      expect(options.body).toBeUndefined();
    });

    it('should return deleted data', async () => {
      mockApiSuccess({ id: 1 });
      const client = new PipedriveClient();

      const response = await client.delete('/deals/1', 'v2');

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ id: 1 });
    });
  });

  // U0: top-level array request bodies + body-bearing DELETE for field-options sub-verbs
  describe('array request bodies (U0)', () => {
    it('PATCH sends a top-level JSON array body', async () => {
      const mockFn = mockApiSuccess([{ id: 1, label: 'Renamed' }]);
      const client = new PipedriveClient();

      await client.patch('/dealFields/abc/options', [{ id: 1, label: 'Renamed' }], 'v2');

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual([{ id: 1, label: 'Renamed' }]);
    });

    it('POST sends a top-level JSON array body', async () => {
      const mockFn = mockApiSuccess([{ id: 1 }]);
      const client = new PipedriveClient();

      await client.post('/dealFields/abc/options', [{ id: 1 }], 'v2');

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual([{ id: 1 }]);
    });

    it('DELETE sends a top-level JSON array body when one is supplied', async () => {
      const mockFn = mockApiSuccess([{ id: 1, label: 'Removed' }]);
      const client = new PipedriveClient();

      await client.delete('/dealFields/abc/options', 'v2', [{ id: 1 }]);

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('DELETE');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual([{ id: 1 }]);
    });

    it('two-arg DELETE still sends no body (no regression)', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const client = new PipedriveClient();

      await client.delete('/deals/1', 'v2');

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('DELETE');
      expect(options.body).toBeUndefined();
      expect(options.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle 400 Bad Request', async () => {
      mockApiError(400, 'Invalid parameter value');
      const client = new PipedriveClient();

      const response = await client.post('/deals', {}, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should handle 401 Unauthorized', async () => {
      mockApiError(401, 'Invalid API key');
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('INVALID_API_KEY');
    });

    it('should handle 403 Forbidden', async () => {
      mockApiError(403, 'Access denied');
      const client = new PipedriveClient();

      const response = await client.get('/deals/1', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('PERMISSION_DENIED');
    });

    it('should handle 404 Not Found', async () => {
      mockApiError(404, 'Deal not found');
      const client = new PipedriveClient();

      const response = await client.get('/deals/99999', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('should handle 429 Rate Limited', async () => {
      mockApiError(429, 'Too many requests');
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('RATE_LIMITED');
    });

    it('should handle 500 Server Error', async () => {
      mockApiError(500, 'Internal server error');
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('API_ERROR');
    });

    it('should handle network errors', async () => {
      mockFetchNetworkError('Connection refused');
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.error?.message).toContain('Connection refused');
    });

    it('AE2: redacts the v1 token from a network error that embeds the request URL', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Reject with an error whose message embeds the full v1 URL (token in query).
      const mockFn = vi.fn(async (url: string | URL) => {
        throw new Error(`request to ${String(url)} failed`);
      });
      vi.stubGlobal('fetch', mockFn);
      const client = new PipedriveClient();

      const response = await client.get('/users', undefined, 'v1');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.error?.message).not.toContain(VALID_API_KEY);
      const stderr = errorSpy.mock.calls.flat().map(String).join('\n');
      expect(stderr).not.toContain(VALID_API_KEY);
      errorSpy.mockRestore();
    });
  });

  // U1/KTD4: the seam needs a reliable HTTP status to discriminate retirement,
  // even when a retired endpoint returns an empty/non-JSON body.
  describe('HTTP status capture (U1, KTD4)', () => {
    it('exposes the HTTP status on a non-OK response with a valid JSON body', async () => {
      mockApiError(400, 'Invalid parameter value');
      const client = new PipedriveClient();

      const response = await client.get('/notes', undefined, 'v1');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('VALIDATION_ERROR');
      expect(response.httpStatus).toBe(400);
    });

    it('exposes the HTTP status on a successful response (200)', async () => {
      mockApiSuccess([fixtures.note]);
      const client = new PipedriveClient();

      const response = await client.get('/notes', undefined, 'v1');

      expect(response.success).toBe(true);
      expect(response.httpStatus).toBe(200);
    });

    it('a 410 with an empty/non-JSON body yields a status-bearing error carrying 410, not NETWORK_ERROR', async () => {
      // A retired endpoint may return 410 Gone with no JSON body. Today that throws
      // at parse time and is lost as a status-less network error; the seam needs the
      // 410 to survive (this is the retirement-at-sunset case R5 depends on).
      const mockFn = vi.fn(async (): Promise<Response> => ({
        ok: false,
        status: 410,
        statusText: 'Gone',
        headers: new Headers(),
        json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
        text: async () => '',
      } as unknown as Response));
      vi.stubGlobal('fetch', mockFn);
      const client = new PipedriveClient();

      const response = await client.get('/notes', undefined, 'v1');

      expect(response.success).toBe(false);
      expect(response.httpStatus).toBe(410);
      expect(response.error?.code).not.toBe('NETWORK_ERROR');
    });

    it('a genuine network failure produces NETWORK_ERROR with NO http status', async () => {
      mockFetchNetworkError('Connection refused');
      const client = new PipedriveClient();

      const response = await client.get('/notes', undefined, 'v1');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.httpStatus).toBeUndefined();
    });

    it('keeps the public ErrorResponse shape unchanged (status is not a rendered error field)', async () => {
      mockApiError(404, 'Note not found');
      const client = new PipedriveClient();

      const response = await client.get('/notes/99999', undefined, 'v1');

      expect(response.error).toBeDefined();
      expect(Object.keys(response.error!).sort()).toEqual(['code', 'message', 'suggestion']);
      expect(response.error).not.toHaveProperty('httpStatus');
    });
  });

  describe('testConnection', () => {
    it('should return success on valid connection', async () => {
      mockApiSuccess({ id: 1, name: 'Test User' });
      const client = new PipedriveClient();

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully connected');
    });

    it('should return failure on API error', async () => {
      mockApiError(401, 'Invalid API key');
      const client = new PipedriveClient();

      const result = await client.testConnection();

      expect(result.success).toBe(false);
    });

    it('should use v1 API for connection test', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const client = new PipedriveClient();

      await client.testConnection();

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/users/me');
    });
  });
});

describe('getClient', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  it('should return a PipedriveClient instance', () => {
    const client = getClient();
    expect(client).toBeInstanceOf(PipedriveClient);
  });

  it('should return the same instance on multiple calls (singleton)', () => {
    const client1 = getClient();
    const client2 = getClient();
    expect(client1).toBe(client2);
  });
});

// ─── U3: resilience driver (retry + circuit breaker) ──────────────────────────
//
// The global setup (tests/setup.ts) resets the breaker and installs a no-op sleep
// before every test, so no real backoff wait runs. These tests install a RECORDING
// sleep so honored-wait amounts can be asserted deterministically — the budget is
// debited by the computed wait value, not by a wall-clock delta (KTD9 alternative).
describe('resilience: retry + circuit breaker (U3)', () => {
  let waits: number[];

  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
    waits = [];
    // Record (but do not actually wait) each backoff/Retry-After sleep.
    setResilienceSleepForTests((ms) => {
      waits.push(ms);
      return Promise.resolve();
    });
  });

  describe('retry decision (R2/R3)', () => {
    it('AE2: read 429 with Retry-After within cap waits the honored interval, retries, succeeds', async () => {
      const mockFn = mockFetch([
        { status: 429, ok: false, error: 'rate', headers: { 'Retry-After': '1' } },
        { status: 200, data: [fixtures.deal] },
      ]);
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(true);
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(waits).toEqual([1000]); // Retry-After: 1s honored
    });

    it('AE1: a write that throws a network error returns NETWORK_ERROR with NO retry', async () => {
      const mockFn = mockFetchNetworkError('Connection refused');
      const client = new PipedriveClient();

      const response = await client.post('/deals', { title: 'x' }, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(mockFn).toHaveBeenCalledTimes(1); // never re-sent (idempotency, KTD2)
    });

    it('read network error retries then succeeds (2 calls)', async () => {
      let call = 0;
      const mockFn = vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error('ECONNRESET');
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => ({ success: true, data: [fixtures.deal] }),
        } as Response;
      });
      vi.stubGlobal('fetch', mockFn);
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(true);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('write 429 is retried (POST [429, 200] -> success, 2 calls)', async () => {
      const mockFn = mockFetch([
        { status: 429, ok: false, error: 'rate' },
        { status: 200, data: fixtures.deal },
      ]);
      const client = new PipedriveClient();

      const response = await client.post('/deals', { title: 'x' }, 'v2');

      expect(response.success).toBe(true);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('write 503 is NOT retried (POST [503] -> error, 1 call)', async () => {
      const mockFn = mockApiError(503, 'unavailable');
      const client = new PipedriveClient();

      const response = await client.post('/deals', { title: 'x' }, 'v2');

      expect(response.success).toBe(false);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('read 503 is retried (GET [503, 200] -> success, 2 calls)', async () => {
      const mockFn = mockFetch([
        { status: 503, ok: false, error: 'unavailable' },
        { status: 200, data: [fixtures.deal] },
      ]);
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(true);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('read 5xx is retried (GET [500, 200] -> success, 2 calls)', async () => {
      const mockFn = mockFetch([
        { status: 500, ok: false, error: 'boom' },
        { status: 200, data: [fixtures.deal] },
      ]);
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(true);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('write 5xx is NOT retried (POST [500] -> error, 1 call)', async () => {
      const mockFn = mockApiError(500, 'boom');
      const client = new PipedriveClient();

      const response = await client.post('/deals', { title: 'x' }, 'v2');

      expect(response.success).toBe(false);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it.each([400, 401, 403, 404])('non-429 4xx (%d) is not retried (1 call)', async (status) => {
      const mockFn = mockApiError(status, 'nope');
      const client = new PipedriveClient();

      await client.get('/deals/1', undefined, 'v2');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('budget + attempt caps (R4, KTD3, KTD6)', () => {
    it('attempt cap: all-429 read stops after RETRY_MAX_ATTEMPTS and returns RATE_LIMITED', async () => {
      const mockFn = mockApiError(429, 'rate');
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('RATE_LIMITED');
      expect(mockFn).toHaveBeenCalledTimes(RETRY_MAX_ATTEMPTS);
    });

    it('AE3: Retry-After above the cap is clamped, and a still-limited read surfaces RATE_LIMITED within budget', async () => {
      const mockFn = mockApiError(429, 'rate', { 'Retry-After': '600' });
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.error?.code).toBe('RATE_LIMITED');
      // Each honored wait is clamped to the cap, and the total stays within budget.
      for (const w of waits) expect(w).toBeLessThanOrEqual(RETRY_AFTER_CAP_MS);
      const total = waits.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(RETRY_BUDGET_MS);
      expect(mockFn.mock.calls.length).toBeLessThanOrEqual(RETRY_MAX_ATTEMPTS);
    });

    it('Retry-After near the remaining budget bails instead of sleeping a truncated wait', async () => {
      // First wait 16s leaves ~14s; the second hint (15s) exceeds it -> bail.
      const mockFn = mockFetch([
        { status: 429, ok: false, error: 'rate', headers: { 'Retry-After': '16' } },
        { status: 429, ok: false, error: 'rate', headers: { 'Retry-After': '15' } },
        { status: 200, data: [fixtures.deal] },
      ]);
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('RATE_LIMITED');
      expect(waits).toEqual([16000]); // slept once, then bailed before the 15s hint
      expect(mockFn).toHaveBeenCalledTimes(2); // never reached the 200
    });

    it('all-timeout read path is bounded: <= RETRY_MAX_ATTEMPTS calls and waits within budget', async () => {
      const mockFn = mockFetchNetworkError('Request timeout');
      const client = new PipedriveClient();

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(mockFn.mock.calls.length).toBeLessThanOrEqual(RETRY_MAX_ATTEMPTS);
      const total = waits.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(RETRY_BUDGET_MS);
    });

    it('debits retry-attempt durations against the budget (slow timeouts stop the loop before the attempt cap)', async () => {
      // Regression guard for the KTD3 added-wall-clock bound. The rest of the suite
      // uses instant mocks, so the per-attempt-duration debit is never exercised and
      // a deletion of it would go unnoticed. Here each attempt "consumes" ~28s of
      // (faked) wall-clock, so the ~30s budget is spent after a single retry and the
      // loop bails BEFORE reaching the 4-attempt cap. Without the duration debit the
      // loop would run the full RETRY_MAX_ATTEMPTS attempts instead.
      vi.useFakeTimers();
      try {
        const base = Date.now();
        let now = base;
        const mockFn = vi.fn(async () => {
          now += 28_000; // simulate a slow attempt that ends in a timeout
          vi.setSystemTime(now);
          throw new Error('Request timeout');
        });
        vi.stubGlobal('fetch', mockFn);
        const client = new PipedriveClient();

        const response = await client.get('/deals', undefined, 'v2');

        expect(response.error?.code).toBe('NETWORK_ERROR');
        expect(mockFn.mock.calls.length).toBeLessThan(RETRY_MAX_ATTEMPTS);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('circuit breaker (R5, R6, R7, AE4, AE5)', () => {
    it('AE5: a 410 on a registered v1-only endpoint is not retried and surfaces retirement immediately', async () => {
      const mockFn = mockFetch({ status: 410, ok: false, error: 'gone' });

      const response = await leadsV1.get('/leads', undefined);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('CAPABILITY_RETIRED');
      expect(mockFn).toHaveBeenCalledTimes(1); // 410 is non-transient (R5)
    });

    it('AE4: five trip signals within the window open the breaker; the next call fast-fails with no request', async () => {
      // POST + 503 is a single-attempt trip signal (writes do not retry 503), so
      // five such calls accumulate exactly five trip signals within the window.
      mockApiError(503, 'unavailable');
      const client = new PipedriveClient();
      for (let i = 0; i < 5; i++) {
        await client.post('/deals', { title: 'x' }, 'v2');
      }
      expect(getBreakerState()).toBe('Open');

      // Swap in a fresh spy: the next call must issue ZERO upstream requests.
      const afterOpen = vi.fn();
      vi.stubGlobal('fetch', afterOpen);

      const response = await client.get('/deals', undefined, 'v2');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('CIRCUIT_OPEN');
      expect(afterOpen).not.toHaveBeenCalled();
    });

    it('repeated 429 reads also open the breaker across calls', async () => {
      mockApiError(429, 'rate');
      const client = new PipedriveClient();
      // Each all-429 read contributes RETRY_MAX_ATTEMPTS trip signals; two calls
      // exceed the threshold of 5.
      await client.get('/deals', undefined, 'v2');
      await client.get('/deals', undefined, 'v2');
      expect(getBreakerState()).toBe('Open');

      const afterOpen = vi.fn();
      vi.stubGlobal('fetch', afterOpen);
      const response = await client.get('/deals', undefined, 'v2');
      expect(response.error?.code).toBe('CIRCUIT_OPEN');
      expect(afterOpen).not.toHaveBeenCalled();
    });

    it('half-open probe issues exactly one upstream request for a retryable read 500 (internal retry disabled)', async () => {
      vi.useFakeTimers();
      try {
        mockApiError(503, 'unavailable');
        const client = new PipedriveClient();
        for (let i = 0; i < 5; i++) await client.post('/deals', { title: 'x' }, 'v2');
        expect(getBreakerState()).toBe('Open');

        // Cooldown elapses -> the next call becomes the single half-open probe.
        vi.setSystemTime(Date.now() + BREAKER_COOLDOWN_MS + 1);
        const probeMock = mockApiError(500, 'boom'); // a read 500 is normally retried...

        const response = await client.get('/deals', undefined, 'v2');

        expect(response.success).toBe(false);
        expect(probeMock).toHaveBeenCalledTimes(1); // ...but the probe runs once, no retry
        expect(getBreakerState()).toBe('Open'); // a non-success probe reopens the breaker
      } finally {
        vi.useRealTimers();
      }
    });

    it('AE1 ∩ probe: a half-open probe that is a write hitting a network error does not retry and reopens', async () => {
      vi.useFakeTimers();
      try {
        mockApiError(503, 'unavailable');
        const client = new PipedriveClient();
        for (let i = 0; i < 5; i++) await client.post('/deals', { title: 'x' }, 'v2');
        vi.setSystemTime(Date.now() + BREAKER_COOLDOWN_MS + 1);
        const probeMock = mockFetchNetworkError('Connection refused');

        const response = await client.post('/deals', { title: 'x' }, 'v2');

        expect(response.error?.code).toBe('NETWORK_ERROR');
        expect(probeMock).toHaveBeenCalledTimes(1); // write never re-sent (AE1)
        expect(getBreakerState()).toBe('Open'); // probe failure reopens
      } finally {
        vi.useRealTimers();
      }
    });

    it('#123: concurrent interleaved 429/503 load opens the breaker reliably despite an interleaved success', async () => {
      // Fire several un-awaited in-flight writes at once — the concurrency the breaker
      // guards, which the rest of the suite never exercised. POST + 503 is a single-
      // attempt trip signal and POST + 200 a single-attempt success, so the shared mock
      // hands each concurrent call exactly one sequenced response. All callers pass the
      // Closed gate before any outcome is recorded, so six trip signals land regardless
      // of scheduling and the windowed breaker opens. The interleaved success is a no-op
      // under the window; under the old consecutive counter it could have reset progress
      // mid-storm (that distinction is proven deterministically in the resilience unit
      // tests — here we assert the real async path opens reliably).
      const mockFn = mockFetch([
        { status: 503, ok: false, error: 'unavailable' },
        { status: 503, ok: false, error: 'unavailable' },
        { status: 503, ok: false, error: 'unavailable' },
        { status: 200, data: fixtures.deal }, // healthy concurrent request interleaves a success
        { status: 503, ok: false, error: 'unavailable' },
        { status: 503, ok: false, error: 'unavailable' },
        { status: 503, ok: false, error: 'unavailable' },
      ]);
      const client = new PipedriveClient();

      // Launch all in-flight without awaiting each; settle them together.
      const inFlight = Array.from({ length: 7 }, () =>
        client.post('/deals', { title: 'x' }, 'v2'),
      );
      await Promise.all(inFlight);

      // Exactly one upstream call per write (POST+503 is single-attempt, no retry):
      // six of them are trip signals, well above the threshold of 5, so the breaker
      // opens regardless of settlement order. Pinning the count guards against a
      // future change that retries POSTs and silently alters the trip-signal budget.
      expect(mockFn).toHaveBeenCalledTimes(7);
      expect(getBreakerState()).toBe('Open');

      // The breaker now fast-fails the next call with no upstream request.
      const afterOpen = vi.fn();
      vi.stubGlobal('fetch', afterOpen);
      const response = await client.get('/deals', undefined, 'v2');
      expect(response.error?.code).toBe('CIRCUIT_OPEN');
      expect(afterOpen).not.toHaveBeenCalled();
    });
  });

  describe('telemetry (R8)', () => {
    it('logs once per attempt on a retried v1 GET and never leaks the token or full URL', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch([
        { status: 429, ok: false, error: 'rate' },
        { status: 200, data: [fixtures.user] },
      ]);
      const client = new PipedriveClient();

      await client.get('/users', undefined, 'v1');

      const lines = errorSpy.mock.calls.flat().map(String);
      const attemptLines = lines.filter((l) => /\[pipedrive-mcp\].*attempt \d+\//.test(l));
      expect(attemptLines).toHaveLength(2); // one per attempt
      const stderr = lines.join('\n');
      expect(stderr).not.toContain(VALID_API_KEY);
      expect(stderr).not.toContain('api_token=');
      errorSpy.mockRestore();
    });

    it('path-templates a CRM record id out of the logged endpoint (no record id reaches stderr)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const leadUuid = '550e8400-e29b-41d4-a716-446655440000';
      mockFetch([
        { status: 429, ok: false, error: 'rate' },
        { status: 200, data: fixtures.lead },
      ]);
      const client = new PipedriveClient();

      await client.get(`/leads/${leadUuid}`, undefined, 'v1');

      const stderr = errorSpy.mock.calls.flat().map(String).join('\n');
      expect(stderr).not.toContain(leadUuid); // the record id is templated out
      expect(stderr).toContain('/leads/:id'); // ...replaced by the static template
      errorSpy.mockRestore();
    });
  });
});

// ─── U5 isolation regression: breaker state must not bleed across tests ────────
// These two tests rely SOLELY on the global beforeEach (tests/setup.ts) resetting
// the breaker. The first opens it; the second must observe a fresh Closed breaker.
describe('breaker isolation regression (U5, R9)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  it('opens the breaker', async () => {
    mockApiError(503, 'unavailable');
    const client = new PipedriveClient();
    for (let i = 0; i < 5; i++) {
      await client.post('/deals', { title: 'x' }, 'v2');
    }
    expect(getBreakerState()).toBe('Open');
  });

  it('starts Closed in the next test (global reset cleared the bleed)', () => {
    expect(getBreakerState()).toBe('Closed');
  });
});
