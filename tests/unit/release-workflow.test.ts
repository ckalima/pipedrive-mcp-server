/**
 * Ordering invariants for the `registry` job in .github/workflows/release.yml.
 *
 * The MCP registry entry is immutable and its mcpb `identifier` points at a GitHub Release
 * asset, so an entry published before that asset is live permanently advertises a URL that
 * 404s — fixable only by cutting a new version. Nothing in the job graph prevents that on its
 * own: "Create GitHub Release" is deliberately `continue-on-error` (npm publish is the
 * irreversible step), that same step uploads the bundle, and the registry job only
 * `needs: publish` — the job, which still succeeds when that step soft-failed. A precondition
 * step closes the gap, but only while it stays in the right place, so pin that here rather
 * than trusting a future reorder to notice.
 */
import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';
import { describe, it, expect } from 'vitest';

type Step = { name?: string; run?: string; uses?: string };
type Workflow = { jobs: Record<string, { needs?: string | string[]; steps: Step[] }> };

const workflow = load(
  readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'),
) as Workflow;

const registrySteps = workflow.jobs.registry.steps;
const indexOf = (predicate: (s: Step) => boolean) => registrySteps.findIndex(predicate);

const injectStep = indexOf((s) => (s.run ?? '').includes('registry:inject'));
const precondStep = indexOf((s) => (s.run ?? '').includes('release asset:'));
const publishStep = indexOf((s) => (s.run ?? '').includes('mcp-publisher publish'));

describe('release.yml registry job', () => {
  it('has all three steps this file reasons about', () => {
    expect({ injectStep, precondStep, publishStep }).not.toContain(-1);
  });

  it('verifies the Release asset is live BEFORE publishing the immutable entry', () => {
    expect(precondStep).toBeLessThan(publishStep);
  });

  it('runs that check AFTER the inject, so it reads the real URL and not the committed sentinel', () => {
    // The committed server.json carries a v0.0.0-style placeholder URL and an all-zeros hash;
    // checking before the rewrite would verify the wrong artifact and always pass.
    expect(precondStep).toBeGreaterThan(injectStep);
  });

  it('compares the downloaded bytes against the hash the publish job actually attached', () => {
    const step = registrySteps[precondStep];
    expect(JSON.stringify(step)).toContain('needs.publish.outputs.mcpb_sha256');
    // Reads the URL out of server.json rather than rebuilding it, so it checks the exact
    // string being published.
    expect(step.run).toContain('registryType=="mcpb"');
    expect(step.run).toMatch(/sha256sum/);
  });

  it('fails closed: the check must be able to red the job', () => {
    expect(registrySteps[precondStep]).not.toHaveProperty('continue-on-error');
  });
});
