/**
 * Tests for schemas/persons.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListPersonsSchema,
  GetPersonSchema,
  CreatePersonSchema,
  UpdatePersonSchema,
  SearchPersonsSchema,
  DeletePersonSchema,
  EmailInputSchema,
  PhoneInputSchema,
} from '../../../src/schemas/persons.js';

describe('persons schemas', () => {
  describe('EmailInputSchema', () => {
    it('should accept valid email array', () => {
      const result = EmailInputSchema.parse([
        { value: 'primary@example.com', primary: true, label: 'work' },
        { value: 'secondary@example.com', primary: false, label: 'home' },
      ]);
      expect(result).toHaveLength(2);
      expect(result![0].value).toBe('primary@example.com');
    });

    it('should accept undefined', () => {
      const result = EmailInputSchema.parse(undefined);
      expect(result).toBeUndefined();
    });

    it('should accept empty array', () => {
      const result = EmailInputSchema.parse([]);
      expect(result).toEqual([]);
    });

    it('should validate email format', () => {
      expect(() => EmailInputSchema.parse([{ value: 'not-an-email' }])).toThrow();
    });

    it('should require value field', () => {
      expect(() => EmailInputSchema.parse([{ primary: true }])).toThrow();
    });
  });

  describe('PhoneInputSchema', () => {
    it('should accept valid phone array', () => {
      const result = PhoneInputSchema.parse([
        { value: '+1-555-123-4567', primary: true, label: 'mobile' },
        { value: '+1-555-987-6543', primary: false, label: 'work' },
      ]);
      expect(result).toHaveLength(2);
    });

    it('should accept any string as phone value', () => {
      const result = PhoneInputSchema.parse([{ value: '(555) 123-4567' }]);
      expect(result![0].value).toBe('(555) 123-4567');
    });

    it('should accept undefined', () => {
      const result = PhoneInputSchema.parse(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('ListPersonsSchema', () => {
    it('should accept minimal params', () => {
      const result = ListPersonsSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.sort_direction).toBeUndefined();
    });

    it('should accept all filter parameters', () => {
      const params = {
        cursor: 'abc123',
        limit: 100,
        filter_id: 1,
        ids: '1,2,3',
        owner_id: 5,
        org_id: 10,
        first_char: 'A',
        updated_since: '2024-01-01T00:00:00Z',
        updated_until: '2024-12-31T23:59:59Z',
        sort_by: 'update_time',
        sort_direction: 'asc',
        include_fields: 'notes',
        custom_fields: 'all',
      };

      const result = ListPersonsSchema.parse(params);
      expect(result.first_char).toBe('A');
      expect(result.org_id).toBe(10);
    });

    it('should validate first_char is single character', () => {
      expect(ListPersonsSchema.parse({ first_char: 'A' }).first_char).toBe('A');
      expect(() => ListPersonsSchema.parse({ first_char: 'AB' })).toThrow();
      expect(() => ListPersonsSchema.parse({ first_char: '' })).toThrow();
    });

    it('should accept all valid sort_by values', () => {
      ['id', 'update_time', 'add_time'].forEach((sort_by) => {
        const result = ListPersonsSchema.parse({ sort_by });
        expect(result.sort_by).toBe(sort_by);
      });
    });
  });

  describe('GetPersonSchema', () => {
    it('should require id', () => {
      expect(() => GetPersonSchema.parse({})).toThrow();
    });

    it('should accept valid id with optional fields', () => {
      const result = GetPersonSchema.parse({
        id: 123,
        include_fields: 'deals,notes',
        custom_fields: 'all',
      });
      expect(result.id).toBe(123);
    });
  });

  describe('CreatePersonSchema', () => {
    it('should require name', () => {
      expect(() => CreatePersonSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just name', () => {
      const result = CreatePersonSchema.parse({ name: 'John Doe' });
      expect(result.name).toBe('John Doe');
    });

    it('should accept all optional fields', () => {
      const params = {
        name: 'Jane Smith',
        emails: [{ value: 'jane@example.com', primary: true }],
        phones: [{ value: '+1234567890', primary: true, label: 'mobile' }],
        owner_id: 1,
        org_id: 5,
        visible_to: 7,
        marketing_status: 'subscribed',
        label_ids: [1, 2],
        add_time: '2024-01-01T00:00:00Z',
        custom_fields: { custom_field_key: 'value' },
      };

      const result = CreatePersonSchema.parse(params);
      expect(result.name).toBe('Jane Smith');
      expect(result.emails).toHaveLength(1);
      expect(result.phones).toHaveLength(1);
      expect(result.visible_to).toBe(7);
      expect(result.marketing_status).toBe('subscribed');
    });

    it('should reject empty name', () => {
      expect(() => CreatePersonSchema.parse({ name: '' })).toThrow();
    });

    it('should reject name over 255 characters', () => {
      expect(() => CreatePersonSchema.parse({ name: 'a'.repeat(256) })).toThrow();
    });

    it('should validate visible_to as number (integer)', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = CreatePersonSchema.parse({ name: 'Test', visible_to });
        expect(result.visible_to).toBe(visible_to);
      });
    });

    it('should reject invalid visible_to values in create', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => CreatePersonSchema.parse({ name: 'Test', visible_to })).toThrow();
      });
    });

    it('should accept all valid marketing_status values', () => {
      const statuses = ['no_consent', 'unsubscribed', 'subscribed', 'archived'];
      statuses.forEach((marketing_status) => {
        const result = CreatePersonSchema.parse({ name: 'Test', marketing_status });
        expect(result.marketing_status).toBe(marketing_status);
      });
    });

    it('should reject invalid marketing_status', () => {
      expect(() => CreatePersonSchema.parse({
        name: 'Test',
        marketing_status: 'invalid',
      })).toThrow();
    });
  });

  describe('UpdatePersonSchema', () => {
    it('should require id', () => {
      expect(() => UpdatePersonSchema.parse({})).toThrow();
    });

    it('should accept id with no updates', () => {
      const result = UpdatePersonSchema.parse({ id: 123 });
      expect(result.id).toBe(123);
    });

    it('should accept all updatable fields', () => {
      const params = {
        id: 123,
        name: 'Updated Name',
        emails: [{ value: 'new@example.com', primary: true }],
        phones: [{ value: '+9876543210', primary: true }],
        owner_id: 2,
        org_id: 10,
        visible_to: 5,
        marketing_status: 'unsubscribed',
        label_ids: [3, 4],
        custom_fields: { key: 'new_value' },
      };

      const result = UpdatePersonSchema.parse(params);
      expect(result.id).toBe(123);
      expect(result.name).toBe('Updated Name');
      expect(result.visible_to).toBe(5);
    });

    it('should accept valid visible_to numbers', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = UpdatePersonSchema.parse({ id: 1, visible_to });
        expect(result.visible_to).toBe(visible_to);
        expect(typeof result.visible_to).toBe('number');
      });
    });

    it('should reject invalid visible_to numbers', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => UpdatePersonSchema.parse({ id: 1, visible_to })).toThrow();
      });
    });

    it('should reject visible_to as string', () => {
      expect(() => UpdatePersonSchema.parse({ id: 1, visible_to: '3' as any })).toThrow();
    });

    it('should accept omitted visible_to', () => {
      const result = UpdatePersonSchema.parse({ id: 1 });
      expect(result.visible_to).toBeUndefined();
    });
  });

  describe('SearchPersonsSchema', () => {
    it('should require term', () => {
      expect(() => SearchPersonsSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just term', () => {
      const result = SearchPersonsSchema.parse({ term: 'john' });
      expect(result.term).toBe('john');
      expect(result.search_by_email).toBe(true);
      expect(result.search_by_phone).toBe(true);
      expect(result.exact_match).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should accept all optional filters', () => {
      const params = {
        term: 'jane',
        org_id: 5,
        search_by_email: false,
        search_by_phone: false,
        exact_match: true,
        limit: 25,
      };

      const result = SearchPersonsSchema.parse(params);
      expect(result.search_by_email).toBe(false);
      expect(result.search_by_phone).toBe(false);
      expect(result.exact_match).toBe(true);
    });

    it('should reject empty term', () => {
      expect(() => SearchPersonsSchema.parse({ term: '' })).toThrow();
    });

    it('should reject term over 500 characters', () => {
      expect(() => SearchPersonsSchema.parse({ term: 'a'.repeat(501) })).toThrow();
    });
  });

  describe('DeletePersonSchema', () => {
    it('should require id', () => {
      expect(() => DeletePersonSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = DeletePersonSchema.parse({ id: 456 });
      expect(result.id).toBe(456);
    });
  });
});
