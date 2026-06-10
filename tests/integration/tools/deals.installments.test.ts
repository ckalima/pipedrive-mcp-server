/**
 * Integration tests for deal installment tools (U3, #67) -- Growth+ plan
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const installment = {
  id: 7,
  amount: 100,
  billing_date: '2024-03-31',
  description: 'Q1 payment',
  deal_id: 1,
};

// Dynamic import to avoid module caching issues with mocks
async function getDealsTools() {
  return import('../../../src/tools/deals.js');
}

describe('deal installment tools (U3, #67)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listDealInstallments', () => {
    it('should call the collection-level /deals/installments endpoint', async () => {
      const mockFn = mockApiSuccess([installment]);
      const { listDealInstallments } = await getDealsTools();

      await listDealInstallments({ deal_ids: [1, 2, 3] });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals/installments');
    });

    it('should send deal_ids as a single comma-joined query value', async () => {
      const mockFn = mockApiSuccess([installment]);
      const { listDealInstallments } = await getDealsTools();

      await listDealInstallments({ deal_ids: [1, 2, 3] });

      const [url] = mockFn.mock.calls[0];
      // URLSearchParams encodes the comma as %2C
      expect(decodeURIComponent(url)).toContain('deal_ids=1,2,3');
    });

    it('should forward cursor and sort params when provided', async () => {
      const mockFn = mockApiSuccess([installment]);
      const { listDealInstallments } = await getDealsTools();

      await listDealInstallments({ deal_ids: [1], cursor: 'curs', sort_by: 'billing_date', sort_direction: 'asc' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=curs');
      expect(url).toContain('sort_by=billing_date');
      expect(url).toContain('sort_direction=asc');
    });

    it('should surface pagination', async () => {
      mockFetch({ data: [installment], additional_data: paginationFixtures.v2WithMore });
      const { listDealInstallments } = await getDealsTools();

      const result = await listDealInstallments({ deal_ids: [1] });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });

    it('should return isError on API failure', async () => {
      mockApiError(403, 'Plan does not support installments');
      const { listDealInstallments } = await getDealsTools();

      const result = await listDealInstallments({ deal_ids: [1] });

      expect(result.isError).toBe(true);
    });
  });

  describe('addDealInstallment', () => {
    it('should POST to /deals/{id}/installments with all required fields', async () => {
      const mockFn = mockApiSuccess(installment);
      const { addDealInstallment } = await getDealsTools();

      await addDealInstallment({ id: 1, description: 'Q1 payment', amount: 100, billing_date: '2024-03-31' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/installments');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.description).toBe('Q1 payment');
      expect(body.amount).toBe(100);
      expect(body.billing_date).toBe('2024-03-31');
    });

    it('should return summary "Installment added to deal"', async () => {
      mockApiSuccess(installment);
      const { addDealInstallment } = await getDealsTools();

      const result = await addDealInstallment({ id: 1, description: 'Q1 payment', amount: 100, billing_date: '2024-03-31' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Installment added to deal');
    });

    it('should return isError on API failure', async () => {
      mockApiError(400, 'Bad request');
      const { addDealInstallment } = await getDealsTools();

      const result = await addDealInstallment({ id: 1, description: 'Q1 payment', amount: 100, billing_date: '2024-03-31' });

      expect(result.isError).toBe(true);
    });
  });

  describe('updateDealInstallment', () => {
    it('should PATCH /deals/{id}/installments/{installment_id} with only supplied fields', async () => {
      const mockFn = mockApiSuccess(installment);
      const { updateDealInstallment } = await getDealsTools();

      await updateDealInstallment({ id: 1, installment_id: 7, amount: 150 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/installments/7');
      expect(options.method).toBe('PATCH');
      const body = JSON.parse(options.body);
      expect(body.amount).toBe(150);
      expect(body.description).toBeUndefined();
    });

    it('should return isError on API failure', async () => {
      mockApiError(404, 'Not found');
      const { updateDealInstallment } = await getDealsTools();

      const result = await updateDealInstallment({ id: 1, installment_id: 7, amount: 150 });

      expect(result.isError).toBe(true);
    });
  });

  describe('deleteDealInstallment', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteDealInstallment } = await getDealsTools();

      const result = await deleteDealInstallment({ id: 1, installment_id: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteDealInstallment } = await getDealsTools();

      await deleteDealInstallment({ id: 1, installment_id: 7 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should DELETE the correct path when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 7 });
      const { deleteDealInstallment } = await getDealsTools();

      await deleteDealInstallment({ id: 1, installment_id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/installments/7');
      expect(options.method).toBe('DELETE');
    });

    it('should return isError on API failure', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiError(404, 'Not found');
      const { deleteDealInstallment } = await getDealsTools();

      const result = await deleteDealInstallment({ id: 1, installment_id: 7 });

      expect(result.isError).toBe(true);
    });
  });
});
