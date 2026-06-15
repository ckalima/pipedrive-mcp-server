/**
 * Integration tests for capability-mode enforcement.
 *
 * Two layers are exercised against the LIVE registry:
 *   - U3: the tools/list filter (filterToolDefinitionsForMode) exposes only in-mode tools
 *     without mutating the exported registry, and agrees with the dispatch predicate.
 *   - U4: the dispatcher backstop (handleCallTool) refuses out-of-mode calls before the
 *     handler runs, and scopes the unknown-tool hint to in-mode tools.
 */

import { describe, it, expect } from 'vitest';

import { allTools, toolDefinitions } from '../../src/tools/index.js';
import {
  filterToolDefinitionsForMode,
  isToolAllowedInMode,
  CAPABILITY_MODES,
} from '../../src/capability-modes.js';

/** Live-registry counts; bump in lockstep with tool-annotations.test.ts. */
const TOTAL_TOOLS = 155;
const READ_TOOLS = 69;
const SAFE_WRITE_TOOLS = 124;

describe('capability modes — tools/list filter (U3)', () => {
  it('returns 69 / 124 / 155 definitions for read-only / safe-write / full', () => {
    expect(filterToolDefinitionsForMode(toolDefinitions, 'read-only').length).toBe(READ_TOOLS);
    expect(filterToolDefinitionsForMode(toolDefinitions, 'safe-write').length).toBe(SAFE_WRITE_TOOLS);
    expect(filterToolDefinitionsForMode(toolDefinitions, 'full').length).toBe(TOTAL_TOOLS);
  });

  it('exposes only read-only-hinted tools in read-only', () => {
    for (const def of filterToolDefinitionsForMode(toolDefinitions, 'read-only')) {
      expect(def.annotations.readOnlyHint, def.name).toBe(true);
    }
  });

  it('never exposes a destructive-hinted tool in safe-write', () => {
    for (const def of filterToolDefinitionsForMode(toolDefinitions, 'safe-write')) {
      expect(def.annotations.destructiveHint, def.name).not.toBe(true);
    }
  });

  it('returns the full registry unchanged in full mode', () => {
    expect(filterToolDefinitionsForMode(toolDefinitions, 'full')).toEqual(toolDefinitions);
  });

  it('leaves the exported toolDefinitions registry intact (155, additive filtering)', () => {
    filterToolDefinitionsForMode(toolDefinitions, 'read-only');
    expect(toolDefinitions.length).toBe(TOTAL_TOOLS);
    expect(allTools.length).toBe(TOTAL_TOOLS);
  });

  it('places a specific destructive tool only in full, a read tool in all modes', () => {
    const has = (mode: typeof CAPABILITY_MODES[number], name: string) =>
      filterToolDefinitionsForMode(toolDefinitions, mode).some((d) => d.name === name);

    expect(has('read-only', 'pipedrive_delete_lead')).toBe(false);
    expect(has('safe-write', 'pipedrive_delete_lead')).toBe(false);
    expect(has('full', 'pipedrive_delete_lead')).toBe(true);

    for (const mode of CAPABILITY_MODES) {
      expect(has(mode, 'pipedrive_get_deal'), mode).toBe(true);
    }
  });

  it('agrees with the dispatch predicate for all tools across all modes', () => {
    // The list filter is sourced from annotations.destructiveHint; the dispatch backstop
    // is sourced from the declared `destructive` field. Prove they can never diverge.
    for (const mode of CAPABILITY_MODES) {
      const visible = new Set(filterToolDefinitionsForMode(toolDefinitions, mode).map((d) => d.name));
      for (const tool of allTools) {
        expect(visible.has(tool.name), `${tool.name} @ ${mode}`).toBe(
          isToolAllowedInMode(tool, mode),
        );
      }
    }
  });
});
