/**
 * What a project folder says about GitHub (STORY-56, for STORY-11 to reuse): a GitHub remote, workflow files, and
 * whether the repo is public. Visibility is asked of `gh` (a fixed command, no input from a card or the page) and only
 * when it can be: with no `gh`, a signed-out `gh` or any failure it is unknown, and unknown counts as not public.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { githubRepoOf, githubUse, type GithubDetection, type GithubUse } from "@featra/work-format";
import { isRecord } from "@featra/work-format/guards";
import { ghJson, runGh } from "./gh-run.ts";
import { runGit } from "./git-run.ts";

export interface GithubDeps {
  /** The git to run; the one on the PATH by default. */
  gitCommand?: string;
  /** The GitHub CLI to run; the one on the PATH by default. */
  ghCommand?: string;
  /** How long `gh` has to answer. */
  ghTimeoutMs?: number;
}

/** A remote of the project on GitHub: its name, and the repository it is as `owner/name`. */
export interface GithubRemote {
  name: string;
  repo: string;
}

/** The project's GitHub remote: `origin` when it is on GitHub, else the first that is; null when none is. */
export async function githubRemote(dir: string, git = "git"): Promise<GithubRemote | null> {
  let stdout: string;
  try {
    const r = await runGit(git, dir, ["remote", "-v"]);
    if (r.code !== 0) return null;
    stdout = r.stdout;
  } catch {
    return null;
  }
  const found: GithubRemote[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const [, name, url] = /^([\w.-]+)\s+(.+?)\s+\(fetch\)$/.exec(line.trim()) ?? [];
    const repo = url ? githubRepoOf(url) : null;
    if (name && repo && !name.startsWith("-")) found.push({ name, repo });
  }
  return found.find((r) => r.name === "origin") ?? found[0] ?? null;
}

const hasGithubRemote = async (dir: string, git: string) => (await githubRemote(dir, git)) !== null;

const hasWorkflows = async (dir: string) => {
  try {
    return (await readdir(join(dir, ".github", "workflows"))).some((name) => /\.ya?ml$/i.test(name));
  } catch {
    return false;
  }
};

/** Whether `gh` says the repo in `dir` is public; null when it couldn't say. */
export async function repoIsPublic(dir: string, gh = "gh", timeoutMs = 15_000): Promise<boolean | null> {
  const answer = await ghJson(dir, ["repo", "view", "--json", "visibility"], { gh, timeoutMs });
  const visibility = isRecord(answer) ? answer.visibility : undefined;
  return typeof visibility === "string" ? visibility.toUpperCase() === "PUBLIC" : null;
}

export async function detectGithub(
  dir: string,
  { gitCommand = "git", ghCommand, ghTimeoutMs }: GithubDeps = {},
): Promise<GithubDetection> {
  const [remote, workflows] = await Promise.all([hasGithubRemote(dir, gitCommand), hasWorkflows(dir)]);
  return { remote, workflows, public: remote ? await repoIsPublic(dir, ghCommand, ghTimeoutMs) : null };
}

/**
 * Whether GitHub is usable for the project in `dir` (STORY-11): a GitHub remote and a `gh` that runs and is signed in
 * to github.com. What `gh auth status` prints is never kept; only its exit code is read.
 */
export async function detectGithubUse(
  dir: string,
  { gitCommand = "git", ghCommand, ghTimeoutMs }: GithubDeps = {},
): Promise<GithubUse> {
  const options = { gh: ghCommand, timeoutMs: ghTimeoutMs };
  const remote = await hasGithubRemote(dir, gitCommand);
  if (!remote) return githubUse({ remote, gh: false, signedIn: false });
  const version = await runGh(dir, ["--version"], options);
  const gh = version !== null && version.code === 0;
  const auth = gh ? await runGh(dir, ["auth", "status", "--hostname", "github.com"], options) : null;
  return githubUse({ remote, gh, signedIn: auth !== null && auth.code === 0 });
}
