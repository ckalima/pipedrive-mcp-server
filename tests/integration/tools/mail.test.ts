/**
 * Integration tests for tools/mail.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';
import { createMailThreadFixture, createMailMessageFixture } from '../../helpers/fixtures.js';

async function getMailTools() {
  return import('../../../src/tools/mail.js');
}

describe('mail tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('getPersonEmails', () => {
    it('should return emails for a person', async () => {
      const threads = [createMailThreadFixture(1), createMailThreadFixture(2)];
      mockApiSuccess(threads);
      const { getPersonEmails } = await getMailTools();

      const result = await getPersonEmails({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('2 email');
      expect(parsed.data).toHaveLength(2);
    });

    it('should use v1 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { getPersonEmails } = await getMailTools();

      await getPersonEmails({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/persons/1/mailMessages');
    });

    it('should pass pagination parameters', async () => {
      const mockFn = mockApiSuccess([]);
      const { getPersonEmails } = await getMailTools();

      await getPersonEmails({ id: 1, start: 50, limit: 100 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('start=50');
      expect(url).toContain('limit=100');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Person not found');
      const { getPersonEmails } = await getMailTools();

      const result = await getPersonEmails({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });

    it('getPersonEmails returns extractPaginationV1 shape (next_cursor, not next_start)', async () => {
      mockFetch({ data: [{ id: 1 }], additional_data: paginationFixtures.v1WithMore });
      const { getPersonEmails } = await getMailTools();
      const result = await getPersonEmails({ id: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('50');
      expect(parsed.pagination).not.toHaveProperty('next_start');
    });

    it('treats a v1 empty { data: null } response as 0 emails, not an "Unknown API error"', async () => {
      // Pipedrive v1 returns { success: true, data: null } for an empty collection.
      mockFetch({ data: null, additional_data: { pagination: { more_items_in_collection: false } } });
      const { getPersonEmails } = await getMailTools();
      const result = await getPersonEmails({ id: 1 });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('0 email');
      expect(parsed.data).toEqual([]);
    });
  });

  describe('getDealEmails', () => {
    it('should return emails for a deal', async () => {
      const threads = [createMailThreadFixture(1)];
      mockApiSuccess(threads);
      const { getDealEmails } = await getMailTools();

      const result = await getDealEmails({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('1 email');
    });

    it('should use v1 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { getDealEmails } = await getMailTools();

      await getDealEmails({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/deals/1/mailMessages');
    });

    it('getDealEmails returns extractPaginationV1 shape (next_cursor, not next_start)', async () => {
      mockFetch({ data: [{ id: 1 }], additional_data: paginationFixtures.v1WithMore });
      const { getDealEmails } = await getMailTools();
      const result = await getDealEmails({ id: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('50');
      expect(parsed.pagination).not.toHaveProperty('next_start');
    });

    it('treats a v1 empty { data: null } response as 0 emails, not an "Unknown API error"', async () => {
      mockFetch({ data: null, additional_data: { pagination: { more_items_in_collection: false } } });
      const { getDealEmails } = await getMailTools();
      const result = await getDealEmails({ id: 1 });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('0 email');
      expect(parsed.data).toEqual([]);
    });
  });

  describe('listMailThreads', () => {
    it('should return mail threads from inbox', async () => {
      const threads = [createMailThreadFixture(1), createMailThreadFixture(2)];
      mockApiSuccess(threads);
      const { listMailThreads } = await getMailTools();

      const result = await listMailThreads({ folder: 'inbox' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('2 mail thread');
    });

    it('should filter by folder', async () => {
      const mockFn = mockApiSuccess([]);
      const { listMailThreads } = await getMailTools();

      await listMailThreads({ folder: 'sent' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('folder=sent');
    });

    it('should use v1 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listMailThreads } = await getMailTools();

      await listMailThreads({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/mailbox/mailThreads');
    });

    it('should handle pagination', async () => {
      const mockFn = mockApiSuccess([]);
      const { listMailThreads } = await getMailTools();

      await listMailThreads({ start: 100, limit: 25 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('start=100');
      expect(url).toContain('limit=25');
    });

    it('listMailThreads returns extractPaginationV1 shape (next_cursor, not next_start)', async () => {
      mockFetch({ data: [{ id: 1 }], additional_data: paginationFixtures.v1WithMore });
      const { listMailThreads } = await getMailTools();
      const result = await listMailThreads({ folder: 'inbox' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('50');
      expect(parsed.pagination).not.toHaveProperty('next_start');
    });

    it('treats a v1 empty { data: null } folder as 0 threads, not an "Unknown API error"', async () => {
      mockFetch({ data: null, additional_data: { pagination: { more_items_in_collection: false } } });
      const { listMailThreads } = await getMailTools();
      const result = await listMailThreads({ folder: 'inbox' });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('0 mail thread');
      expect(parsed.data).toEqual([]);
    });
  });

  describe('getMailThread', () => {
    it('should return single mail thread', async () => {
      mockApiSuccess(createMailThreadFixture(1));
      const { getMailThread } = await getMailTools();

      const result = await getMailThread({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Mail thread 1');
      expect(parsed.data.subject).toBe('Test Email Thread');
    });

    it('should use v1 API', async () => {
      const mockFn = mockApiSuccess(createMailThreadFixture(1));
      const { getMailThread } = await getMailTools();

      await getMailThread({ id: 123 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/mailbox/mailThreads/123');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Mail thread not found');
      const { getMailThread } = await getMailTools();

      const result = await getMailThread({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('getMailMessage', () => {
    it('should return single mail message', async () => {
      mockApiSuccess(createMailMessageFixture(1));
      const { getMailMessage } = await getMailTools();

      const result = await getMailMessage({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Mail message 1');
      expect(parsed.data.subject).toBe('Test Email');
    });

    it('should use v1 API', async () => {
      const mockFn = mockApiSuccess(createMailMessageFixture(1));
      const { getMailMessage } = await getMailTools();

      await getMailMessage({ id: 456 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/mailbox/mailMessages/456');
    });

    it('should pass include_body parameter', async () => {
      const mockFn = mockApiSuccess(createMailMessageFixture(1));
      const { getMailMessage } = await getMailTools();

      await getMailMessage({ id: 1, include_body: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('include_body=1');
    });
  });

  // All five mail operations — including getPersonEmails / getDealEmails, whose
  // /persons and /deals prefixes collide with the live v2 tools — route under the
  // single mail capability (R3), so retirement is capability-scoped, never prefix-scoped.
  describe('v1 sunset detection (U3, R3)', () => {
    it('a 410 on getPersonEmails retires mail and short-circuits all five mail operations', async () => {
      const mockFn = mockApiError(410, 'Gone');
      const {
        getPersonEmails,
        getDealEmails,
        listMailThreads,
        getMailThread,
        getMailMessage,
      } = await getMailTools();

      const first = await getPersonEmails({ id: 1 });
      expect(first.content[0].text).toContain('CAPABILITY_RETIRED');
      expect(first.content[0].text).toContain('Mail');
      expect(mockFn).toHaveBeenCalledTimes(1);

      const rest = [
        await getDealEmails({ id: 2 }),
        await listMailThreads({}),
        await getMailThread({ id: 3 }),
        await getMailMessage({ id: 4 }),
      ];
      for (const result of rest) {
        expect(result.content[0].text).toContain('CAPABILITY_RETIRED');
      }
      // No further upstream requests once mail is retired.
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('R3: retiring mail does NOT affect the v2 persons tool (capability-scoped, not prefix-scoped)', async () => {
      mockApiError(410, 'Gone');
      const { getPersonEmails } = await getMailTools();
      await getPersonEmails({ id: 1 }); // retires mail

      // The real v2 /persons tool never routes through the mail seam — unaffected.
      const { getPerson } = await import('../../../src/tools/persons.js');
      mockApiSuccess({ id: 1, name: 'John' });
      const personResult = await getPerson({ id: 1 });
      expect(personResult.isError).toBeFalsy();
    });

    it('AE4/R7: mail emits its operator warning at most once across operations', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApiSuccess([]);
      const { getPersonEmails, listMailThreads } = await getMailTools();

      await getPersonEmails({ id: 1 });
      await listMailThreads({});

      const warnings = errorSpy.mock.calls
        .flat()
        .map(String)
        .filter((line) => line.includes('no v2 equivalent'));
      expect(warnings.filter((w) => w.includes('Mail'))).toHaveLength(1);
      errorSpy.mockRestore();
    });
  });
});
