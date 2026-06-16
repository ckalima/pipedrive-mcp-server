/**
 * Unit tests for the non-destructive config writer (U4).
 *
 * Uses the real filesystem in a per-test temp dir so mode (0600) and backup
 * assertions exercise actual fs behavior, not a mock.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, existsSync, readdirSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeConfig, claudeMcpAddInvocation } from '../../src/cli/write-config.js';
import { getTarget, renderConfig } from '../../src/cli/config-targets.js';

const KEY = 'z'.repeat(40);
const TS = 'TS';

let dir: string;
let backupDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pd-wc-'));
  backupDir = mkdtempSync(join(tmpdir(), 'pd-bk-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(backupDir, { recursive: true, force: true });
});

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

/** A literal (user-private) target rendered + ready to write. */
function desktopRender() {
  const target = getTarget('claude-desktop')!;
  return { target, rendered: renderConfig(target, KEY) };
}

describe('writeConfig — file targets (U4)', () => {
  it('creates a missing file (and parent dirs) with only our server, mode 0600', () => {
    const path = join(dir, 'nested', 'claude_desktop_config.json');
    const { target, rendered } = desktopRender();

    const outcome = writeConfig(target, rendered, {
      pathOverride: path,
      isInsideGitTree: () => false,
      timestamp: TS,
    });

    expect(outcome.kind).toBe('written');
    expect(existsSync(path)).toBe(true);
    expect(mode(path)).toBe(0o600);
    expect(mode(join(dir, 'nested'))).toBe(0o700); // freshly created config dir is owner-only (L3)
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['pipedrive']);
  });

  it('preserves an existing unrelated server and adds ours', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ mcpServers: { other: { command: 'foo' } } }, null, 2));
    const { target, rendered } = desktopRender();

    writeConfig(target, rendered, { pathOverride: path, isInsideGitTree: () => false, timestamp: TS });

    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.mcpServers.other).toEqual({ command: 'foo' });
    expect(written.mcpServers.pipedrive).toBeDefined();
  });

  it('backs up the pre-write contents byte-for-byte, mode 0600', () => {
    const path = join(dir, 'config.json');
    const before = JSON.stringify({ mcpServers: { other: { command: 'foo' } } }, null, 2);
    writeFileSync(path, before);
    const { target, rendered } = desktopRender();

    const outcome = writeConfig(target, rendered, {
      pathOverride: path,
      isInsideGitTree: () => false,
      timestamp: TS,
    });

    expect(outcome.kind).toBe('written');
    if (outcome.kind !== 'written') return;
    expect(outcome.backupPath).toBe(`${path}.bak-${TS}`);
    expect(readFileSync(outcome.backupPath!, 'utf8')).toBe(before);
    expect(mode(outcome.backupPath!)).toBe(0o600);
  });

  it('tightens a pre-existing mode-0644 file to 0600', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ mcpServers: {} }), { mode: 0o644 });
    expect(mode(path)).toBe(0o644);
    const { target, rendered } = desktopRender();

    writeConfig(target, rendered, { pathOverride: path, isInsideGitTree: () => false, timestamp: TS });

    expect(mode(path)).toBe(0o600);
  });

  it('relocates the backup OUT of a git working tree and prints its path', () => {
    const path = join(dir, '.mcp.json');
    writeFileSync(path, JSON.stringify({ mcpServers: { other: {} } }, null, 2));
    const target = getTarget('claude-code', 'project')!;
    const rendered = renderConfig(target, KEY);

    const outcome = writeConfig(target, rendered, {
      pathOverride: path,
      isInsideGitTree: () => true,
      backupDir,
      timestamp: TS,
    });

    expect(outcome.kind).toBe('written');
    if (outcome.kind !== 'written') return;
    expect(outcome.backupRelocated).toBe(true);
    expect(outcome.backupPath!.startsWith(backupDir)).toBe(true);
    // No .bak left inside the tree.
    expect(readdirSync(dir).some((f) => f.includes('.bak-'))).toBe(false);
  });

  it('aborts on malformed existing JSON, leaving the original byte-for-byte and signalling print', () => {
    const path = join(dir, 'config.json');
    const garbage = 'not json {';
    writeFileSync(path, garbage);
    const { target, rendered } = desktopRender();

    const outcome = writeConfig(target, rendered, {
      pathOverride: path,
      isInsideGitTree: () => false,
      timestamp: TS,
    });

    expect(outcome.kind).toBe('print');
    expect(readFileSync(path, 'utf8')).toBe(garbage);
  });

  it('is idempotent — re-running does not duplicate the server entry', () => {
    const path = join(dir, 'config.json');
    const { target, rendered } = desktopRender();
    const deps = { pathOverride: path, isInsideGitTree: () => false, timestamp: TS };

    writeConfig(target, rendered, deps);
    writeConfig(target, rendered, deps);

    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['pipedrive']);
  });

  it('committed-target write never persists the raw key to disk', () => {
    const path = join(dir, '.mcp.json');
    const target = getTarget('claude-code', 'project')!;
    const rendered = renderConfig(target, KEY);

    writeConfig(target, rendered, { pathOverride: path, isInsideGitTree: () => false, timestamp: TS });

    expect(readFileSync(path, 'utf8')).not.toContain(KEY);
  });

  it('aborts to print (leaving the original untouched) if the backup path is already occupied', () => {
    // Proxies a planted-symlink / predictable-name attack: the exclusive backup
    // write must fail closed rather than follow/overwrite an existing path.
    const path = join(dir, 'config.json');
    const before = JSON.stringify({ mcpServers: { other: {} } }, null, 2);
    writeFileSync(path, before);
    writeFileSync(`${path}.bak-${TS}`, 'pre-existing'); // occupy the backup path
    const { target, rendered } = desktopRender();

    const outcome = writeConfig(target, rendered, {
      pathOverride: path,
      isInsideGitTree: () => false,
      timestamp: TS,
    });

    expect(outcome.kind).toBe('print');
    expect(readFileSync(path, 'utf8')).toBe(before); // original untouched
  });

  it('does not write the key through a symlinked destination (planted-symlink defense)', () => {
    // A symlink planted at the destination must not redirect the secret-bearing
    // write to its target. The atomic temp-then-rename (unpredictable temp name +
    // exclusive `wx`) replaces the symlink with a real local file instead of
    // following it, so the external victim never receives the key (H1/R14).
    const victim = join(dir, 'victim.json');
    writeFileSync(victim, JSON.stringify({ mcpServers: { other: {} } }, null, 2));
    const path = join(dir, 'config.json');
    symlinkSync(victim, path); // destination is now an attacker-controlled symlink
    const { target, rendered } = desktopRender();

    const outcome = writeConfig(target, rendered, {
      pathOverride: path,
      isInsideGitTree: () => false,
      timestamp: TS,
    });

    expect(outcome.kind).toBe('written');
    // The key landed in a real local file, NOT through the symlink into the victim.
    expect(readFileSync(victim, 'utf8')).not.toContain(KEY);
    expect(lstatSync(path).isSymbolicLink()).toBe(false);
    expect(readFileSync(path, 'utf8')).toContain(KEY);
  });

  it('returns print when no stable path resolves (VS Code user scope)', () => {
    const target = getTarget('vscode', 'user')!;
    const rendered = renderConfig(target, KEY);

    const outcome = writeConfig(target, rendered, { timestamp: TS });

    expect(outcome.kind).toBe('print');
  });
});

describe('writeConfig — Claude Code CLI targets (U4)', () => {
  it('returns a CLI invocation, never a file write, with no literal key in argv', () => {
    const target = getTarget('claude-code', 'local')!;
    const rendered = renderConfig(target, KEY);

    const outcome = writeConfig(target, rendered, { isClaudeAvailable: () => false });

    expect(outcome.kind).toBe('cli');
    if (outcome.kind !== 'cli') return;
    expect(outcome.command).not.toContain(KEY);
    expect(outcome.command).toContain('${PIPEDRIVE_API_KEY}');
    expect(outcome.claudeAvailable).toBe(false);
  });
});

describe('claudeMcpAddInvocation (U4 / R15)', () => {
  it('references the key, never embeds a literal, and carries the scope', () => {
    const { command } = claudeMcpAddInvocation('user');
    expect(command).toContain('--scope user');
    expect(command).toContain('${PIPEDRIVE_API_KEY}');
    expect(command).not.toContain('z'.repeat(40));
    expect(command).toContain('@ckalima/pipedrive-mcp-server');
  });

  it('accepts every known Claude Code scope', () => {
    for (const scope of ['local', 'project', 'user']) {
      expect(() => claudeMcpAddInvocation(scope)).not.toThrow();
    }
  });

  it('refuses an unknown scope rather than interpolating it into runnable text (M1)', () => {
    expect(() => claudeMcpAddInvocation('local; rm -rf ~')).toThrow(/unknown scope/);
  });
});
