/**
 * Functional tests for error handling across all HTTP status codes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv, clearApiKey } from '../helpers/mockEnv.js';
import {
  mockApiError,
  mockFetchNetworkError,
} from '../helpers/mockFetch.js';

describe('Error Handling', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('HTTP Status Code Handling', () => {
    it('should handle 400 Bad Request with validation error', async () => {
      mockApiError(400, 'Title cannot be empty');
      const { createDeal } = await import('../../src/tools/deals.js');

      const result = await createDeal({ title: '' });

      expect(result.content[0].text).toContain('VALIDATION_ERROR');
      expect(result.content[0].text).toContain('Check your request parameters');
    });

    it('should handle 401 Unauthorized with API key error', async () => {
      mockApiError(401, 'Invalid API key');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('INVALID_API_KEY');
      expect(result.content[0].text).toContain('invalid or expired');
      expect(result.content[0].text).toContain('Verify your API key');
    });

    it('should handle 403 Forbidden with permission error', async () => {
      mockApiError(403, 'Access denied');
      const { getDeal } = await import('../../src/tools/deals.js');

      const result = await getDeal({ id: 1 });

      expect(result.content[0].text).toContain('PERMISSION_DENIED');
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should handle 404 Not Found', async () => {
      mockApiError(404, 'Deal not found');
      const { getDeal } = await import('../../src/tools/deals.js');

      const result = await getDeal({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('Verify the ID');
    });

    it('should handle 429 Rate Limited', async () => {
      mockApiError(429, 'Rate limit exceeded');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('RATE_LIMITED');
      expect(result.content[0].text).toContain('Rate limit exceeded');
      // The client now auto-retries 429s, so the suggestion is softened (no longer
      // "wait 60 seconds" — the wait already happened in the retry loop).
      expect(result.content[0].text).toContain('retried automatically');
    });

    it('should handle 500 Internal Server Error', async () => {
      mockApiError(500, 'Internal server error');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('API_ERROR');
      expect(result.content[0].text).toContain('500');
    });

    it('should handle 502 Bad Gateway', async () => {
      mockApiError(502, 'Bad gateway');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('API_ERROR');
      expect(result.content[0].text).toContain('502');
    });

    it('should handle 503 Service Unavailable', async () => {
      mockApiError(503, 'Service temporarily unavailable');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('API_ERROR');
      expect(result.content[0].text).toContain('503');
    });
  });

  describe('Network Error Handling', () => {
    it('should handle network connection error', async () => {
      mockFetchNetworkError('Connection refused');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('NETWORK_ERROR');
      expect(result.content[0].text).toContain('Connection refused');
    });

    it('should handle DNS resolution error', async () => {
      mockFetchNetworkError('getaddrinfo ENOTFOUND api.pipedrive.com');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('NETWORK_ERROR');
    });

    it('should handle timeout error', async () => {
      mockFetchNetworkError('Request timeout');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});

      expect(result.content[0].text).toContain('NETWORK_ERROR');
      expect(result.content[0].text).toContain('timeout');
    });
  });

  describe('Configuration Error Handling', () => {
    it('should handle missing API key', async () => {
      clearApiKey();

      // Need to reset the client singleton by reimporting
      // The client defers config loading until first use
      const { PipedriveClient } = await import('../../src/client.js');
      const client = new PipedriveClient();

      // Client initialization should throw when API key is missing
      await expect(client.get('/deals', undefined, 'v2')).rejects.toThrow('PIPEDRIVE_API_KEY');
    });
  });

  describe('Error Handling Across Tools', () => {
    const toolTests = [
      { name: 'persons', getTools: () => import('../../src/tools/persons.js'), operation: 'listPersons' },
      { name: 'activities', getTools: () => import('../../src/tools/activities.js'), operation: 'listActivities' },
      { name: 'organizations', getTools: () => import('../../src/tools/organizations.js'), operation: 'listOrganizations' },
      { name: 'pipelines', getTools: () => import('../../src/tools/pipelines.js'), operation: 'listPipelines' },
      { name: 'users', getTools: () => import('../../src/tools/users.js'), operation: 'listUsers' },
    ];

    toolTests.forEach(({ name, getTools, operation }) => {
      it(`should handle errors in ${name} tool`, async () => {
        mockApiError(401, 'Invalid API key');
        const tools = await getTools();
        const fn = (tools as any)[operation];

        const result = await fn({});

        expect(result.content[0].text).toContain('INVALID_API_KEY');
      });
    });
  });

  describe('Error Response Format', () => {
    it('should return MCP-formatted error response', async () => {
      mockApiError(404, 'Resource not found');
      const { getDeal } = await import('../../src/tools/deals.js');

      const result = await getDeal({ id: 1 });

      // Should have content array with text type
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should include error code in formatted error', async () => {
      mockApiError(429, 'Rate limit');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});
      const text = result.content[0].text;

      expect(text).toMatch(/Error \[RATE_LIMITED\]/);
    });

    it('should include suggestion when available', async () => {
      mockApiError(401, 'Unauthorized');
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});
      const text = result.content[0].text;

      expect(text).toContain('Suggestion:');
    });
  });
});
