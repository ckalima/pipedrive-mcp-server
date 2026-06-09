/**
 * Integration tests for product variation tools (U3)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const variation = {
  id: 10,
  name: 'Red Variant',
  product_id: 1,
  prices: [{ currency: 'USD', price: 49.99 }],
};

// Dynamic import to avoid module caching issues with mocks
async function getProductsTools() {
  return import('../../../src/tools/products.js');
}

describe('product variation tools (U3)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listProductVariations', () => {
    it('should call v2 /products/{id}/variations endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProductVariations } = await getProductsTools();

      await listProductVariations({ id: 5 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/5/variations');
    });

    it('should forward cursor when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProductVariations } = await getProductsTools();

      await listProductVariations({ id: 5, cursor: 'mycursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=mycursor');
    });

    it('should surface next_cursor in pagination', async () => {
      mockFetch({ data: [variation], additional_data: paginationFixtures.v2WithMore });
      const { listProductVariations } = await getProductsTools();

      const result = await listProductVariations({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "product variation" in summary', async () => {
      mockFetch({ data: [variation, variation], additional_data: paginationFixtures.v2NoMore });
      const { listProductVariations } = await getProductsTools();

      const result = await listProductVariations({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('product variation');
      expect(parsed.summary).toContain('2');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listProductVariations } = await getProductsTools();

      const result = await listProductVariations({ id: 5 });

      expect(result.isError).toBe(true);
    });

    it('should not include api_token in URL', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProductVariations } = await getProductsTools();

      await listProductVariations({ id: 5 });

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
    });
  });

  describe('addProductVariation', () => {
    it('should send POST request to /products/{id}/variations', async () => {
      const mockFn = mockApiSuccess(variation);
      const { addProductVariation } = await getProductsTools();

      await addProductVariation({ id: 5, name: 'Red Variant' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/products/5/variations');
      expect(options.method).toBe('POST');
    });

    it('should include name in request body', async () => {
      const mockFn = mockApiSuccess(variation);
      const { addProductVariation } = await getProductsTools();

      await addProductVariation({ id: 5, name: 'Blue Variant' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Blue Variant');
    });

    it('should forward prices array including notes', async () => {
      const mockFn = mockApiSuccess(variation);
      const { addProductVariation } = await getProductsTools();

      await addProductVariation({
        id: 5,
        name: 'Gold Edition',
        prices: [{ currency: 'USD', price: 99.99, notes: 'Special pricing' }],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.prices).toHaveLength(1);
      expect(body.prices[0].price).toBe(99.99);
      expect(body.prices[0].notes).toBe('Special pricing');
    });

    it('should return summary "Product variation created"', async () => {
      mockApiSuccess(variation);
      const { addProductVariation } = await getProductsTools();

      const result = await addProductVariation({ id: 5, name: 'Red Variant' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Product variation created');
    });
  });

  describe('updateProductVariation', () => {
    it('should send PATCH request containing both product and variation IDs', async () => {
      const mockFn = mockApiSuccess(variation);
      const { updateProductVariation } = await getProductsTools();

      await updateProductVariation({ id: 5, product_variation_id: 10, name: 'Updated' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/products/5/variations/10');
      expect(options.method).toBe('PATCH');
    });

    it('should not include id or product_variation_id in body', async () => {
      const mockFn = mockApiSuccess(variation);
      const { updateProductVariation } = await getProductsTools();

      await updateProductVariation({ id: 5, product_variation_id: 10, name: 'Renamed' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.id).toBeUndefined();
      expect(body.product_variation_id).toBeUndefined();
      expect(body.name).toBe('Renamed');
    });

    it('should forward prices in body', async () => {
      const mockFn = mockApiSuccess(variation);
      const { updateProductVariation } = await getProductsTools();

      await updateProductVariation({
        id: 5,
        product_variation_id: 10,
        prices: [{ currency: 'EUR', price: 79.99 }],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.prices).toHaveLength(1);
      expect(body.prices[0].currency).toBe('EUR');
    });

    it('should include variation id in summary', async () => {
      mockApiSuccess(variation);
      const { updateProductVariation } = await getProductsTools();

      const result = await updateProductVariation({ id: 5, product_variation_id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('10');
    });
  });

  describe('deleteProductVariation', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteProductVariation } = await getProductsTools();

      const result = await deleteProductVariation({ id: 5, product_variation_id: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteProductVariation } = await getProductsTools();

      await deleteProductVariation({ id: 5, product_variation_id: 10 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should send DELETE to both-ids path when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 10 });
      const { deleteProductVariation } = await getProductsTools();

      await deleteProductVariation({ id: 5, product_variation_id: 10 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/products/5/variations/10');
      expect(options.method).toBe('DELETE');
    });

    it('should not mention "30 days" in summary', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 10 });
      const { deleteProductVariation } = await getProductsTools();

      const result = await deleteProductVariation({ id: 5, product_variation_id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).not.toContain('30 days');
    });
  });
});
