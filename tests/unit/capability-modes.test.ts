/**
 * Tests for the capability-mode core (src/capability-modes.ts).
 *
 * Mode resolution and tool classification are pure and metadata-derived, so these tests
 * lock:
 *   1. Resolution precedence (PIPEDRIVE_MODE authoritative, legacy-flag derivation,
 *      fail-closed-to-read-only on an unknown value) against explicit env objects.
 *   2. Classification against the LIVE `allTools` registry, with explicit counts
 *      (69 / 124 / 155) so the enforced surface cannot drift silently.
 *   3. Test-isolation: the tests/setup.ts beforeEach clears both vars, so a value set in
 *      one test does not leak into the next.
 */

import { describe, it, expect } from 'vitest';

import { allTools } from '../../src/tools/index.js';
import { buildToolAnnotations } from '../../src/tools/annotations.js';
import {
  CAPABILITY_MODES,
  describeCapabilityMode,
  resolveCapabilityMode,
  isToolAllowedInMode,
  capabilityModeStartupLines,
  type CapabilityMode,
} from '../../src/capability-modes.js';

/** Live-registry counts; bump in lockstep with tool-annotations.test.ts. */
const TOTAL_TOOLS = 155;
const READ_TOOLS = 69;
const SAFE_WRITE_TOOLS = 124; // all tools except the 31 destructive

describe('capability modes', () => {
  describe('CAPABILITY_MODES', () => {
    it('lists the three tiers least → most permissive', () => {
      expect(CAPABILITY_MODES).toEqual(['read-only', 'safe-write', 'full']);
    });
  });

  describe('resolveCapabilityMode — PIPEDRIVE_MODE authoritative', () => {
    it.each(['read-only', 'safe-write', 'full'] as const)('uses an explicit %s', (mode) => {
      expect(resolveCapabilityMode({ PIPEDRIVE_MODE: mode })).toBe(mode);
    });

    it('lets PIPEDRIVE_MODE win over PIPEDRIVE_ENABLE_DESTRUCTIVE', () => {
      expect(
        resolveCapabilityMode({ PIPEDRIVE_MODE: 'read-only', PIPEDRIVE_ENABLE_DESTRUCTIVE: 'true' }),
      ).toBe('read-only');
    });

    it('normalizes case and surrounding whitespace of a valid value', () => {
      expect(resolveCapabilityMode({ PIPEDRIVE_MODE: 'FULL ' })).toBe('full');
      expect(resolveCapabilityMode({ PIPEDRIVE_MODE: '  Read-Only  ' })).toBe('read-only');
      expect(resolveCapabilityMode({ PIPEDRIVE_MODE: 'Safe-Write' })).toBe('safe-write');
    });
  });

  describe('resolveCapabilityMode — derivation from the legacy flag', () => {
    it('derives full from PIPEDRIVE_ENABLE_DESTRUCTIVE=true when PIPEDRIVE_MODE is unset', () => {
      expect(resolveCapabilityMode({ PIPEDRIVE_ENABLE_DESTRUCTIVE: 'true' })).toBe('full');
    });

    it('derives safe-write from PIPEDRIVE_ENABLE_DESTRUCTIVE=false', () => {
      expect(resolveCapabilityMode({ PIPEDRIVE_ENABLE_DESTRUCTIVE: 'false' })).toBe('safe-write');
    });

    it('defaults to safe-write when neither var is set (today’s out-of-box behavior)', () => {
      expect(resolveCapabilityMode({})).toBe('safe-write');
    });

    it('treats uppercase TRUE as NOT full, matching getConfig()’s strict === "true"', () => {
      expect(resolveCapabilityMode({ PIPEDRIVE_ENABLE_DESTRUCTIVE: 'TRUE' })).toBe('safe-write');
    });
  });

  describe('resolveCapabilityMode — fail-closed on an unrecognized value (KTD4)', () => {
    it.each(['readonly', 'garbage', 'write', 'destructive'])(
      'resolves %p to read-only',
      (value) => {
        expect(resolveCapabilityMode({ PIPEDRIVE_MODE: value })).toBe('read-only');
      },
    );

    it('ignores the legacy flag entirely when an unknown PIPEDRIVE_MODE is set', () => {
      expect(
        resolveCapabilityMode({ PIPEDRIVE_MODE: 'garbage', PIPEDRIVE_ENABLE_DESTRUCTIVE: 'true' }),
      ).toBe('read-only');
    });
  });

  describe('resolveCapabilityMode — a blank value is treated as unset (MCPB empty-substitution guard)', () => {
    // An MCPB host may substitute an empty string for an optional user_config field left at
    // its default; a blank value must therefore reproduce the documented default, not fail
    // closed to read-only the way a typo does.
    it.each(['', '   ', '\t'])(
      'resolves a blank PIPEDRIVE_MODE (%p) to the safe-write default, not read-only',
      (value) => {
        expect(resolveCapabilityMode({ PIPEDRIVE_MODE: value })).toBe('safe-write');
      },
    );

    it('derives from the legacy flag when PIPEDRIVE_MODE is blank, exactly as if it were unset', () => {
      expect(
        resolveCapabilityMode({ PIPEDRIVE_MODE: '', PIPEDRIVE_ENABLE_DESTRUCTIVE: 'true' }),
      ).toBe('full');
    });

    it('reports a blank value as a clean unset (no invalidMode, no unrecognized warning)', () => {
      expect(describeCapabilityMode({ PIPEDRIVE_MODE: '   ' })).toEqual({
        mode: 'safe-write',
        invalidMode: false,
        derivedFromLegacyFlag: false,
      });
      expect(capabilityModeStartupLines({ PIPEDRIVE_MODE: '' }).join('\n')).not.toMatch(/unrecognized/i);
    });

    // Pin the "blank" boundary (defined by String.prototype.trim()) so a future refactor of
    // the normalize step can't silently reclassify a control/zero-width char as blank and
    // route it through legacy derivation. Security invariant holds either way: nothing here
    // resolves above safe-write without the operator's separate legacy opt-in.
    // (Chars built via fromCharCode to keep this source pure-ASCII.)
    it('treats trim()-whitespace (NBSP) as blank but zero-width/control chars as typos', () => {
      const NBSP = String.fromCharCode(0x00a0); // trim()-whitespace -> blank -> default
      const ZWSP = String.fromCharCode(0x200b); // NOT trim()-whitespace -> typo
      const NUL = String.fromCharCode(0x00); //    NOT trim()-whitespace -> typo
      expect(resolveCapabilityMode({ PIPEDRIVE_MODE: NBSP })).toBe('safe-write');
      expect(resolveCapabilityMode({ PIPEDRIVE_MODE: ZWSP })).toBe('read-only');
      expect(resolveCapabilityMode({ PIPEDRIVE_MODE: NUL })).toBe('read-only');
    });

  });

  describe('describeCapabilityMode — derivation metadata', () => {
    it('flags an invalid value with the raw text and no legacy derivation', () => {
      const r = describeCapabilityMode({ PIPEDRIVE_MODE: 'garbage' });
      expect(r).toEqual({ mode: 'read-only', invalidMode: true, rawMode: 'garbage', derivedFromLegacyFlag: false });
    });

    it('flags legacy derivation only when PIPEDRIVE_MODE is unset and the flag is present', () => {
      expect(describeCapabilityMode({ PIPEDRIVE_ENABLE_DESTRUCTIVE: 'true' })).toEqual({
        mode: 'full',
        invalidMode: false,
        derivedFromLegacyFlag: true,
      });
      // Both unset → no legacy derivation (so no deprecation notice fires in U5).
      expect(describeCapabilityMode({})).toEqual({
        mode: 'safe-write',
        invalidMode: false,
        derivedFromLegacyFlag: false,
      });
      // PIPEDRIVE_MODE set → never "derived", even if the flag is also present.
      expect(describeCapabilityMode({ PIPEDRIVE_MODE: 'full', PIPEDRIVE_ENABLE_DESTRUCTIVE: 'false' })).toEqual({
        mode: 'full',
        invalidMode: false,
        derivedFromLegacyFlag: false,
      });
    });
  });

  describe('purity', () => {
    it('does not mutate the passed env object', () => {
      const env = { PIPEDRIVE_MODE: 'FULL ', PIPEDRIVE_ENABLE_DESTRUCTIVE: 'true' };
      const snapshot = { ...env };
      resolveCapabilityMode(env);
      describeCapabilityMode(env);
      expect(env).toEqual(snapshot);
    });
  });

  describe('isToolAllowedInMode — pure cases', () => {
    it('allows a read tool in every mode', () => {
      for (const mode of CAPABILITY_MODES) {
        expect(isToolAllowedInMode({ name: 'pipedrive_get_x' }, mode), mode).toBe(true);
      }
    });

    it('allows a non-destructive write in safe-write/full but not read-only', () => {
      expect(isToolAllowedInMode({ name: 'pipedrive_create_x' }, 'read-only')).toBe(false);
      expect(isToolAllowedInMode({ name: 'pipedrive_create_x' }, 'safe-write')).toBe(true);
      expect(isToolAllowedInMode({ name: 'pipedrive_create_x' }, 'full')).toBe(true);
    });

    it('allows a destructive write only in full', () => {
      const tool = { name: 'pipedrive_delete_x', destructive: true };
      expect(isToolAllowedInMode(tool, 'read-only')).toBe(false);
      expect(isToolAllowedInMode(tool, 'safe-write')).toBe(false);
      expect(isToolAllowedInMode(tool, 'full')).toBe(true);
    });

    it('treats an undefined tool as allowed in every mode (dispatcher fall-through)', () => {
      for (const mode of CAPABILITY_MODES) {
        expect(isToolAllowedInMode(undefined, mode), mode).toBe(true);
      }
    });
  });

  describe('classification against the live registry', () => {
    const isRead = (name: string) => buildToolAnnotations({ name }).readOnlyHint === true;
    const isDestructive = (t: { name: string; destructive?: boolean }) =>
      buildToolAnnotations(t).destructiveHint === true;

    const allowedCount = (mode: CapabilityMode) =>
      allTools.filter((t) => isToolAllowedInMode(t, mode)).length;

    it('read-only allows exactly the 69 read tools and zero writes', () => {
      expect(allowedCount('read-only')).toBe(READ_TOOLS);
      for (const tool of allTools) {
        expect(isToolAllowedInMode(tool, 'read-only'), tool.name).toBe(isRead(tool.name));
      }
    });

    it('safe-write allows exactly 124 (every read, every non-destructive write, no destructive)', () => {
      expect(allowedCount('safe-write')).toBe(SAFE_WRITE_TOOLS);
      for (const tool of allTools) {
        if (isDestructive(tool)) {
          expect(isToolAllowedInMode(tool, 'safe-write'), `${tool.name} destructive`).toBe(false);
        } else {
          expect(isToolAllowedInMode(tool, 'safe-write'), `${tool.name} non-destructive`).toBe(true);
        }
      }
    });

    it('full allows all 155 tools', () => {
      expect(allowedCount('full')).toBe(TOTAL_TOOLS);
      for (const tool of allTools) {
        expect(isToolAllowedInMode(tool, 'full'), tool.name).toBe(true);
      }
    });

    it('never allows a destructive tool below full, and always allows every read in read-only', () => {
      for (const tool of allTools) {
        if (isDestructive(tool)) {
          expect(isToolAllowedInMode(tool, 'read-only'), `${tool.name}`).toBe(false);
          expect(isToolAllowedInMode(tool, 'safe-write'), `${tool.name}`).toBe(false);
        }
        if (isRead(tool.name)) {
          expect(isToolAllowedInMode(tool, 'read-only'), `${tool.name}`).toBe(true);
        }
      }
    });
  });

  describe('capabilityModeStartupLines (U5)', () => {
    const joined = (env: Record<string, string | undefined>) => capabilityModeStartupLines(env).join('\n');

    it('reports the resolved mode with no deprecation/warning for an explicit valid mode', () => {
      const lines = capabilityModeStartupLines({ PIPEDRIVE_MODE: 'read-only' });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('read-only');
      expect(joined({ PIPEDRIVE_MODE: 'read-only' })).not.toMatch(/deprecated|unrecognized/i);
    });

    it('reports full and a deprecation line when derived from the legacy flag', () => {
      const text = joined({ PIPEDRIVE_ENABLE_DESTRUCTIVE: 'true' });
      expect(text).toContain('full');
      expect(text).toMatch(/deprecated/i);
      expect(text).toContain('PIPEDRIVE_MODE');
    });

    it('warns on an unrecognized value, naming the valid values and the read-only fallback', () => {
      const text = joined({ PIPEDRIVE_MODE: 'garbage' });
      expect(text).toMatch(/unrecognized/i);
      expect(text).toContain('read-only');
      expect(text).toContain('safe-write');
      expect(text).toContain('full');
      // and the resolved-mode line still reports read-only
      expect(capabilityModeStartupLines({ PIPEDRIVE_MODE: 'garbage' })[0]).toContain('read-only');
    });

    it('reports safe-write with no deprecation when neither var is set', () => {
      const lines = capabilityModeStartupLines({});
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('safe-write');
    });
  });

  // Two paired tests proving the tests/setup.ts beforeEach clears both vars: the first
  // sets PIPEDRIVE_MODE, the second asserts it did not leak (resolution falls back to
  // the default). Order matters, which vitest preserves within a file.
  describe('test isolation (R11)', () => {
    it('sets PIPEDRIVE_MODE for this test only', () => {
      process.env.PIPEDRIVE_MODE = 'read-only';
      expect(resolveCapabilityMode()).toBe('read-only');
    });

    it('does not see the previous test’s PIPEDRIVE_MODE', () => {
      expect(process.env.PIPEDRIVE_MODE).toBeUndefined();
      expect(resolveCapabilityMode()).toBe('safe-write');
    });
  });
});
