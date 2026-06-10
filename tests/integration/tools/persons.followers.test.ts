/**
 * Integration tests for person follower + picture tools (U2, #69)
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

const pictureFixture = {
  id: 99,
  item_type: 'person',
  item_id: 5,
  added_by_user_id: 1,
  active_flag: true,
  file_size: 12345,
  pictures: {
    '128': 'https://example.com/p/128.jpg',
    '512': 'https://example.com/p/512.jpg',
  },
};

// Dynamic import to avoid module caching issues with mocks
async function getPersonsTools() {
  return import('../../../src/tools/persons.js');
}

describe('person follower tools (U2, #69)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listPersonFollowers', () => {
    it('should call v2 /persons/{id}/followers endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPersonFollowers } = await getPersonsTools();

      await listPersonFollowers({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/persons/3/followers');
    });

    it('should forward cursor when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPersonFollowers } = await getPersonsTools();

      await listPersonFollowers({ id: 3, cursor: 'follcursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=follcursor');
    });

    it('should surface next_cursor in pagination', async () => {
      mockFetch({ data: [follower], additional_data: paginationFixtures.v2WithMore });
      const { listPersonFollowers } = await getPersonsTools();

      const result = await listPersonFollowers({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "follower" in summary', async () => {
      mockFetch({ data: [follower, follower], additional_data: paginationFixtures.v2NoMore });
      const { listPersonFollowers } = await getPersonsTools();

      const result = await listPersonFollowers({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('follower');
      expect(parsed.summary).toContain('2');
    });

    it('should return isError on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listPersonFollowers } = await getPersonsTools();

      const result = await listPersonFollowers({ id: 3 });

      expect(result.isError).toBe(true);
    });

    it('should not include api_token in URL', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPersonFollowers } = await getPersonsTools();

      await listPersonFollowers({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('api_token');
    });
  });

  describe('addPersonFollower', () => {
    it('should send POST request to /persons/{id}/followers', async () => {
      const mockFn = mockApiSuccess(follower);
      const { addPersonFollower } = await getPersonsTools();

      await addPersonFollower({ id: 3, user_id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/persons/3/followers');
      expect(options.method).toBe('POST');
    });

    it('should include user_id in request body', async () => {
      const mockFn = mockApiSuccess(follower);
      const { addPersonFollower } = await getPersonsTools();

      await addPersonFollower({ id: 3, user_id: 7 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.user_id).toBe(7);
    });

    it('should return summary "Follower added to person"', async () => {
      mockApiSuccess(follower);
      const { addPersonFollower } = await getPersonsTools();

      const result = await addPersonFollower({ id: 3, user_id: 7 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Follower added to person');
    });
  });

  describe('getPersonFollowersChangelog', () => {
    it('should call GET /persons/{id}/followers/changelog', async () => {
      const mockFn = mockApiSuccess([]);
      const { getPersonFollowersChangelog } = await getPersonsTools();

      await getPersonFollowersChangelog({ id: 3 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/persons/3/followers/changelog');
    });

    it('should surface pagination from changelog response', async () => {
      mockFetch({ data: [changelogEntry], additional_data: paginationFixtures.v2WithMore });
      const { getPersonFollowersChangelog } = await getPersonsTools();

      const result = await getPersonFollowersChangelog({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should include "changelog" in summary', async () => {
      mockFetch({ data: [changelogEntry], additional_data: paginationFixtures.v2NoMore });
      const { getPersonFollowersChangelog } = await getPersonsTools();

      const result = await getPersonFollowersChangelog({ id: 3 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('changelog');
    });
  });

  describe('deletePersonFollower', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deletePersonFollower } = await getPersonsTools();

      const result = await deletePersonFollower({ id: 3, follower_id: 7 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should make NO fetch call when guard blocks', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);
      const { deletePersonFollower } = await getPersonsTools();

      await deletePersonFollower({ id: 3, follower_id: 7 });

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should send DELETE to /persons/{id}/followers/{follower_id} path when enabled', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ user_id: 7 });
      const { deletePersonFollower } = await getPersonsTools();

      await deletePersonFollower({ id: 3, follower_id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/persons/3/followers/7');
      expect(options.method).toBe('DELETE');
    });

    it('should return success summary with follower and person ids', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ user_id: 7 });
      const { deletePersonFollower } = await getPersonsTools();

      const result = await deletePersonFollower({ id: 3, follower_id: 7 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('7');
      expect(parsed.summary).toContain('3');
    });
  });

  describe('getPersonPicture', () => {
    it('should call GET /api/v2/persons/{id}/picture', async () => {
      const mockFn = mockApiSuccess(pictureFixture);
      const { getPersonPicture } = await getPersonsTools();

      await getPersonPicture({ id: 5 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/persons/5/picture');
      expect(options.method).toBe('GET');
    });

    it('should return sized picture URLs in data', async () => {
      mockApiSuccess(pictureFixture);
      const { getPersonPicture } = await getPersonsTools();

      const result = await getPersonPicture({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.pictures['128']).toBe('https://example.com/p/128.jpg');
      expect(parsed.data.pictures['512']).toBe('https://example.com/p/512.jpg');
    });

    it('should include "Picture for person 5" in summary', async () => {
      mockApiSuccess(pictureFixture);
      const { getPersonPicture } = await getPersonsTools();

      const result = await getPersonPicture({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Picture for person 5');
    });

    it('should NOT include a pagination key', async () => {
      mockApiSuccess(pictureFixture);
      const { getPersonPicture } = await getPersonsTools();

      const result = await getPersonPicture({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).not.toHaveProperty('pagination');
    });

    it('should return isError when the person has no picture (404)', async () => {
      mockApiError(404, 'Not found');
      const { getPersonPicture } = await getPersonsTools();

      const result = await getPersonPicture({ id: 5 });

      expect(result.isError).toBe(true);
    });
  });
});
