/**
 * Documentation generator for the Pipedrive MCP server.
 *
 * Single source of truth: the live `allTools` array. This script emits
 *   (a) the README tool table, spliced between the GENERATED TOOLS sentinels, and
 *   (b) the MCPB `bundle/manifest.json` `tools` array,
 * so neither doc can silently drift from the registered tool surface. CI runs the
 * generator and fails on any diff (see `.github/workflows/ci.yml`).
 *
 * Markers:
 *   - destructive tools (declared `destructive: true` on the tool def, gated at
 *     runtime by `PIPEDRIVE_ENABLE_DESTRUCTIVE`) are flagged 🔒
 *   - Growth+ plan tools (literal `Growth+` in their description) are flagged ⭑
 *
 * Safety: this script runs NO production handler code. It reads only declared tool
 * metadata, so doc generation can never issue a live Pipedrive API call. The
 * destructive field is kept honest by a static field↔guard invariant test in
 * `tests/unit/gen-docs.test.ts` (which scans handler source for the guard, never
 * executes it).
 *
 * Run via `npm run gen:docs` (tsx). Importing this module is side-effect free; the
 * files are written only when the script is executed as the entrypoint.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import { dealTools } from "../src/tools/deals.js";
import { personTools } from "../src/tools/persons.js";
import { organizationTools } from "../src/tools/organizations.js";
import { activityTools } from "../src/tools/activities.js";
import { noteTools } from "../src/tools/notes.js";
import { leadsTools } from "../src/tools/leads.js";
import { projectTools } from "../src/tools/projects.js";
import { productTools } from "../src/tools/products.js";
import { taskTools } from "../src/tools/tasks.js";
import { boardTools, phaseTools } from "../src/tools/boards.js";
import { mailTools } from "../src/tools/mail.js";
import { fieldTools } from "../src/tools/fields.js";
import { pipelineTools } from "../src/tools/pipelines.js";
import { userTools } from "../src/tools/users.js";
import { allTools } from "../src/tools/index.js";

/** Structural view of a tool def - all the generator ever reads. */
export type ToolLike = { name: string; description: string; destructive?: boolean };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README_PATH = join(ROOT, "README.md");
const MANIFEST_PATH = join(ROOT, "bundle", "manifest.json");
const PACKAGE_PATH = join(ROOT, "package.json");

const BEGIN = "<!-- BEGIN GENERATED TOOLS -->";
const END = "<!-- END GENERATED TOOLS -->";
const DESTRUCTIVE_MARK = "🔒";
const GROWTH_MARK = "⭑";

/**
 * Fixed display groups, sourced by provenance (each tool belongs to exactly one,
 * via the per-entity `*Tools` array it ships in). The order of this array is the
 * sole determinant of README section ordering and is therefore deterministic.
 * Boards+Phases and Pipelines+Stages are presented as combined groups.
 */
export const GROUPS: { title: string; tools: ToolLike[] }[] = [
  { title: "Deals", tools: dealTools },
  { title: "Persons", tools: personTools },
  { title: "Organizations", tools: organizationTools },
  { title: "Activities", tools: activityTools },
  { title: "Notes", tools: noteTools },
  { title: "Leads", tools: leadsTools },
  { title: "Projects", tools: projectTools },
  { title: "Products", tools: productTools },
  { title: "Tasks", tools: taskTools },
  { title: "Boards & Phases", tools: [...boardTools, ...phaseTools] },
  { title: "Mail", tools: mailTools },
  { title: "Fields", tools: fieldTools },
  { title: "Pipelines & Stages", tools: pipelineTools },
  { title: "Users", tools: userTools },
];

export function isDestructive(tool: ToolLike): boolean {
  return tool.destructive === true;
}

export function isGrowthPlus(tool: ToolLike): boolean {
  return tool.description.includes("Growth+");
}

/** Strip an npm scope (`@scope/name` → `name`); MCPB names are unscoped. */
export function stripScope(name: string): string {
  return name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
}

/** One classified row per registered tool, in display-group order. */
export function classifyAll(): { name: string; group: string; destructive: boolean; growthPlus: boolean }[] {
  return GROUPS.flatMap((group) =>
    group.tools.map((tool) => ({
      name: tool.name,
      group: group.title,
      destructive: isDestructive(tool),
      growthPlus: isGrowthPlus(tool),
    })),
  );
}

/**
 * Verify the display groups cover the live registry exactly once: no tool missing,
 * none duplicated, none orphaned. Throws on any mismatch (a new entity added to
 * `allTools` but not to GROUPS, for example).
 */
function assertGroupCoverage(): void {
  const grouped = GROUPS.flatMap((g) => g.tools.map((t) => t.name));
  const groupedSet = new Set(grouped);
  if (grouped.length !== groupedSet.size) {
    throw new Error("Duplicate tool across display groups - a tool is listed in more than one group.");
  }
  if (grouped.length !== allTools.length) {
    throw new Error(`Group coverage mismatch: ${grouped.length} grouped vs ${allTools.length} registered tools.`);
  }
  for (const tool of allTools) {
    if (!groupedSet.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is registered but not assigned to any display group in gen-docs.ts.`);
    }
  }
}

/** Escape a description for a single Markdown table cell. */
function mdCell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/** Build the generated README region (inclusive of both sentinel markers). */
export function buildReadmeRegion(): string {
  const lines: string[] = [];
  lines.push(BEGIN);
  lines.push("");
  lines.push(
    `**${allTools.length} tools.** ${DESTRUCTIVE_MARK} destructive ` +
      `(require \`PIPEDRIVE_MODE=full\`, off by default) · ` +
      `${GROWTH_MARK} requires a Growth+ plan. ` +
      `The active [capability mode](#capability-modes) governs which tools are listed.`,
  );
  lines.push("");
  lines.push(
    "<sub>This section is generated by `npm run gen:docs` from the live tool registry. " +
      "Do not edit by hand - CI fails on drift.</sub>",
  );
  for (const group of GROUPS) {
    lines.push("");
    lines.push(`### ${group.title}`);
    lines.push("");
    lines.push("| Tool | Description |");
    lines.push("|------|-------------|");
    for (const tool of group.tools) {
      const marks =
        (isDestructive(tool) ? ` ${DESTRUCTIVE_MARK}` : "") +
        (isGrowthPlus(tool) ? ` ${GROWTH_MARK}` : "");
      lines.push(`| \`${tool.name}\`${marks} | ${mdCell(tool.description)} |`);
    }
  }
  lines.push("");
  lines.push(END);
  return lines.join("\n");
}

/** The MCPB manifest `tools` array, derived from the live registry. */
export function buildManifestTools(): { name: string; description: string }[] {
  return allTools.map((tool) => ({ name: tool.name, description: tool.description }));
}

/**
 * Known top-level manifest fields. The generator reconstructs the manifest with a
 * fixed key order for determinism; any field present in the existing manifest but
 * absent here would be silently dropped, so we assert against this set instead.
 *
 * Note: the MCPB schema rejects unknown top-level keys (`mcpb validate` fails on
 * them), so there is no inline "generated, do not edit" breadcrumb in the manifest.
 * Provenance lives in the README's generated region, CONTRIBUTING.md, and the CI
 * drift gate, which is what actually keeps the file honest.
 */
const KNOWN_MANIFEST_KEYS = new Set([
  "manifest_version",
  "name",
  "display_name",
  "version",
  "description",
  "author",
  "repository",
  "license",
  "server",
  "user_config",
  "tools",
  "keywords",
]);

/** Build the full manifest object (deterministic key order), sourced from package.json + the existing manifest. */
export function buildManifest(): Record<string, unknown> {
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as Record<string, unknown>;
  const existing = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<string, unknown>;

  for (const key of Object.keys(existing)) {
    if (!KNOWN_MANIFEST_KEYS.has(key)) {
      throw new Error(`Unknown manifest key '${key}'. Update KNOWN_MANIFEST_KEYS in gen-docs.ts so it is preserved.`);
    }
  }

  // name/version/description track package.json (so #84's rename flows through);
  // author/repository/license/display_name/server/user_config/keywords are
  // preserved verbatim (package.json's author is a bare string, which MCPB rejects).
  return {
    manifest_version: existing.manifest_version,
    name: stripScope(String(pkg.name)),
    display_name: existing.display_name,
    version: pkg.version,
    description: pkg.description,
    author: existing.author,
    repository: existing.repository,
    license: existing.license,
    server: existing.server,
    user_config: existing.user_config,
    tools: buildManifestTools(),
    keywords: existing.keywords,
  };
}

/** Splice the generated region into README.md between the sentinel markers. */
function writeReadme(): void {
  const readme = readFileSync(README_PATH, "utf8");
  const beginIdx = readme.indexOf(BEGIN);
  const endIdx = readme.indexOf(END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    throw new Error(
      `README.md is missing the generated-tools markers (${BEGIN} ... ${END}). ` +
        "Add them where the tool table should appear, then re-run `npm run gen:docs`.",
    );
  }
  const before = readme.slice(0, beginIdx);
  const after = readme.slice(endIdx + END.length);
  writeFileSync(README_PATH, before + buildReadmeRegion() + after);
}

/** Write bundle/manifest.json with stable 2-space formatting and a trailing newline. */
function writeManifest(): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(buildManifest(), null, 2) + "\n");
}

function main(): void {
  assertGroupCoverage();

  const destructiveCount = allTools.filter(isDestructive).length;
  if (destructiveCount === 0) {
    throw new Error("No destructive tools found - the `destructive` field may have been lost on the tool defs.");
  }
  const growthCount = allTools.filter(isGrowthPlus).length;

  writeReadme();
  writeManifest();

  console.log(
    `gen-docs: ${allTools.length} tools across ${GROUPS.length} groups ` +
      `(${destructiveCount} destructive, ${growthCount} Growth+). ` +
      "Wrote README.md region + bundle/manifest.json.",
  );
}

// Run the writes only when invoked directly (not when imported by the test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
