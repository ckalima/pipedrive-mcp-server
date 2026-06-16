/**
 * Single-source-of-truth guard for the version string and the registry's advertised env.
 *
 * `package.json` is the canonical version. The release workflow (`.github/workflows/
 * release.yml`) hard-checks the pushed git tag against `package.json`, and
 * `tests/unit/gen-docs.test.ts` already pins `bundle/manifest.json` to it. But two version
 * sources are hand-maintained with NO other guard:
 *   - `SERVER_VERSION` in `src/index.ts` (reported to clients over MCP), and
 *   - `server.json` (the MCP-registry entry, published by a separate manual step).
 * A bump that misses either ships an inconsistent server. This test fails the bump until
 * every source agrees — turning a silent drift into a red test. It also pins that
 * `server.json` advertises `PIPEDRIVE_MODE`, so the registry entry can't fall behind the
 * capability-modes feature again.
 */
import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { SERVER_VERSION } from '../../src/index.js';

const readJson = (rel: string) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

const pkg = readJson('../../package.json') as { version: string };
const serverJson = readJson('../../server.json') as {
  version: string;
  packages: { version: string; environmentVariables: { name: string }[] }[];
};

describe('version consistency', () => {
  it('SERVER_VERSION (src/index.ts) matches package.json', () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it('server.json top-level and per-package versions match package.json', () => {
    expect(serverJson.version).toBe(pkg.version);
    for (const p of serverJson.packages) {
      expect(p.version, `server.json package ${p.version}`).toBe(pkg.version);
    }
  });

  it('server.json advertises PIPEDRIVE_MODE so the registry entry tracks the feature', () => {
    const names = serverJson.packages.flatMap((p) =>
      p.environmentVariables.map((e) => e.name),
    );
    expect(names).toContain('PIPEDRIVE_MODE');
  });
});
