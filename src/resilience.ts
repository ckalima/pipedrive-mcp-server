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
 * dependency is `errors.ts` for the shared error-response shape (added in U2).
 */

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
/** Consecutive trip signals (429 / 503) that open the breaker. */
export const BREAKER_THRESHOLD = 5;
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
