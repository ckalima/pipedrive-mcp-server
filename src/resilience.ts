/**
 * Resilient request core: retry classification, bounded backoff with jitter,
 * `Retry-After` parsing, and a per-process circuit breaker.
 *
 * This module holds the *testable* resilience logic so the client (`src/client.ts`)
 * stays a pure transport. The client owns the retry loop and the `fetch`; this
 * module supplies the pure decision primitives (U1) and the stateful breaker (U2),
 * mirroring how `version-routing.ts` separates routing state from transport (KTD1).
 *
 * It never imports `client.ts` (no cycle): the client imports from here. The only
 * dependency is `errors.ts` for the shared error-response shape.
 */

import { createErrorResponse, type ErrorResponse } from "./utils/errors.js";

// ─── Tuning constants (KTD4) ──────────────────────────────────────────────────
// Hardcoded, centralized expert knobs — NOT env vars. If mis-set they reintroduce
// the stall / quota-exhaustion failure this work prevents, so they are not exposed
// to end users. Style mirrors REQUEST_TIMEOUT_MS (client.ts) / BACKOFF_DELAYS_MS
// (leads.ts). Promoting any single knob to a config.ts accessor later stays local.

/** Total attempts per logical request: 1 initial + 3 retries. */
export const RETRY_MAX_ATTEMPTS = 4;
/**
 * Master limiter on *added* wall-clock (inter-attempt waits plus retry-attempt
 * durations). The initial attempt is bounded separately by REQUEST_TIMEOUT_MS, so
 * the all-timeout read path is bounded at roughly REQUEST_TIMEOUT_MS + this (~60s).
 */
export const RETRY_BUDGET_MS = 30_000;
/** Exponential backoff base: wait ceiling for retry index 0. */
export const BACKOFF_BASE_MS = 500;
/** Cap on any single computed backoff wait. */
export const BACKOFF_CAP_MS = 8_000;
/** Cap on any single honored `Retry-After` / `x-ratelimit-reset` wait. */
export const RETRY_AFTER_CAP_MS = 20_000;
/** Trip signals (429 / 503) within BREAKER_WINDOW_MS that open the breaker. */
export const BREAKER_THRESHOLD = 5;
/**
 * Sliding window over which BREAKER_THRESHOLD trip signals open the breaker.
 * Counting within a window (rather than requiring strictly-consecutive signals)
 * makes the breaker robust to concurrent in-flight calls: an interleaved success
 * from a healthy concurrent request can no longer zero progress mid-storm (#123).
 * 30s comfortably exceeds a dense storm's timescale (it aligns with RETRY_BUDGET_MS,
 * roughly one logical request's retry lifetime) while still aging out the minutes-
 * apart spacing of isolated 429s under healthy traffic, so they never accumulate.
 */
export const BREAKER_WINDOW_MS = 30_000;
/** How long the breaker stays Open before allowing a single half-open probe. */
export const BREAKER_COOLDOWN_MS = 60_000;

// ─── Outcome classifier (R2, R3, R5, R10) ─────────────────────────────────────

/** The shape the client hands the classifier after an attempt settles. */
export interface AttemptOutcome {
  /** HTTP method — read (GET) vs write (POST/PATCH/PUT/DELETE) drives R2/R3. */
  method: string;
  /** HTTP status from the response, or undefined on a network/timeout failure. */
  httpStatus?: number;
  /** True when the attempt threw (network error or AbortSignal timeout). */
  isNetworkError: boolean;
}

/** Classifier verdict consumed by the retry loop and the breaker. */
export interface OutcomeClass {
  /** Whether this failure is eligible for another attempt (method-aware). */
  retryable: boolean;
  /** Whether this counts toward the breaker trip threshold (429 / 503 only). */
  isTripSignal: boolean;
}

/** Reads (GET) retry on any transient failure; writes retry on 429 only. */
function isRead(method: string): boolean {
  return method.toUpperCase() === "GET";
}

/**
 * Encodes the R2/R3/R5/R10 retry-and-trip table:
 *
 *   429            -> retryable for ANY method, trip signal
 *   503            -> retryable for reads only, trip signal
 *   other 5xx      -> retryable for reads only, NOT a trip signal
 *   network/timeout-> retryable for reads only, NOT a trip signal
 *   410, other 4xx -> not retryable, not a trip signal (R5: immediate return)
 *   2xx/3xx        -> not retryable (caller treats 2xx as success)
 *
 * Writes never retry on network, timeout, or any 5xx (including 503) because the
 * write may have landed and the response been lost (KTD2) — only a 429 is a safe,
 * pre-processing rejection.
 */
export function classifyOutcome(outcome: AttemptOutcome): OutcomeClass {
  const read = isRead(outcome.method);

  if (outcome.isNetworkError) {
    return { retryable: read, isTripSignal: false };
  }

  const status = outcome.httpStatus;

  if (status === 429) {
    return { retryable: true, isTripSignal: true };
  }
  if (status === 503) {
    return { retryable: read, isTripSignal: true };
  }
  if (status !== undefined && status >= 500) {
    // 500 / 501 / 502 / 504 / ... : transient for reads, never a trip signal.
    return { retryable: read, isTripSignal: false };
  }

  // 2xx / 3xx / 410 / other 4xx: non-transient, returned immediately (R5).
  return { retryable: false, isTripSignal: false };
}

// ─── Backoff (KTD5: full jitter) ──────────────────────────────────────────────

/** A source of randomness in [0, 1). Injectable so unit tests can pin it. */
export type Rng = () => number;

/**
 * Full-jitter exponential backoff:
 *   wait = random(0, min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2^attemptIndex))
 *
 * `attemptIndex` is the 0-based index of the attempt that just failed (so the
 * first retry uses index 0 -> ceiling BACKOFF_BASE_MS). Full jitter is the
 * simplest correct choice for a single-process server. The rng defaults to
 * Math.random in production and is injected in tests for determinism.
 */
export function computeBackoffMs(attemptIndex: number, rng: Rng = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attemptIndex);
  const wait = Math.floor(rng() * ceiling);
  return wait < 0 ? 0 : wait;
}

// ─── Retry-After parsing (KTD6) ───────────────────────────────────────────────

/** True for a non-negative integer string (delta-seconds form). */
function isNonNegativeInt(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Parses a server-supplied retry hint into milliseconds, defensively, with the
 * KTD6 fallback chain:
 *
 *   1. `Retry-After` as delta-seconds (RFC 7231), e.g. "5" -> 5000.
 *   2. `Retry-After` as an HTTP-date, e.g. "Wed, 21 Oct 2026 07:28:00 GMT".
 *      Any negative (clock-skew / past-date) result is clamped to 0.
 *   3. When `Retry-After` is absent or unparseable, `x-ratelimit-reset` (seconds):
 *      Pipedrive's current first-party docs no longer list `Retry-After`, so this
 *      header is the server's real reset hint and is worth honoring over a blind
 *      backoff guess.
 *
 * Returns null when no usable hint is present (caller falls back to plain backoff).
 * The wait is NOT capped here — capping at RETRY_AFTER_CAP_MS is the caller's
 * cap-then-bail step (KTD6), kept in the client so the bail decision sees the
 * remaining budget. `Headers.get` is case-insensitive and returns null when absent.
 */
export function parseRetryAfterMs(headers: Headers, nowMs: number): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const trimmed = retryAfter.trim();
    if (isNonNegativeInt(trimmed)) {
      return Number(trimmed) * 1000;
    }
    const dateMs = Date.parse(trimmed);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, dateMs - nowMs);
    }
    // Present but unparseable: fall through to x-ratelimit-reset.
  }

  const reset = headers.get("x-ratelimit-reset");
  if (reset !== null) {
    const trimmed = reset.trim();
    if (isNonNegativeInt(trimmed)) {
      return Number(trimmed) * 1000;
    }
  }

  return null;
}

// ─── Circuit breaker (U2: R6, R7, R9, R10, R11; KTD7) ─────────────────────────
//
// Per-process windowed-count breaker. Valid because one STDIO process == one
// API token == one account, mirroring version-routing.ts's module state plus its
// resetVersionRoutingState(). Mutations are synchronous (no await between read and
// write) so concurrent in-flight tool calls cannot both probe (see plan System-Wide
// Impact: "breaker mutations must be synchronous"). The Closed-state trip count is a
// sliding window of recent trip-signal timestamps rather than a consecutive counter:
// a success no longer participates in Closed-state mutation, so interleaving from
// concurrent calls can only advance the count toward tripping, never suppress it
// (#123). Isolated 429s age out of the window over time.

/** The three breaker states (KTD7). */
export type BreakerState = "Closed" | "Open" | "HalfOpen";

let breakerState: BreakerState = "Closed";
/**
 * Wall-clock ms timestamps of trip signals (429/503) seen while Closed, within the
 * current BREAKER_WINDOW_MS window. Evicted by age on each new trip signal; the
 * breaker opens when this reaches BREAKER_THRESHOLD entries. A success or non-trip
 * outcome is a no-op (it does NOT clear this) — that is the concurrency fix (#123).
 */
let tripSignalTimestamps: number[] = [];
/** Wall-clock ms when the breaker last opened; cooldown is measured from here. */
let openedAtMs = 0;

// The HalfOpen state IS the one-slot probe gate: the Open -> HalfOpen transition is
// synchronous (no await), so the first caller past the cooldown becomes the probe
// and every concurrent caller then sees HalfOpen and is refused. recordOutcome
// leaves HalfOpen the moment the probe settles. No separate "probe outstanding"
// flag is needed — the state alone enforces exactly one in-flight probe.

/** The outcome the client reports back after an attempt settles. */
export interface BreakerOutcome {
  /** True on a 2xx response. */
  isSuccess: boolean;
  /** True on a 429 or 503 (R10). */
  isTripSignal: boolean;
}

/**
 * Gate consulted before every attempt. Returns whether an upstream request is
 * permitted right now and, as a side effect, drives the Open -> HalfOpen
 * transition once the cooldown elapses.
 *
 *   Closed   -> always true.
 *   Open      -> false until `nowMs - openedAtMs >= BREAKER_COOLDOWN_MS`, at which
 *               point it transitions to HalfOpen, hands THIS caller the single
 *               probe slot, and returns true.
 *   HalfOpen -> false (a probe is already outstanding; only one probe at a time).
 *
 * After a `true` result the caller can read getBreakerState(): a "HalfOpen" state
 * means this caller holds the probe slot and must run a single attempt with retry
 * disabled (KTD7).
 */
export function breakerAllowsRequest(nowMs: number): boolean {
  if (breakerState === "Closed") {
    return true;
  }
  if (breakerState === "Open") {
    if (nowMs - openedAtMs >= BREAKER_COOLDOWN_MS) {
      // Synchronously claim the single probe slot for THIS caller.
      breakerState = "HalfOpen";
      return true;
    }
    return false;
  }
  // HalfOpen: a probe is already in flight — only one probe at a time.
  return false;
}

/**
 * Records the outcome of a settled attempt and advances the breaker. `isProbe`
 * identifies the request that owns the current half-open probe slot.
 *
 *   HalfOpen + isProbe (this IS the probe): success -> Closed + window cleared; any
 *     non-success (4xx/5xx/network/timeout, not only 429/503) -> Open + cooldown
 *     restart. Leaving HalfOpen releases the single probe slot.
 *   HalfOpen + !isProbe: NO-OP. This is a request that passed the Closed gate
 *     before the breaker opened and only settled now, during another request's
 *     probe (the gate refuses NEW requests while HalfOpen, so this is the sole way
 *     a non-probe completes here). Its outcome is not the probe's verdict, so it
 *     must not advance the breaker — otherwise a concurrent straggler could hijack
 *     or release the probe slot. It still returns its own result to its own caller.
 *   Closed: success or any non-trip outcome -> NO-OP. A trip signal evicts window
 *     entries older than BREAKER_WINDOW_MS, records its own timestamp, and opens the
 *     breaker once BREAKER_THRESHOLD trip signals fall within the window. Counting
 *     within a sliding window (rather than requiring consecutive signals) is robust
 *     to concurrent interleaving: a success from a concurrent healthy request is a
 *     no-op, so it cannot zero progress mid-storm, and isolated 429s spaced beyond
 *     the window age out instead of accumulating (#123). The runaway-loop case this
 *     guards (a tight stream of same-endpoint failures) lands BREAKER_THRESHOLD
 *     signals well within the window and still trips at the same signal budget.
 *   Open: defensive no-op (no request should have been made while Open).
 */
export function recordOutcome(outcome: BreakerOutcome, nowMs: number, isProbe = false): void {
  if (breakerState === "HalfOpen") {
    // Only the probe owner settles the half-open decision; a concurrent straggler
    // that merely happened to finish during HalfOpen must not touch the breaker.
    if (!isProbe) {
      return;
    }
    // The probe settled: leaving HalfOpen releases the single probe slot.
    if (outcome.isSuccess) {
      breakerState = "Closed";
      tripSignalTimestamps = [];
    } else {
      breakerState = "Open";
      openedAtMs = nowMs;
    }
    return;
  }

  if (breakerState === "Open") {
    return;
  }

  // Closed: a success or non-trip outcome is a no-op — it must NOT reset progress,
  // or a single interleaved success from a concurrent call could suppress the trip
  // mid-storm (#123). Only trip signals mutate the window.
  if (outcome.isSuccess || !outcome.isTripSignal) {
    return;
  }
  // Evict signals older than the window, then record this one. Counting within
  // BREAKER_WINDOW_MS (not strictly-consecutive signals) is the concurrency fix:
  // interleaving can only push the in-window count up. Eviction runs only here, on
  // the record path; any stale timestamps left when trips stop are harmless and tiny
  // (never read again until the next trip's eviction pass).
  const windowStartMs = nowMs - BREAKER_WINDOW_MS;
  tripSignalTimestamps = tripSignalTimestamps.filter((ts) => ts >= windowStartMs);
  tripSignalTimestamps.push(nowMs);
  if (tripSignalTimestamps.length >= BREAKER_THRESHOLD) {
    breakerState = "Open";
    openedAtMs = nowMs;
  }
}

/** Current breaker state, for the client's probe detection and telemetry. */
export function getBreakerState(): BreakerState {
  return breakerState;
}

/**
 * Clears the per-process breaker state. For test isolation, mirroring
 * resetVersionRoutingState() (version-routing.ts). Wired into tests/setup.ts's
 * global beforeEach because module-level state leaks across tests in a worker.
 */
export function resetCircuitBreakerState(): void {
  breakerState = "Closed";
  tripSignalTimestamps = [];
  openedAtMs = 0;
}

/**
 * The breaker-open fast-fail error (R7, R11). A new distinct code (CIRCUIT_OPEN),
 * never RATE_LIMITED, so the model and telemetry can tell a local back-off apart
 * from a fresh upstream 429. The message and suggestion are fully static and
 * server-authored — no runtime value is interpolated (mirroring
 * capabilityRetiredError); the "~60 seconds" is a hardcoded approximation of
 * BREAKER_COOLDOWN_MS, not a computed value.
 */
export function circuitOpenError(): ErrorResponse {
  return createErrorResponse(
    "CIRCUIT_OPEN",
    "Requests are being held back to protect the shared Pipedrive rate limit after repeated rate-limit or service-unavailable responses.",
    "This is a local safeguard, not a fresh upstream rejection. Wait about 60 seconds before retrying; a single probe will test recovery automatically.",
  );
}

// ─── Backoff sleep seam (KTD9 alternative) ────────────────────────────────────
//
// The retry driver (client.ts) awaits resilientSleep() between attempts. The plan
// (KTD9) weighed vitest fake timers against parameter injection and chose fake
// timers, but explicitly kept injection as the sanctioned fallback "if fake-timer/
// async interleaving proves awkward." It is: a single 5xx/429/network response on
// any GET now read-retries, so dozens of pre-existing tool tests across the suite
// would otherwise incur real backoff waits. A module-level sleep seam, no-op'd once
// in tests/setup.ts, neutralizes every backoff wall-clock wait suite-wide and lets
// the few timing-sensitive resilience tests record requested waits deterministically
// (the budget is debited by the *computed* wait amount, not by a wall-clock delta).
// This is the same category of test-only seam as resetCircuitBreakerState() — a
// reset/override that lives in production for isolation, not a behavior change.

/** Sleep used by the retry driver. Injectable for test isolation. */
export type SleepFn = (ms: number) => Promise<void>;

const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let sleepImpl: SleepFn = realSleep;

/** Awaits the (possibly overridden) backoff sleep. Production uses a real timer. */
export function resilientSleep(ms: number): Promise<void> {
  return sleepImpl(ms);
}

/**
 * Test-only: override the backoff sleep (e.g. a zero-delay no-op or a recorder
 * that pushes the requested ms onto an array). Wired into tests/setup.ts so no
 * real backoff wait ever runs in the suite.
 */
export function setResilienceSleepForTests(fn: SleepFn): void {
  sleepImpl = fn;
}

/** Test-only: restore the real-timer backoff sleep. */
export function resetResilienceSleepForTests(): void {
  sleepImpl = realSleep;
}
