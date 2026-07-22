/**
 * Invariant: every parameter whose Zod schema accepts `null` must also declare `null`
 * in its hand-written JSON Schema `inputSchema` literal.
 *
 * The two are written by hand in separate places (the "three places per param" rule in
 * CLAUDE.md), so they can drift. When they do, the drift is silently one-directional and
 * user-hostile: the Zod schema and the tool description both say "pass null to clear this
 * field", but the advertised JSON Schema says `type: "number"`, which forbids null. A
 * schema-validating MCP client rejects the call before it ever reaches the handler, so the
 * documented clear-a-field behaviour is unreachable through those clients.
 *
 * This walks every registered tool rather than spot-checking, and it walks one level into
 * array-of-object properties (bulk_add_deal_products) where the same drift occurred.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { allTools } from '../../src/tools/index.js';

type JsonSchemaProp = {
  type?: string | string[];
  items?: { type?: string; properties?: Record<string, JsonSchemaProp> };
  [k: string]: unknown;
};

/** Whether the literal's declared type admits null. */
function literalAllowsNull(prop: JsonSchemaProp | undefined): boolean {
  const type = prop?.type;
  return Array.isArray(type) ? type.includes('null') : type === 'null';
}

/**
 * Whether `schema` accepts null at `path` — determined by probing rather than by
 * introspecting Zod internals, so it stays correct across Zod refactors and works
 * uniformly for plain objects, `.extend()`ed objects and `.refine()`d ones.
 *
 * Errors raised elsewhere in the probe object (missing required siblings) are ignored:
 * only an issue reported AT this path means the null itself was rejected.
 */
function schemaAcceptsNullAt(schema: z.ZodTypeAny, probe: unknown, path: (string | number)[]): boolean {
  const result = schema.safeParse(probe);
  if (result.success) return true;
  return !result.error.issues.some(
    issue => issue.path.length === path.length && issue.path.every((seg, i) => seg === path[i]),
  );
}

/** Every (tool, dotted-param-path) pair whose literal and Zod schema disagree about null. */
function findNullDrift(): string[] {
  const drift: string[] = [];

  for (const tool of allTools) {
    const properties = (tool.inputSchema as { properties?: Record<string, JsonSchemaProp> }).properties;
    if (!properties) continue;
    const schema = tool.schema as unknown as z.ZodTypeAny;

    for (const [key, prop] of Object.entries(properties)) {
      if (schemaAcceptsNullAt(schema, { [key]: null }, [key]) && !literalAllowsNull(prop)) {
        drift.push(`${tool.name}.${key}`);
      }

      const itemProperties = prop.items?.properties;
      if (!itemProperties) continue;

      for (const [subKey, subProp] of Object.entries(itemProperties)) {
        const probe = { [key]: [{ [subKey]: null }] };
        if (schemaAcceptsNullAt(schema, probe, [key, 0, subKey]) && !literalAllowsNull(subProp)) {
          drift.push(`${tool.name}.${key}[].${subKey}`);
        }
      }
    }
  }

  return drift;
}

describe('nullable inputSchema parity', () => {
  it('declares "null" in the inputSchema literal for every param whose Zod schema accepts null', () => {
    expect(findNullDrift()).toEqual([]);
  });

  it('detects drift when it exists (guards the guard)', () => {
    // A stand-in for a drifted tool: the Zod schema clears on null, the literal forbids it.
    const drifted = z.object({ priority: z.number().int().nullable().optional() });
    const literal: JsonSchemaProp = { type: 'number' };

    expect(schemaAcceptsNullAt(drifted, { priority: null }, ['priority'])).toBe(true);
    expect(literalAllowsNull(literal)).toBe(false);
    expect(literalAllowsNull({ type: ['number', 'null'] })).toBe(true);
  });

  it('does not flag a param that simply is not nullable', () => {
    const strict = z.object({ id: z.number() });
    expect(schemaAcceptsNullAt(strict, { id: null }, ['id'])).toBe(false);
  });
});
