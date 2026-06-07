/**
 * Tests for schemas/deals.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListDealsSchema,
  GetDealSchema,
  CreateDealSchema,
  UpdateDealSchema,
  SearchDealsSchema,
  DeleteDealSchema,
} from '../../../src/schemas/deals.js';

describe('deals schemas', () => {
  describe('ListDealsSchema', () => {
    it('should accept minimal params', () => {
      const result = ListDealsSchema.parse({});
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
        person_id: 10,
        org_id: 20,
        pipeline_id: 1,
        stage_id: 2,
        status: 'open',
        updated_since: '2024-01-01T00:00:00Z',
        updated_until: '2024-12-31T23:59:59Z',
        sort_by: 'update_time',
        sort_direction: 'asc',
        include_fields: 'deal_participants,products',
        custom_fields: 'all',
      };

      const result = ListDealsSchema.parse(params);
      expect(result.filter_id).toBe(1);
      expect(result.status).toBe('open');
      expect(result.sort_by).toBe('update_time');
      expect(result.sort_direction).toBe('asc');
    });

    it('should accept all valid status values', () => {
      const statuses = ['open', 'won', 'lost', 'deleted', 'all_not_deleted'];
      statuses.forEach((status) => {
        const result = ListDealsSchema.parse({ status });
        expect(result.status).toBe(status);
      });
    });

    it('should accept all valid sort_by values', () => {
      const sortFields = ['id', 'update_time', 'add_time'];
      sortFields.forEach((sort_by) => {
        const result = ListDealsSchema.parse({ sort_by });
        expect(result.sort_by).toBe(sort_by);
      });
    });

    it('should reject invalid status', () => {
      expect(() => ListDealsSchema.parse({ status: 'invalid' })).toThrow();
    });

    it('should reject invalid sort_by', () => {
      expect(() => ListDealsSchema.parse({ sort_by: 'invalid_field' })).toThrow();
    });
  });

  describe('GetDealSchema', () => {
    it('should require id', () => {
      expect(() => GetDealSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = GetDealSchema.parse({ id: 123 });
      expect(result.id).toBe(123);
    });

    it('should accept optional fields', () => {
      const result = GetDealSchema.parse({
        id: 123,
        include_fields: 'notes,products',
        custom_fields: 'all',
      });
      expect(result.id).toBe(123);
      expect(result.include_fields).toBe('notes,products');
      expect(result.custom_fields).toBe('all');
    });

    it('should reject non-positive id', () => {
      expect(() => GetDealSchema.parse({ id: 0 })).toThrow();
      expect(() => GetDealSchema.parse({ id: -1 })).toThrow();
    });
  });

  describe('CreateDealSchema', () => {
    it('should require title', () => {
      expect(() => CreateDealSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just title', () => {
      const result = CreateDealSchema.parse({ title: 'New Deal' });
      expect(result.title).toBe('New Deal');
    });

    it('should accept all optional fields', () => {
      const params = {
        title: 'Enterprise Deal',
        value: 100000,
        currency: 'USD',
        owner_id: 1,
        person_id: 2,
        org_id: 3,
        pipeline_id: 1,
        stage_id: 5,
        status: 'open',
        expected_close_date: '2024-12-31',
        probability: 75,
        visible_to: 7,
        label_ids: [1, 2, 3],
        add_time: '2024-01-01T00:00:00Z',
        custom_fields: { field_abc: 'value' },
      };

      const result = CreateDealSchema.parse(params);
      expect(result.title).toBe('Enterprise Deal');
      expect(result.value).toBe(100000);
      expect(result.currency).toBe('USD');
      expect(result.probability).toBe(75);
      expect(result.visible_to).toBe(7);
    });

    it('should reject empty title', () => {
      expect(() => CreateDealSchema.parse({ title: '' })).toThrow();
    });

    it('should reject title over 255 characters', () => {
      expect(() => CreateDealSchema.parse({ title: 'a'.repeat(256) })).toThrow();
    });

    it('should reject negative value', () => {
      expect(() => CreateDealSchema.parse({ title: 'Deal', value: -100 })).toThrow();
    });

    it('should accept zero value', () => {
      const result = CreateDealSchema.parse({ title: 'Deal', value: 0 });
      expect(result.value).toBe(0);
    });

    it('should reject probability over 100', () => {
      expect(() => CreateDealSchema.parse({ title: 'Deal', probability: 101 })).toThrow();
    });

    it('should reject probability below 0', () => {
      expect(() => CreateDealSchema.parse({ title: 'Deal', probability: -1 })).toThrow();
    });

    it('should accept probability at boundaries', () => {
      expect(CreateDealSchema.parse({ title: 'Deal', probability: 0 }).probability).toBe(0);
      expect(CreateDealSchema.parse({ title: 'Deal', probability: 100 }).probability).toBe(100);
    });

    it('should validate visible_to values', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = CreateDealSchema.parse({ title: 'Deal', visible_to });
        expect(result.visible_to).toBe(visible_to);
      });
    });

    it('should reject invalid visible_to values', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => CreateDealSchema.parse({ title: 'Deal', visible_to })).toThrow();
      });
    });

    it('should validate date format for expected_close_date', () => {
      const result = CreateDealSchema.parse({
        title: 'Deal',
        expected_close_date: '2024-12-31',
      });
      expect(result.expected_close_date).toBe('2024-12-31');
    });

    it('should reject invalid date format', () => {
      expect(() => CreateDealSchema.parse({
        title: 'Deal',
        expected_close_date: '12-31-2024',
      })).toThrow();
    });
  });

  describe('UpdateDealSchema', () => {
    it('should require id', () => {
      expect(() => UpdateDealSchema.parse({})).toThrow();
    });

    it('should accept id with no updates', () => {
      const result = UpdateDealSchema.parse({ id: 123 });
      expect(result.id).toBe(123);
    });

    it('should accept all updatable fields', () => {
      const params = {
        id: 123,
        title: 'Updated Deal',
        value: 50000,
        currency: 'EUR',
        owner_id: 2,
        person_id: 3,
        org_id: 4,
        pipeline_id: 2,
        stage_id: 6,
        status: 'won',
        expected_close_date: '2024-06-30',
        probability: 100,
        won_time: '2024-01-15T10:00:00Z',
        lost_time: undefined,
        lost_reason: undefined,
        label_ids: [5, 6],
        custom_fields: { field_xyz: 123 },
      };

      const result = UpdateDealSchema.parse(params);
      expect(result.id).toBe(123);
      expect(result.title).toBe('Updated Deal');
      expect(result.status).toBe('won');
    });

    it('should accept won_time when setting status to won', () => {
      const result = UpdateDealSchema.parse({
        id: 123,
        status: 'won',
        won_time: '2024-01-15T12:00:00Z',
      });
      expect(result.won_time).toBe('2024-01-15T12:00:00Z');
    });

    it('should accept lost_time and lost_reason when setting status to lost', () => {
      const result = UpdateDealSchema.parse({
        id: 123,
        status: 'lost',
        lost_time: '2024-01-15T12:00:00Z',
        lost_reason: 'Price too high',
      });
      expect(result.lost_time).toBe('2024-01-15T12:00:00Z');
      expect(result.lost_reason).toBe('Price too high');
    });
  });

  describe('SearchDealsSchema', () => {
    it('should require term', () => {
      expect(() => SearchDealsSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just term', () => {
      const result = SearchDealsSchema.parse({ term: 'test' });
      expect(result.term).toBe('test');
      expect(result.exact_match).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should accept all optional filters', () => {
      const params = {
        term: 'enterprise',
        person_id: 1,
        org_id: 2,
        status: 'open',
        exact_match: true,
        limit: 25,
      };

      const result = SearchDealsSchema.parse(params);
      expect(result.term).toBe('enterprise');
      expect(result.person_id).toBe(1);
      expect(result.org_id).toBe(2);
      expect(result.status).toBe('open');
      expect(result.exact_match).toBe(true);
      expect(result.limit).toBe(25);
    });

    it('should reject empty term', () => {
      expect(() => SearchDealsSchema.parse({ term: '' })).toThrow();
    });

    it('should reject term over 500 characters', () => {
      expect(() => SearchDealsSchema.parse({ term: 'a'.repeat(501) })).toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() => SearchDealsSchema.parse({ term: 'test', limit: 101 })).toThrow();
    });
  });

  describe('DeleteDealSchema', () => {
    it('should require id', () => {
      expect(() => DeleteDealSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = DeleteDealSchema.parse({ id: 456 });
      expect(result.id).toBe(456);
    });

    it('should reject non-positive id', () => {
      expect(() => DeleteDealSchema.parse({ id: 0 })).toThrow();
    });
  });
});
