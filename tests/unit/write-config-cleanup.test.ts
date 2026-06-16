/**
 * Unit tests for the relocated-backup cleanup path (#7).
 *
 * When a write target lives inside a git tree, the writer relocates its backup
 * into a FRESH owner-only (0700) mkdtemp dir. If the exclusive backup write then
 * fails, that dir must be torn down rather than leaked. The failure can't be forced
 * deterministically against the real filesystem (the mkdtemp name is random and
 * unguessable), so node:fs is mocked here — spreading the real module and
 * overriding only the calls this path drives — to assert the cleanup precisely.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdtempSync: vi.fn(),
  rmdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>();
  return { ...actual, ...fs };
});

import { writeConfig } from '../../src/cli/write-config.js';
import { getTarget, renderConfig } from '../../src/cli/config-targets.js';

const KEY = 'z'.repeat(40);
const FAKE_BAK_DIR = '/fake/pipedrive-mcp-bak-AAA';

describe('writeConfig relocated-backup cleanup (#7)', () => {
  beforeEach(() => {
    // A non-empty existing file so the writer reads it and takes a backup.
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('{"mcpServers":{"other":{}}}'));
  });

  it('removes the self-minted backup dir (and any partial file) when the backup write fails', () => {
    fs.mkdtempSync.mockReturnValue(FAKE_BAK_DIR);
    fs.writeFileSync.mockImplementation(() => {
      throw new Error('EACCES'); // the exclusive backup write fails
    });

    const target = getTarget('claude-code', 'project')!;
    const outcome = writeConfig(target, renderConfig(target, KEY), {
      pathOverride: '/repo/.mcp.json',
      isInsideGitTree: () => true, // forces the relocated (mkdtemp) backup path
      timestamp: 'TS',
    });

    expect(outcome.kind).toBe('print');
    // Best-effort unlink of any partial file, then rmdir of the fresh dir we own.
    expect(fs.unlinkSync).toHaveBeenCalledWith('/fake/pipedrive-mcp-bak-AAA/.mcp.json.bak-TS');
    expect(fs.rmdirSync).toHaveBeenCalledWith(FAKE_BAK_DIR);
    // We bailed before the atomic destination write, so writeFileSync ran exactly once.
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('does NOT remove a caller-supplied backupDir on failure (we do not own it)', () => {
    fs.writeFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const target = getTarget('claude-code', 'project')!;
    const outcome = writeConfig(target, renderConfig(target, KEY), {
      pathOverride: '/repo/.mcp.json',
      isInsideGitTree: () => true,
      backupDir: '/caller/owned',
      timestamp: 'TS',
    });

    expect(outcome.kind).toBe('print');
    expect(fs.mkdtempSync).not.toHaveBeenCalled();
    expect(fs.rmdirSync).not.toHaveBeenCalled();
  });
});
