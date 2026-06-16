/**
 * Unit tests for the `init` subcommand dispatch and flag parsing (U1).
 */

import { describe, it, expect, vi } from 'vitest';
import { dispatchCli, type CliDeps } from '../../src/index.js';
import { parseInitArgs, getInitUsage } from '../../src/cli/init.js';

function makeDeps(): {
  runInit: ReturnType<typeof vi.fn>;
  serve: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
} & CliDeps {
  return {
    runInit: vi.fn(async () => 0),
    serve: vi.fn(async () => {}),
    log: vi.fn(),
  };
}

describe('dispatchCli (U1)', () => {
  it('routes `init` to the installer orchestrator, not the server', async () => {
    const deps = makeDeps();

    const code = await dispatchCli(['init'], deps);

    expect(deps.runInit).toHaveBeenCalledOnce();
    expect(deps.serve).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it('passes the post-subcommand argv through to the installer', async () => {
    const deps = makeDeps();

    await dispatchCli(['init', '--print-only', '--host', 'cursor'], deps);

    expect(deps.runInit).toHaveBeenCalledWith(['--print-only', '--host', 'cursor']);
  });

  it('boots the server (serve path) when no subcommand is given', async () => {
    const deps = makeDeps();

    const code = await dispatchCli([], deps);

    expect(deps.serve).toHaveBeenCalledOnce();
    expect(deps.runInit).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it('prints usage and exits non-zero on an unknown subcommand, without booting the server', async () => {
    const deps = makeDeps();

    const code = await dispatchCli(['frobnicate'], deps);

    expect(code).not.toBe(0);
    expect(deps.serve).not.toHaveBeenCalled();
    expect(deps.runInit).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledOnce();
    expect(deps.log.mock.calls[0][0]).toContain('frobnicate');
  });

  it('propagates the installer exit code', async () => {
    const deps = makeDeps();
    deps.runInit.mockResolvedValueOnce(3);

    expect(await dispatchCli(['init'], deps)).toBe(3);
  });
});

describe('parseInitArgs (U1)', () => {
  it('defaults to no flags set', () => {
    expect(parseInitArgs([])).toEqual({ help: false, printOnly: false });
  });

  it('parses --print-only', () => {
    expect(parseInitArgs(['--print-only']).printOnly).toBe(true);
  });

  it('parses --host and --scope in space form', () => {
    const options = parseInitArgs(['--host', 'claude-code', '--scope', 'project']);
    expect(options.host).toBe('claude-code');
    expect(options.scope).toBe('project');
  });

  it('parses --host= and --scope= in equals form', () => {
    const options = parseInitArgs(['--host=cursor', '--scope=user']);
    expect(options.host).toBe('cursor');
    expect(options.scope).toBe('user');
  });

  it('parses --help and -h', () => {
    expect(parseInitArgs(['--help']).help).toBe(true);
    expect(parseInitArgs(['-h']).help).toBe(true);
  });

  it('warns on an unrecognized flag but still parses the rest, without failing', () => {
    expect(() => parseInitArgs(['--frobnicate'])).not.toThrow();
    const options = parseInitArgs(['--frobnicate', '--print-only']);
    expect(options.printOnly).toBe(true);
    expect(options.warnings).toBeDefined();
    expect(options.warnings!.join(' ')).toContain('--frobnicate');
    expect(options.errors).toBeUndefined();
  });

  it('omits the warnings/errors keys entirely for a clean parse', () => {
    // Keeps the default shape minimal so callers can treat their absence as "clean".
    expect(parseInitArgs(['--print-only'])).toEqual({ help: false, printOnly: true });
  });

  it('rejects a flag-shaped value after --host instead of swallowing the next flag (#8)', () => {
    const options = parseInitArgs(['--host', '--scope', 'project']);
    // --host did NOT consume "--scope"; that flag is still parsed as the scope.
    expect(options.host).toBeUndefined();
    expect(options.scope).toBe('project');
    expect(options.errors).toBeDefined();
    expect(options.errors!.join(' ')).toContain('--host requires a value');
  });

  it('errors when --host is given with no following value (#8)', () => {
    const options = parseInitArgs(['--host']);
    expect(options.host).toBeUndefined();
    expect(options.errors!.join(' ')).toContain('--host requires a value');
  });

  it('errors when --scope is given with no following value (#8)', () => {
    const options = parseInitArgs(['--scope']);
    expect(options.scope).toBeUndefined();
    expect(options.errors!.join(' ')).toContain('--scope requires a value');
  });
});

describe('getInitUsage (U1)', () => {
  it('documents the init command and its flags', () => {
    const usage = getInitUsage();
    expect(usage).toContain('init');
    expect(usage).toContain('--host');
    expect(usage).toContain('--scope');
    expect(usage).toContain('--print-only');
  });
});
