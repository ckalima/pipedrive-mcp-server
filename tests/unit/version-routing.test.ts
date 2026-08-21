/**
 * Unit tests for src/version-routing.ts
 *
 * The R5 retirement discriminator and the retired/warned state machine are the
 * subtle, high-risk core of the seam, so they are exercised directly here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../helpers/mockEnv.js';
import { mockApiSuccess, mockApiError, createMockResponse, requestBody } from '../helpers/mockFetch.js';
import {
  isRetirementSignal,
  isLatchable404,
  RETIREMENT_404_THRESHOLD,
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

  // ─── 404-latch eligibility (allowlist) ───────────────────────────────────────
  describe('isLatchable404', () => {
    it('no params at all is latchable', () => {
      expect(isLatchable404(undefined)).toBe(true);
      expect(isLatchable404(new URLSearchParams())).toBe(true);
    });

    it('pagination/sort/archived params are latchable', () => {
      expect(isLatchable404(new URLSearchParams({ limit: '50', start: '0' }))).toBe(true);
      expect(isLatchable404(new URLSearchParams({ archived_flag: 'false', sort: 'id' }))).toBe(true);
    });

    it.each(['filter_id', 'owner_id', 'person_id', 'organization_id', 'user_id', 'deal_id'])(
      '%s makes the response ineligible — it can 404 on its own',
      (key) => {
        expect(isLatchable404(new URLSearchParams({ limit: '50', [key]: '7' }))).toBe(false);
      },
    );

    it('an unrecognized param is ineligible (allowlist, not blocklist)', () => {
      expect(isLatchable404(new URLSearchParams({ something_new: 'x' }))).toBe(false);
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

    it('marks retired after RETIREMENT_404_THRESHOLD collection-root 404s (AE2)', async () => {
      mockApiError(404, 'Not found');

      // Below the threshold the caller gets the honest NOT_FOUND, not a retirement.
      for (let i = 0; i < RETIREMENT_404_THRESHOLD - 1; i++) {
        expect((await usersV1.get('/users', undefined)).error?.code).toBe('NOT_FOUND');
      }

      const response = await usersV1.get('/users', undefined);
      expect(response.error?.code).toBe('CAPABILITY_RETIRED');
    });

    it('does NOT retire on a single transient collection-root 404 (the eager-latch bug)', async () => {
      // One 404 used to retire the capability for the whole process, with a message
      // asserting Pipedrive had removed it. A transient fault must not do that.
      mockApiError(404, 'Not found');
      expect((await usersV1.get('/users', undefined)).error?.code).toBe('NOT_FOUND');

      mockApiSuccess([{ id: 1 }]);
      const recovered = await usersV1.get('/users', undefined);
      expect(recovered.success).toBe(true);
    });

    it('a non-404 outcome resets the run — 404s must be consecutive', async () => {
      for (let i = 0; i < RETIREMENT_404_THRESHOLD - 1; i++) {
        mockApiError(404, 'Not found');
        await usersV1.get('/users', undefined);
      }

      mockApiSuccess([{ id: 1 }]); // run broken here
      await usersV1.get('/users', undefined);

      mockApiError(404, 'Not found');
      for (let i = 0; i < RETIREMENT_404_THRESHOLD - 1; i++) {
        expect((await usersV1.get('/users', undefined)).error?.code).toBe('NOT_FOUND');
      }
      expect((await usersV1.get('/users', undefined)).error?.code).toBe('CAPABILITY_RETIRED');
    });

    it('404s on a FILTERED collection root never latch, however many arrive', async () => {
      // A caller-supplied filter_id pointing at a deleted filter 404s the collection
      // root while the surface is alive; that must never be read as a retirement.
      mockApiError(404, 'Not found');
      const filtered = new URLSearchParams({ limit: '50', filter_id: '999' });

      for (let i = 0; i < RETIREMENT_404_THRESHOLD * 2; i++) {
        expect((await leadsV1.get('/leads', filtered)).error?.code).toBe('NOT_FOUND');
      }

      mockApiSuccess([]);
      expect((await leadsV1.get('/leads', undefined)).success).toBe(true);
    });

    it('pagination-only params still latch (they cannot cause a 404 on their own)', async () => {
      mockApiError(404, 'Not found');
      const paging = new URLSearchParams({ limit: '50', start: '0', archived_flag: 'false' });

      for (let i = 0; i < RETIREMENT_404_THRESHOLD - 1; i++) {
        await leadsV1.get('/leads', paging);
      }
      expect((await leadsV1.get('/leads', paging)).error?.code).toBe('CAPABILITY_RETIRED');
    });

    it('collection-root 404s on WRITES never latch — their identifiers ride the body', async () => {
      // createNote POSTs to the literal collection root with a caller-supplied
      // deal_id/person_id in the BODY. If Pipedrive 404s a since-deleted parent,
      // that is the same false signal as a stale filter_id — but invisible to the
      // query-param allowlist, so writes are excluded from the latch outright.
      mockApiError(404, 'Not found');

      for (let i = 0; i < RETIREMENT_404_THRESHOLD * 2; i++) {
        expect((await notesV1.post('/notes', { content: 'x', deal_id: 999 })).error?.code)
          .toBe('NOT_FOUND');
      }

      mockApiSuccess([]);
      expect((await notesV1.get('/notes', undefined)).success).toBe(true);
    });

    // The "consecutive" run is only meaningful for SEQUENTIAL traffic: concurrent calls
    // all pass the `retired` gate before any of them settles, so N simultaneous transient
    // 404s would otherwise look exactly like N consecutive ones. A batch that contains
    // even one 200 is proof the surface was alive throughout, so nothing in that batch may
    // latch — and because retirement is permanent and only a restart re-probes, getting it
    // wrong strands a live capability for the whole process lifetime.
    //
    // Both settlement orders are pinned because the two are guarded differently: the
    // in-flight counter covers "success settles last", the generation counter covers
    // "success settles first". A fix for either one alone leaves the other broken.
    //
    // A hand-rolled deferred fetch is used rather than timers so the ORDER is exact.
    function deferredFetch(): Array<(r: Response) => void> {
      const gates: Array<(r: Response) => void> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>((resolve) => gates.push(resolve))),
      );
      return gates;
    }

    it('does not latch when a sibling request is still in flight (success settles last)', async () => {
      const gates = deferredFetch();
      const inFlight = [
        usersV1.get('/users', undefined),
        usersV1.get('/users', undefined),
        usersV1.get('/users', undefined),
        usersV1.get('/users', undefined),
      ];
      await vi.waitFor(() => expect(gates).toHaveLength(4));

      for (let i = 0; i < RETIREMENT_404_THRESHOLD; i++) {
        gates[i](createMockResponse({ status: 404, ok: false, error: 'Not found' }));
      }
      const settled = await Promise.all(inFlight.slice(0, RETIREMENT_404_THRESHOLD));

      // The threshold-hitting caller gets its real 404, NOT a retirement envelope: with a
      // sibling still outstanding the evidence is not yet complete, and telling the caller
      // "Pipedrive removed this" on evidence that is about to be contradicted is wrong even
      // if the latch were retracted a moment later.
      expect(settled.at(-1)?.error?.code).toBe('NOT_FOUND');

      gates[3](createMockResponse({ status: 200, data: [{ id: 1 }] }));
      expect((await inFlight[3]).success).toBe(true);

      mockApiSuccess([{ id: 1 }]);
      expect((await usersV1.get('/users', undefined)).success).toBe(true);
    });

    it('does not latch on 404s issued before a success that settles first', async () => {
      const gates = deferredFetch();
      const inFlight = [
        usersV1.get('/users', undefined),
        usersV1.get('/users', undefined),
        usersV1.get('/users', undefined),
        usersV1.get('/users', undefined),
      ];
      await vi.waitFor(() => expect(gates).toHaveLength(4));

      // The success lands FIRST, so by the time the 404s settle there is no in-flight
      // success left to speak for them. They are stale evidence: every one of them was
      // issued before the surface demonstrably answered.
      gates[3](createMockResponse({ status: 200, data: [{ id: 1 }] }));
      expect((await inFlight[3]).success).toBe(true);

      for (let i = 0; i < RETIREMENT_404_THRESHOLD; i++) {
        gates[i](createMockResponse({ status: 404, ok: false, error: 'Not found' }));
      }
      const settled = await Promise.all(inFlight.slice(0, RETIREMENT_404_THRESHOLD));
      expect(settled.at(-1)?.error?.code).toBe('NOT_FOUND');

      mockApiSuccess([{ id: 1 }]);
      expect((await usersV1.get('/users', undefined)).success).toBe(true);
    });

    it('still latches on concurrent 404s when no request in the batch succeeds', async () => {
      // The guards must not disarm the latch outright: a genuinely retired surface 404s
      // every request, so the last one to settle sees an empty in-flight set and an
      // unchanged generation, and latches exactly as the sequential path does.
      const gates = deferredFetch();
      const inFlight = Array.from({ length: RETIREMENT_404_THRESHOLD }, () =>
        usersV1.get('/users', undefined),
      );
      await vi.waitFor(() => expect(gates).toHaveLength(RETIREMENT_404_THRESHOLD));

      gates.forEach((gate) => gate(createMockResponse({ status: 404, ok: false, error: 'Not found' })));
      const settled = await Promise.all(inFlight);
      expect(settled.at(-1)?.error?.code).toBe('CAPABILITY_RETIRED');

      mockApiSuccess([{ id: 1 }]);
      expect((await usersV1.get('/users', undefined)).error?.code).toBe('CAPABILITY_RETIRED');
    });

    it('a 410-derived retirement is permanent and NOT cleared by an in-flight success', async () => {
      // 410 is the server stating the surface is gone. Unlike the inferred latch that
      // is fact, not evidence, so neither guard applies: it latches on first sighting
      // with siblings still outstanding, and a later success does not reopen it.
      const gates = deferredFetch();
      const inFlight = [usersV1.get('/users', undefined), usersV1.get('/users', undefined)];
      await vi.waitFor(() => expect(gates).toHaveLength(2));

      gates[0](createMockResponse({ status: 410, ok: false, error: 'Gone' }));
      expect((await inFlight[0]).error?.code).toBe('CAPABILITY_RETIRED');

      gates[1](createMockResponse({ status: 200, data: [{ id: 1 }] }));
      await inFlight[1];

      mockApiSuccess([{ id: 1 }]);
      expect((await usersV1.get('/users', undefined)).error?.code).toBe('CAPABILITY_RETIRED');
    });

    it('a write 404 also breaks a read 404 run rather than counting toward it', async () => {
      mockApiError(404, 'Not found');
      for (let i = 0; i < RETIREMENT_404_THRESHOLD - 1; i++) {
        await notesV1.get('/notes', undefined);
      }

      await notesV1.post('/notes', { content: 'x', deal_id: 999 }); // resets the run

      expect((await notesV1.get('/notes', undefined)).error?.code).toBe('NOT_FOUND');
    });

    it('an inferred (404-derived) retirement is worded as a likelihood, not a fact', async () => {
      mockApiError(404, 'Not found');
      for (let i = 0; i < RETIREMENT_404_THRESHOLD - 1; i++) {
        await usersV1.get('/users', undefined);
      }
      const inferred = await usersV1.get('/users', undefined);

      expect(inferred.error?.message).toContain('most likely');
      expect(inferred.error?.suggestion).toContain('restarting the MCP server');
      // The short-circuit on later calls keeps the same softened wording.
      const later = await usersV1.get('/users', undefined);
      expect(later.error?.message).toBe(inferred.error?.message);
    });

    it('a 410 retirement is still asserted as fact, on the first sighting', async () => {
      mockApiError(410, 'Gone');

      const response = await notesV1.get('/notes', undefined);

      expect(response.error?.code).toBe('CAPABILITY_RETIRED');
      expect(response.error?.message).toContain('has been retired by Pipedrive');
      expect(response.error?.message).not.toContain('most likely');
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
      expect(requestBody(options)).toEqual({ foo: 'bar' });
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
