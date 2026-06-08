/**
 * Integration tests for tools/pipelines.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockApiSuccess,
  mockApiError,
  mockFetch,
  fixtures,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

async function getPipelinesTools() {
  return import('../../../src/tools/pipelines.js');
}

describe('pipelines tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listPipelines', () => {
    it('should return list of pipelines', async () => {
      const pipelines = [
        { ...fixtures.pipeline, id: 1, name: 'Sales Pipeline' },
        { ...fixtures.pipeline, id: 2, name: 'Support Pipeline' },
      ];
      mockApiSuccess(pipelines);
      const { listPipelines } = await getPipelinesTools();

      const result = await listPipelines({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('2 pipeline');
      expect(parsed.data).toHaveLength(2);
    });

    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPipelines } = await getPipelinesTools();

      await listPipelines({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/pipelines');
      expect(url).not.toContain('/v1/');
    });

    it('should use cursor for pagination', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPipelines } = await getPipelinesTools();

      await listPipelines({ cursor: 'next_page_cursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=next_page_cursor');
    });

    it('should pass limit to API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPipelines } = await getPipelinesTools();

      await listPipelines({ limit: 25 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=25');
    });

    it('should include pagination info when more items available', async () => {
      const { listPipelines } = await getPipelinesTools();
      mockFetch({ data: [fixtures.pipeline], additional_data: paginationFixtures.v2WithMore });

      const result = await listPipelines({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should handle API error', async () => {
      mockApiError(401, 'Invalid API key');
      const { listPipelines } = await getPipelinesTools();

      const result = await listPipelines({});

      expect(result.content[0].text).toContain('INVALID_API_KEY');
      expect(result.isError).toBe(true);
    });
  });

  describe('listStages', () => {
    it('should return all stages', async () => {
      const stages = [
        { ...fixtures.stage, id: 1, name: 'Lead' },
        { ...fixtures.stage, id: 2, name: 'Qualified' },
        { ...fixtures.stage, id: 3, name: 'Proposal' },
      ];
      mockApiSuccess(stages);
      const { listStages } = await getPipelinesTools();

      const result = await listStages({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 stage');
      expect(parsed.data).toHaveLength(3);
    });

    it('should filter by pipeline_id', async () => {
      const mockFn = mockApiSuccess([fixtures.stage]);
      const { listStages } = await getPipelinesTools();

      await listStages({ pipeline_id: 2 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('pipeline_id=2');
    });

    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listStages } = await getPipelinesTools();

      await listStages({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/stages');
      expect(url).not.toContain('/v1/');
    });

    it('should use cursor for pagination', async () => {
      const mockFn = mockApiSuccess([]);
      const { listStages } = await getPipelinesTools();

      await listStages({ cursor: 'next_page_cursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=next_page_cursor');
    });

    it('should pass limit to API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listStages } = await getPipelinesTools();

      await listStages({ limit: 25 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('limit=25');
    });

    it('should include pagination info when more items available', async () => {
      const { listStages } = await getPipelinesTools();
      mockFetch({ data: [fixtures.stage], additional_data: paginationFixtures.v2WithMore });

      const result = await listStages({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });
  });

  describe('getStage', () => {
    it('should return single stage', async () => {
      mockApiSuccess(fixtures.stage);
      const { getStage } = await getPipelinesTools();

      const result = await getStage({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Stage 1');
      expect(parsed.data.name).toBe('Lead');
    });

    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess(fixtures.stage);
      const { getStage } = await getPipelinesTools();

      await getStage({ id: 5 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/stages/5');
      expect(url).not.toContain('/v1/');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Stage not found');
      const { getStage } = await getPipelinesTools();

      const result = await getStage({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });
});
