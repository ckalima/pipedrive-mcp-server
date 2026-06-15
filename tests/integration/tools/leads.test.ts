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

      await searchLeads({ term: 'test', include_fields: 'lead.was_seen' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('include_fields=lead.was_seen');
    });

    it('should pass fields, person_id, organization_id on the wire', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchLeads } = await getLeadsTools();

      await searchLeads({ term: 't', fields: 'title,notes', person_id: 1, organization_id: 2 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('fields=title%2Cnotes');
      expect(url).toContain('person_id=1');
      expect(url).toContain('organization_id=2');
    });

    it('should parse next_cursor from v2 leads search response', async () => {
      mockFetch({ data: { items: [] }, additional_data: { next_cursor: 'NEXT' } });
      const { searchLeads } = await getLeadsTools();

      const result = await searchLeads({ term: 'x' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.next_cursor).toBe('NEXT');
      expect(parsed.pagination.has_more).toBe(true);
    });

    it('should return isError on API error', async () => {
      mockApiError(400, 'Bad request');
      const { searchLeads } = await getLeadsTools();

      const result = await searchLeads({ term: 'test' });

      expect(result.isError).toBe(true);
    });
  });

  describe('convertLeadToDeal', () => {
    const noSleep = async () => {};

    it('should return the created deal id on completed (first status poll)', async () => {
      // POST -> conversion_id, then first status GET -> completed with deal id
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-123' } },
        { status: 200, data: { status: 'completed', deal_id: 999 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.deal_id).toBe(999);
      expect(parsed.data.conversion_id).toBe('conv-123');
      expect(parsed.data.status).toBe('completed');
      expect(parsed.summary).toContain('999');
    });

    it('should POST to the v2 convert endpoint with an empty body', async () => {
      const mockFn = mockFetch([
        { status: 200, data: { conversion_id: 'conv-1' } },
        { status: 200, data: { status: 'completed', deal_id: 1 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      const [postUrl, postOptions] = mockFn.mock.calls[0];
      expect(String(postUrl)).toContain(`/leads/${VALID_UUID}/convert/deal`);
      expect(String(postUrl)).toContain('/api/v2/');
      expect(postOptions.method).toBe('POST');
      expect(JSON.parse(postOptions.body)).toEqual({});
    });

    it('should forward stage_id/pipeline_id in the convert body', async () => {
      const mockFn = mockFetch([
        { status: 200, data: { conversion_id: 'c1' } },
        { status: 200, data: { status: 'completed', deal_id: 7 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      await convertLeadToDeal({ id: VALID_UUID, stage_id: 3, pipeline_id: 4 }, noSleep);

      const [, postOptions] = mockFn.mock.calls[0];
      expect(JSON.parse(postOptions.body)).toEqual({ stage_id: 3, pipeline_id: 4 });
    });

    it('should poll the v2 status endpoint with the conversion id', async () => {
      const mockFn = mockFetch([
        { status: 200, data: { conversion_id: 'conv-xyz' } },
        { status: 200, data: { status: 'completed', deal_id: 7 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      const [statusUrl, statusOptions] = mockFn.mock.calls[1];
      expect(String(statusUrl)).toContain(
        `/leads/${VALID_UUID}/convert/status/conv-xyz`,
      );
      expect(statusOptions.method).toBe('GET');
    });

    it('should keep polling through pending/running until completed', async () => {
      // POST, then not_started -> running -> completed
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-2' } },
        { status: 200, data: { status: 'not_started' } },
        { status: 200, data: { status: 'running' } },
        { status: 200, data: { status: 'completed', deal_id: 55 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.deal_id).toBe(55);
    });

    it('should return an error result when status is failed', async () => {
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-3' } },
        { status: 200, data: { status: 'failed' } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('failed');
    });

    it('should return conversion_id + status (non-error) on timeout', async () => {
      // POST returns conversion_id; every status poll stays "running".
      // The mock clamps to the last array entry, so all polls see "running".
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-timeout' } },
        { status: 200, data: { status: 'running' } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      // No real wait occurred (noSleep), and no error is returned.
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.conversion_id).toBe('conv-timeout');
      expect(parsed.data.status).toBe('running');
      expect(parsed.summary).toContain('still in progress');
    });

    it('should return an error result if the POST fails', async () => {
      mockApiError(400, 'Cannot convert');
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
    });

    it('should return an error result if a status poll fails', async () => {
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-4' } },
        { status: 500, ok: false, error: 'boom' },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
    });

    it('should error when POST returns no conversion_id', async () => {
      mockFetch([{ status: 200, data: {} }]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('conversion_id');
    });

    it('rejects a malformed API-sourced conversion_id before building the status path (U3, F2)', async () => {
      // The backend returns a conversion_id carrying a path-traversal payload.
      // The handler must reject it with a structured error and must NOT issue a
      // second (status-poll) request with the mangled path.
      const mockFn = mockFetch([
        { status: 200, data: { conversion_id: '../../pipelines/7' } },
        { status: 200, data: { status: 'completed', deal_id: 1 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('malformed conversion_id');
      // Only the initial POST was made; no status GET was attempted.
      expect(mockFn.mock.calls).toHaveLength(1);
    });

    it('rejects an API-sourced conversion_id with a query/fragment character (U3, F2)', async () => {
      const mockFn = mockFetch([
        { status: 200, data: { conversion_id: 'abc?x=1' } },
        { status: 200, data: { status: 'completed', deal_id: 1 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
      expect(mockFn.mock.calls).toHaveLength(1);
    });
  });

  describe('getLeadConversionStatus', () => {
    const CONVERSION_UUID = '660e8400-e29b-41d4-a716-446655440001';

    it('should GET the v2 status endpoint with lead id and conversion id', async () => {
      const mockFn = mockApiSuccess({ status: 'completed', deal_id: 42 });
      const { getLeadConversionStatus } = await getLeadsTools();

      await getLeadConversionStatus({ id: VALID_UUID, conversion_id: CONVERSION_UUID });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain(`/leads/${VALID_UUID}/convert/status/${CONVERSION_UUID}`);
      expect(url).toContain('/api/v2/');
    });

    it('should return the status from data in the summary', async () => {
      mockApiSuccess({ status: 'completed', deal_id: 42 });
      const { getLeadConversionStatus } = await getLeadsTools();

      const result = await getLeadConversionStatus({ id: VALID_UUID, conversion_id: CONVERSION_UUID });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('completed');
      expect(parsed.summary).toContain(CONVERSION_UUID);
      expect(parsed.data.status).toBe('completed');
    });

    it('should return isError on API error', async () => {
      mockApiError(404, 'Conversion not found');
      const { getLeadConversionStatus } = await getLeadsTools();

      const result = await getLeadConversionStatus({ id: VALID_UUID, conversion_id: CONVERSION_UUID });

      expect(result.isError).toBe(true);
    });
  });

  // leads is the mixed-version capability: CRUD routes through the seam (v1) while
  // search/convert/conversion-status stay on the client at v2 (R2, R3).
  describe('v1 sunset detection (U3, R2/R3)', () => {
    it('AE2/R6: a 410 on the /leads list returns the retirement message and marks leads CRUD retired', async () => {
      mockApiError(410, 'Gone');
      const { listLeads } = await getLeadsTools();

      const result = await listLeads({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('CAPABILITY_RETIRED');
      expect(result.content[0].text).toContain('Leads');
    });

    it('AE1: an ordinary item 404 on get does NOT retire leads CRUD', async () => {
      mockApiError(404, 'Lead not found');
      const { getLead, listLeads } = await getLeadsTools();

      const notFound = await getLead({ id: VALID_UUID });
      expect(notFound.content[0].text).toContain('NOT_FOUND');

      const listMock = mockApiSuccess([]);
      const listResult = await listLeads({});
      expect(listResult.isError).toBeFalsy();
      expect(listMock).toHaveBeenCalledTimes(1);
    });

    it('R2/R3: retiring leads CRUD does NOT short-circuit leads search (search stays on v2)', async () => {
      // Retire CRUD via a 410 on the v1 list.
      mockApiError(410, 'Gone');
      const { listLeads, searchLeads } = await getLeadsTools();

      const listResult = await listLeads({});
      expect(listResult.content[0].text).toContain('CAPABILITY_RETIRED');

      // Search never routes through the leads seam — it still targets v2 and works.
      const searchMock = mockApiSuccess({ items: [] });
      const searchResult = await searchLeads({ term: 'acme' });
      expect(searchResult.isError).toBeFalsy();
      const [url] = searchMock.mock.calls[0];
      expect(String(url)).toContain('/api/v2/');
      expect(String(url)).toContain('/leads/search');
    });
  });

  describe('tool registration smoke check', () => {
    it('should have all 9 leads tools registered in allTools', async () => {
      const { allTools } = await import('../../../src/tools/index.js');
      const leadToolNames = [
        'pipedrive_list_leads',
        'pipedrive_list_archived_leads',
        'pipedrive_get_lead',
        'pipedrive_create_lead',
        'pipedrive_update_lead',
        'pipedrive_search_leads',
        'pipedrive_delete_lead',
        'pipedrive_convert_lead_to_deal',
        'pipedrive_get_lead_conversion_status',
      ];
      for (const name of leadToolNames) {
        expect(allTools.some(t => t.name === name)).toBe(true);
      }
    });
  });
});
