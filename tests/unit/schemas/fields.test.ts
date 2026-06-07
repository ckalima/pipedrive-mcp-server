/**
 * Tests for schemas/fields.ts
 */

import { describe, it, expect } from 'vitest';
import {
  FieldEntityTypeSchema,
  ListOrganizationFieldsSchema,
  ListDealFieldsSchema,
  ListPersonFieldsSchema,
  GetFieldSchema,
} from '../../../src/schemas/fields.js';

describe('fields schemas', () => {
  describe('FieldEntityTypeSchema', () => {
    it('should accept all valid entity types', () => {
      const types = ['organization', 'deal', 'person', 'product', 'activity', 'project'];
      types.forEach((type) => {
        const result = FieldEntityTypeSchema.parse(type);
        expect(result).toBe(type);
      });
    });

    it('should reject invalid entity type', () => {
      expect(() => FieldEntityTypeSchema.parse('user')).toThrow();
      expect(() => FieldEntityTypeSchema.parse('lead')).toThrow();
    });
  });

  describe('ListOrganizationFieldsSchema', () => {
    it('should accept minimal params', () => {
      const result = ListOrganizationFieldsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should default limit to 50', () => {
      const result = ListOrganizationFieldsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept cursor param', () => {
      const result = ListOrganizationFieldsSchema.parse({ cursor: 'abc', limit: 50 });
      expect(result.cursor).toBe('abc');
      expect(result.limit).toBe(50);
    });

    it('should accept limit up to 100', () => {
      const result = ListOrganizationFieldsSchema.parse({ limit: 100 });
      expect(result.limit).toBe(100);
    });

    it('should reject limit above 100', () => {
      expect(() => ListOrganizationFieldsSchema.parse({ limit: 101 })).toThrow();
    });

    it('should not treat unknown start param as valid (Zod strips it silently)', () => {
      // Zod strips unknown keys by default; start is not in the v2 schema
      const result = ListOrganizationFieldsSchema.parse({ start: 50 } as Record<string, unknown>);
      expect((result as Record<string, unknown>).start).toBeUndefined();
    });
  });

  describe('ListDealFieldsSchema', () => {
    it('should accept minimal params', () => {
      const result = ListDealFieldsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept cursor param', () => {
      const result = ListDealFieldsSchema.parse({ cursor: 'abc', limit: 100 });
      expect(result.cursor).toBe('abc');
      expect(result.limit).toBe(100);
    });

    it('should reject limit above 100', () => {
      expect(() => ListDealFieldsSchema.parse({ limit: 250 })).toThrow();
    });
  });

  describe('ListPersonFieldsSchema', () => {
    it('should accept minimal params', () => {
      const result = ListPersonFieldsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept cursor param', () => {
      const result = ListPersonFieldsSchema.parse({ cursor: 'xyz', limit: 25 });
      expect(result.cursor).toBe('xyz');
      expect(result.limit).toBe(25);
    });

    it('should reject limit above 100', () => {
      expect(() => ListPersonFieldsSchema.parse({ limit: 500 })).toThrow();
    });
  });

  describe('GetFieldSchema', () => {
    it('should require entity_type and key', () => {
      expect(() => GetFieldSchema.parse({})).toThrow();
      expect(() => GetFieldSchema.parse({ entity_type: 'deal' })).toThrow();
      expect(() => GetFieldSchema.parse({ key: 'abc123' })).toThrow();
    });

    it('should accept valid params', () => {
      const result = GetFieldSchema.parse({
        entity_type: 'deal',
        key: 'abc123def456',
      });
      expect(result.entity_type).toBe('deal');
      expect(result.key).toBe('abc123def456');
    });

    it('should accept all valid entity types', () => {
      const types = ['organization', 'deal', 'person', 'product', 'activity', 'project'];
      types.forEach((entity_type) => {
        const result = GetFieldSchema.parse({ entity_type, key: 'field_key' });
        expect(result.entity_type).toBe(entity_type);
      });
    });

    it('should accept standard field names as key', () => {
      const standardFields = ['name', 'title', 'value', 'status', 'owner_id'];
      standardFields.forEach((key) => {
        const result = GetFieldSchema.parse({ entity_type: 'deal', key });
        expect(result.key).toBe(key);
      });
    });

    it('should accept 40-character hash as custom field key', () => {
      const customFieldKey = 'a'.repeat(40);
      const result = GetFieldSchema.parse({
        entity_type: 'person',
        key: customFieldKey,
      });
      expect(result.key).toBe(customFieldKey);
    });

    it('should reject invalid entity type', () => {
      expect(() => GetFieldSchema.parse({
        entity_type: 'invalid',
        key: 'field_key',
      })).toThrow();
    });
  });
});
