/**
 * Integration tests for client.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipedriveClient, getClient } from '../../src/client.js';
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
