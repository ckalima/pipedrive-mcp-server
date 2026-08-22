/**
 * Behavioural tests for the `registry` job's Release-asset precondition in
 * .github/workflows/release.yml.
 *
 * The MCP registry entry is immutable and its mcpb `identifier` points at a GitHub Release
 * asset, so an entry published before that asset is live permanently advertises a URL that
 * 404s - fixable only by cutting a new version. Nothing in the job graph prevents that on its
 * own: "Create GitHub Release" is deliberately `continue-on-error` (npm publish is the
 * irreversible step), that same step uploads the bundle, and the registry job only
 * `needs: publish` - the job, which still succeeds when that step soft-failed.
 *
 * These tests pull the step's actual `run:` script out of the YAML and EXECUTE it against
 * fixtures. Asserting on the script's text instead would be satisfied by a step whose body is
 * nothing but comments, which is exactly the vacuous-pass this file exists to rule out.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load } from 'js-yaml';
import { describe, it, expect } from 'vitest';

type Step = { name?: string; run?: string; uses?: string; 'continue-on-error'?: boolean };
type Workflow = { jobs: Record<string, { needs?: string | string[]; steps: Step[] }> };

const workflow = load(
  readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'),
) as Workflow;

const registrySteps = workflow.jobs.registry.steps;
const indexOf = (predicate: (s: Step) => boolean) => registrySteps.findIndex(predicate);

const injectStep = indexOf((s) => (s.run ?? '').includes('registry:inject'));
const precondStep = indexOf((s) => /curl .*"\$URL"/.test(s.run ?? ''));
const publishStep = indexOf((s) => (s.run ?? '').includes('mcp-publisher publish'));

/**
 * Run the precondition script against a fixture. `sleep` is stubbed out so the retry loop does
 * not add ~50s of real waiting; nothing else about the script is altered.
 */
const runPrecondition = (identifier: string, expectSha: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'precond-'));
  writeFileSync(
    join(dir, 'server.json'),
    JSON.stringify({ packages: [{ registryType: 'npm' }, { registryType: 'mcpb', identifier }] }),
  );
  const script = `sleep() { :; }\n${registrySteps[precondStep].run}`;
  try {
    const stdout = execFileSync('bash', ['-e', '-c', script], {
      cwd: dir,
      env: { ...process.env, EXPECT: expectSha, RUNNER_TEMP: dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};

// sha256sum is a coreutils binary: always present on the ubuntu-latest runner this job uses,
// but not on a stock macOS dev box. Skip execution there rather than fail for the wrong reason.
let hasSha256sum = true;
try {
  execFileSync('sha256sum', ['--version'], { stdio: 'ignore' });
} catch {
  hasSha256sum = false;
}

describe('release.yml registry job - step wiring', () => {
  it('contains the inject, precondition, and publish steps', () => {
    // Asserted individually: `expect({a, b, c}).not.toContain(-1)` silently passes for a plain
    // object, so a missing step would go unnoticed.
    expect(injectStep, 'inject step').toBeGreaterThanOrEqual(0);
    expect(precondStep, 'precondition step').toBeGreaterThanOrEqual(0);
    expect(publishStep, 'publish step').toBeGreaterThanOrEqual(0);
  });

  it('verifies the Release asset BEFORE publishing the immutable entry', () => {
    expect(precondStep).toBeLessThan(publishStep);
  });

  it('runs the check AFTER the inject, so it reads the real URL and not the committed sentinel', () => {
    // The committed server.json carries a placeholder URL and an all-zeros hash; checking
    // before the rewrite would verify the wrong artifact and always pass.
    expect(precondStep).toBeGreaterThan(injectStep);
  });

  it('fails closed: the check must be able to fail the job', () => {
    expect(registrySteps[precondStep]['continue-on-error']).toBeUndefined();
  });

  it('bounds the download so a stalled connection cannot swallow the retry loop', () => {
    // Assert on the invocation with comments stripped: matching the raw `run` blob would be
    // satisfied by the comment above the curl line that merely *mentions* --max-time.
    const curl = (registrySteps[precondStep].run ?? '')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .find((l) => l.includes('curl') && l.includes('"$URL"'));
    expect(curl, 'curl invocation').toBeDefined();
    expect(curl).toMatch(/--max-time/);
    expect(curl).toMatch(/--connect-timeout/);
  });
});

describe.skipIf(!hasSha256sum)('release.yml registry job - precondition behaviour', () => {
  const bytes = 'pretend mcpb bundle bytes';
  const sha = execFileSync('sha256sum', [], { input: bytes, encoding: 'utf8' }).split(' ')[0];

  const fixture = (contents: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'asset-'));
    const file = join(dir, 'bundle.mcpb');
    writeFileSync(file, contents);
    return `file://${file}`;
  };

  it('passes when the asset is live and byte-identical', () => {
    const { code, out } = runPrecondition(fixture(bytes), sha);
    expect(code).toBe(0);
    expect(out).toContain(sha);
  });

  it('fails when the asset is missing - the soft-failed-Release case', () => {
    const { code, out } = runPrecondition(`file://${tmpdir()}/definitely-not-here.mcpb`, sha);
    expect(code).not.toBe(0);
    expect(out).toContain('not downloadable');
  });

  it('fails when the asset exists but serves different bytes', () => {
    const { code, out } = runPrecondition(fixture('some other bytes entirely'), sha);
    expect(code).not.toBe(0);
    expect(out).toContain('refusing to publish');
  });

  it('fails when server.json has no mcpb identifier', () => {
    const dir = mkdtempSync(join(tmpdir(), 'precond-'));
    writeFileSync(join(dir, 'server.json'), JSON.stringify({ packages: [{ registryType: 'npm' }] }));
    const script = `sleep() { :; }\n${registrySteps[precondStep].run}`;
    let code = 0;
    try {
      execFileSync('bash', ['-e', '-c', script], {
        cwd: dir,
        env: { ...process.env, EXPECT: sha, RUNNER_TEMP: dir },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      code = (err as { status: number }).status;
    }
    expect(code).not.toBe(0);
  });
});
