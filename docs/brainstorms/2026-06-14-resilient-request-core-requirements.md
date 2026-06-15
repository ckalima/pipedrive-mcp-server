---
date: 2026-06-14
topic: resilient-request-core
---

# Resilient Request Core

## Summary

Add resilience at the single shared request chokepoint in `src/client.ts` so all
tool domains harden at once: automatic retry of transient failures with bounded
exponential backoff that honors Pipedrive's `Retry-After`, plus a per-process
circuit breaker that fast-fails during a sustained rate-limit storm. Reads retry
on any transient failure; writes retry only when the request provably was not
processed. The TTL metadata cache and tiered token bucket from the original
ideation are deferred to a later track.

---

## Problem Frame

`src/client.ts` is a single `fetch` with only a 30s `AbortSignal` timeout — no
retry, no 429 handling, no breaker. Every one of the ~155 tools routes through it.
Today a 429 returns a `RATE_LIMITED` error immediately with a static "wait 60
seconds" suggestion, and a transient network blip returns `NETWORK_ERROR`; in both
cases the agent has to notice and retry by hand.

The acute risk is a runaway agent loop under real use: with no backoff and no
breaker, it can keep hammering a rate-limited endpoint and exhaust the account's
**shared** API quota, degrading the human's own Pipedrive usage, not just the MCP
session. This is preventive hardening — there is no observed incident yet — but it
is the most likely "it broke in production" failure for an agentic CRM wrapper, and
a fix at the chokepoint multiplies across every current and future tool.

---

## Key Decisions

- KD1. **Reads retry freely on transient failures; writes retry on 429 only.** A 429
  means the request was rejected before processing, so retrying it is safe even for
  writes. A network error, timeout, or 5xx on a write is ambiguous — the write may
  have landed but the response was lost — so retrying risks a duplicate create. Reads
  (GET) are safe to retry on any transient signal.
- KD2. **Bounded retry budget with a capped `Retry-After`.** A few attempts with
  exponential backoff and jitter, honoring `Retry-After` but capping any single wait
  and the total added wall-clock, then surfacing a clear error. An interactive agent
  experiences a minute-plus hang as a stall, so responsiveness bounds resilience.
- KD3. **Per-process, 429-triggered circuit breaker.** One process equals one API
  token equals one account, so the process is the right unit. Repeated consecutive
  429s open the breaker; it fast-fails during a cooldown, then half-opens with a
  single probe. Its job is to stop a runaway loop from burning the shared quota.
- KD4. **Resilience core only; cache and token bucket deferred.** Keeping a
  critical-path change all-behavioral avoids cache staleness and write-invalidation
  risk in multi-client accounts. The call-volume-reduction levers are a separate
  later track.
- KD5. **Retry and breaker live inside the client chokepoint, below the
  version-routing seam.** The seam (`src/version-routing.ts`) sits above the client
  and sees only the final post-retry result. Non-transient responses (4xx other than
  429, and the retirement 410) bypass retry entirely, so retirement detection stays
  immediate.

---

## Requirements

### Retry behavior

- R1. The shared request chokepoint retries transient failures automatically. Tools
  route through it unchanged and observe only the final result.
- R2. Reads (GET) retry on any transient failure: 429, 5xx, and network/timeout.
- R3. Writes (POST / PATCH / PUT / DELETE, including the multipart upload path) retry
  only on 429; never on network, timeout, or 5xx.
- R4. Retries use bounded exponential backoff with jitter and a capped attempt count.
  They honor Pipedrive's `Retry-After` but cap any single wait and the total added
  wall-clock, after which a clear error surfaces instead of further retries.
- R5. Non-transient responses — 4xx other than 429, and the retirement 410 — are never
  retried; they return immediately so the version-routing seam's retirement detection
  is unaffected.

### Circuit breaker

- R6. A per-process circuit breaker trips after repeated consecutive 429s, fast-failing
  subsequent calls without an upstream request during a cooldown, then half-opens with
  a single probe before closing.
- R7. While the breaker is open, calls return a clear, structured rate-limited /
  backing-off error to the model rather than a raw upstream error or a hang.

### Telemetry and testability

- R8. Retry attempts and breaker state transitions log to stderr only (never stdout),
  routed through the existing secret-redaction so no token or request URL can leak.
- R9. The breaker's process-level state is resettable for test isolation, mirroring the
  version-routing seam's reset and the client singleton.

---

## Acceptance Examples

- AE1. Covers R3. Given a write (e.g. create) that gets a network error or timeout,
  when it runs, then the error is returned with no retry — so the same record is never
  created twice.
- AE2. Covers R2, R4. Given a read that gets a 429 carrying a `Retry-After` within the
  cap, when it runs, then it waits the honored interval, retries, and succeeds.
- AE3. Covers R4. Given a 429 whose `Retry-After` exceeds the cap, when it runs, then
  the wait is clamped to the cap and, if still limited, a clear error surfaces within
  the total budget rather than hanging for the full hint.
- AE4. Covers R6, R7. Given repeated consecutive 429s that open the breaker, when the
  next call is made, then it fast-fails with the rate-limited message and issues no
  upstream request.
- AE5. Covers R5. Given a 410 on a registered v1-only endpoint, when the tool runs,
  then it is not retried and the retirement message surfaces immediately.

---

## Scope Boundaries

### Deferred for later

- A short-TTL cache for slow-changing metadata (fields, pipelines, stages, users).
- A tiered token bucket (generous reads, stingy writes).

### Outside this work

- Remote transport (Streamable HTTP) and OAuth 2.1 — a separate strategic track.
- Search-first / lazy tool loading.

---

## Dependencies / Assumptions

- Assumes Pipedrive returns a `Retry-After` header on 429. Verify during planning /
  implementation; fall back to plain exponential backoff if it is absent or unparseable.
- The per-attempt 30s `AbortSignal` timeout stays; the total retry budget bounds the
  sum of attempts plus backoff waits.
- Multipart writes (e.g. product image uploads) follow the same 429-only write boundary,
  and their `FormData` body must be re-buildable per attempt (a stream consumed once
  cannot be re-sent).
- Client-level read retries stack on `convertLeadToDeal`'s own ~30s polling loop
  (`BACKOFF_DELAYS_MS` in `src/tools/leads.ts`), so that tool's worst-case wall-clock
  grows. Bounded and acceptable, but noted so planning sizes the budgets together.
- This is preventive hardening; the load-bearing assumption is that a runaway agent
  loop exhausting the shared account quota is the failure worth pre-empting.

---

## Outstanding Questions

### Deferred to Planning

- Should a sustained 5xx storm (server outage) also trip the circuit breaker, or should
  the breaker stay 429-only as the ideation framed it?
- Exact tuning: attempt count, backoff base/factor, jitter scheme, the `Retry-After`
  single-wait cap, the total wall-clock budget, and the breaker threshold and cooldown.
- Whether the breaker-open error reuses the existing `RATE_LIMITED` code or a new code.

---

## Sources / Research

- `src/client.ts` — the `request()` / `requestMultipart()` chokepoint, the 30s
  `AbortSignal` timeout, the `parseResponse` / `networkError` split, and the
  `handleApiError` 429 → `RATE_LIMITED` mapping.
- `src/version-routing.ts` — the seam above the client; consumes the post-retry result
  and the seam-internal `ApiResponse.httpStatus`.
- `src/tools/leads.ts` — `convertLeadToDeal`'s `BACKOFF_DELAYS_MS` polling loop, which
  the per-call retry budget compounds with.
- `docs/private/2026-06-14-next-direction-ideation.html` — ideation idea #3 (resilient
  request core), the source of this brainstorm and of the deferred cache / token-bucket
  halves.
