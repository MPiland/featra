import { execFile } from "node:child_process";
import { isRecord } from "@featra/work-format";

/** What one git command printed and how it ended. */
export interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

export const GIT_MISSING = "Git isn't installed or isn't on the PATH. Install Git, then try again.";

/**
 * Variables git sets for hooks and that point it at another repository. Inherited (the pre-commit hook runs the
 * tests), they would make every folder look like that repository, so the server never passes them on.
 */
const REPO_OVERRIDES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
];

export function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of REPO_OVERRIDES) delete env[key];
  return env;
}

export const failed = (what: string, r: Run) =>
  new Error(`${what} failed: ${r.stderr.trim() || `exit code ${r.code}`}`);

/** Why git couldn't start: not installed, or another error. */
export const spawnError = (e: Error) => (isRecord(e) && e.code === "ENOENT" ? new Error(GIT_MISSING) : e);

const MAX_OUTPUT = 64 * 1024 * 1024;

export interface GitOptions {
  /** Variables added to the environment (a temporary `GIT_INDEX_FILE`, for plumbing that mustn't touch the real index). */
  env?: Record<string, string>;
  /** Text written to git's standard input. */
  input?: string;
}

/** A lock file named in quotes, as git's "Unable to create '….lock'" does in every language it speaks. */
const LOCK_NAMED = /\.lock['’"”»]/;

/**
 * Whether git stopped because another git process holds a lock it needs, such as the index's (BUG-31): its fatal exit
 * (128) with a lock file named on the first line. Matched without words, since git's messages are translated; only the
 * first line, so a hook whose own git was locked out (a commit's pre-commit) doesn't count, and isn't run again.
 */
export function lockedOut(r: Run): boolean {
  return r.code === 128 && LOCK_NAMED.test(r.stderr.split("\n", 1)[0] ?? "");
}

/** The waits before each new try while another git holds a lock: about 3 s in all (BUG-31). */
export const LOCK_WAITS: readonly number[] = [50, 100, 200, 400, 800, 1600];

/**
 * Runs `git <args>` like `runGit`, and while it fails because another git process holds a lock it needs, tries again
 * after each of `waits`. Any git that refreshes the index, `git status` in an editor or a terminal included, holds
 * `index.lock` for a moment, and git refuses at once rather than wait for it (BUG-31). A git that fails that way has
 * changed nothing, so trying again is safe. `run` is how git is run (tests give a fake git).
 */
export async function runGitPatiently(
  command: string,
  dir: string,
  args: string[],
  waits: readonly number[] = LOCK_WAITS,
  run: (command: string, dir: string, args: string[]) => Promise<Run> = runGit,
): Promise<Run> {
  let r = await run(command, dir, args);
  for (const ms of waits) {
    if (!lockedOut(r)) return r;
    await new Promise((resolve) => setTimeout(resolve, ms));
    r = await run(command, dir, args);
  }
  return r;
}

/** Runs `git <args>` in `dir`. A non-zero exit resolves (callers decide); a git that can't start rejects. */
export function runGit(command: string, dir: string, args: string[], options: GitOptions = {}): Promise<Run> {
  return new Promise<Run>((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { cwd: dir, env: { ...gitEnv(), ...options.env }, windowsHide: true, maxBuffer: MAX_OUTPUT },
      (err, stdout, stderr) => {
        if (err && isRecord(err) && err.code === "ENOENT") return reject(new Error(GIT_MISSING));
        if (err && typeof err.code !== "number") return reject(err);
        resolve({ code: typeof err?.code === "number" ? err.code : 0, stdout, stderr });
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}
