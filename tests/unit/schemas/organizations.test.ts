/**
 * Tests for schemas/organizations.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListOrganizationsSchema,
  GetOrganizationSchema,
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  SearchOrganizationsSchema,
  DeleteOrganizationSchema,
  AddressSchema,
  ListOrganizationFollowersSchema,
  AddOrganizationFollowerSchema,
  DeleteOrganizationFollowerSchema,
  OrganizationFollowersChangelogSchema,
} from '../../../src/schemas/organizations.js';

describe('organizations schemas', () => {
  describe('ListOrganizationsSchema', () => {
    it('should accept minimal params', () => {
      const result = ListOrganizationsSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.sort_direction).toBeUndefined();
    });

    it('should accept all filter parameters', () => {
      const params = {
        cursor: 'cursor123',
        limit: 100,
        filter_id: 1,
        ids: '1,2,3',
        owner_id: 5,
        updated_since: '2024-01-01T00:00:00Z',
        updated_until: '2024-12-31T23:59:59Z',
        sort_by: 'update_time',
        sort_direction: 'asc',
        include_fields: 'notes',
        custom_fields: 'all',
      };

      const result = ListOrganizationsSchema.parse(params);
      expect(result.owner_id).toBe(5);
    });

    it('should strip first_char (invalid in v2)', () => {
      const r = ListOrganizationsSchema.parse({ first_char: 'A' } as Record<string, unknown>);
      expect((r as Record<string, unknown>).first_char).toBeUndefined();
    });

    it('should accept all valid sort_by values', () => {
      ['id', 'update_time', 'add_time'].forEach((sort_by) => {
        const result = ListOrganizationsSchema.parse({ sort_by });
        expect(result.sort_by).toBe(sort_by);
      });
    });

    it('should reject invalid sort_by', () => {
      expect(() => ListOrganizationsSchema.parse({ sort_by: 'name' })).toThrow();
    });
  });

  describe('GetOrganizationSchema', () => {
    it('should require id', () => {
      expect(() => GetOrganizationSchema.parse({})).toThrow();
    });

    it('should accept valid id with optional fields', () => {
      const result = GetOrganizationSchema.parse({
        id: 123,
        include_fields: 'followers',
        custom_fields: 'field_abc,field_xyz',
      });
      expect(result.id).toBe(123);
      expect(result.include_fields).toBe('followers');
    });
  });

  describe('CreateOrganizationSchema', () => {
    it('should require name', () => {
      expect(() => CreateOrganizationSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just name', () => {
      const result = CreateOrganizationSchema.parse({ name: 'Acme Corp' });
      expect(result.name).toBe('Acme Corp');
    });

    it('should accept all optional fields', () => {
      const params = {
        name: 'Enterprise Inc',
        owner_id: 1,
        visible_to: 7,
        address: { value: '123 Business Ave, Suite 500' },
        label_ids: [1, 2, 3],
        add_time: '2024-01-01T00:00:00Z',
        custom_fields: { industry: 'Tech' },
      };

      const result = CreateOrganizationSchema.parse(params);
      expect(result.name).toBe('Enterprise Inc');
      expect(result.address).toEqual({ value: '123 Business Ave, Suite 500' });
      expect(result.visible_to).toBe(7);
    });

    it('should reject empty name', () => {
      expect(() => CreateOrganizationSchema.parse({ name: '' })).toThrow();
    });

    it('should reject name over 255 characters', () => {
      expect(() => CreateOrganizationSchema.parse({ name: 'a'.repeat(256) })).toThrow();
    });

    it('should validate visible_to as number', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = CreateOrganizationSchema.parse({ name: 'Test', visible_to });
        expect(result.visible_to).toBe(visible_to);
      });
    });

    it('should reject invalid visible_to values', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => CreateOrganizationSchema.parse({ name: 'Test', visible_to })).toThrow();
      });
    });
  });

  describe('UpdateOrganizationSchema', () => {
    it('should require id', () => {
      expect(() => UpdateOrganizationSchema.parse({})).toThrow();
    });

    it('should accept id with no updates', () => {
      const result = UpdateOrganizationSchema.parse({ id: 123 });
      expect(result.id).toBe(123);
    });

    it('should accept all updatable fields', () => {
      const params = {
        id: 123,
        name: 'Updated Corp',
        owner_id: 2,
        visible_to: 5,
        address: { value: 'New Address' },
        label_ids: [4, 5],
        custom_fields: { key: 'new_value' },
      };

      const result = UpdateOrganizationSchema.parse(params);
      expect(result.name).toBe('Updated Corp');
      expect(result.visible_to).toBe(5);
      expect(result.address).toEqual({ value: 'New Address' });
    });

    it('should accept valid visible_to numbers', () => {
      [1, 3, 5, 7].forEach((visible_to) => {
        const result = UpdateOrganizationSchema.parse({ id: 1, visible_to });
        expect(result.visible_to).toBe(visible_to);
        expect(typeof result.visible_to).toBe('number');
      });
    });

    it('should reject invalid visible_to numbers', () => {
      [2, 4, 6, 8].forEach((visible_to) => {
        expect(() => UpdateOrganizationSchema.parse({ id: 1, visible_to })).toThrow();
      });
    });

    it('should reject visible_to as string', () => {
      expect(() => UpdateOrganizationSchema.parse({ id: 1, visible_to: '3' as any })).toThrow();
    });
  });

  describe('SearchOrganizationsSchema', () => {
    it('should require term', () => {
      expect(() => SearchOrganizationsSchema.parse({})).toThrow();
    });

    it('should accept minimal params with just term', () => {
      const result = SearchOrganizationsSchema.parse({ term: 'acme' });
      expect(result.term).toBe('acme');
      expect(result.exact_match).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should accept all optional filters', () => {
      const params = {
        term: 'enterprise',
        exact_match: true,
        limit: 25,
      };

      const result = SearchOrganizationsSchema.parse(params);
      expect(result.exact_match).toBe(true);
      expect(result.limit).toBe(25);
    });

    it('should accept fields and cursor (v2 search)', () => {
      const result = SearchOrganizationsSchema.parse({ term: 'x', fields: 'name,address', cursor: 'abc' });
      expect(result.fields).toBe('name,address');
      expect(result.cursor).toBe('abc');
    });

    it('should reject empty term', () => {
      expect(() => SearchOrganizationsSchema.parse({ term: '' })).toThrow();
    });
  });

  describe('DeleteOrganizationSchema', () => {
    it('should require id', () => {
      expect(() => DeleteOrganizationSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = DeleteOrganizationSchema.parse({ id: 789 });
      expect(result.id).toBe(789);
    });
  });

  describe('AddressSchema', () => {
    it('should accept an object with all 10 subfields', () => {
      const input = {
        value: '123 Business Ave, Suite 500',
        country: 'US',
        admin_area_level_1: 'California',
        admin_area_level_2: 'Santa Clara County',
        locality: 'Sunnyvale',
        sublocality: 'Downtown',
        route: 'Business Ave',
        street_number: '123',
        subpremise: 'Suite 500',
        postal_code: '94085',
      };
      const result = AddressSchema.parse(input);
      expect(result).toEqual(input);
    });

    it('should accept an object with only value', () => {
      const result = AddressSchema.parse({ value: '123 Business Ave' });
      expect(result).toEqual({ value: '123 Business Ave' });
    });

    it('should accept an empty object (all subfields optional)', () => {
      const result = AddressSchema.parse({});
      expect(result).toEqual({});
    });

    it('should reject a bare string — regression guard for issue #44', () => {
      expect(() => CreateOrganizationSchema.parse({ name: 'X', address: '123 Main St' as any })).toThrow();
    });

    it('should reject a non-string subfield', () => {
      expect(() => AddressSchema.parse({ postal_code: 94085 as any })).toThrow();
    });
  });

  describe('follower schemas (U3, #69)', () => {
    describe('ListOrganizationFollowersSchema', () => {
      it('should require id', () => {
        expect(() => ListOrganizationFollowersSchema.parse({})).toThrow();
      });

      it('should accept id with pagination defaults', () => {
        const result = ListOrganizationFollowersSchema.parse({ id: 3 });
        expect(result.id).toBe(3);
        expect(result.limit).toBe(50);
      });

      it('should reject non-positive id', () => {
        expect(() => ListOrganizationFollowersSchema.parse({ id: 0 })).toThrow();
      });
    });

    describe('AddOrganizationFollowerSchema', () => {
      it('should require id and user_id', () => {
        expect(() => AddOrganizationFollowerSchema.parse({ id: 3 })).toThrow();
        expect(() => AddOrganizationFollowerSchema.parse({ user_id: 7 })).toThrow();
      });

      it('should accept valid id and user_id', () => {
        const result = AddOrganizationFollowerSchema.parse({ id: 3, user_id: 7 });
        expect(result.id).toBe(3);
        expect(result.user_id).toBe(7);
      });

      it('should reject non-positive user_id', () => {
        expect(() => AddOrganizationFollowerSchema.parse({ id: 3, user_id: 0 })).toThrow();
      });
    });

    describe('DeleteOrganizationFollowerSchema', () => {
      it('should require id and follower_id', () => {
        expect(() => DeleteOrganizationFollowerSchema.parse({ id: 3 })).toThrow();
        expect(() => DeleteOrganizationFollowerSchema.parse({ follower_id: 7 })).toThrow();
      });

      it('should accept valid id and follower_id', () => {
        const result = DeleteOrganizationFollowerSchema.parse({ id: 3, follower_id: 7 });
        expect(result.id).toBe(3);
        expect(result.follower_id).toBe(7);
      });
    });

    describe('OrganizationFollowersChangelogSchema', () => {
      it('should require id', () => {
        expect(() => OrganizationFollowersChangelogSchema.parse({})).toThrow();
      });

      it('should accept id with pagination', () => {
        const result = OrganizationFollowersChangelogSchema.parse({ id: 3, cursor: 'xyz' });
        expect(result.id).toBe(3);
        expect(result.cursor).toBe('xyz');
      });
    });
  });
});
