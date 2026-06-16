/**
 * `init` guided installer — orchestrator entry point and CLI argument parsing.
 *
 * U1 owns the command skeleton: flag parsing (`--print-only` / `--host` /
 * `--scope`, for scriptability per R12) and the `init --help` usage text. The
 * full interactive flow (open the token page, validate a pasted key, render the
 * host config, write or print it) is implemented in U5, which replaces the stub
 * body of {@link runInit}. Help text lives here and is owned by this unit; U6
 * only documents the command in the README.
 */

/**
 * Parsed `init` flags. All are optional so the command runs fully interactively
 * by default; supplying them skips the matching prompt for scriptability (R12).
 */
export interface InitOptions {
  /** `--help` / `-h`: print usage and exit without running the flow. */
  help: boolean;
  /** `--print-only`: never offer to write a file; print the config block only. */
  printOnly: boolean;
  /** `--host <id>`: target client; validated against the host table in U3/U5. */
  host?: string;
  /** `--scope <id>`: Claude Code config scope; validated in U3/U5. */
  scope?: string;
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
 * `--flag=value` forms for `--host`/`--scope`. Unknown flags are ignored for
 * forward-compatibility (a typo'd flag simply leaves the matching prompt
 * interactive rather than failing the run).
 */
export function parseInitArgs(argv: string[]): InitOptions {
  const options: InitOptions = { help: false, printOnly: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--print-only") {
      options.printOnly = true;
    } else if (arg === "--host") {
      options.host = argv[++i];
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
    } else if (arg === "--scope") {
      options.scope = argv[++i];
    } else if (arg.startsWith("--scope=")) {
      options.scope = arg.slice("--scope=".length);
    }
  }

  return options;
}

/**
 * Runs the guided installer. Resolves to the process exit code.
 *
 * U1 stub: handles `--help` and flag parsing; the interactive flow is wired in
 * U5. Until then, a non-help invocation reports that the installer is not yet
 * available and exits non-zero.
 */
export async function runInit(argv: string[]): Promise<number> {
  const options = parseInitArgs(argv);

  if (options.help) {
    console.log(getInitUsage());
    return 0;
  }

  console.error("init: the guided installer is not yet available in this build.");
  return 1;
}
