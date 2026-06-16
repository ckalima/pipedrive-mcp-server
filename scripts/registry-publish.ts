/**
 * Local fallback for publishing the MCP-registry entry (both npm + mcpb packages).
 *
 * The Release workflow publishes the registry entry automatically on a tag push via OIDC.
 * This script is the human recovery path for when that did not happen — a CI hiccup, OIDC
 * troubleshooting on a first run, or back-publishing a version whose registry entry was never
 * created. It mirrors the CI registry job: hash the bundle, inject the URL + hash into
 * server.json (via registry-inject), then `mcp-publisher login/validate/publish`.
 *
 * Usage:
 *   npm run registry:publish                      # build a fresh .mcpb from HEAD and publish it
 *   npm run registry:publish -- ./path/to.mcpb    # publish a SPECIFIC bundle (use this for
 *                                                 #   back-publishing: download the .mcpb asset
 *                                                 #   from the target GitHub Release first, so the
 *                                                 #   hash matches the bytes clients already have)
 *
 * Auth uses your GitHub token (`gh auth token`), the same identity as the live registry entry.
 * After publishing, server.json is left with the real hash — `git checkout server.json` restores
 * the committed all-zeros sentinel.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { injectMcpb, sha256File } from "./registry-inject.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_JSON = join(ROOT, "server.json");
const PACKAGE_JSON = join(ROOT, "package.json");

function run(cmd: string, args: string[], opts: { capture?: boolean } = {}): string {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  return execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: opts.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  }) as string;
}

function haveOnPath(bin: string): boolean {
  try {
    execFileSync("command", ["-v", bin], { shell: "/bin/bash", stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  const version = (JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version: string }).version;

  if (!haveOnPath("mcp-publisher")) {
    console.error(
      "mcp-publisher not found on PATH. Install it (see docs/RELEASE.md), e.g.:\n" +
        '  brew install mcp-publisher   # or download from github.com/modelcontextprotocol/registry/releases',
    );
    process.exit(1);
  }

  // Locate the bundle. An explicit path is REQUIRED for back-publishing a released version,
  // because a fresh rebuild is not byte-identical to the asset clients already downloaded.
  let mcpbPath = process.argv[2];
  if (mcpbPath) {
    if (!existsSync(mcpbPath)) {
      console.error(`bundle not found: ${mcpbPath}`);
      process.exit(1);
    }
  } else {
    console.warn(
      "no bundle path given — building a fresh .mcpb from HEAD.\n" +
        "  (To back-publish an ALREADY-RELEASED version, download its .mcpb from the GitHub\n" +
        "   Release and pass that path instead, so the published hash matches the live asset.)",
    );
    run("npm", ["run", "bundle:mcpb"]);
    mcpbPath = join(ROOT, `pipedrive-mcp-server-${version}.mcpb`);
  }

  // Inject the real URL + hash into server.json (in place).
  const sha256 = sha256File(mcpbPath);
  const serverJson = JSON.parse(readFileSync(SERVER_JSON, "utf8"));
  writeFileSync(SERVER_JSON, JSON.stringify(injectMcpb(serverJson, version, sha256), null, 2) + "\n");
  console.log(`injected ${mcpbPath}\n  sha256=${sha256}`);

  // Authenticate with the existing GitHub identity and publish (npm + mcpb packages together).
  const token = run("gh", ["auth", "token"], { capture: true }).trim();
  run("mcp-publisher", ["login", "github", "--token", token]);
  run("mcp-publisher", ["validate", "server.json"]);
  run("mcp-publisher", ["publish"]);

  console.log(
    "\npublished. server.json now holds the real hash — run `git checkout server.json` to restore the sentinel.",
  );
}

main();
