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
} from '../../../src/schemas/common.js';

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
      const statuses = ['open', 'won', 'lost', 'deleted', 'all_not_deleted'];
      statuses.forEach((status) => {
        const result = DealStatusSchema.parse(status);
        expect(result).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      expect(() => DealStatusSchema.parse('pending')).toThrow();
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
});
