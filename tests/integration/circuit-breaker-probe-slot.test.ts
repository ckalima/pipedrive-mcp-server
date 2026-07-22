/**
 * Regression test for the half-open probe-slot leak (2026-07 review P0-1).
 *
 * The retry loop's elapsed-budget bail used to run AFTER the breaker gate. When a
 * request's retries outlived the breaker cooldown (breaker opened by concurrent
 * traffic mid-request, then a long stall — event-loop lag, VM suspend — carried
 * real elapsed time past both the cooldown and the retry budget), the gate handed
 * that request the single half-open probe slot and the budget bail returned
 * without recordOutcome. The slot never released: the breaker sat HalfOpen for
 * the process lifetime and every later call fast-failed CIRCUIT_OPEN.
 *
 * The fix moves the budget bail above the gate (slot-neutral) and adds a finally
 * backstop that settles an unrecorded probe as a failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipedriveClient } from '../../src/client.js';
import {
  getBreakerState,
  recordOutcome,
  setMonotonicClockForTests,
  setResilienceSleepForTests,
  BREAKER_THRESHOLD,
  BREAKER_COOLDOWN_MS,
} from '../../src/resilience.js';
import { setupValidEnv } from '../helpers/mockEnv.js';
import { mockFetch, mockApiError, fixtures } from '../helpers/mockFetch.js';

describe('PipedriveClient circuit breaker — probe slot vs budget exhaustion (review P0-1)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  it('an elapsed-budget bail cannot strand the breaker HalfOpen', async () => {
    let mono = 0;
    setMonotonicClockForTests(() => mono);

    // GET + 500: read-retryable but NOT a trip signal — sets lastFailure without
    // touching the breaker, so the retry loop reaches the inter-attempt sleep.
    mockApiError(500, 'server error');

    // During this request's backoff sleep, simulate (a) concurrent traffic that
    // trips the breaker Open, and (b) a stall that pushes real elapsed time past
    // BOTH the breaker cooldown and the retry budget before the next iteration.
    setResilienceSleepForTests(async () => {
      for (let i = 0; i < BREAKER_THRESHOLD; i++) {
        recordOutcome({ isSuccess: false, isTripSignal: true }, 1_000);
      }
      expect(getBreakerState()).toBe('Open');
      mono = 1_000 + BREAKER_COOLDOWN_MS + 10_000;
    });

    const client = new PipedriveClient();
    const result = await client.get('/deals', undefined, 'v2');

    // The request gave up with its own failure (not a breaker fast-fail)...
    expect(result.success).toBe(false);
    expect(result.error?.code).not.toBe('CIRCUIT_OPEN');

    // ...and did NOT claim the probe slot on its way out. Pre-fix, the gate ran
    // before the budget bail: the breaker moved to HalfOpen, recordOutcome never
    // ran, and the process was wedged fast-failing CIRCUIT_OPEN forever.
    expect(getBreakerState()).toBe('Open');

    // Recovery proof: the next request wins the probe slot and closes the breaker.
    const probeMock = mockFetch({ status: 200, data: fixtures.deal });
    const probe = await client.get('/deals', undefined, 'v2');
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(probe.success).toBe(true);
    expect(getBreakerState()).toBe('Closed');
  });
});
