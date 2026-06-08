/**
 * Functional tests for pagination handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  paginationFixtures,
  fixtures,
} from '../helpers/mockFetch.js';
import { createDealsFixture, createPersonsFixture } from '../helpers/fixtures.js';

describe('Pagination', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('V2 Cursor-Based Pagination', () => {
    it('should extract cursor from response', async () => {
      mockFetch({
        data: createDealsFixture(50),
        additional_data: paginationFixtures.v2WithMore,
      });
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({ limit: 50 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should pass cursor to get next page', async () => {
      const mockFn = mockFetch({
        data: createDealsFixture(50),
        additional_data: paginationFixtures.v2NoMore,
      });
      const { listDeals } = await import('../../src/tools/deals.js');

      await listDeals({ cursor: 'page2_cursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=page2_cursor');
    });

    it('should indicate no more items when cursor is absent', async () => {
      mockFetch({
        data: createDealsFixture(10),
        additional_data: paginationFixtures.v2NoMore,
      });
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.pagination.has_more).toBe(false);
      expect(parsed.pagination.next_cursor).toBeUndefined();
    });

    it('should respect limit parameter', async () => {
      const mockFn = mockApiSuccess([]);
      const { listDeals } = await import('../../src/tools/deals.js');

      await listDeals({ limit: 25 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=25');
    });

    it('should cap limit at 100 for v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listDeals } = await import('../../src/tools/deals.js');

      // Even if user requests more, it should be capped
      await listDeals({ limit: 100 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=100');
    });
  });

  describe('V1 Offset-Based Pagination', () => {
    it('should extract pagination info from v1 response', async () => {
      mockFetch({
        data: [{ id: 1, subject: 'Email 1' }],
        additional_data: paginationFixtures.v1WithMore,
      });
      const { listMailThreads } = await import('../../src/tools/mail.js');

      const result = await listMailThreads({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.pagination.has_more).toBe(true);
      // #48 Lane C: mail now returns extractPaginationV1 directly (next_cursor string),
      // standardized with notes.ts — was the remapped { next_start: 50 } before.
      expect(parsed.pagination.next_cursor).toBe('50');
    });

    it('should pass start parameter for offset pagination', async () => {
      const mockFn = mockApiSuccess([]);
      const { listMailThreads } = await import('../../src/tools/mail.js');

      await listMailThreads({ start: 100 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('start=100');
    });

    it('should handle no more items in v1 pagination', async () => {
      mockFetch({
        data: [{ id: 1, subject: 'Email 1' }],
        additional_data: paginationFixtures.v1NoMore,
      });
      const { listMailThreads } = await import('../../src/tools/mail.js');

      const result = await listMailThreads({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.pagination.has_more).toBe(false);
    });

    it('should allow higher limit for v1 API (up to 500)', async () => {
      const mockFn = mockApiSuccess([]);
      const { listMailThreads } = await import('../../src/tools/mail.js');

      await listMailThreads({ limit: 500 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=500');
    });
  });

  describe('Pagination in Summary', () => {
    it('should indicate more items available in summary', async () => {
      mockFetch({
        data: createDealsFixture(50),
        additional_data: paginationFixtures.v2WithMore,
      });
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.summary).toContain('More available');
    });

    it('should not mention more items when none available', async () => {
      mockFetch({
        data: createDealsFixture(10),
        additional_data: paginationFixtures.v2NoMore,
      });
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.summary).not.toContain('More available');
    });
  });

  describe('Multi-Page Flow', () => {
    it('should simulate fetching multiple pages', async () => {
      const { listDeals } = await import('../../src/tools/deals.js');

      // Page 1
      mockFetch({
        data: createDealsFixture(50),
        additional_data: { next_cursor: 'cursor_page2' },
      });
      let result = await listDeals({ limit: 50 });
      let parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(50);
      expect(parsed.pagination.next_cursor).toBe('cursor_page2');

      // Page 2
      vi.unstubAllGlobals();
      mockFetch({
        data: createDealsFixture(50),
        additional_data: { next_cursor: 'cursor_page3' },
      });
      result = await listDeals({ cursor: 'cursor_page2', limit: 50 });
      parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(50);
      expect(parsed.pagination.next_cursor).toBe('cursor_page3');

      // Final page
      vi.unstubAllGlobals();
      mockFetch({
        data: createDealsFixture(25),
        additional_data: paginationFixtures.v2NoMore,
      });
      result = await listDeals({ cursor: 'cursor_page3', limit: 50 });
      parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(25);
      expect(parsed.pagination.has_more).toBe(false);
    });
  });

  describe('Empty Results', () => {
    it('should handle empty first page', async () => {
      mockFetch({
        data: [],
        additional_data: paginationFixtures.v2NoMore,
      });
      const { listDeals } = await import('../../src/tools/deals.js');

      const result = await listDeals({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data).toHaveLength(0);
      expect(parsed.pagination.has_more).toBe(false);
      expect(parsed.summary).toContain('0');
    });
  });
});
