/**
 * `init` guided installer (U1 skeleton + U5 flow).
 *
 * U1 owns flag parsing (`--print-only` / `--host` / `--scope`, R12) and the
 * `init --help` usage text. U5 implements {@link runInit}: validate flags
 * fail-closed, open the token page, prompt + live-validate a key, choose host
 * and scope, render the config, and write or print it with the correct secret
 * handling and a host-specific next step. Every IO touchpoint (readline, opener,
 * validator, writer, git/path probes) is an injectable seam so the flow is
 * testable without real IO.
 */

import * as readline from "node:readline/promises";
import { Writable } from "node:stream";

import { ENV_VAR_NAME } from "../config.js";
import { verifyApiKey, type VerifyKeyResult, type VerifiedUser } from "./verify-key.js";
import {
  HOSTS,
  getTarget,
  defaultScope,
  isHostId,
  renderConfig,
  renderForDisplay,
  resolveTargetPath,
  type ConfigTarget,
  type HostId,
  type HostInfo,
  type RenderedConfig,
} from "./config-targets.js";
import {
  writeConfig,
  isPathInsideGitTree,
  type WriteOutcome,
  type WriteConfigDeps,
} from "./write-config.js";
import { openUrl } from "./open-url.js";

/**
 * Parsed `init` flags. All are optional so the command runs fully interactively
 * by default; supplying them skips the matching prompt for scriptability (R12).
 */
export interface InitOptions {
  /** `--help` / `-h`: print usage and exit without running the flow. */
  help: boolean;
  /** `--print-only`: never offer to write a file; print the config block only. */
  printOnly: boolean;
  /** `--host <id>`: target client; validated against the host table in U5. */
  host?: string;
  /** `--scope <id>`: Claude Code config scope; validated in U5. */
  scope?: string;
  /** Non-fatal parse notes (e.g. an unrecognized flag); printed, then the run continues.
   *  Present only when there is something to report. */
  warnings?: string[];
  /** Fatal parse problems (e.g. `--host` with no value); the run aborts fail-closed.
   *  Present only when there is something to report. */
  errors?: string[];
}

const USAGE = `pipedrive-mcp-server init — guided MCP setup

Usage:
  npx -y @ckalima/pipedrive-mcp-server init [options]

Walks you through pasting a Pipedrive API key (validated live against your
account) and generates a working MCP server config for your client. The config
block is always printed; you can optionally write it into the client's config
file after a timestamped backup.

Options:
  --host <id>     Target client (claude-desktop, claude-code, cursor, windsurf,
                  vscode). Skips the interactive host prompt.
  --scope <id>    Claude Code config scope (local, project, user). Skips the
                  scope prompt.
  --print-only    Print the config block only; never write to a file.
  -h, --help      Show this help and exit.

Run with no arguments to start the STDIO MCP server (the default).`;

/** The `init --help` usage text (owned by U1). */
export function getInitUsage(): string {
  return USAGE;
}

/**
 * Parses `init` argv into {@link InitOptions}. Accepts both `--flag value` and
 * `--flag=value` forms for `--host`/`--scope`.
 *
 * A space-form `--host`/`--scope` must be followed by a real value: a missing or
 * flag-shaped next token (e.g. `--host --scope`) is a fatal parse error rather than
 * silently swallowing the following flag as the value (which then fails downstream
 * with a confusing "unknown host '--scope'"). Unrecognized flags are collected as
 * non-fatal warnings — the run continues with the matching prompt interactive — but
 * are surfaced rather than dropped in silence.
 */
export function parseInitArgs(argv: string[]): InitOptions {
  const options: InitOptions = { help: false, printOnly: false };
  const warnings: string[] = [];
  const errors: string[] = [];

  // Reads the value token for a space-form flag, rejecting a missing or
  // flag-shaped one (a leading "-") so it can't be mistaken for the value.
  const valueFor = (flag: string, i: number): string | undefined => {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("-")) {
      errors.push(`${flag} requires a value.`);
      return undefined;
    }
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--print-only") {
      options.printOnly = true;
    } else if (arg === "--host") {
      const value = valueFor("--host", i);
      if (value !== undefined) {
        options.host = value;
        i++;
      }
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
    } else if (arg === "--scope") {
      const value = valueFor("--scope", i);
      if (value !== undefined) {
        options.scope = value;
        i++;
      }
    } else if (arg.startsWith("--scope=")) {
      options.scope = arg.slice("--scope=".length);
    } else {
      warnings.push(`Ignoring unrecognized option '${arg}'.`);
    }
  }

  if (warnings.length > 0) options.warnings = warnings;
  if (errors.length > 0) options.errors = errors;

  return options;
}

// ─── Flow seams ──────────────────────────────────────────────────────────────

/** Injectable IO/effect seams for {@link runInit} (mocked wholesale in tests). */
export interface InitDeps {
  prompt: (question: string) => Promise<string>;
  /** Like {@link prompt} but the typed answer is NOT echoed — used for the API key
   *  so a pasted secret never lands in terminal scrollback (M2). */
  promptSecret: (question: string) => Promise<string>;
  confirm: (question: string, defaultYes: boolean) => Promise<boolean>;
  print: (message: string) => void;
  openUrl: (url: string) => void;
  verifyApiKey: (key: string) => Promise<VerifyKeyResult>;
  writeConfig: (target: ConfigTarget, rendered: RenderedConfig, deps?: WriteConfigDeps) => WriteOutcome;
  isInsideGitTree: (path: string) => boolean;
  resolveTargetPath: (target: ConfigTarget) => string | null;
}

/** The canonical Pipedrive API-token page; opening the base lets the browser
 *  redirect to the user's company subdomain without capturing an SSO artifact. */
const TOKEN_PAGE_URL = "https://app.pipedrive.com/settings/api";

const CREDENTIAL_WARNING =
  "⚠ This configuration contains a live Pipedrive API key. Keep it private — never commit or share it.";

/**
 * Raised by the readline prompt seams when stdin closes (EOF / Ctrl-D, or a
 * non-interactive run with no input) while a prompt is pending.
 *
 * `readline/promises` `question()` neither resolves nor rejects when the input
 * stream ends — it simply hangs (verified on the supported Node versions). The
 * prompt seams drive an AbortController off the stream's `end`/`close` and
 * translate the resulting AbortError into this typed error, so the flow can
 * cancel cleanly with a clear message instead of wedging the process forever.
 */
export class StdinClosedError extends Error {
  constructor() {
    super("stdin closed before a prompt could be answered");
    this.name = "StdinClosedError";
  }
}

/**
 * A pass-through output stream that can be muted while a secret is read, so
 * readline's echo never reaches the terminal (M2).
 *
 * Suppression happens at the OUTPUT-STREAM boundary — every byte readline emits
 * goes through `output.write` — rather than by wrapping readline's private
 * `_writeToOutput`. That internal became a private Symbol in recent Node
 * (verified absent by name on v23: the by-name wrap silently no-ops and the
 * pasted key would echo), and `engines` allows `>=20`, so the by-name technique
 * is not reliable across supported versions. Intercepting the stream is version
 * independent: it depends only on the public `output.write` contract. While
 * muted every chunk is swallowed except a line terminator, so the prompt still
 * advances on Enter. (This is the well-known `mute-stream` pattern, inlined to
 * avoid a dependency per KTD6.) Exported for direct testing of the mute logic.
 */
export class MaskableOutput extends Writable {
  muted = false;

  constructor(
    private readonly sink: NodeJS.WritableStream & {
      columns?: number;
      rows?: number;
      isTTY?: boolean;
    },
  ) {
    super();
  }

  // readline reads these off its output stream for terminal sizing / capability
  // detection; proxy them so a real-TTY sink still drives terminal (echo) mode.
  get columns(): number | undefined {
    return this.sink.columns;
  }
  get rows(): number | undefined {
    return this.sink.rows;
  }
  get isTTY(): boolean | undefined {
    return this.sink.isTTY;
  }

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (!this.muted) {
      this.sink.write(text);
    } else if (text.includes("\n") || text.includes("\r")) {
      // Let only the line terminator through so Enter still advances the prompt;
      // every other byte (the echoed key, redraw codes) is swallowed.
      this.sink.write("\n");
    }
    callback();
  }
}

/** Optional seams for {@link createReadlineDeps}; production passes none. */
export interface ReadlineDepsOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream & { columns?: number; rows?: number; isTTY?: boolean };
  /** Force readline terminal (echo) mode; defaults to TTY auto-detection. */
  terminal?: boolean;
}

/** Builds readline-backed prompt/confirm/promptSecret, creating the interface
 *  lazily so that fully-mocked test runs never open stdin. Exported with optional
 *  seams so the security-critical masking can be exercised against a real
 *  readline interface, not just a wholesale promptSecret mock (M2). */
export function createReadlineDeps(opts: ReadlineDepsOptions = {}) {
  // Annotate as the base stream interface: `process.stdin` (ReadStream) and a
  // seam-supplied ReadableStream otherwise form a union whose `.once`/`.off`
  // overloads aren't mutually callable under newer @types/node (TS2349).
  const input: NodeJS.ReadableStream = opts.input ?? process.stdin;
  const sink = opts.output ?? process.stdout;
  // All readline output (prompt redraws + keystroke echo) flows through this, so
  // muting it hides a typed secret regardless of how readline echoes internally.
  const output = new MaskableOutput(sink);

  // readline/promises `question()` hangs (never resolves or rejects) when stdin
  // ends. Drive an AbortController off the stream's end/close so a pending — and
  // any subsequent — question rejects promptly, letting a piped-then-closed or
  // non-interactive run cancel cleanly instead of wedging the process.
  const closed = new AbortController();
  const abortOnClose = () => closed.abort();
  input.once("end", abortOnClose);
  input.once("close", abortOnClose);

  let rl: readline.Interface | null = null;
  const get = () => {
    if (rl) return rl;
    rl = readline.createInterface({
      input,
      output,
      ...(opts.terminal !== undefined ? { terminal: opts.terminal } : {}),
    });
    return rl;
  };

  // Ask a single question, translating the AbortController's AbortError (stdin
  // closed) into the typed StdinClosedError the flow recognizes as cancellation.
  const ask = async (q: string): Promise<string> => {
    try {
      return await get().question(q, { signal: closed.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new StdinClosedError();
      throw error;
    }
  };

  return {
    prompt: async (q: string) => (await ask(q)).trim(),
    promptSecret: async (q: string) => {
      // Write the label straight to the real sink — never through the muted
      // stream, so it can't be raced or suppressed — then mute while the answer
      // is read so the prompt text shows but the key does not.
      sink.write(q);
      output.muted = true;
      try {
        return (await ask("")).trim();
      } finally {
        output.muted = false;
      }
    },
    confirm: async (q: string, defaultYes: boolean) => {
      const ans = (await ask(`${q}${defaultYes ? "[Y/n] " : "[y/N] "}`)).trim().toLowerCase();
      if (ans === "") return defaultYes;
      return ans === "y" || ans === "yes";
    },
    close: () => {
      input.off("end", abortOnClose);
      input.off("close", abortOnClose);
      rl?.close();
      rl = null;
    },
  };
}

/**
 * Runs the guided installer. Resolves to the process exit code. `overrides`
 * replaces individual seams in tests; production wiring uses real readline,
 * opener, validator, and writer.
 */
export async function runInit(argv: string[], overrides: Partial<InitDeps> = {}): Promise<number> {
  const options = parseInitArgs(argv);

  if (options.help) {
    console.log(getInitUsage());
    return 0;
  }

  const rl = createReadlineDeps();
  const deps: InitDeps = {
    prompt: rl.prompt,
    promptSecret: rl.promptSecret,
    confirm: rl.confirm,
    print: (message) => console.log(message),
    openUrl,
    verifyApiKey,
    writeConfig,
    isInsideGitTree: isPathInsideGitTree,
    resolveTargetPath,
    ...overrides,
  };

  try {
    return await runInitFlow(options, deps);
  } catch (error) {
    // A host/scope prompt hit closed stdin (EOF / non-interactive run): cancel
    // cleanly rather than letting the rejection escape as an unhandled crash.
    if (error instanceof StdinClosedError) {
      deps.print("Setup cancelled (input closed). No changes made.");
      return 1;
    }
    throw error;
  } finally {
    rl.close();
  }
}

async function runInitFlow(options: InitOptions, deps: InitDeps): Promise<number> {
  // 0. Surface parse diagnostics first: print non-fatal warnings (unrecognized
  //    flags) and abort fail-closed on a fatal parse error (a flag missing its
  //    value), BEFORE opening the token page or prompting for a key.
  for (const warning of options.warnings ?? []) deps.print(warning);
  if (options.errors && options.errors.length > 0) {
    for (const problem of options.errors) deps.print(problem);
    return 1;
  }

  // 1. Validate flags fail-closed BEFORE requesting or rendering a key (R17): the
  //    host/scope choice drives literal-vs-indirection, so an invalid combo must
  //    never silently route a secret into the wrong rendering.
  if (options.host !== undefined && !isHostId(options.host)) {
    deps.print(`Unknown host '${options.host}'. Supported: ${HOSTS.map((h) => h.id).join(", ")}.`);
    return 1;
  }
  if (options.host !== undefined && options.scope !== undefined) {
    if (!getTarget(options.host as HostId, options.scope)) {
      deps.print(`Invalid host/scope combination: ${options.host} / ${options.scope}.`);
      return 1;
    }
  }

  // 2. Token page: always print the URL first, then best-effort open (env-scrubbed,
  //    fire-and-forget) so a hung opener never blocks the prompt (R3, R16).
  deps.print(`Open your Pipedrive API token page and copy your key:\n  ${TOKEN_PAGE_URL}`);
  try {
    deps.openUrl(TOKEN_PAGE_URL);
  } catch {
    // Best-effort; the URL was already printed.
  }

  // 3. Key loop (R5).
  const validated = await promptForValidKey(deps);
  if (!validated) {
    deps.print("Setup cancelled. No changes made.");
    return 1;
  }
  deps.print(`✓ Validated as ${formatUser(validated.user)}.`);

  // 4. Host (R12).
  const host: HostId =
    options.host !== undefined && isHostId(options.host)
      ? options.host
      : await promptHost(deps);

  // 5. Scope (R7): prompt only for scoped hosts when no flag was supplied.
  const hostInfo = HOSTS.find((h) => h.id === host)!;
  let scope = options.scope;
  if (hostInfo.scopes && scope === undefined) {
    scope = await promptScope(deps, hostInfo);
  }

  // 6. Resolve the target fail-closed.
  const target = getTarget(host, scope);
  if (!target) {
    deps.print(`Invalid host/scope combination: ${host} / ${scope ?? "(default)"}.`);
    return 1;
  }

  // 7. Deliver.
  return deliver(options, deps, target, validated.key);
}

async function deliver(
  options: InitOptions,
  deps: InitDeps,
  target: ConfigTarget,
  key: string,
): Promise<number> {
  // CLI-delivered (Claude Code local/user): emit the no-argv add command (R10/R15).
  if (target.delivery === "cli") {
    const outcome = deps.writeConfig(target, renderConfig(target, key));
    if (outcome.kind === "cli") {
      deps.print("\nRun this command to register the server (your key is NOT placed in the command):");
      deps.print(`  ${outcome.command}`);
      if (!outcome.claudeAvailable) {
        deps.print(
          "Note: the `claude` CLI was not found on your PATH. Install Claude Code first, then run the command above.",
        );
      }
      deps.print(outcome.followUp);
    }
    printSuccess(deps, target);
    return 0;
  }

  const rendered = renderConfig(target, key);
  const path = deps.resolveTargetPath(target);
  const wantWrite = !options.printOnly && path !== null;

  if (wantWrite) {
    // R17: confirm before writing a committed target inside a git working tree.
    const proceed =
      target.committed && deps.isInsideGitTree(path!)
        ? await deps.confirm(
            `${path} is inside a git repository (no key is written — env indirection is used). Write the MCP config there? `,
            false,
          )
        : await deps.confirm(
            `Write the MCP config into ${path}? A timestamped backup is taken first. `,
            true,
          );

    if (proceed) {
      const outcome = deps.writeConfig(target, rendered, { pathOverride: path! });
      if (outcome.kind === "written") {
        deps.print(`\n✓ Wrote config to ${outcome.path}`);
        if (outcome.backupPath) {
          deps.print(
            outcome.backupRelocated
              ? `  Backup saved out of your repo at ${outcome.backupPath} (safe to delete once you've confirmed the setup works).`
              : `  Backup: ${outcome.backupPath}`,
          );
        }
        // R15: warn whenever a written file carries a live key.
        if (rendered.carriesLiteralKey) deps.print(CREDENTIAL_WARNING);
        // R18: echo the INDIRECTED block for reference — never the literal key.
        const display = renderForDisplay(target);
        if (display.block) {
          deps.print(`\nFor reference (key shown indirected):\n${formatBlock(display.block)}`);
        }
        if (display.followUp) deps.print(display.followUp);
        printSuccess(deps, target);
        return 0;
      }
      // Write aborted (malformed/no path): fall through to print.
      if (outcome.kind === "print") {
        deps.print(`\nCould not write the file (${outcome.reason}). Showing the config to paste manually:`);
      }
    }
    // Declined or aborted → print path below.
  }

  return printDelivery(options, deps, target, key);
}

function printDelivery(
  options: InitOptions,
  deps: InitDeps,
  target: ConfigTarget,
  key: string,
): number {
  const where = describeTargetFile(deps, target);

  // R18: a literal key is shown in the terminal ONLY under --print-only with no
  // file target. Every other print uses the indirected form.
  if (target.secret.kind === "literal" && options.printOnly) {
    const rendered = renderConfig(target, key);
    deps.print(CREDENTIAL_WARNING);
    // Guarded rather than asserted: a CLI-delivered target has no block and is
    // routed away earlier, but this keeps printDelivery total if that ever changes (L1).
    if (rendered.block) deps.print(`\nPaste this into ${where}:\n${formatBlock(rendered.block)}`);
    if (rendered.followUp) deps.print(rendered.followUp);
  } else {
    const display = renderForDisplay(target);
    if (display.block) deps.print(`\nPaste this into ${where}:\n${formatBlock(display.block)}`);
    if (display.followUp) deps.print(display.followUp);
    if (target.secret.kind === "literal") {
      deps.print(
        `Then replace \${${ENV_VAR_NAME}} with your key, or set ${ENV_VAR_NAME} in your environment.`,
      );
    }
  }

  printSuccess(deps, target);
  return 0;
}

// ─── Prompts ───────────────────────────────────────────────────────────────────

async function promptForValidKey(
  deps: InitDeps,
): Promise<{ key: string; user: VerifiedUser } | null> {
  for (;;) {
    let raw: string;
    try {
      // Masked: the key must not be echoed into terminal scrollback (M2).
      raw = await deps.promptSecret("Paste your Pipedrive API key (or 'q' to quit): ");
    } catch {
      // Closed stdin (EOF / Ctrl-D) now rejects via the abort seam (StdinClosedError);
      // any prompt failure cancels the loop and the caller prints "Setup cancelled".
      return null;
    }
    const lowered = raw.toLowerCase();
    if (lowered === "q" || lowered === "quit") return null;

    // Signal progress before the network call: validation is bounded (a single
    // ~10s attempt, not the full retry loop), but on a slow link even that should
    // not look like a frozen prompt.
    deps.print("Validating…");
    const result = await deps.verifyApiKey(raw);
    if (result.valid) return { key: raw, user: result.user ?? {} };
    deps.print(`  ✗ ${result.error ?? "Validation failed."}`);
  }
}

async function promptHost(deps: InitDeps): Promise<HostId> {
  for (;;) {
    deps.print("\nWhich MCP client are you setting up?");
    HOSTS.forEach((h, i) => deps.print(`  ${i + 1}. ${h.displayName}`));
    const idx = Number.parseInt(await deps.prompt("Enter a number: "), 10) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < HOSTS.length) return HOSTS[idx].id;
    deps.print("  Please enter a valid number.");
  }
}

async function promptScope(deps: InitDeps, hostInfo: HostInfo): Promise<string> {
  const scopes = hostInfo.scopes!;
  for (;;) {
    deps.print(`\nWhich ${hostInfo.displayName} scope?`);
    scopes.forEach((s, i) =>
      deps.print(`  ${i + 1}. ${s.displayName}${s.default ? " (default)" : ""}`),
    );
    const raw = await deps.prompt("Enter a number (or press Enter for the default): ");
    if (raw.trim() === "") return defaultScope(hostInfo.id)!;
    const idx = Number.parseInt(raw, 10) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < scopes.length) return scopes[idx].id;
    deps.print("  Please enter a valid number.");
  }
}

// ─── Presentation helpers ────────────────────────────────────────────────────

/** Strips control + escape characters so an API-sourced display string cannot
 *  forge terminal output (CR/LF/ANSI injection) when echoed back (L2). */
function sanitizeForTerminal(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

function formatUser(user: VerifiedUser): string {
  const parts = [user.name, user.email]
    .filter((v): v is string => Boolean(v))
    .map(sanitizeForTerminal)
    .filter((v) => v.length > 0);
  return parts.length > 0 ? parts.join(" - ") : "your Pipedrive account";
}

function formatBlock(block: Record<string, unknown>): string {
  return JSON.stringify(block, null, 2);
}

function describeTargetFile(deps: InitDeps, target: ConfigTarget): string {
  const path = deps.resolveTargetPath(target);
  if (path) return path;
  return `your ${target.displayName} MCP config (top-level "${target.topLevelKey ?? "mcpServers"}")`;
}

/** The host-specific next step the user must take (R11). */
function nextStep(target: ConfigTarget): string {
  switch (target.host) {
    case "claude-desktop":
      return "Restart Claude Desktop so it loads the Pipedrive server.";
    case "claude-code":
      if (target.scope === "project") {
        return "Approve the project server when Claude Code prompts, and commit .mcp.json to share it.";
      }
      return "Run the command above (if you haven't yet), then restart Claude Code.";
    case "cursor":
      return "Restart Cursor (or toggle the server under Settings → MCP) to load it.";
    case "windsurf":
      return "Reload Windsurf / Cascade to load the server.";
    case "vscode":
      return "Reload VS Code; it will prompt for your API key the first time the server starts.";
  }
}

function printSuccess(deps: InitDeps, target: ConfigTarget): void {
  deps.print("\nSetup complete. Next step:");
  deps.print(`  ${nextStep(target)}`);
}
