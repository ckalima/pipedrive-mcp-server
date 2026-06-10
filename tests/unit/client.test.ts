/**
 * Unit tests for PipedriveClient routing logic.
 *
 * Verifies that get/post/patch/put/delete correctly route to the v1 or v2
 * base URL and use the appropriate auth mechanism per version.
 *
 * v1: https://api.pipedrive.com/v1  + api_token query param
 * v2: https://api.pipedrive.com/api/v2  + x-api-token header
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipedriveClient } from '../../src/client.js';
import { VALID_API_KEY, setupEnvWithApiKey } from '../helpers/mockEnv.js';

function makeFetchMock() {
  const mockFn = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({ success: true, data: {} }),
    text: async () => '{"success":true,"data":{}}',
    clone() { return this; },
  }) as Response);
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

describe('PipedriveClient routing', () => {
  beforeEach(() => {
    setupEnvWithApiKey(VALID_API_KEY);
  });

  describe('v1 routing', () => {
    it('get with v1 builds URL containing /v1/<endpoint> and sends api_token as query param', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.get('/notes', undefined, 'v1');

      expect(mockFn).toHaveBeenCalledOnce();
      const [url, init] = mockFn.mock.calls[0];
      const urlStr = String(url);

      // Must hit the v1 base
      expect(urlStr).toContain('/v1/notes');
      // api_token must be in the query string (v1 auth)
      expect(urlStr).toContain(`api_token=${VALID_API_KEY}`);
      // x-api-token header must NOT be present on v1 requests
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['x-api-token']).toBeUndefined();
    });

    it('get with v1 does NOT use the v2 base URL', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.get('/notes', undefined, 'v1');

      const [url] = mockFn.mock.calls[0];
      expect(String(url)).not.toContain('/api/v2');
    });
  });

  describe('v2 routing', () => {
    it('get with v2 builds URL containing /api/v2/<endpoint> and sends x-api-token header', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.get('/persons', undefined, 'v2');

      expect(mockFn).toHaveBeenCalledOnce();
      const [url, init] = mockFn.mock.calls[0];
      const urlStr = String(url);

      // Must hit the v2 base
      expect(urlStr).toContain('/api/v2/persons');
      // api_token must NOT appear in the query string on v2
      expect(urlStr).not.toContain('api_token=');
      // x-api-token header must be set (v2 auth)
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['x-api-token']).toBe(VALID_API_KEY);
    });

    it('get with v2 does NOT use the v1 base URL', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.get('/persons', undefined, 'v2');

      const [url] = mockFn.mock.calls[0];
      // /api/v2 is correct; bare /v1 should not appear
      expect(String(url)).not.toMatch(/\/v1\//);
    });

    it('post with v2 sends x-api-token header and no api_token query param', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.post('/persons', { name: 'Test' }, 'v2');

      const [url, init] = mockFn.mock.calls[0];
      expect(String(url)).toContain('/api/v2/persons');
      expect(String(url)).not.toContain('api_token=');
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['x-api-token']).toBe(VALID_API_KEY);
      expect(init?.method).toBe('POST');
    });

    it('delete with v2 sends x-api-token header', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.delete('/persons/42', 'v2');

      const [url, init] = mockFn.mock.calls[0];
      expect(String(url)).toContain('/api/v2/persons/42');
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['x-api-token']).toBe(VALID_API_KEY);
      expect(init?.method).toBe('DELETE');
    });
  });

  describe('query param forwarding', () => {
    it('passes URLSearchParams through to the outbound URL', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();
      const params = new URLSearchParams({ limit: '10', cursor: 'abc' });

      await client.get('/deals', params, 'v2');

      const [url] = mockFn.mock.calls[0];
      expect(String(url)).toContain('limit=10');
      expect(String(url)).toContain('cursor=abc');
    });

    it('handles undefined params gracefully for v2', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.get('/pipelines', undefined, 'v2');

      const [url] = mockFn.mock.calls[0];
      expect(String(url)).toContain('/api/v2/pipelines');
      // No extra stray params beyond x-api-token (which is a header, not query on v2)
      expect(String(url)).not.toContain('api_token=');
    });

    it('handles undefined params gracefully for v1 (only api_token in query)', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.get('/users', undefined, 'v1');

      const [url] = mockFn.mock.calls[0];
      expect(String(url)).toContain('/v1/users');
      expect(String(url)).toContain(`api_token=${VALID_API_KEY}`);
    });
  });
});

/**
 * Multipart routing (U4, #69).
 *
 * postMultipart/putMultipart must send a FormData body WITHOUT a manual
 * Content-Type, so the fetch/undici layer generates the multipart boundary.
 */
describe('PipedriveClient multipart (U4, #69)', () => {
  beforeEach(() => {
    setupEnvWithApiKey(VALID_API_KEY);
  });

  function makeFormData(): FormData {
    const fd = new FormData();
    fd.append('data', new Blob([Buffer.from('hello')]), 'hello.png');
    return fd;
  }

  describe('postMultipart', () => {
    it('sends x-api-token header and no api_token query param on v2', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.postMultipart('/products/3/images', makeFormData(), 'v2');

      const [url, init] = mockFn.mock.calls[0];
      expect(String(url)).toContain('/api/v2/products/3/images');
      expect(String(url)).not.toContain('api_token=');
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['x-api-token']).toBe(VALID_API_KEY);
      expect(init?.method).toBe('POST');
    });

    it('does NOT set Content-Type: application/json (app-side omission guard)', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.postMultipart('/products/3/images', makeFormData(), 'v2');

      const [, init] = mockFn.mock.calls[0];
      const headers = init?.headers as Record<string, string> | undefined;
      // The client must not set any Content-Type itself — fetch derives the
      // multipart boundary from the FormData body automatically.
      expect(headers?.['Content-Type']).toBeUndefined();
      expect(headers?.['content-type']).toBeUndefined();
    });

    it('sends the FormData instance as the request body (not JSON.stringify-d)', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.postMultipart('/products/3/images', makeFormData(), 'v2');

      const [, init] = mockFn.mock.calls[0];
      expect(init?.body).toBeInstanceOf(FormData);
    });

    it('real-boundary: the actual outbound Content-Type starts with "multipart/form-data; boundary="', async () => {
      // Run the exact init the client builds through the real undici Request
      // encoder (the same machinery fetch uses) to prove the boundary is
      // genuinely generated, not merely that we avoided overriding it.
      let outboundContentType: string | null = null;
      const mockFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
        const req = new Request(String(url), init);
        outboundContentType = req.headers.get('content-type');
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => ({ success: true, data: {} }),
          text: async () => '{"success":true,"data":{}}',
          clone() { return this; },
        } as Response;
      });
      vi.stubGlobal('fetch', mockFn);

      const client = new PipedriveClient();
      await client.postMultipart('/products/3/images', makeFormData(), 'v2');

      expect(outboundContentType).toMatch(/^multipart\/form-data; boundary=/);
    });

    it('returns NETWORK_ERROR on fetch rejection', async () => {
      const mockFn = vi.fn(async () => { throw new Error('boom'); });
      vi.stubGlobal('fetch', mockFn);
      const client = new PipedriveClient();

      const res = await client.postMultipart('/products/3/images', makeFormData(), 'v2');

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('NETWORK_ERROR');
    });

    it('returns an error envelope on HTTP error (e.g. 413 Payload Too Large)', async () => {
      const mockFn = vi.fn(async () => ({
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ success: false, error: 'Payload too large' }),
        text: async () => '{"success":false,"error":"Payload too large"}',
        clone() { return this; },
      }) as Response);
      vi.stubGlobal('fetch', mockFn);
      const client = new PipedriveClient();

      const res = await client.postMultipart('/products/3/images', makeFormData(), 'v2');

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('putMultipart', () => {
    it('uses the PUT method', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.putMultipart('/products/3/images', makeFormData(), 'v2');

      const [url, init] = mockFn.mock.calls[0];
      expect(String(url)).toContain('/api/v2/products/3/images');
      expect(init?.method).toBe('PUT');
    });
  });

  describe('shared-helper regression', () => {
    it('request() (JSON) and postMultipart() emit the same v2 x-api-token auth', async () => {
      const mockFn = makeFetchMock();
      const client = new PipedriveClient();

      await client.get('/products', undefined, 'v2');
      await client.postMultipart('/products/3/images', makeFormData(), 'v2');

      const jsonHeaders = mockFn.mock.calls[0][1]?.headers as Record<string, string> | undefined;
      const multipartHeaders = mockFn.mock.calls[1][1]?.headers as Record<string, string> | undefined;
      expect(jsonHeaders?.['x-api-token']).toBe(VALID_API_KEY);
      expect(multipartHeaders?.['x-api-token']).toBe(VALID_API_KEY);
    });
  });
});
