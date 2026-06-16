/**
 * Host config descriptor table and renderer (U3).
 *
 * KTD4: ALL host-specific knowledge lives here in one descriptor table — config
 * path per OS, top-level key, committed-vs-private flag, and secret mechanism —
 * so a host-format drift is a one-file edit. KTD3: the committed flag drives
 * literal-vs-indirection; a committed/shared target never renders a literal key.
 *
 * Descriptor values verified against current official docs (2026):
 *   - Claude Code MCP scopes/expansion: https://code.claude.com/docs/en/mcp
 *   - Claude Desktop: https://modelcontextprotocol.io/docs/develop/connect-local-servers
 *   - Cursor (mcpServers; ${env:NAME}; envFile for stdio): https://cursor.com/docs/context/mcp
 *   - Windsurf (~/.codeium/windsurf/mcp_config.json; ${env:VAR}): https://docs.windsurf.com/windsurf/cascade/mcp
 *   - VS Code (top-level `servers`; ${input:id} + promptString/password): https://code.visualstudio.com/docs/copilot/reference/mcp-configuration
 */

import { posix as pathPosix, win32 as pathWin32 } from "node:path";
import { homedir } from "node:os";

import { ENV_VAR_NAME } from "../config.js";

/** The supported MCP client hosts the installer can target. */
export type HostId = "claude-desktop" | "claude-code" | "cursor" | "windsurf" | "vscode";

/** The server entry name written into the host config (matches README). */
export const SERVER_NAME = "pipedrive";
/** The launch command + args, mirroring the canonical README block. */
export const SERVER_COMMAND = "npx";
export const SERVER_ARGS: readonly string[] = ["-y", "@ckalima/pipedrive-mcp-server"];
/** The VS Code `${input:id}` identifier used for the password prompt. */
export const VSCODE_INPUT_ID = "pipedrive-api-key";

/**
 * How the API key is referenced in a rendered config block.
 *  - literal: the raw key (only for user-private, never-committed targets).
 *  - env-ref: a host-specific env interpolation (`${PIPEDRIVE_API_KEY}` for
 *    Claude Code, `${env:PIPEDRIVE_API_KEY}` for Cursor) — the key is never in
 *    the file; the user sets the variable.
 *  - vscode-input: VS Code's `${input:id}` with a top-level `inputs` prompt.
 *  - cli: not a file at all — delivered via `claude mcp add` (U4).
 */
export type SecretMechanism =
  | { kind: "literal" }
  | { kind: "env-ref"; ref: string }
  | { kind: "vscode-input"; inputId: string }
  | { kind: "cli" };

/** Resolution context for a config path (injectable so OS branches are testable). */
export interface PlatformContext {
  platform: NodeJS.Platform;
  homedir: string;
  cwd: string;
  env: Record<string, string | undefined>;
}

/** A single (host, scope) configuration target. */
export interface ConfigTarget {
  host: HostId;
  /** Sub-scope within a host (undefined when the host has a single target). */
  scope?: string;
  displayName: string;
  /** "file": render+write/paste a JSON block. "cli": emit a `claude mcp add` command (U4). */
  delivery: "file" | "cli";
  /** Top-level key for file delivery (`servers` for VS Code, else `mcpServers`). */
  topLevelKey?: "servers" | "mcpServers";
  /** Whether the target file is committed/shared — if so, a literal key is never written (KTD3, R8). */
  committed: boolean;
  secret: SecretMechanism;
  /** Resolves the on-disk path for `ctx`, or null when unsupported/un-pathed on that OS. */
  resolvePath?: (ctx: PlatformContext) => string | null;
}

/** Picks the platform-correct `path` module so a win32 path renders win32 even on POSIX. */
function pathFor(ctx: PlatformContext) {
  return ctx.platform === "win32" ? pathWin32 : pathPosix;
}

const claudeDesktopPath = (ctx: PlatformContext): string | null => {
  const p = pathFor(ctx);
  if (ctx.platform === "darwin") {
    return p.join(ctx.homedir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (ctx.platform === "win32") {
    const appData = ctx.env.APPDATA;
    return appData ? p.join(appData, "Claude", "claude_desktop_config.json") : null;
  }
  return null; // Linux: Claude Desktop unsupported.
};

const ENV_REF_CLAUDE = `\${${ENV_VAR_NAME}}`; // "${PIPEDRIVE_API_KEY}"
const ENV_REF_CURSOR = `\${env:${ENV_VAR_NAME}}`; // "${env:PIPEDRIVE_API_KEY}"

/**
 * The descriptor table, keyed by `host` or `host:scope`. Single source of truth
 * (KTD4). The committed→non-literal invariant is enforced by a unit test (R8).
 */
const TARGETS: Record<string, ConfigTarget> = {
  "claude-desktop": {
    host: "claude-desktop",
    displayName: "Claude Desktop",
    delivery: "file",
    topLevelKey: "mcpServers",
    committed: false, // user-private app config
    secret: { kind: "literal" },
    resolvePath: claudeDesktopPath,
  },

  // Claude Code local/user scopes are delivered via the `claude` CLI (U4) so the
  // key never enters argv or ~/.claude.json directly (R10, R15).
  "claude-code:local": {
    host: "claude-code",
    scope: "local",
    displayName: "Claude Code (local / this project)",
    delivery: "cli",
    committed: false,
    secret: { kind: "cli" },
  },
  "claude-code:user": {
    host: "claude-code",
    scope: "user",
    displayName: "Claude Code (user / all projects)",
    delivery: "cli",
    committed: false,
    secret: { kind: "cli" },
  },
  // Project scope is the committed .mcp.json at the repo root → env indirection.
  "claude-code:project": {
    host: "claude-code",
    scope: "project",
    displayName: "Claude Code (project / committed .mcp.json)",
    delivery: "file",
    topLevelKey: "mcpServers",
    committed: true,
    secret: { kind: "env-ref", ref: ENV_REF_CLAUDE },
    resolvePath: (ctx) => pathFor(ctx).join(ctx.cwd, ".mcp.json"),
  },

  "cursor:global": {
    host: "cursor",
    scope: "global",
    displayName: "Cursor (global / ~/.cursor/mcp.json)",
    delivery: "file",
    topLevelKey: "mcpServers",
    committed: false, // user-private home config
    secret: { kind: "literal" },
    resolvePath: (ctx) => pathFor(ctx).join(ctx.homedir, ".cursor", "mcp.json"),
  },
  "cursor:project": {
    host: "cursor",
    scope: "project",
    displayName: "Cursor (project / committed .cursor/mcp.json)",
    delivery: "file",
    topLevelKey: "mcpServers",
    committed: true,
    secret: { kind: "env-ref", ref: ENV_REF_CURSOR },
    resolvePath: (ctx) => pathFor(ctx).join(ctx.cwd, ".cursor", "mcp.json"),
  },

  windsurf: {
    host: "windsurf",
    displayName: "Windsurf (global)",
    delivery: "file",
    topLevelKey: "mcpServers",
    committed: false, // global-only, user-private
    secret: { kind: "literal" },
    resolvePath: (ctx) => pathFor(ctx).join(ctx.homedir, ".codeium", "windsurf", "mcp_config.json"),
  },

  // VS Code uses the top-level `servers` key (NOT mcpServers) and an ${input:id}
  // password prompt rather than a literal key.
  "vscode:workspace": {
    host: "vscode",
    scope: "workspace",
    displayName: "VS Code (workspace / .vscode/mcp.json)",
    delivery: "file",
    topLevelKey: "servers",
    committed: true,
    secret: { kind: "vscode-input", inputId: VSCODE_INPUT_ID },
    resolvePath: (ctx) => pathFor(ctx).join(ctx.cwd, ".vscode", "mcp.json"),
  },
  // VS Code user profile path is not a stable on-disk location (opened via the
  // "MCP: Open User Configuration" command), so it is print-only (no path).
  "vscode:user": {
    host: "vscode",
    scope: "user",
    displayName: "VS Code (user profile)",
    delivery: "file",
    topLevelKey: "servers",
    committed: false,
    secret: { kind: "vscode-input", inputId: VSCODE_INPUT_ID },
    resolvePath: () => null,
  },
};

/** Per-host display metadata + selectable scopes, derived for the interactive prompt. */
export interface HostInfo {
  id: HostId;
  displayName: string;
  /** Selectable scopes (in offer order); undefined ⇒ single target, no scope prompt. */
  scopes?: { id: string; displayName: string; default?: boolean }[];
}

export const HOSTS: HostInfo[] = [
  { id: "claude-desktop", displayName: "Claude Desktop" },
  {
    id: "claude-code",
    displayName: "Claude Code",
    scopes: [
      { id: "local", displayName: "local (this project, private)", default: true },
      { id: "project", displayName: "project (shared .mcp.json)" },
      { id: "user", displayName: "user (all your projects)" },
    ],
  },
  {
    id: "cursor",
    displayName: "Cursor",
    scopes: [
      { id: "global", displayName: "global (~/.cursor/mcp.json, private)", default: true },
      { id: "project", displayName: "project (shared .cursor/mcp.json)" },
    ],
  },
  { id: "windsurf", displayName: "Windsurf" },
  {
    id: "vscode",
    displayName: "VS Code",
    scopes: [
      { id: "workspace", displayName: "workspace (.vscode/mcp.json)", default: true },
      { id: "user", displayName: "user profile (print-only)" },
    ],
  },
];

const HOST_IDS = new Set<string>(HOSTS.map((h) => h.id));

export function isHostId(value: string): value is HostId {
  return HOST_IDS.has(value);
}

/**
 * The Claude Code config scope ids ({local, project, user}), derived from the
 * HOSTS table so they are defined in exactly one place (KTD4). The write path
 * validates a scope against this set before interpolating it into a runnable
 * `claude mcp add` command, so adding a scope here can never leave a second
 * hardcoded copy stale. NOTE: only `local`/`user` are CLI-delivered; `project`
 * is file-delivered, but it is a real Claude Code scope and stays in the set.
 */
export const CLAUDE_CODE_SCOPE_IDS: ReadonlySet<string> = new Set(
  HOSTS.find((h) => h.id === "claude-code")?.scopes?.map((s) => s.id) ?? [],
);

/** The default scope id for a host (the one marked default, or undefined when scopeless). */
export function defaultScope(host: HostId): string | undefined {
  const info = HOSTS.find((h) => h.id === host);
  return info?.scopes?.find((s) => s.default)?.id ?? info?.scopes?.[0]?.id;
}

/**
 * Resolves a (host, scope) pair to its descriptor, or undefined for an illegal
 * combination (R17 — U5 rejects undefined fail-closed before any key is rendered).
 * A scopeless host ignores `scope`; a scoped host with no scope uses its default.
 */
export function getTarget(host: HostId, scope?: string): ConfigTarget | undefined {
  const info = HOSTS.find((h) => h.id === host);
  if (!info) return undefined;

  if (!info.scopes) {
    // Scopeless host: an explicit scope is an illegal combination.
    if (scope !== undefined) return undefined;
    return TARGETS[host];
  }

  const chosen = scope ?? defaultScope(host);
  if (chosen === undefined) return undefined;
  if (!info.scopes.some((s) => s.id === chosen)) return undefined; // unknown scope ⇒ fail closed
  return TARGETS[`${host}:${chosen}`];
}

/** Resolves a target's on-disk config path, or null when unsupported/un-pathed. */
export function resolveTargetPath(
  target: ConfigTarget,
  ctx: PlatformContext = defaultPlatformContext(),
): string | null {
  return target.resolvePath ? target.resolvePath(ctx) : null;
}

/** The default platform context, read from the running environment. */
export function defaultPlatformContext(): PlatformContext {
  return {
    platform: process.platform,
    homedir: homedir(),
    cwd: process.cwd(),
    env: process.env,
  };
}

/** The rendered artifact for a target. */
export interface RenderedConfig {
  target: ConfigTarget;
  /** JSON block to write/paste (file delivery); undefined for cli delivery. */
  block?: Record<string, unknown>;
  /** True iff `block` embeds the literal key (drives the R18 warning + R16 env scrub). */
  carriesLiteralKey: boolean;
  /** A host-specific follow-up the user must perform (set the env var / VS Code will prompt). */
  followUp?: string;
}

const SET_VAR_FOLLOWUP =
  `Set ${ENV_VAR_NAME} in your environment before starting the server ` +
  `(e.g. \`export ${ENV_VAR_NAME}=<your key>\`), or add it to the host's env file.`;
const VSCODE_FOLLOWUP =
  "VS Code will prompt for your Pipedrive API key the first time the server starts.";

/** Builds the standard server entry, given the env value for the key. */
function serverEntry(envValue: string): Record<string, unknown> {
  return {
    command: SERVER_COMMAND,
    args: [...SERVER_ARGS],
    env: { [ENV_VAR_NAME]: envValue },
  };
}

/**
 * Renders the config artifact for a target and key (R6/R7/R8). For committed
 * targets the key is never in the output (env indirection or VS Code input);
 * only user-private targets carry a literal key.
 */
export function renderConfig(target: ConfigTarget, key: string): RenderedConfig {
  if (target.delivery === "cli" || target.secret.kind === "cli") {
    // CLI-delivered (Claude Code local/user): no block; U4 builds the no-argv command.
    return { target, carriesLiteralKey: false };
  }

  const topLevelKey = target.topLevelKey ?? "mcpServers";

  switch (target.secret.kind) {
    case "literal": {
      const block = { [topLevelKey]: { [SERVER_NAME]: serverEntry(key) } };
      return { target, block, carriesLiteralKey: true };
    }
    case "env-ref": {
      const block = { [topLevelKey]: { [SERVER_NAME]: serverEntry(target.secret.ref) } };
      return { target, block, carriesLiteralKey: false, followUp: SET_VAR_FOLLOWUP };
    }
    case "vscode-input": {
      const inputId = target.secret.inputId;
      const block = {
        [topLevelKey]: { [SERVER_NAME]: serverEntry(`\${input:${inputId}}`) },
        inputs: [
          {
            type: "promptString",
            id: inputId,
            description: "Pipedrive API key",
            password: true,
          },
        ],
      };
      return { target, block, carriesLiteralKey: false, followUp: VSCODE_FOLLOWUP };
    }
  }
}

/**
 * Renders an indirected block for TERMINAL DISPLAY (R18): a literal-key target
 * shows the `${PIPEDRIVE_API_KEY}` reference instead of the key, so a literal
 * never enters terminal scrollback. Non-literal targets already indirect, so
 * {@link renderConfig} is reused (the key argument is unused for those).
 */
export function renderForDisplay(target: ConfigTarget): RenderedConfig {
  if (target.delivery === "cli" || target.secret.kind === "cli") {
    return { target, carriesLiteralKey: false };
  }
  if (target.secret.kind === "literal") {
    const topLevelKey = target.topLevelKey ?? "mcpServers";
    return {
      target,
      block: { [topLevelKey]: { [SERVER_NAME]: serverEntry(`\${${ENV_VAR_NAME}}`) } },
      carriesLiteralKey: false,
      followUp: SET_VAR_FOLLOWUP,
    };
  }
  return renderConfig(target, "");
}
