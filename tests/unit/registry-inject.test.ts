/**
 * Unit tests for the pure rewrite helpers in scripts/registry-inject.ts — the logic that puts
 * the real .mcpb URL + SHA-256 into server.json before `mcp-publisher publish`. The script's
 * direct-invocation guard means importing it here does NOT run main(), so these exercise the
 * exported functions in isolation.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { injectMcpb, mcpbFilename, mcpbUrl, sha256File } from '../../scripts/registry-inject.js';

const baseServerJson = () => ({
  name: 'io.github.ckalima/pipedrive-mcp-server',
  version: '9.9.9',
  packages: [
    { registryType: 'npm', identifier: '@ckalima/pipedrive-mcp-server', version: '9.9.9' },
    {
      registryType: 'mcpb',
      identifier: 'https://github.com/ckalima/pipedrive-mcp-server/releases/download/v0.0.0/pipedrive-mcp-server-0.0.0.mcpb',
      version: '0.0.0',
      fileSha256: '0'.repeat(64),
      transport: { type: 'stdio' },
    },
  ],
});

describe('mcpbFilename', () => {
  it('is the single source of truth for the .mcpb filename pattern', () => {
    // build-mcpb.ts (artifact name) and release.yml (the `test -f` pattern) must agree with
    // this; pinning it here catches a rename before it ships a dangling registry URL.
    expect(mcpbFilename('2.4.0')).toBe('pipedrive-mcp-server-2.4.0.mcpb');
  });
});

describe('mcpbUrl', () => {
  it('templates the GitHub Release URL, ends with mcpbFilename, and contains "mcp"', () => {
    expect(mcpbUrl('2.4.0')).toBe(
      'https://github.com/ckalima/pipedrive-mcp-server/releases/download/v2.4.0/pipedrive-mcp-server-2.4.0.mcpb',
    );
    expect(mcpbUrl('2.4.0').endsWith(`/${mcpbFilename('2.4.0')}`)).toBe(true);
    expect(mcpbUrl('2.4.0')).toContain('mcp');
  });
});

describe('sha256File', () => {
  it('matches node:crypto sha256 of the file bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcpb-'));
    const f = join(dir, 'x.mcpb');
    const bytes = Buffer.from('pretend mcpb zip bytes');
    writeFileSync(f, bytes);
    const expected = createHash('sha256').update(bytes).digest('hex');
    expect(sha256File(f)).toBe(expected);
  });
});

describe('injectMcpb', () => {
  const realHash = 'a'.repeat(64);

  it('rewrites the mcpb identifier + version + fileSha256 to the given version/hash', () => {
    const out = injectMcpb(baseServerJson(), '2.4.0', realHash);
    const mcpb = out.packages.find((p) => p.registryType === 'mcpb')!;
    expect(mcpb.identifier).toBe(mcpbUrl('2.4.0'));
    expect(mcpb.version).toBe('2.4.0');
    expect(mcpb.fileSha256).toBe(realHash);
  });

  it('does not mutate the input or touch the npm package', () => {
    const input = baseServerJson();
    const out = injectMcpb(input, '2.4.0', realHash);
    expect(input.packages.find((p) => p.registryType === 'mcpb')!.fileSha256).toBe('0'.repeat(64));
    expect(out.packages.find((p) => p.registryType === 'npm')!.identifier).toBe(
      '@ckalima/pipedrive-mcp-server',
    );
  });

  it('rejects a non-64-hex hash', () => {
    expect(() => injectMcpb(baseServerJson(), '2.4.0', 'deadbeef')).toThrow(/64 lowercase hex/);
    expect(() => injectMcpb(baseServerJson(), '2.4.0', 'A'.repeat(64))).toThrow(/64 lowercase hex/);
  });

  it('throws when there is no mcpb package', () => {
    const noMcpb = { packages: baseServerJson().packages.filter((p) => p.registryType !== 'mcpb') };
    expect(noMcpb.packages).toHaveLength(1); // sanity: only the npm package remains
    expect(() => injectMcpb(noMcpb, '2.4.0', realHash)).toThrow(/no package with registryType "mcpb"/);
  });
});
