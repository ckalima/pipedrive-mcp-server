/**
 * Integration tests for capability-mode enforcement.
 *
 * Two layers are exercised against the LIVE registry:
 *   - U3: the tools/list filter (filterToolDefinitionsForMode) exposes only in-mode tools
 *     without mutating the exported registry, and agrees with the dispatch predicate.
 *   - U4: the dispatcher backstop (handleCallTool) refuses out-of-mode calls before the
 *     handler runs, and scopes the unknown-tool hint to in-mode tools.
 */

import { readFileSync } from 'node:fs';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

import { allTools, toolDefinitions } from '../../src/tools/index.js';
import {
  filterToolDefinitionsForMode,
  isToolAllowedInMode,
  resolveCapabilityMode,
  CAPABILITY_MODES,
} from '../../src/capability-modes.js';
import { VALID_API_KEY } from '../helpers/mockEnv.js';
import { mockApiSuccess, fixtures } from '../helpers/mockFetch.js';

/** Live-registry counts; bump in lockstep with tool-annotations.test.ts. */
const TOTAL_TOOLS = 155;
const READ_TOOLS = 69;
const SAFE_WRITE_TOOLS = 124;

// A synthetic write tool whose handler exists but is absent from allTools, to prove the
// dispatcher's undefined-allowed fall-through (U1/U4): getTool returns undefined for it,
// so it is not mode-classifiable and is NOT blocked. Hoisted for the vi.mock factory.
const { syntheticHandler } = vi.hoisted(() => ({
  syntheticHandler: vi.fn(async () => ({ content: [{ type: 'text', text: 'synthetic ran' }] })),
}));

vi.mock('../../src/tools/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/tools/index.js')>();
  return {
    ...actual, // toolDefinitions, allTools, getTool stay real (getTool returns undefined for the synthetic)
    getToolHandler: (name: string) =>
      name === 'pipedrive_create_synthetic' ? syntheticHandler : actual.getToolHandler(name),
    getToolSchema: (name: string) =>
      name === 'pipedrive_create_synthetic' ? z.object({}) : actual.getToolSchema(name),
  };
});

import { handleCallTool } from '../../src/index.js';

const textOf = (r: { content: { text: string }[] }) => r.content[0].text;

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

  it('lists 124 tools at the unset default (the back-compat-sensitive composition)', () => {
    // The ListTools handler is filterToolDefinitionsForMode(toolDefinitions,
    // resolveCapabilityMode()). Compose those two pieces with no env set to pin the
    // exact listed surface an existing install sees on upgrade: 124, not 155 — destructive
    // tools are now hidden by default rather than listed-then-refused. (resolveCapabilityMode
    // reads no env here because tests/setup.ts clears both vars in beforeEach.)
    const mode = resolveCapabilityMode({});
    expect(mode).toBe('safe-write');
    expect(filterToolDefinitionsForMode(toolDefinitions, mode).length).toBe(SAFE_WRITE_TOOLS);
  });

  it('keeps the README capability-mode table counts in sync with the live filter (R10 drift guard)', () => {
    // The README "Capability modes" table is hand-written (outside the gen:docs generated
    // region), so the CI drift gate does not cover it. Pin each documented count to the
    // live filter so a registry change can't leave the table silently stale.
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').split('\n');
    for (const mode of CAPABILITY_MODES) {
      const row = readme.find((l) => l.trimStart().startsWith(`| \`${mode}\``));
      expect(row, `README capability-modes table has a \`${mode}\` row`).toBeTruthy();
      const documented = Number(row!.match(/\b(\d+)\b/)?.[1]);
      expect(documented, `README \`${mode}\` count matches filterToolDefinitionsForMode`).toBe(
        filterToolDefinitionsForMode(toolDefinitions, mode).length,
      );
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

describe('capability modes — dispatcher backstop (U4)', () => {
  beforeEach(() => {
    process.env.PIPEDRIVE_API_KEY = VALID_API_KEY;
  });

  it('lets a read tool run in read-only (not blocked, handler reached)', async () => {
    process.env.PIPEDRIVE_MODE = 'read-only';
    const fetchMock = mockApiSuccess(fixtures.deal);

    const result = await handleCallTool({ params: { name: 'pipedrive_get_deal', arguments: { id: 1 } } });

    expect(textOf(result)).not.toContain('MODE_RESTRICTED');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('blocks a write tool in read-only with MODE_RESTRICTED, handler never runs', async () => {
    process.env.PIPEDRIVE_MODE = 'read-only';
    const fetchMock = mockApiSuccess(fixtures.deal);

    const result = await handleCallTool({
      params: { name: 'pipedrive_create_deal', arguments: { title: 'x' } },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Error [MODE_RESTRICTED]:');
    expect(textOf(result)).toContain("'pipedrive_create_deal'");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a destructive tool in safe-write with MODE_RESTRICTED, handler never runs', async () => {
    process.env.PIPEDRIVE_MODE = 'safe-write';
    const fetchMock = mockApiSuccess({});

    const result = await handleCallTool({
      params: { name: 'pipedrive_delete_lead', arguments: { id: '550e8400-e29b-41d4-a716-446655440000' } },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Error [MODE_RESTRICTED]:');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a destructive tool past the backstop in full (reaches the guard/handler path)', async () => {
    process.env.PIPEDRIVE_MODE = 'full';
    const fetchMock = mockApiSuccess({ id: 1 });

    const result = await handleCallTool({
      params: { name: 'pipedrive_delete_lead', arguments: { id: '550e8400-e29b-41d4-a716-446655440000' } },
    });

    expect(textOf(result)).not.toContain('MODE_RESTRICTED');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('names the active mode and the PIPEDRIVE_MODE knob in the MODE_RESTRICTED message', async () => {
    process.env.PIPEDRIVE_MODE = 'read-only';
    const result = await handleCallTool({
      params: { name: 'pipedrive_create_deal', arguments: { title: 'x' } },
    });

    expect(textOf(result)).toContain("'read-only'");
    expect(textOf(result)).toContain('PIPEDRIVE_MODE');
  });

  it('blocks nothing under setupValidEnv()-style full mode (back-compat)', async () => {
    delete process.env.PIPEDRIVE_MODE;
    process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true'; // → resolves to full
    const fetchMock = mockApiSuccess({ id: 1 });

    const result = await handleCallTool({
      params: { name: 'pipedrive_delete_lead', arguments: { id: '550e8400-e29b-41d4-a716-446655440000' } },
    });

    expect(textOf(result)).not.toContain('MODE_RESTRICTED');
    expect(fetchMock).toHaveBeenCalled();
  });

  describe('unknown-tool hint is scoped to the in-mode surface (R6a)', () => {
    it('excludes write/destructive tool names from the hint in read-only', async () => {
      process.env.PIPEDRIVE_MODE = 'read-only';
      const result = await handleCallTool({ params: { name: 'pipedrive_not_a_tool', arguments: {} } });

      expect(textOf(result)).toContain('Error [VALIDATION_ERROR]:');
      expect(textOf(result)).toContain('Unknown tool: pipedrive_not_a_tool');
      // Read tools appear; write/destructive tools do not.
      expect(textOf(result)).toContain('pipedrive_get_deal');
      expect(textOf(result)).not.toContain('pipedrive_create_deal');
      expect(textOf(result)).not.toContain('pipedrive_delete_lead');
    });

    it('includes non-destructive writes but excludes destructive tool names in safe-write', async () => {
      // The default tier: the hint must surface reads + non-destructive writes, but never a
      // destructive tool name (the middle case the read-only and full cases bracket).
      process.env.PIPEDRIVE_MODE = 'safe-write';
      const result = await handleCallTool({ params: { name: 'pipedrive_not_a_tool', arguments: {} } });

      expect(textOf(result)).toContain('Error [VALIDATION_ERROR]:');
      expect(textOf(result)).toContain('pipedrive_get_deal');
      expect(textOf(result)).toContain('pipedrive_create_deal');
      expect(textOf(result)).not.toContain('pipedrive_delete_lead');
    });

    it('includes write/destructive tool names in the hint in full', async () => {
      process.env.PIPEDRIVE_MODE = 'full';
      const result = await handleCallTool({ params: { name: 'pipedrive_not_a_tool', arguments: {} } });

      expect(textOf(result)).toContain('pipedrive_create_deal');
      expect(textOf(result)).toContain('pipedrive_delete_lead');
    });
  });

  it('does NOT block a handler-present-but-unregistered tool (undefined-allowed fall-through)', async () => {
    // getTool('pipedrive_create_synthetic') is undefined (absent from allTools), so even in
    // read-only the backstop falls through and the synthetic handler runs.
    process.env.PIPEDRIVE_MODE = 'read-only';
    syntheticHandler.mockClear();

    const result = await handleCallTool({
      params: { name: 'pipedrive_create_synthetic', arguments: {} },
    });

    expect(textOf(result)).not.toContain('MODE_RESTRICTED');
    expect(syntheticHandler).toHaveBeenCalled();
    expect(textOf(result)).toBe('synthetic ran');
  });
});
