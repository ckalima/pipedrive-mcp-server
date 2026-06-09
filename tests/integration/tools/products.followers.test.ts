/**
 * Integration tests for product follower tools (U4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const follower = {
  user_id: 7,
  add_time: '2024-01-01T00:00:00Z',
};

const changelogEntry = {
  action: 'added',
  actor_user_id: 1,
  follower_user_id: 7,
  time: '2024-01-01T00:00:00Z',
};

// Dynamic import to avoid module caching issues with mocks
async function getProductsTools() {
  return import('../../../src/tools/products.js');
}

describe('product follower tools (U4)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listProductFollowers', () => {
    it('should call v2 /products/{id}/followers endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProductFollowers } = await getProductsTools();

      await listProductFollowers({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/3/followers');
    });

    it('should forward cursor when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProductFollowers } = await getProductsTools();

      await listProductFollowers({ id: 3, cursor: 'follcursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=follcursor');
    });

    it('should surface next_cursor in pagination', async () => {
      mockFetch({ data: [follower], additional_data: paginationFixtures.v2WithMore });
      const { listProductFollowers } = await getProductsTools();

      const result = await listProductFollowers({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "follower" in summary', async () => {
      mockFetch({ data: [follower, follower], additional_data: paginationFixtures.v2NoMore });
      const { listProductFollowers } = await getProductsTools();

      const result = await listProductFollowers({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('follower');
      expect(parsed.summary).toContain('2');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listProductFollowers } = await getProductsTools();

      const result = await listProductFollowers({ id: 3 });

      expect(result.isError).toBe(true);
    });

    it('should not include api_token in URL', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProductFollowers } = await getProductsTools();

      await listProductFollowers({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
    });
  });

  describe('addProductFollower', () => {
    it('should send POST request to /products/{id}/followers', async () => {
      const mockFn = mockApiSuccess(follower);
      const { addProductFollower } = await getProductsTools();

      await addProductFollower({ id: 3, user_id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/products/3/followers');
      expect(options.method).toBe('POST');
    });

    it('should include user_id in request body', async () => {
      const mockFn = mockApiSuccess(follower);
      const { addProductFollower } = await getProductsTools();

      await addProductFollower({ id: 3, user_id: 7 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.user_id).toBe(7);
    });

    it('should return summary "Follower added to product"', async () => {
      mockApiSuccess(follower);
      const { addProductFollower } = await getProductsTools();

      const result = await addProductFollower({ id: 3, user_id: 7 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Follower added to product');
    });
  });

  describe('getProductFollowersChangelog', () => {
    it('should call GET /products/{id}/followers/changelog', async () => {
      const mockFn = mockApiSuccess([]);
      const { getProductFollowersChangelog } = await getProductsTools();

      await getProductFollowersChangelog({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/products/3/followers/changelog');
    });

    it('should surface pagination from changelog response', async () => {
      mockFetch({ data: [changelogEntry], additional_data: paginationFixtures.v2WithMore });
      const { getProductFollowersChangelog } = await getProductsTools();

      const result = await getProductFollowersChangelog({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "changelog" in summary', async () => {
      mockFetch({ data: [changelogEntry], additional_data: paginationFixtures.v2NoMore });
      const { getProductFollowersChangelog } = await getProductsTools();

      const result = await getProductFollowersChangelog({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('changelog');
    });
  });

  describe('deleteProductFollower', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteProductFollower } = await getProductsTools();

      const result = await deleteProductFollower({ id: 3, follower_id: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteProductFollower } = await getProductsTools();

      await deleteProductFollower({ id: 3, follower_id: 7 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should send DELETE to /products/{id}/followers/{follower_id} path when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ user_id: 7 });
      const { deleteProductFollower } = await getProductsTools();

      await deleteProductFollower({ id: 3, follower_id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/products/3/followers/7');
      expect(options.method).toBe('DELETE');
    });

    it('should return success summary with follower and product ids', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ user_id: 7 });
      const { deleteProductFollower } = await getProductsTools();

      const result = await deleteProductFollower({ id: 3, follower_id: 7 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('7');
      expect(parsed.summary).toContain('3');
    });
  });
});
