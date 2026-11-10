/**
 * Finds the user's own `claude` (ADR 0007): the one their shell would run, so its login is the one used. Featra
 * never installs, logs in or reads credentials; it only looks the command up on the PATH.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";

/** Runs a lookup command and resolves with its output, or null when it fails (not found). */
export type Lookup = (command: string, args: string[]) => Promise<string | null>;

const LOOKUP_TIMEOUT_MS = 5000;

export const runLookup: Lookup = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { encoding: "utf8", timeout: LOOKUP_TIMEOUT_MS, windowsHide: true }, (err, stdout) =>
      resolve(err ? null : stdout),
    );
  });

/**
 * Where an npm-installed `claude.cmd` keeps the script it runs: the SDK can't spawn a `.cmd` without a shell. The shim
 * is a Windows path, so it is read with `path.win32` whatever the host (tests run Windows lookups on Linux too).
 */
const npmScript = (shim: string) =>
  win32.join(win32.dirname(shim), "node_modules", "@anthropic-ai", "claude-code", "cli.js");

/**
 * The path of the user's `claude`, or null when there is none. On Windows the native `.exe` is preferred; an npm
 * install's `.cmd` shim is followed to its script, which the SDK runs with node.
 */
export async function locateClaude(
  lookup: Lookup = runLookup,
  platform: string = process.platform,
  exists: (path: string) => boolean = existsSync,
): Promise<string | null> {
  const windows = platform === "win32";
  const out = await lookup(windows ? "where" : "which", ["claude"]);
  const paths = (out ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!windows) return paths[0] ?? null;
  const exe = paths.find((p) => p.toLowerCase().endsWith(".exe"));
  if (exe) return exe;
  const script = paths
    .filter((p) => p.toLowerCase().endsWith(".cmd"))
    .map(npmScript)
    .find((p) => exists(p));
  return script ?? paths[0] ?? null;
}
