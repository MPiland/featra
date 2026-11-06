import { execFile } from "node:child_process";
import { isRecord } from "@featra/work-format";

/** The git commands the server runs. The real one runs the `git` on the PATH; tests use it too, in temp folders. */
export interface Git {
  /** Whether `dir` is inside a git work tree (a subfolder of a repository counts). */
  isRepo: (dir: string) => Promise<boolean>;
  /** `git init` in `dir`. */
  init: (dir: string) => Promise<void>;
}

interface Run {
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

const failed = (what: string, r: Run) => new Error(`${what} failed: ${r.stderr.trim() || `exit code ${r.code}`}`);

export function createGit(command = "git"): Git {
  const run = (dir: string, args: string[]) =>
    new Promise<Run>((resolve, reject) => {
      execFile(command, args, { cwd: dir, env: gitEnv(), windowsHide: true }, (err, stdout, stderr) => {
        if (err && isRecord(err) && err.code === "ENOENT") return reject(new Error(GIT_MISSING));
        if (err && typeof err.code !== "number") return reject(err);
        resolve({ code: typeof err?.code === "number" ? err.code : 0, stdout, stderr });
      });
    });

  return {
    async isRepo(dir) {
      const r = await run(dir, ["rev-parse", "--is-inside-work-tree"]);
      if (r.code === 0) return r.stdout.trim() === "true";
      // Anything but "not a repository" (a folder git distrusts, say) is an error to show, not a reason to init.
      if (/not a git repository/i.test(r.stderr)) return false;
      throw failed("git rev-parse", r);
    },
    async init(dir) {
      const r = await run(dir, ["init"]);
      if (r.code !== 0) throw failed("git init", r);
    },
  };
}
