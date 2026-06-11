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

  // ─── U1: Pipeline write handlers ───────────────────────────────────────────
  describe('createPipeline', () => {
    it('should POST to v2 /pipelines with name', async () => {
      const mockFn = mockApiSuccess({ id: 10, name: 'New Pipeline' });
      const { createPipeline } = await getPipelinesTools();

      await createPipeline({ name: 'New Pipeline' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/pipelines');
      expect(url).not.toContain('/v1/');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body).name).toBe('New Pipeline');
    });

    it('should forward is_deal_probability_enabled with the caller value (v2 rename)', async () => {
      const mockFn = mockApiSuccess({ id: 10 });
      const { createPipeline } = await getPipelinesTools();

      await createPipeline({ name: 'P', is_deal_probability_enabled: true });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.is_deal_probability_enabled).toBe(true);
      expect(body.deal_probability).toBeUndefined();
    });

    it('should omit is_deal_probability_enabled when not provided', async () => {
      const mockFn = mockApiSuccess({ id: 10 });
      const { createPipeline } = await getPipelinesTools();

      await createPipeline({ name: 'P' });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.is_deal_probability_enabled).toBeUndefined();
    });

    it('should return isError on API failure', async () => {
      mockApiError(400, 'Invalid');
      const { createPipeline } = await getPipelinesTools();

      const result = await createPipeline({ name: 'P' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('VALIDATION_ERROR');
    });
  });

  describe('updatePipeline', () => {
    it('should PATCH to v2 /pipelines/{id} without id in body', async () => {
      const mockFn = mockApiSuccess({ id: 7, name: 'Renamed' });
      const { updatePipeline } = await getPipelinesTools();

      await updatePipeline({ id: 7, name: 'Renamed' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/pipelines/7');
      expect(options.method).toBe('PATCH');
      const body = JSON.parse(options.body);
      expect(body.id).toBeUndefined();
      expect(body.name).toBe('Renamed');
    });

    it('should handle not found (404)', async () => {
      mockApiError(404, 'Pipeline not found');
      const { updatePipeline } = await getPipelinesTools();

      const result = await updatePipeline({ id: 99999, name: 'X' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('deletePipeline', () => {
    it('should block and make NO fetch call when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deletePipeline } = await getPipelinesTools();

      const result = await deletePipeline({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should DELETE v2 /pipelines/{id} when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 42 });
      const { deletePipeline } = await getPipelinesTools();

      await deletePipeline({ id: 42 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/pipelines/42');
      expect(options.method).toBe('DELETE');
    });
  });

  // ─── U2: Stage write handlers ──────────────────────────────────────────────
  describe('createStage', () => {
    it('should POST to v2 /stages with name and pipeline_id', async () => {
      const mockFn = mockApiSuccess({ id: 5, name: 'Lead' });
      const { createStage } = await getPipelinesTools();

      await createStage({ name: 'Lead', pipeline_id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/stages');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Lead');
      expect(body.pipeline_id).toBe(1);
    });

    it('should forward is_deal_rot_enabled and days_to_rotten with caller values (v2 renames)', async () => {
      const mockFn = mockApiSuccess({ id: 5 });
      const { createStage } = await getPipelinesTools();

      await createStage({
        name: 'Lead',
        pipeline_id: 1,
        deal_probability: 80,
        is_deal_rot_enabled: true,
        days_to_rotten: 7,
      });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.is_deal_rot_enabled).toBe(true);
      expect(body.days_to_rotten).toBe(7);
      expect(body.deal_probability).toBe(80);
      // v1 names never appear
      expect(body.rotten_flag).toBeUndefined();
      expect(body.rotten_days).toBeUndefined();
    });

    it('should omit optional fields when not provided', async () => {
      const mockFn = mockApiSuccess({ id: 5 });
      const { createStage } = await getPipelinesTools();

      await createStage({ name: 'Lead', pipeline_id: 1 });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.deal_probability).toBeUndefined();
      expect(body.is_deal_rot_enabled).toBeUndefined();
      expect(body.days_to_rotten).toBeUndefined();
    });
  });

  describe('updateStage', () => {
    it('should PATCH to v2 /stages/{id} without id in body', async () => {
      const mockFn = mockApiSuccess({ id: 5, name: 'Renamed' });
      const { updateStage } = await getPipelinesTools();

      await updateStage({ id: 5, name: 'Renamed', days_to_rotten: null });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/stages/5');
      expect(options.method).toBe('PATCH');
      const body = JSON.parse(options.body);
      expect(body.id).toBeUndefined();
      expect(body.name).toBe('Renamed');
      expect(body.days_to_rotten).toBeNull();
    });

    it('should handle not found (404)', async () => {
      mockApiError(404, 'Stage not found');
      const { updateStage } = await getPipelinesTools();

      const result = await updateStage({ id: 99999, name: 'X' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('deleteStage', () => {
    it('should block and make NO fetch call when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteStage } = await getPipelinesTools();

      const result = await deleteStage({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should DELETE v2 /stages/{id} when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 9 });
      const { deleteStage } = await getPipelinesTools();

      await deleteStage({ id: 9 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/stages/9');
      expect(options.method).toBe('DELETE');
    });
  });
});
