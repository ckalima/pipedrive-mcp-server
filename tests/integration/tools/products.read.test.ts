/**
 * Integration tests for products read tools (U1: list, get, search)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const product = {
  id: 1,
  name: 'Test Product',
  code: 'PROD-001',
  unit: 'pcs',
  tax: 0,
  is_deleted: false,
  is_linkable: true,
  visible_to: 7,
  owner_id: 1,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
};

function createProductsFixture(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...product,
    id: i + 1,
    name: `Test Product ${i + 1}`,
  }));
}

// Dynamic import to avoid module caching issues with mocks
async function getProductsTools() {
  return import('../../../src/tools/products.js');
}

describe('products read tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listProducts', () => {
    it('should return list of products with summary', async () => {
      const products = createProductsFixture(3);
      mockFetch({ data: products, additional_data: paginationFixtures.v2NoMore });
      const { listProducts } = await getProductsTools();

      const result = await listProducts({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 products');
      expect(parsed.data).toHaveLength(3);
      expect(parsed.pagination).toBeDefined();
    });

    it('should use createListSummary("product", …)', async () => {
      const products = createProductsFixture(5);
      mockFetch({ data: products, additional_data: paginationFixtures.v2NoMore });
      const { listProducts } = await getProductsTools();

      const result = await listProducts({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('product');
      expect(parsed.summary).toContain('5');
    });

    it('should forward owner_id when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ owner_id: 42 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('owner_id=42');
    });

    it('should not include owner_id when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('owner_id');
    });

    it('should forward ids when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ ids: '1,2,3' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('ids=1%2C2%2C3');
    });

    it('should not include ids when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('ids=');
    });

    it('should forward filter_id when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ filter_id: 10 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('filter_id=10');
    });

    it('should forward sort_by when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ sort_by: 'name' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('sort_by=name');
    });

    it('should not include sort_by when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('sort_by');
    });

    it('should forward sort_direction when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ sort_direction: 'desc' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('sort_direction=desc');
    });

    it('should forward updated_since when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ updated_since: '2024-01-01T00:00:00Z' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('updated_since=');
    });

    it('should forward custom_fields when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ custom_fields: 'field1,field2' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('custom_fields=field1%2Cfield2');
    });

    it('should not include custom_fields when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('custom_fields');
    });

    it('should forward cursor when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({ cursor: 'page2cursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=page2cursor');
    });

    it('should surface next_cursor in pagination', async () => {
      mockFetch({ data: createProductsFixture(50), additional_data: paginationFixtures.v2WithMore });
      const { listProducts } = await getProductsTools();

      const result = await listProducts({ cursor: 'page1' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should call v2 /products endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      await listProducts({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listProducts } = await getProductsTools();

      const result = await listProducts({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API_ERROR');
    });

    it('should return isError with NOT_FOUND code on 404', async () => {
      mockApiError(404, 'Not found');
      const { listProducts } = await getProductsTools();

      const result = await listProducts({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });

    it('should clamp limit to 100 via buildPaginationParamsV2', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await getProductsTools();

      // The schema allows max 100 (PaginationParamsSchema), builder also caps at 100
      await listProducts({ limit: 100 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=100');
    });
  });

  describe('getProduct', () => {
    it('should return single product', async () => {
      mockApiSuccess(product);
      const { getProduct } = await getProductsTools();

      const result = await getProduct({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Product 1');
      expect(parsed.data.name).toBe('Test Product');
    });

    it('should path-encode the product id', async () => {
      const mockFn = mockApiSuccess(product);
      const { getProduct } = await getProductsTools();

      await getProduct({ id: 42 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/products/42');
    });

    it('should call v2 /products/{id} endpoint', async () => {
      const mockFn = mockApiSuccess(product);
      const { getProduct } = await getProductsTools();

      await getProduct({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/1');
    });

    it('should handle not found (404) with NOT_FOUND error', async () => {
      mockApiError(404, 'Product not found');
      const { getProduct } = await getProductsTools();

      const result = await getProduct({ id: 99999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('searchProducts', () => {
    it('should search products and return results', async () => {
      mockApiSuccess({
        items: [{ result_score: 1.0, item: product }],
      });
      const { searchProducts } = await getProductsTools();

      const result = await searchProducts({ term: 'widget' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('widget');
      expect(parsed.data).toBeDefined();
    });

    it('should call v2 /products/search endpoint', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/search');
      expect(url).not.toContain('/v1/');
    });

    it('should forward term as query param', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'premium' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=premium');
    });

    it('should forward fields when present', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'test', fields: 'name' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('fields=name');
    });

    it('should not include fields when absent', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('fields=');
    });

    it('should forward exact_match=true when set', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'test', exact_match: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('exact_match=true');
    });

    it('should not include exact_match when false (default)', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('exact_match');
    });

    it('should forward include_fields when present', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'test', include_fields: 'product.price' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('include_fields=product.price');
    });

    it('should forward cursor when present', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await getProductsTools();

      await searchProducts({ term: 'test', cursor: 'searchcursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=searchcursor');
    });

    it('should unwrap data.items envelope and surface pagination cursor', async () => {
      mockFetch({ data: { items: [{ result_score: 1.0, item: product }] }, additional_data: { next_cursor: 'NEXT' } });
      const { searchProducts } = await getProductsTools();

      const result = await searchProducts({ term: 'test' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('NEXT');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { searchProducts } = await getProductsTools();

      const result = await searchProducts({ term: 'test' });

      expect(result.isError).toBe(true);
    });
  });
});
