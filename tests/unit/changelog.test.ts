/**
 * Guards that every released version has its own real, non-duplicated release notes.
 *
 * `.github/workflows/release.yml` builds the GitHub Release body by `awk`-ing the matching
 * `## [X.Y.Z]` section out of CHANGELOG.md, and falls back to a bare "Release X.Y.Z" when that
 * comes back empty. Both failure modes are silent and both have actually happened here:
 *
 *  - `406d7e1` ("chore(release): prepare 2.2.0") RENAMED the `## [2.1.0]` heading to `## [2.2.0]`
 *    and prepended the new notes above the old body. 2.1.0 survived only as a link definition, so
 *    its release shipped the empty-notes fallback, while 2.2.0's GitHub Release body was published
 *    carrying 2.1.0's entire changelog (two `### Added` blocks). Nine version headings went by
 *    before anyone noticed.
 *  - The first attempt to repair that re-inserted 2.1.0's section without removing the orphaned
 *    copy still sitting under 2.2.0, leaving the same body in the file twice.
 *
 * So the checks below cover both directions: a version must have exactly one section AND that
 * section's content must not be a copy of another version's.
 */
import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
const pkgVersion = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version as string;

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

// Prerelease-tolerant: the workflow triggers on `v*.*.*` and derives the version as
// ${GITHUB_REF_NAME#v}, so a `v2.8.0-beta.1` tag would look for `## [2.8.0-beta.1]`.
const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?`;
const headings = [...changelog.matchAll(new RegExp(String.raw`^## \[(${SEMVER})\]`, 'gm'))].map(
  (m) => m[1],
);
const linkDefs = [...changelog.matchAll(new RegExp(String.raw`^\[(${SEMVER})\]:`, 'gm'))].map(
  (m) => m[1],
);

const dupes = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

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

  it('declares each version exactly once', () => {
    // A second `## [X.Y.Z]` heading would make the awk extractor concatenate both bodies into
    // one Release; a second link definition silently shadows the first.
    expect(dupes(headings), 'duplicate headings').toEqual([]);
    expect(dupes(linkDefs), 'duplicate link definitions').toEqual([]);
  });

  it("has a section for package.json's current version", () => {
    // The oracle the two structural checks above lack: they only compare the file against
    // itself, so dropping BOTH a version's heading and its link definition passes them. The
    // release cuts from package.json, so that version must be documented.
    expect(headings).toContain(pkgVersion);
  });

  it.each(headings)('release notes for %s extract to a non-empty body', (version) => {
    const notes = extractReleaseNotes(version);
    // More than the heading line alone: an empty section would silently ship the
    // workflow's "Release X.Y.Z" fallback instead of real notes.
    expect(notes.split('\n').length).toBeGreaterThan(1);
  });

  it.each(headings)('release notes for %s contain actual entries, not just sub-headings', (v) => {
    const body = extractReleaseNotes(v).split('\n').slice(1);
    expect(body.some((l) => l.trimStart().startsWith('- '))).toBe(true);
  });

  it("does not repeat one version's content under another version", () => {
    // The `406d7e1` failure mode: a body that belongs to one release ends up inside another.
    // Only substantial lines are compared, so shared structure (`### Added`, blanks) is ignored
    // and a genuine repeat has to be a copied entry.
    const owners = new Map<string, string[]>();
    for (const v of headings) {
      for (const line of extractReleaseNotes(v).split('\n').slice(1)) {
        const t = line.trim();
        if (t.length <= 40 || t.startsWith('#')) continue;
        owners.set(t, [...(owners.get(t) ?? []), v]);
      }
    }
    const shared = [...owners.entries()]
      .filter(([, vs]) => vs.length > 1)
      .map(([line, vs]) => `${vs.join(' + ')}: ${line.slice(0, 70)}`);
    expect(shared).toEqual([]);
  });
});
