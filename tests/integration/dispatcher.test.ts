/**
 * Integration tests for the CallTool dispatcher in src/index.ts.
 *
 * Exercises the three mcpErrorFromCode call sites that are not covered by
 * unit tests: unknown tool, Zod validation failure, and handler throws.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../helpers/mockEnv.js';

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
      return actual.getToolHandler(name);
    },
    getToolSchema: (name: string) => {
      if (name === 'pipedrive_throwing_tool' || name === 'pipedrive_non_error_throwing_tool') {
        // No schema — validation is skipped, handler runs and throws
        return undefined;
      }
      return actual.getToolSchema(name);
    },
    // toolDefinitions spread from actual so Test 1's available-tools assertion sees the real list
    toolDefinitions: actual.toolDefinitions,
  };
});

import { handleCallTool } from '../../src/index.js';

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
});
