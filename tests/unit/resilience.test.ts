/**
 * Unit tests for the resilient request core (src/resilience.ts).
 *
 * U1 covers the pure, stateless primitives: classifyOutcome (R2/R3/R5/R10),
 * computeBackoffMs (full jitter, KTD5), and parseRetryAfterMs (KTD6). The stateful
 * circuit breaker (U2) is tested in the second half of this file.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyOutcome,
  computeBackoffMs,
  parseRetryAfterMs,
  breakerAllowsRequest,
  recordOutcome,
  getBreakerState,
  resetCircuitBreakerState,
  monotonicNowMs,
  setMonotonicClockForTests,
  resetMonotonicClockForTests,
  circuitOpenError,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  BREAKER_THRESHOLD,
  BREAKER_WINDOW_MS,
  BREAKER_COOLDOWN_MS,
} from '../../src/resilience.js';

const trip = { isSuccess: false, isTripSignal: true };
const ok = { isSuccess: true, isTripSignal: false };
const nonTripFailure = { isSuccess: false, isTripSignal: false };

describe('classifyOutcome (U1)', () => {
  describe('reads (GET)', () => {
    it('429 -> retryable, trip signal', () => {
      expect(classifyOutcome({ method: 'GET', httpStatus: 429, isNetworkError: false }))
        .toEqual({ retryable: true, isTripSignal: true });
    });

    it('503 -> retryable, trip signal', () => {
      expect(classifyOutcome({ method: 'GET', httpStatus: 503, isNetworkError: false }))
        .toEqual({ retryable: true, isTripSignal: true });
    });

    it.each([500, 502, 504])('%d -> retryable, NOT a trip signal', (status) => {
      expect(classifyOutcome({ method: 'GET', httpStatus: status, isNetworkError: false }))
        .toEqual({ retryable: true, isTripSignal: false });
    });

    it('network/timeout -> retryable, NOT a trip signal', () => {
      expect(classifyOutcome({ method: 'GET', isNetworkError: true }))
        .toEqual({ retryable: true, isTripSignal: false });
    });

    it('410 -> not retryable, not a trip signal (R5)', () => {
      expect(classifyOutcome({ method: 'GET', httpStatus: 410, isNetworkError: false }))
        .toEqual({ retryable: false, isTripSignal: false });
    });

    it('404 -> not retryable, not a trip signal', () => {
      expect(classifyOutcome({ method: 'GET', httpStatus: 404, isNetworkError: false }))
        .toEqual({ retryable: false, isTripSignal: false });
    });

    it('2xx -> not retryable, not a trip signal', () => {
      expect(classifyOutcome({ method: 'GET', httpStatus: 200, isNetworkError: false }))
        .toEqual({ retryable: false, isTripSignal: false });
    });
  });

  describe('writes (POST/PATCH/PUT/DELETE)', () => {
    it('429 -> retryable, trip signal', () => {
      expect(classifyOutcome({ method: 'POST', httpStatus: 429, isNetworkError: false }))
        .toEqual({ retryable: true, isTripSignal: true });
    });

    it('503 -> NOT retryable, trip signal (AE1 boundary)', () => {
      expect(classifyOutcome({ method: 'POST', httpStatus: 503, isNetworkError: false }))
        .toEqual({ retryable: false, isTripSignal: true });
    });

    it('500 -> NOT retryable, not a trip signal', () => {
      expect(classifyOutcome({ method: 'POST', httpStatus: 500, isNetworkError: false }))
        .toEqual({ retryable: false, isTripSignal: false });
    });

    it('network/timeout -> NOT retryable, not a trip signal', () => {
      expect(classifyOutcome({ method: 'POST', isNetworkError: true }))
        .toEqual({ retryable: false, isTripSignal: false });
    });

    it.each(['PATCH', 'PUT', 'DELETE'])('%s behaves like POST (429 retryable, 500 not)', (method) => {
      expect(classifyOutcome({ method, httpStatus: 429, isNetworkError: false }))
        .toEqual({ retryable: true, isTripSignal: true });
      expect(classifyOutcome({ method, httpStatus: 500, isNetworkError: false }))
        .toEqual({ retryable: false, isTripSignal: false });
    });
  });
});

describe('computeBackoffMs (U1, KTD5)', () => {
  it('rng=()=>0 yields 0', () => {
    expect(computeBackoffMs(0, () => 0)).toBe(0);
    expect(computeBackoffMs(3, () => 0)).toBe(0);
  });

  it('rng=()=>1 yields min(cap, base*2^n) for indices 0..5', () => {
    for (let n = 0; n <= 5; n++) {
      const expected = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** n);
      expect(computeBackoffMs(n, () => 1)).toBe(expected);
    }
  });

  it('never exceeds BACKOFF_CAP_MS and is non-negative across a range of rng values', () => {
    for (const r of [0, 0.1, 0.5, 0.9, 0.999]) {
      for (let n = 0; n <= 8; n++) {
        const wait = computeBackoffMs(n, () => r);
        expect(wait).toBeGreaterThanOrEqual(0);
        expect(wait).toBeLessThanOrEqual(BACKOFF_CAP_MS);
      }
    }
  });

  it('caps high attempt indices at BACKOFF_CAP_MS', () => {
    // base*2^5 = 16000 > cap 8000, so index 5 is capped.
    expect(computeBackoffMs(5, () => 1)).toBe(BACKOFF_CAP_MS);
  });
});

describe('parseRetryAfterMs (U1, KTD6)', () => {
  const NOW = 1_000_000_000_000; // fixed reference for HTTP-date math

  function headers(init: Record<string, string>): Headers {
    return new Headers(init);
  }

  it('delta-seconds "5" -> 5000', () => {
    expect(parseRetryAfterMs(headers({ 'Retry-After': '5' }), NOW)).toBe(5000);
  });

  it('delta-seconds "0" -> 0', () => {
    expect(parseRetryAfterMs(headers({ 'Retry-After': '0' }), NOW)).toBe(0);
  });

  it('future HTTP-date -> positive delta', () => {
    const future = new Date(NOW + 10_000).toUTCString();
    expect(parseRetryAfterMs(headers({ 'Retry-After': future }), NOW)).toBe(10_000);
  });

  it('past HTTP-date -> clamped to 0', () => {
    const past = new Date(NOW - 60_000).toUTCString();
    expect(parseRetryAfterMs(headers({ 'Retry-After': past }), NOW)).toBe(0);
  });

  it('Retry-After absent + x-ratelimit-reset "3" -> 3000', () => {
    expect(parseRetryAfterMs(headers({ 'x-ratelimit-reset': '3' }), NOW)).toBe(3000);
  });

  it('both absent -> null', () => {
    expect(parseRetryAfterMs(headers({}), NOW)).toBeNull();
  });

  it('unparseable "abc" -> null (falls through, no reset header)', () => {
    expect(parseRetryAfterMs(headers({ 'Retry-After': 'abc' }), NOW)).toBeNull();
  });

  it('unparseable Retry-After falls through to x-ratelimit-reset', () => {
    expect(
      parseRetryAfterMs(headers({ 'Retry-After': 'garbage', 'x-ratelimit-reset': '7' }), NOW),
    ).toBe(7000);
  });

  it('header lookup is case-insensitive', () => {
    expect(parseRetryAfterMs(headers({ 'RETRY-AFTER': '4' }), NOW)).toBe(4000);
  });
});

describe('circuit breaker (U2, KTD7)', () => {
  const T0 = 1_000_000; // fixed wall-clock reference (ms)

  beforeEach(() => {
    resetCircuitBreakerState();
  });

  it('starts Closed and allows requests', () => {
    expect(getBreakerState()).toBe('Closed');
    expect(breakerAllowsRequest(T0)).toBe(true);
  });

  it('stays Closed for THRESHOLD-1 trip signals; the THRESHOLD-th opens it', () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) {
      recordOutcome(trip, T0);
      expect(getBreakerState()).toBe('Closed');
      expect(breakerAllowsRequest(T0)).toBe(true);
    }
    recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Open');
  });

  it('503 records a trip signal identically to 429 (windowed)', () => {
    // Drive the trip with a mix; both 429 and 503 arrive as isTripSignal:true.
    for (let i = 0; i < BREAKER_THRESHOLD; i++) {
      recordOutcome(trip, T0);
    }
    expect(getBreakerState()).toBe('Open');
  });

  it('Open fast-fails within cooldown, then half-opens after the cooldown elapses', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Open');

    // Within cooldown: no request allowed, still Open.
    expect(breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS - 1)).toBe(false);
    expect(getBreakerState()).toBe('Open');

    // Cooldown elapsed: transitions to HalfOpen and hands out one probe slot.
    expect(breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS)).toBe(true);
    expect(getBreakerState()).toBe('HalfOpen');
  });

  it('half-open allows only one concurrent probe', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    expect(breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS)).toBe(true); // probe slot taken
    // A second concurrent caller, before the probe settles, is refused.
    expect(breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS)).toBe(false);
    expect(breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS + 5)).toBe(false);
  });

  it('half-open probe success closes the breaker and clears the window', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS); // -> HalfOpen, probe out
    recordOutcome(ok, T0 + BREAKER_COOLDOWN_MS, true); // the probe owner settles
    expect(getBreakerState()).toBe('Closed');
    // Window is cleared: THRESHOLD-1 fresh trips stay Closed.
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Closed');
  });

  it('half-open probe 429/503 reopens and restarts the cooldown (AE4)', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    const halfOpenAt = T0 + BREAKER_COOLDOWN_MS;
    breakerAllowsRequest(halfOpenAt); // -> HalfOpen
    recordOutcome(trip, halfOpenAt, true); // probe is itself a trip -> reopen
    expect(getBreakerState()).toBe('Open');
    // Cooldown restarts from halfOpenAt, not T0.
    expect(breakerAllowsRequest(halfOpenAt + BREAKER_COOLDOWN_MS - 1)).toBe(false);
    expect(breakerAllowsRequest(halfOpenAt + BREAKER_COOLDOWN_MS)).toBe(true);
    expect(getBreakerState()).toBe('HalfOpen');
  });

  it.each([
    ['a 500 (non-trip failure)', nonTripFailure],
    ['a network error/timeout', nonTripFailure],
  ])('half-open probe failure via %s reopens, releases the slot, and is allowed after a fresh cooldown', (_label, outcome) => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    const halfOpenAt = T0 + BREAKER_COOLDOWN_MS;
    breakerAllowsRequest(halfOpenAt); // -> HalfOpen
    recordOutcome(outcome, halfOpenAt, true); // probe non-success reopens
    expect(getBreakerState()).toBe('Open');
    // Slot released: after a fresh cooldown a new probe is handed out.
    expect(breakerAllowsRequest(halfOpenAt + BREAKER_COOLDOWN_MS)).toBe(true);
    expect(getBreakerState()).toBe('HalfOpen');
  });

  it('a concurrent non-probe completion during HalfOpen does NOT advance the breaker (owner-scoped)', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    const halfOpenAt = T0 + BREAKER_COOLDOWN_MS;
    breakerAllowsRequest(halfOpenAt); // probe owner claims the slot -> HalfOpen

    // A straggler request (passed the Closed gate before the breaker opened) only
    // settles now, during the probe window. With isProbe=false it must be a no-op:
    // neither a straggler success nor a straggler failure may hijack the verdict.
    recordOutcome(ok, halfOpenAt, false);
    expect(getBreakerState()).toBe('HalfOpen'); // success did NOT close it
    recordOutcome(trip, halfOpenAt, false);
    expect(getBreakerState()).toBe('HalfOpen'); // failure did NOT reopen it
    expect(breakerAllowsRequest(halfOpenAt)).toBe(false); // slot still held by the probe

    // The probe owner alone settles the half-open decision.
    recordOutcome(ok, halfOpenAt, true);
    expect(getBreakerState()).toBe('Closed');
  });

  it('an interleaved success does NOT reset progress toward tripping (windowed; #123)', () => {
    // The concurrency fix: a success from a concurrent healthy request is a no-op
    // while Closed, so it cannot zero progress mid-storm. Under the old consecutive
    // counter this reset to 0 and the final trip would have left it Closed.
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Closed');
    recordOutcome(ok, T0); // interleaved success — no-op under the window
    recordOutcome(trip, T0); // the THRESHOLD-th trip signal still opens the breaker
    expect(getBreakerState()).toBe('Open');
  });

  it('an interleaved non-trip failure (e.g. validation error) also does NOT reset progress (windowed; #123)', () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    recordOutcome(nonTripFailure, T0); // e.g. a 500 / 4xx validation error — no-op under the window
    recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Open');
  });

  it('opens when THRESHOLD trip signals fall within the window, spanning real time (R2, runaway loop)', () => {
    // Signals spread across the window (not all at one instant) still trip at THRESHOLD,
    // so the runaway-single-endpoint case trips at the same signal budget as before.
    const span = BREAKER_WINDOW_MS - 1;
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) {
      recordOutcome(trip, T0 + Math.floor((span * i) / BREAKER_THRESHOLD));
      expect(getBreakerState()).toBe('Closed');
    }
    recordOutcome(trip, T0 + span); // THRESHOLD-th, still inside the window
    expect(getBreakerState()).toBe('Open');
  });

  it('ages out trip signals older than the window so they do not accumulate', () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    // A trip just past the window evicts every T0 signal; only it remains in-window.
    recordOutcome(trip, T0 + BREAKER_WINDOW_MS + 1);
    expect(getBreakerState()).toBe('Closed');
  });

  it('isolated 429s spaced beyond the window never accumulate to a trip', () => {
    // Each trip is more than a window apart, so each eviction pass clears the prior
    // one and the in-window count never exceeds 1 — no trip even across many signals.
    for (let i = 0; i < 10; i++) {
      recordOutcome(trip, T0 + i * (BREAKER_WINDOW_MS + 1));
      expect(getBreakerState()).toBe('Closed');
    }
  });

  it('counts only in-window signals across partial eviction (sub-threshold burst, gap, re-accumulate)', () => {
    // A sub-threshold burst that fully ages out must not contribute to a later burst:
    // the fresh burst trips on its OWN count, proving eviction counts in-window signals
    // rather than a running total of every trip ever seen.
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Closed');
    const t1 = T0 + BREAKER_WINDOW_MS + 1; // first batch is now fully aged out
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) {
      recordOutcome(trip, t1);
      expect(getBreakerState()).toBe('Closed'); // fresh burst alone is still below threshold
    }
    recordOutcome(trip, t1); // THRESHOLD-th fresh signal opens it (the aged-out batch did not count)
    expect(getBreakerState()).toBe('Open');
  });

  it('counts a signal at exactly the trailing window edge (inclusive boundary)', () => {
    // The trailing edge is inclusive: a signal at T0 still counts when a later signal
    // arrives at exactly T0 + BREAKER_WINDOW_MS (age == window). Paired with the
    // "ages out" test above (age > window evicts), this pins the >= boundary intentionally.
    recordOutcome(trip, T0);
    for (let i = 0; i < BREAKER_THRESHOLD - 2; i++) recordOutcome(trip, T0 + 1);
    expect(getBreakerState()).toBe('Closed'); // THRESHOLD-1 signals so far
    recordOutcome(trip, T0 + BREAKER_WINDOW_MS); // T0 is exactly at the edge, still counted
    expect(getBreakerState()).toBe('Open');
  });

  it('a trip signal while Open is a defensive no-op (does not append or restart cooldown)', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Open');
    // A late straggler trip arriving while Open must not touch breaker state.
    recordOutcome(trip, T0 + 5);
    expect(getBreakerState()).toBe('Open');
    // Cooldown is still measured from the original open (T0), not restarted: the
    // probe is handed out exactly at T0 + cooldown, proving openedAtMs was untouched.
    expect(breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS)).toBe(true);
    expect(getBreakerState()).toBe('HalfOpen');
  });

  it('resetCircuitBreakerState returns to Closed with the window cleared', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Open');
    resetCircuitBreakerState();
    expect(getBreakerState()).toBe('Closed');
    expect(breakerAllowsRequest(T0)).toBe(true);
    // Window cleared: a fresh THRESHOLD-1 burst stays Closed (no carryover count).
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Closed');
  });
});

describe('monotonic clock seam (U2, #133)', () => {
  it('default monotonicNowMs() is finite and non-decreasing across calls', () => {
    const a = monotonicNowMs();
    const b = monotonicNowMs();
    expect(Number.isFinite(a)).toBe(true);
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it('setMonotonicClockForTests overrides the source; reset restores the real clock', () => {
    // Capture the real clock before overriding so the reset assertion compares against an
    // actual reading rather than a magic constant tied to process uptime.
    const beforeOverride = monotonicNowMs();

    setMonotonicClockForTests(() => 42);
    expect(monotonicNowMs()).toBe(42);
    expect(monotonicNowMs()).toBe(42); // pinned, not advancing

    resetMonotonicClockForTests();
    // Back to the real performance.now()-backed source: no longer pinned to 42, and
    // non-decreasing relative to the pre-override reading (monotonic).
    const afterReset = monotonicNowMs();
    expect(afterReset).not.toBe(42);
    expect(afterReset).toBeGreaterThanOrEqual(beforeOverride);
  });
});

describe('circuitOpenError (U2, R11)', () => {
  it('returns the CIRCUIT_OPEN code, never RATE_LIMITED', () => {
    const err = circuitOpenError();
    expect(err.code).toBe('CIRCUIT_OPEN');
    expect(err.code).not.toBe('RATE_LIMITED');
  });

  it('has fixed, server-authored message and suggestion with no interpolated runtime/token value', () => {
    const err = circuitOpenError();
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.suggestion).toBeTruthy();
    // Identical across calls -> nothing runtime-derived is interpolated.
    expect(circuitOpenError()).toEqual(err);
    // No token-like value leaks into the static strings.
    const blob = `${err.message} ${err.suggestion}`;
    expect(blob).not.toMatch(/api_token/i);
    expect(blob).not.toMatch(/[a-f0-9]{40}/i);
  });
});
