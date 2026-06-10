/**
 * Integration tests for the archived deals list tool (U4, #67)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
  fixtures,
} from '../../helpers/mockFetch.js';

// Dynamic import to avoid module caching issues with mocks
async function getDealsTools() {
  return import('../../../src/tools/deals.js');
}

describe('archived deals tool (U4, #67)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listArchivedDeals', () => {
    it('should hit /deals/archived (not /deals)', async () => {
      const mockFn = mockApiSuccess([fixtures.deal]);
      const { listArchivedDeals } = await getDealsTools();

      await listArchivedDeals({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals/archived');
    });

    it('should forward all filter params when provided', async () => {
      const mockFn = mockApiSuccess([fixtures.deal]);
      const { listArchivedDeals } = await getDealsTools();

      await listArchivedDeals({
        filter_id: 4,
        owner_id: 5,
        person_id: 6,
        org_id: 7,
        pipeline_id: 8,
        stage_id: 9,
        status: 'won',
        sort_by: 'add_time',
        sort_direction: 'asc',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('filter_id=4');
      expect(url).toContain('owner_id=5');
      expect(url).toContain('status=won');
      expect(url).toContain('sort_by=add_time');
    });

    it('should forward cursor and limit', async () => {
      const mockFn = mockApiSuccess([fixtures.deal]);
      const { listArchivedDeals } = await getDealsTools();

      await listArchivedDeals({ cursor: 'curs', limit: 25 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=curs');
      expect(url).toContain('limit=25');
    });

    it('should not include absent optional params in the query string', async () => {
      const mockFn = mockApiSuccess([fixtures.deal]);
      const { listArchivedDeals } = await getDealsTools();

      await listArchivedDeals({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('filter_id=');
      expect(url).not.toContain('status=');
    });

    it('should return summary mentioning archived deals + pagination', async () => {
      mockFetch({ data: [fixtures.deal], additional_data: paginationFixtures.v2WithMore });
      const { listArchivedDeals } = await getDealsTools();

      const result = await listArchivedDeals({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('archived deal');
      expect(parsed.pagination.has_more).toBe(true);
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listArchivedDeals } = await getDealsTools();

      const result = await listArchivedDeals({});

      expect(result.isError).toBe(true);
    });
  });
});
