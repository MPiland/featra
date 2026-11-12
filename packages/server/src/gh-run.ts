/**
 * Runs the user's GitHub CLI (ADR 0031, STORY-11). Featra keeps no token: every GitHub call goes through `gh`, signed
 * in by the user. Arguments are fixed text or values checked before they get here (a PR URL, a branch name); text from
 * a card goes on standard input, never on the command line.
 */
import { exec, execFile } from "node:child_process";
import { isRecord } from "@featra/work-format/guards";
import { gitEnv, type Run } from "./git-run.ts";

export interface GhOptions {
  /** The GitHub CLI to run; the one on the PATH by default. */
  gh?: string;
  /** How long `gh` has to answer. */
  timeoutMs?: number;
  /** Text written to standard input. */
  input?: string;
}

/** Characters cmd.exe reads even inside double quotes; an argument with one is not run on Windows. */
const UNSAFE_ON_WINDOWS = /["%^!\r\n]/;
/** An argument made only of these goes to cmd.exe as it is; any other is quoted. */
const PLAIN_ON_WINDOWS = /^[\w./:{}@+-]+$/;
const MAX_OUTPUT = 16 * 1024 * 1024;

/**
 * The command line that runs `gh <args>` through cmd.exe, which a `.cmd` shim needs: the program quoted when its path
 * has a separator or a space, and each argument quoted unless it is plain. Null when a part has a character cmd.exe
 * reads even inside quotes, so it is never run.
 */
export function windowsCommand(gh: string, args: readonly string[]): string | null {
  if ([gh, ...args].some((a) => UNSAFE_ON_WINDOWS.test(a))) return null;
  const program = /[\\/ ]/.test(gh) ? `"${gh}"` : gh;
  return [program, ...args.map((a) => (PLAIN_ON_WINDOWS.test(a) ? a : `"${a}"`))].join(" ");
}

/** Runs `gh <args>` in `dir`. Null when it couldn't run at all (not installed, refused, timed out). */
export function runGh(dir: string, args: string[], { gh = "gh", timeoutMs = 15_000, input }: GhOptions = {}) {
  return new Promise<Run | null>((resolve) => {
    const options = { cwd: dir, env: gitEnv(), timeout: timeoutMs, windowsHide: true, maxBuffer: MAX_OUTPUT };
    const done = (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
      const code = isRecord(err) ? err.code : 0;
      if (err && (typeof code !== "number" || (isRecord(err) && err.killed === true))) return resolve(null);
      resolve({ code: typeof code === "number" ? code : 0, stdout: String(stdout), stderr: String(stderr) });
    };
    // A .cmd shim on Windows needs the shell (`windowsCommand`).
    let child;
    if (process.platform === "win32") {
      const line = windowsCommand(gh, args);
      if (line === null) return resolve(null);
      child = exec(line, options, done);
    } else child = execFile(gh, args, options, done);
    child.on("error", () => resolve(null));
    if (input !== undefined) child.stdin?.end(input);
    else child.stdin?.end();
  });
}

/** `gh <args>` printed JSON: the parsed value, or null when it failed or printed something else. */
export async function ghJson(dir: string, args: string[], options: GhOptions = {}): Promise<unknown> {
  const r = await runGh(dir, args, options);
  if (!r || r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout) as unknown;
  } catch {
    return null;
  }
}
