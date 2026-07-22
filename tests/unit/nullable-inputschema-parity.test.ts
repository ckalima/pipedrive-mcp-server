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
 * This walks every registered tool rather than spot-checking, and it recurses to arbitrary
 * depth through BOTH nesting forms a literal can use: `properties` (a plain nested object,
 * e.g. a `location`/`address` param) and `items.properties` (an array of objects, e.g.
 * bulk_add_deal_products). An earlier version descended only through `items`, which made
 * drift inside a plain nested object invisible to the very test meant to catch it.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { allTools } from '../../src/tools/index.js';

type JsonSchemaProp = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaProp>;
  items?: { type?: string; properties?: Record<string, JsonSchemaProp> };
  [k: string]: unknown;
};

/** Guards against a self-referential literal; real hand-written schemas nest far less. */
const MAX_NESTING_DEPTH = 6;

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

/**
 * The smallest object that places `null` at `path`, e.g. ['products', 0, 'product_id']
 * becomes `{ products: [{ product_id: null }] }`. A numeric segment means "array index".
 */
function buildProbe(path: (string | number)[]): unknown {
  return path.reduceRight<unknown>(
    (inner, segment) => (typeof segment === 'number' ? [inner] : { [segment]: inner }),
    null,
  );
}

/** ['products', 0, 'product_id'] → 'products[].product_id' */
function formatPath(path: (string | number)[]): string {
  return path.reduce<string>(
    (acc, segment) =>
      typeof segment === 'number' ? `${acc}[]` : acc ? `${acc}.${segment}` : String(segment),
    '',
  );
}

/**
 * Every param path under `properties` whose literal forbids null while the Zod schema
 * accepts it. Recurses through plain nested objects and arrays of objects alike.
 */
export function collectNullDrift(
  toolName: string,
  schema: z.ZodTypeAny,
  properties: Record<string, JsonSchemaProp>,
  path: (string | number)[] = [],
): string[] {
  if (path.length >= MAX_NESTING_DEPTH) return [];
  const drift: string[] = [];

  for (const [key, prop] of Object.entries(properties)) {
    const propPath = [...path, key];

    if (schemaAcceptsNullAt(schema, buildProbe(propPath), propPath) && !literalAllowsNull(prop)) {
      drift.push(`${toolName}.${formatPath(propPath)}`);
    }

    // A literal nests either way; follow both so neither form hides drift.
    if (prop.properties) {
      drift.push(...collectNullDrift(toolName, schema, prop.properties, propPath));
    }
    if (prop.items?.properties) {
      drift.push(...collectNullDrift(toolName, schema, prop.items.properties, [...propPath, 0]));
    }
  }

  return drift;
}

/** Every (tool, dotted-param-path) pair whose literal and Zod schema disagree about null. */
function findNullDrift(): string[] {
  return allTools.flatMap((tool) => {
    const properties = (tool.inputSchema as { properties?: Record<string, JsonSchemaProp> }).properties;
    if (!properties) return [];
    return collectNullDrift(tool.name, tool.schema as unknown as z.ZodTypeAny, properties);
  });
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

  // The walk used to descend only through `items`, so drift one level inside a PLAIN
  // nested object was invisible. No registered tool has a nullable sub-field under a
  // plain object today, so this was latent rather than an active miss — these cases
  // keep it that way as such params get added.
  it('finds drift nested inside a plain object, not just inside an array', () => {
    const schema = z.object({
      location: z.object({ country: z.string().nullable().optional() }).optional(),
    });
    const properties = {
      location: { type: 'object', properties: { country: { type: 'string' } } },
    };

    expect(collectNullDrift('t', schema, properties)).toEqual(['t.location.country']);
  });

  it('reports array-nested drift with the same path formatting as before', () => {
    const schema = z.object({
      products: z.array(z.object({ discount: z.number().nullable().optional() })).optional(),
    });
    const properties = {
      products: { type: 'array', items: { type: 'object', properties: { discount: { type: 'number' } } } },
    };

    expect(collectNullDrift('t', schema, properties)).toEqual(['t.products[].discount']);
  });

  it('clears a nested param once the literal declares null', () => {
    const schema = z.object({
      location: z.object({ country: z.string().nullable().optional() }).optional(),
    });
    const properties = {
      location: { type: 'object', properties: { country: { type: ['string', 'null'] } } },
    };

    expect(collectNullDrift('t', schema, properties)).toEqual([]);
  });
});
