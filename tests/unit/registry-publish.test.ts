/**
 * The registry-publish fallback echoes every command it runs. mcp-publisher takes its GitHub
 * token only as an argument, so the echo must mask it: the unmasked form leaked a live token
 * into terminal scrollback during the v2.7.1 back-publish. Importing the script does not run
 * main() (direct-invocation guard).
 */
import { describe, it, expect } from 'vitest';

import { displayCommand } from '../../scripts/registry-publish.js';

describe('registry-publish displayCommand', () => {
  it('masks the value after --token', () => {
    const shown = displayCommand('mcp-publisher', ['login', 'github', '--token', 'gho_secretvalue']);
    expect(shown).toBe('$ mcp-publisher login github --token ***');
    expect(shown).not.toContain('gho_secretvalue');
  });

  it('masks the single-dash form mcp-publisher documents', () => {
    expect(displayCommand('mcp-publisher', ['login', 'github', '-token', 'gho_x'])).not.toContain('gho_x');
  });

  it('leaves commands without a secret flag unchanged', () => {
    expect(displayCommand('mcp-publisher', ['validate', 'server.json'])).toBe('$ mcp-publisher validate server.json');
  });
});
