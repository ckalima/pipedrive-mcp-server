/**
 * Caller cancellation through the resilience driver (#164).
 *
 * `ResilienceOverrides.signal` lets a caller tear its own request down. The whole
 * point of the feature is the distinction it draws at the breaker: a per-attempt
 * TIMEOUT is evidence the upstream is sick and must be debited, while a CANCELLATION
 * is a local decision that carries no evidence in either direction and must be
 * debited to nobody.
 *
 * The sharp edge is the half-open probe. An aborted fetch surfaces as a network
 * error, which the classifier reads as "upstream still unhealthy" — so before this
 * fix, cancelling the request that happened to hold the single probe slot re-Opened
 * the breaker and restarted a full cooldown for every caller in the process, on the
 * strength of a decision the process itself made. Skipping the record instead is not
 * an option either: the slot IS the HalfOpen state, so never releasing it wedges the
 * breaker for the process lifetime. Hence "release with no verdict".
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
import { createMockResponse, mockFetch, fixtures, type MockRequestInit } from '../helpers/mockFetch.js';

const trip = { isSuccess: false, isTripSignal: true, isUpstreamUnhealthy: true };

/**
 * A fetch that hangs until its own signal fires, then rejects the way the platform
 * does (an AbortError for a caller abort, a TimeoutError for AbortSignal.timeout).
 *
 * The shared createMockFetch cannot be used here: it resolves immediately and ignores
 * `init.signal` entirely, so no cancellation is observable through it.
 */
function mockFetchHangsUntilAborted(onCall?: () => void) {
  const mockFn = vi.fn((_url: string | URL, init: MockRequestInit): Promise<Response> => {
    onCall?.();
    return new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      if (!signal) {
        reject(new Error('the client is expected to pass an AbortSignal on every request'));
        return;
      }
      if (signal.aborted) {
        reject(signal.reason as Error);
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason as Error));
    });
  });
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

/** A promise plus its resolver, for waiting on "the mock fetch has been entered". */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Opens the breaker at `nowMs` and advances the fake clock past the cooldown. */
function openBreakerAndCoolDown(nowMs: number): number {
  for (let i = 0; i < BREAKER_THRESHOLD; i++) recordOutcome(trip, nowMs);
  expect(getBreakerState()).toBe('Open');
  return nowMs + BREAKER_COOLDOWN_MS;
}

describe('PipedriveClient caller cancellation (#164)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
    // The driver logs every attempt, retry and breaker transition to stderr.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('a mid-flight abort returns REQUEST_CANCELLED, not a network error', async () => {
    const started = deferred();
    mockFetchHangsUntilAborted(started.resolve);
    const controller = new AbortController();
    const client = new PipedriveClient(undefined, {
      maxAttempts: 1,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    const pending = client.get('/deals', undefined, 'v2');
    await started.promise;
    controller.abort();
    const result = await pending;

    // NOT NETWORK_ERROR: nothing went wrong on the wire, and telling an operator to
    // check their connection for a cancellation the process asked for is noise.
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('REQUEST_CANCELLED');
    // Nothing was debited. (A cancellation on the Closed path is a no-op for the
    // breaker either way — network errors are not trip signals — but the state must
    // not have drifted.)
    expect(getBreakerState()).toBe('Closed');
  });

  it('an already-aborted signal issues no request at all', async () => {
    const mockFn = mockFetchHangsUntilAborted();
    const controller = new AbortController();
    controller.abort();
    const client = new PipedriveClient(undefined, {
      maxAttempts: 3,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    const result = await client.get('/deals', undefined, 'v2');

    expect(mockFn).not.toHaveBeenCalled();
    expect(result.error?.code).toBe('REQUEST_CANCELLED');
  });

  it('a cancellation between attempts stops the retry loop without a second request', async () => {
    // 500 on a GET: retryable, so the driver reaches the inter-attempt sleep.
    const mockFn = mockFetch({ status: 500, ok: false, error: 'server error' });
    const controller = new AbortController();
    // resilientSleep is not itself interruptible, so a cancellation that lands during
    // a backoff wait is caught by the pre-gate bail on the next iteration.
    setResilienceSleepForTests(async () => { controller.abort(); });
    const client = new PipedriveClient(undefined, {
      maxAttempts: 3,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    const result = await client.get('/deals', undefined, 'v2');

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result.error?.code).toBe('REQUEST_CANCELLED');
  });

  it('a cancellation while holding the half-open probe slot releases it with no verdict', async () => {
    let mono = 1_000_000;
    setMonotonicClockForTests(() => mono);
    mono = openBreakerAndCoolDown(mono);

    const started = deferred();
    mockFetchHangsUntilAborted(started.resolve);
    const controller = new AbortController();
    const client = new PipedriveClient(undefined, {
      maxAttempts: 1,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    const pending = client.get('/deals', undefined, 'v2');
    await started.promise;
    expect(getBreakerState()).toBe('HalfOpen'); // this request owns the single probe slot

    controller.abort();
    const result = await pending;

    expect(result.error?.code).toBe('REQUEST_CANCELLED');
    // Released, not wedged: the slot is not still held.
    expect(getBreakerState()).toBe('Open');

    // And released with NO verdict: the next caller wins the probe at the very same
    // instant. Pre-fix, the aborted fetch was classified as an unhealthy upstream, the
    // probe re-Opened the breaker with a fresh cooldown, and this request (and every
    // other one for the next minute) fast-failed CIRCUIT_OPEN instead.
    const probeMock = mockFetch({ status: 200, data: fixtures.deal });
    const probe = await new PipedriveClient().get('/deals', undefined, 'v2');

    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(probe.success).toBe(true);
    expect(getBreakerState()).toBe('Closed');
  });

  it('a per-attempt TIMEOUT still debits the breaker when a cancel signal is attached', async () => {
    // The regression guard for the composition itself: the two signals are joined with
    // AbortSignal.any, and the driver tells them apart by reading the caller's signal.
    // Get that read wrong and every timeout in the process stops counting.
    let mono = 1_000_000;
    setMonotonicClockForTests(() => mono);
    mono = openBreakerAndCoolDown(mono);

    mockFetchHangsUntilAborted();
    const controller = new AbortController(); // never fired
    const client = new PipedriveClient(undefined, {
      maxAttempts: 1,
      timeoutMs: 5,
      signal: controller.signal,
    });

    const result = await client.get('/deals', undefined, 'v2');

    expect(controller.signal.aborted).toBe(false);
    expect(result.error?.code).not.toBe('REQUEST_CANCELLED');
    // The probe timed out, so it re-Opens with a cooldown restarted at `mono`.
    expect(getBreakerState()).toBe('Open');
    const second = await new PipedriveClient().get('/deals', undefined, 'v2');
    expect(second.error?.code).toBe('CIRCUIT_OPEN');
  });

  it('a cancellation emits no "Network error" line', async () => {
    // The catch used to render every abort through networkError() before the
    // cancellation exit was reached, so an operator watching stderr saw "Network error:
    // This operation was aborted" for a teardown the process itself ordered.
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string') lines.push(args[0]);
    });
    const started = deferred();
    mockFetchHangsUntilAborted(started.resolve);
    const controller = new AbortController();
    const client = new PipedriveClient(undefined, {
      maxAttempts: 1,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    const pending = client.get('/deals', undefined, 'v2');
    await started.promise;
    controller.abort();
    await pending;

    expect(lines.filter((line) => line.includes('Network error'))).toEqual([]);
    expect(lines.some((line) => line.includes('cancelled by caller'))).toBe(true);
  });

  it('a throwing console.error cannot turn a cancelled probe into a breaker penalty', async () => {
    // Same class as the probe-slot log-throw regression: a host that swaps in a
    // throwing console.error. networkError() logging inside the catch put that throw
    // BEFORE the cancellation exit, so it escaped the try with the probe slot still
    // held, and the `finally` backstop recorded the unhealthy verdict — restoring the
    // exact fresh-cooldown penalty this change removes, in the one host where the
    // repo already treats a throwing logger as real.
    let mono = 1_000_000;
    setMonotonicClockForTests(() => mono);
    mono = openBreakerAndCoolDown(mono);

    const boom = new Error('console.error is unavailable');
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('Network error')) throw boom;
    });

    const started = deferred();
    mockFetchHangsUntilAborted(started.resolve);
    const controller = new AbortController();
    const client = new PipedriveClient(undefined, {
      maxAttempts: 1,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    const pending = client.get('/deals', undefined, 'v2');
    await started.promise;
    expect(getBreakerState()).toBe('HalfOpen');
    controller.abort();

    // No throw escapes, because the line that used to throw is no longer emitted.
    await expect(pending).resolves.toMatchObject({ error: { code: 'REQUEST_CANCELLED' } });
    expect(getBreakerState()).toBe('Open');

    // And still no verdict: the next caller wins the slot at the same instant.
    const probeMock = mockFetch({ status: 200, data: fixtures.deal });
    const probe = await new PipedriveClient().get('/deals', undefined, 'v2');
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(probe.success).toBe(true);
    expect(getBreakerState()).toBe('Closed');
  });

  it('a response that arrived before the abort landed still counts as evidence', async () => {
    // Cancellation only excuses a request the abort actually killed. If the upstream
    // answered first, that answer is real evidence and the breaker is entitled to it.
    const mono = 1_000_000;
    setMonotonicClockForTests(() => mono);
    for (let i = 0; i < BREAKER_THRESHOLD - 1; i++) recordOutcome(trip, mono);
    expect(getBreakerState()).toBe('Closed'); // one signal short of tripping

    const controller = new AbortController();
    const mockFn = vi.fn(async (): Promise<Response> => {
      controller.abort(); // aborted, but the response is already on its way back
      return createMockResponse({ status: 429, ok: false, error: 'rate limited' });
    });
    vi.stubGlobal('fetch', mockFn);
    const client = new PipedriveClient(undefined, {
      maxAttempts: 1,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    const result = await client.get('/deals', undefined, 'v2');

    expect(result.success).toBe(false);
    expect(result.error?.code).not.toBe('REQUEST_CANCELLED');
    // The 429 was recorded: the breaker trips on this attempt.
    expect(getBreakerState()).toBe('Open');
  });
});
