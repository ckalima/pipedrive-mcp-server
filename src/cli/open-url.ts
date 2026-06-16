/**
 * Best-effort cross-platform URL opener for the guided installer (U5).
 *
 * Fire-and-forget by design (KTD6, R3): the child is spawned detached, unref'd,
 * and never awaited, so a hung opener on a locked-down / WSL / SSH box cannot
 * block the key prompt — the caller always prints the URL first. The child's
 * environment is scrubbed of the API key so the token never enters a spawned
 * process (R16). No new dependency: just `node:child_process` + the platform opener.
 */

import { spawn, type SpawnOptions } from "node:child_process";

import { ENV_VAR_NAME } from "../config.js";

/** The minimal spawn signature this module depends on (injected in tests). */
type SpawnLike = (command: string, args: string[], options: SpawnOptions) => {
  on: (event: "error", listener: (err: Error) => void) => unknown;
  unref: () => void;
};

/** The platform opener command + leading args (the URL is appended). */
export function openerFor(platform: NodeJS.Platform): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [] };
  // `start` is a cmd builtin; the empty "" is the window-title argument it expects.
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", ""] };
  return { command: "xdg-open", args: [] }; // Linux and other POSIX
}

/**
 * Opens `url` in the platform browser, best-effort. Never throws and never blocks
 * (returns immediately). `spawnFn` is injectable for tests.
 */
export function openUrl(url: string, spawnFn: SpawnLike = spawn as unknown as SpawnLike): void {
  const { command, args } = openerFor(process.platform);

  // Scrub the API key from the child environment (R16).
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env[ENV_VAR_NAME];

  try {
    const child = spawnFn(command, [...args, url], {
      stdio: "ignore",
      env,
      detached: true,
    });
    // A missing opener emits 'error' asynchronously; swallow it (the URL is printed).
    child.on("error", () => {});
    child.unref();
  } catch {
    // Synchronous spawn failure — ignore; the URL was already printed.
  }
}
