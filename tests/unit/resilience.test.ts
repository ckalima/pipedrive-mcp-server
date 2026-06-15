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
  circuitOpenError,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  BREAKER_THRESHOLD,
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

  it('503 increments the counter identically to 429', () => {
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

  it('half-open probe success closes the breaker and zeroes the counter', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    breakerAllowsRequest(T0 + BREAKER_COOLDOWN_MS); // -> HalfOpen, probe out
    recordOutcome(ok, T0 + BREAKER_COOLDOWN_MS, true); // the probe owner settles
    expect(getBreakerState()).toBe('Closed');
    // Counter is zeroed: THRESHOLD-1 fresh trips stay Closed.
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

  it('a success resets the consecutive counter (THRESHOLD-1, success, THRESHOLD-1 -> still Closed)', () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    recordOutcome(ok, T0);
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Closed');
  });

  it('a non-trip failure (e.g. validation error) also resets the consecutive counter', () => {
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    recordOutcome(nonTripFailure, T0);
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Closed');
  });

  it('resetCircuitBreakerState returns to Closed with a zeroed counter', () => {
    for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, T0);
    expect(getBreakerState()).toBe('Open');
    resetCircuitBreakerState();
    expect(getBreakerState()).toBe('Closed');
    expect(breakerAllowsRequest(T0)).toBe(true);
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
