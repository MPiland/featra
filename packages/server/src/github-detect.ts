/**
 * What a project folder says about GitHub (STORY-56, for STORY-11 to reuse): a GitHub remote, workflow files, and
 * whether the repo is public. Visibility is asked of `gh` (a fixed command, no input from a card or the page) and only
 * when it can be: with no `gh`, a signed-out `gh` or any failure it is unknown, and unknown counts as not public.
 */
import { exec, execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { GithubDetection } from "@featra/work-format";
import { isRecord } from "@featra/work-format/guards";
import { gitEnv, runGit } from "./git-run.ts";

export interface GithubDeps {
  /** The git to run; the one on the PATH by default. */
  gitCommand?: string;
  /** The GitHub CLI to run; the one on the PATH by default. */
  ghCommand?: string;
  /** How long `gh` has to answer. */
  ghTimeoutMs?: number;
}

const hasGithubRemote = async (dir: string, git: string) => {
  try {
    const r = await runGit(git, dir, ["remote", "-v"]);
    return r.code === 0 && /github\.com[:/]/i.test(r.stdout);
  } catch {
    return false;
  }
};

const hasWorkflows = async (dir: string) => {
  try {
    return (await readdir(join(dir, ".github", "workflows"))).some((name) => /\.ya?ml$/i.test(name));
  } catch {
    return false;
  }
};

/** Whether `gh` says the repo in `dir` is public; null when it couldn't say. */
export function repoIsPublic(dir: string, gh = "gh", timeout = 15_000): Promise<boolean | null> {
  return new Promise((resolve) => {
    const options = { cwd: dir, env: gitEnv(), timeout, windowsHide: true };
    const done = (err: Error | null, stdout: string | Buffer) => {
      if (err) return resolve(null);
      try {
        const answer: unknown = JSON.parse(String(stdout));
        const visibility = isRecord(answer) ? answer.visibility : undefined;
        resolve(typeof visibility === "string" ? visibility.toUpperCase() === "PUBLIC" : null);
      } catch {
        resolve(null);
      }
    };
    // A .cmd shim on Windows needs the shell. The command is fixed text, so nothing from a card or the page is in it;
    // a path to the program is quoted, so a path with spaces still runs and one with a quote is not run.
    if (process.platform === "win32") {
      if (/["%^!\r\n]/.test(gh)) return resolve(null);
      exec(`${/[\\/ ]/.test(gh) ? `"${gh}"` : gh} repo view --json visibility`, options, done);
    } else execFile(gh, ["repo", "view", "--json", "visibility"], options, done);
  });
}

export async function detectGithub(
  dir: string,
  { gitCommand = "git", ghCommand, ghTimeoutMs }: GithubDeps = {},
): Promise<GithubDetection> {
  const [remote, workflows] = await Promise.all([hasGithubRemote(dir, gitCommand), hasWorkflows(dir)]);
  return { remote, workflows, public: remote ? await repoIsPublic(dir, ghCommand, ghTimeoutMs) : null };
}
