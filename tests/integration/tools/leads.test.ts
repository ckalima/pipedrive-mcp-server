/**
 * Integration tests for tools/leads.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  fixtures,
  paginationFixtures,
} from '../../helpers/mockFetch.js';
import { createLeadsFixture } from '../../helpers/fixtures.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// Dynamic import to avoid module caching issues with mocks
async function getLeadsTools() {
  return import('../../../src/tools/leads.js');
}

describe('leads tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listLeads', () => {
    it('should return list of leads with summary', async () => {
      const leads = createLeadsFixture(5);
      mockFetch({ data: leads, additional_data: paginationFixtures.v1NoMore });
      const { listLeads } = await getLeadsTools();

      const result = await listLeads({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('5 leads');
      expect(parsed.data).toHaveLength(5);
    });

    it('should pass archived_flag=false in URL', async () => {
      const mockFn = mockApiSuccess([]);
      const { listLeads } = await getLeadsTools();

      await listLeads({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('archived_flag=false');
    });

    it('should pass owner_id filter', async () => {
      const mockFn = mockApiSuccess([]);
      const { listLeads } = await getLeadsTools();

      await listLeads({ owner_id: 42 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('owner_id=42');
    });

    it('should pass person_id filter', async () => {
      const mockFn = mockApiSuccess([]);
      const { listLeads } = await getLeadsTools();

      await listLeads({ person_id: 10 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('person_id=10');
    });

    it('should pass organization_id filter', async () => {
      const mockFn = mockApiSuccess([]);
      const { listLeads } = await getLeadsTools();

      await listLeads({ organization_id: 20 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('organization_id=20');
    });

    it('should call v1 API endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listLeads } = await getLeadsTools();

      await listLeads({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/leads');
    });

    it('should handle v1 pagination with has_more=true', async () => {
      mockFetch({ data: createLeadsFixture(50), additional_data: paginationFixtures.v1WithMore });
      const { listLeads } = await getLeadsTools();

      const result = await listLeads({ start: 0 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });

    it('should return isError on API error', async () => {
      mockApiError(401, 'Unauthorized');
      const { listLeads } = await getLeadsTools();

      const result = await listLeads({});

      expect(result.isError).toBe(true);
    });
  });

  describe('listArchivedLeads', () => {
    it('should pass archived_flag=true in URL', async () => {
      const mockFn = mockApiSuccess([]);
      const { listArchivedLeads } = await getLeadsTools();

      await listArchivedLeads({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('archived_flag=true');
    });

    it('should return list of archived leads with summary', async () => {
      const leads = createLeadsFixture(3).map(l => ({ ...l, is_archived: true }));
      mockFetch({ data: leads, additional_data: paginationFixtures.v1NoMore });
      const { listArchivedLeads } = await getLeadsTools();

      const result = await listArchivedLeads({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 leads');
      expect(parsed.data).toHaveLength(3);
    });

    it('should call v1 API endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listArchivedLeads } = await getLeadsTools();

      await listArchivedLeads({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/leads');
    });
  });

  describe('getLead', () => {
    it('should return single lead with UUID summary', async () => {
      mockApiSuccess(fixtures.lead);
      const { getLead } = await getLeadsTools();

      const result = await getLead({ id: VALID_UUID });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe(`Lead ${VALID_UUID}`);
      expect(parsed.data.title).toBe('Test Lead');
    });

    it('should call v1 API with lead UUID in URL', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { getLead } = await getLeadsTools();

      await getLead({ id: VALID_UUID });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain(`/v1/leads/${VALID_UUID}`);
    });

    it('should return NOT_FOUND error on 404', async () => {
      mockApiError(404, 'Lead not found');
      const { getLead } = await getLeadsTools();

      const result = await getLead({ id: VALID_UUID });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('createLead', () => {
    it('should return Lead created summary on success', async () => {
      mockApiSuccess({ ...fixtures.lead, id: VALID_UUID });
      const { createLead } = await getLeadsTools();

      const result = await createLead({ title: 'New Lead', person_id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Lead created');
    });

    it('should POST to v1 leads endpoint', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { createLead } = await getLeadsTools();

      await createLead({ title: 'New Lead', person_id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/leads');
      expect(options.method).toBe('POST');
    });

    it('should send title in request body', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { createLead } = await getLeadsTools();

      await createLead({ title: 'Test Lead Title', person_id: 1 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('Test Lead Title');
      expect(body.person_id).toBe(1);
    });

    it('should include value object in body when provided', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { createLead } = await getLeadsTools();

      await createLead({
        title: 'Lead with Value',
        person_id: 1,
        value: { amount: 5000, currency: 'USD' },
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.value).toEqual({ amount: 5000, currency: 'USD' });
    });

    it('should not include undefined fields in body', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { createLead } = await getLeadsTools();

      await createLead({ title: 'Minimal Lead', person_id: 1 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).not.toHaveProperty('value');
      expect(body).not.toHaveProperty('owner_id');
      expect(body).not.toHaveProperty('organization_id');
    });

    it('should return isError on API error', async () => {
      mockApiError(400, 'Invalid request');
      const { createLead } = await getLeadsTools();

      const result = await createLead({ title: 'Lead', person_id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe('updateLead', () => {
    it('should return updated summary', async () => {
      mockApiSuccess({ ...fixtures.lead, title: 'Updated Lead' });
      const { updateLead } = await getLeadsTools();

      const result = await updateLead({ id: VALID_UUID, title: 'Updated Lead' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('updated');
      expect(parsed.summary).toContain(VALID_UUID);
    });

    it('should send PATCH request', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { updateLead } = await getLeadsTools();

      await updateLead({ id: VALID_UUID, title: 'Updated' });

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });

    it('should call v1 API with lead UUID in URL', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { updateLead } = await getLeadsTools();

      await updateLead({ id: VALID_UUID, owner_id: 5 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain(`/v1/leads/${VALID_UUID}`);
    });

    it('should send only provided fields in body', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { updateLead } = await getLeadsTools();

      await updateLead({ id: VALID_UUID, title: 'Updated Title' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('Updated Title');
      expect(body).not.toHaveProperty('person_id');
      expect(body).not.toHaveProperty('organization_id');
    });

    it('should include is_archived in body when provided', async () => {
      const mockFn = mockApiSuccess(fixtures.lead);
      const { updateLead } = await getLeadsTools();

      await updateLead({ id: VALID_UUID, is_archived: true });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.is_archived).toBe(true);
    });
  });

  describe('deleteLead', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is not set', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteLead } = await getLeadsTools();

      const result = await deleteLead({ id: VALID_UUID });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should delete lead when env var is set', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: VALID_UUID });
      const { deleteLead } = await getLeadsTools();

      const result = await deleteLead({ id: VALID_UUID });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('deleted');
    });

    it('should send DELETE request to v1 leads UUID endpoint', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: VALID_UUID });
      const { deleteLead } = await getLeadsTools();

      await deleteLead({ id: VALID_UUID });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain(`/v1/leads/${VALID_UUID}`);
      expect(options.method).toBe('DELETE');
    });
  });

  describe('searchLeads', () => {
    it('should return summary with search term', async () => {
      mockApiSuccess({ items: [{ result_score: 1.0, item: fixtures.lead }] });
      const { searchLeads } = await getLeadsTools();

      const result = await searchLeads({ term: 'acme' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('acme');
    });

    it('should call v2 leads search endpoint', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchLeads } = await getLeadsTools();

      await searchLeads({ term: 'test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/leads/search');
      expect(url).toContain('/api/v2/');
    });

    it('should pass term in query parameters', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchLeads } = await getLeadsTools();

      await searchLeads({ term: 'test lead' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=test+lead');
    });

    it('should pass exact_match=true when specified', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchLeads } = await getLeadsTools();

      await searchLeads({ term: 'exact', exact_match: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('exact_match=true');
    });

    it('should pass include_fields when provided', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchLeads } = await getLeadsTools();

      await searchLeads({ term: 'test', include_fields: 'person,organization' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('include_fields=person%2Corganization');
    });

    it('should return isError on API error', async () => {
      mockApiError(400, 'Bad request');
      const { searchLeads } = await getLeadsTools();

      const result = await searchLeads({ term: 'test' });

      expect(result.isError).toBe(true);
    });
  });

  describe('tool registration smoke check', () => {
    it('should have all 7 leads tools registered in allTools', async () => {
      const { allTools } = await import('../../../src/tools/index.js');
      const leadToolNames = [
        'pipedrive_list_leads',
        'pipedrive_list_archived_leads',
        'pipedrive_get_lead',
        'pipedrive_create_lead',
        'pipedrive_update_lead',
        'pipedrive_search_leads',
        'pipedrive_delete_lead',
      ];
      for (const name of leadToolNames) {
        expect(allTools.some(t => t.name === name)).toBe(true);
      }
    });
  });
});
