/**
 * Regression test for the P0-1 RESIDUAL: a throw in the gate-to-`try` gap wedges the
 * breaker HalfOpen (2026-07 review, found 2026-07-22 while re-verifying the P0-1 fix).
 *
 * The original P0-1 fix moved the elapsed-budget bail above the breaker gate and added
 * a `finally` that settles an unrecorded probe as a failure. But the `finally` only
 * guards the region from the `try` onward, and `breakerAllowsRequest()` claims the
 * single half-open probe slot BEFORE it, so any statement between the two escapes the
 * guarantee. `logBreakerTransition(...)` sat in exactly that gap, and it is a no-op on
 * every transition EXCEPT the one the gate itself produces (Open -> HalfOpen, i.e. the
 * slot claim). The single case where it did real work was the single case where a throw
 * was unrecoverable: the slot stayed held, the breaker sat HalfOpen for the process
 * lifetime, and every later call fast-failed CIRCUIT_OPEN.
 *
 * The fix logs that transition as the first statement INSIDE the `try`, so the `finally`
 * settles the probe even when logging throws. The trigger is narrow in production
 * (Node's global console sets `_ignoreErrors`, so stderr EPIPE does not propagate; it
 * needs a host that swaps in a throwing `console.error`, or `redactSecrets` throwing),
 * but the failure mode is process-wide and permanent, which is what earns a pinned test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipedriveClient } from '../../src/client.js';
import {
  getBreakerState,
  recordOutcome,
  setMonotonicClockForTests,
  BREAKER_THRESHOLD,
  BREAKER_COOLDOWN_MS,
} from '../../src/resilience.js';
import { setupValidEnv } from '../helpers/mockEnv.js';
import { mockFetch, fixtures } from '../helpers/mockFetch.js';

/** Drives the breaker Open at t=0 on the controlled clock. */
function tripBreakerOpen(): void {
  for (let i = 0; i < BREAKER_THRESHOLD; i++) {
    recordOutcome({ isSuccess: false, isTripSignal: true, isUpstreamUnhealthy: true }, 0);
  }
  expect(getBreakerState()).toBe('Open');
}

describe('PipedriveClient circuit breaker: a throwing transition log cannot wedge the probe slot (review P0-1 residual)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  it('settles the probe when the Open -> HalfOpen transition log throws', async () => {
    let mono = 0;
    setMonotonicClockForTests(() => mono);
    tripBreakerOpen();

    // Past the cooldown: the next request wins the probe slot at the gate, which is
    // the sole transition `logBreakerTransition` actually reports.
    mono = BREAKER_COOLDOWN_MS + 1;

    // A host that swapped in a throwing console.error (the realistic trigger; a
    // throwing redactSecrets lands in the same gap). Scoped to the breaker line so an
    // unrelated log cannot satisfy the test.
    const boom = new Error('console.error is unavailable');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('circuit breaker Open -> HalfOpen')) {
        throw boom;
      }
    });

    // fetch must never be reached: the throw happens before the attempt.
    const fetchMock = mockFetch({ status: 200, data: fixtures.deal });

    const client = new PipedriveClient();
    await expect(client.get('/deals', undefined, 'v2')).rejects.toThrow(boom);
    expect(fetchMock).not.toHaveBeenCalled();

    // The probe was settled on the way out, as a failure, since a request that never
    // reached the upstream is no evidence of recovery. Pre-fix the log ran OUTSIDE the
    // try, so the slot stayed claimed and this read was 'HalfOpen' forever.
    expect(getBreakerState()).toBe('Open');
    consoleSpy.mockRestore();

    // ...and the wedge assertion the state read alone does not prove: a HalfOpen slot
    // held by nobody refuses every subsequent caller. Before the fresh cooldown elapses
    // this is a legitimate fast-fail...
    const duringCooldown = await client.get('/deals', undefined, 'v2');
    expect(duringCooldown.success).toBe(false);
    expect(duringCooldown.error?.code).toBe('CIRCUIT_OPEN');
    expect(fetchMock).not.toHaveBeenCalled();

    // ...and once it does, the breaker recovers normally. Pre-fix, no amount of waiting
    // helped: HalfOpen has no cooldown to elapse, so every later call fast-failed.
    mono = BREAKER_COOLDOWN_MS + 1 + BREAKER_COOLDOWN_MS + 1;
    const recovered = await client.get('/deals', undefined, 'v2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recovered.success).toBe(true);
    expect(getBreakerState()).toBe('Closed');
  });

  it('a gate refusal logs no transition, so it cannot throw in the gap at all', async () => {
    let mono = 0;
    setMonotonicClockForTests(() => mono);
    tripBreakerOpen();

    // Still inside the cooldown: the gate refuses. A refusal is state-neutral
    // (Open -> Open), so there is no transition to report and the fast-fail path
    // never calls the transition logger.
    mono = BREAKER_COOLDOWN_MS - 1;

    const transitionLines: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('circuit breaker')) {
        transitionLines.push(args[0]);
      }
    });

    const client = new PipedriveClient();
    const result = await client.get('/deals', undefined, 'v2');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CIRCUIT_OPEN');
    expect(transitionLines).toEqual([]);
    expect(getBreakerState()).toBe('Open');
    consoleSpy.mockRestore();
  });
});
