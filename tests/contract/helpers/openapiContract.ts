/**
 * OpenAPI v2 contract-test harness (Lane A of issue #49).
 *
 * Loads the vendored `docs/api/openapi-v2.yaml`, derives the *allowed* request
 * shape for an operation (by `operationId`), and exposes assertion helpers that
 * the contract tests run against the REAL outbound request captured by the
 * `fetch` mock. The point (plan §0.2 / §2.2): a wrong outbound shape must FAIL,
 * so the data-shape P0 bugs (#42–#46, #48) cannot ship green.
 *
 * Deliberately a tiny, hand-rolled property-name/type/enum checker over the
 * parsed YAML — NOT a full JSON-Schema validator (no ajv/openapi-types). It only
 * needs: top-level body property names + their spec `type`, query param names +
 * their `enum`, and the response field-name set (for the #60 class). See plan §2.2.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import yaml from "js-yaml";

// Resolve the spec relative to THIS file (robust to the test runner's cwd).
// This helper lives at tests/contract/helpers/openapiContract.ts, so the spec
// at docs/api/openapi-v2.yaml is three directories up.
const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(HERE, "../../../docs/api/openapi-v2.yaml");

/** Minimal structural view of the parts of the OpenAPI doc we read. */
type SchemaNode = {
  type?: string;
  title?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: unknown[];
  allOf?: SchemaNode[];
  additionalProperties?: boolean | SchemaNode;
  $ref?: string;
  [k: string]: unknown;
};

type ParameterNode = {
  name?: string;
  in?: string;
  schema?: SchemaNode;
  $ref?: string;
  [k: string]: unknown;
};

type OperationNode = {
  operationId?: string;
  parameters?: ParameterNode[];
  requestBody?: {
    content?: Record<string, { schema?: SchemaNode }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: SchemaNode }> }>;
  [k: string]: unknown;
};

type PathItemNode = {
  parameters?: ParameterNode[];
  [method: string]: unknown;
};

type OpenApiDoc = {
  paths?: Record<string, PathItemNode>;
  components?: { schemas?: Record<string, SchemaNode> };
  [k: string]: unknown;
};

const HTTP_METHODS = ["get", "post", "patch", "put", "delete", "head", "options"] as const;

// ---------------------------------------------------------------------------
// Spec loading (memoized once at module load)
// ---------------------------------------------------------------------------

let cachedSpec: OpenApiDoc | undefined;

/** Load + parse the vendored v2 spec (memoized). */
export function loadV2Spec(): OpenApiDoc {
  if (!cachedSpec) {
    cachedSpec = yaml.load(readFileSync(SPEC_PATH, "utf8")) as OpenApiDoc;
  }
  return cachedSpec;
}

/** Resolve a local `#/components/schemas/Foo` $ref against the parsed doc. */
function resolveRef(node: SchemaNode | undefined): SchemaNode | undefined {
  if (!node) return undefined;
  if (!node.$ref) return node;
  const ref = node.$ref;
  if (!ref.startsWith("#/")) return node; // only local refs supported
  const segments = ref.slice(2).split("/");
  let current: unknown = loadV2Spec();
  for (const seg of segments) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  // Resolved target may itself be a $ref; resolve transitively (bounded).
  return resolveRef(current as SchemaNode);
}

// ---------------------------------------------------------------------------
// Operation lookup
// ---------------------------------------------------------------------------

const operationIndex = new Map<string, { op: OperationNode; pathItem: PathItemNode }>();

function buildOperationIndex(): void {
  if (operationIndex.size > 0) return;
  const spec = loadV2Spec();
  const paths = spec.paths ?? {};
  for (const pathKey of Object.keys(paths)) {
    const pathItem = paths[pathKey];
    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as OperationNode | undefined;
      if (op && typeof op === "object" && typeof op.operationId === "string") {
        operationIndex.set(op.operationId, { op, pathItem });
      }
    }
  }
}

/** Find the operation (and its containing path-item) by operationId. Throws if absent. */
export function findOperation(operationId: string): { op: OperationNode; pathItem: PathItemNode } {
  buildOperationIndex();
  const found = operationIndex.get(operationId);
  if (!found) {
    throw new Error(
      `OpenAPI contract: operationId "${operationId}" not found in ${SPEC_PATH}. ` +
        `(Check the spelling against the vendored v2 spec.)`,
    );
  }
  return found;
}

// ---------------------------------------------------------------------------
// Request body shape
// ---------------------------------------------------------------------------

/** The JSON request-body schema (application/json) for an operation, refs resolved. */
function requestBodySchema(operationId: string): SchemaNode {
  const { op } = findOperation(operationId);
  const raw = op.requestBody?.content?.["application/json"]?.schema;
  const schema = resolveRef(raw);
  if (!schema) {
    throw new Error(
      `OpenAPI contract: operation "${operationId}" has no application/json requestBody schema.`,
    );
  }
  return schema;
}

/**
 * Allowed top-level body property names for a POST/PATCH operation. Merges
 * `allOf` branches via `collectProperties` so composed schemas (e.g. addProduct/
 * updateProduct, which compose their body from several `allOf` fragments rather
 * than a single flat `properties` map) expose every allowed key, not [].
 */
export function requestBodyProps(operationId: string): Set<string> {
  const schema = requestBodySchema(operationId);
  return new Set(Object.keys(collectProperties(schema)));
}

/**
 * The spec `type` for a top-level body property (e.g. 'array' | 'object' |
 * 'string' | 'integer' | 'number' | 'boolean'). Returns undefined if the
 * property is unknown or has no declared type.
 */
export function requestBodyPropType(operationId: string, prop: string): string | undefined {
  const schema = requestBodySchema(operationId);
  const propSchema = resolveRef(collectProperties(schema)[prop]);
  return propSchema?.type;
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/** Collect this operation's query parameters (operation-level + path-item-level). */
function queryParameters(operationId: string): ParameterNode[] {
  const { op, pathItem } = findOperation(operationId);
  const fromPath = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
  const fromOp = Array.isArray(op.parameters) ? op.parameters : [];
  return [...fromPath, ...fromOp]
    .map((p) => (p && (p as ParameterNode).$ref ? (resolveRef(p as SchemaNode) as ParameterNode) : p))
    .filter((p): p is ParameterNode => !!p && (p as ParameterNode).in === "query");
}

/** Allowed query param names for a GET operation. */
export function queryParamNames(operationId: string): Set<string> {
  return new Set(
    queryParameters(operationId)
      .map((p) => p.name)
      .filter((n): n is string => typeof n === "string"),
  );
}

/** The enum values for a query param, if the spec constrains it; else undefined. */
export function queryParamEnum(operationId: string, name: string): unknown[] | undefined {
  const param = queryParameters(operationId).find((p) => p.name === name);
  const schema = resolveRef(param?.schema);
  return Array.isArray(schema?.enum) ? schema!.enum : undefined;
}

// ---------------------------------------------------------------------------
// Runtime type predicates (spec type -> JS runtime check)
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Does `value` satisfy the spec `type`? This is the precise bug-catcher:
 *   array  -> Array.isArray         (scalar `email` vs `emails: array` => fail, #42)
 *   object -> plain object          (string `address` vs object => fail, #44)
 *   string/integer/number/boolean -> typeof / Number.isFinite
 * Unknown/absent spec types are treated as permissive (true).
 */
function valueMatchesSpecType(value: unknown, specType: string | undefined): boolean {
  switch (specType) {
    case "array":
      return Array.isArray(value);
    case "object":
      return isPlainObject(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return true; // no/unknown spec type -> don't constrain
  }
}

// ---------------------------------------------------------------------------
// Body conformance assertion
// ---------------------------------------------------------------------------

/**
 * Throws if `body` violates the v2 spec for `operationId`:
 *  - any key NOT in the spec's allowed top-level body properties (catches "param
 *    not in v2" / singular-vs-plural assoc keys — #43/#48), OR
 *  - a key whose JS runtime type contradicts the spec `type` (array/object/scalar
 *    — the #42/#44/#45 class).
 *
 * `custom_fields` is intentionally permissive: the spec declares it `type: object`
 * with `additionalProperties: true` (hash-keyed caller-defined values), so we only
 * assert it is an object and do NOT recurse into its contents (plan §2.2).
 */
export function assertBodyConformsToSpec(operationId: string, body: unknown): void {
  if (!isPlainObject(body)) {
    throw new Error(
      `OpenAPI contract [${operationId}]: outbound body is not a JSON object (got ${typeof body}).`,
    );
  }
  const allowed = requestBodyProps(operationId);
  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(
        `OpenAPI contract [${operationId}]: outbound body has key "${key}" which is NOT an ` +
          `allowed v2 request property. Allowed: [${[...allowed].sort().join(", ")}].`,
      );
    }
    const value = record[key];
    if (value === undefined || value === null) continue; // absent/explicit-null is shape-neutral
    if (key === "custom_fields") {
      // Permissive: only the top-level type is contractual (object); contents are hashes.
      if (!isPlainObject(value)) {
        throw new Error(
          `OpenAPI contract [${operationId}]: "custom_fields" must be an object, got ${typeof value}.`,
        );
      }
      continue;
    }
    const specType = requestBodyPropType(operationId, key);
    if (!valueMatchesSpecType(value, specType)) {
      const actual = Array.isArray(value) ? "array" : typeof value;
      throw new Error(
        `OpenAPI contract [${operationId}]: outbound body key "${key}" has runtime type ` +
          `"${actual}" but the v2 spec declares type "${specType}".`,
      );
    }
  }
}

/**
 * Throws if `body` violates a v2 operation whose request body is a top-level
 * JSON *array* — the field-option bulk verbs (updateDealFieldOptions PATCH,
 * deleteDealFieldOptions and its person/org/product siblings: body-bearing
 * DELETE) send an array payload, which `assertBodyConformsToSpec` rejects by
 * design. Asserts:
 *  - the spec really declares an array body (guards against pointing this at an
 *    object-body op by mistake),
 *  - the captured body is an array,
 *  - every element is an object whose keys are all allowed `items` properties
 *    and whose values match each property's spec `type`.
 *
 * Element-level checking reuses the same name+type discipline as
 * `assertBodyConformsToSpec`, so a stray key (e.g. reverting deleteDealFieldOptions
 * to send `{ option_id }` instead of `{ id }`) or a wrong runtime type fails here.
 *
 * Scope: this validates element *shape* only. It does not enforce a minimum
 * length (the v2 spec declares no `minItems` for these bodies), so an empty array
 * passes — callers asserting "at least one element was sent" must check that
 * themselves. It also skips item key-name checks when the `items` schema declares
 * no `properties` (a free-form `{ type: object }`), since there is nothing to
 * constrain against.
 */
export function assertArrayBodyConformsToSpec(operationId: string, body: unknown): void {
  const schema = requestBodySchema(operationId);
  if (schema.type !== "array") {
    throw new Error(
      `OpenAPI contract [${operationId}]: expected a top-level array request body, but the v2 ` +
        `spec declares type "${schema.type ?? "(none)"}". Use assertBodyConformsToSpec instead.`,
    );
  }
  if (!Array.isArray(body)) {
    throw new Error(
      `OpenAPI contract [${operationId}]: outbound body is not a JSON array (got ${typeof body}).`,
    );
  }

  const itemSchema = resolveRef(schema.items) ?? {};
  const allowed = new Set(Object.keys(itemSchema.properties ?? {}));

  body.forEach((item, i) => {
    if (!isPlainObject(item)) {
      const actual = Array.isArray(item) ? "array" : typeof item;
      throw new Error(
        `OpenAPI contract [${operationId}]: array element [${i}] is not a JSON object (got ${actual}).`,
      );
    }
    const record = item as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (allowed.size > 0 && !allowed.has(key)) {
        throw new Error(
          `OpenAPI contract [${operationId}]: array element [${i}] has key "${key}" which is NOT an ` +
            `allowed v2 item property. Allowed: [${[...allowed].sort().join(", ")}].`,
        );
      }
      const value = record[key];
      if (value === undefined || value === null) continue;
      const specType = resolveRef(itemSchema.properties?.[key])?.type;
      if (!valueMatchesSpecType(value, specType)) {
        const actual = Array.isArray(value) ? "array" : typeof value;
        throw new Error(
          `OpenAPI contract [${operationId}]: array element [${i}] key "${key}" has runtime type ` +
            `"${actual}" but the v2 spec declares type "${specType}".`,
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Query conformance assertion
// ---------------------------------------------------------------------------

// Auth keys are transport-level, not operation query params: v2 sends the token
// as the `x-api-token` HEADER, while v1 uses the `api_token` QUERY param. The
// contract checker must ignore `api_token` so a (hypothetical) v1 URL is not
// flagged for an auth key the operation spec never lists.
const IGNORED_QUERY_KEYS = new Set(["api_token"]);

/**
 * Throws if the captured outbound `url` carries a query param that is NOT in the
 * operation's allowed query-param set (catches re-added invalid params like
 * `first_char`/`type`/`board_id` — #48), OR carries an enum-constrained param
 * with a value outside the spec's enum (catches `status=all_not_deleted` — #46).
 *
 * Comma-separated values (the spec allows e.g. `status`, `fields` as comma lists)
 * are split and each token is enum-checked.
 */
export function assertQueryConformsToSpec(operationId: string, url: string | URL): void {
  const allowed = queryParamNames(operationId);
  const search = new URL(String(url)).searchParams;

  for (const key of search.keys()) {
    if (IGNORED_QUERY_KEYS.has(key)) continue;
    if (!allowed.has(key)) {
      throw new Error(
        `OpenAPI contract [${operationId}]: outbound query has param "${key}" which is NOT an ` +
          `allowed v2 query parameter. Allowed: [${[...allowed].sort().join(", ")}].`,
      );
    }
    const enumValues = queryParamEnum(operationId, key);
    if (enumValues) {
      const allowedValues = new Set(enumValues.map((v) => String(v)));
      for (const raw of search.getAll(key)) {
        for (const token of raw.split(",")) {
          if (!allowedValues.has(token)) {
            throw new Error(
              `OpenAPI contract [${operationId}]: query param "${key}" has value "${token}" ` +
                `outside the v2 enum [${[...allowedValues].sort().join(", ")}].`,
            );
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Response field-name introspection (the #60 class)
// ---------------------------------------------------------------------------

/** Merge `allOf` branches (and a top-level node) into one property bag. */
function collectProperties(schema: SchemaNode | undefined): Record<string, SchemaNode> {
  const resolved = resolveRef(schema);
  if (!resolved) return {};
  let props: Record<string, SchemaNode> = { ...(resolved.properties ?? {}) };
  if (Array.isArray(resolved.allOf)) {
    for (const branch of resolved.allOf) {
      props = { ...props, ...collectProperties(branch) };
    }
  }
  return props;
}

/**
 * The property names of the *items* inside a list-field response's `data` for a
 * GET-fields operation (e.g. getActivityFields -> each field object's props).
 * Walks: response 200 -> application/json schema -> (allOf-merged) `data` ->
 * if `data` is an array, its `items`; else `data` itself.
 */
function fieldResponseItemProps(operationId: string): Set<string> {
  const { op } = findOperation(operationId);
  const schema = op.responses?.["200"]?.content?.["application/json"]?.schema;
  const top = collectProperties(schema);
  const data = resolveRef(top["data"]);
  if (!data) {
    throw new Error(
      `OpenAPI contract [${operationId}]: response 200 has no "data" property to introspect.`,
    );
  }
  const itemSchema = data.type === "array" ? resolveRef(data.items) : data;
  const itemProps = collectProperties(itemSchema);
  return new Set(Object.keys(itemProps));
}

/**
 * Whether the field-list response items for `operationId` declare a property
 * named `prop`. Used to prove the v2 field contract keys on `field_code` (true)
 * and NOT `key` (false) — the #60 evidence (claim G). Spec-revert-proof.
 */
export function fieldResponseHasProperty(operationId: string, prop: string): boolean {
  return fieldResponseItemProps(operationId).has(prop);
}
