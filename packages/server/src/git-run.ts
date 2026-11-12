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
