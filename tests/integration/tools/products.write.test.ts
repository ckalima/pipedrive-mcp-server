/**
 * Integration tests for products write tools (U2: create, update, delete)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
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

// Dynamic import to avoid module caching issues with mocks
async function getProductsTools() {
  return import('../../../src/tools/products.js');
}

describe('products write tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('createProduct', () => {
    it('should create product with just name', async () => {
      mockApiSuccess({ ...product, id: 100, name: 'New Product' });
      const { createProduct } = await getProductsTools();

      const result = await createProduct({ name: 'New Product' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Product created');
      expect(parsed.data).toBeDefined();
    });

    it('should send POST request to v2 /products', async () => {
      const mockFn = mockApiSuccess(product);
      const { createProduct } = await getProductsTools();

      await createProduct({ name: 'Widget' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products');
      expect(options.method).toBe('POST');
    });

    it('should include name in request body', async () => {
      const mockFn = mockApiSuccess(product);
      const { createProduct } = await getProductsTools();

      await createProduct({ name: 'Premium Widget' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Premium Widget');
    });

    it('should build body with only provided fields (exclude absent optional fields)', async () => {
      const mockFn = mockApiSuccess(product);
      const { createProduct } = await getProductsTools();

      await createProduct({ name: 'Widget' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Widget');
      expect(body.code).toBeUndefined();
      expect(body.description).toBeUndefined();
      expect(body.tax).toBeUndefined();
      expect(body.owner_id).toBeUndefined();
      expect(body.visible_to).toBeUndefined();
      expect(body.prices).toBeUndefined();
      expect(body.billing_frequency).toBeUndefined();
    });

    it('should forward all optional fields when provided', async () => {
      const mockFn = mockApiSuccess(product);
      const { createProduct } = await getProductsTools();

      await createProduct({
        name: 'Premium Widget',
        code: 'WIDG-PRE-001',
        description: 'A premium widget',
        unit: 'pcs',
        tax: 10,
        category: 5,
        owner_id: 2,
        is_linkable: false,
        visible_to: 3,
        billing_frequency: 'monthly',
        billing_frequency_cycles: 6,
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.code).toBe('WIDG-PRE-001');
      expect(body.description).toBe('A premium widget');
      expect(body.unit).toBe('pcs');
      expect(body.tax).toBe(10);
      expect(body.category).toBe(5);
      expect(body.owner_id).toBe(2);
      expect(body.is_linkable).toBe(false);
      expect(body.visible_to).toBe(3);
      expect(body.billing_frequency).toBe('monthly');
      expect(body.billing_frequency_cycles).toBe(6);
    });

    it('should forward prices array when provided', async () => {
      const mockFn = mockApiSuccess(product);
      const { createProduct } = await getProductsTools();

      await createProduct({
        name: 'Multi-currency Widget',
        prices: [
          { currency: 'USD', price: 99.99, cost: 50 },
          { currency: 'EUR', price: 89.99 },
        ],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.prices).toHaveLength(2);
      expect(body.prices[0].currency).toBe('USD');
      expect(body.prices[0].price).toBe(99.99);
      expect(body.prices[1].currency).toBe('EUR');
    });

    it('should forward custom_fields when provided', async () => {
      const mockFn = mockApiSuccess(product);
      const { createProduct } = await getProductsTools();

      await createProduct({
        name: 'Widget',
        custom_fields: { sku_key: 'ABC-123', weight_key: 2.5 },
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.custom_fields).toBeDefined();
      expect(body.custom_fields.sku_key).toBe('ABC-123');
    });

    it('should forward billing_frequency when provided', async () => {
      const mockFn = mockApiSuccess(product);
      const { createProduct } = await getProductsTools();

      await createProduct({ name: 'Subscription Widget', billing_frequency: 'annually' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.billing_frequency).toBe('annually');
    });

    it('should return isError on API failure', async () => {
      mockApiError(400, 'Invalid request');
      const { createProduct } = await getProductsTools();

      const result = await createProduct({ name: 'Widget' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('VALIDATION_ERROR');
    });
  });

  describe('updateProduct', () => {
    it('should update product with just id', async () => {
      mockApiSuccess({ ...product, name: 'Updated Widget' });
      const { updateProduct } = await getProductsTools();

      const result = await updateProduct({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Product 1 updated');
    });

    it('should send PATCH request to v2 /products/{id}', async () => {
      const mockFn = mockApiSuccess(product);
      const { updateProduct } = await getProductsTools();

      await updateProduct({ id: 42 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/products/42');
      expect(options.method).toBe('PATCH');
    });

    it('should split id from fields and not include id in body', async () => {
      const mockFn = mockApiSuccess(product);
      const { updateProduct } = await getProductsTools();

      await updateProduct({ id: 10, name: 'Renamed Widget' });

      const [url, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(url).toContain('/products/10');
      expect(body.id).toBeUndefined();
      expect(body.name).toBe('Renamed Widget');
    });

    it('should forward only provided optional fields (partial update)', async () => {
      const mockFn = mockApiSuccess(product);
      const { updateProduct } = await getProductsTools();

      await updateProduct({ id: 1, tax: 15, visible_to: 7 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.tax).toBe(15);
      expect(body.visible_to).toBe(7);
      expect(body.name).toBeUndefined();
      expect(body.code).toBeUndefined();
    });

    it('should forward prices array in update', async () => {
      const mockFn = mockApiSuccess(product);
      const { updateProduct } = await getProductsTools();

      await updateProduct({
        id: 1,
        prices: [{ currency: 'USD', price: 149.99 }],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.prices).toHaveLength(1);
      expect(body.prices[0].price).toBe(149.99);
    });

    it('should handle not found (404)', async () => {
      mockApiError(404, 'Product not found');
      const { updateProduct } = await getProductsTools();

      const result = await updateProduct({ id: 99999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });

    it('should forward billing_frequency_cycles in update', async () => {
      const mockFn = mockApiSuccess(product);
      const { updateProduct } = await getProductsTools();

      await updateProduct({ id: 1, billing_frequency: 'quarterly', billing_frequency_cycles: 4 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.billing_frequency).toBe('quarterly');
      expect(body.billing_frequency_cycles).toBe(4);
    });
  });

  describe('deleteProduct', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteProduct } = await getProductsTools();

      const result = await deleteProduct({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteProduct } = await getProductsTools();

      await deleteProduct({ id: 1 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should delete product when PIPEDRIVE_ENABLE_DESTRUCTIVE=true', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 1 });
      const { deleteProduct } = await getProductsTools();

      const result = await deleteProduct({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('Product 1 deleted');
    });

    it('should mention 30-day soft-delete in success summary', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 1 });
      const { deleteProduct } = await getProductsTools();

      const result = await deleteProduct({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('permanently removed after 30 days');
    });

    it('should send DELETE request to v2 /products/{id}', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 42 });
      const { deleteProduct } = await getProductsTools();

      await deleteProduct({ id: 42 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/products/42');
      expect(options.method).toBe('DELETE');
    });

    it('should return id of deleted product in data', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 5 });
      const { deleteProduct } = await getProductsTools();

      const result = await deleteProduct({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.id).toBe(5);
    });

    it('should call v2 endpoint (not v1)', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 1 });
      const { deleteProduct } = await getProductsTools();

      await deleteProduct({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/products/1');
      expect(url).not.toContain('/v1/');
    });
  });
});
