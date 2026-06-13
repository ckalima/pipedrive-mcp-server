/**
 * MCPB bundle builder for the Pipedrive MCP server.
 *
 * Produces a self-contained `.mcpb` (a zipped `bundle/` directory: manifest.json +
 * a compiled `server/` tree with its production node_modules) using the pinned
 * `@anthropic-ai/mcpb` packer. Run via `npm run bundle:mcpb`.
 *
 * This is a release-time step (see issue #84's publish workflow); it is NOT run in
 * per-PR CI. It assumes `bundle/manifest.json` is already in sync with the live tool
 * registry, which the `npm run gen:docs` drift gate guarantees on every PR. The
 * compiled `server/` tree and the `.mcpb` output are gitignored and rebuilt fresh
 * here, so a clean checkout reproduces the bundle from source.
 */

import { execFileSync, execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const BUNDLE = join(ROOT, "bundle");
const SERVER = join(BUNDLE, "server");
const PACKAGE_PATH = join(ROOT, "package.json");

function run(command: string, cwd: string = ROOT): void {
  console.log(`$ ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

function main(): void {
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
    version: string;
    dependencies: Record<string, string>;
  };

  // 1. Compile TypeScript to dist/.
  run("npm run build");

  // 2. Reset bundle/server to a clean compiled tree.
  rmSync(SERVER, { recursive: true, force: true });
  mkdirSync(SERVER, { recursive: true });
  cpSync(DIST, SERVER, { recursive: true });

  // 3. Write a production-only package.json so the bundle installs only runtime deps.
  const serverPkg = {
    name: "server",
    version: pkg.version,
    type: "module",
    main: "index.js",
    dependencies: pkg.dependencies,
  };
  writeFileSync(join(SERVER, "package.json"), JSON.stringify(serverPkg, null, 2) + "\n");

  // 4. Install production deps inside the bundle so the .mcpb is self-contained.
  run("npm install --omit=dev --no-audit --no-fund", SERVER);

  // 5. Pack bundle/ into a versioned .mcpb at the repo root. execFileSync (argv, no
  //    shell) keeps BUNDLE/out as discrete arguments, so a checkout path containing a
  //    space or shell metacharacter is never word-split.
  const out = join(ROOT, `pipedrive-mcp-server-${pkg.version}.mcpb`);
  console.log(`$ npx mcpb pack ${BUNDLE} ${out}`);
  execFileSync("npx", ["mcpb", "pack", BUNDLE, out], { cwd: ROOT, stdio: "inherit" });

  console.log(`\nbuilt ${out}`);
}

main();
