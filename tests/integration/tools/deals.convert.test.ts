/**
 * Integration tests for deal convert-to-lead tools (U5, #67)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockApiSuccess,
  mockApiError,
} from '../../helpers/mockFetch.js';

const CONVERSION_UUID = '4b40248b-945a-4802-b996-60fdff8c5c69';
const LEAD_UUID = '550e8400-e29b-41d4-a716-446655440000';

// Dynamic import to avoid module caching issues with mocks
async function getDealsTools() {
  return import('../../../src/tools/deals.js');
}

describe('deal convert-to-lead tools (U5, #67)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('convertDealToLead', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset (destructive)', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { convertDealToLead } = await getDealsTools();

      const result = await convertDealToLead({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { convertDealToLead } = await getDealsTools();

      await convertDealToLead({ id: 1 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should POST to /deals/{id}/convert/lead with an empty body when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ conversion_id: CONVERSION_UUID });
      const { convertDealToLead } = await getDealsTools();

      await convertDealToLead({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/1/convert/lead');
      expect(options.method).toBe('POST');
      expect(options.body).toBe('{}');
    });

    it('should return conversion_id in data on success', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ conversion_id: CONVERSION_UUID });
      const { convertDealToLead } = await getDealsTools();

      const result = await convertDealToLead({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.conversion_id).toBe(CONVERSION_UUID);
      expect(parsed.summary).toContain('conversion_id');
    });

    it('should return isError on API failure', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiError(404, 'Deal not found');
      const { convertDealToLead } = await getDealsTools();

      const result = await convertDealToLead({ id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe('getDealConversionStatus', () => {
    it('should GET /deals/{id}/convert/status/{conversion_id}', async () => {
      const mockFn = mockApiSuccess({ status: 'running', conversion_id: CONVERSION_UUID });
      const { getDealConversionStatus } = await getDealsTools();

      await getDealConversionStatus({ id: 1, conversion_id: CONVERSION_UUID });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain(`/deals/1/convert/status/${CONVERSION_UUID}`);
      expect(options.method).toBe('GET');
    });

    it('should derive a completed summary carrying lead_id', async () => {
      mockApiSuccess({ status: 'completed', lead_id: LEAD_UUID, conversion_id: CONVERSION_UUID });
      const { getDealConversionStatus } = await getDealsTools();

      const result = await getDealConversionStatus({ id: 1, conversion_id: CONVERSION_UUID });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe(`Conversion completed; lead_id: ${LEAD_UUID}`);
      expect(parsed.data.lead_id).toBe(LEAD_UUID);
    });

    it('should derive a re-poll summary for an in-progress status', async () => {
      mockApiSuccess({ status: 'running', conversion_id: CONVERSION_UUID });
      const { getDealConversionStatus } = await getDealsTools();

      const result = await getDealConversionStatus({ id: 1, conversion_id: CONVERSION_UUID });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Conversion running; re-poll');
    });

    it('should derive a stop-polling summary for a failed status', async () => {
      mockApiSuccess({ status: 'failed', conversion_id: CONVERSION_UUID });
      const { getDealConversionStatus } = await getDealsTools();

      const result = await getDealConversionStatus({ id: 1, conversion_id: CONVERSION_UUID });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('stop polling');
    });

    it('should return isError on API failure', async () => {
      mockApiError(404, 'Conversion status purged');
      const { getDealConversionStatus } = await getDealsTools();

      const result = await getDealConversionStatus({ id: 1, conversion_id: CONVERSION_UUID });

      expect(result.isError).toBe(true);
    });
  });
});
