/**
 * Integration tests for the circuit breaker's monotonic-clock behavior (#133).
 *
 * These exercise the real async client path to prove that wall-clock (Date.now) steps
 * do not affect the breaker, which now keys its window/cooldown arithmetic on the
 * monotonic clock seam (monotonicNowMs / performance.now) rather than Date.now. Extracted
 * from tests/integration/client.test.ts to keep that file under the size threshold.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipedriveClient } from '../../src/client.js';
import {
  getBreakerState,
  setMonotonicClockForTests,
  BREAKER_THRESHOLD,
  BREAKER_WINDOW_MS,
  BREAKER_COOLDOWN_MS,
} from '../../src/resilience.js';
import { setupValidEnv } from '../helpers/mockEnv.js';
import { mockFetch, mockApiError, fixtures } from '../helpers/mockFetch.js';

describe('PipedriveClient circuit breaker — monotonic clock (#133)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  it('a forward Date.now jump > window mid-storm still trips the breaker (R1)', async () => {
    // Monotonic clock advances by 1ms per breaker call, so every trip lands well within
    // BREAKER_WINDOW_MS regardless of wall-clock movement.
    let mono = 0;
    setMonotonicClockForTests(() => (mono += 1));

    // Hostile wall-clock: Date.now is pinned 10 windows in the future for the whole storm.
    // Under the old code (breaker keyed on Date.now) a forward step advanced the eviction
    // cutoff past the still-recent signals and the breaker failed to open; on the monotonic
    // clock it is inert, so the storm still trips. A constant jumped value (captured before
    // spying) proves the jump is irrelevant without coupling to how many times Date.now is read.
    const base = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(base + 10 * BREAKER_WINDOW_MS);

    mockApiError(503, 'unavailable'); // POST+503 is a single-attempt trip signal
    const client = new PipedriveClient();
    for (let i = 0; i < BREAKER_THRESHOLD; i++) await client.post('/deals', { title: 'x' }, 'v2');

    expect(getBreakerState()).toBe('Open');

    const afterOpen = vi.fn();
    vi.stubGlobal('fetch', afterOpen);
    const response = await client.get('/deals', undefined, 'v2');
    expect(response.error?.code).toBe('CIRCUIT_OPEN'); // not RATE_LIMITED
    expect(afterOpen).not.toHaveBeenCalled();
  });

  it('signals spread > window on the monotonic clock age out even while Date.now is held constant (R1 converse)', async () => {
    // The converse guard: advance the monotonic clock by more than a window between trips,
    // so each eviction clears the prior signal and the count never reaches the threshold —
    // even though Date.now is pinned (which, if the breaker still read it, would keep every
    // signal in-window and trip). Staying Closed proves the breaker keys off the monotonic
    // clock, not the wall-clock.
    let mono = 0;
    setMonotonicClockForTests(() => (mono += BREAKER_WINDOW_MS + 1));
    const base = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(base);

    mockApiError(503, 'unavailable');
    const client = new PipedriveClient();
    for (let i = 0; i < BREAKER_THRESHOLD + 3; i++) {
      await client.post('/deals', { title: 'x' }, 'v2');
      expect(getBreakerState()).toBe('Closed');
    }
  });

  it('cooldown keys off the monotonic clock, not the wall-clock (R2)', async () => {
    let mono = 0;
    setMonotonicClockForTests(() => mono);

    // Open the breaker with five trip signals at monotonic t=0 (openedAtMs = 0).
    mockApiError(503, 'unavailable');
    const client = new PipedriveClient();
    for (let i = 0; i < BREAKER_THRESHOLD; i++) await client.post('/deals', { title: 'x' }, 'v2');
    expect(getBreakerState()).toBe('Open');

    // Capture a real wall-clock base, then make Date.now hostile via fixed jumps from it.
    const base = Date.now();

    // A large FORWARD wall-clock jump must NOT prematurely end the cooldown: within the
    // cooldown on the monotonic clock, the next call still fast-fails with no request.
    vi.spyOn(Date, 'now').mockReturnValue(base + 100 * BREAKER_COOLDOWN_MS);
    mono = BREAKER_COOLDOWN_MS - 1;
    const beforeCooldown = vi.fn();
    vi.stubGlobal('fetch', beforeCooldown);
    const stillOpen = await client.get('/deals', undefined, 'v2');
    expect(stillOpen.error?.code).toBe('CIRCUIT_OPEN');
    expect(beforeCooldown).not.toHaveBeenCalled();
    expect(getBreakerState()).toBe('Open');

    // A large BACKWARD wall-clock step must NOT delay the cooldown: at the cooldown on the
    // monotonic clock, the next call is handed the single probe slot and issues one request.
    vi.spyOn(Date, 'now').mockReturnValue(base - 100 * BREAKER_COOLDOWN_MS);
    mono = BREAKER_COOLDOWN_MS;
    const probeMock = mockApiError(503, 'unavailable');
    const probe = await client.get('/deals', undefined, 'v2');
    expect(probeMock).toHaveBeenCalledTimes(1); // probe ran — cooldown elapsed on the monotonic clock
    expect(probe.success).toBe(false); // probe got a 503 back (its own rendered error, not CIRCUIT_OPEN)
    expect(getBreakerState()).toBe('Open'); // probe failure reopens
  });

  it('a half-open probe success closes the breaker under the monotonic clock (R3 probe-success path)', async () => {
    // Companion to the R2 probe-failure case: the Open -> HalfOpen -> Closed transition is
    // only covered at the pure-function level in resilience.test.ts; prove it on the real
    // client path under the monotonic clock too.
    let mono = 0;
    setMonotonicClockForTests(() => mono);

    mockApiError(503, 'unavailable');
    const client = new PipedriveClient();
    for (let i = 0; i < BREAKER_THRESHOLD; i++) await client.post('/deals', { title: 'x' }, 'v2');
    expect(getBreakerState()).toBe('Open');

    // At the cooldown on the monotonic clock, the next GET is the single probe; a 200 closes it.
    mono = BREAKER_COOLDOWN_MS;
    const probeMock = mockFetch({ status: 200, data: fixtures.deal });
    const probe = await client.get('/deals', undefined, 'v2');
    expect(probeMock).toHaveBeenCalledTimes(1); // probe ran exactly once (retry disabled)
    expect(probe.success).toBe(true);
    expect(getBreakerState()).toBe('Closed'); // probe success closes and clears the window
  });
});
