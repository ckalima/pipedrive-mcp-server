/**
 * Integration tests for organization follower tools (U3, #69)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const follower = {
  user_id: 7,
  add_time: '2024-01-01T00:00:00Z',
};

const changelogEntry = {
  action: 'added',
  actor_user_id: 1,
  follower_user_id: 7,
  time: '2024-01-01T00:00:00Z',
};

// Dynamic import to avoid module caching issues with mocks
async function getOrganizationsTools() {
  return import('../../../src/tools/organizations.js');
}

describe('organization follower tools (U3, #69)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listOrganizationFollowers', () => {
    it('should call v2 /organizations/{id}/followers endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizationFollowers } = await getOrganizationsTools();

      await listOrganizationFollowers({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/organizations/3/followers');
    });

    it('should forward cursor when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizationFollowers } = await getOrganizationsTools();

      await listOrganizationFollowers({ id: 3, cursor: 'follcursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=follcursor');
    });

    it('should surface next_cursor in pagination', async () => {
      mockFetch({ data: [follower], additional_data: paginationFixtures.v2WithMore });
      const { listOrganizationFollowers } = await getOrganizationsTools();

      const result = await listOrganizationFollowers({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "follower" in summary', async () => {
      mockFetch({ data: [follower, follower], additional_data: paginationFixtures.v2NoMore });
      const { listOrganizationFollowers } = await getOrganizationsTools();

      const result = await listOrganizationFollowers({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('follower');
      expect(parsed.summary).toContain('2');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listOrganizationFollowers } = await getOrganizationsTools();

      const result = await listOrganizationFollowers({ id: 3 });

      expect(result.isError).toBe(true);
    });

    it('should not include api_token in URL', async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizationFollowers } = await getOrganizationsTools();

      await listOrganizationFollowers({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
    });
  });

  describe('addOrganizationFollower', () => {
    it('should send POST request to /organizations/{id}/followers', async () => {
      const mockFn = mockApiSuccess(follower);
      const { addOrganizationFollower } = await getOrganizationsTools();

      await addOrganizationFollower({ id: 3, user_id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/organizations/3/followers');
      expect(options.method).toBe('POST');
    });

    it('should include user_id in request body', async () => {
      const mockFn = mockApiSuccess(follower);
      const { addOrganizationFollower } = await getOrganizationsTools();

      await addOrganizationFollower({ id: 3, user_id: 7 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.user_id).toBe(7);
    });

    it('should return summary "Follower added to organization"', async () => {
      mockApiSuccess(follower);
      const { addOrganizationFollower } = await getOrganizationsTools();

      const result = await addOrganizationFollower({ id: 3, user_id: 7 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Follower added to organization');
    });
  });

  describe('getOrganizationFollowersChangelog', () => {
    it('should call GET /organizations/{id}/followers/changelog', async () => {
      const mockFn = mockApiSuccess([]);
      const { getOrganizationFollowersChangelog } = await getOrganizationsTools();

      await getOrganizationFollowersChangelog({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/organizations/3/followers/changelog');
    });

    it('should surface pagination from changelog response', async () => {
      mockFetch({ data: [changelogEntry], additional_data: paginationFixtures.v2WithMore });
      const { getOrganizationFollowersChangelog } = await getOrganizationsTools();

      const result = await getOrganizationFollowersChangelog({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "changelog" in summary', async () => {
      mockFetch({ data: [changelogEntry], additional_data: paginationFixtures.v2NoMore });
      const { getOrganizationFollowersChangelog } = await getOrganizationsTools();

      const result = await getOrganizationFollowersChangelog({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('changelog');
    });
  });

  describe('deleteOrganizationFollower', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteOrganizationFollower } = await getOrganizationsTools();

      const result = await deleteOrganizationFollower({ id: 3, follower_id: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deleteOrganizationFollower } = await getOrganizationsTools();

      await deleteOrganizationFollower({ id: 3, follower_id: 7 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should send DELETE to /organizations/{id}/followers/{follower_id} path when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ user_id: 7 });
      const { deleteOrganizationFollower } = await getOrganizationsTools();

      await deleteOrganizationFollower({ id: 3, follower_id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/organizations/3/followers/7');
      expect(options.method).toBe('DELETE');
    });

    it('should return success summary with follower and organization ids', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ user_id: 7 });
      const { deleteOrganizationFollower } = await getOrganizationsTools();

      const result = await deleteOrganizationFollower({ id: 3, follower_id: 7 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('7');
      expect(parsed.summary).toContain('3');
    });
  });
});
