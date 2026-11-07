import { failed, runGit } from "./git-run.ts";

export { GIT_MISSING } from "./git-run.ts";

/** The git commands the server runs. The real one runs the `git` on the PATH; tests use it too, in temp folders. */
export interface Git {
  /** Whether `dir` is inside a git work tree (a subfolder of a repository counts). */
  isRepo: (dir: string) => Promise<boolean>;
  /** `git init` in `dir`. */
  init: (dir: string) => Promise<void>;
}

export function createGit(command = "git"): Git {
  const run = (dir: string, args: string[]) => runGit(command, dir, args);

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
