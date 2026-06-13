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

import { allTools, toolDefinitions } from '../../src/tools/index.js';
import {
  VERB_SEMANTICS,
  toolVerb,
  verbSemantics,
  buildToolAnnotations,
} from '../../src/tools/annotations.js';
import { guardedHandlerNames, type ToolWithHandler } from '../helpers/guardedHandlers.js';

/** Expected registered tool count; bump in lockstep with the live registry. */
const EXPECTED_TOOL_COUNT = 155;
/** Verb prefixes that denote a read-only operation, derived from the semantics table so it
 *  can never drift from VERB_SEMANTICS. */
const READ_VERBS = new Set(
  Object.entries(VERB_SEMANTICS)
    .filter(([, s]) => s.readOnly)
    .map(([verb]) => verb),
);

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
      // Atomic bulk-delete-by-id fails on repeat (ids already gone) → not idempotent,
      // unlike its update sibling which converges.
      ['pipedrive_delete_deal_field_options', false],
      ['pipedrive_update_deal_field_options', true],
    ];
    it.each(cases)('%s → idempotentHint=%s', (name, expected) => {
      const tool = allTools.find((t) => t.name === name);
      expect(tool, `${name} should exist`).toBeDefined();
      expect(buildToolAnnotations(tool!).idempotentHint).toBe(expected);
    });

    it('every tool annotation matches its verb semantics (exhaustive)', () => {
      for (const tool of allTools) {
        expect(buildToolAnnotations(tool).idempotentHint, `${tool.name} idempotentHint`).toBe(
          verbSemantics(tool.name).idempotent,
        );
      }
    });
  });

  describe('atomic bulk-delete exception', () => {
    // The only place the `delete` verb's default idempotency is overridden: the four
    // delete_<entity>_field_options tools issue an atomic bulk-delete-by-id that errors on
    // repeat. Lock the exception to exactly these four so it can't quietly widen or vanish.
    const ATOMIC_BULK_DELETE = /^pipedrive_delete_\w+_field_options$/;

    it('marks exactly the four field-option bulk deletes non-idempotent', () => {
      const flipped = allTools
        .filter((t) => toolVerb(t.name) === 'delete' && !buildToolAnnotations(t).idempotentHint)
        .map((t) => t.name)
        .sort();
      expect(flipped).toEqual([
        'pipedrive_delete_deal_field_options',
        'pipedrive_delete_organization_field_options',
        'pipedrive_delete_person_field_options',
        'pipedrive_delete_product_field_options',
      ]);
      // The set of non-idempotent deletes is exactly the names matching the override regex.
      for (const tool of allTools) {
        if (toolVerb(tool.name) !== 'delete') continue;
        expect(buildToolAnnotations(tool).idempotentHint, `${tool.name}`).toBe(
          !ATOMIC_BULK_DELETE.test(tool.name),
        );
      }
    });

    it('keeps these deletes as destructive, non-read writes despite the override', () => {
      for (const tool of allTools.filter((t) => ATOMIC_BULK_DELETE.test(t.name))) {
        const a = buildToolAnnotations(tool);
        expect(a.readOnlyHint, `${tool.name} readOnly`).toBe(false);
        expect(a.idempotentHint, `${tool.name} idempotent`).toBe(false);
        expect(a.destructiveHint, `${tool.name} destructive`).toBe(true);
      }
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

    it('overrides idempotency only for atomic bulk-delete-by-id (field-option) deletes', () => {
      // A field-option bulk delete is a non-idempotent write; a plain entity delete stays idempotent.
      expect(verbSemantics('pipedrive_delete_x_field_options')).toEqual({ readOnly: false, idempotent: false });
      expect(verbSemantics('pipedrive_delete_x')).toEqual({ readOnly: false, idempotent: true });
    });
  });
});
