/**
 * Server-enforced capability modes (read-only / safe-write / full).
 *
 * A single per-process safety tier governs which Pipedrive tools an agent can reach.
 * The mode is enforced two ways (see src/index.ts): out-of-mode tools are filtered out
 * of `tools/list` so the agent never sees them, and the dispatcher independently refuses
 * any out-of-mode call by name before its handler runs. The innermost
 * `destructiveOperationGuard()` (src/utils/errors.ts) is the defense-in-depth third layer.
 *
 * Tiering adds NO new per-tool metadata: it derives entirely from the same two signals
 * `buildToolAnnotations` already uses — the verb's read-vs-write classification
 * (`verbSemantics`) and the declared `destructive` field — so the mode tiers can never
 * disagree with the published annotations, and the existing exhaustive-verb and
 * destructive↔guard tests already protect the inputs.
 *
 * This module is pure and side-effect-free: it reads the environment only when asked and
 * emits nothing. Startup-message string construction lives in `capabilityModeStartupLines`
 * (still pure — it returns lines; `main()` does the I/O).
 */

import { verbSemantics, type AnnotatableTool } from "./tools/annotations.js";

/** The three capability tiers, ordered least → most permissive. */
export const CAPABILITY_MODES = ["read-only", "safe-write", "full"] as const;

/** One of the three server capability tiers. */
export type CapabilityMode = (typeof CAPABILITY_MODES)[number];

/** Minimal environment shape this module reads (defaults to `process.env`). */
type EnvLike = Record<string, string | undefined>;

const KNOWN_MODES = new Set<string>(CAPABILITY_MODES);

/**
 * How the resolved mode was arrived at. Captured once so both the resolver and the
 * startup messaging (U5) agree on a single derivation, and so the message helper never
 * re-implements the precedence rules.
 */
export type ModeResolution = {
  /** The resolved, enforced mode. */
  mode: CapabilityMode;
  /** `PIPEDRIVE_MODE` was set but unrecognized, so it fell closed to `read-only`. */
  invalidMode: boolean;
  /** The raw, unrecognized `PIPEDRIVE_MODE` value (only when `invalidMode`). */
  rawMode?: string;
  /** Mode was derived from `PIPEDRIVE_ENABLE_DESTRUCTIVE` because `PIPEDRIVE_MODE` was unset. */
  derivedFromLegacyFlag: boolean;
};

/**
 * Resolve the capability mode AND how it was reached, without throwing or mutating `env`.
 *
 * Precedence (KTD2):
 *   1. `PIPEDRIVE_MODE` set → authoritative. Normalized (trim + lowercase) and exact-
 *      matched against the known set; an unrecognized value fails CLOSED to `read-only`
 *      (KTD4) — it must never widen access beyond what the operator intended.
 *   2. `PIPEDRIVE_MODE` unset → derive from the legacy `PIPEDRIVE_ENABLE_DESTRUCTIVE`
 *      flag (`true` → `full`, anything else → `safe-write`). The strict `=== "true"`
 *      comparison matches `getConfig()`, so an uppercase `TRUE` cannot silently widen.
 *   3. Neither set → `safe-write`, exactly reproducing today's out-of-box behavior.
 */
export function describeCapabilityMode(env: EnvLike = process.env): ModeResolution {
  const raw = env.PIPEDRIVE_MODE;

  if (raw !== undefined) {
    const normalized = raw.trim().toLowerCase();
    if (KNOWN_MODES.has(normalized)) {
      return { mode: normalized as CapabilityMode, invalidMode: false, derivedFromLegacyFlag: false };
    }
    // Fail-closed (KTD4): a typo'd/unknown value resolves to the safest tier, never a
    // write tier, with a loud startup warning (see capabilityModeStartupLines).
    return { mode: "read-only", invalidMode: true, rawMode: raw, derivedFromLegacyFlag: false };
  }

  // PIPEDRIVE_MODE unset: derive from the legacy flag for back-compat (R2).
  const legacyPresent = env.PIPEDRIVE_ENABLE_DESTRUCTIVE !== undefined;
  const mode: CapabilityMode = env.PIPEDRIVE_ENABLE_DESTRUCTIVE === "true" ? "full" : "safe-write";
  return { mode, invalidMode: false, derivedFromLegacyFlag: legacyPresent };
}

/** The resolved capability mode for the given environment (defaults to `process.env`). */
export function resolveCapabilityMode(env: EnvLike = process.env): CapabilityMode {
  return describeCapabilityMode(env).mode;
}

/**
 * Whether a tool is reachable in the given mode, from the same metadata
 * `buildToolAnnotations` reads:
 *   - read-only-verb tools (list/get/search) are available in every mode;
 *   - non-destructive writes require `safe-write` or higher;
 *   - `destructive` writes require `full`.
 *
 * A missing/undefined tool is treated as ALLOWED (a fall-through). The dispatcher relies
 * on this: a name whose handler exists but is absent from `allTools` (e.g. a synthetic
 * tool injected in a test that mocks only `getToolHandler`/`getToolSchema`) is not
 * mode-classifiable, so it falls through to the existing schema/handler path rather than
 * being wrongly rejected (see U4).
 */
export function isToolAllowedInMode(
  tool: AnnotatableTool | undefined,
  mode: CapabilityMode,
): boolean {
  if (!tool) return true;
  if (verbSemantics(tool.name).readOnly) return true; // reads in every mode
  if (mode === "read-only") return false; // any write blocked in read-only
  if (tool.destructive === true) return mode === "full"; // destructive needs full
  return true; // non-destructive write: safe-write or full
}
