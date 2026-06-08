/**
 * Integration tests for tools/persons.ts
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
import { createPersonsFixture } from '../../helpers/fixtures.js';

// Dynamic import to avoid module caching issues with mocks
async function getPersonsTools() {
  return import('../../../src/tools/persons.js');
}

describe('persons tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listPersons', () => {
    it('should return list of persons with summary', async () => {
      const persons = createPersonsFixture(5);
      mockFetch({ data: persons, additional_data: paginationFixtures.v2NoMore });
      const { listPersons } = await getPersonsTools();

      const result = await listPersons({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('5 persons');
      expect(parsed.data).toHaveLength(5);
    });

    it('should pass filter parameters', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPersons } = await getPersonsTools();

      await listPersons({
        owner_id: 1,
        org_id: 5,
        first_char: 'A',
        sort_by: 'update_time',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('owner_id=1');
      expect(url).toContain('org_id=5');
      expect(url).toContain('first_char=A');
    });

    it('should handle pagination', async () => {
      mockFetch({ data: createPersonsFixture(50), additional_data: paginationFixtures.v2WithMore });
      const { listPersons } = await getPersonsTools();

      const result = await listPersons({ cursor: 'page2' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });
  });

  describe('getPerson', () => {
    it('should return single person', async () => {
      mockApiSuccess(fixtures.person);
      const { getPerson } = await getPersonsTools();

      const result = await getPerson({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Person 1');
      expect(parsed.data.name).toBe('John Doe');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Person not found');
      const { getPerson } = await getPersonsTools();

      const result = await getPerson({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('createPerson', () => {
    it('should create person with minimal data', async () => {
      mockApiSuccess({ ...fixtures.person, id: 100, name: 'New Person' });
      const { createPerson } = await getPersonsTools();

      const result = await createPerson({ name: 'New Person' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Person created');
    });

    it('should pass all fields to API', async () => {
      const mockFn = mockApiSuccess(fixtures.person);
      const { createPerson } = await getPersonsTools();

      await createPerson({
        name: 'Jane Doe',
        emails: [{ value: 'jane@example.com', primary: true }],
        phones: [{ value: '+1234567890', primary: true }],
        org_id: 5,
        visible_to: 7,
        marketing_status: 'subscribed',
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Jane Doe');
      // v2 contract: request body must use `emails`/`phones`, not `email`/`phone`
      expect(body.emails).toEqual([{ value: 'jane@example.com', primary: true }]);
      expect(body.phones).toEqual([{ value: '+1234567890', primary: true }]);
      expect(body.email).toBeUndefined();
      expect(body.phone).toBeUndefined();
      expect(body.visible_to).toBe(7);
    });
  });

  describe('updatePerson', () => {
    it('should update person', async () => {
      mockApiSuccess({ ...fixtures.person, name: 'Updated Name' });
      const { updatePerson } = await getPersonsTools();

      const result = await updatePerson({ id: 1, name: 'Updated Name' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Person 1 updated');
    });

    it('should send PATCH request', async () => {
      const mockFn = mockApiSuccess(fixtures.person);
      const { updatePerson } = await getPersonsTools();

      await updatePerson({ id: 1, org_id: 10 });

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });

    it('should send emails/phones (not email/phone) in PATCH body', async () => {
      const mockFn = mockApiSuccess(fixtures.person);
      const { updatePerson } = await getPersonsTools();

      await updatePerson({
        id: 1,
        emails: [{ value: 'new@example.com', primary: true }],
        phones: [{ value: '+1999', primary: true }],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.emails).toEqual([{ value: 'new@example.com', primary: true }]);
      expect(body.phones).toEqual([{ value: '+1999', primary: true }]);
      expect(body.email).toBeUndefined();
      expect(body.phone).toBeUndefined();
    });
  });

  describe('searchPersons', () => {
    it('should search persons', async () => {
      mockApiSuccess({
        items: [{ result_score: 1.0, item: fixtures.person }],
      });
      const { searchPersons } = await getPersonsTools();

      const result = await searchPersons({ term: 'john' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('john');
    });

    it('should use v1 API for search', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchPersons } = await getPersonsTools();

      await searchPersons({ term: 'test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/itemSearch');
    });

    it('should pass search parameters', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchPersons } = await getPersonsTools();

      await searchPersons({
        term: 'jane',
        org_id: 5,
        search_by_email: true,
        search_by_phone: false,
        exact_match: true,
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=jane');
      expect(url).toContain('organization_id=5');
      expect(url).toContain('search_by_email=1');
      expect(url).toContain('search_by_phone=0');
    });
  });

  describe('deletePerson', () => {
    it('should block when destructive operations are disabled', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deletePerson } = await getPersonsTools();

      const result = await deletePerson({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should delete person', async () => {
      mockApiSuccess({ id: 1 });
      const { deletePerson } = await getPersonsTools();

      const result = await deletePerson({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('Person 1 deleted');
    });

    it('should send DELETE request', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const { deletePerson } = await getPersonsTools();

      await deletePerson({ id: 123 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/persons/123');
      expect(options.method).toBe('DELETE');
    });
  });
});
