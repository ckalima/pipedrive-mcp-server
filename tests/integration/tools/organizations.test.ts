/**
 * Integration tests for tools/organizations.ts
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
import { createOrganizationsFixture } from '../../helpers/fixtures.js';

async function getOrganizationsTools() {
  return import('../../../src/tools/organizations.js');
}

describe('organizations tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listOrganizations', () => {
    it('should return list of organizations', async () => {
      const orgs = createOrganizationsFixture(4);
      mockFetch({ data: orgs, additional_data: paginationFixtures.v2NoMore });
      const { listOrganizations } = await getOrganizationsTools();

      const result = await listOrganizations({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('4 organization');
      expect(parsed.data).toHaveLength(4);
    });

    it('should pass filter parameters', async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizations } = await getOrganizationsTools();

      await listOrganizations({
        owner_id: 1,
        sort_by: 'update_time',
        sort_direction: 'asc',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('owner_id=1');
      expect(url).not.toContain('first_char');
    });

    it('should handle pagination', async () => {
      mockFetch({ data: [], additional_data: paginationFixtures.v2WithMore });
      const { listOrganizations } = await getOrganizationsTools();

      const result = await listOrganizations({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });
  });

  describe('getOrganization', () => {
    it('should return single organization', async () => {
      mockApiSuccess(fixtures.organization);
      const { getOrganization } = await getOrganizationsTools();

      const result = await getOrganization({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Organization 1');
      expect(parsed.data.name).toBe('Test Organization');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Organization not found');
      const { getOrganization } = await getOrganizationsTools();

      const result = await getOrganization({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('createOrganization', () => {
    it('should create organization', async () => {
      mockApiSuccess({ ...fixtures.organization, id: 100, name: 'New Org' });
      const { createOrganization } = await getOrganizationsTools();

      const result = await createOrganization({ name: 'New Org' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Organization created');
    });

    it('should pass all fields to API', async () => {
      const mockFn = mockApiSuccess(fixtures.organization);
      const { createOrganization } = await getOrganizationsTools();

      await createOrganization({
        name: 'Enterprise Corp',
        owner_id: 1,
        visible_to: 7,
        address: { value: '123 Business Ave' },
        label_ids: [1, 2],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Enterprise Corp');
      expect(body.address).toEqual({ value: '123 Business Ave' });
      expect(body.visible_to).toBe(7);
    });
  });

  describe('updateOrganization', () => {
    it('should update organization', async () => {
      mockApiSuccess({ ...fixtures.organization, name: 'Updated Org' });
      const { updateOrganization } = await getOrganizationsTools();

      const result = await updateOrganization({ id: 1, name: 'Updated Org' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Organization 1 updated');
    });

    it('should send PATCH request', async () => {
      const mockFn = mockApiSuccess(fixtures.organization);
      const { updateOrganization } = await getOrganizationsTools();

      await updateOrganization({ id: 1, address: { value: 'New Address' } });

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });
  });

  describe('searchOrganizations', () => {
    it('should search organizations', async () => {
      mockApiSuccess({
        items: [{ result_score: 1.0, item: fixtures.organization }],
      });
      const { searchOrganizations } = await getOrganizationsTools();

      const result = await searchOrganizations({ term: 'test' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('test');
    });

    it('should call the v2 /organizations/search endpoint (not v1 itemSearch)', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchOrganizations } = await getOrganizationsTools();

      await searchOrganizations({ term: 'acme' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/organizations/search');
      expect(url).not.toContain('/itemSearch');
      expect(url).not.toContain('/v1/');
    });

    it('should pass term, fields, and cursor', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchOrganizations } = await getOrganizationsTools();

      await searchOrganizations({ term: 'acme corp', fields: 'name,address', cursor: 'cur1', exact_match: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=acme+corp');
      expect(url).toContain('fields=name%2Caddress');
      expect(url).toContain('cursor=cur1');
      expect(url).toContain('exact_match=true');
      expect(url).not.toContain('item_types');
    });

    it('should parse next_cursor from v2 search response', async () => {
      mockFetch({ data: { items: [] }, additional_data: { next_cursor: 'NEXT' } });
      const { searchOrganizations } = await getOrganizationsTools();

      const result = await searchOrganizations({ term: 'x' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });
  });

  describe('deleteOrganization', () => {
    it('should block when destructive operations are disabled', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteOrganization } = await getOrganizationsTools();

      const result = await deleteOrganization({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should delete organization', async () => {
      mockApiSuccess({ id: 1 });
      const { deleteOrganization } = await getOrganizationsTools();

      const result = await deleteOrganization({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('Organization 1 deleted');
    });

    it('should send DELETE request', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const { deleteOrganization } = await getOrganizationsTools();

      await deleteOrganization({ id: 123 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/organizations/123');
      expect(options.method).toBe('DELETE');
    });
  });
});
