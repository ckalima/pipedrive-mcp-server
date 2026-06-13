/**
 * Shared static-scan helper for the destructive↔guard invariant tests.
 *
 * Both tests/unit/gen-docs.test.ts and tests/unit/tool-annotations.test.ts assert that the
 * declared `destructive` field matches the handlers that actually call
 * `destructiveOperationGuard(`. They derive that set by SCANNING SOURCE TEXT — never by
 * importing or executing handler code, because executing a Pipedrive handler can fire a
 * live CRM write. This module is the single source of that scan.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Absolute path to src/tools, resolved relative to this helper. */
export const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/tools');

/** Runtime view of a tool def with its bound handler function. */
export type ToolWithHandler = {
  name: string;
  destructive?: boolean;
  handler?: (...args: unknown[]) => unknown;
};

/**
 * Statically derive the set of handler function names that call
 * `destructiveOperationGuard(`, by scanning the tool source. This NEVER imports or runs
 * handler code. Each `export async function NAME` opens a block that runs to the next such
 * declaration (or EOF); a block is "guarded" if its text contains the guard call. Guards
 * are the first statement in each destructive handler, so this attribution is exact.
 */
export function guardedHandlerNames(): Set<string> {
  const guarded = new Set<string>();
  const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  for (const file of files) {
    const src = readFileSync(join(TOOLS_DIR, file), 'utf8');
    const matches = [...src.matchAll(/export async function (\w+)/g)];
    for (let i = 0; i < matches.length; i++) {
      const name = matches[i][1];
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? src.length) : src.length;
      if (src.slice(start, end).includes('destructiveOperationGuard(')) {
        guarded.add(name);
      }
    }
  }
  return guarded;
}
