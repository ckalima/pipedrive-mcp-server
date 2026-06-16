/**
 * Non-destructive config writer (U4).
 *
 * Writes a rendered config block into a host file safely — read, merge under the
 * correct top-level key WITHOUT disturbing siblings, back up, then write
 * atomically (temp-file-then-rename) at mode 0600 (KTD5, R9/R14). For Claude
 * Code local/user scope it returns a `claude mcp add` invocation instead, built
 * so the literal key never enters argv (R10/R15). A malformed existing file
 * aborts the write and signals fallback-to-print; the original is left untouched.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { dirname, basename, resolve, join, delimiter } from "node:path";
import { tmpdir } from "node:os";

import { ENV_VAR_NAME } from "../config.js";
import {
  SERVER_NAME,
  SERVER_COMMAND,
  SERVER_ARGS,
  VSCODE_INPUT_ID,
  resolveTargetPath,
  type ConfigTarget,
  type RenderedConfig,
} from "./config-targets.js";

/** The outcome of an attempted config write. */
export type WriteOutcome =
  | { kind: "written"; path: string; backupPath?: string; backupRelocated: boolean }
  | { kind: "cli"; command: string; followUp: string; claudeAvailable: boolean }
  | { kind: "print"; reason: string };

/** Injectable seams so the writer is testable without git/PATH/clock coupling. */
export interface WriteConfigDeps {
  /** Destination path override (defaults to resolveTargetPath(target)). */
  pathOverride?: string;
  /** "Is this path inside a git working tree?" — gates out-of-tree backup (R14). */
  isInsideGitTree?: (path: string) => boolean;
  /** "Is the `claude` CLI installed?" — adjusts the CLI follow-up text. */
  isClaudeAvailable?: () => boolean;
  /** Directory for relocated (out-of-tree) backups (defaults to os.tmpdir()). */
  backupDir?: string;
  /** Timestamp suffix for backup/temp filenames (injected for deterministic tests). */
  timestamp?: string;
}

/**
 * Builds the `claude mcp add` invocation for Claude Code local/user scope.
 *
 * The key is referenced via `${PIPEDRIVE_API_KEY}`, single-quoted so the SHELL
 * does not expand it — Claude Code expands it from its own environment at server
 * launch. The literal key therefore never enters argv or shell history (R15).
 * The server name follows `--scope` (not directly after `--env`) to dodge the
 * CLI's "name read as another env pair" footgun.
 */
export function claudeMcpAddInvocation(scope: string): { command: string; followUp: string } {
  const command =
    `claude mcp add --env '${ENV_VAR_NAME}=\${${ENV_VAR_NAME}}' ` +
    `--scope ${scope} --transport stdio ${SERVER_NAME} -- ${SERVER_COMMAND} ${SERVER_ARGS.join(" ")}`;
  const followUp =
    `Ensure ${ENV_VAR_NAME} is set in the environment Claude Code runs in ` +
    `(e.g. add \`export ${ENV_VAR_NAME}=<your key>\` to your shell profile) so the reference resolves at launch.`;
  return { command, followUp };
}

/** Walks up from a path looking for a `.git` entry (dir or file). Exported so the
 *  orchestrator (U5) phrases its in-tree write confirmation with the same check
 *  that gates backup relocation here (R14/R17). */
export function isPathInsideGitTree(target: string): boolean {
  let dir = dirname(resolve(target));
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/** Scans PATH for a `claude` executable. */
function defaultIsClaudeAvailable(): boolean {
  const path = process.env.PATH ?? "";
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        if (existsSync(join(dir, `claude${ext}`))) return true;
      } catch {
        // ignore unreadable PATH entries
      }
    }
  }
  return false;
}

/** A filesystem-safe timestamp for backup/temp filenames. */
function defaultTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Merges our server entry into the existing parsed config under the correct
 * top-level key, preserving every sibling server (R9). VS Code's `inputs` array
 * is merged by id so re-running stays idempotent.
 */
function mergeConfig(
  existing: Record<string, unknown>,
  block: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };

  for (const [topKey, value] of Object.entries(block)) {
    if (topKey === "inputs" && Array.isArray(value)) {
      const prior = Array.isArray(existing.inputs) ? (existing.inputs as unknown[]) : [];
      const withoutOurs = prior.filter(
        (i) => !(i && typeof i === "object" && (i as { id?: unknown }).id === VSCODE_INPUT_ID),
      );
      merged.inputs = [...withoutOurs, ...value];
      continue;
    }
    // Server map (mcpServers / servers): merge our entry, keep siblings.
    const priorMap =
      existing[topKey] && typeof existing[topKey] === "object" && !Array.isArray(existing[topKey])
        ? (existing[topKey] as Record<string, unknown>)
        : {};
    const ourMap = value as Record<string, unknown>;
    merged[topKey] = { ...priorMap, ...ourMap };
  }

  return merged;
}

/**
 * Writes `rendered` into the host file (or returns a CLI/print outcome). Never
 * throws on an expected condition — a malformed file, an unresolved path, or a
 * CLI target each return a structured outcome the orchestrator acts on.
 */
export function writeConfig(
  target: ConfigTarget,
  rendered: RenderedConfig,
  deps: WriteConfigDeps = {},
): WriteOutcome {
  // Claude Code local/user: emit the no-argv add command instead of editing a file.
  if (target.delivery === "cli") {
    const { command, followUp } = claudeMcpAddInvocation(target.scope ?? "local");
    const claudeAvailable = (deps.isClaudeAvailable ?? defaultIsClaudeAvailable)();
    return { kind: "cli", command, followUp, claudeAvailable };
  }

  if (!rendered.block) {
    return { kind: "print", reason: "nothing to write for this target" };
  }

  const path = deps.pathOverride ?? resolveTargetPath(target);
  if (!path) {
    return { kind: "print", reason: "no stable config path on this OS" };
  }

  // ── Read + parse any existing file (abort on malformed; leave it untouched) ──
  let existing: Record<string, unknown> = {};
  let fileExisted = false;
  if (existsSync(path)) {
    fileExisted = true;
    const raw = readFileSync(path, "utf8");
    if (raw.trim() !== "") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { kind: "print", reason: "existing config is not valid JSON" };
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { kind: "print", reason: "existing config is not a JSON object" };
      }
      existing = parsed as Record<string, unknown>;
    }
  }

  const ts = deps.timestamp ?? defaultTimestamp();
  const merged = mergeConfig(existing, rendered.block);
  const serialized = `${JSON.stringify(merged, null, 2)}\n`;

  // ── Backup the pre-write file (never inside a git tree — relocate or beside it) ──
  let backupPath: string | undefined;
  let backupRelocated = false;
  if (fileExisted) {
    const inTree = (deps.isInsideGitTree ?? isPathInsideGitTree)(path);
    if (inTree) {
      const dir = deps.backupDir ?? tmpdir();
      backupPath = join(dir, `${basename(path)}.bak-${ts}`);
      backupRelocated = true;
    } else {
      backupPath = `${path}.bak-${ts}`;
    }
    copyFileSync(path, backupPath);
    // A backup may carry a literal key, so it is owner-only (R14).
    chmodSync(backupPath, 0o600);
  }

  // ── Atomic write at mode 0600 (temp-then-rename), tightening even a 0644 dest ──
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp-${ts}`;
  writeFileSync(tmpPath, serialized, { mode: 0o600 });
  // Set 0600 explicitly so a pre-existing temp or a permissive umask cannot leave
  // it group/world-readable; rename carries this mode onto the destination.
  chmodSync(tmpPath, 0o600);
  renameSync(tmpPath, path);

  return { kind: "written", path, backupPath, backupRelocated };
}
