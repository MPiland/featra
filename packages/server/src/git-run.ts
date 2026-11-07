import { execFile, spawn } from "node:child_process";
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

function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of REPO_OVERRIDES) delete env[key];
  return env;
}

export const failed = (what: string, r: Run) =>
  new Error(`${what} failed: ${r.stderr.trim() || `exit code ${r.code}`}`);

const MAX_OUTPUT = 64 * 1024 * 1024;

/** Runs `git <args>` in `dir`. A non-zero exit resolves (callers decide); a git that can't start rejects. */
export function runGit(command: string, dir: string, args: string[]): Promise<Run> {
  return new Promise<Run>((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: dir, env: gitEnv(), windowsHide: true, maxBuffer: MAX_OUTPUT },
      (err, stdout, stderr) => {
        if (err && isRecord(err) && err.code === "ENOENT") return reject(new Error(GIT_MISSING));
        if (err && typeof err.code !== "number") return reject(err);
        resolve({ code: typeof err?.code === "number" ? err.code : 0, stdout, stderr });
      },
    );
  });
}

/** Runs `git <args>` in `dir` with `input` on stdin, and resolves with stdout as bytes (for `cat-file --batch`). */
export function runGitBytes(command: string, dir: string, args: string[], input: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { cwd: dir, env: gitEnv(), windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    child.on("error", (e) => reject(isRecord(e) && e.code === "ENOENT" ? new Error(GIT_MISSING) : e));
    child.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(out));
      const r = { code: code ?? -1, stdout: "", stderr: Buffer.concat(err).toString("utf8") };
      reject(failed(`git ${args[0] ?? ""}`, r));
    });
    child.stdin.end(input);
  });
}
