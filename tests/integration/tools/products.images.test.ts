/**
 * Integration tests for product image tools (U6)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockApiSuccess,
  mockApiError,
} from '../../helpers/mockFetch.js';

const imageFixture = {
  id: 42,
  product_id: 123,
  company_id: '1',
  public_url: 'https://example.com/images/product-123.jpg',
  add_time: '2024-01-01T00:00:00Z',
  mime_type: 'image/jpeg',
  name: 'product-123.jpg',
};

// Dynamic import to avoid module caching issues with mocks
async function getProductsTools() {
  return import('../../../src/tools/products.js');
}

describe('product image tools (U6)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('getProductImage', () => {
    it('should call GET /api/v2/products/123/images', async () => {
      const mockFn = mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      await getProductImage({ id: 123 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/123/images');
    });

    it('should return the single image object as data with public_url round-tripped', async () => {
      mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.public_url).toBe(imageFixture.public_url);
    });

    it('should include "Image for product 123" in summary', async () => {
      mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Image for product 123');
    });

    it('should NOT include a pagination key', async () => {
      mockApiSuccess(imageFixture);
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).not.toHaveProperty('pagination');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { getProductImage } = await getProductsTools();

      const result = await getProductImage({ id: 123 });

      expect(result.isError).toBe(true);
    });
  });

  describe('deleteProductImage', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteProductImage } = await getProductsTools();

      const result = await deleteProductImage({ id: 123 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteProductImage } = await getProductsTools();

      await deleteProductImage({ id: 123 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should send DELETE to /api/v2/products/123/images (no trailing image id) when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      await deleteProductImage({ id: 123 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/123/images');
      expect(options.method).toBe('DELETE');
    });

    it('should NOT append an image id to the DELETE path', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      await deleteProductImage({ id: 123 });

      const [url] = mockFn.mock.calls[0];
      // Path must end with /images (or /images?...) and not include an extra numeric segment
      expect(url).toMatch(/\/products\/123\/images(\?|$)/);
    });

    it('should return summary "Image deleted from product 123" when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      const result = await deleteProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Image deleted from product 123');
    });

    it('should return the deleted image id as data when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 42 });
      const { deleteProductImage } = await getProductsTools();

      const result = await deleteProductImage({ id: 123 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.id).toBe(42);
    });
  });
});
