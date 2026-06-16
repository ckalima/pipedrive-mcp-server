/**
 * Injects the real `.mcpb` download URL + SHA-256 into the registry's `server.json`
 * `mcpb` package descriptor, immediately before `mcp-publisher publish`.
 *
 * Why this exists: the MCP registry does NOT validate `fileSha256` (only MCP clients do,
 * at install time), and the `.mcpb` build is not byte-reproducible — so the hash cannot be
 * hand-committed before a release tag. The committed `server.json` carries an all-zeros
 * SENTINEL hash; this script overwrites it with the hash of the EXACT artifact that was
 * built/attached, keeping the published entry in lockstep with the bundle clients download.
 *
 * Used by both the Release workflow (CI, OIDC publish) and `scripts/registry-publish.ts`
 * (the local back-publish fallback), so the rewrite logic lives in one tested place.
 *
 * Usage: `npm run registry:inject -- <path-to.mcpb>` (rewrites server.json in place).
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_JSON = join(ROOT, "server.json");
const PACKAGE_JSON = join(ROOT, "package.json");

const OWNER_REPO = "ckalima/pipedrive-mcp-server";

/** SHA-256 of a file as lowercase hex (matches `openssl dgst -sha256` / the registry format). */
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * The bundle's filename. Single source of truth: `build-mcpb.ts` names the artifact with this,
 * `mcpbUrl()` embeds it, and `release.yml` matches the same pattern — so the three places that
 * reference the `.mcpb` filename can't drift (a unit test pins the pattern).
 */
export function mcpbFilename(version: string): string {
  return `pipedrive-mcp-server-${version}.mcpb`;
}

/** The canonical, version-templated GitHub Release download URL for the bundle. */
export function mcpbUrl(version: string): string {
  return `https://github.com/${OWNER_REPO}/releases/download/v${version}/${mcpbFilename(version)}`;
}

type Pkg = {
  registryType: string;
  identifier?: string;
  version?: string;
  fileSha256?: string;
};
type ServerJson = { packages: Pkg[] };

/**
 * Pure rewrite: returns a new server.json object with the `mcpb` package's `identifier`
 * (version-templated URL) and `fileSha256` set. Throws on a missing mcpb package, a URL
 * that does not contain "mcp" (the registry's MCPB rule), or a non-64-hex hash.
 */
export function injectMcpb(serverJson: ServerJson, version: string, sha256: string): ServerJson {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`fileSha256 must be 64 lowercase hex chars, got: ${sha256}`);
  }
  const next = structuredClone(serverJson);
  const mcpb = next.packages.find((p) => p.registryType === "mcpb");
  if (!mcpb) {
    throw new Error('server.json has no package with registryType "mcpb"');
  }
  const url = mcpbUrl(version);
  if (!url.toLowerCase().includes("mcp")) {
    throw new Error(`MCPB identifier URL must contain "mcp": ${url}`);
  }
  mcpb.identifier = url;
  mcpb.version = version;
  mcpb.fileSha256 = sha256;
  return next;
}

function main(): void {
  const mcpbPath = process.argv[2];
  if (!mcpbPath) {
    console.error("usage: registry-inject.ts <path-to.mcpb>");
    process.exit(2);
  }
  const version = (JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version: string }).version;
  const sha256 = sha256File(mcpbPath);
  const serverJson = JSON.parse(readFileSync(SERVER_JSON, "utf8")) as ServerJson;
  const next = injectMcpb(serverJson, version, sha256);
  writeFileSync(SERVER_JSON, JSON.stringify(next, null, 2) + "\n");

  const mcpb = next.packages.find((p) => p.registryType === "mcpb")!;
  console.log(`injected mcpb descriptor into server.json:`);
  console.log(`  url:        ${mcpb.identifier}`);
  console.log(`  fileSha256: ${mcpb.fileSha256}`);
  // Emit the hash on its own line for CI to capture (e.g. into a job output).
  console.log(`sha256=${sha256}`);
}

// Run only when invoked directly, so tests can import the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
