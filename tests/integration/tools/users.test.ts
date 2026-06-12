/**
 * Integration tests for tools/users.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  fixtures,
} from '../../helpers/mockFetch.js';

async function getUsersTools() {
  return import('../../../src/tools/users.js');
}

describe('users tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listUsers', () => {
    it('should return list of users', async () => {
      const users = [
        { ...fixtures.user, id: 1, name: 'John Doe' },
        { ...fixtures.user, id: 2, name: 'Jane Smith' },
        { ...fixtures.user, id: 3, name: 'Bob Wilson' },
      ];
      mockApiSuccess(users);
      const { listUsers } = await getUsersTools();

      const result = await listUsers({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 user');
      expect(parsed.data).toHaveLength(3);
    });

    it('should use v1 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listUsers } = await getUsersTools();

      await listUsers({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/users');
    });

    it('should handle API error', async () => {
      mockApiError(401, 'Invalid API key');
      const { listUsers } = await getUsersTools();

      const result = await listUsers({});

      expect(result.content[0].text).toContain('INVALID_API_KEY');
      expect(result.isError).toBe(true);
    });

    it('treats a v1 empty { data: null } response as 0 users, not an "Unknown API error"', async () => {
      // Pipedrive v1 returns { success: true, data: null } for an empty collection.
      mockFetch({ data: null });
      const { listUsers } = await getUsersTools();

      const result = await listUsers({});

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('0 user');
      expect(parsed.data).toEqual([]);
    });
  });

  describe('getUser', () => {
    it('should return single user', async () => {
      mockApiSuccess(fixtures.user);
      const { getUser } = await getUsersTools();

      const result = await getUser({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('User 1');
      expect(parsed.data.name).toBe('Test User');
      expect(parsed.data.email).toBe('user@example.com');
    });

    it('should use v1 API', async () => {
      const mockFn = mockApiSuccess(fixtures.user);
      const { getUser } = await getUsersTools();

      await getUser({ id: 123 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/users/123');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'User not found');
      const { getUser } = await getUsersTools();

      const result = await getUser({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user', async () => {
      mockApiSuccess({ ...fixtures.user, id: 5, name: 'Current User', is_admin: true });
      const { getCurrentUser } = await getUsersTools();

      const result = await getCurrentUser({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Current user');
      expect(parsed.data.name).toBe('Current User');
      expect(parsed.data.is_admin).toBe(true);
    });

    it('should use v1 API with /me endpoint', async () => {
      const mockFn = mockApiSuccess(fixtures.user);
      const { getCurrentUser } = await getUsersTools();

      await getCurrentUser({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/users/me');
    });

    it('should handle unauthorized', async () => {
      mockApiError(401, 'Invalid API key');
      const { getCurrentUser } = await getUsersTools();

      const result = await getCurrentUser({});

      expect(result.content[0].text).toContain('INVALID_API_KEY');
    });
  });
});
