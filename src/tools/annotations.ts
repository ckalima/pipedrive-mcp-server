/**
 * MCP tool annotations (readOnlyHint / destructiveHint / idempotentHint / openWorldHint).
 *
 * Annotations are *derived*, never hand-authored per tool, so they can never silently
 * drift from the real tool surface:
 *
 *   - `readOnlyHint` / `idempotentHint` come from the tool's verb prefix. Every tool is
 *     named `pipedrive_<verb>_…`, and the verb fully determines read-vs-write and
 *     idempotency (see VERB_SEMANTICS). This is the server classifying its OWN naming
 *     convention once, with a test that enforces the map covers every verb — not a
 *     client parsing names at call time, which is the thing annotations exist to avoid.
 *   - `destructiveHint` comes from the SAME declared `destructive` field that gates the
 *     runtime `destructiveOperationGuard()` and drives the README/manifest 🔒 marker.
 *     Sourcing the protocol hint from that one field means the hint and the
 *     `PIPEDRIVE_ENABLE_DESTRUCTIVE` gate can never disagree.
 *   - `openWorldHint` is always true: every tool talks to the external Pipedrive API,
 *     whose data can change outside this server's control.
 *
 * Invariants (exhaustive verb coverage, destructive ⇒ write, etc.) are enforced in
 * `tests/unit/tool-annotations.test.ts`, mirroring the destructive↔guard static scan in
 * `tests/unit/gen-docs.test.ts`.
 *
 * Per the MCP spec, every property here is a HINT and clients must not make trust
 * decisions on it; `destructiveHint`/`idempotentHint` are only meaningful when
 * `readOnlyHint` is false.
 */

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** The minimal tool shape this module reads. */
export type AnnotatableTool = { name: string; destructive?: boolean };

/** Per-verb operation semantics, keyed by the first token of the (unprefixed) tool name. */
type VerbSemantics = { readOnly: boolean; idempotent: boolean };

/**
 * Operation semantics for every verb used in a tool name. Reads (list/get/search) are
 * read-only and idempotent. Among writes: updates, deletes, and archive converge to the
 * same end state on repeat (idempotent); creates, adds, bulk-adds, conversions, and
 * uploads each produce a new effect per call (not idempotent). Destructiveness is NOT
 * encoded here — it comes from the declared `destructive` field (see buildToolAnnotations).
 */
export const VERB_SEMANTICS: Record<string, VerbSemantics> = {
  // Reads
  list: { readOnly: true, idempotent: true },
  get: { readOnly: true, idempotent: true },
  search: { readOnly: true, idempotent: true },
  // Idempotent writes (repeat call → same end state)
  update: { readOnly: false, idempotent: true },
  delete: { readOnly: false, idempotent: true },
  archive: { readOnly: false, idempotent: true },
  // Non-idempotent writes (repeat call → additional effect)
  create: { readOnly: false, idempotent: false },
  add: { readOnly: false, idempotent: false },
  bulk: { readOnly: false, idempotent: false },
  convert: { readOnly: false, idempotent: false },
  upload: { readOnly: false, idempotent: false },
};

/** Conservative default for an unmapped verb: treat as a non-idempotent write. The
 *  test suite guarantees no shipped tool actually falls through to this. */
const FALLBACK_SEMANTICS: VerbSemantics = { readOnly: false, idempotent: false };

/** The verb token of a tool name (`pipedrive_list_deals` → `list`). */
export function toolVerb(name: string): string {
  return name.replace(/^pipedrive_/, "").split("_")[0];
}

/** Operation semantics for a tool name, falling back to a conservative write. */
export function verbSemantics(name: string): VerbSemantics {
  return VERB_SEMANTICS[toolVerb(name)] ?? FALLBACK_SEMANTICS;
}

/** Build the MCP annotations object for a tool from its name verb + declared `destructive` field. */
export function buildToolAnnotations(tool: AnnotatableTool): ToolAnnotations {
  const { readOnly, idempotent } = verbSemantics(tool.name);
  return {
    readOnlyHint: readOnly,
    // Only writes can be destructive; sourced from the declared field so it tracks the guard.
    destructiveHint: readOnly ? false : tool.destructive === true,
    idempotentHint: idempotent,
    openWorldHint: true,
  };
}
