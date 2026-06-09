/**
 * Tests for schemas/products.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListProductsSchema,
  GetProductSchema,
  SearchProductsSchema,
  CreateProductSchema,
  UpdateProductSchema,
  DeleteProductSchema,
  BillingFrequencySchema,
  PriceInputSchema,
} from '../../../src/schemas/products.js';

describe('products schemas', () => {
  describe('ListProductsSchema', () => {
    it('should accept minimal params (empty object)', () => {
      const result = ListProductsSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.sort_direction).toBeUndefined();
    });

    it('should accept all filter parameters', () => {
      const params = {
        cursor: 'abc123',
        limit: 100,
        owner_id: 1,
        ids: '1,2,3',
        filter_id: 5,
        sort_by: 'name',
        sort_direction: 'asc',
        updated_since: '2024-01-01T00:00:00Z',
        custom_fields: 'all',
      };

      const result = ListProductsSchema.parse(params);
      expect(result.owner_id).toBe(1);
      expect(result.ids).toBe('1,2,3');
      expect(result.filter_id).toBe(5);
      expect(result.sort_by).toBe('name');
      expect(result.sort_direction).toBe('asc');
      expect(result.updated_since).toBe('2024-01-01T00:00:00Z');
      expect(result.custom_fields).toBe('all');
    });

    it('should accept all valid sort_by values', () => {
      ['id', 'name', 'add_time', 'update_time'].forEach((sort_by) => {
        const result = ListProductsSchema.parse({ sort_by });
        expect(result.sort_by).toBe(sort_by);
      });
    });

    it('should reject invalid sort_by value', () => {
      expect(() => ListProductsSchema.parse({ sort_by: 'title' })).toThrow();
    });

    it('should clamp limit via buildPaginationParamsV2 at handler level (schema max is 100)', () => {
      expect(() => ListProductsSchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('GetProductSchema', () => {
    it('should require id', () => {
      expect(() => GetProductSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = GetProductSchema.parse({ id: 42 });
      expect(result.id).toBe(42);
    });
  });

  describe('SearchProductsSchema', () => {
    it('should require term', () => {
      expect(() => SearchProductsSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just term', () => {
      const result = SearchProductsSchema.parse({ term: 'widget' });
      expect(result.term).toBe('widget');
      expect(result.exact_match).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should reject empty term', () => {
      expect(() => SearchProductsSchema.parse({ term: '' })).toThrow();
    });

    it('should reject term over 500 characters', () => {
      expect(() => SearchProductsSchema.parse({ term: 'a'.repeat(501) })).toThrow();
    });

    it('should accept valid fields enum values', () => {
      ['code', 'custom_fields', 'name'].forEach((fields) => {
        const result = SearchProductsSchema.parse({ term: 'test', fields });
        expect(result.fields).toBe(fields);
      });
    });

    it('should reject invalid fields enum value', () => {
      expect(() => SearchProductsSchema.parse({ term: 'test', fields: 'description' })).toThrow();
    });

    it('should accept include_fields product.price', () => {
      const result = SearchProductsSchema.parse({ term: 'test', include_fields: 'product.price' });
      expect(result.include_fields).toBe('product.price');
    });

    it('should reject invalid include_fields value', () => {
      expect(() => SearchProductsSchema.parse({ term: 'test', include_fields: 'product.name' })).toThrow();
    });

    it('should accept exact_match boolean', () => {
      const result = SearchProductsSchema.parse({ term: 'test', exact_match: true });
      expect(result.exact_match).toBe(true);
    });

    it('should accept cursor and limit', () => {
      const result = SearchProductsSchema.parse({ term: 'test', cursor: 'cur1', limit: 25 });
      expect(result.cursor).toBe('cur1');
      expect(result.limit).toBe(25);
    });
  });

  describe('VisibilitySchema (via CreateProductSchema)', () => {
    it('should accept valid visible_to values 1, 3, 5, 7', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = CreateProductSchema.parse({ name: 'Test', visible_to });
        expect(result.visible_to).toBe(visible_to);
      });
    });

    it('should reject invalid visible_to values 2 and 4', () => {
      [2, 4].forEach((visible_to) => {
        expect(() => CreateProductSchema.parse({ name: 'Test', visible_to })).toThrow();
      });
    });

    it('should reject visible_to as string', () => {
      expect(() => CreateProductSchema.parse({ name: 'Test', visible_to: '3' as unknown as number })).toThrow();
    });

    it('should accept omitted visible_to', () => {
      const result = CreateProductSchema.parse({ name: 'Test' });
      expect(result.visible_to).toBeUndefined();
    });
  });

  describe('BillingFrequencySchema', () => {
    it('should accept all 6 valid billing frequency values', () => {
      ['one-time', 'annually', 'semi-annually', 'quarterly', 'monthly', 'weekly'].forEach((billing_frequency) => {
        const result = BillingFrequencySchema.parse(billing_frequency);
        expect(result).toBe(billing_frequency);
      });
    });

    it('should reject invalid billing_frequency', () => {
      expect(() => BillingFrequencySchema.parse('daily')).toThrow();
      expect(() => BillingFrequencySchema.parse('bimonthly')).toThrow();
      expect(() => BillingFrequencySchema.parse('')).toThrow();
    });
  });

  describe('CreateProductSchema', () => {
    it('should require name', () => {
      expect(() => CreateProductSchema.parse({})).toThrow();
    });

    it('should reject empty name', () => {
      expect(() => CreateProductSchema.parse({ name: '' })).toThrow();
    });

    it('should accept minimal params with just name', () => {
      const result = CreateProductSchema.parse({ name: 'Widget' });
      expect(result.name).toBe('Widget');
    });

    it('should accept all optional fields', () => {
      const params = {
        name: 'Premium Widget',
        code: 'WIDG-001',
        description: 'A premium widget',
        unit: 'pcs',
        tax: 10,
        category: 5,
        owner_id: 1,
        is_linkable: true,
        visible_to: 7,
        prices: [{ currency: 'USD', price: 99.99, cost: 50, direct_cost: 30 }],
        custom_fields: { custom_key: 'value' },
        billing_frequency: 'monthly',
        billing_frequency_cycles: 12,
      };

      const result = CreateProductSchema.parse(params);
      expect(result.name).toBe('Premium Widget');
      expect(result.code).toBe('WIDG-001');
      expect(result.tax).toBe(10);
      expect(result.visible_to).toBe(7);
      expect(result.billing_frequency).toBe('monthly');
      expect(result.billing_frequency_cycles).toBe(12);
    });

    it('should reject billing_frequency_cycles > 208', () => {
      expect(() => CreateProductSchema.parse({ name: 'Test', billing_frequency_cycles: 209 })).toThrow();
    });

    it('should accept billing_frequency_cycles = 208', () => {
      const result = CreateProductSchema.parse({ name: 'Test', billing_frequency_cycles: 208 });
      expect(result.billing_frequency_cycles).toBe(208);
    });

    it('should accept billing_frequency_cycles as null', () => {
      const result = CreateProductSchema.parse({ name: 'Test', billing_frequency_cycles: null });
      expect(result.billing_frequency_cycles).toBeNull();
    });

    it('should accept prices array', () => {
      const result = CreateProductSchema.parse({
        name: 'Test',
        prices: [
          { currency: 'USD', price: 100 },
          { currency: 'EUR', price: 85, cost: 40 },
        ],
      });
      expect(result.prices).toHaveLength(2);
      expect(result.prices![0].price).toBe(100);
    });

    it('should accept custom_fields object', () => {
      const result = CreateProductSchema.parse({
        name: 'Test',
        custom_fields: { field_key: 'value', numeric_key: 42 },
      });
      expect(result.custom_fields).toBeDefined();
    });
  });

  describe('UpdateProductSchema', () => {
    it('should require id', () => {
      expect(() => UpdateProductSchema.parse({})).toThrow();
    });

    it('should accept id with no updates', () => {
      const result = UpdateProductSchema.parse({ id: 123 });
      expect(result.id).toBe(123);
    });

    it('should accept all updatable fields', () => {
      const params = {
        id: 42,
        name: 'Updated Widget',
        code: 'NEW-001',
        tax: 15,
        owner_id: 2,
        visible_to: 3,
        billing_frequency: 'annually',
        billing_frequency_cycles: 1,
      };

      const result = UpdateProductSchema.parse(params);
      expect(result.id).toBe(42);
      expect(result.name).toBe('Updated Widget');
      expect(result.visible_to).toBe(3);
    });

    it('should reject billing_frequency_cycles > 208', () => {
      expect(() => UpdateProductSchema.parse({ id: 1, billing_frequency_cycles: 209 })).toThrow();
    });

    it('should reject invalid visible_to in update', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => UpdateProductSchema.parse({ id: 1, visible_to })).toThrow();
      });
    });

    it('should accept valid visible_to in update', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = UpdateProductSchema.parse({ id: 1, visible_to });
        expect(result.visible_to).toBe(visible_to);
      });
    });
  });

  describe('DeleteProductSchema', () => {
    it('should require id', () => {
      expect(() => DeleteProductSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = DeleteProductSchema.parse({ id: 99 });
      expect(result.id).toBe(99);
    });
  });

  describe('PriceInputSchema', () => {
    it('should require price', () => {
      expect(() => PriceInputSchema.parse({ currency: 'USD' })).toThrow();
    });

    it('should accept minimal price with just price field', () => {
      const result = PriceInputSchema.parse({ price: 49.99 });
      expect(result.price).toBe(49.99);
    });

    it('should accept all price fields', () => {
      const result = PriceInputSchema.parse({
        currency: 'USD',
        price: 99.99,
        cost: 50,
        direct_cost: 30,
      });
      expect(result.price).toBe(99.99);
      expect(result.cost).toBe(50);
      expect(result.direct_cost).toBe(30);
    });
  });
});
