/**
 * Unit tests for the interactive flow orchestration (U5).
 *
 * Every IO seam is mocked, so no real readline/spawn/network/fs runs. The flow
 * contract is asserted: fail-closed flag validation, the key re-prompt loop,
 * best-effort browser open, the git-tree write confirmation, and R18 terminal
 * indirection (a literal key reaches the terminal only under --print-only).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInit, StdinClosedError, type InitDeps } from '../../src/cli/init.js';
import { openUrl } from '../../src/cli/open-url.js';
import type { ConfigTarget } from '../../src/cli/config-targets.js';

const KEY = 'a'.repeat(40);

function makeDeps(overrides: Partial<InitDeps> = {}) {
  const prints: string[] = [];
  const base: InitDeps & { prints: string[] } = {
    prints,
    print: (m: string) => prints.push(m),
    prompt: vi.fn(async () => '1'),
    promptSecret: vi.fn(async () => KEY),
    confirm: vi.fn(async () => true),
    openUrl: vi.fn(),
    verifyApiKey: vi.fn(async () => ({ valid: true, user: { name: 'Jane', email: 'jane@example.com' } })),
    writeConfig: vi.fn((target: ConfigTarget) =>
      target.delivery === 'cli'
        ? { kind: 'cli' as const, command: "claude mcp add --env 'PIPEDRIVE_API_KEY=${PIPEDRIVE_API_KEY}' ...", followUp: 'fu', claudeAvailable: true }
        : { kind: 'written' as const, path: '/tmp/x/config.json', backupRelocated: false },
    ),
    isInsideGitTree: vi.fn(() => false),
    resolveTargetPath: vi.fn(() => '/tmp/x/config.json'),
    ...overrides,
  };
  return base;
}

describe('runInit flow (U5)', () => {
  it('happy path: validates, then writes for the chosen host and prints the next step', async () => {
    const deps = makeDeps();

    const code = await runInit(['--host', 'claude-desktop'], deps);

    expect(code).toBe(0);
    expect(deps.writeConfig).toHaveBeenCalledTimes(1);
    expect((deps.writeConfig as ReturnType<typeof vi.fn>).mock.calls[0][0].host).toBe('claude-desktop');
    expect(deps.prints.join('\n')).toMatch(/Setup complete/);
    expect(deps.prints.join('\n')).toMatch(/Restart Claude Desktop/);
  });

  it('strips control/escape chars from the API-sourced account name before echoing it (L2)', async () => {
    const verifyApiKey = vi.fn(async () => ({
      valid: true,
      // Crafted display name with CR + ANSI escape; must not reach the terminal raw.
      user: { name: 'Jane\r\x1b[31mEVIL', email: 'jane@example.com' },
    }));
    const deps = makeDeps({ verifyApiKey });

    await runInit(['--host', 'claude-desktop'], deps);

    const validatedLine = deps.prints.find((p) => p.includes('Validated as'))!;
    // The dangerous bytes are gone: no CR (line forging) and no ESC (the byte that
    // arms an ANSI sequence). Printable text survives; the residual "[31m" is inert
    // without its ESC, so it cannot colorize or move the cursor.
    expect(validatedLine).not.toContain('\r');
    expect(validatedLine).not.toContain('\x1b');
    expect(validatedLine).toContain('Jane');
    expect(validatedLine).toContain('EVIL');
  });

  it('re-prompts once on an invalid key, then proceeds', async () => {
    const verifyApiKey = vi
      .fn()
      .mockResolvedValueOnce({ valid: false, error: 'API key is invalid or expired' })
      .mockResolvedValue({ valid: true, user: { name: 'Jane' } });
    const deps = makeDeps({ verifyApiKey });

    const code = await runInit(['--host', 'claude-desktop'], deps);

    expect(code).toBe(0);
    expect(verifyApiKey).toHaveBeenCalledTimes(2);
  });

  it('cancels (non-zero) when the user quits the key prompt', async () => {
    const deps = makeDeps({ promptSecret: vi.fn(async () => 'q') });

    const code = await runInit(['--host', 'claude-desktop'], deps);

    expect(code).toBe(1);
    expect(deps.verifyApiKey).not.toHaveBeenCalled();
    expect(deps.writeConfig).not.toHaveBeenCalled();
  });

  it('reads the API key via the masked promptSecret seam, not the echoing prompt (M2)', async () => {
    // If the key ever came through the echoing `prompt`, this sentinel (which is
    // not a valid key) would reach the validator instead of the masked value.
    const deps = makeDeps({ prompt: vi.fn(async () => 'NOT_THE_KEY') });

    const code = await runInit(['--host', 'claude-desktop'], deps);

    expect(code).toBe(0);
    expect(deps.promptSecret).toHaveBeenCalledTimes(1);
    expect(deps.verifyApiKey).toHaveBeenCalledWith(KEY);
  });

  it('continues when the browser opener throws (URL already printed)', async () => {
    const deps = makeDeps({
      openUrl: vi.fn(() => {
        throw new Error('no opener available');
      }),
    });

    const code = await runInit(['--host', 'claude-desktop'], deps);

    expect(code).toBe(0);
    expect(deps.prints.join('\n')).toContain('https://app.pipedrive.com/settings/api');
    expect(deps.verifyApiKey).toHaveBeenCalled();
  });

  it('rejects an illegal --host before any key prompt (fail-closed, R17)', async () => {
    const deps = makeDeps();

    const code = await runInit(['--host', 'emacs'], deps);

    expect(code).toBe(1);
    expect(deps.openUrl).not.toHaveBeenCalled();
    expect(deps.verifyApiKey).not.toHaveBeenCalled();
  });

  it('rejects an illegal --host/--scope combo before any key prompt', async () => {
    const deps = makeDeps();

    const code = await runInit(['--host', 'claude-desktop', '--scope', 'project'], deps);

    expect(code).toBe(1);
    expect(deps.verifyApiKey).not.toHaveBeenCalled();
  });

  it('prompts for scope on Claude Code, not on a scopeless host (R7)', async () => {
    const ccDeps = makeDeps();
    await runInit(['--host', 'claude-code'], ccDeps);
    expect(ccDeps.prints.some((p) => /scope/i.test(p))).toBe(true);

    const desktopDeps = makeDeps();
    await runInit(['--host', 'claude-desktop'], desktopDeps);
    expect(desktopDeps.prints.some((p) => /scope/i.test(p))).toBe(false);
  });

  it('confirms before writing a committed file inside a git tree; declining falls back to print (R17)', async () => {
    const confirm = vi.fn(async () => false);
    const deps = makeDeps({ isInsideGitTree: vi.fn(() => true), confirm });

    const code = await runInit(['--host', 'claude-code', '--scope', 'project'], deps);

    expect(code).toBe(0);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deps.writeConfig).not.toHaveBeenCalled(); // declined → printed instead
    expect(deps.prints.join('\n')).toMatch(/Paste this into/);
  });

  it('on the write path, the literal key never reaches the terminal (R18)', async () => {
    const deps = makeDeps(); // claude-desktop = literal target, confirm → write

    await runInit(['--host', 'claude-desktop'], deps);

    expect(deps.prints.join('\n')).not.toContain(KEY);
    // The literal still flows to the writer (the 0600 file), just not the terminal.
    const writtenBlock = JSON.stringify((deps.writeConfig as ReturnType<typeof vi.fn>).mock.calls[0][1].block);
    expect(writtenBlock).toContain(KEY);
  });

  it('shows a literal block + warning ONLY under --print-only with no file target (R18/R15)', async () => {
    const deps = makeDeps();

    await runInit(['--host', 'claude-desktop', '--print-only'], deps);

    const out = deps.prints.join('\n');
    expect(out).toContain(KEY);
    expect(out).toContain('⚠');
    expect(deps.writeConfig).not.toHaveBeenCalled();
  });

  it('emits the no-argv Claude Code add command for local scope (R10/R15)', async () => {
    const deps = makeDeps();

    await runInit(['--host', 'claude-code', '--scope', 'local'], deps);

    const out = deps.prints.join('\n');
    expect(out).toContain('claude mcp add');
    expect(out).not.toContain(KEY);
  });

  it('prints a Validating… progress line before the network check (#2)', async () => {
    const deps = makeDeps();

    await runInit(['--host', 'claude-desktop'], deps);

    expect(deps.prints.some((p) => p.includes('Validating'))).toBe(true);
  });

  it('cancels cleanly (exit 1) when a host prompt hits closed stdin (#5)', async () => {
    // No --host, so the flow reaches the interactive host prompt; simulate EOF
    // there by rejecting with the typed StdinClosedError the readline seam raises.
    const deps = makeDeps({
      prompt: vi.fn(async () => {
        throw new StdinClosedError();
      }),
    });

    const code = await runInit([], deps);

    expect(code).toBe(1);
    expect(deps.prints.join('\n')).toMatch(/cancelled \(input closed\)/i);
    expect(deps.writeConfig).not.toHaveBeenCalled();
  });

  it('aborts fail-closed before any IO when --host is given without a value (#8)', async () => {
    const deps = makeDeps();

    const code = await runInit(['--host'], deps);

    expect(code).toBe(1);
    expect(deps.prints.join('\n')).toMatch(/--host requires a value/);
    expect(deps.openUrl).not.toHaveBeenCalled();
    expect(deps.verifyApiKey).not.toHaveBeenCalled();
  });

  it('prints a warning for an unrecognized flag but still completes (#8)', async () => {
    const deps = makeDeps();

    const code = await runInit(['--host', 'claude-desktop', '--bogus'], deps);

    expect(code).toBe(0);
    expect(deps.prints.join('\n')).toMatch(/unrecognized option '--bogus'/i);
  });
});

describe('openUrl env scrub (U5 / R16)', () => {
  const ORIGINAL = process.env.PIPEDRIVE_API_KEY;
  beforeEach(() => {
    process.env.PIPEDRIVE_API_KEY = KEY;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PIPEDRIVE_API_KEY;
    else process.env.PIPEDRIVE_API_KEY = ORIGINAL;
  });

  it('spawns the opener with PIPEDRIVE_API_KEY removed from the child env, detached + unref', () => {
    const unref = vi.fn();
    const spawnFn = vi.fn(() => ({ on: vi.fn(), unref }));

    openUrl('https://example.com', spawnFn as never);

    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [, , options] = spawnFn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv; detached: boolean }];
    expect(options.env.PIPEDRIVE_API_KEY).toBeUndefined();
    expect(options.detached).toBe(true);
    expect(unref).toHaveBeenCalled();
  });
});
