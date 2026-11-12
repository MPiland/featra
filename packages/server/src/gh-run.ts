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
const MAX_OUTPUT = 16 * 1024 * 1024;

/** Runs `gh <args>` in `dir`. Null when it couldn't run at all (not installed, refused, timed out). */
export function runGh(dir: string, args: string[], { gh = "gh", timeoutMs = 15_000, input }: GhOptions = {}) {
  return new Promise<Run | null>((resolve) => {
    const options = { cwd: dir, env: gitEnv(), timeout: timeoutMs, windowsHide: true, maxBuffer: MAX_OUTPUT };
    const done = (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
      const code = isRecord(err) ? err.code : 0;
      if (err && (typeof code !== "number" || (isRecord(err) && err.killed === true))) return resolve(null);
      resolve({ code: typeof code === "number" ? code : 0, stdout: String(stdout), stderr: String(stderr) });
    };
    // A .cmd shim on Windows needs the shell: a part with spaces or symbols is quoted, and one with a character cmd.exe
    // reads even inside quotes is not run.
    let child;
    if (process.platform === "win32") {
      if ([gh, ...args].some((a) => UNSAFE_ON_WINDOWS.test(a))) return resolve(null);
      const program = /[\\/ ]/.test(gh) ? `"${gh}"` : gh;
      const quoted = args.map((a) => (/^[\w./:=,{}@+-]+$/.test(a) ? a : `"${a}"`));
      child = exec([program, ...quoted].join(" "), options, done);
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
