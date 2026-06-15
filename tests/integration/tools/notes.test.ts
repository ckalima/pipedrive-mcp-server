/**
 * Integration tests for tools/notes.ts
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
import { createNotesFixture } from '../../helpers/fixtures.js';

async function getNotesTools() {
  return import('../../../src/tools/notes.js');
}

describe('notes tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listNotes', () => {
    it('should return list of notes with summary', async () => {
      const notes = createNotesFixture(3);
      mockFetch({ data: notes, additional_data: paginationFixtures.v1NoMore });
      const { listNotes } = await getNotesTools();

      const result = await listNotes({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 note');
      expect(parsed.data).toHaveLength(3);
    });

    it('should pass filter parameters', async () => {
      const mockFn = mockApiSuccess([]);
      const { listNotes } = await getNotesTools();

      await listNotes({
        deal_id: 1,
        person_id: 2,
        org_id: 3,
        pinned_to_deal_flag: true,
        sort: 'add_time',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('deal_id=1');
      expect(url).toContain('person_id=2');
      expect(url).toContain('org_id=3');
      expect(url).toContain('pinned_to_deal_flag=1');
    });

    it('should handle v1 pagination', async () => {
      mockFetch({ data: [], additional_data: paginationFixtures.v1WithMore });
      const { listNotes } = await getNotesTools();

      const result = await listNotes({ start: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });

    it('should handle API error', async () => {
      mockApiError(401, 'Invalid API key');
      const { listNotes } = await getNotesTools();

      const result = await listNotes({});

      expect(result.content[0].text).toContain('INVALID_API_KEY');
      expect(result.isError).toBe(true);
    });

    it('should use v1 API endpoint', async () => {
      const mockFn = mockApiSuccess([]);
      const { listNotes } = await getNotesTools();

      await listNotes({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/notes');
    });

    it('should handle response with no data gracefully', async () => {
      // Simulate API returning success but with null/undefined data
      mockFetch({ data: null });
      const { listNotes } = await getNotesTools();

      const result = await listNotes({ deal_id: 277 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toEqual([]);
      expect(parsed.summary).toContain('0 note');
    });
  });

  describe('getNote', () => {
    it('should return single note', async () => {
      mockApiSuccess(fixtures.note);
      const { getNote } = await getNotesTools();

      const result = await getNote({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Note 1');
      expect(parsed.data.content).toBe('<p>Test note content</p>');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Note not found');
      const { getNote } = await getNotesTools();

      const result = await getNote({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });

    it('should handle missing data with fallback error', async () => {
      // Simulate API returning failure with no error object
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: null }),
      }));
      const { getNote } = await getNotesTools();

      const result = await getNote({ id: 1 });

      expect(result.content[0].text).toContain('API_ERROR');
      expect(result.content[0].text).toContain('Unknown API error');
    });
  });

  describe('createNote', () => {
    it('should create note with required fields', async () => {
      mockApiSuccess({ ...fixtures.note, id: 100, content: 'New note' });
      const { createNote } = await getNotesTools();

      const result = await createNote({
        content: 'New note',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Note created');
    });

    it('should pass all fields to API', async () => {
      const mockFn = mockApiSuccess(fixtures.note);
      const { createNote } = await getNotesTools();

      await createNote({
        content: '<p>Meeting notes</p>',
        deal_id: 10,
        person_id: 20,
        org_id: 30,
        lead_id: 'lead-123',
        pinned_to_deal_flag: true,
        pinned_to_person_flag: false,
        pinned_to_organization_flag: true,
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.content).toBe('<p>Meeting notes</p>');
      expect(body.deal_id).toBe(10);
      expect(body.person_id).toBe(20);
      expect(body.org_id).toBe(30);
      expect(body.lead_id).toBe('lead-123');
      expect(body.pinned_to_deal_flag).toBe(1);
      expect(body.pinned_to_person_flag).toBe(0);
      expect(body.pinned_to_organization_flag).toBe(1);
    });

    it('should handle validation error', async () => {
      mockApiError(400, 'Content is required');
      const { createNote } = await getNotesTools();

      const result = await createNote({ content: 'Test' });

      expect(result.content[0].text).toContain('VALIDATION_ERROR');
    });

    it('should send POST request to v1 endpoint', async () => {
      const mockFn = mockApiSuccess(fixtures.note);
      const { createNote } = await getNotesTools();

      await createNote({ content: 'Test note' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/notes');
      expect(options.method).toBe('POST');
    });
  });

  describe('updateNote', () => {
    it('should update note', async () => {
      mockApiSuccess({ ...fixtures.note, content: 'Updated content' });
      const { updateNote } = await getNotesTools();

      const result = await updateNote({ id: 1, content: 'Updated content' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Note 1 updated');
    });

    it('should send PUT request', async () => {
      const mockFn = mockApiSuccess(fixtures.note);
      const { updateNote } = await getNotesTools();

      await updateNote({ id: 1, content: 'Updated content' });

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PUT');
    });

    it('should update pin flags', async () => {
      const mockFn = mockApiSuccess(fixtures.note);
      const { updateNote } = await getNotesTools();

      await updateNote({
        id: 1,
        pinned_to_deal_flag: true,
        pinned_to_person_flag: false,
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.pinned_to_deal_flag).toBe(1);
      expect(body.pinned_to_person_flag).toBe(0);
    });

    it('should use v1 API endpoint', async () => {
      const mockFn = mockApiSuccess(fixtures.note);
      const { updateNote } = await getNotesTools();

      await updateNote({ id: 123, content: 'Test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/notes/123');
    });
  });

  describe('deleteNote', () => {
    it('should block when destructive operations are disabled', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteNote } = await getNotesTools();

      const result = await deleteNote({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should delete note', async () => {
      mockApiSuccess({ id: 1 });
      const { deleteNote } = await getNotesTools();

      const result = await deleteNote({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('Note 1 deleted');
    });

    it('should send DELETE request', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const { deleteNote } = await getNotesTools();

      await deleteNote({ id: 123 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/notes/123');
      expect(options.method).toBe('DELETE');
    });
  });

  // The version-routing seam's retired/warned state is reset before each test by
  // the shared setup (tests/setup.ts), so these are independent.
  describe('v1 sunset detection (U3)', () => {
    it('AE1: an ordinary item 404 returns NOT_FOUND and does NOT retire notes', async () => {
      mockApiError(404, 'Note not found');
      const { getNote, listNotes } = await getNotesTools();

      const notFound = await getNote({ id: 99999 });
      expect(notFound.content[0].text).toContain('NOT_FOUND');

      // notes was not marked retired — a follow-up list still hits the network.
      const listMock = mockApiSuccess([]);
      const listResult = await listNotes({});
      expect(listResult.isError).toBeFalsy();
      expect(listMock).toHaveBeenCalledTimes(1);
    });

    it('AE2/R6: a 410 on a v1-only list returns the retirement message and marks notes retired', async () => {
      mockApiError(410, 'Gone');
      const { listNotes } = await getNotesTools();

      const result = await listNotes({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('CAPABILITY_RETIRED');
      expect(result.content[0].text).toContain('Notes');
    });

    it('AE2: a collection-root 404 on /notes also marks notes retired', async () => {
      mockApiError(404, 'Not found');
      const { listNotes } = await getNotesTools();

      const result = await listNotes({});

      expect(result.content[0].text).toContain('CAPABILITY_RETIRED');
    });

    it('AE3/R4: once retired, later calls short-circuit with no new upstream request', async () => {
      const mockFn = mockApiError(410, 'Gone');
      const { listNotes, getNote } = await getNotesTools();

      const first = await listNotes({});
      expect(first.content[0].text).toContain('CAPABILITY_RETIRED');
      expect(mockFn).toHaveBeenCalledTimes(1);

      // A different notes operation also short-circuits, still no new request.
      const second = await getNote({ id: 1 });
      expect(second.content[0].text).toContain('CAPABILITY_RETIRED');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});
