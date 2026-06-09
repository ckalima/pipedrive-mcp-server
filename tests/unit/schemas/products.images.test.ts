/**
 * Unit tests for product image schemas (U6)
 */

import { describe, it, expect } from 'vitest';
import {
  GetProductImageSchema,
  DeleteProductImageSchema,
} from '../../../src/schemas/products.js';

describe('product image schemas (U6)', () => {
  describe('GetProductImageSchema', () => {
    it('should accept { id: 1 }', () => {
      const result = GetProductImageSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
    });

    it('should reject missing id', () => {
      expect(() => GetProductImageSchema.parse({})).toThrow();
    });

    it('should reject non-numeric id', () => {
      expect(() => GetProductImageSchema.parse({ id: 'abc' as unknown as number })).toThrow();
    });
  });

  describe('DeleteProductImageSchema', () => {
    it('should accept { id: 1 }', () => {
      const result = DeleteProductImageSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
    });

    it('should reject missing id', () => {
      expect(() => DeleteProductImageSchema.parse({})).toThrow();
    });

    it('should reject non-numeric id', () => {
      expect(() => DeleteProductImageSchema.parse({ id: 'abc' as unknown as number })).toThrow();
    });
  });
});
