/**
 * Integration tests for tools/deals.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  searchDeals,
  deleteDeal,
} from '../../../src/tools/deals.js';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  fixtures,
  paginationFixtures,
} from '../../helpers/mockFetch.js';
import { createDealsFixture } from '../../helpers/fixtures.js';

describe('deals tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listDeals', () => {
    it('should return list of deals with summary', async () => {
      const deals = createDealsFixture(3);
      mockFetch({ data: deals, additional_data: paginationFixtures.v2NoMore });

      const result = await listDeals({ limit: 50 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 deals');
      expect(parsed.data).toHaveLength(3);
      expect(parsed.pagination.has_more).toBe(false);
    });

    it('should include pagination info when more items available', async () => {
      mockFetch({ data: createDealsFixture(50), additional_data: paginationFixtures.v2WithMore });

      const result = await listDeals({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should pass filter parameters to API', async () => {
      const mockFn = mockApiSuccess([]);

      await listDeals({
        owner_id: 1,
        status: 'open',
        pipeline_id: 2,
        sort_by: 'update_time',
        sort_direction: 'asc',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('owner_id=1');
      expect(url).toContain('status=open');
      expect(url).toContain('pipeline_id=2');
      expect(url).toContain('sort_by=update_time');
      expect(url).toContain('sort_direction=asc');
    });

    it('should handle API error', async () => {
      mockApiError(401, 'Invalid API key');

      const result = await listDeals({});

      const text = result.content[0].text;
      expect(text).toContain('INVALID_API_KEY');
      expect(result.isError).toBe(true);
    });

    it('should use cursor for pagination', async () => {
      const mockFn = mockApiSuccess([]);

      await listDeals({ cursor: 'next_page_cursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=next_page_cursor');
    });
  });

  describe('getDeal', () => {
    it('should return single deal', async () => {
      mockApiSuccess(fixtures.deal);

      const result = await getDeal({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Deal 1');
      expect(parsed.data.id).toBe(1);
      expect(parsed.data.title).toBe('Test Deal');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Deal not found');

      const result = await getDeal({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });

    it('should pass include_fields parameter', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);

      await getDeal({ id: 1, include_fields: 'products,notes' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('include_fields=products%2Cnotes');
    });
  });

  describe('createDeal', () => {
    it('should create deal and return data', async () => {
      mockApiSuccess({ ...fixtures.deal, id: 100, title: 'New Deal' });

      const result = await createDeal({ title: 'New Deal', value: 5000 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Deal created');
      expect(parsed.data.title).toBe('New Deal');
    });

    it('should pass all fields to API', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);

      await createDeal({
        title: 'Enterprise Deal',
        value: 100000,
        currency: 'USD',
        person_id: 1,
        org_id: 2,
        pipeline_id: 1,
        stage_id: 3,
        status: 'open',
        expected_close_date: '2024-12-31',
        probability: 75,
        visible_to: 7,
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('Enterprise Deal');
      expect(body.value).toBe(100000);
      expect(body.currency).toBe('USD');
      expect(body.probability).toBe(75);
    });

    it('should handle validation error', async () => {
      mockApiError(400, 'Title is required');

      const result = await createDeal({ title: '' });

      expect(result.content[0].text).toContain('VALIDATION_ERROR');
    });
  });

  describe('updateDeal', () => {
    it('should update deal and return data', async () => {
      mockApiSuccess({ ...fixtures.deal, title: 'Updated Title' });

      const result = await updateDeal({ id: 1, title: 'Updated Title' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Deal 1 updated');
    });

    it('should send PATCH request', async () => {
      const mockFn = mockApiSuccess(fixtures.deal);

      await updateDeal({ id: 1, value: 50000 });

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });

    it('should handle status update with won_time', async () => {
      const mockFn = mockApiSuccess({ ...fixtures.deal, status: 'won' });

      await updateDeal({
        id: 1,
        status: 'won',
        won_time: '2024-01-15T10:00:00Z',
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.status).toBe('won');
      expect(body.won_time).toBe('2024-01-15T10:00:00Z');
    });
  });

  describe('searchDeals', () => {
    it('should search deals and return results', async () => {
      mockApiSuccess({
        items: [
          { result_score: 1.0, item: fixtures.deal },
        ],
      });

      const result = await searchDeals({ term: 'test' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('test');
    });

    it('should call the v2 /deals/search endpoint (not v1 itemSearch)', async () => {
      const mockFn = mockApiSuccess({ items: [] });

      await searchDeals({ term: 'enterprise' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/deals/search');
      expect(url).not.toContain('/itemSearch');
      expect(url).not.toContain('/v1/');
    });

    it('should pass v2 search parameters', async () => {
      const mockFn = mockApiSuccess({ items: [] });

      await searchDeals({
        term: 'test',
        fields: 'title,notes',
        person_id: 1,
        org_id: 2,
        status: 'open',
        exact_match: true,
        limit: 25,
        cursor: 'cur1',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=test');
      expect(url).toContain('fields=title%2Cnotes');
      expect(url).toContain('person_id=1');
      expect(url).toContain('organization_id=2');
      expect(url).toContain('status=open');
      expect(url).toContain('exact_match=true');
      expect(url).toContain('limit=25');
      expect(url).toContain('cursor=cur1');
      expect(url).not.toContain('item_types');
    });

    it('should parse next_cursor from v2 search response', async () => {
      mockFetch({ data: { items: [] }, additional_data: { next_cursor: 'NEXT' } });

      const result = await searchDeals({ term: 'x' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.next_cursor).toBe('NEXT');
      expect(parsed.pagination.has_more).toBe(true);
    });
  });

  describe('deleteDeal', () => {
    it('should block when destructive operations are disabled', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;

      const result = await deleteDeal({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should delete deal and return confirmation', async () => {
      mockApiSuccess({ id: 1 });

      const result = await deleteDeal({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('Deal 1 deleted');
      expect(parsed.summary).toContain('30 days');
    });

    it('should send DELETE request', async () => {
      const mockFn = mockApiSuccess({ id: 1 });

      await deleteDeal({ id: 123 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/deals/123');
      expect(options.method).toBe('DELETE');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Deal not found');

      const result = await deleteDeal({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });
});
