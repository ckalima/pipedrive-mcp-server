/**
 * Integration tests for deal line-item product tools (U1, #67)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const dealProduct = {
  id: 42,
  deal_id: 1,
  product_id: 5,
  item_price: 10,
  quantity: 2,
  sum: 20,
};

// Dynamic import to avoid module caching issues with mocks
async function getDealsTools() {
  return import('../../../src/tools/deals.js');
}

describe('deal product tools (U1, #67)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listDealProducts', () => {
    it('should call v2 /deals/{id}/products endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listDealProducts } = await getDealsTools();

      await listDealProducts({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals/1/products');
    });

    it('should forward cursor, limit, and sort params', async () => {
      const mockFn = mockApiSuccess([]);
      const { listDealProducts } = await getDealsTools();

      await listDealProducts({ id: 1, cursor: 'curs', limit: 25, sort_by: 'order_nr', sort_direction: 'desc' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=curs');
      expect(url).toContain('sort_by=order_nr');
      expect(url).toContain('sort_direction=desc');
    });

    it('should surface next_cursor in pagination', async () => {
      mockFetch({ data: [dealProduct], additional_data: paginationFixtures.v2WithMore });
      const { listDealProducts } = await getDealsTools();

      const result = await listDealProducts({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "deal product" in summary', async () => {
      mockFetch({ data: [dealProduct], additional_data: paginationFixtures.v2NoMore });
      const { listDealProducts } = await getDealsTools();

      const result = await listDealProducts({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('deal product');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listDealProducts } = await getDealsTools();

      const result = await listDealProducts({ id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe('addDealProduct', () => {
    it('should POST to /deals/{id}/products with required fields', async () => {
      const mockFn = mockApiSuccess(dealProduct);
      const { addDealProduct } = await getDealsTools();

      await addDealProduct({ id: 1, product_id: 5, item_price: 10, quantity: 2 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/products');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.product_id).toBe(5);
      expect(body.item_price).toBe(10);
      expect(body.quantity).toBe(2);
    });

    it('should omit optional fields when not provided', async () => {
      const mockFn = mockApiSuccess(dealProduct);
      const { addDealProduct } = await getDealsTools();

      await addDealProduct({ id: 1, product_id: 5, item_price: 10, quantity: 2 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.tax).toBeUndefined();
      expect(body.billing_frequency).toBeUndefined();
    });

    it('should forward billing_frequency when supplied', async () => {
      const mockFn = mockApiSuccess(dealProduct);
      const { addDealProduct } = await getDealsTools();

      await addDealProduct({ id: 1, product_id: 5, item_price: 10, quantity: 2, billing_frequency: 'monthly' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.billing_frequency).toBe('monthly');
    });

    it('should return summary "Product added to deal"', async () => {
      mockApiSuccess(dealProduct);
      const { addDealProduct } = await getDealsTools();

      const result = await addDealProduct({ id: 1, product_id: 5, item_price: 10, quantity: 2 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Product added to deal');
    });

    it('should return isError on API failure', async () => {
      mockApiError(400, 'Bad request');
      const { addDealProduct } = await getDealsTools();

      const result = await addDealProduct({ id: 1, product_id: 5, item_price: 10, quantity: 2 });

      expect(result.isError).toBe(true);
    });
  });

  describe('updateDealProduct', () => {
    it('should PATCH the correct path with only supplied fields', async () => {
      const mockFn = mockApiSuccess(dealProduct);
      const { updateDealProduct } = await getDealsTools();

      await updateDealProduct({ id: 1, product_attachment_id: 42, quantity: 3 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/products/42');
      expect(options.method).toBe('PATCH');
      const body = JSON.parse(options.body);
      expect(body.quantity).toBe(3);
      expect(body.product_id).toBeUndefined();
    });

    it('should return isError on API failure', async () => {
      mockApiError(404, 'Not found');
      const { updateDealProduct } = await getDealsTools();

      const result = await updateDealProduct({ id: 1, product_attachment_id: 42, quantity: 3 });

      expect(result.isError).toBe(true);
    });
  });

  describe('deleteDealProduct', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteDealProduct } = await getDealsTools();

      const result = await deleteDealProduct({ id: 1, product_attachment_id: 42 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteDealProduct } = await getDealsTools();

      await deleteDealProduct({ id: 1, product_attachment_id: 42 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should DELETE the correct path when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 42 });
      const { deleteDealProduct } = await getDealsTools();

      await deleteDealProduct({ id: 1, product_attachment_id: 42 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/products/42');
      expect(options.method).toBe('DELETE');
    });

    it('should return isError on API failure', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiError(404, 'Not found');
      const { deleteDealProduct } = await getDealsTools();

      const result = await deleteDealProduct({ id: 1, product_attachment_id: 42 });

      expect(result.isError).toBe(true);
    });
  });

  describe('bulkAddDealProducts', () => {
    it('should POST to /deals/{id}/products/bulk with { data: [...] }', async () => {
      const mockFn = mockApiSuccess([dealProduct, dealProduct]);
      const { bulkAddDealProducts } = await getDealsTools();

      await bulkAddDealProducts({
        id: 1,
        data: [
          { product_id: 5, item_price: 10, quantity: 1 },
          { product_id: 6, item_price: 20, quantity: 2 },
        ],
      });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/products/bulk');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('should return array data on success', async () => {
      mockApiSuccess([dealProduct, dealProduct]);
      const { bulkAddDealProducts } = await getDealsTools();

      const result = await bulkAddDealProducts({ id: 1, data: [{ product_id: 5, item_price: 10, quantity: 1 }] });

      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data).toHaveLength(2);
    });

    it('should return isError on API failure', async () => {
      mockApiError(400, 'Bad request');
      const { bulkAddDealProducts } = await getDealsTools();

      const result = await bulkAddDealProducts({ id: 1, data: [{ product_id: 5, item_price: 10, quantity: 1 }] });

      expect(result.isError).toBe(true);
    });
  });
});
