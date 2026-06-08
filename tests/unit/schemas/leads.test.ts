/**
 * Tests for schemas/leads.ts
 */

import { describe, it, expect } from 'vitest';
import {
  LeadValueSchema,
  LeadIdSchema,
  ListLeadsSchema,
  ListArchivedLeadsSchema,
  GetLeadSchema,
  CreateLeadSchema,
  UpdateLeadSchema,
  DeleteLeadSchema,
  SearchLeadsSchema,
  ConvertLeadToDealSchema,
  GetLeadConversionStatusSchema,
} from '../../../src/schemas/leads.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('leads schemas', () => {
  describe('LeadValueSchema', () => {
    it('should accept amount of zero', () => {
      const result = LeadValueSchema.parse({ amount: 0 });
      expect(result.amount).toBe(0);
    });

    it('should accept amount with currency', () => {
      const result = LeadValueSchema.parse({ amount: 500, currency: 'USD' });
      expect(result.amount).toBe(500);
      expect(result.currency).toBe('USD');
    });

    it('should accept large amount without currency', () => {
      const result = LeadValueSchema.parse({ amount: 1000000 });
      expect(result.amount).toBe(1000000);
      expect(result.currency).toBeUndefined();
    });

    it('should reject negative amount', () => {
      expect(() => LeadValueSchema.parse({ amount: -1 })).toThrow();
    });

    it('should reject currency that is too short', () => {
      expect(() => LeadValueSchema.parse({ amount: 100, currency: 'US' })).toThrow();
    });

    it('should reject currency that is too long', () => {
      expect(() => LeadValueSchema.parse({ amount: 100, currency: 'USDD' })).toThrow();
    });

    it('should require amount field', () => {
      expect(() => LeadValueSchema.parse({ currency: 'USD' })).toThrow();
    });
  });

  describe('LeadIdSchema', () => {
    it('should accept valid UUID', () => {
      const result = LeadIdSchema.parse({ id: VALID_UUID });
      expect(result.id).toBe(VALID_UUID);
    });

    it('should reject integer ID', () => {
      expect(() => LeadIdSchema.parse({ id: 1 })).toThrow();
    });

    it('should reject non-UUID string', () => {
      expect(() => LeadIdSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => LeadIdSchema.parse({ id: '' })).toThrow();
    });

    it('should require id field', () => {
      expect(() => LeadIdSchema.parse({})).toThrow();
    });
  });

  describe('ListLeadsSchema', () => {
    it('should accept empty input and apply defaults', () => {
      const result = ListLeadsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept all filter parameters', () => {
      const params = {
        start: 50,
        limit: 100,
        owner_id: 1,
        person_id: 2,
        organization_id: 3,
        filter_id: 4,
        sort: 'id ASC',
      };
      const result = ListLeadsSchema.parse(params);
      expect(result.start).toBe(50);
      expect(result.limit).toBe(100);
      expect(result.owner_id).toBe(1);
      expect(result.person_id).toBe(2);
      expect(result.organization_id).toBe(3);
      expect(result.filter_id).toBe(4);
      expect(result.sort).toBe('id ASC');
    });

    it('should reject limit of 0', () => {
      expect(() => ListLeadsSchema.parse({ limit: 0 })).toThrow();
    });

    it('should reject limit over 500', () => {
      expect(() => ListLeadsSchema.parse({ limit: 501 })).toThrow();
    });

    it('should reject negative start', () => {
      expect(() => ListLeadsSchema.parse({ start: -1 })).toThrow();
    });
  });

  describe('ListArchivedLeadsSchema', () => {
    it('should accept empty input and apply defaults', () => {
      const result = ListArchivedLeadsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept all filter parameters', () => {
      const result = ListArchivedLeadsSchema.parse({ owner_id: 5, limit: 25 });
      expect(result.owner_id).toBe(5);
      expect(result.limit).toBe(25);
    });

    it('should reject limit of 0', () => {
      expect(() => ListArchivedLeadsSchema.parse({ limit: 0 })).toThrow();
    });

    it('should reject limit over 500', () => {
      expect(() => ListArchivedLeadsSchema.parse({ limit: 501 })).toThrow();
    });
  });

  describe('GetLeadSchema', () => {
    it('should accept valid UUID', () => {
      const result = GetLeadSchema.parse({ id: VALID_UUID });
      expect(result.id).toBe(VALID_UUID);
    });

    it('should require id', () => {
      expect(() => GetLeadSchema.parse({})).toThrow();
    });

    it('should reject integer id', () => {
      expect(() => GetLeadSchema.parse({ id: 1 })).toThrow();
    });

    it('should reject non-UUID string', () => {
      expect(() => GetLeadSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });

    it('should reject empty string id', () => {
      expect(() => GetLeadSchema.parse({ id: '' })).toThrow();
    });
  });

  describe('CreateLeadSchema', () => {
    it('should require title', () => {
      expect(() => CreateLeadSchema.parse({})).toThrow();
    });

    it('should accept title with person_id', () => {
      const result = CreateLeadSchema.parse({ title: 'My Lead', person_id: 1 });
      expect(result.title).toBe('My Lead');
      expect(result.person_id).toBe(1);
    });

    it('should accept title with organization_id', () => {
      const result = CreateLeadSchema.parse({ title: 'My Lead', organization_id: 5 });
      expect(result.title).toBe('My Lead');
      expect(result.organization_id).toBe(5);
    });

    it('should accept full payload with value object', () => {
      const params = {
        title: 'Full Lead',
        person_id: 1,
        organization_id: 2,
        value: { amount: 5000, currency: 'USD' },
        owner_id: 3,
        label_ids: [VALID_UUID],
        expected_close_date: '2024-12-31',
        visible_to: 7,
      };
      const result = CreateLeadSchema.parse(params);
      expect(result.title).toBe('Full Lead');
      expect(result.value!.amount).toBe(5000);
      expect(result.value!.currency).toBe('USD');
      expect(result.visible_to).toBe(7);
      expect(result.expected_close_date).toBe('2024-12-31');
    });

    it('should reject empty title', () => {
      expect(() => CreateLeadSchema.parse({ title: '' })).toThrow();
    });

    it('should reject title over 255 characters', () => {
      expect(() => CreateLeadSchema.parse({ title: 'a'.repeat(256) })).toThrow();
    });

    it('should accept valid visible_to values', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = CreateLeadSchema.parse({ title: 'Lead', visible_to });
        expect(result.visible_to).toBe(visible_to);
      });
    });

    it('should reject invalid visible_to values', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => CreateLeadSchema.parse({ title: 'Lead', visible_to })).toThrow();
      });
    });

    it('should reject invalid expected_close_date format', () => {
      expect(() => CreateLeadSchema.parse({ title: 'Lead', expected_close_date: '12/31/2024' })).toThrow();
      expect(() => CreateLeadSchema.parse({ title: 'Lead', expected_close_date: '2024/12/31' })).toThrow();
      expect(() => CreateLeadSchema.parse({ title: 'Lead', expected_close_date: 'not-a-date' })).toThrow();
    });

    it('should accept label_ids as UUID array', () => {
      const result = CreateLeadSchema.parse({
        title: 'Lead',
        label_ids: [VALID_UUID],
      });
      expect(result.label_ids).toEqual([VALID_UUID]);
    });

    it('should reject non-UUID label_ids', () => {
      expect(() => CreateLeadSchema.parse({
        title: 'Lead',
        label_ids: ['not-a-uuid'],
      })).toThrow();
    });
  });

  describe('UpdateLeadSchema', () => {
    it('should require id as UUID', () => {
      expect(() => UpdateLeadSchema.parse({})).toThrow();
    });

    it('should reject integer id', () => {
      expect(() => UpdateLeadSchema.parse({ id: 1 })).toThrow();
    });

    it('should accept id with no other fields', () => {
      const result = UpdateLeadSchema.parse({ id: VALID_UUID });
      expect(result.id).toBe(VALID_UUID);
    });

    it('should accept all updatable fields', () => {
      const params = {
        id: VALID_UUID,
        title: 'Updated Lead',
        person_id: 1,
        organization_id: 2,
        value: { amount: 9000, currency: 'EUR' },
        owner_id: 3,
        label_ids: [VALID_UUID],
        expected_close_date: '2025-06-30',
        visible_to: 3,
        is_archived: false,
      };
      const result = UpdateLeadSchema.parse(params);
      expect(result.id).toBe(VALID_UUID);
      expect(result.title).toBe('Updated Lead');
      expect(result.visible_to).toBe(3);
      expect(result.is_archived).toBe(false);
    });

    it('should accept is_archived: true', () => {
      const result = UpdateLeadSchema.parse({ id: VALID_UUID, is_archived: true });
      expect(result.is_archived).toBe(true);
    });

    it('should accept is_archived: false', () => {
      const result = UpdateLeadSchema.parse({ id: VALID_UUID, is_archived: false });
      expect(result.is_archived).toBe(false);
    });

    it('should accept valid visible_to numbers', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = UpdateLeadSchema.parse({ id: VALID_UUID, visible_to });
        expect(result.visible_to).toBe(visible_to);
      });
    });

    it('should reject invalid visible_to numbers', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => UpdateLeadSchema.parse({ id: VALID_UUID, visible_to })).toThrow();
      });
    });
  });

  describe('DeleteLeadSchema', () => {
    it('should require id', () => {
      expect(() => DeleteLeadSchema.parse({})).toThrow();
    });

    it('should accept valid UUID id', () => {
      const result = DeleteLeadSchema.parse({ id: VALID_UUID });
      expect(result.id).toBe(VALID_UUID);
    });

    it('should reject integer id', () => {
      expect(() => DeleteLeadSchema.parse({ id: 1 })).toThrow();
    });

    it('should reject non-UUID string', () => {
      expect(() => DeleteLeadSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });
  });

  describe('ConvertLeadToDealSchema', () => {
    it('should accept valid UUID', () => {
      const result = ConvertLeadToDealSchema.parse({ id: VALID_UUID });
      expect(result.id).toBe(VALID_UUID);
    });

    it('should require id', () => {
      expect(() => ConvertLeadToDealSchema.parse({})).toThrow();
    });

    it('should reject integer id', () => {
      expect(() => ConvertLeadToDealSchema.parse({ id: 1 })).toThrow();
    });

    it('should reject non-UUID string', () => {
      expect(() => ConvertLeadToDealSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });

    it('should accept optional stage_id and pipeline_id', () => {
      const r = ConvertLeadToDealSchema.parse({ id: VALID_UUID, stage_id: 3, pipeline_id: 4 });
      expect(r.stage_id).toBe(3);
      expect(r.pipeline_id).toBe(4);
    });
  });

  describe('SearchLeadsSchema', () => {
    it('should require term', () => {
      expect(() => SearchLeadsSchema.parse({})).toThrow();
    });

    it('should apply default exact_match and limit', () => {
      const result = SearchLeadsSchema.parse({ term: 'test' });
      expect(result.term).toBe('test');
      expect(result.exact_match).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should reject empty term', () => {
      expect(() => SearchLeadsSchema.parse({ term: '' })).toThrow();
    });

    it('should reject term over 500 characters', () => {
      expect(() => SearchLeadsSchema.parse({ term: 'a'.repeat(501) })).toThrow();
    });

    it('should accept all optional fields', () => {
      const params = {
        term: 'acme',
        include_fields: 'lead.was_seen',
        exact_match: true,
        limit: 25,
        cursor: 'cursor_abc123',
      };
      const result = SearchLeadsSchema.parse(params);
      expect(result.term).toBe('acme');
      expect(result.exact_match).toBe(true);
      expect(result.limit).toBe(25);
      expect(result.cursor).toBe('cursor_abc123');
      expect(result.include_fields).toBe('lead.was_seen');
    });

    it('should reject limit of 0', () => {
      expect(() => SearchLeadsSchema.parse({ term: 'test', limit: 0 })).toThrow();
    });

    it('should accept limit up to 500', () => {
      expect(SearchLeadsSchema.parse({ term: 't', limit: 500 }).limit).toBe(500);
      expect(SearchLeadsSchema.parse({ term: 't', limit: 101 }).limit).toBe(101);
    });

    it('should reject limit over 500', () => {
      expect(() => SearchLeadsSchema.parse({ term: 'test', limit: 501 })).toThrow();
    });

    it('should accept fields, person_id, organization_id (v2 search filters)', () => {
      const r = SearchLeadsSchema.parse({ term: 'x', fields: 'title,notes', person_id: 1, organization_id: 2 });
      expect(r.fields).toBe('title,notes');
      expect(r.person_id).toBe(1);
      expect(r.organization_id).toBe(2);
    });

    it('should reject an include_fields value other than lead.was_seen', () => {
      expect(() => SearchLeadsSchema.parse({ term: 'x', include_fields: 'person' })).toThrow();
    });
  });

  describe('GetLeadConversionStatusSchema', () => {
    it('should accept valid id and conversion_id UUIDs', () => {
      const r = GetLeadConversionStatusSchema.parse({ id: VALID_UUID, conversion_id: VALID_UUID });
      expect(r.id).toBe(VALID_UUID);
      expect(r.conversion_id).toBe(VALID_UUID);
    });

    it('should require both id and conversion_id', () => {
      expect(() => GetLeadConversionStatusSchema.parse({ id: VALID_UUID })).toThrow();
      expect(() => GetLeadConversionStatusSchema.parse({ conversion_id: VALID_UUID })).toThrow();
      expect(() => GetLeadConversionStatusSchema.parse({})).toThrow();
    });

    it('should reject a non-UUID conversion_id', () => {
      expect(() => GetLeadConversionStatusSchema.parse({ id: VALID_UUID, conversion_id: 'not-a-uuid' })).toThrow();
    });
  });
});
