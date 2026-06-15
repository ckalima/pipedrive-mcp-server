/**
 * Unit tests for src/version-routing.ts
 *
 * The R5 retirement discriminator and the retired/warned state machine are the
 * subtle, high-risk core of the seam, so they are exercised directly here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../helpers/mockEnv.js';
import { mockFetch, mockApiSuccess, mockApiError } from '../helpers/mockFetch.js';
import {
  isRetirementSignal,
  resetVersionRoutingState,
  notesV1,
  mailV1,
  usersV1,
  leadsV1,
} from '../../src/version-routing.js';

const LEAD_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('version-routing', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
    resetVersionRoutingState();
  });

  // ─── R5 discriminator ────────────────────────────────────────────────────────
  describe('isRetirementSignal (R5)', () => {
    it('410 on any registered operation is retirement (item paths included)', () => {
      expect(isRetirementSignal('notes', '/notes', 410)).toBe(true);
      expect(isRetirementSignal('notes', '/notes/123', 410)).toBe(true);
      expect(isRetirementSignal('mail', '/mailbox/mailThreads', 410)).toBe(true);
      expect(isRetirementSignal('mail', '/persons/1/mailMessages', 410)).toBe(true);
      expect(isRetirementSignal('users', '/users/me', 410)).toBe(true);
      expect(isRetirementSignal('leads', `/leads/${LEAD_UUID}`, 410)).toBe(true);
    });

    it('404 on a 404-eligible collection root is retirement (AE2)', () => {
      expect(isRetirementSignal('notes', '/notes', 404)).toBe(true);
      expect(isRetirementSignal('users', '/users', 404)).toBe(true);
      expect(isRetirementSignal('users', '/users/me', 404)).toBe(true);
      expect(isRetirementSignal('leads', '/leads', 404)).toBe(true);
    });

    it('404 on an item path is NOT retirement (AE1)', () => {
      expect(isRetirementSignal('notes', '/notes/123', 404)).toBe(false);
      expect(isRetirementSignal('users', '/users/7', 404)).toBe(false);
      expect(isRetirementSignal('leads', `/leads/${LEAD_UUID}`, 404)).toBe(false);
    });

    it('404 on ANY mail operation is NOT retirement (mail is 410-only)', () => {
      expect(isRetirementSignal('mail', '/mailbox/mailThreads', 404)).toBe(false);
      expect(isRetirementSignal('mail', '/mailbox/mailThreads/1', 404)).toBe(false);
      expect(isRetirementSignal('mail', '/mailbox/mailMessages/1', 404)).toBe(false);
      expect(isRetirementSignal('mail', '/persons/1/mailMessages', 404)).toBe(false);
      expect(isRetirementSignal('mail', '/deals/1/mailMessages', 404)).toBe(false);
    });

    it('400/401/403/429/500 are never retirement', () => {
      for (const status of [400, 401, 403, 429, 500]) {
        expect(isRetirementSignal('notes', '/notes', status)).toBe(false);
        expect(isRetirementSignal('users', '/users', status)).toBe(false);
      }
    });

    it('a missing/undefined status (network/timeout) is not retirement', () => {
      expect(isRetirementSignal('notes', '/notes', undefined)).toBe(false);
      expect(isRetirementSignal('leads', '/leads', undefined)).toBe(false);
    });
  });

  // ─── Seam behavior ───────────────────────────────────────────────────────────
  describe('capability seam', () => {
    it('seam success: a 200 returns the underlying ApiResponse unchanged', async () => {
      mockApiSuccess([{ id: 1 }]);

      const response = await notesV1.get<unknown[]>('/notes', undefined);

      expect(response.success).toBe(true);
      expect(response.data).toEqual([{ id: 1 }]);
    });

    it('marks the capability retired on a 410 and returns CAPABILITY_RETIRED (R6/AE2)', async () => {
      mockApiError(410, 'Gone');

      const response = await notesV1.get('/notes', undefined);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('CAPABILITY_RETIRED');
    });

    it('marks retired on a collection-root 404 for an eligible capability (AE2)', async () => {
      mockApiError(404, 'Not found');

      const response = await usersV1.get('/users', undefined);

      expect(response.error?.code).toBe('CAPABILITY_RETIRED');
    });

    it('does NOT mark retired on an ordinary item 404 (AE1)', async () => {
      mockApiError(404, 'Not found');

      const response = await notesV1.get('/notes/123', undefined);

      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('does NOT mark retired on a mail collection-root 404 (mail is 410-only)', async () => {
      mockApiError(404, 'Not found');

      const response = await mailV1.get('/mailbox/mailThreads', undefined);

      expect(response.error?.code).toBe('NOT_FOUND');
    });

    it('after retirement, a second call short-circuits with NO new upstream request (R4/AE3)', async () => {
      const mockFn = mockApiError(410, 'Gone');

      const first = await notesV1.get('/notes', undefined);
      expect(first.error?.code).toBe('CAPABILITY_RETIRED');
      expect(mockFn).toHaveBeenCalledTimes(1);

      const second = await notesV1.get('/notes', undefined);
      expect(second.error?.code).toBe('CAPABILITY_RETIRED');
      expect(mockFn).toHaveBeenCalledTimes(1); // no second fetch
    });

    it('retirement is scoped per capability — retiring notes does not retire leads', async () => {
      mockApiError(410, 'Gone');
      await notesV1.get('/notes', undefined);

      // leads is independent: a fresh 200 still succeeds.
      mockApiSuccess([]);
      const leadsResponse = await leadsV1.get('/leads', undefined);

      expect(leadsResponse.success).toBe(true);
    });

    it('emits the operator warning once per capability (R7/AE4)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApiSuccess([]);

      await notesV1.get('/notes', undefined);
      await notesV1.get('/notes', undefined);
      await mailV1.get('/mailbox/mailThreads', undefined);
      await mailV1.get('/mailbox/mailThreads', undefined);

      const warnings = errorSpy.mock.calls
        .flat()
        .map(String)
        .filter((line) => line.includes('no v2 equivalent'));

      expect(warnings.filter((w) => w.includes('Notes'))).toHaveLength(1);
      expect(warnings.filter((w) => w.includes('Mail'))).toHaveLength(1);
      expect(warnings).toHaveLength(2);

      errorSpy.mockRestore();
    });

    it('delete routing places "v1" before the optional body', async () => {
      const mockFn = mockApiSuccess({ id: 1 });

      await notesV1.delete('/notes/1', { foo: 'bar' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/v1/notes/1');
      expect(options.method).toBe('DELETE');
      expect(JSON.parse(options.body)).toEqual({ foo: 'bar' });
    });

    it('reset clears the retired and warned sets', async () => {
      const retiredMock = mockApiError(410, 'Gone');
      await notesV1.get('/notes', undefined);
      await notesV1.get('/notes', undefined);
      expect(retiredMock).toHaveBeenCalledTimes(1); // still retired, short-circuited

      resetVersionRoutingState();

      const okMock = mockApiSuccess([]);
      const after = await notesV1.get('/notes', undefined);
      expect(after.success).toBe(true);
      expect(okMock).toHaveBeenCalledTimes(1); // request re-attempted after reset
    });
  });
});
