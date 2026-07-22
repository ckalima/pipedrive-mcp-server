/**
 * Integration tests for the half-open probe verdict on a BENIGN status-bearing
 * failure (404/400/403/410).
 *
 * The probe asks "is the upstream answering again?", not "did this request
 * succeed?". Re-opening on any non-2xx meant a routine 404 — an agent re-polling a
 * deleted record, the single most common shape of repeated traffic — re-opened the
 * breaker on every probe: each cooldown produced one 404, the breaker re-opened, and
 * the process livelocked out of a perfectly healthy API for its whole lifetime.
 * Only isUpstreamUnhealthy outcomes (429/503/5xx/network/timeout) may re-open it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipedriveClient } from '../../src/client.js';
import {
  getBreakerState,
  setMonotonicClockForTests,
  BREAKER_THRESHOLD,
  BREAKER_COOLDOWN_MS,
} from '../../src/resilience.js';
import { setupValidEnv } from '../helpers/mockEnv.js';
import { mockFetch, mockApiError, fixtures } from '../helpers/mockFetch.js';

/** Trips the breaker Open with THRESHOLD single-attempt POST 503s at monotonic t=0. */
async function openBreaker(client: PipedriveClient): Promise<void> {
  mockApiError(503, 'unavailable');
  for (let i = 0; i < BREAKER_THRESHOLD; i++) await client.post('/deals', { title: 'x' }, 'v2');
  expect(getBreakerState()).toBe('Open');
}

describe('PipedriveClient circuit breaker — benign 4xx probe', () => {
  let mono = 0;

  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
    mono = 0;
    setMonotonicClockForTests(() => mono);
  });

  it.each([
    ['404 not found', 404],
    ['400 validation error', 400],
    ['403 forbidden', 403],
  ])('a probe that gets a %s closes the breaker — the upstream answered', async (_label, status) => {
    const client = new PipedriveClient();
    await openBreaker(client);

    mono = BREAKER_COOLDOWN_MS;
    const probeMock = mockApiError(status, 'nope');
    const probe = await client.get('/deals/999', undefined, 'v2');

    expect(probeMock).toHaveBeenCalledTimes(1); // one attempt: retry is disabled for a probe
    expect(probe.success).toBe(false); // the caller still gets its own 4xx back...
    expect(probe.error?.code).not.toBe('CIRCUIT_OPEN');
    expect(getBreakerState()).toBe('Closed'); // ...but the breaker treats it as recovery
  });

  it('repeated 404s against a deleted record do not livelock the breaker', async () => {
    const client = new PipedriveClient();
    await openBreaker(client);

    // The probe 404s, closing the breaker; the NEXT call must go straight through
    // rather than fast-failing behind a fresh cooldown. Pre-fix this loop re-opened
    // on every probe and every non-probe call returned CIRCUIT_OPEN forever.
    mono = BREAKER_COOLDOWN_MS;
    const notFound = mockApiError(404, 'not found');
    await client.get('/deals/999', undefined, 'v2');
    expect(notFound).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) {
      const again = await client.get('/deals/999', undefined, 'v2');
      expect(again.error?.code).not.toBe('CIRCUIT_OPEN');
      expect(getBreakerState()).toBe('Closed');
    }
    expect(notFound).toHaveBeenCalledTimes(4); // every call reached the upstream

    // And a real success still works, with no cooldown in the way.
    mockFetch({ status: 200, data: fixtures.deal });
    expect((await client.get('/deals/1', undefined, 'v2')).success).toBe(true);
  });

  it('an unhealthy probe (5xx) still reopens the breaker', async () => {
    const client = new PipedriveClient();
    await openBreaker(client);

    mono = BREAKER_COOLDOWN_MS;
    const probeMock = mockApiError(500, 'server error');
    await client.get('/deals', undefined, 'v2');

    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(getBreakerState()).toBe('Open');

    // Cooldown restarts: the very next call fast-fails without a request.
    const afterReopen = vi.fn();
    vi.stubGlobal('fetch', afterReopen);
    const blocked = await client.get('/deals', undefined, 'v2');
    expect(blocked.error?.code).toBe('CIRCUIT_OPEN');
    expect(afterReopen).not.toHaveBeenCalled();
  });
});
