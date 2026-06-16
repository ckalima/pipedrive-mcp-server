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
 *   1. `PIPEDRIVE_MODE` set to a non-blank value → authoritative. Normalized (trim +
 *      lowercase) and exact-matched against the known set; an unrecognized value fails
 *      CLOSED to `read-only` (KTD4) — it must never widen access beyond what the operator
 *      intended.
 *   2. `PIPEDRIVE_MODE` unset OR blank (empty/whitespace) → derive from the legacy
 *      `PIPEDRIVE_ENABLE_DESTRUCTIVE` flag (`true` → `full`, anything else → `safe-write`).
 *      A set-but-blank value means "no value provided," not a typo, so it reproduces the
 *      documented default rather than failing closed. This is the durable guard for the
 *      MCPB install path: a host substitutes an empty string for an optional `user_config`
 *      field the operator left at its default, and the manifest spec does not guarantee the
 *      declared default is injected (see docs link in the manifest). The strict `=== "true"`
 *      comparison matches `getConfig()`, so an uppercase `TRUE` cannot silently widen.
 *   3. Neither set → `safe-write`, exactly reproducing today's out-of-box behavior.
 */
export function describeCapabilityMode(env: EnvLike = process.env): ModeResolution {
  const raw = env.PIPEDRIVE_MODE;
  const normalized = raw?.trim().toLowerCase();

  // A set-but-blank PIPEDRIVE_MODE ("" or whitespace) normalizes to a falsy value and
  // falls through to the unset branch below: it means "no value provided," so it must
  // reproduce the documented default, never fail closed to read-only. Only a non-blank,
  // unrecognized value is a typo and fails closed (KTD4).
  if (normalized) {
    if (KNOWN_MODES.has(normalized)) {
      return { mode: normalized as CapabilityMode, invalidMode: false, derivedFromLegacyFlag: false };
    }
    // Fail-closed (KTD4): a typo'd/unknown value resolves to the safest tier, never a
    // write tier, with a loud startup warning (see capabilityModeStartupLines).
    return { mode: "read-only", invalidMode: true, rawMode: raw, derivedFromLegacyFlag: false };
  }

  // PIPEDRIVE_MODE unset or blank: derive from the legacy flag for back-compat (R2).
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

/**
 * The stderr lines describing the resolved capability mode at startup (R9, R3 messaging).
 *
 * Pure: it returns the lines; `main()` performs the `console.error` I/O. The first line
 * always reports the resolved mode; a second line is added either to warn about an
 * unrecognized `PIPEDRIVE_MODE` value (naming the valid values and the read-only fallback)
 * or to nudge an operator off the deprecated `PIPEDRIVE_ENABLE_DESTRUCTIVE` flag. The two
 * cases are mutually exclusive (one requires `PIPEDRIVE_MODE` set, the other unset).
 */
export function capabilityModeStartupLines(env: EnvLike = process.env): string[] {
  const { mode, invalidMode, rawMode, derivedFromLegacyFlag } = describeCapabilityMode(env);
  const lines = [`Capability mode: ${mode}`];

  if (invalidMode) {
    lines.push(
      `Warning: unrecognized PIPEDRIVE_MODE='${rawMode}'. Valid values are ` +
        `${CAPABILITY_MODES.join(", ")}; falling back to the safest tier (read-only).`,
    );
  } else if (derivedFromLegacyFlag) {
    lines.push(
      "Note: PIPEDRIVE_ENABLE_DESTRUCTIVE is deprecated; the mode was derived from it. " +
        "Prefer PIPEDRIVE_MODE (read-only | safe-write | full).",
    );
  }

  return lines;
}

/** Minimal `tools/list` definition shape this filter reads. */
export type AnnotatedToolDefinition = {
  name: string;
  annotations?: { destructiveHint?: boolean };
};

/**
 * Keep only the `tools/list` definitions reachable in the given mode (R5), without
 * mutating the exported registry (R7).
 *
 * Definitions carry MCP `annotations` rather than the raw `destructive` field, so each is
 * adapted into the `{ name, destructive }` shape via `destructive ← destructiveHint` and
 * fed through the SAME `isToolAllowedInMode` predicate the dispatcher uses. One predicate
 * for both layers means the visible surface and the call-time backstop can never diverge,
 * even for a future tool whose annotation and declared field disagree.
 */
export function filterToolDefinitionsForMode<T extends AnnotatedToolDefinition>(
  defs: readonly T[],
  mode: CapabilityMode,
): T[] {
  return defs.filter((def) =>
    isToolAllowedInMode({ name: def.name, destructive: def.annotations?.destructiveHint === true }, mode),
  );
}
