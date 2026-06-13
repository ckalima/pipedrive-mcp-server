/**
 * Tests for MCP tool annotations (src/tools/annotations.ts).
 *
 * Annotations are derived, not hand-authored, so these tests lock the derivation against
 * the live `allTools` registry:
 *   1. Coverage: every registered tool gets a full annotations object, and every tool's
 *      verb is mapped (none falls through to the conservative fallback).
 *   2. The declared `destructive` field is the single source of `destructiveHint`, and it
 *      stays consistent with the runtime guard: every handler that calls
 *      `destructiveOperationGuard(` is annotated `destructiveHint: true`. Handlers are
 *      NEVER executed (that can fire live Pipedrive writes); the scan reads source text,
 *      mirroring tests/unit/gen-docs.test.ts.
 *   3. Read/write split and idempotency match the verb taxonomy, with explicit counts so
 *      the overall surface can't drift silently.
 *   4. tools/list (`toolDefinitions`) actually exposes the annotations.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { allTools, toolDefinitions } from '../../src/tools/index.js';
import {
  VERB_SEMANTICS,
  toolVerb,
  verbSemantics,
  buildToolAnnotations,
} from '../../src/tools/annotations.js';

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/tools');

/** Expected registered tool count; bump in lockstep with the live registry. */
const EXPECTED_TOOL_COUNT = 155;
/** Verb prefixes that denote a read-only operation. */
const READ_VERBS = new Set(['list', 'get', 'search']);

/**
 * Statically derive the set of handler function names that call
 * `destructiveOperationGuard(`. NEVER imports or runs handler code (see gen-docs.test.ts).
 */
function guardedHandlerNames(): Set<string> {
  const guarded = new Set<string>();
  const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  for (const file of files) {
    const src = readFileSync(join(TOOLS_DIR, file), 'utf8');
    const matches = [...src.matchAll(/export async function (\w+)/g)];
    for (let i = 0; i < matches.length; i++) {
      const name = matches[i][1];
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? src.length) : src.length;
      if (src.slice(start, end).includes('destructiveOperationGuard(')) {
        guarded.add(name);
      }
    }
  }
  return guarded;
}

type ToolWithHandler = { name: string; destructive?: boolean; handler?: (...args: unknown[]) => unknown };

describe('tool annotations', () => {
  describe('coverage', () => {
    it(`registers exactly ${EXPECTED_TOOL_COUNT} tools`, () => {
      expect(allTools.length).toBe(EXPECTED_TOOL_COUNT);
    });

    it('gives every registered tool a complete annotations object', () => {
      for (const tool of allTools) {
        const a = buildToolAnnotations(tool);
        expect(typeof a.readOnlyHint, `${tool.name}.readOnlyHint`).toBe('boolean');
        expect(typeof a.destructiveHint, `${tool.name}.destructiveHint`).toBe('boolean');
        expect(typeof a.idempotentHint, `${tool.name}.idempotentHint`).toBe('boolean');
        expect(a.openWorldHint, `${tool.name}.openWorldHint`).toBe(true);
      }
    });

    it('maps every tool verb (no tool falls through to the fallback)', () => {
      for (const tool of allTools) {
        const verb = toolVerb(tool.name);
        expect(
          VERB_SEMANTICS,
          `verb '${verb}' (tool ${tool.name}) is unmapped — add it to VERB_SEMANTICS`,
        ).toHaveProperty(verb);
      }
    });

    it('exposes annotations on every tools/list definition', () => {
      expect(toolDefinitions.length).toBe(allTools.length);
      for (const def of toolDefinitions) {
        expect(def.annotations, `${def.name} tools/list entry has annotations`).toBeDefined();
        expect(typeof def.annotations.readOnlyHint).toBe('boolean');
      }
    });
  });

  describe('read/write classification', () => {
    it('marks list/get/search tools read-only, idempotent, non-destructive', () => {
      for (const tool of allTools) {
        if (!READ_VERBS.has(toolVerb(tool.name))) continue;
        const a = buildToolAnnotations(tool);
        expect(a.readOnlyHint, `${tool.name} readOnly`).toBe(true);
        expect(a.idempotentHint, `${tool.name} idempotent`).toBe(true);
        expect(a.destructiveHint, `${tool.name} not destructive`).toBe(false);
      }
    });

    it('marks every non-read verb as a write (readOnlyHint=false)', () => {
      for (const tool of allTools) {
        if (READ_VERBS.has(toolVerb(tool.name))) continue;
        expect(buildToolAnnotations(tool).readOnlyHint, `${tool.name} is a write`).toBe(false);
      }
    });

    it('splits the surface into 69 reads and 86 writes', () => {
      const reads = allTools.filter((t) => buildToolAnnotations(t).readOnlyHint).length;
      expect(reads).toBe(69);
      expect(allTools.length - reads).toBe(86);
    });
  });

  describe('destructiveHint ↔ declared field ↔ runtime guard', () => {
    it('sources destructiveHint from the declared `destructive` field (both directions)', () => {
      for (const tool of allTools as ToolWithHandler[]) {
        expect(buildToolAnnotations(tool).destructiveHint, `${tool.name}`).toBe(tool.destructive === true);
      }
    });

    it('never marks a read-only tool destructive', () => {
      for (const tool of allTools) {
        const a = buildToolAnnotations(tool);
        if (a.destructiveHint) {
          expect(a.readOnlyHint, `${tool.name} is destructive so cannot be read-only`).toBe(false);
        }
      }
    });

    it('annotates every guard-protected handler destructiveHint=true (static scan, no execution)', () => {
      const guarded = guardedHandlerNames();
      for (const tool of allTools as ToolWithHandler[]) {
        const handlerName = tool.handler?.name;
        expect(handlerName, `${tool.name} has a named handler`).toBeTruthy();
        if (guarded.has(handlerName as string)) {
          expect(
            buildToolAnnotations(tool).destructiveHint,
            `${tool.name} (handler ${handlerName}) is guarded but not destructiveHint=true`,
          ).toBe(true);
        }
      }
    });

    it('counts exactly 31 destructive tools', () => {
      expect(allTools.filter((t) => buildToolAnnotations(t).destructiveHint).length).toBe(31);
    });

    it('flags the deal→lead conversion but not its non-destructive lookalikes', () => {
      const hint = (name: string) => {
        const tool = allTools.find((t) => t.name === name);
        expect(tool, `${name} should exist`).toBeDefined();
        return buildToolAnnotations(tool!);
      };
      expect(hint('pipedrive_convert_deal_to_lead').destructiveHint).toBe(true);
      expect(hint('pipedrive_convert_lead_to_deal').destructiveHint).toBe(false);
      const archive = hint('pipedrive_archive_project');
      expect(archive.destructiveHint).toBe(false);
      expect(archive.readOnlyHint).toBe(false);
    });
  });

  describe('idempotency by verb', () => {
    const cases: Array<[string, boolean]> = [
      ['pipedrive_update_deal', true],
      ['pipedrive_delete_deal', true],
      ['pipedrive_archive_project', true],
      ['pipedrive_get_deal', true],
      ['pipedrive_create_deal', false],
      ['pipedrive_add_deal_product', false],
      ['pipedrive_bulk_add_deal_products', false],
      ['pipedrive_convert_deal_to_lead', false],
      ['pipedrive_upload_product_image', false],
    ];
    it.each(cases)('%s → idempotentHint=%s', (name, expected) => {
      const tool = allTools.find((t) => t.name === name);
      expect(tool, `${name} should exist`).toBeDefined();
      expect(buildToolAnnotations(tool!).idempotentHint).toBe(expected);
    });
  });

  describe('buildToolAnnotations (pure)', () => {
    it('derives read semantics from the verb regardless of the destructive field', () => {
      // A read verb is never destructive even if a stray flag were set.
      expect(buildToolAnnotations({ name: 'pipedrive_get_x', destructive: true })).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('derives a guarded delete as a destructive, idempotent write', () => {
      expect(buildToolAnnotations({ name: 'pipedrive_delete_x', destructive: true })).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    });

    it('treats an unknown verb as a conservative non-idempotent write', () => {
      expect(verbSemantics('pipedrive_frobnicate_x')).toEqual({ readOnly: false, idempotent: false });
      expect(buildToolAnnotations({ name: 'pipedrive_frobnicate_x' })).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });
  });
});
