/**
 * Unit tests for product image schemas (U6)
 */

import { describe, it, expect } from 'vitest';
import {
  GetProductImageSchema,
  DeleteProductImageSchema,
  UploadProductImageSchema,
  UpdateProductImageSchema,
  MAX_IMAGE_B64_LEN,
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

  describe('UploadProductImageSchema (#69 U5)', () => {
    it('should accept { id, base64_data, file_name }', () => {
      const result = UploadProductImageSchema.parse({ id: 1, base64_data: 'aGVsbG8=', file_name: 'p.png' });
      expect(result.id).toBe(1);
      expect(result.base64_data).toBe('aGVsbG8=');
      expect(result.file_name).toBe('p.png');
    });

    it('should accept { id, file_path, file_name }', () => {
      const result = UploadProductImageSchema.parse({ id: 1, file_path: '/tmp/p.png', file_name: 'p.png' });
      expect(result.file_path).toBe('/tmp/p.png');
    });

    it('should reject when BOTH file_path and base64_data are present', () => {
      expect(() => UploadProductImageSchema.parse({
        id: 1, file_path: '/tmp/p.png', base64_data: 'aGVsbG8=', file_name: 'p.png',
      })).toThrow();
    });

    it('should reject when NEITHER file_path nor base64_data is present', () => {
      expect(() => UploadProductImageSchema.parse({ id: 1, file_name: 'p.png' })).toThrow();
    });

    it('should reject missing id', () => {
      expect(() => UploadProductImageSchema.parse({ base64_data: 'aGVsbG8=', file_name: 'p.png' })).toThrow();
    });

    it('should reject missing file_name', () => {
      expect(() => UploadProductImageSchema.parse({ id: 1, base64_data: 'aGVsbG8=' })).toThrow();
    });

    it('should accept an optional mime_type within the allowlist', () => {
      const result = UploadProductImageSchema.parse({ id: 1, base64_data: 'aGVsbG8=', file_name: 'p.png', mime_type: 'image/png' });
      expect(result.mime_type).toBe('image/png');
    });

    it('should reject a mime_type outside the image allowlist', () => {
      expect(() => UploadProductImageSchema.parse({
        id: 1, base64_data: 'aGVsbG8=', file_name: 'p.png', mime_type: 'application/pdf',
      })).toThrow();
    });

    it('should reject a file_name containing a path separator', () => {
      expect(() => UploadProductImageSchema.parse({
        id: 1, base64_data: 'aGVsbG8=', file_name: '../etc/passwd',
      })).toThrow();
    });

    it('should reject a file_name containing a control character', () => {
      expect(() => UploadProductImageSchema.parse({
        id: 1, base64_data: 'aGVsbG8=', file_name: 'p\n.png',
      })).toThrow();
    });

    it('should reject base64_data over the size cap', () => {
      expect(() => UploadProductImageSchema.parse({
        id: 1, base64_data: 'a'.repeat(MAX_IMAGE_B64_LEN + 1), file_name: 'p.png',
      })).toThrow();
    });
  });

  describe('UpdateProductImageSchema (#69 U5)', () => {
    it('should share the upload shape (exactly one of file_path/base64_data)', () => {
      const result = UpdateProductImageSchema.parse({ id: 2, base64_data: 'aGVsbG8=', file_name: 'p.jpg' });
      expect(result.id).toBe(2);
      expect(() => UpdateProductImageSchema.parse({ id: 2, file_name: 'p.jpg' })).toThrow();
    });
  });
});
