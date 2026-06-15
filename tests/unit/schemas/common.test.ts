/**
 * Tests for schemas/common.ts
 */

import { describe, it, expect } from 'vitest';
import {
  PaginationParamsSchema,
  PaginationParamsV1Schema,
  IdParamSchema,
  DateStringSchema,
  OptionalDateSchema,
  EmailSchema,
  PhoneSchema,
  SortDirectionSchema,
  DealStatusSchema,
  ActivityTypeSchema,
  VisibilitySchema,
  CurrencyCodeSchema,
  SearchTermSchema,
  CustomFieldValueSchema,
  PathSegmentSchema,
  BoundedTextSchema,
  BoundedNameSchema,
  BoundedQueryParamSchema,
  boundedArray,
  BoundedCustomFieldsSchema,
  BoundedProductCustomFieldsSchema,
  MAX_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_QUERY_PARAM_LENGTH,
  MAX_ARRAY_ITEMS,
  MAX_CUSTOM_FIELD_KEYS,
  MAX_CUSTOM_FIELD_VALUE_LENGTH,
  MAX_CUSTOM_FIELD_DEPTH,
} from '../../../src/schemas/common.js';
import { z } from 'zod';

describe('common schemas', () => {
  describe('PaginationParamsSchema (v2)', () => {
    it('should accept valid pagination params', () => {
      const result = PaginationParamsSchema.parse({
        cursor: 'abc123',
        limit: 50,
      });
      expect(result.cursor).toBe('abc123');
      expect(result.limit).toBe(50);
    });

    it('should use default limit of 50', () => {
      const result = PaginationParamsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept limit at max boundary (100)', () => {
      const result = PaginationParamsSchema.parse({ limit: 100 });
      expect(result.limit).toBe(100);
    });

    it('should reject limit above 100', () => {
      expect(() => PaginationParamsSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject limit below 1', () => {
      expect(() => PaginationParamsSchema.parse({ limit: 0 })).toThrow();
    });

    it('should accept cursor as optional', () => {
      const result = PaginationParamsSchema.parse({ limit: 25 });
      expect(result.cursor).toBeUndefined();
    });
  });

  describe('PaginationParamsV1Schema', () => {
    it('should accept valid v1 pagination params', () => {
      const result = PaginationParamsV1Schema.parse({
        start: 50,
        limit: 100,
      });
      expect(result.start).toBe(50);
      expect(result.limit).toBe(100);
    });

    it('should use default limit of 50', () => {
      const result = PaginationParamsV1Schema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept limit at max boundary (500)', () => {
      const result = PaginationParamsV1Schema.parse({ limit: 500 });
      expect(result.limit).toBe(500);
    });

    it('should reject limit above 500', () => {
      expect(() => PaginationParamsV1Schema.parse({ limit: 501 })).toThrow();
    });

    it('should accept start of 0', () => {
      const result = PaginationParamsV1Schema.parse({ start: 0 });
      expect(result.start).toBe(0);
    });

    it('should reject negative start', () => {
      expect(() => PaginationParamsV1Schema.parse({ start: -1 })).toThrow();
    });
  });

  describe('IdParamSchema', () => {
    it('should accept positive integer ID', () => {
      const result = IdParamSchema.parse({ id: 123 });
      expect(result.id).toBe(123);
    });

    it('should reject zero ID', () => {
      expect(() => IdParamSchema.parse({ id: 0 })).toThrow();
    });

    it('should reject negative ID', () => {
      expect(() => IdParamSchema.parse({ id: -1 })).toThrow();
    });

    it('should reject non-integer ID', () => {
      expect(() => IdParamSchema.parse({ id: 1.5 })).toThrow();
    });

    it('should reject string ID', () => {
      expect(() => IdParamSchema.parse({ id: '123' })).toThrow();
    });
  });

  describe('DateStringSchema', () => {
    it('should accept valid YYYY-MM-DD format', () => {
      const result = DateStringSchema.parse('2024-01-15');
      expect(result).toBe('2024-01-15');
    });

    it('should reject invalid date format', () => {
      expect(() => DateStringSchema.parse('01-15-2024')).toThrow();
    });

    it('should reject date without leading zeros', () => {
      expect(() => DateStringSchema.parse('2024-1-5')).toThrow();
    });

    it('should reject datetime string', () => {
      expect(() => DateStringSchema.parse('2024-01-15T10:30:00')).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => DateStringSchema.parse('')).toThrow();
    });
  });

  describe('OptionalDateSchema', () => {
    it('should accept valid date', () => {
      const result = OptionalDateSchema.parse('2024-06-20');
      expect(result).toBe('2024-06-20');
    });

    it('should accept undefined', () => {
      const result = OptionalDateSchema.parse(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('EmailSchema', () => {
    it('should accept valid email object', () => {
      const result = EmailSchema.parse({
        value: 'test@example.com',
        primary: true,
        label: 'work',
      });
      expect(result.value).toBe('test@example.com');
      expect(result.primary).toBe(true);
      expect(result.label).toBe('work');
    });

    it('should require value field', () => {
      expect(() => EmailSchema.parse({ primary: true })).toThrow();
    });

    it('should validate email format', () => {
      expect(() => EmailSchema.parse({ value: 'not-an-email' })).toThrow();
    });

    it('should accept email without optional fields', () => {
      const result = EmailSchema.parse({ value: 'test@example.com' });
      expect(result.value).toBe('test@example.com');
      expect(result.primary).toBeUndefined();
    });
  });

  describe('PhoneSchema', () => {
    it('should accept valid phone object', () => {
      const result = PhoneSchema.parse({
        value: '+1234567890',
        primary: true,
        label: 'mobile',
      });
      expect(result.value).toBe('+1234567890');
      expect(result.primary).toBe(true);
      expect(result.label).toBe('mobile');
    });

    it('should require value field', () => {
      expect(() => PhoneSchema.parse({ primary: true })).toThrow();
    });

    it('should accept any string as phone value', () => {
      // Phone numbers don't have strict format validation
      const result = PhoneSchema.parse({ value: '123-ABC' });
      expect(result.value).toBe('123-ABC');
    });
  });

  describe('SortDirectionSchema', () => {
    it('should accept "asc"', () => {
      const result = SortDirectionSchema.parse('asc');
      expect(result).toBe('asc');
    });

    it('should accept "desc"', () => {
      const result = SortDirectionSchema.parse('desc');
      expect(result).toBe('desc');
    });

    it('should be undefined when omitted', () => {
      const result = SortDirectionSchema.parse(undefined);
      expect(result).toBeUndefined();
    });

    it('should reject invalid direction', () => {
      expect(() => SortDirectionSchema.parse('ascending')).toThrow();
    });
  });

  describe('DealStatusSchema', () => {
    it('should accept all valid statuses', () => {
      const statuses = ['open', 'won', 'lost', 'deleted'];
      statuses.forEach((status) => {
        const result = DealStatusSchema.parse(status);
        expect(result).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      expect(() => DealStatusSchema.parse('pending')).toThrow();
    });

    it('should reject all_not_deleted (not a valid v2 status)', () => {
      expect(() => DealStatusSchema.parse('all_not_deleted')).toThrow();
    });
  });

  describe('ActivityTypeSchema', () => {
    it('should accept any string as activity type', () => {
      const types = ['call', 'meeting', 'task', 'deadline', 'email', 'lunch', 'custom'];
      types.forEach((type) => {
        const result = ActivityTypeSchema.parse(type);
        expect(result).toBe(type);
      });
    });

    it('should reject non-string', () => {
      expect(() => ActivityTypeSchema.parse(123)).toThrow();
    });
  });

  describe('VisibilitySchema', () => {
    it('should accept valid visibility values', () => {
      [1, 3, 5, 7].forEach((value) => {
        const result = VisibilitySchema.parse(value);
        expect(result).toBe(value);
      });
    });

    it('should reject invalid visibility values', () => {
      [0, 2, 4, 6, 8, 100].forEach((value) => {
        expect(() => VisibilitySchema.parse(value)).toThrow();
      });
    });

    it('should accept undefined', () => {
      const result = VisibilitySchema.parse(undefined);
      expect(result).toBeUndefined();
    });

    it('should reject non-integer', () => {
      expect(() => VisibilitySchema.parse(1.5)).toThrow();
    });
  });

  describe('CurrencyCodeSchema', () => {
    it('should accept valid 3-letter currency code', () => {
      const result = CurrencyCodeSchema.parse('usd');
      expect(result).toBe('USD'); // toUpperCase transform
    });

    it('should convert to uppercase', () => {
      const result = CurrencyCodeSchema.parse('eur');
      expect(result).toBe('EUR');
    });

    it('should reject code that is too short', () => {
      expect(() => CurrencyCodeSchema.parse('US')).toThrow();
    });

    it('should reject code that is too long', () => {
      expect(() => CurrencyCodeSchema.parse('USDD')).toThrow();
    });

    it('should accept undefined', () => {
      const result = CurrencyCodeSchema.parse(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('SearchTermSchema', () => {
    it('should accept valid search term', () => {
      const result = SearchTermSchema.parse('test search');
      expect(result).toBe('test search');
    });

    it('should accept single character', () => {
      const result = SearchTermSchema.parse('a');
      expect(result).toBe('a');
    });

    it('should reject empty string', () => {
      expect(() => SearchTermSchema.parse('')).toThrow();
    });

    it('should accept term at max length (500)', () => {
      const longTerm = 'a'.repeat(500);
      const result = SearchTermSchema.parse(longTerm);
      expect(result).toBe(longTerm);
    });

    it('should reject term over max length', () => {
      const tooLong = 'a'.repeat(501);
      expect(() => SearchTermSchema.parse(tooLong)).toThrow();
    });
  });

  describe('CustomFieldValueSchema', () => {
    it('should accept string', () => {
      const result = CustomFieldValueSchema.parse('text value');
      expect(result).toBe('text value');
    });

    it('should accept number', () => {
      const result = CustomFieldValueSchema.parse(42);
      expect(result).toBe(42);
    });

    it('should accept boolean', () => {
      const result = CustomFieldValueSchema.parse(true);
      expect(result).toBe(true);
    });

    it('should accept null', () => {
      const result = CustomFieldValueSchema.parse(null);
      expect(result).toBeNull();
    });

    it('should accept array of strings', () => {
      const result = CustomFieldValueSchema.parse(['a', 'b', 'c']);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should accept array of numbers', () => {
      const result = CustomFieldValueSchema.parse([1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should reject object', () => {
      expect(() => CustomFieldValueSchema.parse({ key: 'value' })).toThrow();
    });
  });

  describe('PathSegmentSchema (U3, F2)', () => {
    const HASH = '946947d1b02fd3ef20798d6112ec5d895a686a21';

    it('accepts the 40-char hex hash form', () => {
      expect(PathSegmentSchema.parse(HASH)).toBe(HASH);
    });

    it('accepts a hyphenated UUID form', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(PathSegmentSchema.parse(uuid)).toBe(uuid);
    });

    it('accepts snake_case and hyphenated keys', () => {
      expect(PathSegmentSchema.parse('add_time')).toBe('add_time');
      expect(PathSegmentSchema.parse('a-b_c')).toBe('a-b_c');
    });

    it('rejects empty string', () => {
      expect(() => PathSegmentSchema.parse('')).toThrow();
    });

    it('rejects path-traversal and URL-significant characters', () => {
      // Mirrors the FieldCodeSchema hostile-input vector set: backslash
      // (rewritten to '/'), dot-segments, query/fragment, percent-encoding,
      // whitespace/control, scheme separators.
      for (const hostile of [
        '..', '.', 'a/b', 'abc/../deals', 'a\\b', '..\\..\\pipelines\\7',
        'abc?x=1', 'abc#f', '%2e%2e', '%2F', 'a b', 'a\tb', 'a\nb', 'a\0b', 'a:b',
      ]) {
        expect(() => PathSegmentSchema.parse(hostile)).toThrow();
      }
    });

    it('rejects an over-long (but allowlist-valid) segment (U4 cap)', () => {
      expect(() => PathSegmentSchema.parse('a'.repeat(256))).toThrow();
      expect(PathSegmentSchema.parse('a'.repeat(255))).toHaveLength(255);
    });
  });

  // ─── U4 (F3): input-size bounds ─────────────────────────────────────────────
  // These guard the resource-exhaustion class: a single call must not be able to
  // drive unbounded free text, arrays, or deeply-nested records into the API.
  // The caps are generous (far above any legitimate CRM payload); the tests
  // assert the boundary holds, not Pipedrive's own field limits.

  describe('BoundedTextSchema (U4)', () => {
    it('accepts a normal long body', () => {
      const body = 'x'.repeat(10_000);
      expect(BoundedTextSchema.parse(body)).toBe(body);
    });

    it('accepts text at the cap', () => {
      expect(BoundedTextSchema.parse('x'.repeat(MAX_TEXT_LENGTH))).toHaveLength(MAX_TEXT_LENGTH);
    });

    it('rejects text past the cap', () => {
      expect(() => BoundedTextSchema.parse('x'.repeat(MAX_TEXT_LENGTH + 1))).toThrow();
    });
  });

  describe('BoundedNameSchema (U4)', () => {
    it('accepts a normal name', () => {
      expect(BoundedNameSchema.parse('Acme Corp')).toBe('Acme Corp');
    });

    it('accepts a value at the cap', () => {
      expect(BoundedNameSchema.parse('x'.repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
    });

    it('rejects a value past the cap', () => {
      expect(() => BoundedNameSchema.parse('x'.repeat(MAX_NAME_LENGTH + 1))).toThrow();
    });
  });

  describe('BoundedQueryParamSchema (U4)', () => {
    it('accepts a comma-separated id list', () => {
      expect(BoundedQueryParamSchema.parse('1,2,3')).toBe('1,2,3');
    });

    it('accepts a value at the cap', () => {
      expect(BoundedQueryParamSchema.parse('x'.repeat(MAX_QUERY_PARAM_LENGTH))).toHaveLength(MAX_QUERY_PARAM_LENGTH);
    });

    it('rejects a value past the cap', () => {
      expect(() => BoundedQueryParamSchema.parse('x'.repeat(MAX_QUERY_PARAM_LENGTH + 1))).toThrow();
    });
  });

  describe('boundedArray (U4)', () => {
    it('accepts an array within the default cap', () => {
      const arr = Array.from({ length: 5 }, (_, i) => i);
      expect(boundedArray(z.number()).parse(arr)).toEqual(arr);
    });

    it('accepts an array at the default cap', () => {
      const arr = Array.from({ length: MAX_ARRAY_ITEMS }, () => 1);
      expect(boundedArray(z.number()).parse(arr)).toHaveLength(MAX_ARRAY_ITEMS);
    });

    it('rejects an array past the default cap', () => {
      const arr = Array.from({ length: MAX_ARRAY_ITEMS + 1 }, () => 1);
      expect(() => boundedArray(z.number()).parse(arr)).toThrow();
    });

    it('honors an explicit lower cap', () => {
      expect(() => boundedArray(z.number(), 2).parse([1, 2, 3])).toThrow();
      expect(boundedArray(z.number(), 2).parse([1, 2])).toEqual([1, 2]);
    });

    it('still allows chaining .min() after the cap', () => {
      const schema = boundedArray(z.number()).min(1);
      expect(() => schema.parse([])).toThrow();
      expect(schema.parse([1])).toEqual([1]);
    });
  });

  describe('BoundedCustomFieldsSchema (U4)', () => {
    it('accepts a normal custom_fields record', () => {
      const rec = { hash1: 'value', hash2: 42, hash3: ['a', 'b'] };
      expect(BoundedCustomFieldsSchema.parse(rec)).toEqual(rec);
    });

    it('accepts a moderately nested value within the depth cap', () => {
      const rec = { hash1: { a: { b: { c: 1 } } } }; // depth 4 < 6
      expect(BoundedCustomFieldsSchema.parse(rec)).toEqual(rec);
    });

    it('rejects too many keys', () => {
      const rec: Record<string, unknown> = {};
      for (let i = 0; i <= MAX_CUSTOM_FIELD_KEYS; i++) rec[`k${i}`] = 1;
      expect(() => BoundedCustomFieldsSchema.parse(rec)).toThrow();
    });

    it('rejects a value nested past the depth cap', () => {
      // Build a value nested deeper than MAX_CUSTOM_FIELD_DEPTH container levels.
      let deep: unknown = 1;
      for (let i = 0; i < MAX_CUSTOM_FIELD_DEPTH + 1; i++) deep = { nest: deep };
      expect(() => BoundedCustomFieldsSchema.parse({ hash1: deep })).toThrow();
    });

    it('rejects a value past the per-value serialized-size cap', () => {
      const huge = 'x'.repeat(MAX_CUSTOM_FIELD_VALUE_LENGTH + 1);
      expect(() => BoundedCustomFieldsSchema.parse({ hash1: huge })).toThrow();
    });
  });

  describe('BoundedProductCustomFieldsSchema (U4)', () => {
    it('accepts a flat scalar/array record', () => {
      const rec = { hash1: 'value', hash2: 42, hash3: ['a', 'b'] };
      expect(BoundedProductCustomFieldsSchema.parse(rec)).toEqual(rec);
    });

    it('rejects too many keys', () => {
      const rec: Record<string, unknown> = {};
      for (let i = 0; i <= MAX_CUSTOM_FIELD_KEYS; i++) rec[`k${i}`] = 1;
      expect(() => BoundedProductCustomFieldsSchema.parse(rec)).toThrow();
    });

    it('rejects a nested object value (product values are flat)', () => {
      expect(() => BoundedProductCustomFieldsSchema.parse({ hash1: { nested: 1 } })).toThrow();
    });
  });
});
