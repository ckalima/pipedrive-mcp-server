/**
 * Guard for review P0-2: the server source must never auto-load a .env file.
 *
 * MCP hosts set the process CWD to the open (possibly untrusted) project, so a
 * dotenv-style preload would let a planted .env inject policy env vars
 * (PIPEDRIVE_MODE, PIPEDRIVE_ENABLE_DESTRUCTIVE) or a substitute API key beneath
 * the operator's host config. Local-dev .env loading lives exclusively in
 * package.json scripts (`--env-file-if-exists=.env`), never in src.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('no .env preload in server source (review P0-2 guard)', () => {
  it('no file under src/ imports or requires dotenv', () => {
    const files = tsFilesUnder('src');
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) =>
      /['"]dotenv(\/config)?['"]/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
