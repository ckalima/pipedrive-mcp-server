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
  packages: {
    registryType: string;
    identifier?: string;
    version: string;
    fileSha256?: string;
    transport?: { type?: string };
    environmentVariables?: { name: string }[];
  }[];
};

// The committed mcpb fileSha256 is an all-zeros sentinel: the real hash is per-build and
// injected by CI (scripts/registry-inject.ts) immediately before publish. Asserting the
// sentinel guarantees no stale real hash is ever committed and mistaken for live.
const SENTINEL_SHA256 = '0'.repeat(64);
const expectedMcpbUrl = (version: string) =>
  `https://github.com/ckalima/pipedrive-mcp-server/releases/download/v${version}/pipedrive-mcp-server-${version}.mcpb`;

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
      (p.environmentVariables ?? []).map((e) => e.name),
    );
    expect(names).toContain('PIPEDRIVE_MODE');
  });
});

describe('mcpb registry descriptor', () => {
  const mcpb = serverJson.packages.filter((p) => p.registryType === 'mcpb');

  it('exactly one mcpb package over stdio transport', () => {
    expect(mcpb).toHaveLength(1);
    expect(mcpb[0].transport?.type).toBe('stdio');
  });

  it('identifier is the version-templated Release URL and contains "mcp"', () => {
    // Drift guard: forces the release-prep version bump to also bump the mcpb URL, the same
    // way SERVER_VERSION and server.json versions are pinned to package.json.
    expect(mcpb[0].identifier).toBe(expectedMcpbUrl(pkg.version));
    expect(mcpb[0].identifier?.toLowerCase()).toContain('mcp'); // registry MCPB URL rule
  });

  it('committed fileSha256 is the all-zeros sentinel (CI injects the real hash)', () => {
    expect(mcpb[0].fileSha256).toBe(SENTINEL_SHA256);
  });

  it('only the mcpb package carries a fileSha256 (npm verifies via mcpName, not a hash)', () => {
    for (const p of serverJson.packages.filter((p) => p.registryType !== 'mcpb')) {
      expect(p.fileSha256, `${p.registryType} package should not carry fileSha256`).toBeUndefined();
    }
  });
});
