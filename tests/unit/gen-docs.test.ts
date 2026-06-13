/**
 * Tests for the documentation generator (scripts/gen-docs.ts).
 *
 * The generator derives the README tool table and the MCPB manifest tools array
 * from the live `allTools` registry. These tests lock three things:
 *   1. Coverage: every registered tool reaches both outputs (no silent drop).
 *   2. The declared `destructive` field is honest: it matches a STATIC scan of the
 *      handler source for `destructiveOperationGuard(`. Handlers are NEVER executed
 *      (executing them can fire live Pipedrive writes), so the scan reads source text.
 *   3. Determinism: byte-stable output across repeated builds (the CI drift gate
 *      relies on this).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { allTools } from '../../src/tools/index.js';
import {
  GROUPS,
  classifyAll,
  buildReadmeRegion,
  buildManifestTools,
  buildManifest,
  isDestructive,
  isGrowthPlus,
  stripScope,
} from '../../scripts/gen-docs.js';
import { guardedHandlerNames, type ToolWithHandler } from '../helpers/guardedHandlers.js';

/** Expected registered tool count; bump in lockstep with the live registry. */
const EXPECTED_TOOL_COUNT = 155;

describe('gen-docs generator', () => {
  describe('coverage', () => {
    it('assigns every registered tool to exactly one display group', () => {
      const grouped = GROUPS.flatMap((g) => g.tools.map((t) => t.name));
      expect(grouped.length).toBe(allTools.length);
      expect(new Set(grouped).size).toBe(allTools.length);
      expect(new Set(grouped)).toEqual(new Set(allTools.map((t) => t.name)));
    });

    it(`lists all ${EXPECTED_TOOL_COUNT} tools in the README region`, () => {
      expect(allTools.length).toBe(EXPECTED_TOOL_COUNT);
      const region = buildReadmeRegion();
      for (const tool of allTools) {
        expect(region, `README region missing ${tool.name}`).toContain(`\`${tool.name}\``);
      }
    });

    it('emits one manifest tool entry per registered tool', () => {
      const manifestTools = buildManifestTools();
      expect(manifestTools.length).toBe(allTools.length);
      expect(new Set(manifestTools.map((t) => t.name))).toEqual(new Set(allTools.map((t) => t.name)));
      for (const t of manifestTools) {
        expect(t.description.length, `${t.name} has a description`).toBeGreaterThan(0);
      }
    });
  });

  describe('destructive field ↔ guard invariant (static scan, no handler execution)', () => {
    it('marks a tool destructive iff its handler calls destructiveOperationGuard', () => {
      const guarded = guardedHandlerNames();
      for (const tool of allTools as ToolWithHandler[]) {
        const handlerName = tool.handler?.name;
        expect(handlerName, `${tool.name} has a named handler`).toBeTruthy();
        expect(
          isDestructive(tool),
          `${tool.name} (handler ${handlerName}): declared destructive=${isDestructive(tool)} ` +
            `but guard presence=${guarded.has(handlerName as string)}`,
        ).toBe(guarded.has(handlerName as string));
      }
    });

    it('counts exactly 31 destructive tools', () => {
      expect(classifyAll().filter((c) => c.destructive).length).toBe(31);
    });

    it('flags the genuinely destructive deal→lead conversion (deletes the source deal)', () => {
      const tool = allTools.find((t) => t.name === 'pipedrive_convert_deal_to_lead');
      expect(tool).toBeDefined();
      expect(isDestructive(tool!)).toBe(true);
    });

    it('does NOT flag name-substring lookalikes that are non-destructive', () => {
      // A naive "convert"/"archive" name match would wrongly flag these; the declared
      // field keeps them honest because their handlers have no guard.
      for (const name of ['pipedrive_convert_lead_to_deal', 'pipedrive_archive_project']) {
        const tool = allTools.find((t) => t.name === name);
        expect(tool, `${name} should exist`).toBeDefined();
        expect(isDestructive(tool!), `${name} must not be marked destructive`).toBe(false);
      }
    });
  });

  describe('Growth+ marking', () => {
    it('flags exactly the 4 deal-installment tools', () => {
      const growth = allTools.filter(isGrowthPlus).map((t) => t.name).sort();
      expect(growth).toEqual(
        [
          'pipedrive_add_deal_installment',
          'pipedrive_delete_deal_installment',
          'pipedrive_list_deal_installments',
          'pipedrive_update_deal_installment',
        ].sort(),
      );
    });
  });

  describe('determinism', () => {
    const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

    it('produces byte-identical README regions across builds', () => {
      expect(buildReadmeRegion()).toBe(buildReadmeRegion());
    });

    it('produces byte-identical manifests across builds', () => {
      expect(JSON.stringify(buildManifest())).toBe(JSON.stringify(buildManifest()));
    });

    // The two checks above only prove the generator is a pure function within one
    // process. The real property the CI drift gate enforces is that the generator
    // reproduces the COMMITTED files byte-for-byte; assert that here so a
    // non-idempotent generator (or a forgotten `npm run gen:docs`) fails fast in the
    // unit suite, not only in CI.
    it('reproduces the committed README region byte-for-byte', () => {
      const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
      const begin = '<!-- BEGIN GENERATED TOOLS -->';
      const end = '<!-- END GENERATED TOOLS -->';
      const committed = readme.slice(readme.indexOf(begin), readme.indexOf(end) + end.length);
      expect(buildReadmeRegion()).toBe(committed);
    });

    it('reproduces the committed bundle/manifest.json byte-for-byte', () => {
      const committed = readFileSync(join(ROOT, 'bundle', 'manifest.json'), 'utf8');
      expect(JSON.stringify(buildManifest(), null, 2) + '\n').toBe(committed);
    });
  });

  describe('manifest shape', () => {
    it('tracks package.json name/version/description and keeps required MCPB keys', () => {
      const pkg = JSON.parse(
        readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
      );
      const manifest = buildManifest();
      // name is unscoped (MCPB names carry no npm scope).
      expect(manifest.name).toBe(stripScope(String(pkg.name)));
      expect(manifest.version).toBe(pkg.version);
      expect(manifest.description).toBe(pkg.description);
      // MCPB rejects unknown top-level keys, so the provenance breadcrumb must not leak in.
      expect(manifest).not.toHaveProperty('_generated');
      for (const key of ['manifest_version', 'name', 'version', 'description', 'author', 'server', 'tools']) {
        expect(manifest, `manifest missing required key ${key}`).toHaveProperty(key);
      }
    });
  });
});
