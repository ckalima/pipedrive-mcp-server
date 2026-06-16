/**
 * Global test setup for Pipedrive MCP Server tests
 */

import { vi, beforeEach, afterEach } from 'vitest';
import { resetVersionRoutingState } from '../src/version-routing.js';
import {
  resetCircuitBreakerState,
  setResilienceSleepForTests,
  resetMonotonicClockForTests,
} from '../src/resilience.js';

// Store original environment
const originalEnv = { ...process.env };

// Reset environment before each test
beforeEach(() => {
  // Clear all environment variables that might affect tests
  delete process.env.PIPEDRIVE_API_KEY;

  // Clear the capability-mode vars so mode resolution is deterministic regardless of the
  // developer's shell (R11). Both are process-global and read at call time, so a leaked
  // value would make unrelated suites non-deterministic. Suites that call setupValidEnv()
  // set PIPEDRIVE_ENABLE_DESTRUCTIVE=true and so resolve to `full`. (Mirrors the
  // version-routing / circuit-breaker reset footgun documented above.)
  delete process.env.PIPEDRIVE_MODE;
  delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;

  // Reset all mocks
  vi.clearAllMocks();

  // Clear the version-routing seam's module-level retired/warned state. Like the
  // getClient() singleton, it persists across tests in a worker, so an unreset
  // warned set makes the once-per-session assertions order-dependent (see plan
  // Risks: test-isolation footgun).
  resetVersionRoutingState();

  // Clear the resilience circuit breaker's module-level state for the same reason
  // (R9): without this, a breaker opened by one test bleeds into the next.
  resetCircuitBreakerState();

  // Neutralize backoff waits suite-wide. Reads now retry transient failures, so a
  // single 5xx/429/network response on any GET would otherwise incur real backoff
  // sleeps. A zero-delay sleep keeps the suite fast with no real waits; resilience
  // tests that need to assert wait amounts install their own recording sleep.
  setResilienceSleepForTests(() => Promise.resolve());

  // Restore the real monotonic clock the breaker keys on (#133). It is a module-level
  // injectable seam like the two above, so a test that installs a controlled clock to
  // drive the cooldown/window arithmetic would otherwise leak into the next test.
  resetMonotonicClockForTests();
});

// Restore original environment after each test
afterEach(() => {
  // Restore original environment
  process.env = { ...originalEnv };

  // Restore all mocks
  vi.restoreAllMocks();
});

// Mock console.error to suppress noise during tests (optional)
// Uncomment if you want quieter test output
// vi.spyOn(console, 'error').mockImplementation(() => {});
