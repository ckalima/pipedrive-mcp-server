/**
 * Guards that every released version actually has release notes.
 *
 * `.github/workflows/release.yml` builds the GitHub Release body by `awk`-ing the matching
 * `## [X.Y.Z]` section out of CHANGELOG.md, and falls back to a bare "Release X.Y.Z" when that
 * comes back empty. That fallback is silent, so a version whose section is missing still ships
 * a green release with empty notes — which is exactly what happened to 2.1.0: it existed only
 * as a link definition at the bottom of the file, and the omission survived nine subsequent
 * version headings before anyone noticed.
 */
import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');

/** The extractor from release.yml, transcribed. Returns the section body for a version. */
const extractReleaseNotes = (version: string): string => {
  const out: string[] = [];
  let inSection = false;
  for (const line of changelog.split('\n')) {
    if (line.startsWith(`## [${version}]`)) {
      inSection = true;
      out.push(line);
      continue;
    }
    if (inSection && (line.startsWith('## [') || /^\[\d/.test(line))) inSection = false;
    if (inSection) out.push(line);
  }
  return out.join('\n').trim();
};

const headings = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
const linkDefs = [...changelog.matchAll(/^\[(\d+\.\d+\.\d+)\]:/gm)].map((m) => m[1]);

describe('CHANGELOG.md', () => {
  it('has version sections to check', () => {
    expect(headings.length).toBeGreaterThan(5);
  });

  it('gives every linked version a real section, not just a link definition', () => {
    expect(linkDefs.filter((v) => !headings.includes(v))).toEqual([]);
  });

  it('gives every version section a link definition', () => {
    expect(headings.filter((v) => !linkDefs.includes(v))).toEqual([]);
  });

  it.each(headings)('release notes for %s extract to a non-empty body', (version) => {
    const notes = extractReleaseNotes(version);
    // More than the heading line alone: an empty section would silently ship the
    // workflow's "Release X.Y.Z" fallback instead of real notes.
    expect(notes.split('\n').length).toBeGreaterThan(1);
  });
});
