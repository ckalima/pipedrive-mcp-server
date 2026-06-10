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
  ListDealFollowersSchema,
  AddDealFollowerSchema,
  DeleteDealFollowerSchema,
  DealFollowersChangelogSchema,
  ListDealProductsSchema,
  AddDealProductSchema,
  UpdateDealProductSchema,
  DeleteDealProductSchema,
  BulkAddDealProductsSchema,
  ListDealDiscountsSchema,
  AddDealDiscountSchema,
  UpdateDealDiscountSchema,
  DeleteDealDiscountSchema,
  ListDealInstallmentsSchema,
  AddDealInstallmentSchema,
  UpdateDealInstallmentSchema,
  DeleteDealInstallmentSchema,
  ConvertDealToLeadSchema,
  GetDealConversionStatusSchema,
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
      const statuses = ['open', 'won', 'lost', 'deleted'];
      statuses.forEach((status) => {
        const result = ListDealsSchema.parse({ status });
        expect(result.status).toBe(status);
      });
    });

    it('should reject all_not_deleted status (not a valid v2 status)', () => {
      expect(() => ListDealsSchema.parse({ status: 'all_not_deleted' })).toThrow();
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
        custom_fields: { field_abc: 'value' },
      };

      const result = CreateDealSchema.parse(params);
      expect(result.title).toBe('Enterprise Deal');
      expect(result.value).toBe(100000);
      expect(result.currency).toBe('USD');
      expect(result.probability).toBe(75);
      expect(result.visible_to).toBe(7);
    });

    it('should strip add_time (not a v2 create field)', () => {
      const r = CreateDealSchema.parse({ title: 'x', add_time: '2024-01-01T00:00:00Z' } as Record<string, unknown>);
      expect((r as Record<string, unknown>).add_time).toBeUndefined();
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

    it('should accept fields and cursor (v2 search)', () => {
      const result = SearchDealsSchema.parse({ term: 'x', fields: 'title,notes', cursor: 'abc' });
      expect(result.fields).toBe('title,notes');
      expect(result.cursor).toBe('abc');
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

  describe('follower schemas (U1, #69)', () => {
    describe('ListDealFollowersSchema', () => {
      it('should require id', () => {
        expect(() => ListDealFollowersSchema.parse({})).toThrow();
      });

      it('should accept id with pagination defaults', () => {
        const result = ListDealFollowersSchema.parse({ id: 3 });
        expect(result.id).toBe(3);
        expect(result.limit).toBe(50);
      });

      it('should accept cursor and limit', () => {
        const result = ListDealFollowersSchema.parse({ id: 3, cursor: 'abc', limit: 25 });
        expect(result.cursor).toBe('abc');
        expect(result.limit).toBe(25);
      });

      it('should reject non-positive id', () => {
        expect(() => ListDealFollowersSchema.parse({ id: 0 })).toThrow();
      });
    });

    describe('AddDealFollowerSchema', () => {
      it('should require id and user_id', () => {
        expect(() => AddDealFollowerSchema.parse({ id: 3 })).toThrow();
        expect(() => AddDealFollowerSchema.parse({ user_id: 7 })).toThrow();
      });

      it('should accept valid id and user_id', () => {
        const result = AddDealFollowerSchema.parse({ id: 3, user_id: 7 });
        expect(result.id).toBe(3);
        expect(result.user_id).toBe(7);
      });

      it('should reject non-positive user_id', () => {
        expect(() => AddDealFollowerSchema.parse({ id: 3, user_id: 0 })).toThrow();
      });
    });

    describe('DeleteDealFollowerSchema', () => {
      it('should require id and follower_id', () => {
        expect(() => DeleteDealFollowerSchema.parse({ id: 3 })).toThrow();
        expect(() => DeleteDealFollowerSchema.parse({ follower_id: 7 })).toThrow();
      });

      it('should accept valid id and follower_id', () => {
        const result = DeleteDealFollowerSchema.parse({ id: 3, follower_id: 7 });
        expect(result.id).toBe(3);
        expect(result.follower_id).toBe(7);
      });

      it('should reject non-positive follower_id', () => {
        expect(() => DeleteDealFollowerSchema.parse({ id: 3, follower_id: -1 })).toThrow();
      });
    });

    describe('DealFollowersChangelogSchema', () => {
      it('should require id', () => {
        expect(() => DealFollowersChangelogSchema.parse({})).toThrow();
      });

      it('should accept id with pagination', () => {
        const result = DealFollowersChangelogSchema.parse({ id: 3, cursor: 'xyz' });
        expect(result.id).toBe(3);
        expect(result.cursor).toBe('xyz');
      });
    });
  });

  describe('U1: deal line-item product schemas', () => {
    describe('ListDealProductsSchema', () => {
      it('should require id', () => {
        expect(() => ListDealProductsSchema.parse({})).toThrow();
      });

      it('should accept id with pagination defaults', () => {
        const result = ListDealProductsSchema.parse({ id: 1 });
        expect(result.id).toBe(1);
        expect(result.limit).toBe(50);
      });

      it('should accept full params including sort', () => {
        const result = ListDealProductsSchema.parse({
          id: 1,
          cursor: 'abc',
          limit: 25,
          sort_by: 'order_nr',
          sort_direction: 'desc',
        });
        expect(result.sort_by).toBe('order_nr');
        expect(result.sort_direction).toBe('desc');
      });

      it('should reject invalid sort_by', () => {
        expect(() => ListDealProductsSchema.parse({ id: 1, sort_by: 'bogus' })).toThrow();
      });
    });

    describe('AddDealProductSchema', () => {
      it('should require id, product_id, item_price, quantity', () => {
        expect(() => AddDealProductSchema.parse({ id: 1, item_price: 10, quantity: 1 })).toThrow();
        expect(() => AddDealProductSchema.parse({ id: 1, product_id: 5, quantity: 1 })).toThrow();
        expect(() => AddDealProductSchema.parse({ id: 1, product_id: 5, item_price: 10 })).toThrow();
      });

      it('should accept minimal required params', () => {
        const result = AddDealProductSchema.parse({ id: 1, product_id: 5, item_price: 10, quantity: 2 });
        expect(result.product_id).toBe(5);
        expect(result.item_price).toBe(10);
        expect(result.quantity).toBe(2);
      });

      it('should accept all optional fields', () => {
        const result = AddDealProductSchema.parse({
          id: 1,
          product_id: 5,
          item_price: 10,
          quantity: 2,
          tax: 20,
          comments: 'note',
          discount: 5,
          is_enabled: true,
          tax_method: 'exclusive',
          discount_type: 'amount',
          product_variation_id: 9,
          billing_frequency: 'monthly',
          billing_frequency_cycles: 12,
          billing_start_date: '2024-01-01',
        });
        expect(result.billing_frequency).toBe('monthly');
        expect(result.discount_type).toBe('amount');
      });

      it('should accept null for nullable optional fields', () => {
        const result = AddDealProductSchema.parse({
          id: 1,
          product_id: 5,
          item_price: 10,
          quantity: 2,
          product_variation_id: null,
          billing_frequency_cycles: null,
          billing_start_date: null,
        });
        expect(result.product_variation_id).toBeNull();
      });

      it('should reject invalid tax_method', () => {
        expect(() => AddDealProductSchema.parse({ id: 1, product_id: 5, item_price: 10, quantity: 2, tax_method: 'vat' })).toThrow();
      });
    });

    describe('UpdateDealProductSchema', () => {
      it('should require id and product_attachment_id', () => {
        expect(() => UpdateDealProductSchema.parse({ id: 1 })).toThrow();
        expect(() => UpdateDealProductSchema.parse({ product_attachment_id: 42 })).toThrow();
      });

      it('should accept a single body field', () => {
        const result = UpdateDealProductSchema.parse({ id: 1, product_attachment_id: 42, quantity: 3 });
        expect(result.product_attachment_id).toBe(42);
        expect(result.quantity).toBe(3);
      });
    });

    describe('DeleteDealProductSchema', () => {
      it('should require product_attachment_id', () => {
        expect(() => DeleteDealProductSchema.parse({ id: 1 })).toThrow();
      });

      it('should accept id and product_attachment_id', () => {
        const result = DeleteDealProductSchema.parse({ id: 1, product_attachment_id: 42 });
        expect(result.product_attachment_id).toBe(42);
      });
    });

    describe('BulkAddDealProductsSchema', () => {
      it('should reject empty data array', () => {
        expect(() => BulkAddDealProductsSchema.parse({ id: 1, data: [] })).toThrow();
      });

      it('should reject items missing product_id', () => {
        expect(() => BulkAddDealProductsSchema.parse({ id: 1, data: [{ item_price: 10, quantity: 1 }] })).toThrow();
      });

      it('should accept an array of valid items', () => {
        const result = BulkAddDealProductsSchema.parse({
          id: 1,
          data: [
            { product_id: 5, item_price: 10, quantity: 1 },
            { product_id: 6, item_price: 20, quantity: 2, discount: 5 },
          ],
        });
        expect(result.data).toHaveLength(2);
      });

      it('should reject more than 100 items', () => {
        const items = Array.from({ length: 101 }, () => ({ product_id: 5, item_price: 10, quantity: 1 }));
        expect(() => BulkAddDealProductsSchema.parse({ id: 1, data: items })).toThrow();
      });
    });
  });

  describe('U2: deal discount schemas', () => {
    const UUID = '4b40248b-945a-4802-b996-60fdff8c5c69';

    describe('ListDealDiscountsSchema', () => {
      it('should require id', () => {
        expect(() => ListDealDiscountsSchema.parse({})).toThrow();
      });

      it('should accept valid id', () => {
        expect(ListDealDiscountsSchema.parse({ id: 1 }).id).toBe(1);
      });
    });

    describe('AddDealDiscountSchema', () => {
      it('should require description, amount, type', () => {
        expect(() => AddDealDiscountSchema.parse({ id: 1, amount: 10, type: 'percentage' })).toThrow();
        expect(() => AddDealDiscountSchema.parse({ id: 1, description: 'x', type: 'percentage' })).toThrow();
        expect(() => AddDealDiscountSchema.parse({ id: 1, description: 'x', amount: 10 })).toThrow();
      });

      it('should reject type not in enum', () => {
        expect(() => AddDealDiscountSchema.parse({ id: 1, description: 'x', amount: 10, type: 'flat' })).toThrow();
      });

      it('should reject non-positive amount', () => {
        expect(() => AddDealDiscountSchema.parse({ id: 1, description: 'x', amount: 0, type: 'amount' })).toThrow();
        expect(() => AddDealDiscountSchema.parse({ id: 1, description: 'x', amount: -5, type: 'amount' })).toThrow();
      });

      it('should accept valid discount', () => {
        const result = AddDealDiscountSchema.parse({ id: 1, description: 'Loyalty', amount: 10, type: 'percentage' });
        expect(result.type).toBe('percentage');
      });
    });

    describe('UpdateDealDiscountSchema', () => {
      it('should require id and discount_id', () => {
        expect(() => UpdateDealDiscountSchema.parse({ id: 1 })).toThrow();
        expect(() => UpdateDealDiscountSchema.parse({ discount_id: UUID })).toThrow();
      });

      it('should reject non-UUID discount_id', () => {
        expect(() => UpdateDealDiscountSchema.parse({ id: 1, discount_id: 'not-a-uuid' })).toThrow();
      });

      it('should accept a single body field', () => {
        const result = UpdateDealDiscountSchema.parse({ id: 1, discount_id: UUID, amount: 15 });
        expect(result.amount).toBe(15);
      });
    });

    describe('DeleteDealDiscountSchema', () => {
      it('should require discount_id as a UUID string', () => {
        expect(() => DeleteDealDiscountSchema.parse({ id: 1 })).toThrow();
        expect(() => DeleteDealDiscountSchema.parse({ id: 1, discount_id: 42 })).toThrow();
      });

      it('should accept valid id and discount_id', () => {
        const result = DeleteDealDiscountSchema.parse({ id: 1, discount_id: UUID });
        expect(result.discount_id).toBe(UUID);
      });
    });
  });

  describe('U3: deal installment schemas', () => {
    describe('ListDealInstallmentsSchema', () => {
      it('should reject missing deal_ids', () => {
        expect(() => ListDealInstallmentsSchema.parse({})).toThrow();
      });

      it('should reject empty deal_ids array', () => {
        expect(() => ListDealInstallmentsSchema.parse({ deal_ids: [] })).toThrow();
      });

      it('should reject more than 100 deal_ids', () => {
        const ids = Array.from({ length: 101 }, (_, i) => i + 1);
        expect(() => ListDealInstallmentsSchema.parse({ deal_ids: ids })).toThrow();
      });

      it('should accept single-item deal_ids', () => {
        const result = ListDealInstallmentsSchema.parse({ deal_ids: [1] });
        expect(result.deal_ids).toEqual([1]);
        expect(result.limit).toBe(50);
      });

      it('should accept cursor and sort params', () => {
        const result = ListDealInstallmentsSchema.parse({
          deal_ids: [1, 2, 3],
          cursor: 'abc',
          sort_by: 'billing_date',
          sort_direction: 'asc',
        });
        expect(result.sort_by).toBe('billing_date');
      });
    });

    describe('AddDealInstallmentSchema', () => {
      it('should reject missing description', () => {
        expect(() => AddDealInstallmentSchema.parse({ id: 1, amount: 10, billing_date: '2024-01-01' })).toThrow();
      });

      it('should reject missing billing_date', () => {
        expect(() => AddDealInstallmentSchema.parse({ id: 1, description: 'x', amount: 10 })).toThrow();
      });

      it('should reject non-positive amount', () => {
        expect(() => AddDealInstallmentSchema.parse({ id: 1, description: 'x', amount: 0, billing_date: '2024-01-01' })).toThrow();
      });

      it('should reject invalid billing_date format', () => {
        expect(() => AddDealInstallmentSchema.parse({ id: 1, description: 'x', amount: 10, billing_date: '01-01-2024' })).toThrow();
      });

      it('should accept valid installment', () => {
        const result = AddDealInstallmentSchema.parse({ id: 1, description: 'Q1', amount: 100, billing_date: '2024-03-31' });
        expect(result.billing_date).toBe('2024-03-31');
      });
    });

    describe('UpdateDealInstallmentSchema', () => {
      it('should require installment_id as an integer', () => {
        expect(() => UpdateDealInstallmentSchema.parse({ id: 1 })).toThrow();
        expect(() => UpdateDealInstallmentSchema.parse({ id: 1, installment_id: 'abc' })).toThrow();
      });

      it('should accept a subset of fields', () => {
        const result = UpdateDealInstallmentSchema.parse({ id: 1, installment_id: 7, amount: 50 });
        expect(result.installment_id).toBe(7);
        expect(result.amount).toBe(50);
      });
    });

    describe('DeleteDealInstallmentSchema', () => {
      it('should require integer installment_id (not string)', () => {
        expect(() => DeleteDealInstallmentSchema.parse({ id: 1, installment_id: '7' })).toThrow();
      });

      it('should accept id and installment_id', () => {
        const result = DeleteDealInstallmentSchema.parse({ id: 1, installment_id: 7 });
        expect(result.installment_id).toBe(7);
      });
    });
  });

  describe('U5: convert-deal-to-lead schemas', () => {
    const UUID = '4b40248b-945a-4802-b996-60fdff8c5c69';

    describe('ConvertDealToLeadSchema', () => {
      it('should require id', () => {
        expect(() => ConvertDealToLeadSchema.parse({})).toThrow();
      });

      it('should reject non-integer id', () => {
        expect(() => ConvertDealToLeadSchema.parse({ id: 1.5 })).toThrow();
      });

      it('should accept valid id', () => {
        expect(ConvertDealToLeadSchema.parse({ id: 1 }).id).toBe(1);
      });
    });

    describe('GetDealConversionStatusSchema', () => {
      it('should require id and conversion_id', () => {
        expect(() => GetDealConversionStatusSchema.parse({ id: 1 })).toThrow();
        expect(() => GetDealConversionStatusSchema.parse({ conversion_id: UUID })).toThrow();
      });

      it('should reject conversion_id that is not a valid UUID', () => {
        expect(() => GetDealConversionStatusSchema.parse({ id: 1, conversion_id: 'not-a-uuid' })).toThrow();
      });

      it('should accept valid id and conversion_id', () => {
        const result = GetDealConversionStatusSchema.parse({ id: 1, conversion_id: UUID });
        expect(result.conversion_id).toBe(UUID);
      });
    });
  });
});
