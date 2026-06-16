/**
 * Unit tests for the host config descriptor table and renderer (U3).
 *
 * Descriptor values are confirmed against current official docs (2026); see the
 * source-file header. The committed→never-literal invariant and per-host fixture
 * shapes are asserted here so a wrong top-level key, path, or secret mechanism
 * fails a test instead of shipping silently (Risks: descriptor drift).
 */

import { describe, it, expect } from 'vitest';
import {
  HOSTS,
  getTarget,
  defaultScope,
  isHostId,
  renderConfig,
  resolveTargetPath,
  CLAUDE_CODE_SCOPE_IDS,
  type PlatformContext,
} from '../../src/cli/config-targets.js';

const KEY = 'k'.repeat(40);

function ctx(overrides: Partial<PlatformContext> = {}): PlatformContext {
  return {
    platform: 'darwin',
    homedir: '/Users/jane',
    cwd: '/Users/jane/project',
    env: {},
    ...overrides,
  };
}

/** Every (host, scope) target the table exposes, for invariant sweeps. */
function allTargets() {
  return HOSTS.flatMap((h) =>
    h.scopes ? h.scopes.map((s) => getTarget(h.id, s.id)!) : [getTarget(h.id)!],
  );
}

describe('descriptor invariants (U3)', () => {
  it('every host/scope combination resolves to a target', () => {
    for (const t of allTargets()) expect(t).toBeDefined();
  });

  it('a committed/shared target NEVER uses a literal key (R8/KTD3)', () => {
    for (const t of allTargets()) {
      if (t.committed) expect(t.secret.kind).not.toBe('literal');
    }
  });

  it('a committed target rendered output never contains the raw key (substring)', () => {
    for (const t of allTargets()) {
      if (!t.committed || t.delivery !== 'file') continue;
      const rendered = renderConfig(t, KEY);
      expect(JSON.stringify(rendered.block)).not.toContain(KEY);
      expect(rendered.carriesLiteralKey).toBe(false);
    }
  });

  it('a user-private file target DOES carry the literal key', () => {
    const desktop = renderConfig(getTarget('claude-desktop')!, KEY);
    expect(JSON.stringify(desktop.block)).toContain(KEY);
    expect(desktop.carriesLiteralKey).toBe(true);
  });
});

describe('top-level keys (U3)', () => {
  it('VS Code emits the `servers` key and an inputs array', () => {
    const rendered = renderConfig(getTarget('vscode', 'workspace')!, KEY);
    expect(rendered.block).toHaveProperty('servers');
    expect(rendered.block).not.toHaveProperty('mcpServers');
    expect(rendered.block).toHaveProperty('inputs');
    const inputs = (rendered.block as { inputs: unknown[] }).inputs;
    expect(inputs[0]).toMatchObject({ type: 'promptString', password: true });
  });

  it('non-VS-Code file hosts emit `mcpServers`', () => {
    for (const t of allTargets()) {
      if (t.delivery !== 'file' || t.host === 'vscode') continue;
      const block = renderConfig(t, KEY).block!;
      expect(block).toHaveProperty('mcpServers');
      expect(block).not.toHaveProperty('servers');
    }
  });
});

describe('secret mechanisms (U3)', () => {
  it('Claude Code project renders ${PIPEDRIVE_API_KEY}', () => {
    const rendered = renderConfig(getTarget('claude-code', 'project')!, KEY);
    expect(JSON.stringify(rendered.block)).toContain('${PIPEDRIVE_API_KEY}');
  });

  it('Cursor project renders ${env:PIPEDRIVE_API_KEY}', () => {
    const rendered = renderConfig(getTarget('cursor', 'project')!, KEY);
    expect(JSON.stringify(rendered.block)).toContain('${env:PIPEDRIVE_API_KEY}');
  });

  it('VS Code renders ${input:...} with a password:true input', () => {
    const rendered = renderConfig(getTarget('vscode', 'workspace')!, KEY);
    expect(JSON.stringify(rendered.block)).toContain('${input:pipedrive-api-key}');
  });

  it('Claude Code local/user are CLI-delivered (no block)', () => {
    for (const scope of ['local', 'user']) {
      const rendered = renderConfig(getTarget('claude-code', scope)!, KEY);
      expect(rendered.block).toBeUndefined();
      expect(rendered.carriesLiteralKey).toBe(false);
    }
  });
});

describe('server entry shape mirrors the README block (U3)', () => {
  it('uses npx + the scoped package under the "pipedrive" name', () => {
    const block = renderConfig(getTarget('claude-desktop')!, KEY).block as {
      mcpServers: { pipedrive: { command: string; args: string[] } };
    };
    expect(block.mcpServers.pipedrive.command).toBe('npx');
    expect(block.mcpServers.pipedrive.args).toEqual(['-y', '@ckalima/pipedrive-mcp-server']);
  });
});

describe('OS path resolution (U3)', () => {
  it('Claude Desktop resolves the documented macOS path', () => {
    const t = getTarget('claude-desktop')!;
    expect(resolveTargetPath(t, ctx({ platform: 'darwin' }))).toBe(
      '/Users/jane/Library/Application Support/Claude/claude_desktop_config.json',
    );
  });

  it('Claude Desktop resolves the documented Windows path from APPDATA', () => {
    const t = getTarget('claude-desktop')!;
    const path = resolveTargetPath(
      t,
      ctx({ platform: 'win32', env: { APPDATA: 'C:\\Users\\jane\\AppData\\Roaming' } }),
    );
    expect(path).toBe('C:\\Users\\jane\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
  });

  it('Claude Desktop is unsupported (null) on Linux', () => {
    const t = getTarget('claude-desktop')!;
    expect(resolveTargetPath(t, ctx({ platform: 'linux' }))).toBeNull();
  });

  it('project-relative targets resolve under cwd', () => {
    expect(resolveTargetPath(getTarget('claude-code', 'project')!, ctx())).toBe(
      '/Users/jane/project/.mcp.json',
    );
    expect(resolveTargetPath(getTarget('cursor', 'project')!, ctx())).toBe(
      '/Users/jane/project/.cursor/mcp.json',
    );
    expect(resolveTargetPath(getTarget('vscode', 'workspace')!, ctx())).toBe(
      '/Users/jane/project/.vscode/mcp.json',
    );
  });

  it('Windsurf resolves under the home .codeium path', () => {
    expect(resolveTargetPath(getTarget('windsurf')!, ctx())).toBe(
      '/Users/jane/.codeium/windsurf/mcp_config.json',
    );
  });

  it('VS Code user scope has no stable path (print-only)', () => {
    expect(resolveTargetPath(getTarget('vscode', 'user')!, ctx())).toBeNull();
  });
});

describe('target resolution + fail-closed lookup (U3 / R17)', () => {
  it('isHostId recognizes supported hosts and rejects others', () => {
    expect(isHostId('cursor')).toBe(true);
    expect(isHostId('emacs')).toBe(false);
  });

  it('a scopeless host rejects an explicit scope (illegal combo)', () => {
    expect(getTarget('claude-desktop', 'project')).toBeUndefined();
  });

  it('a scoped host rejects an unknown scope', () => {
    expect(getTarget('claude-code', 'frobnicate')).toBeUndefined();
  });

  it('a scoped host with no scope falls back to its default', () => {
    const t = getTarget('claude-code');
    expect(t?.scope).toBe(defaultScope('claude-code'));
  });

  it('defaultScope is undefined for a scopeless host', () => {
    expect(defaultScope('claude-desktop')).toBeUndefined();
  });
});

describe('CLAUDE_CODE_SCOPE_IDS single source (#3)', () => {
  it('exactly mirrors the Claude Code scopes declared in the HOSTS table', () => {
    const fromHosts = HOSTS.find((h) => h.id === 'claude-code')!.scopes!.map((s) => s.id);
    expect([...CLAUDE_CODE_SCOPE_IDS].sort()).toEqual([...fromHosts].sort());
    // Guards against a second hardcoded copy drifting from the descriptor table.
    expect([...CLAUDE_CODE_SCOPE_IDS].sort()).toEqual(['local', 'project', 'user']);
  });
});
