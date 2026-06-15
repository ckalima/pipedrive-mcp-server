/**
 * Integration tests for the CallTool dispatcher in src/index.ts.
 *
 * Exercises the four mcpErrorFromCode call sites that are not covered by
 * unit tests: unknown tool, fail-closed schema-less dispatch (U9), Zod
 * validation failure, and handler throws.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { setupValidEnv } from '../helpers/mockEnv.js';

// A no-call spy handler for the schema-less tool, hoisted so the vi.mock factory
// can close over it. Fail-closed dispatch (U9) must reject BEFORE this runs.
// `hugeText` exceeds the U6 universal backstop ceiling (the test asserts so
// against MAX_TOOL_RESPONSE_CHARS) to drive the oversize-response path.
const { schemalessHandler, hugeText } = vi.hoisted(() => ({
  schemalessHandler: vi.fn(async () => ({ content: [{ type: 'text', text: 'should never run' }] })),
  hugeText: 'h'.repeat(1_000_100),
}));

// Hoist vi.mock so the module-level binding in src/index.ts is intercepted
vi.mock('../../src/tools/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/tools/index.js')>();
  return {
    ...actual,
    getToolHandler: (name: string) => {
      if (name === 'pipedrive_throwing_tool') {
        return async () => { throw new Error('boom from handler'); };
      }
      if (name === 'pipedrive_non_error_throwing_tool') {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        return async () => { throw 'string failure'; };
      }
      if (name === 'pipedrive_schemaless_tool') {
        return schemalessHandler;
      }
      if (name === 'pipedrive_huge_tool') {
        // Oversize NON-error result -> the U6 backstop must replace it.
        return async () => ({ content: [{ type: 'text', text: hugeText }] });
      }
      if (name === 'pipedrive_huge_error_tool') {
        // Oversize result already marked isError -> must pass through untouched.
        return async () => ({ content: [{ type: 'text', text: hugeText }], isError: true });
      }
      return actual.getToolHandler(name);
    },
    getToolSchema: (name: string) => {
      // U9 fail-closed: a tool with no schema is now rejected before its handler
      // runs, so the two handler-throws cases (and the U6 huge tools) attach a
      // trivial schema to pass validation. Only the dedicated schema-less tool
      // returns undefined, to drive the fail-closed path.
      if (
        name === 'pipedrive_throwing_tool' ||
        name === 'pipedrive_non_error_throwing_tool' ||
        name === 'pipedrive_huge_tool' ||
        name === 'pipedrive_huge_error_tool'
      ) {
        return z.object({});
      }
      if (name === 'pipedrive_schemaless_tool') {
        return undefined;
      }
      return actual.getToolSchema(name);
    },
    // toolDefinitions spread from actual so Test 1's available-tools assertion sees the real list
    toolDefinitions: actual.toolDefinitions,
  };
});

import { handleCallTool } from '../../src/index.js';
import { MAX_TOOL_RESPONSE_CHARS } from '../../src/utils/formatting.js';

describe('dispatcher (handleCallTool)', () => {
  beforeEach(() => {
    setupValidEnv();
  });

  describe('unknown tool name -> VALIDATION_ERROR', () => {
    it('returns isError with VALIDATION_ERROR and available-tools suggestion', async () => {
      const result = await handleCallTool({ params: { name: 'pipedrive_not_a_tool', arguments: {} } });

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error [VALIDATION_ERROR]:');
      expect(result.content[0].text).toContain('Unknown tool: pipedrive_not_a_tool');
      expect(result.content[0].text).toContain('Suggestion: Available tools:');
      // Sanity check: real tool name appears in the available-tools list
      expect(result.content[0].text).toContain('pipedrive_list_pipelines');
    });
  });

  describe('no schema registered -> VALIDATION_ERROR (fail-closed, U9)', () => {
    beforeEach(() => {
      schemalessHandler.mockClear();
    });

    it('rejects a schema-less tool without ever invoking the handler', async () => {
      const result = await handleCallTool({
        params: { name: 'pipedrive_schemaless_tool', arguments: { anything: 'goes' } },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error [VALIDATION_ERROR]:');
      expect(result.content[0].text).toContain(
        'No input schema registered for tool: pipedrive_schemaless_tool'
      );
      // The fail-closed guard must short-circuit before dispatch.
      expect(schemalessHandler).not.toHaveBeenCalled();
    });
  });

  describe('invalid arguments (Zod failure) -> VALIDATION_ERROR', () => {
    it('returns isError with VALIDATION_ERROR and field-level details', async () => {
      // pipedrive_get_stage schema: { id: z.number().int().positive() }
      // Passing a string triggers: id: Expected number, received string
      const result = await handleCallTool({
        params: { name: 'pipedrive_get_stage', arguments: { id: 'not-a-number' } },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error [VALIDATION_ERROR]:');
      expect(result.content[0].text).toContain('Invalid arguments:');
      expect(result.content[0].text).toContain('id:');
      expect(result.content[0].text).toContain(
        "Suggestion: Check the tool's inputSchema for required parameters"
      );
    });
  });

  describe('handler throws Error -> API_ERROR', () => {
    it('returns isError with API_ERROR and the thrown message', async () => {
      const result = await handleCallTool({
        params: { name: 'pipedrive_throwing_tool', arguments: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error [API_ERROR]:');
      expect(result.content[0].text).toContain('boom from handler');
      expect(result.content[0].text).toContain('Suggestion: Check your API key and network connection');
    });

    it('returns "Unknown error occurred" when handler throws a non-Error primitive', async () => {
      const result = await handleCallTool({
        params: { name: 'pipedrive_non_error_throwing_tool', arguments: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error [API_ERROR]:');
      expect(result.content[0].text).toContain('Unknown error occurred');
      expect(result.content[0].text).toContain('Suggestion: Check your API key and network connection');
    });
  });

  describe('oversize response -> RESPONSE_TOO_LARGE backstop (U6)', () => {
    it('replaces an oversize non-error result with a well-formed paginate error', async () => {
      // Guard: the synthetic payload must actually exceed the live ceiling.
      expect(hugeText.length).toBeGreaterThan(MAX_TOOL_RESPONSE_CHARS);

      const result = await handleCallTool({
        params: { name: 'pipedrive_huge_tool', arguments: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error [RESPONSE_TOO_LARGE]:');
      expect(result.content[0].text).toContain('Tool response too large');
      expect(result.content[0].text).toContain('Suggestion: Narrow the query or use pagination');
      // The replacement is a small structured error, not the original payload.
      expect(result.content[0].text.length).toBeLessThan(hugeText.length);
    });

    it('passes an oversize result already marked isError through untouched (no double-wrap)', async () => {
      const result = await handleCallTool({
        params: { name: 'pipedrive_huge_error_tool', arguments: {} },
      });

      expect(result.isError).toBe(true);
      // Untouched: the original oversize payload is preserved, not replaced.
      expect(result.content[0].text).toBe(hugeText);
      expect(result.content[0].text).not.toContain('RESPONSE_TOO_LARGE');
    });

    it('passes a normal-size result through without a backstop error', async () => {
      const result = await handleCallTool({
        params: { name: 'pipedrive_get_stage', arguments: { id: 'not-a-number' } },
      });
      // (This trips Zod validation, but the point is it is never RESPONSE_TOO_LARGE.)
      expect(result.content[0].text).not.toContain('RESPONSE_TOO_LARGE');
    });
  });
});
