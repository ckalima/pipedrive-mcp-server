/**
 * Unit tests for the resilient request core (src/resilience.ts).
 *
 * U1 covers the pure, stateless primitives: classifyOutcome (R2/R3/R5/R10),
 * computeBackoffMs (full jitter, KTD5), and parseRetryAfterMs (KTD6). The stateful
 * circuit breaker (U2) is tested in the second half of this file.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyOutcome,
  computeBackoffMs,
  parseRetryAfterMs,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
} from '../../src/resilience.js';

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
