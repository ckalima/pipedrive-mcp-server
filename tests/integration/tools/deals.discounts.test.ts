/**
 * Integration tests for deal discount tools (U2, #67)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockApiSuccess,
  mockApiError,
} from '../../helpers/mockFetch.js';

const DISCOUNT_UUID = '4b40248b-945a-4802-b996-60fdff8c5c69';

const discount = {
  id: DISCOUNT_UUID,
  type: 'percentage',
  amount: 10,
  description: 'Loyalty discount',
  deal_id: 1,
};

// Dynamic import to avoid module caching issues with mocks
async function getDealsTools() {
  return import('../../../src/tools/deals.js');
}

describe('deal discount tools (U2, #67)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listDealDiscounts', () => {
    it('should call GET /deals/{id}/discounts', async () => {
      const mockFn = mockApiSuccess([discount]);
      const { listDealDiscounts } = await getDealsTools();

      await listDealDiscounts({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals/1/discounts');
      expect(options.method).toBe('GET');
    });

    it('should return summary + data array', async () => {
      mockApiSuccess([discount, discount]);
      const { listDealDiscounts } = await getDealsTools();

      const result = await listDealDiscounts({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('discount');
      expect(parsed.data).toHaveLength(2);
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listDealDiscounts } = await getDealsTools();

      const result = await listDealDiscounts({ id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe('addDealDiscount', () => {
    it('should POST description, amount, and type', async () => {
      const mockFn = mockApiSuccess(discount);
      const { addDealDiscount } = await getDealsTools();

      await addDealDiscount({ id: 1, description: 'Loyalty', amount: 10, type: 'percentage' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/discounts');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.description).toBe('Loyalty');
      expect(body.amount).toBe(10);
      expect(body.type).toBe('percentage');
    });

    it('should return summary "Discount added to deal"', async () => {
      mockApiSuccess(discount);
      const { addDealDiscount } = await getDealsTools();

      const result = await addDealDiscount({ id: 1, description: 'Loyalty', amount: 10, type: 'percentage' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Discount added to deal');
    });

    it('should return isError on API failure', async () => {
      mockApiError(400, 'Bad request');
      const { addDealDiscount } = await getDealsTools();

      const result = await addDealDiscount({ id: 1, description: 'Loyalty', amount: 10, type: 'percentage' });

      expect(result.isError).toBe(true);
    });
  });

  describe('updateDealDiscount', () => {
    it('should PATCH the correct path with the UUID, only supplied fields', async () => {
      const mockFn = mockApiSuccess(discount);
      const { updateDealDiscount } = await getDealsTools();

      await updateDealDiscount({ id: 1, discount_id: DISCOUNT_UUID, amount: 15 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain(`/deals/1/discounts/${DISCOUNT_UUID}`);
      expect(options.method).toBe('PATCH');
      const body = JSON.parse(options.body);
      expect(body.amount).toBe(15);
      expect(body.description).toBeUndefined();
    });

    it('should return isError on API failure', async () => {
      mockApiError(404, 'Not found');
      const { updateDealDiscount } = await getDealsTools();

      const result = await updateDealDiscount({ id: 1, discount_id: DISCOUNT_UUID, amount: 15 });

      expect(result.isError).toBe(true);
    });
  });

  describe('deleteDealDiscount', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteDealDiscount } = await getDealsTools();

      const result = await deleteDealDiscount({ id: 1, discount_id: DISCOUNT_UUID });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteDealDiscount } = await getDealsTools();

      await deleteDealDiscount({ id: 1, discount_id: DISCOUNT_UUID });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should DELETE the correct UUID path when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 99 });
      const { deleteDealDiscount } = await getDealsTools();

      await deleteDealDiscount({ id: 1, discount_id: DISCOUNT_UUID });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain(`/deals/1/discounts/${DISCOUNT_UUID}`);
      expect(options.method).toBe('DELETE');
    });

    it('should key the summary on the UUID, not the integer id in the response', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      // Spec returns an integer id that is NOT a reusable discount identifier.
      // 7777 shares no digits with the UUID (which contains no '7'), so a match
      // would prove the summary leaked the response id rather than the UUID.
      mockApiSuccess({ id: 7777 });
      const { deleteDealDiscount } = await getDealsTools();

      const result = await deleteDealDiscount({ id: 1, discount_id: DISCOUNT_UUID });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain(DISCOUNT_UUID);
      expect(parsed.summary).toContain('deal 1');
      expect(parsed.summary).not.toContain('7777');
    });

    it('should return isError on API failure', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiError(404, 'Not found');
      const { deleteDealDiscount } = await getDealsTools();

      const result = await deleteDealDiscount({ id: 1, discount_id: DISCOUNT_UUID });

      expect(result.isError).toBe(true);
    });
  });
});
